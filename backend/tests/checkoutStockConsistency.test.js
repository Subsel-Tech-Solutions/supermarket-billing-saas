const assert = require("assert");
const { createHarness } = require("./helpers/billingControllerHarness");

const run = async () => {
  const { controller, invoke, req, response, state } = createHarness({
    product: {
      id: 7,
      name: "Rice",
      barcode: "RICE-1",
      hsnCode: null,
      unit: "kg",
      mrp: 0,
      price: 10,
      costPrice: 6,
      quantity: 8,
      taxRate: 0,
      isActive: true,
      allowDecimal: false,
    },
  });
  req.body = {
    clientRef: "checkout-test-001",
    items: [{ productId: 7, quantity: 2 }],
    paymentMethod: "cash",
  };

  await invoke(controller.createBill);

  assert.strictEqual(response.statusCode, 201);
  assert.strictEqual(response.body.data.bill.clientRef, "checkout-test-001");
  assert.strictEqual(response.body.data.bill.totalAmount, 20);
  assert.strictEqual(state.product.quantity, 6);
  assert.strictEqual(state.billItems.length, 1);
  assert.strictEqual(state.billItems[0].quantity, 2);
  assert.strictEqual(state.movements.length, 1);
  assert.deepStrictEqual(
    { type: state.movements[0].type, quantity: state.movements[0].quantity, balanceAfter: state.movements[0].balanceAfter },
    { type: "sale", quantity: -2, balanceAfter: 6 },
  );
  assert.strictEqual(state.transactions[0].finished, "commit");

  req.body = {
    clientRef: "checkout-test-insufficient-stock",
    items: [{ productId: 7, quantity: 7 }],
    paymentMethod: "cash",
  };
  await assert.rejects(() => invoke(controller.createBill), (error) => error.statusCode === 400);
  assert.strictEqual(state.product.quantity, 6);
  assert.strictEqual(state.bills.length, 1);
  assert.strictEqual(state.movements.length, 1);
  assert.strictEqual(state.transactions[1].finished, "rollback");
  console.log("Checkout stock consistency tests passed.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
