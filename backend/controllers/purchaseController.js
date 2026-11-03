// controllers/purchaseController.js — stock inward from suppliers (GRN / purchase bills)
const { Op } = require("sequelize");
const { asyncHandler, HttpError, num, str, round2, round3, pad, paging, assertPriceWithinMrp } = require("../utils/helpers");
const { getShopSettings, nextSequence } = require("../utils/settings");
const { moveStock } = require("../utils/stock");

const getPurchases = asyncHandler(async (req, res) => {
  const db = req.db;
  const { page, limit, offset } = paging(req.query, 20, 200);
  const where = {};
  if (req.query.supplierId) where.supplierId = req.query.supplierId;
  if (req.query.status) where.status = req.query.status;
  if (req.query.due === "true") where.dueAmount = { [Op.gt]: 0 };
  if (req.query.startDate || req.query.endDate) {
    where.purchaseDate = {};
    if (req.query.startDate) where.purchaseDate[Op.gte] = req.query.startDate;
    if (req.query.endDate) where.purchaseDate[Op.lte] = req.query.endDate;
  }
  if (req.query.search) {
    const q = `%${String(req.query.search).trim()}%`;
    where[Op.or] = [{ purchaseNumber: { [Op.like]: q } }, { invoiceNo: { [Op.like]: q } }, { supplierName: { [Op.like]: q } }];
  }
  const { count, rows } = await db.Purchase.findAndCountAll({
    where,
    include: [{ model: db.PurchaseItem, as: "items" }],
    order: [["purchaseDate", "DESC"], ["id", "DESC"]],
    limit,
    offset,
    distinct: true,
  });
  const sumWhere = { ...where, status: "completed" };
  const [total, due] = await Promise.all([db.Purchase.sum("totalAmount", { where: sumWhere }), db.Purchase.sum("dueAmount", { where: sumWhere })]);
  res.json({
    success: true,
    data: { purchases: rows, total: count, page, pages: Math.max(1, Math.ceil(count / limit)), summary: { totalAmount: round2(total), dueAmount: round2(due) } },
  });
});

const getPurchase = asyncHandler(async (req, res) => {
  const purchase = await req.db.Purchase.findByPk(req.params.id, {
    include: [{ model: req.db.PurchaseItem, as: "items" }, { model: req.db.Supplier, as: "supplier" }],
  });
  if (!purchase) throw new HttpError(404, "Purchase not found");
  res.json({ success: true, data: { purchase } });
});

// POST /api/purchases
const createPurchase = asyncHandler(async (req, res) => {
  const db = req.db;
  const b = req.body || {};
  const items = Array.isArray(b.items) ? b.items.filter((i) => i && i.productId && num(i.quantity) > 0) : [];
  if (!items.length) throw new HttpError(400, "Add at least one product with quantity");
  const updatePrices = b.updatePrices !== false;

  const t = await req.tenant.sequelize.transaction();
  try {
    let supplier = null;
    if (b.supplierId) {
      supplier = await db.Supplier.findByPk(b.supplierId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!supplier) throw new HttpError(404, "Supplier not found");
    }

    const lines = [];
    for (const it of items) {
      const product = await db.Product.findByPk(it.productId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!product) throw new HttpError(404, `Product #${it.productId} not found`);
      const quantity = round3(num(it.quantity));
      const costPrice = round2(Math.max(0, num(it.costPrice, Number(product.costPrice))));
      const taxRate = Math.max(0, num(it.taxRate, Number(product.taxRate)));
      const base = round2(costPrice * quantity);
      const taxAmount = round2((base * taxRate) / 100);
      if (updatePrices) {
        const targetMrp = it.mrp !== undefined && it.mrp !== "" ? (it.mrp === null ? null : round2(num(it.mrp))) : product.mrp;
        const targetPrice = it.sellingPrice !== undefined && it.sellingPrice !== "" ? round2(num(it.sellingPrice)) : Number(product.price);
        assertPriceWithinMrp(targetPrice, targetMrp, product.name);
      }
      lines.push({ product, it, quantity, costPrice, taxRate, base, taxAmount, totalAmount: round2(base + taxAmount) });
    }

    const subtotal = round2(lines.reduce((a, l) => a + l.base, 0));
    const taxAmount = round2(lines.reduce((a, l) => a + l.taxAmount, 0));
    const discountAmount = round2(Math.max(0, num(b.discountAmount)));
    const otherCharges = round2(Math.max(0, num(b.otherCharges)));
    const totalAmount = round2(Math.max(0, subtotal + taxAmount + otherCharges - discountAmount));
    const paidAmount = round2(Math.min(totalAmount, Math.max(0, b.paidAmount === undefined || b.paidAmount === "" ? totalAmount : num(b.paidAmount))));
    const dueAmount = round2(totalAmount - paidAmount);
    if (dueAmount > 0 && !supplier) throw new HttpError(400, "Select a supplier to record an unpaid (credit) purchase");

    const { next, settings } = await nextSequence(db, "purchaseSeq", t);
    const purchaseNumber = `${settings.purchasePrefix || "PUR"}-${pad(next, 6)}`;

    const purchase = await db.Purchase.create(
      {
        purchaseNumber,
        supplierId: supplier ? supplier.id : null,
        supplierName: supplier ? supplier.name : str(b.supplierName, 150),
        invoiceNo: str(b.invoiceNo, 60),
        purchaseDate: b.purchaseDate ? String(b.purchaseDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
        subtotal,
        taxAmount,
        discountAmount,
        otherCharges,
        totalAmount,
        paidAmount,
        dueAmount,
        paymentMethod: str(b.paymentMethod, 20) || "cash",
        status: "completed",
        notes: str(b.notes, 2000),
        createdBy: req.user.username,
      },
      { transaction: t },
    );

    for (const l of lines) {
      await db.PurchaseItem.create(
        {
          purchaseId: purchase.id,
          productId: l.product.id,
          productName: l.product.name,
          quantity: l.quantity,
          costPrice: l.costPrice,
          taxRate: l.taxRate,
          taxAmount: l.taxAmount,
          totalAmount: l.totalAmount,
          mrp: l.it.mrp !== undefined && l.it.mrp !== "" ? round2(num(l.it.mrp)) : null,
          sellingPrice: l.it.sellingPrice !== undefined && l.it.sellingPrice !== "" ? round2(num(l.it.sellingPrice)) : null,
          expiryDate: l.it.expiryDate ? String(l.it.expiryDate).slice(0, 10) : null,
          batchNo: str(l.it.batchNo, 60),
        },
        { transaction: t },
      );
      if (updatePrices) {
        const upd = { costPrice: l.costPrice };
        if (l.it.mrp !== undefined && l.it.mrp !== "") upd.mrp = round2(num(l.it.mrp));
        if (l.it.sellingPrice !== undefined && l.it.sellingPrice !== "") upd.price = round2(num(l.it.sellingPrice));
        if (l.it.expiryDate) upd.expiryDate = String(l.it.expiryDate).slice(0, 10);
        if (l.it.batchNo) upd.batchNo = str(l.it.batchNo, 60);
        if (supplier) upd.supplierId = supplier.id;
        if (!l.product.isActive) upd.isActive = true;
        await l.product.update(upd, { transaction: t });
      }
      await moveStock(db, l.product, l.quantity, { type: "purchase", reference: purchaseNumber, userName: req.user.username, transaction: t });
    }

    if (supplier) {
      supplier.balance = round2(Number(supplier.balance) + dueAmount);
      await supplier.save({ transaction: t });
      if (paidAmount > 0) {
        await db.SupplierPayment.create(
          { supplierId: supplier.id, purchaseId: purchase.id, amount: paidAmount, method: purchase.paymentMethod, reference: purchaseNumber, notes: "Paid at purchase", createdBy: req.user.username },
          { transaction: t },
        );
      }
    }

    await t.commit();
    const full = await db.Purchase.findByPk(purchase.id, { include: [{ model: db.PurchaseItem, as: "items" }] });
    res.status(201).json({ success: true, message: `Purchase ${purchaseNumber} saved & stock updated`, data: { purchase: full } });
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
});

// PATCH /api/purchases/:id/cancel — reverses stock and supplier balance
const cancelPurchase = asyncHandler(async (req, res) => {
  const db = req.db;
  const settings = await getShopSettings(db);
  const t = await req.tenant.sequelize.transaction();
  try {
    const purchase = await db.Purchase.findByPk(req.params.id, { include: [{ model: db.PurchaseItem, as: "items" }], transaction: t, lock: t.LOCK.UPDATE });
    if (!purchase) throw new HttpError(404, "Purchase not found");
    if (purchase.status !== "completed") throw new HttpError(400, "Purchase already cancelled");

    for (const item of purchase.items) {
      const product = await db.Product.findByPk(item.productId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!product) continue;
      if (!settings.allowNegativeStock && Number(product.quantity) < Number(item.quantity)) {
        throw new HttpError(400, `Cannot cancel — "${product.name}" has only ${Number(product.quantity)} in stock (already sold)`);
      }
      await moveStock(db, product, -Number(item.quantity), { type: "purchase_cancel", reference: purchase.purchaseNumber, userName: req.user.username, transaction: t });
    }
    if (purchase.supplierId) {
      const supplier = await db.Supplier.findByPk(purchase.supplierId, { transaction: t, lock: t.LOCK.UPDATE });
      if (supplier) {
        supplier.balance = round2(Number(supplier.balance) - Number(purchase.dueAmount));
        await supplier.save({ transaction: t });
      }
    }
    purchase.status = "cancelled";
    purchase.notes = [purchase.notes, `Cancelled by ${req.user.username}`].filter(Boolean).join("\n");
    await purchase.save({ transaction: t });
    await t.commit();
    res.json({ success: true, message: "Purchase cancelled and stock reversed" });
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
});

module.exports = { getPurchases, getPurchase, createPurchase, cancelPurchase };
