const assert = require("assert");
const { calculateBill, settlePayments, assertRefundWithinCollected } = require("../utils/billMath");
const S = { defaultPaymentMethod: "cash" };
// Most tests below are plain tendered payments; acceptDue lets a short payment become credit.
const DUE_OK = (extra = {}) => ({ acceptDue: true, ...extra });

let passed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed += 1;
  } catch (err) {
    console.error(`\n✗ ${name}\n  ${err.message}\n`);
    process.exitCode = 1;
  }
};

// ─── calculateBill ──────────────────────────────────────────────────────────
check("GST inclusive, two lines, no discounts", () => {
  const c = calculateBill([{ price: 118, quantity: 1, taxRate: 18 }, { price: 50, quantity: 2, taxRate: 0 }], {
    pricesIncludeTax: true,
    taxEnabled: true,
    roundOff: true,
  });
  assert.equal(c.subtotal, 218);
  assert.equal(c.taxAmount, 18);
  assert.equal(c.taxableAmount, 200);
  assert.equal(c.totalAmount, 218);
  assert.equal(c.cgst + c.sgst, 18);
  assert.equal(c.igst, 0);
});

check("GST exclusive", () => {
  const c = calculateBill([{ price: 100, quantity: 3, taxRate: 5 }], { pricesIncludeTax: false, roundOff: false });
  assert.equal(c.taxAmount, 15);
  assert.equal(c.totalAmount, 315);
});

check("bill discount spread proportionally, GST stays correct", () => {
  const c = calculateBill([{ price: 100, quantity: 1, taxRate: 12 }, { price: 300, quantity: 1, taxRate: 5 }], {
    billDiscount: 40,
    pricesIncludeTax: true,
    roundOff: false,
  });
  assert.equal(c.totalAmount, 360);
  assert.equal(c.billDiscount, 40);
  assert.equal(c.lines[0].finalNet, 90);
  assert.equal(c.lines[1].finalNet, 270);
});

check("discount cannot exceed the bill, loyalty capped to what is left", () => {
  const c = calculateBill([{ price: 10, quantity: 1 }], { billDiscount: 8, loyaltyDiscount: 50, roundOff: false });
  assert.equal(c.totalAmount, 0);
  assert.equal(c.loyaltyDiscount, 2);
});

check("decimal quantity with round-off", () => {
  const c = calculateBill([{ price: 64.5, quantity: 1.25, taxRate: 0 }], { roundOff: true });
  assert.equal(c.subtotal, 80.63);
  assert.equal(c.totalAmount, 81);
  assert.equal(c.roundOff, 0.37);
});

check("item-level discount", () => {
  const c = calculateBill([{ price: 50, quantity: 4, discount: 20 }], { roundOff: false });
  assert.equal(c.itemDiscount, 20);
  assert.equal(c.totalAmount, 180);
});

check("inter-state bill puts the whole tax in IGST", () => {
  const c = calculateBill([{ price: 118, quantity: 1, taxRate: 18 }], {
    pricesIncludeTax: true,
    taxEnabled: true,
    roundOff: false,
    interState: true,
  });
  assert.equal(c.igst, 18);
  assert.equal(c.cgst, 0);
  assert.equal(c.sgst, 0);
  assert.equal(c.interState, true);
  assert.equal(c.taxAmount, 18);
});

check("tax disabled → no tax anywhere", () => {
  const c = calculateBill([{ price: 118, quantity: 1, taxRate: 18 }], { taxEnabled: false, roundOff: false });
  assert.equal(c.taxAmount, 0);
  assert.equal(c.taxableAmount, 118);
  assert.equal(c.totalAmount, 118);
});

// The old allocator clamped each line's share to that line's own net, so a discount
// bigger than the last line's value was silently swallowed and the customer was
// overcharged. The shortfall now moves to the lines that still have room.
check("whole bill discount is given out even when the last line is tiny", () => {
  const c = calculateBill([{ price: 500, quantity: 1, taxRate: 0 }, { price: 2, quantity: 1, taxRate: 0 }], {
    billDiscount: 100,
    roundOff: false,
  });
  assert.equal(c.billDiscount, 100);
  assert.equal(c.totalAmount, 402, "500 + 2 − 100 must be 402");
  const paidOut = c.lines.reduce((a, l) => a + l.finalNet, 0);
  assert.equal(Math.round(paidOut * 100) / 100, 402);
});

check("discount of the entire bill value lands on zero", () => {
  const c = calculateBill([{ price: 120, quantity: 1, taxRate: 18 }, { price: 1, quantity: 1, taxRate: 5 }], {
    billDiscount: 121,
    roundOff: false,
  });
  assert.equal(c.totalAmount, 0);
  assert.equal(c.taxAmount, 0);
});

check("empty cart does not throw", () => {
  const c = calculateBill([], { roundOff: true });
  assert.equal(c.totalAmount, 0);
  assert.equal(c.subtotal, 0);
});

check("per-line tax sums to the bill tax (no rounding drift)", () => {
  const lines = Array.from({ length: 17 }, (_, i) => ({ price: 33.33 + i, quantity: 3, taxRate: 18 }));
  const c = calculateBill(lines, { pricesIncludeTax: true, roundOff: true });
  const lineTax = Math.round(c.lines.reduce((a, l) => a + l.tax, 0) * 100) / 100;
  assert.equal(lineTax, c.taxAmount);
  const lineTotals = Math.round(c.lines.reduce((a, l) => a + l.total, 0) * 100) / 100;
  assert.equal(Math.round((lineTotals + c.roundOff) * 100) / 100, c.totalAmount);
});

// ─── settlePayments ─────────────────────────────────────────────────────────
check("single method pays the bill in full", () => {
  const p = settlePayments(180, { paymentMethod: "upi" }, S);
  assert.deepEqual([p.paid, p.due, p.method], [180, 0, "upi"]);
});

check("cash over the total returns change, not a credit", () => {
  const p = settlePayments(180, { payments: [{ method: "cash", amount: 200 }] }, S);
  assert.deepEqual([p.paid, p.change, p.due], [180, 20, 0]);
});

check("split payment with an accepted shortfall becomes credit", () => {
  const p = settlePayments(180, DUE_OK({ payments: [{ method: "cash", amount: 100 }, { method: "upi", amount: 50 }] }), S);
  assert.deepEqual([p.paid, p.due, p.method], [150, 30, "split"]);
  assert.equal(p.payments.find((x) => x.method === "credit").amount, 30);
});

check("explicit credit sale", () => {
  const p = settlePayments(180, { paymentMethod: "credit" }, S);
  assert.deepEqual([p.paid, p.due, p.method], [0, 180, "credit"]);
});

check("only cash may exceed the bill amount", () => {
  assert.throws(() => settlePayments(100, { payments: [{ method: "upi", amount: 150 }] }, S), /Only cash/);
});

check("a credit line is dropped when other methods already cover the bill", () => {
  const p = settlePayments(100, { payments: [{ method: "upi", amount: 100 }, { method: "credit", amount: 30 }] }, S);
  assert.deepEqual([p.due, p.method], [0, "upi"]);
});

check("change is taken out of the cash line, totals still balance", () => {
  const p = settlePayments(180, { payments: [{ method: "upi", amount: 100 }, { method: "cash", amount: 100 }] }, S);
  assert.deepEqual([p.paid, p.change, p.due, p.method], [180, 20, 0, "split"]);
  assert.equal(p.payments.find((x) => x.method === "cash").amount, 80);
  assert.equal(p.payments.reduce((a, x) => a + x.amount, 0), 180);
});

check("large cash tender", () => {
  const q = settlePayments(180, { payments: [{ method: "cash", amount: 500 }] }, {});
  assert.equal(q.payments[0].amount, 180);
  assert.equal(q.change, 320);
});

// A mistyped tender used to be booked as udhaar without anyone noticing.
check("an unrequested shortfall is rejected instead of becoming silent udhaar", () => {
  assert.throws(
    () => settlePayments(500, { payments: [{ method: "cash", amount: 50 }] }, S),
    (err) => err.code === "SHORT_PAYMENT" && /Short by 450/.test(err.message),
  );
});

check("the same shortfall is accepted once the cashier confirms it", () => {
  const p = settlePayments(500, DUE_OK({ payments: [{ method: "cash", amount: 50 }] }), S);
  assert.equal(p.due, 450);
  assert.equal(p.paid, 50);
  assert.equal(p.payments.find((x) => x.method === "credit").amount, 450);
});

check("a credit line in the payload counts as asking for credit", () => {
  const p = settlePayments(500, { payments: [{ method: "cash", amount: 50 }, { method: "credit", amount: 450 }] }, S);
  assert.equal(p.due, 450);
});

// The credit figure the till sends is advisory: only the real remainder is a debt.
check("an overstated credit line is corrected to the real remainder", () => {
  const p = settlePayments(500, { payments: [{ method: "cash", amount: 400 }, { method: "credit", amount: 999 }] }, S);
  assert.equal(p.due, 100);
  assert.equal(p.payments.find((x) => x.method === "credit").amount, 100);
  assert.equal(p.payments.reduce((a, x) => a + x.amount, 0), 500);
});

check("unknown payment methods are ignored", () => {
  const p = settlePayments(100, { payments: [{ method: "crypto", amount: 100 }, { method: "cash", amount: 100 }] }, S);
  assert.equal(p.method, "cash");
  assert.equal(p.due, 0);
});

check("a zero-total bill settles cleanly", () => {
  const p = settlePayments(0, { paymentMethod: "cash" }, S);
  assert.equal(p.due, 0);
  assert.equal(p.change, 0);
});

check("refunds cannot exceed the amount collected", () => {
  assert.throws(
    () => assertRefundWithinCollected(100, 0, 100.01),
    (err) => err.statusCode === 400 && err.code === "REFUND_EXCEEDS_COLLECTED" && /available is 100\.00/.test(err.message),
  );
});

check("refund limit accounts for earlier payouts", () => {
  assert.throws(
    () => assertRefundWithinCollected(100, 60, 40.01),
    (err) => err.statusCode === 400 && err.code === "REFUND_EXCEEDS_COLLECTED" && /available is 40\.00/.test(err.message),
  );
  assert.doesNotThrow(() => assertRefundWithinCollected(100, 60, 40));
});

if (process.exitCode) console.error(`${passed} passed, some FAILED ✗`);
else console.log(`All ${passed} bill math tests passed ✔`);
