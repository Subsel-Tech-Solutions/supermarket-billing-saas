// controllers/customerController.js — customers, credit (udhaar) and loyalty
const { Op } = require("sequelize");
const { asyncHandler, HttpError, num, str, round2, paging, normalizePhone, isValidPhone } = require("../utils/helpers");
const { normalizeGstin, isValidGstin } = require("../utils/gst");

const parseCreditLimit = (raw) => {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "" || raw === "unlimited") return null;
  return round2(Math.max(0, num(raw)));
};

const customerFields = (b, isCashier = false, existingCustomer = null) => {
  const rawPhone = b.phone !== undefined && b.phone !== null ? String(b.phone).trim() : null;
  let phone = null;
  if (rawPhone) {
    phone = normalizePhone(rawPhone);
    if (!isValidPhone(rawPhone)) {
      throw new HttpError(400, "Enter a valid 10-digit mobile number");
    }
  }

  // Credit limit authorization:
  // Default to 0 for new customers, or keep existingCustomer's limit.
  // Only non-cashiers (owner/manager/superAdmin) can define or modify creditLimit.
  let creditLimit = existingCustomer ? existingCustomer.creditLimit : 0;
  if (!isCashier && b.creditLimit !== undefined) {
    creditLimit = parseCreditLimit(b.creditLimit);
  }

  const gstNumber = normalizeGstin(str(b.gstNumber, 20));
  if (gstNumber && !isValidGstin(gstNumber)) throw new HttpError(400, "Enter a valid 15-character customer GSTIN");

  return {
    name: str(b.name, 120) || "Customer",
    phone,
    email: str(b.email, 120),
    address: str(b.address, 1000),
    gstNumber: gstNumber || null,
    creditLimit,
    notes: str(b.notes, 2000),
  };
};

// GET /api/customers
const getCustomers = asyncHandler(async (req, res) => {
  const db = req.db;
  const { page, limit, offset } = paging(req.query, 50, 1000);
  const where = { isActive: true };
  if (req.query.search) {
    const qStr = String(req.query.search).trim();
    const q = `%${qStr}%`;
    const digitsOnly = normalizePhone(qStr);
    const orConds = [{ name: { [Op.like]: q } }, { phone: { [Op.like]: q } }, { email: { [Op.like]: q } }];
    if (digitsOnly && digitsOnly !== qStr) {
      orConds.push({ phone: { [Op.like]: `%${digitsOnly}%` } });
    }
    where[Op.or] = orConds;
  }
  if (req.query.due === "true") where.balance = { [Op.gt]: 0 };
  const orders = {
    recent: [["lastPurchaseAt", "DESC"]],
    spent: [["totalSpent", "DESC"]],
    due: [["balance", "DESC"]],
    name: [["name", "ASC"]],
  };
  const { count, rows } = await db.Customer.findAndCountAll({
    where,
    order: orders[req.query.sort] || [["updatedAt", "DESC"]],
    limit,
    offset,
  });
  const [totalDue, totalSpent, totalPoints] = await Promise.all([
    db.Customer.sum("balance", { where: { isActive: true, balance: { [Op.gt]: 0 } } }),
    db.Customer.sum("totalSpent", { where: { isActive: true } }),
    db.Customer.sum("loyaltyPoints", { where: { isActive: true } }),
  ]);
  res.json({
    success: true,
    data: {
      customers: rows,
      total: count,
      page,
      pages: Math.max(1, Math.ceil(count / limit)),
      summary: { totalDue: round2(totalDue), totalSpent: round2(totalSpent), totalPoints: round2(totalPoints) },
    },
  });
});

// GET /api/customers/lookup?phone=
const lookupCustomer = asyncHandler(async (req, res) => {
  const raw = str(req.query.phone, 30);
  if (!raw) throw new HttpError(400, "Phone is required");
  const phone = normalizePhone(raw);
  if (!phone) throw new HttpError(400, "Invalid phone number format");
  const customer = await req.db.Customer.findOne({ where: { phone } });
  res.json({ success: true, data: { customer } });
});

// GET /api/customers/:id  → profile + bills + payments + returns
const getCustomer = asyncHandler(async (req, res) => {
  const db = req.db;
  const customer = await db.Customer.findByPk(req.params.id);
  if (!customer) throw new HttpError(404, "Customer not found");
  const [bills, payments, returns] = await Promise.all([
    db.Bill.findAll({ where: { customerId: customer.id }, order: [["createdAt", "DESC"]], limit: 200, include: [{ model: db.BillItem, as: "items" }] }),
    db.CustomerPayment.findAll({ where: { customerId: customer.id }, order: [["createdAt", "DESC"]], limit: 200 }),
    db.SaleReturn.findAll({ where: { customerId: customer.id }, order: [["createdAt", "DESC"]], limit: 100 }),
  ]);
  res.json({ success: true, data: { customer, bills, payments, returns } });
});

// POST /api/customers
const createCustomer = asyncHandler(async (req, res) => {
  const isCashier = req.user.role === "cashier" && !req.isSuperAdmin;
  if (isCashier && req.body && req.body.creditLimit !== undefined && req.body.creditLimit !== null && String(req.body.creditLimit).trim() !== "") {
    const rawVal = req.body.creditLimit;
    if (rawVal === "unlimited" || num(rawVal) > 0) {
      throw new HttpError(403, "Cashiers are not allowed to assign customer credit limits");
    }
  }

  const data = customerFields(req.body || {}, isCashier);
  if (!data.phone) throw new HttpError(400, "Phone number is required");
  const dup = await req.db.Customer.findOne({ where: { phone: data.phone } });
  if (dup) {
    if (!dup.isActive) {
      await dup.update({ ...data, isActive: true });
      return res.status(200).json({ success: true, message: "Customer restored", data: { customer: dup } });
    }
    throw new HttpError(409, `Phone already belongs to ${dup.name}`);
  }
  const customer = await req.db.Customer.create(data);
  res.status(201).json({ success: true, message: "Customer added", data: { customer } });
});

// PUT /api/customers/:id
const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await req.db.Customer.findByPk(req.params.id);
  if (!customer) throw new HttpError(404, "Customer not found");

  const isCashier = req.user.role === "cashier" && !req.isSuperAdmin;
  if (isCashier && req.body && req.body.creditLimit !== undefined) {
    const requested = parseCreditLimit(req.body.creditLimit);
    const current = customer.creditLimit === null ? null : round2(num(customer.creditLimit));
    if (requested !== current) {
      throw new HttpError(403, "Cashiers are not allowed to change customer credit limits");
    }
  }

  const data = customerFields({ ...customer.get({ plain: true }), ...(req.body || {}) }, isCashier, customer);
  if (!data.phone) throw new HttpError(400, "Phone number is required");
  if (data.phone !== customer.phone) {
    const dup = await req.db.Customer.findOne({ where: { phone: data.phone, id: { [Op.ne]: customer.id } } });
    if (dup) throw new HttpError(409, `Phone already belongs to ${dup.name}`);
  }
  const oldPhone = customer.phone;
  await customer.update(data);

  // A bill is a tax document: the name printed on it is the name at the time of sale and
  // must not be rewritten later. Only the phone is kept in sync, and only when it
  // actually changed, so dues collection and WhatsApp reminders still reach the customer.
  if (data.phone !== oldPhone) {
    await req.db.Bill.update({ customerPhone: customer.phone }, { where: { customerId: customer.id } });
  }
  res.json({ success: true, message: "Customer updated", data: { customer } });
});

// DELETE /api/customers/:id
const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await req.db.Customer.findByPk(req.params.id);
  if (!customer) throw new HttpError(404, "Customer not found");
  if (Number(customer.balance) > 0) throw new HttpError(400, "Customer has pending dues — settle them first");
  await customer.update({ isActive: false });
  res.json({ success: true, message: "Customer removed" });
});

// POST /api/customers/:id/payments  { amount, method, reference, notes } — collect dues
const receivePayment = asyncHandler(async (req, res) => {
  const db = req.db;
  const amount = round2(num(req.body?.amount));
  if (!(amount > 0)) throw new HttpError(400, "Enter a valid amount");
  const method = ["cash", "upi", "card", "cheque", "other"].includes(req.body?.method) ? req.body.method : "cash";

  const t = await req.tenant.sequelize.transaction();
  try {
    const customer = await db.Customer.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!customer) throw new HttpError(404, "Customer not found");

    const payment = await db.CustomerPayment.create(
      { customerId: customer.id, amount, method, reference: str(req.body?.reference, 80), notes: str(req.body?.notes, 255), createdBy: req.user.username },
      { transaction: t },
    );

    // Allocate to the oldest unpaid bills first
    let remaining = amount;
    const dueBills = await db.Bill.findAll({
      where: { customerId: customer.id, dueAmount: { [Op.gt]: 0 }, status: { [Op.ne]: "cancelled" } },
      order: [["createdAt", "ASC"]],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    for (const bill of dueBills) {
      if (remaining <= 0) break;
      const pay = round2(Math.min(remaining, Number(bill.dueAmount)));
      bill.dueAmount = round2(Number(bill.dueAmount) - pay);
      bill.paidAmount = round2(Number(bill.paidAmount) + pay);
      bill.payments = [...(bill.payments || []), { method, amount: pay, reference: `Due collected ${new Date().toISOString().slice(0, 10)}`, settlement: true }];
      await bill.save({ transaction: t });
      remaining = round2(remaining - pay);
    }

    customer.balance = round2(Number(customer.balance) - amount); // negative = advance / store credit
    await customer.save({ transaction: t });
    await t.commit();
    res.status(201).json({ success: true, message: "Payment received", data: { customer, payment } });
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
});

// POST /api/customers/:id/points  { points, note } — manual loyalty adjustment (+/-)
const adjustPoints = asyncHandler(async (req, res) => {
  const customer = await req.db.Customer.findByPk(req.params.id);
  if (!customer) throw new HttpError(404, "Customer not found");
  const points = round2(num(req.body?.points));
  customer.loyaltyPoints = round2(Math.max(0, Number(customer.loyaltyPoints) + points));
  await customer.save();
  res.json({ success: true, message: "Points updated", data: { customer } });
});

module.exports = { getCustomers, lookupCustomer, getCustomer, createCustomer, updateCustomer, deleteCustomer, receivePayment, adjustPoints };
