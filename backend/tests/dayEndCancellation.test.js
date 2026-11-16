const assert = require("assert");

const settingsPath = require.resolve("../utils/settings");
require.cache[settingsPath] = {
  id: settingsPath,
  filename: settingsPath,
  loaded: true,
  exports: { getShopSettings: async () => ({ timezoneOffsetMinutes: 0 }) },
};

const { getDayEnd } = require("../controllers/reportsController");

const cancelledBill = {
  createdAt: new Date("2026-01-09T12:00:00Z"),
  updatedAt: new Date("2026-01-10T12:00:00Z"),
  status: "cancelled",
  paymentMethod: "cash",
  totalAmount: 110,
  payments: [
    { method: "cash", amount: 80 },
    { method: "upi", amount: 20 },
    { method: "cash", amount: 10, settlement: true },
    { method: "credit", amount: 5 },
  ],
};

const activeBill = {
  createdAt: new Date("2026-01-10T14:00:00Z"),
  updatedAt: new Date("2026-01-10T14:00:00Z"),
  status: "completed",
  paymentMethod: "cash",
  totalAmount: 50,
  payments: [{ method: "cash", amount: 50 }],
};

const dayOf = (where, field) => {
  const range = where[field];
  const between = Object.getOwnPropertySymbols(range).find((symbol) => symbol.description === "between");
  return range[between][0].toISOString().slice(0, 10);
};

const getDayEndFor = async (date) => {
  let response;
  const req = {
    query: { date },
    db: {
      Bill: {
        findAll: async ({ where }) => {
          if (where.updatedAt) return dayOf(where, "updatedAt") === "2026-01-10" ? [cancelledBill] : [];
          const billDate = dayOf(where, "createdAt");
          return [cancelledBill, activeBill].filter((bill) => bill.createdAt.toISOString().slice(0, 10) === billDate);
        },
      },
      CustomerPayment: { findAll: async () => [] },
      Expense: { findAll: async () => [] },
      SaleReturn: { findAll: async () => [] },
      SupplierPayment: { findAll: async () => [] },
    },
    tenant: {
      sequelize: {
        query: async (query) => query.includes("bill_items") ? [{ tax: 0 }] : [{ bills: 0, revenue: 0, discount: 0, due: 0, returns: 0 }],
      },
    },
  };
  await getDayEnd(req, { json: (body) => { response = body; } }, (error) => { throw error; });
  return response.data;
};

const run = async () => {
  const saleDay = await getDayEndFor("2026-01-09");
  assert.deepStrictEqual(saleDay.payments, [
    { method: "cash", amount: 80 },
    { method: "upi", amount: 20 },
    { method: "credit", amount: 5 },
  ]);
  assert.strictEqual(saleDay.cash.sales, 80);
  assert.strictEqual(saleDay.cash.expectedInDrawer, 80);
  assert.strictEqual(saleDay.cancelledBills, 0);

  const cancellationDay = await getDayEndFor("2026-01-10");
  assert.strictEqual(cancellationDay.cancelledBills, 1);
  assert.deepStrictEqual(cancellationDay.cancellationRefunds, [
    { method: "cash", amount: 90 },
    { method: "upi", amount: 20 },
  ]);
  assert.strictEqual(cancellationDay.cash.sales, 50);
  assert.strictEqual(cancellationDay.cash.cancellations, 90);
  assert.strictEqual(cancellationDay.cash.expectedInDrawer, -40);
  console.log("Day-end cancellation tests passed: original sales stay on their sale date; refunds are recorded on cancellation date.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
