const assert = require("assert");
const { createHarness } = require("./helpers/billingControllerHarness");

const run = async () => {
  const { controller, invoke, req, response, state } = createHarness({
    bill: {
      id: 12,
      billNumber: "INV-000012",
      clientRef: "checkout-duplicate",
      totalAmount: 20,
      items: [],
    },
    product: {
      id: 7,
      name: "Rice",
      price: 10,
      costPrice: 6,
      quantity: 5,
      taxRate: 0,
      mrp: 0,
      isActive: true,
      allowDecimal: false,
    },
  });
  req.body = {
    clientRef: "checkout-duplicate",
    items: [{ productId: 7, quantity: 2 }],
    paymentMethod: "cash",
  };

  await invoke(controller.createBill);

  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.body.duplicate, true);
  assert.strictEqual(state.bills.length, 1);
  assert.strictEqual(state.product.quantity, 5);
  assert.strictEqual(state.billItems.length, 0);
  assert.strictEqual(state.movements.length, 0);
  assert.strictEqual(state.transactions.length, 0);

  const item = {
    id: 21,
    productId: 7,
    productName: "Rice",
    quantity: 2,
    returnedQty: 1,
    totalPrice: 20,
    save: async function save() {
      return this;
    },
  };
  const bill = {
    id: 22,
    billNumber: "INV-000022",
    customerId: null,
    paidAmount: 20,
    dueAmount: 0,
    returnedAmount: 10,
    status: "partially_returned",
    items: [item],
    save: async function save() {
      return this;
    },
  };
  const returnHarness = createHarness({
    bill,
    product: { id: 7, name: "Rice", quantity: 6, save: async function save() { return this; } },
  });
  returnHarness.state.returns.push({
    id: 1,
    billId: bill.id,
    clientRef: "return-duplicate",
    returnNumber: "RET-000001",
    totalAmount: 10,
    refundMethod: "cash",
  });
  returnHarness.req.params.id = bill.id;
  returnHarness.req.body = {
    clientRef: "return-duplicate",
    items: [{ billItemId: item.id, quantity: 1 }],
  };

  await returnHarness.invoke(returnHarness.controller.returnBill);

  assert.strictEqual(returnHarness.response.statusCode, 200);
  assert.strictEqual(returnHarness.response.body.duplicate, true);
  assert.strictEqual(returnHarness.state.returns.length, 1);
  assert.strictEqual(returnHarness.state.returnItems.length, 0);
  assert.strictEqual(item.returnedQty, 1);
  assert.strictEqual(bill.returnedAmount, 10);
  assert.strictEqual(returnHarness.state.product.quantity, 6);
  assert.strictEqual(returnHarness.state.movements.length, 0);
  assert.strictEqual(returnHarness.state.transactions[0].finished, "commit");
  console.log("Duplicate checkout and return request tests passed.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
