// controllers/reportsController.js — analytics for ONE business (its own database)
const { Op, QueryTypes, literal } = require("sequelize");
const { asyncHandler, round2, round3, int, paging, str } = require("../utils/helpers");
const { getShopSettings } = require("../utils/settings");
const { todayRange, monthRange, rangeFromStrings, offsetString, localDateString } = require("../utils/dates");

const ACTIVE = "b.status <> 'cancelled'";
// Net (after returns) share of a bill line
const NET_QTY = "(bi.quantity - bi.returned_qty)";
const NET_AMT = "(CASE WHEN bi.quantity > 0 THEN bi.total_price * (bi.quantity - bi.returned_qty) / bi.quantity ELSE 0 END)";
const NET_TAX = "(CASE WHEN bi.quantity > 0 THEN bi.tax_amount * (bi.quantity - bi.returned_qty) / bi.quantity ELSE 0 END)";
const NET_TAXABLE = "(CASE WHEN bi.quantity > 0 THEN bi.taxable_amount * (bi.quantity - bi.returned_qty) / bi.quantity ELSE 0 END)";
const NET_COST = "(bi.cost_price * (bi.quantity - bi.returned_qty))";

// Resolve ?startDate&endDate (YYYY-MM-DD, shop-local) → UTC range. Defaults to this month.
const resolveRange = (q, settings) => {
  const off = settings.timezoneOffsetMinutes;
  if (q.startDate || q.endDate) {
    const { start, end } = rangeFromStrings(q.startDate || q.endDate, q.endDate || q.startDate, off);
    return { start, end, from: q.startDate || q.endDate, to: q.endDate || q.startDate };
  }
  const m = monthRange(off);
  return { ...m, from: localDateString(m.start, off), to: localDateString(m.end, off) };
};

const sql = (req, query, replacements) => req.tenant.sequelize.query(query, { replacements, type: QueryTypes.SELECT });

const billTotals = async (req, start, end) => {
  // Revenue is net of returns, so the tax figure has to be net of returns too — summing
  // the full bill.tax_amount next to a net revenue made the two columns disagree and the
  // GST tab and the sales tab report different output tax for the same period.
  const [row] = await sql(
    req,
    `SELECT COUNT(*) AS bills,
            COALESCE(SUM(b.total_amount - b.returned_amount),0) AS revenue,
            COALESCE(SUM(b.item_discount + b.discount_amount + b.loyalty_discount),0) AS discount,
            COALESCE(SUM(b.due_amount),0) AS due,
            COALESCE(SUM(b.returned_amount),0) AS returns
       FROM bills b WHERE ${ACTIVE} AND b.createdAt BETWEEN :start AND :end`,
    { start, end },
  );
  const [taxRow] = await sql(
    req,
    `SELECT COALESCE(SUM(${NET_TAX}),0) AS tax
       FROM bill_items bi JOIN bills b ON b.id = bi.bill_id
      WHERE ${ACTIVE} AND b.createdAt BETWEEN :start AND :end`,
    { start, end },
  );
  row.tax = taxRow ? taxRow.tax : 0;
  return {
    bills: Number(row.bills) || 0,
    revenue: round2(row.revenue),
    tax: round2(row.tax),
    discount: round2(row.discount),
    due: round2(row.due),
    returns: round2(row.returns),
  };
};

const profitBetween = async (req, start, end) => {
  const [row] = await sql(
    req,
    `SELECT COALESCE(SUM(${NET_AMT}),0) AS revenue, COALESCE(SUM(${NET_TAX}),0) AS tax, COALESCE(SUM(${NET_COST}),0) AS cost
       FROM bill_items bi JOIN bills b ON b.id = bi.bill_id
      WHERE ${ACTIVE} AND b.createdAt BETWEEN :start AND :end`,
    { start, end },
  );
  const revenue = round2(row.revenue);
  const tax = round2(row.tax);
  const cost = round2(row.cost);
  return { revenue, tax, cost, grossProfit: round2(revenue - tax - cost) };
};

// Split payments JSON → totals per method (sales only, not later due collections)
const billPayments = (bill, includeSettlements = false) => {
  const list = Array.isArray(bill.payments) && bill.payments.length
    ? bill.payments
    : [{ method: bill.paymentMethod, amount: Number(bill.totalAmount) }];
  return list.filter((payment) => includeSettlements || !payment.settlement);
};

const paymentBreakdown = async (req, start, end, includeCancelled = false) => {
  const where = { createdAt: { [Op.between]: [start, end] } };
  if (!includeCancelled) where.status = { [Op.ne]: "cancelled" };
  const bills = await req.db.Bill.findAll({
    where,
    attributes: ["id", "payments", "paymentMethod", "totalAmount"],
  });
  const totals = {};
  bills.forEach((b) => {
    billPayments(b).forEach((p) => {
      totals[p.method] = round2((totals[p.method] || 0) + (Number(p.amount) || 0));
    });
  });
  return Object.entries(totals)
    .map(([method, amount]) => ({ method, amount }))
    .sort((a, b) => b.amount - a.amount);
};

// ── GET /api/reports/dashboard ───────────────────────────────────────────────
const getDashboard = asyncHandler(async (req, res) => {
  const db = req.db;
  const settings = await getShopSettings(db);
  const off = settings.timezoneOffsetMinutes;
  const tz = offsetString(off);
  const today = todayRange(off);
  const yesterday = todayRange(off, new Date(today.start.getTime() - 3600000));
  const month = monthRange(off);
  const todayStr = localDateString(new Date(), off);
  const expiryLimit = localDateString(new Date(Date.now() + settings.expiryAlertDays * 86400000), off);

  const [todayT, yesterdayT, monthT, allT, todayProfit, monthProfit] = await Promise.all([
    billTotals(req, today.start, today.end),
    billTotals(req, yesterday.start, yesterday.end),
    billTotals(req, month.start, month.end),
    billTotals(req, new Date(0), new Date(Date.now() + 86400000)),
    profitBetween(req, today.start, today.end),
    profitBetween(req, month.start, month.end),
  ]);

  const sevenStart = new Date(today.start.getTime() - 6 * 86400000);
  const daily = await sql(
    req,
    `SELECT DATE_FORMAT(CONVERT_TZ(b.createdAt,'+00:00',:tz),'%Y-%m-%d') AS d, COUNT(*) AS c,
            COALESCE(SUM(b.total_amount - b.returned_amount),0) AS r
       FROM bills b WHERE ${ACTIVE} AND b.createdAt BETWEEN :start AND :end GROUP BY d`,
    { tz, start: sevenStart, end: today.end },
  );
  const dailyMap = new Map(daily.map((r) => [r.d, r]));
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const date = localDateString(new Date(today.start.getTime() + 12 * 3600000 - i * 86400000), off);
    const r = dailyMap.get(date);
    last7Days.push({ date, count: r ? Number(r.c) : 0, revenue: r ? round2(r.r) : 0 });
  }

  const [lowStock, expiring, recentBills, totalProducts, receivable, payable, monthExpenses, todayPayments, topToday, stockCounts] = await Promise.all([
    db.Product.findAll({
      where: { isActive: true, [Op.and]: [literal("`Product`.`quantity` <= `Product`.`reorder_level`")] },
      order: [["quantity", "ASC"]],
      limit: 10,
    }),
    settings.trackExpiry
      ? db.Product.findAll({
          where: { isActive: true, quantity: { [Op.gt]: 0 }, expiryDate: { [Op.ne]: null, [Op.lte]: expiryLimit } },
          order: [["expiryDate", "ASC"]],
          limit: 10,
        })
      : [],
    db.Bill.findAll({ order: [["createdAt", "DESC"]], limit: 8, include: [{ model: db.BillItem, as: "items", attributes: ["id"] }] }),
    db.Product.count({ where: { isActive: true } }),
    db.Customer.sum("balance", { where: { balance: { [Op.gt]: 0 } } }),
    db.Supplier.sum("balance", { where: { balance: { [Op.gt]: 0 } } }),
    db.Expense.sum("amount", { where: { expenseDate: { [Op.between]: [localDateString(month.start, off), localDateString(month.end, off)] } } }),
    paymentBreakdown(req, today.start, today.end),
    sql(
      req,
      `SELECT bi.product_name AS name, SUM(${NET_QTY}) AS qty, SUM(${NET_AMT}) AS amount
         FROM bill_items bi JOIN bills b ON b.id = bi.bill_id
        WHERE ${ACTIVE} AND b.createdAt BETWEEN :start AND :end
        GROUP BY bi.product_id, bi.product_name ORDER BY amount DESC LIMIT 5`,
      { start: today.start, end: today.end },
    ),
    // The lowStock/expiring lists above are capped at 10 rows for display, so the real
    // counts have to be queried separately — otherwise the dashboard can never show
    // more than "10 low" however bad the shelves actually are.
    sql(
      req,
      `SELECT
         COALESCE(SUM(CASE WHEN quantity > 0 AND quantity <= reorder_level THEN 1 ELSE 0 END),0) AS lowCount,
         COALESCE(SUM(CASE WHEN quantity <= 0 THEN 1 ELSE 0 END),0) AS outCount,
         COALESCE(SUM(CASE WHEN expiry_date IS NOT NULL AND expiry_date <= :expiryLimit AND quantity > 0 THEN 1 ELSE 0 END),0) AS expiringCount,
         COALESCE(SUM(GREATEST(quantity,0) * cost_price),0) AS stockValue
       FROM products WHERE is_active = 1`,
      { expiryLimit },
    ),
  ]);
  const counts = stockCounts[0] || {};

  const cashier = req.user.role === "cashier" && !req.isSuperAdmin;
  const hide = (v) => (cashier ? null : v);
  res.json({
    success: true,
    data: {
      canSeeProfit: !cashier,
      today: { ...todayT, profit: hide(todayProfit.grossProfit), avgBill: todayT.bills ? round2(todayT.revenue / todayT.bills) : 0 },
      yesterday: yesterdayT,
      month: {
        ...monthT,
        profit: hide(monthProfit.grossProfit),
        expenses: hide(round2(monthExpenses)),
        netProfit: hide(round2(monthProfit.grossProfit - (Number(monthExpenses) || 0))),
      },
      allTime: allT,
      last7Days,
      lowStock,
      expiring,
      counts: {
        lowStock: Number(counts.lowCount) || 0,
        outOfStock: Number(counts.outCount) || 0,
        expiring: Number(counts.expiringCount) || 0,
        stockValue: hide(round2(counts.stockValue)),
      },
      todayDate: todayStr,
      recentBills,
      totalProducts,
      receivable: round2(receivable),
      payable: hide(round2(payable)),
      todayPayments,
      topToday: topToday.map((r) => ({ name: r.name, qty: round3(r.qty), amount: round2(r.amount) })),
    },
  });
});

// ── GET /api/reports/sales ───────────────────────────────────────────────────
const getSalesReport = asyncHandler(async (req, res) => {
  const settings = await getShopSettings(req.db);
  const tz = offsetString(settings.timezoneOffsetMinutes);
  const { start, end, from, to } = resolveRange(req.query, settings);

  const [totals, profit, payments, daily, hourly, items, collections] = await Promise.all([
    billTotals(req, start, end),
    profitBetween(req, start, end),
    paymentBreakdown(req, start, end),
    sql(
      req,
      `SELECT DATE_FORMAT(CONVERT_TZ(b.createdAt,'+00:00',:tz),'%Y-%m-%d') AS date, COUNT(*) AS bills,
              COALESCE(SUM(b.total_amount - b.returned_amount),0) AS revenue, COALESCE(SUM(b.tax_amount),0) AS tax,
              COALESCE(SUM(b.item_discount + b.discount_amount + b.loyalty_discount),0) AS discount
         FROM bills b WHERE ${ACTIVE} AND b.createdAt BETWEEN :start AND :end GROUP BY date ORDER BY date`,
      { tz, start, end },
    ),
    sql(
      req,
      `SELECT HOUR(CONVERT_TZ(b.createdAt,'+00:00',:tz)) AS hour, COUNT(*) AS bills, COALESCE(SUM(b.total_amount - b.returned_amount),0) AS revenue
         FROM bills b WHERE ${ACTIVE} AND b.createdAt BETWEEN :start AND :end GROUP BY hour ORDER BY hour`,
      { tz, start, end },
    ),
    sql(
      req,
      `SELECT COALESCE(SUM(${NET_QTY}),0) AS qty FROM bill_items bi JOIN bills b ON b.id = bi.bill_id
        WHERE ${ACTIVE} AND b.createdAt BETWEEN :start AND :end`,
      { start, end },
    ),
    req.db.CustomerPayment.sum("amount", { where: { createdAt: { [Op.between]: [start, end] } } }),
  ]);

  res.json({
    success: true,
    data: {
      range: { from, to },
      summary: {
        totalBills: totals.bills,
        totalRevenue: totals.revenue,
        totalItems: round3(items[0]?.qty),
        averageBillValue: totals.bills ? round2(totals.revenue / totals.bills) : 0,
        totalTax: totals.tax,
        totalDiscount: totals.discount,
        totalDue: totals.due,
        totalReturns: totals.returns,
        grossProfit: profit.grossProfit,
        costOfGoods: profit.cost,
        duesCollected: round2(collections),
      },
      payments,
      daily: daily.map((d) => ({ date: d.date, bills: Number(d.bills), revenue: round2(d.revenue), tax: round2(d.tax), discount: round2(d.discount) })),
      hourly: hourly.map((h) => ({ hour: Number(h.hour), bills: Number(h.bills), revenue: round2(h.revenue) })),
    },
  });
});

// ── GET /api/reports/top-products ────────────────────────────────────────────
const getTopProducts = asyncHandler(async (req, res) => {
  const settings = await getShopSettings(req.db);
  const { start, end } = resolveRange(req.query, settings);
  const limit = Math.min(200, Math.max(1, int(req.query.limit, 10)));
  const order = req.query.sort === "qty" ? "totalSold" : req.query.sort === "profit" ? "profit" : "totalRevenue";
  const rows = await sql(
    req,
    `SELECT bi.product_id AS productId, bi.product_name AS productName,
            SUM(${NET_QTY}) AS totalSold, SUM(${NET_AMT}) AS totalRevenue,
            SUM(${NET_AMT} - ${NET_TAX} - ${NET_COST}) AS profit, COUNT(DISTINCT b.id) AS orderCount
       FROM bill_items bi JOIN bills b ON b.id = bi.bill_id
      WHERE ${ACTIVE} AND b.createdAt BETWEEN :start AND :end
      GROUP BY bi.product_id, bi.product_name ORDER BY ${order} DESC LIMIT ${limit}`,
    { start, end },
  );
  res.json({
    success: true,
    data: {
      topProducts: rows.map((r) => ({
        productId: r.productId,
        productName: r.productName,
        totalSold: round3(r.totalSold),
        totalRevenue: round2(r.totalRevenue),
        profit: round2(r.profit),
        orderCount: Number(r.orderCount),
      })),
    },
  });
});

// ── GET /api/reports/categories ──────────────────────────────────────────────
const getCategorySales = asyncHandler(async (req, res) => {
  const settings = await getShopSettings(req.db);
  const { start, end } = resolveRange(req.query, settings);
  const rows = await sql(
    req,
    `SELECT COALESCE(p.category,'Uncategorised') AS category, SUM(${NET_QTY}) AS qty, SUM(${NET_AMT}) AS revenue,
            SUM(${NET_AMT} - ${NET_TAX} - ${NET_COST}) AS profit
       FROM bill_items bi JOIN bills b ON b.id = bi.bill_id LEFT JOIN products p ON p.id = bi.product_id
      WHERE ${ACTIVE} AND b.createdAt BETWEEN :start AND :end
      GROUP BY category ORDER BY revenue DESC`,
    { start, end },
  );
  res.json({ success: true, data: { categories: rows.map((r) => ({ category: r.category, qty: round3(r.qty), revenue: round2(r.revenue), profit: round2(r.profit) })) } });
});

// ── GET /api/reports/gst ─────────────────────────────────────────────────────
const getGstReport = asyncHandler(async (req, res) => {
  const settings = await getShopSettings(req.db);
  const { start, end, from, to } = resolveRange(req.query, settings);
  const [slabs, hsn] = await Promise.all([
    sql(
      req,
      `SELECT bi.tax_rate AS rate, b.inter_state AS interState,
              SUM(${NET_TAXABLE}) AS taxable, SUM(${NET_TAX}) AS tax, SUM(${NET_AMT}) AS total
         FROM bill_items bi JOIN bills b ON b.id = bi.bill_id
        WHERE ${ACTIVE} AND b.createdAt BETWEEN :start AND :end
        GROUP BY bi.tax_rate, b.inter_state ORDER BY bi.tax_rate`,
      { start, end },
    ),
    sql(
      req,
      `SELECT COALESCE(bi.hsn_code,'-') AS hsn, bi.tax_rate AS rate, SUM(${NET_QTY}) AS qty, SUM(${NET_TAXABLE}) AS taxable, SUM(${NET_TAX}) AS tax
         FROM bill_items bi JOIN bills b ON b.id = bi.bill_id
        WHERE ${ACTIVE} AND b.createdAt BETWEEN :start AND :end GROUP BY hsn, bi.tax_rate ORDER BY hsn`,
      { start, end },
    ),
  ]);
  const purchaseTax = await req.db.Purchase.sum("taxAmount", { where: { status: "completed", purchaseDate: { [Op.between]: [from, to] } } });
  // Intra-state rows split the tax into CGST + SGST; inter-state rows are all IGST.
  const rows = slabs.map((s) => {
    const tax = round2(s.tax);
    const inter = !!Number(s.interState);
    const half = inter ? 0 : round2(tax / 2);
    return {
      rate: Number(s.rate),
      interState: inter,
      taxable: round2(s.taxable),
      cgst: half,
      sgst: inter ? 0 : round2(tax - half),
      igst: inter ? tax : 0,
      tax,
      total: round2(s.total),
    };
  });
  const totalTax = round2(rows.reduce((a, r) => a + r.tax, 0));
  res.json({
    success: true,
    data: {
      range: { from, to },
      gstNumber: settings.gstNumber,
      state: settings.state || null,
      slabs: rows,
      hsn: hsn.map((h) => ({ hsn: h.hsn, rate: Number(h.rate), qty: round3(h.qty), taxable: round2(h.taxable), tax: round2(h.tax) })),
      totals: {
        taxable: round2(rows.reduce((a, r) => a + r.taxable, 0)),
        cgst: round2(rows.reduce((a, r) => a + r.cgst, 0)),
        sgst: round2(rows.reduce((a, r) => a + r.sgst, 0)),
        igst: round2(rows.reduce((a, r) => a + r.igst, 0)),
        outputTax: totalTax,
        inputTax: round2(purchaseTax),
        netPayable: round2(totalTax - (Number(purchaseTax) || 0)),
      },
    },
  });
});

// ── GET /api/reports/profit ──────────────────────────────────────────────────
const getProfitReport = asyncHandler(async (req, res) => {
  const settings = await getShopSettings(req.db);
  const tz = offsetString(settings.timezoneOffsetMinutes);
  const { start, end, from, to } = resolveRange(req.query, settings);
  const [profit, daily, expenses] = await Promise.all([
    profitBetween(req, start, end),
    sql(
      req,
      `SELECT DATE_FORMAT(CONVERT_TZ(b.createdAt,'+00:00',:tz),'%Y-%m-%d') AS date, SUM(${NET_AMT}) AS revenue,
              SUM(${NET_TAX}) AS tax, SUM(${NET_COST}) AS cost
         FROM bill_items bi JOIN bills b ON b.id = bi.bill_id
        WHERE ${ACTIVE} AND b.createdAt BETWEEN :start AND :end GROUP BY date ORDER BY date`,
      { tz, start, end },
    ),
    req.db.Expense.findAll({
      where: { expenseDate: { [Op.between]: [from, to] } },
      attributes: ["category", [req.tenant.sequelize.fn("SUM", req.tenant.sequelize.col("amount")), "total"]],
      group: ["category"],
      raw: true,
    }),
  ]);
  const totalExpenses = round2(expenses.reduce((a, e) => a + Number(e.total), 0));
  res.json({
    success: true,
    data: {
      range: { from, to },
      summary: { ...profit, expenses: totalExpenses, netProfit: round2(profit.grossProfit - totalExpenses), margin: profit.revenue ? round2((profit.grossProfit / (profit.revenue - profit.tax || 1)) * 100) : 0 },
      daily: daily.map((d) => {
        const revenue = round2(d.revenue);
        const tax = round2(d.tax);
        const cost = round2(d.cost);
        return { date: d.date, revenue, tax, cost, profit: round2(revenue - tax - cost) };
      }),
      expenses: expenses.map((e) => ({ category: e.category, total: round2(e.total) })),
    },
  });
});

// ── GET /api/reports/staff ───────────────────────────────────────────────────
const getStaffReport = asyncHandler(async (req, res) => {
  const settings = await getShopSettings(req.db);
  const { start, end } = resolveRange(req.query, settings);
  const rows = await sql(
    req,
    `SELECT COALESCE(b.cashier_name,'-') AS cashier, COUNT(*) AS bills, COALESCE(SUM(b.total_amount - b.returned_amount),0) AS revenue,
            COALESCE(SUM(b.item_discount + b.discount_amount),0) AS discount
       FROM bills b WHERE ${ACTIVE} AND b.createdAt BETWEEN :start AND :end GROUP BY cashier ORDER BY revenue DESC`,
    { start, end },
  );
  const cancelled = await sql(
    req,
    `SELECT COALESCE(b.cashier_name,'-') AS cashier, COUNT(*) AS c FROM bills b
      WHERE b.status = 'cancelled' AND b.createdAt BETWEEN :start AND :end GROUP BY cashier`,
    { start, end },
  );
  const cMap = new Map(cancelled.map((c) => [c.cashier, Number(c.c)]));
  res.json({
    success: true,
    data: { staff: rows.map((r) => ({ cashier: r.cashier, bills: Number(r.bills), revenue: round2(r.revenue), discount: round2(r.discount), cancelled: cMap.get(r.cashier) || 0 })) },
  });
});

// ── GET /api/reports/day-end?date=YYYY-MM-DD — cash register closing ────────
const getDayEnd = asyncHandler(async (req, res) => {
  const db = req.db;
  const settings = await getShopSettings(db);
  const off = settings.timezoneOffsetMinutes;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "") ? req.query.date : localDateString(new Date(), off);
  const { start, end } = rangeFromStrings(date, date, off);

  const [totals, payments, collections, expenses, refunds, supplierPaid, cancelledBills] = await Promise.all([
    billTotals(req, start, end),
    paymentBreakdown(req, start, end, true),
    db.CustomerPayment.findAll({ where: { createdAt: { [Op.between]: [start, end] } }, attributes: ["method", "amount"], raw: true }),
    db.Expense.findAll({ where: { expenseDate: date }, attributes: ["paymentMethod", "amount", "category"], raw: true }),
    db.SaleReturn.findAll({ where: { createdAt: { [Op.between]: [start, end] } }, attributes: ["refundMethod", "totalAmount"], raw: true }),
    db.SupplierPayment.findAll({ where: { createdAt: { [Op.between]: [start, end] } }, attributes: ["method", "amount"], raw: true }),
    // Cancelling a bill is its final write, so updatedAt records the day the tender was reversed.
    db.Bill.findAll({
      where: { status: "cancelled", updatedAt: { [Op.between]: [start, end] } },
      attributes: ["payments", "paymentMethod", "totalAmount"],
    }),
  ]);
  const sumBy = (rows, key, amountKey, match) => round2(rows.filter((r) => r[key] === match).reduce((a, r) => a + Number(r[amountKey]), 0));
  const cashSales = payments.find((p) => p.method === "cash")?.amount || 0;
  const cancelledPayments = {};
  cancelledBills.forEach((bill) => {
    billPayments(bill, true)
      .filter((payment) => payment.method !== "credit")
      .forEach((payment) => {
        cancelledPayments[payment.method] = round2((cancelledPayments[payment.method] || 0) + (Number(payment.amount) || 0));
      });
  });
  const cancellationRefunds = Object.entries(cancelledPayments)
    .map(([method, amount]) => ({ method, amount }))
    .sort((a, b) => b.amount - a.amount);
  const cashCancellations = cancelledPayments.cash || 0;
  const cashCollected = sumBy(collections, "method", "amount", "cash");
  const cashExpenses = sumBy(expenses, "paymentMethod", "amount", "cash");
  const cashRefunds = sumBy(refunds, "refundMethod", "totalAmount", "cash");
  const cashToSuppliers = sumBy(supplierPaid, "method", "amount", "cash");

  res.json({
    success: true,
    data: {
      date,
      sales: totals,
      cancelledBills: cancelledBills.length,
      cancellationRefunds,
      payments,
      collections: round2(collections.reduce((a, c) => a + Number(c.amount), 0)),
      expenses: round2(expenses.reduce((a, e) => a + Number(e.amount), 0)),
      refunds: round2(refunds.reduce((a, r) => a + Number(r.totalAmount), 0)),
      supplierPayments: round2(supplierPaid.reduce((a, s) => a + Number(s.amount), 0)),
      cash: {
        sales: round2(cashSales),
        collected: cashCollected,
        expenses: cashExpenses,
        refunds: cashRefunds,
        cancellations: cashCancellations,
        suppliers: cashToSuppliers,
        expectedInDrawer: round2(cashSales + cashCollected - cashExpenses - cashRefunds - cashCancellations - cashToSuppliers),
      },
    },
  });
});

// ── GET /api/reports/stock — opening / sold / current for a period ──────────
const getStockReport = asyncHandler(async (req, res) => {
  const settings = await getShopSettings(req.db);
  const { start, end } = resolveRange(req.query, settings);
  const rows = await sql(
    req,
    `SELECT p.id, p.name, p.barcode, p.category, p.unit, p.price, p.cost_price AS costPrice, p.quantity AS currentStock,
            COALESCE((SELECT SUM(CASE WHEN m.quantity < 0 AND m.type = 'sale' THEN -m.quantity ELSE 0 END)
                        FROM stock_movements m WHERE m.product_id = p.id AND m.createdAt BETWEEN :start AND :end),0) AS soldQty,
            COALESCE((SELECT SUM(CASE WHEN m.type = 'sale_cancel' OR m.type = 'return' THEN m.quantity ELSE 0 END)
                        FROM stock_movements m WHERE m.product_id = p.id AND m.createdAt BETWEEN :start AND :end),0) AS returnedQty,
            COALESCE((SELECT SUM(CASE WHEN m.type IN ('purchase','opening','import','scan') THEN m.quantity
                                      WHEN m.type = 'purchase_cancel' THEN m.quantity ELSE 0 END)
                        FROM stock_movements m WHERE m.product_id = p.id AND m.createdAt BETWEEN :start AND :end),0) AS inwardQty,
            COALESCE((SELECT SUM(m.quantity) FROM stock_movements m WHERE m.product_id = p.id AND m.createdAt > :end),0) AS afterQty,
            COALESCE((SELECT SUM(CASE WHEN m.type = 'adjustment' THEN m.quantity ELSE 0 END)
                        FROM stock_movements m WHERE m.product_id = p.id AND m.createdAt BETWEEN :start AND :end),0) AS adjustQty
       FROM products p WHERE p.is_active = 1 AND p.createdAt <= :end ORDER BY p.name ASC`,
    { start, end },
  );
  // Only products that were part of this period belong in the report. The query already
  // drops anything created after it; a product that existed but held no stock and saw no
  // movement is dropped here too, instead of printing a row of zeros.
  const data = [];
  for (const r of rows) {
    const closing = round3(Number(r.currentStock) - Number(r.afterQty));
    const sold = round3(r.soldQty);
    const returned = round3(r.returnedQty);
    const inward = round3(r.inwardQty);
    const adjust = round3(r.adjustQty);
    const opening = round3(closing - inward + sold - returned - adjust);
    if (!opening && !closing && !inward && !sold && !returned && !adjust) continue;
    data.push({
      id: r.id,
      name: r.name,
      barcode: r.barcode,
      category: r.category,
      unit: r.unit,
      price: round2(r.price),
      costPrice: round2(r.costPrice),
      openingStock: opening,
      inward,
      soldQty: round3(sold - returned),
      adjustment: adjust,
      closingStock: closing,
      currentStock: round3(r.currentStock),
      stockValue: round2(Math.max(0, closing) * Number(r.costPrice)),
    });
  }
  res.json({ success: true, data });
});

// ── GET /api/reports/expiry?days=30 ──────────────────────────────────────────
const getExpiryReport = asyncHandler(async (req, res) => {
  const settings = await getShopSettings(req.db);
  const days = Math.min(365, Math.max(1, int(req.query.days, settings.expiryAlertDays)));
  const off = settings.timezoneOffsetMinutes;
  const today = localDateString(new Date(), off);
  const limitDay = localDateString(new Date(Date.now() + days * 86400000), off);
  const products = await req.db.Product.findAll({
    where: { isActive: true, expiryDate: { [Op.ne]: null, [Op.lte]: limitDay } },
    order: [["expiryDate", "ASC"]],
  });
  res.json({
    success: true,
    data: {
      today,
      days,
      expired: products.filter((p) => p.expiryDate < today),
      expiring: products.filter((p) => p.expiryDate >= today),
      valueAtRisk: round2(products.reduce((a, p) => a + Math.max(0, Number(p.quantity)) * Number(p.costPrice), 0)),
    },
  });
});

// ── GET /api/reports/audit-logs ──────────────────────────────────────────────
const getAuditLogs = asyncHandler(async (req, res) => {
  const db = req.db;
  const settings = await getShopSettings(db);
  const { page, limit, offset } = paging(req.query, 25, 200);
  const { action, entityType, search, startDate, endDate } = req.query;

  const where = {};
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;

  if (startDate || endDate) {
    const { start, end } = rangeFromStrings(startDate, endDate, settings.timezoneOffsetMinutes);
    where.createdAt = {};
    if (start) where.createdAt[Op.gte] = start;
    if (end) where.createdAt[Op.lte] = end;
  }

  if (search) {
    const q = `%${String(search).trim()}%`;
    where[Op.or] = [
      { username: { [Op.like]: q } },
      { entityId: { [Op.like]: q } },
      { action: { [Op.like]: q } },
    ];
  }

  const { count, rows } = await db.AuditLog.findAndCountAll({
    where,
    order: [["createdAt", "DESC"], ["id", "DESC"]],
    limit,
    offset,
  });

  res.json({
    success: true,
    data: {
      logs: rows,
      total: count,
      page,
      pages: Math.max(1, Math.ceil(count / limit)),
    },
  });
});

module.exports = {
  getDashboard,
  getSalesReport,
  getTopProducts,
  getCategorySales,
  getGstReport,
  getProfitReport,
  getStaffReport,
  getDayEnd,
  getStockReport,
  getExpiryReport,
  getAuditLogs,
};
