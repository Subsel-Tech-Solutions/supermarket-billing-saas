// controllers/billingController.js — POS sales, returns, cancellations, held bills
const { Op } = require("sequelize");
const { asyncHandler, HttpError, num, str, round2, round3, pad, paging, normalizePhone, isValidPhone } = require("../utils/helpers");
const { calculateBill, settlePayments } = require("../utils/billMath");
const { getShopSettings, nextSequence } = require("../utils/settings");
const { rangeFromStrings } = require("../utils/dates");
const { moveStock } = require("../utils/stock");

const fullBillInclude = (db) => [
  { model: db.BillItem, as: "items" },
  { model: db.SaleReturn, as: "returns", include: [{ model: db.SaleReturnItem, as: "items" }] },
];

// ── POST /api/bills ───────────────────────────────────────────────────────────
const createBill = asyncHandler(async (req, res) => {
  const db = req.db;
  const body = req.body || {};
  const settings = await getShopSettings(db);
  const isCashier = req.user.role === "cashier" && !req.isSuperAdmin;

  // ── Idempotency ────────────────────────────────────────────────────────────
  // The till sends one clientRef per checkout attempt. If the same ref comes back —
  // double click, lost response, offline retry — return the bill that already exists
  // rather than selling the stock twice.
  const clientRef = str(body.clientRef, 64);
  if (clientRef) {
    const existing = await db.Bill.findOne({ where: { clientRef } });
    if (existing) {
      const full = await db.Bill.findByPk(existing.id, { include: fullBillInclude(db) });
      return res.status(200).json({ success: true, message: "Bill already saved", data: { bill: full }, duplicate: true });
    }
  }

  // merge duplicate product lines
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length) throw new HttpError(400, "Bill must have at least one item");
  const merged = new Map();
  rawItems.forEach((it) => {
    const id = parseInt(it.productId, 10);
    const q = round3(num(it.quantity));
    if (!id || !(q > 0)) throw new HttpError(400, "Each item needs a product and a quantity above zero");
    const prev = merged.get(id);
    merged.set(id, { productId: id, quantity: round3((prev?.quantity || 0) + q), discount: round2((prev?.discount || 0) + num(it.discount)) });
  });

  const anyItemDiscount = [...merged.values()].some((i) => i.discount > 0);
  const discountPercent = Math.max(0, num(body.discountPercent));
  if (isCashier && !settings.cashierCanDiscount && (anyItemDiscount || num(body.discountAmount) > 0 || discountPercent > 0)) {
    throw new HttpError(403, "Cashiers are not allowed to give discounts");
  }

  const t = await req.tenant.sequelize.transaction();
  try {
    // 1) Lock products & validate stock
    const products = [];
    for (const item of merged.values()) {
      const product = await db.Product.findByPk(item.productId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!product || !product.isActive) throw new HttpError(404, `Product #${item.productId} not found`);
      if (!product.allowDecimal && !Number.isInteger(item.quantity)) {
        throw new HttpError(400, `"${product.name}" is sold in whole ${product.unit || "units"} only`);
      }
      if (!settings.allowNegativeStock && Number(product.quantity) < item.quantity) {
        throw new HttpError(400, `Insufficient stock for "${product.name}". Available: ${Number(product.quantity)}`);
      }
      products.push({ product, item });
    }

    // 2) Customer (by id or phone — created automatically when a phone is given)
    let customer = null;
    let phone = null;
    if (body.customerPhone) {
      phone = normalizePhone(body.customerPhone);
      if (!isValidPhone(body.customerPhone)) {
        throw new HttpError(400, "Enter a valid 10-digit mobile number for the customer");
      }
    }
    if (body.customerId) {
      customer = await db.Customer.findByPk(body.customerId, { transaction: t, lock: t.LOCK.UPDATE });
      // A stale customer id (deleted on another till) must not silently become a walk-in
      // sale — the loyalty points and the due would be posted nowhere.
      if (!customer) throw new HttpError(404, "Selected customer no longer exists — search again");
    }
    if (!customer && phone) {
      customer = await db.Customer.findOne({ where: { phone }, transaction: t, lock: t.LOCK.UPDATE });
      if (!customer) {
        customer = await db.Customer.create({ name: str(body.customerName, 120) || "Customer", phone }, { transaction: t });
      }
    }
    if (customer && str(body.customerName, 120) && (!customer.name || customer.name === "Customer")) {
      customer.name = str(body.customerName, 120);
    }

    // 3) Discounts
    const lines = products.map(({ product, item }) => ({
      product,
      price: Number(product.price),
      quantity: item.quantity,
      discount: item.discount,
      taxRate: Number(product.taxRate) || 0,
    }));
    const preview = calculateBill(lines, { pricesIncludeTax: settings.pricesIncludeTax, taxEnabled: settings.taxEnabled, roundOff: false });
    const netAfterItems = round2(preview.subtotal - preview.itemDiscount);
    let billDiscount = round2(num(body.discountAmount));
    if (discountPercent > 0) billDiscount = round2(billDiscount + (netAfterItems * Math.min(100, discountPercent)) / 100);
    const maxDisc = round2((netAfterItems * (settings.maxBillDiscountPercent ?? 100)) / 100);
    if (billDiscount > maxDisc + 0.001) throw new HttpError(400, `Maximum allowed discount is ${settings.maxBillDiscountPercent}%`);

    // 4) Loyalty redemption
    let redeemPoints = Math.floor(Math.max(0, num(body.redeemPoints)));
    let loyaltyDiscount = 0;
    if (redeemPoints > 0) {
      if (!settings.loyaltyEnabled) throw new HttpError(400, "Loyalty points are disabled");
      if (!customer) throw new HttpError(400, "Select a customer to redeem points");
      if (redeemPoints > Number(customer.loyaltyPoints)) throw new HttpError(400, `Customer has only ${Number(customer.loyaltyPoints)} points`);
      if (redeemPoints < settings.loyaltyMinRedeem) throw new HttpError(400, `Minimum ${settings.loyaltyMinRedeem} points required to redeem`);
      loyaltyDiscount = round2(redeemPoints * num(settings.loyaltyPointValue, 1));
    }

    // ── Place of supply (GST) ────────────────────────────────────────────────
    // Over-the-counter retail is intra-state, so CGST+SGST is the default. A bill
    // raised against a GSTIN from another state is inter-state and carries IGST.
    const customerGst = str(body.customerGstNumber, 20) || (customer ? customer.gstNumber : null);
    const placeOfSupply = str(body.placeOfSupply, 60) || settings.state || null;
    const homeState = String(settings.state || "").trim().toLowerCase();
    const interState =
      body.interState === true ||
      (!!placeOfSupply && !!homeState && String(placeOfSupply).trim().toLowerCase() !== homeState);

    const calc = calculateBill(lines, {
      billDiscount,
      loyaltyDiscount,
      pricesIncludeTax: settings.pricesIncludeTax,
      taxEnabled: settings.taxEnabled,
      roundOff: settings.roundOff,
      interState,
    });
    // If the loyalty discount was capped, only charge the points actually used
    if (loyaltyDiscount > 0 && calc.loyaltyDiscount < loyaltyDiscount) {
      redeemPoints = Math.ceil(calc.loyaltyDiscount / num(settings.loyaltyPointValue, 1));
    }

    // 5) Payments
    const pay = settlePayments(calc.totalAmount, body, settings);
    if (pay.due > 0) {
      if (!settings.allowCreditSale) throw new HttpError(400, "Credit (due) sales are disabled in settings");
      if (!customer && settings.requireCustomerForCredit) throw new HttpError(400, "Customer phone is required for a credit sale");
      // Even with the setting off, a due needs *someone* to chase. A nameless, phoneless
      // udhaar entry is money written off at the moment the bill is saved.
      if (!customer && !phone) throw new HttpError(400, "A credit (due) sale needs at least a customer phone number");
      if (customer && Number(customer.creditLimit) > 0 && Number(customer.balance) + pay.due > Number(customer.creditLimit)) {
        const room = round2(Math.max(0, Number(customer.creditLimit) - Number(customer.balance)));
        throw new HttpError(
          400,
          `Credit limit exceeded for ${customer.name}. Limit ${Number(customer.creditLimit).toFixed(2)}, already due ${Number(
            customer.balance,
          ).toFixed(2)} — only ${room.toFixed(2)} more can go on account.`,
          "CREDIT_LIMIT",
        );
      }
    }

    // 6) Bill number
    const { next } = await nextSequence(db, "billSeq", t);
    const billNumber = `${settings.billPrefix || "INV"}-${pad(next, 6)}`;

    const loyaltyEarned =
      settings.loyaltyEnabled && customer ? Math.floor((calc.totalAmount / 100) * num(settings.loyaltyEarnPer100, 0)) : 0;

    const bill = await db.Bill.create(
      {
        billNumber,
        clientRef,
        customerId: customer ? customer.id : null,
        customerName: customer ? customer.name : str(body.customerName, 120),
        customerPhone: customer ? customer.phone : phone,
        subtotal: calc.subtotal,
        itemDiscount: calc.itemDiscount,
        discountAmount: calc.billDiscount,
        loyaltyDiscount: calc.loyaltyDiscount,
        taxableAmount: calc.taxableAmount,
        taxAmount: calc.taxAmount,
        cgst: calc.cgst,
        sgst: calc.sgst,
        igst: calc.igst,
        interState: calc.interState,
        placeOfSupply,
        customerGstNumber: customerGst,
        roundOff: calc.roundOff,
        totalAmount: calc.totalAmount,
        paidAmount: pay.paid,
        dueAmount: pay.due,
        changeReturned: pay.change,
        paymentMethod: pay.method,
        payments: pay.payments,
        loyaltyEarned,
        loyaltyRedeemed: redeemPoints,
        pricesIncludeTax: settings.pricesIncludeTax,
        status: "completed",
        notes: str(body.notes, 2000),
        cashierId: req.user.id,
        cashierName: req.user.username,
      },
      { transaction: t },
    );

    await db.BillItem.bulkCreate(
      calc.lines.map((l) => ({
        billId: bill.id,
        productId: l.product.id,
        productName: l.product.name,
        productBarcode: l.product.barcode,
        hsnCode: l.product.hsnCode,
        unit: l.product.unit,
        mrp: l.product.mrp,
        unitPrice: l.price,
        costPrice: Number(l.product.costPrice) || 0,
        quantity: l.quantity,
        discount: round2(l.gross - l.finalNet),
        taxRate: settings.taxEnabled ? l.taxRate : 0,
        taxableAmount: l.taxable,
        taxAmount: l.tax,
        totalPrice: l.total,
      })),
      { transaction: t },
    );

    for (const l of calc.lines) {
      await moveStock(db, l.product, -l.quantity, { type: "sale", reference: billNumber, userName: req.user.username, transaction: t });
    }

    if (customer) {
      customer.totalSpent = round2(Number(customer.totalSpent) + calc.totalAmount);
      customer.totalBills = Number(customer.totalBills) + 1;
      customer.lastPurchaseAt = new Date();
      customer.balance = round2(Number(customer.balance) + pay.due);
      customer.loyaltyPoints = round2(Number(customer.loyaltyPoints) + loyaltyEarned - redeemPoints);
      await customer.save({ transaction: t });
    }

    if (body.heldBillId) await db.HeldBill.destroy({ where: { id: body.heldBillId }, transaction: t });

    await t.commit();
    const fullBill = await db.Bill.findByPk(bill.id, { include: fullBillInclude(db) });
    res.status(201).json({ success: true, message: "Bill created successfully", data: { bill: fullBill } });
  } catch (err) {
    if (!t.finished) await t.rollback();
    // Two identical submits can both get past the pre-check above and race to insert.
    // The unique index on client_ref stops the second one; hand back the winner's bill.
    if (clientRef && err?.name === "SequelizeUniqueConstraintError") {
      const existing = await db.Bill.findOne({ where: { clientRef } });
      if (existing) {
        const full = await db.Bill.findByPk(existing.id, { include: fullBillInclude(db) });
        return res.status(200).json({ success: true, message: "Bill already saved", data: { bill: full }, duplicate: true });
      }
    }
    throw err;
  }
});

// ── POST /api/bills/preview — totals without saving (used by POS screen) ─────
const previewBill = asyncHandler(async (req, res) => {
  const db = req.db;
  const settings = await getShopSettings(db);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const ids = items.map((i) => parseInt(i.productId, 10)).filter(Boolean);
  const products = ids.length ? await db.Product.findAll({ where: { id: ids, isActive: true } }) : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines = items
    .filter((i) => byId.has(parseInt(i.productId, 10)))
    .map((i) => {
      const p = byId.get(parseInt(i.productId, 10));
      return { price: Number(p.price), quantity: num(i.quantity), discount: num(i.discount), taxRate: Number(p.taxRate) };
    });
  const calc = calculateBill(lines, {
    billDiscount: num(req.body?.discountAmount),
    loyaltyDiscount: num(req.body?.redeemPoints) * num(settings.loyaltyPointValue, 1),
    pricesIncludeTax: settings.pricesIncludeTax,
    taxEnabled: settings.taxEnabled,
    roundOff: settings.roundOff,
  });
  delete calc.lines;
  res.json({ success: true, data: calc });
});

// ── GET /api/bills ────────────────────────────────────────────────────────────
const getBills = asyncHandler(async (req, res) => {
  const db = req.db;
  const settings = await getShopSettings(db);
  const { page, limit, offset } = paging(req.query, 20, 200);
  const { startDate, endDate, status, paymentMethod, search, customerId, cashierId } = req.query;
  const where = {};
  if (status) where.status = status;
  if (paymentMethod) where.paymentMethod = paymentMethod;
  if (customerId) where.customerId = customerId;
  if (cashierId) where.cashierId = cashierId;
  if (req.query.due === "true") where.dueAmount = { [Op.gt]: 0 };
  if (startDate || endDate) {
    const { start, end } = rangeFromStrings(startDate, endDate, settings.timezoneOffsetMinutes);
    where.createdAt = {};
    if (start) where.createdAt[Op.gte] = start;
    if (end) where.createdAt[Op.lte] = end;
  }
  if (search) {
    const qStr = String(search).trim();
    const q = `%${qStr}%`;
    const digitsOnly = normalizePhone(qStr);
    const orConds = [{ billNumber: { [Op.like]: q } }, { customerName: { [Op.like]: q } }, { customerPhone: { [Op.like]: q } }];
    if (digitsOnly && digitsOnly !== qStr) {
      orConds.push({ customerPhone: { [Op.like]: `%${digitsOnly}%` } });
    }
    where[Op.or] = orConds;
  }

  const { count, rows } = await db.Bill.findAndCountAll({
    where,
    include: [{ model: db.BillItem, as: "items" }],
    order: [["createdAt", "DESC"], ["id", "DESC"]],
    limit,
    offset,
    distinct: true,
  });
  const sumWhere = { ...where };
  if (!status) sumWhere.status = { [Op.ne]: "cancelled" };
  const [sumTotal, sumDue] = await Promise.all([db.Bill.sum("totalAmount", { where: sumWhere }), db.Bill.sum("dueAmount", { where: sumWhere })]);

  res.json({
    success: true,
    data: {
      bills: rows,
      total: count,
      page,
      pages: Math.max(1, Math.ceil(count / limit)),
      summary: { totalAmount: round2(sumTotal), dueAmount: round2(sumDue) },
    },
  });
});

// ── GET /api/bills/:id ────────────────────────────────────────────────────────
const getBill = asyncHandler(async (req, res) => {
  const bill = await req.db.Bill.findByPk(req.params.id, { include: fullBillInclude(req.db) });
  if (!bill) throw new HttpError(404, "Bill not found");
  res.json({ success: true, data: { bill } });
});

// ── PATCH /api/bills/:id/cancel ──────────────────────────────────────────────
const cancelBill = asyncHandler(async (req, res) => {
  const db = req.db;
  const settings = await getShopSettings(db);
  if (req.user.role === "cashier" && !req.isSuperAdmin && !settings.cashierCanCancel) {
    throw new HttpError(403, "Cashiers are not allowed to cancel bills");
  }
  const t = await req.tenant.sequelize.transaction();
  try {
    const bill = await db.Bill.findByPk(req.params.id, { include: [{ model: db.BillItem, as: "items" }], transaction: t, lock: t.LOCK.UPDATE });
    if (!bill) throw new HttpError(404, "Bill not found");
    if (bill.status !== "completed") throw new HttpError(400, "Only completed bills (without returns) can be cancelled");

    for (const item of bill.items) {
      const product = await db.Product.findByPk(item.productId, { transaction: t, lock: t.LOCK.UPDATE });
      const back = round3(Number(item.quantity) - Number(item.returnedQty));
      if (product && back > 0) {
        await moveStock(db, product, back, { type: "sale_cancel", reference: bill.billNumber, userName: req.user.username, transaction: t });
      }
    }

    if (bill.customerId) {
      const customer = await db.Customer.findByPk(bill.customerId, { transaction: t, lock: t.LOCK.UPDATE });
      if (customer) {
        customer.totalSpent = round2(Math.max(0, Number(customer.totalSpent) - Number(bill.totalAmount)));
        customer.totalBills = Math.max(0, Number(customer.totalBills) - 1);
        customer.balance = round2(Number(customer.balance) - Number(bill.dueAmount));
        customer.loyaltyPoints = round2(Math.max(0, Number(customer.loyaltyPoints) - Number(bill.loyaltyEarned) + Number(bill.loyaltyRedeemed)));
        await customer.save({ transaction: t });
      }
    }

    const reason = str(req.body?.reason, 200);
    bill.status = "cancelled";
    bill.notes = [bill.notes, `Cancelled by ${req.user.username}${reason ? `: ${reason}` : ""}`].filter(Boolean).join("\n");
    await bill.save({ transaction: t });
    await t.commit();
    res.json({ success: true, message: "Bill cancelled and stock restored" });
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
});

// ── POST /api/bills/:id/return  { items:[{billItemId, quantity, restock}], refundMethod, reason } ─
const returnBill = asyncHandler(async (req, res) => {
  const db = req.db;
  const settings = await getShopSettings(db);
  const body = req.body || {};
  const requested = (Array.isArray(body.items) ? body.items : []).filter((i) => num(i.quantity) > 0);
  if (!requested.length) throw new HttpError(400, "Select at least one item to return");
  if (req.user.role === "cashier" && !req.isSuperAdmin && !settings.cashierCanCancel) {
    throw new HttpError(403, "Cashiers are not allowed to process returns");
  }
  const refundMethod = ["cash", "upi", "card", "adjust_due", "store_credit"].includes(body.refundMethod) ? body.refundMethod : "cash";

  const t = await req.tenant.sequelize.transaction();
  try {
    const bill = await db.Bill.findByPk(req.params.id, { include: [{ model: db.BillItem, as: "items" }], transaction: t, lock: t.LOCK.UPDATE });
    if (!bill) throw new HttpError(404, "Bill not found");
    if (!["completed", "partially_returned"].includes(bill.status)) throw new HttpError(400, "This bill cannot be returned");

    // Checked up front: "adjust against dues" and "store credit" both need an account to
    // post to. Finding this out after restocking and writing the return rows only worked
    // because the transaction rolled back — but the cashier saw a confusing late error.
    if (!bill.customerId && (refundMethod === "adjust_due" || refundMethod === "store_credit")) {
      throw new HttpError(400, "This bill has no customer — refund in cash / UPI / card instead");
    }

    const { next } = await nextSequence(db, "returnSeq", t);
    const returnNumber = `${settings.returnPrefix || "RET"}-${pad(next, 6)}`;
    let total = 0;
    const rows = [];

    for (const r of requested) {
      const item = bill.items.find((i) => i.id === parseInt(r.billItemId, 10));
      if (!item) throw new HttpError(400, "Invalid bill item");
      const q = round3(num(r.quantity));
      const available = round3(Number(item.quantity) - Number(item.returnedQty));
      if (q > available + 0.0001) throw new HttpError(400, `Only ${available} of "${item.productName}" can be returned`);
      const amount = round2((Number(item.totalPrice) / Number(item.quantity)) * q);
      total = round2(total + amount);
      item.returnedQty = round3(Number(item.returnedQty) + q);
      await item.save({ transaction: t, fields: ["returnedQty"] });
      const restock = r.restock !== false;
      if (restock) {
        const product = await db.Product.findByPk(item.productId, { transaction: t, lock: t.LOCK.UPDATE });
        if (product) await moveStock(db, product, q, { type: "return", reference: returnNumber, userName: req.user.username, transaction: t });
      }
      rows.push({ billItemId: item.id, productId: item.productId, productName: item.productName, quantity: q, amount, restock });
    }

    const saleReturn = await db.SaleReturn.create(
      {
        returnNumber,
        billId: bill.id,
        billNumber: bill.billNumber,
        customerId: bill.customerId,
        totalAmount: total,
        refundMethod,
        reason: str(body.reason, 255),
        createdBy: req.user.username,
      },
      { transaction: t },
    );
    await db.SaleReturnItem.bulkCreate(rows.map((r) => ({ ...r, returnId: saleReturn.id })), { transaction: t });

    const fullyReturned = bill.items.every((i) => Number(i.returnedQty) >= Number(i.quantity) - 0.0001);
    bill.returnedAmount = round2(Number(bill.returnedAmount) + total);
    bill.status = fullyReturned ? "returned" : "partially_returned";
    // Returning against an unpaid bill reduces what the customer owes on it
    if (refundMethod === "adjust_due") bill.dueAmount = round2(Math.max(0, Number(bill.dueAmount) - total));
    await bill.save({ transaction: t });

    if (bill.customerId) {
      const customer = await db.Customer.findByPk(bill.customerId, { transaction: t, lock: t.LOCK.UPDATE });
      if (customer) {
        customer.totalSpent = round2(Math.max(0, Number(customer.totalSpent) - total));
        if (refundMethod === "adjust_due" || refundMethod === "store_credit") customer.balance = round2(Number(customer.balance) - total);
        const pointsBack = Math.floor((total / 100) * num(settings.loyaltyEarnPer100, 0));
        customer.loyaltyPoints = round2(Math.max(0, Number(customer.loyaltyPoints) - pointsBack));
        await customer.save({ transaction: t });
      }
    }

    await t.commit();
    const updated = await db.Bill.findByPk(bill.id, { include: fullBillInclude(db) });
    res.status(201).json({ success: true, message: `Return ${returnNumber} saved — refund ${total.toFixed(2)}`, data: { bill: updated, returnNumber, amount: total } });
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
});

// ── GET /api/bills/returns ───────────────────────────────────────────────────
const getReturns = asyncHandler(async (req, res) => {
  const db = req.db;
  const settings = await getShopSettings(db);
  const { page, limit, offset } = paging(req.query, 20, 200);
  const where = {};
  if (req.query.startDate || req.query.endDate) {
    const { start, end } = rangeFromStrings(req.query.startDate, req.query.endDate, settings.timezoneOffsetMinutes);
    where.createdAt = {};
    if (start) where.createdAt[Op.gte] = start;
    if (end) where.createdAt[Op.lte] = end;
  }
  const { count, rows } = await db.SaleReturn.findAndCountAll({
    where,
    include: [{ model: db.SaleReturnItem, as: "items" }],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });
  res.json({ success: true, data: { returns: rows, total: count, page, pages: Math.max(1, Math.ceil(count / limit)) } });
});

// ── Held (parked) bills ──────────────────────────────────────────────────────
const getHeldBills = asyncHandler(async (req, res) => {
  const rows = await req.db.HeldBill.findAll({ order: [["createdAt", "DESC"]], limit: 50 });
  res.json({ success: true, data: { held: rows } });
});

const holdBill = asyncHandler(async (req, res) => {
  const cart = Array.isArray(req.body?.cart) ? req.body.cart.slice(0, 300) : [];
  if (!cart.length) throw new HttpError(400, "Cart is empty");
  const held = await req.db.HeldBill.create({
    label: str(req.body?.label, 80) || `Hold ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`,
    cart,
    meta: req.body?.meta && typeof req.body.meta === "object" ? req.body.meta : {},
    createdBy: req.user.username,
  });
  res.status(201).json({ success: true, message: "Bill put on hold", data: { held } });
});

const deleteHeldBill = asyncHandler(async (req, res) => {
  await req.db.HeldBill.destroy({ where: { id: req.params.id } });
  res.json({ success: true, message: "Held bill removed" });
});

module.exports = {
  createBill,
  previewBill,
  getBills,
  getBill,
  cancelBill,
  returnBill,
  getReturns,
  getHeldBills,
  holdBill,
  deleteHeldBill,
};
