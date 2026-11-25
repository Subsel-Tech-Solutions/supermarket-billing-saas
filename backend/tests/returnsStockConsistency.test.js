const assert = require("assert");
const { createHarness } = require("./helpers/billingControllerHarness");

const run = async () => {
  const item = {
    id: 21,
    productId: 7,
    productName: "Rice",
    quantity: 2,
    returnedQty: 0,
    totalPrice: 20,
    save: async function save() {
      return this;
    },
  };
  const bill = {
    id: 12,
    billNumber: "INV-000012",
    customerId: null,
    totalAmount: 20,
    paidAmount: 20,
    dueAmount: 0,
    returnedAmount: 0,
    status: "completed",
    items: [item],
    save: async function save() {
      return this;
    },
  };
  const { controller, invoke, req, response, state } = createHarness({
    bill,
    product: { id: 7, name: "Rice", quantity: 5, save: async function save() { return this; } },
  });
  req.params.id = bill.id;
  req.body = { clientRef: "return-test-001", items: [{ billItemId: item.id, quantity: 1 }] };

  await invoke(controller.returnBill);

  assert.strictEqual(response.statusCode, 201);
  assert.strictEqual(response.body.data.amount, 10);
  assert.strictEqual(state.returns.length, 1);
  assert.strictEqual(state.returnItems.length, 1);
  assert.strictEqual(item.returnedQty, 1);
  assert.strictEqual(bill.returnedAmount, 10);
  assert.strictEqual(bill.status, "partially_returned");
  assert.strictEqual(state.product.quantity, 6);
  assert.deepStrictEqual(
    { type: state.movements[0].type, quantity: state.movements[0].quantity, balanceAfter: state.movements[0].balanceAfter },
    { type: "return", quantity: 1, balanceAfter: 6 },
  );
  assert.strictEqual(state.transactions[0].finished, "commit");

  req.body = { clientRef: "return-test-too-many", items: [{ billItemId: item.id, quantity: 2 }] };
  await assert.rejects(() => invoke(controller.returnBill), (error) => error.statusCode === 400);
  assert.strictEqual(item.returnedQty, 1);
  assert.strictEqual(bill.returnedAmount, 10);
  assert.strictEqual(state.product.quantity, 6);
  assert.strictEqual(state.returns.length, 1);
  assert.strictEqual(state.movements.length, 1);
  assert.strictEqual(state.transactions[1].finished, "rollback");
  console.log("Return stock consistency tests passed.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
