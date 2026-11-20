const settingsPath = require.resolve("../../utils/settings");
const auditPath = require.resolve("../../utils/auditLogger");
const controllerPath = require.resolve("../../controllers/billingController");

const DEFAULT_SETTINGS = {
  allowCreditSale: false,
  allowNegativeStock: false,
  cashierCanCancel: true,
  cashierCanDiscount: true,
  defaultPaymentMethod: "cash",
  gstNumber: "",
  loyaltyEnabled: false,
  maxBillDiscountPercent: 100,
  pricesIncludeTax: true,
  roundOff: false,
  state: "",
  taxEnabled: false,
};

const createHarness = ({ settings = {}, bill: initialBill = null, product: initialProduct = null } = {}) => {
  const state = {
    billItems: [],
    bills: initialBill ? [initialBill] : [],
    movements: [],
    product: initialProduct
      ? {
          ...initialProduct,
          save: async function save() {
            return this;
          },
        }
      : null,
    returnItems: [],
    returns: [],
    transactions: [],
  };
  let billId = state.bills.reduce((max, bill) => Math.max(max, Number(bill.id) || 0), 0);
  let returnId = 0;
  let sequence = 0;

  require.cache[settingsPath] = {
    id: settingsPath,
    filename: settingsPath,
    loaded: true,
    exports: {
      getShopSettings: async () => ({ ...DEFAULT_SETTINGS, ...settings }),
      nextSequence: async () => ({ next: ++sequence, settings: { ...DEFAULT_SETTINGS, ...settings } }),
    },
  };
  require.cache[auditPath] = {
    id: auditPath,
    filename: auditPath,
    loaded: true,
    exports: { logAudit: async () => {} },
  };
  delete require.cache[controllerPath];
  const controller = require(controllerPath);

  const db = {
    Bill: {
      create: async (values) => {
        const bill = { ...values, id: ++billId, items: [], save: async function save() { return this; } };
        state.bills.push(bill);
        return bill;
      },
      findByPk: async (id) => state.bills.find((bill) => Number(bill.id) === Number(id)) || null,
      findOne: async ({ where }) => state.bills.find((bill) => bill.clientRef === where.clientRef) || null,
    },
    BillItem: {
      bulkCreate: async (rows) => {
        state.billItems.push(...rows);
        return rows;
      },
    },
    Customer: {
      findByPk: async () => null,
      findOne: async () => null,
      create: async () => {
        throw new Error("Unexpected customer creation in billing test");
      },
    },
    HeldBill: { destroy: async () => 1 },
    Product: {
      findByPk: async (id) => (state.product && Number(state.product.id) === Number(id) ? state.product : null),
    },
    SaleReturn: {
      create: async (values) => {
        const saleReturn = { ...values, id: ++returnId };
        state.returns.push(saleReturn);
        return saleReturn;
      },
      findOne: async ({ where }) =>
        state.returns.find((saleReturn) => Number(saleReturn.billId) === Number(where.billId) && saleReturn.clientRef === where.clientRef) ||
        null,
      sum: async (_field, { where }) =>
        state.returns
          .filter((saleReturn) => Number(saleReturn.billId) === Number(where.billId) && ["cash", "upi", "card"].includes(saleReturn.refundMethod))
          .reduce((sum, saleReturn) => sum + Number(saleReturn.totalAmount), 0),
    },
    SaleReturnItem: {
      bulkCreate: async (rows) => {
        state.returnItems.push(...rows);
        return rows;
      },
    },
    StockMovement: {
      create: async (movement) => {
        state.movements.push(movement);
        return movement;
      },
    },
  };

  const req = {
    body: {},
    db,
    isSuperAdmin: false,
    params: {},
    tenant: {
      sequelize: {
        transaction: async () => {
          const transaction = {
            LOCK: { UPDATE: "UPDATE" },
            finished: null,
            commit: async function commit() {
              this.finished = "commit";
            },
            rollback: async function rollback() {
              this.finished = "rollback";
            },
          };
          state.transactions.push(transaction);
          return transaction;
        },
      },
    },
    user: { id: 1, role: "owner", username: "Test Owner" },
  };

  const response = {
    body: null,
    statusCode: 200,
    json(body) {
      this.body = body;
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
  };

  const invoke = async (handler, request = req) => {
    await handler(request, response, (error) => {
      throw error;
    });
    return response;
  };

  return { controller, db, invoke, req, response, state };
};

module.exports = { createHarness };
