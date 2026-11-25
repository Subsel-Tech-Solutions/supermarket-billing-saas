const assert = require("assert");
const { createHarness } = require("./helpers/billingControllerHarness");

const run = async () => {
  const missingKeyHarness = createHarness();
  missingKeyHarness.req.body = {
    items: [{ productId: 7, quantity: 2 }],
    paymentMethod: "cash",
  };
  await assert.rejects(
    () => missingKeyHarness.invoke(missingKeyHarness.controller.createBill),
    (error) => error.statusCode === 400 && error.code === "IDEMPOTENCY_KEY_REQUIRED",
  );
  assert.strictEqual(missingKeyHarness.state.transactions.length, 0);

  const missingReturnKeyHarness = createHarness();
  missingReturnKeyHarness.req.params.id = 99;
  missingReturnKeyHarness.req.body = { items: [{ billItemId: 1, quantity: 1 }] };
  await assert.rejects(
    () => missingReturnKeyHarness.invoke(missingReturnKeyHarness.controller.returnBill),
    (error) => error.statusCode === 400 && error.code === "IDEMPOTENCY_KEY_REQUIRED",
  );
  assert.strictEqual(missingReturnKeyHarness.state.transactions.length, 0);

  const { controller, db, invoke, req, response, state } = createHarness({
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

  const findOne = db.Bill.findOne;
  let lookupCount = 0;
  db.Bill.findOne = async (options) => {
    lookupCount += 1;
    return lookupCount === 1 ? null : findOne(options);
  };
  db.Bill.create = async () => {
    const error = new Error("Duplicate client reference");
    error.name = "SequelizeUniqueConstraintError";
    throw error;
  };

  await invoke(controller.createBill);

  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.body.duplicate, true);
  assert.strictEqual(state.bills.length, 1);
  assert.strictEqual(state.product.quantity, 5);
  assert.strictEqual(state.billItems.length, 0);
  assert.strictEqual(state.movements.length, 0);
  assert.strictEqual(state.transactions.length, 1);
  assert.strictEqual(state.transactions[0].finished, "rollback");

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

  const concurrentItem = {
    id: 31,
    productId: 7,
    productName: "Rice",
    quantity: 1,
    returnedQty: 0,
    totalPrice: 1000,
    save: async function save() { return this; },
  };
  const concurrentBill = {
    id: 32,
    billNumber: "INV-000032",
    customerId: null,
    totalAmount: 1000,
    paidAmount: 1000,
    dueAmount: 0,
    returnedAmount: 0,
    status: "completed",
    items: [concurrentItem],
    save: async function save() { return this; },
  };
  const concurrentHarness = createHarness({
    bill: concurrentBill,
    product: { id: 7, name: "Rice", quantity: 0, save: async function save() { return this; } },
  });
  const makeResponse = () => ({
    statusCode: 200,
    body: null,
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; },
  });
  const submitSameReturn = () => {
    const request = {
      ...concurrentHarness.req,
      params: { id: concurrentBill.id },
      body: { clientRef: "return-submit-10-times", items: [{ billItemId: concurrentItem.id, quantity: 0.5 }] },
    };
    return concurrentHarness.invoke(concurrentHarness.controller.returnBill, request, makeResponse());
  };
  const simultaneousResponses = await Promise.all(Array.from({ length: 10 }, submitSameReturn));
  assert.strictEqual(simultaneousResponses.filter((r) => r.statusCode === 201).length, 1);
  assert.strictEqual(simultaneousResponses.filter((r) => r.body.duplicate).length, 9);
  assert.strictEqual(concurrentHarness.state.returns.length, 1);
  assert.strictEqual(concurrentHarness.state.returnItems.length, 1);
  assert.strictEqual(concurrentItem.returnedQty, 0.5);
  assert.strictEqual(concurrentBill.returnedAmount, 500);
  assert.strictEqual(concurrentHarness.state.product.quantity, 0.5);
  assert.strictEqual(concurrentHarness.state.movements.length, 1);
  assert.strictEqual(concurrentHarness.state.movements[0].quantity, 0.5);
  assert.strictEqual(concurrentHarness.state.transactions.length, 10);
  assert(concurrentHarness.state.transactions.every((transaction) => transaction.finished === "commit"));

  const fractionalItem = {
    id: 36,
    productId: 7,
    productName: "Rice",
    quantity: 3,
    returnedQty: 0,
    totalPrice: 1000,
    save: async function save() { return this; },
  };
  const fractionalBill = {
    id: 37,
    billNumber: "INV-000037",
    customerId: null,
    totalAmount: 1000,
    paidAmount: 1000,
    dueAmount: 0,
    returnedAmount: 0,
    status: "completed",
    items: [fractionalItem],
    save: async function save() { return this; },
  };
  const fractionalHarness = createHarness({ bill: fractionalBill });
  const partialRefundAmounts = [];
  for (let index = 0; index < 3; index += 1) {
    fractionalHarness.req.params.id = fractionalBill.id;
    fractionalHarness.req.body = {
      clientRef: `fractional-return-${index}`,
      items: [{ billItemId: fractionalItem.id, quantity: 1, restock: false }],
    };
    const partialResponse = await fractionalHarness.invoke(fractionalHarness.controller.returnBill);
    partialRefundAmounts.push(partialResponse.body.data.amount);
  }
  assert.deepStrictEqual(partialRefundAmounts, [333.33, 333.34, 333.33]);
  assert.strictEqual(partialRefundAmounts.reduce((sum, amount) => sum + amount, 0), 1000);
  assert.strictEqual(fractionalItem.returnedQty, 3);
  assert.strictEqual(fractionalBill.returnedAmount, 1000);
  assert.strictEqual(fractionalBill.status, "returned");

  const roundingItems = [
    { id: 41, productId: 8, productName: "Tea", quantity: 1, returnedQty: 0, totalPrice: 500, save: async function save() { return this; } },
    { id: 42, productId: 9, productName: "Coffee", quantity: 1, returnedQty: 0, totalPrice: 500, save: async function save() { return this; } },
  ];
  const roundedBill = {
    id: 43,
    billNumber: "INV-000043",
    customerId: null,
    totalAmount: 999.99,
    paidAmount: 999.99,
    dueAmount: 0,
    returnedAmount: 0,
    status: "completed",
    items: roundingItems,
    save: async function save() { return this; },
  };
  const remainingLimitHarness = createHarness({ bill: roundedBill });
  remainingLimitHarness.req.params.id = roundedBill.id;
  remainingLimitHarness.req.body = {
    clientRef: "return-rounding-first",
    items: [{ billItemId: roundingItems[0].id, quantity: 1, restock: false }],
  };
  await remainingLimitHarness.invoke(remainingLimitHarness.controller.returnBill);
  remainingLimitHarness.req.body = {
    clientRef: "return-rounding-over-limit",
    items: [{ billItemId: roundingItems[1].id, quantity: 1, restock: false }],
  };
  await assert.rejects(
    () => remainingLimitHarness.invoke(remainingLimitHarness.controller.returnBill),
    (error) => error.statusCode === 400 && error.code === "REFUND_LIMIT",
  );
  assert.strictEqual(roundedBill.returnedAmount, 500);
  assert.strictEqual(roundingItems[1].returnedQty, 0);
  assert.strictEqual(remainingLimitHarness.state.returns.length, 1);

  const underpaidItem = {
    id: 51,
    productId: 10,
    productName: "Sugar",
    quantity: 1,
    returnedQty: 0,
    totalPrice: 1000,
    save: async function save() { return this; },
  };
  const underpaidBill = {
    id: 52,
    billNumber: "INV-000052",
    customerId: null,
    totalAmount: 1000,
    paidAmount: 400,
    dueAmount: 600,
    returnedAmount: 0,
    status: "completed",
    items: [underpaidItem],
    save: async function save() { return this; },
  };
  const collectedLimitHarness = createHarness({ bill: underpaidBill });
  collectedLimitHarness.req.params.id = underpaidBill.id;
  collectedLimitHarness.req.body = {
    clientRef: "return-over-collected",
    refundMethod: "card",
    items: [{ billItemId: underpaidItem.id, quantity: 0.5, restock: false }],
  };
  await assert.rejects(
    () => collectedLimitHarness.invoke(collectedLimitHarness.controller.returnBill),
    (error) => error.statusCode === 400 && error.code === "REFUND_EXCEEDS_COLLECTED",
  );
  assert.strictEqual(underpaidItem.returnedQty, 0);
  assert.strictEqual(underpaidBill.returnedAmount, 0);
  assert.strictEqual(collectedLimitHarness.state.returns.length, 0);

  const adjustDueItem = {
    id: 61,
    productId: 11,
    productName: "Milk",
    quantity: 1,
    returnedQty: 0,
    totalPrice: 1000,
    save: async function save() { return this; },
  };
  const adjustDueBill = {
    id: 62,
    billNumber: "INV-000062",
    customerId: 5,
    totalAmount: 1000,
    paidAmount: 900,
    dueAmount: 100,
    returnedAmount: 0,
    status: "completed",
    items: [adjustDueItem],
    save: async function save() { return this; },
  };
  const adjustDueHarness = createHarness({ bill: adjustDueBill });
  adjustDueHarness.req.params.id = adjustDueBill.id;
  adjustDueHarness.req.body = {
    clientRef: "return-over-due-balance",
    refundMethod: "adjust_due",
    items: [{ billItemId: adjustDueItem.id, quantity: 0.2, restock: false }],
  };
  await assert.rejects(
    () => adjustDueHarness.invoke(adjustDueHarness.controller.returnBill),
    (error) => error.statusCode === 400 && error.code === "REFUND_DUE_LIMIT",
  );
  assert.strictEqual(adjustDueItem.returnedQty, 0);
  assert.strictEqual(adjustDueBill.returnedAmount, 0);
  assert.strictEqual(adjustDueHarness.state.returns.length, 0);

  for (const status of ["cancelled", "returned"]) {
    const closedItem = {
      id: status === "cancelled" ? 71 : 81,
      productId: 12,
      productName: "Flour",
      quantity: 1,
      returnedQty: status === "returned" ? 1 : 0,
      totalPrice: 1000,
      save: async function save() { return this; },
    };
    const closedBill = {
      id: status === "cancelled" ? 72 : 82,
      billNumber: `INV-${status}`,
      customerId: null,
      totalAmount: 1000,
      paidAmount: 1000,
      dueAmount: 0,
      returnedAmount: status === "returned" ? 1000 : 0,
      status,
      items: [closedItem],
      save: async function save() { return this; },
    };
    const closedHarness = createHarness({ bill: closedBill });
    closedHarness.req.params.id = closedBill.id;
    closedHarness.req.body = {
      clientRef: `return-closed-${status}`,
      items: [{ billItemId: closedItem.id, quantity: 0.1, restock: false }],
    };
    await assert.rejects(
      () => closedHarness.invoke(closedHarness.controller.returnBill),
      (error) => error.statusCode === 400,
    );
    assert.strictEqual(closedHarness.state.returns.length, 0);
    assert.strictEqual(closedHarness.state.returnItems.length, 0);
    assert.strictEqual(closedHarness.state.transactions[0].finished, "rollback");
  }
  console.log("Duplicate checkout and return request tests passed.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
