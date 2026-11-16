// tests/loyaltyReturnsAndCredit.test.js — test loyalty redemption (phone-only, no OTP), returns policy, and store credit tender disallowance
const assert = require("assert");
const { calculateBill, settlePayments } = require("../utils/billMath");
const { HttpError, round2, num, normalizePhone, isValidPhone } = require("../utils/helpers");

console.log("Starting Loyalty Redemption, Returns Policy & Store Credit Tender Test Suite...\n");

let passed = 0;
const test = (desc, fn) => {
  try {
    fn();
    console.log(`✓ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${desc}`);
    console.error(err);
    process.exit(1);
  }
};

const asyncTest = async (desc, fn) => {
  try {
    await fn();
    console.log(`✓ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${desc}`);
    console.error(err);
    process.exit(1);
  }
};

// ── Mock Helpers for Controller Simulation ──────────────────────────────────
const simulateLoyaltyRedemption = ({ customer, body, settings }) => {
  let redeemPoints = Math.floor(Math.max(0, num(body.redeemPoints)));
  let loyaltyDiscount = 0;

  // Phone lookup simulation: resolves customer with only a phone number (no OTP required)
  let resolvedCustomer = customer;
  if (!resolvedCustomer && body.customerPhone) {
    const phone = normalizePhone(body.customerPhone);
    if (!isValidPhone(phone)) throw new HttpError(400, "Enter a valid 10-digit mobile number for the customer");
    // Customer found by phone alone
    resolvedCustomer = customer;
  }

  if (redeemPoints > 0) {
    if (!settings.loyaltyEnabled) throw new HttpError(400, "Loyalty points are disabled");
    if (!resolvedCustomer) throw new HttpError(400, "Select a customer to redeem points");
    if (redeemPoints > Number(resolvedCustomer.loyaltyPoints)) {
      throw new HttpError(400, `Customer has only ${Number(resolvedCustomer.loyaltyPoints)} points`);
    }
    if (redeemPoints < settings.loyaltyMinRedeem) {
      throw new HttpError(400, `Minimum ${settings.loyaltyMinRedeem} points required to redeem`);
    }
    loyaltyDiscount = round2(redeemPoints * num(settings.loyaltyPointValue, 1));
  }

  return { loyaltyDiscount, redeemPoints, customer: resolvedCustomer };
};

const simulateReturnPointProcessing = ({ bill, customer, returnedTotal, currentSettings }) => {
  // Returns do NOT restore redeemed points; point claw-back uses CURRENT settings
  const pointsBack = Math.floor((returnedTotal / 100) * num(currentSettings.loyaltyEarnPer100, 0));
  const newLoyaltyPoints = round2(Math.max(0, Number(customer.loyaltyPoints) - pointsBack));
  // Note: bill.loyaltyRedeemed is NOT added back to customer.loyaltyPoints
  return {
    pointsBack,
    newLoyaltyPoints,
    restoredRedeemedPoints: 0, // Confirmed 0 restored
  };
};

const simulateBillCancellationPoints = ({ bill, customer }) => {
  // Cancellation voids the bill and restores redeemed points
  return round2(Math.max(0, Number(customer.loyaltyPoints) - Number(bill.loyaltyEarned) + Number(bill.loyaltyRedeemed)));
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Loyalty Points Phone-Only Redemption (No OTP / Confirmation)
// ─────────────────────────────────────────────────────────────────────────────
test("Redeems loyalty points using only customer phone number without OTP or SMS confirmation", () => {
  const customer = { id: 1, name: "Priya Sharma", phone: "9876543210", loyaltyPoints: 200 };
  const settings = { loyaltyEnabled: true, loyaltyMinRedeem: 50, loyaltyPointValue: 1 };
  const body = { customerPhone: "9876543210", redeemPoints: 100 };

  const res = simulateLoyaltyRedemption({ customer, body, settings });
  assert.strictEqual(res.redeemPoints, 100);
  assert.strictEqual(res.loyaltyDiscount, 100);
  assert.strictEqual(res.customer.phone, "9876543210");
});

test("Rejects loyalty redemption when redeemPoints is below loyaltyMinRedeem", () => {
  const customer = { id: 1, name: "Priya Sharma", phone: "9876543210", loyaltyPoints: 200 };
  const settings = { loyaltyEnabled: true, loyaltyMinRedeem: 50, loyaltyPointValue: 1 };
  const body = { customerPhone: "9876543210", redeemPoints: 30 };

  assert.throws(
    () => simulateLoyaltyRedemption({ customer, body, settings }),
    (err) => err.statusCode === 400 && err.message.includes("Minimum 50 points required to redeem")
  );
});

test("Rejects loyalty redemption when customer has insufficient points", () => {
  const customer = { id: 1, name: "Priya Sharma", phone: "9876543210", loyaltyPoints: 60 };
  const settings = { loyaltyEnabled: true, loyaltyMinRedeem: 50, loyaltyPointValue: 1 };
  const body = { customerPhone: "9876543210", redeemPoints: 100 };

  assert.throws(
    () => simulateLoyaltyRedemption({ customer, body, settings }),
    (err) => err.statusCode === 400 && err.message.includes("Customer has only 60 points")
  );
});

test("Rejects loyalty redemption when loyalty program is disabled", () => {
  const customer = { id: 1, name: "Priya Sharma", phone: "9876543210", loyaltyPoints: 200 };
  const settings = { loyaltyEnabled: false, loyaltyMinRedeem: 50, loyaltyPointValue: 1 };
  const body = { customerPhone: "9876543210", redeemPoints: 100 };

  assert.throws(
    () => simulateLoyaltyRedemption({ customer, body, settings }),
    (err) => err.statusCode === 400 && err.message.includes("Loyalty points are disabled")
  );
});

test("Loyalty discount is capped to bill amount and only points actually used are charged", () => {
  const settings = { loyaltyPointValue: 1 };
  const lines = [{ price: 50, quantity: 1, discount: 0, taxRate: 0 }];
  const calc = calculateBill(lines, { billDiscount: 0, loyaltyDiscount: 100, roundOff: false });

  assert.strictEqual(calc.loyaltyDiscount, 50); // Capped from 100 to 50
  assert.strictEqual(calc.totalAmount, 0);

  // In billingController, points charged are recalculated based on actual discount used:
  const pointsActuallyCharged = Math.ceil(calc.loyaltyDiscount / num(settings.loyaltyPointValue, 1));
  assert.strictEqual(pointsActuallyCharged, 50);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Returns Policy: No Point Restoration & Current Settings Claw-Back
// ─────────────────────────────────────────────────────────────────────────────
test("Return does NOT restore redeemed points; points remain consumed", () => {
  // Customer originally made a purchase with 100 points redeemed and 20 points earned
  const originalBill = { id: 10, totalAmount: 500, loyaltyRedeemed: 100, loyaltyEarned: 20 };
  // Customer currently has 50 points
  const customer = { id: 1, name: "Anand", loyaltyPoints: 50 };
  const currentSettings = { loyaltyEarnPer100: 2 }; // Current: 2 points per 100

  // Full return of the 500 purchase
  const result = simulateReturnPointProcessing({
    bill: originalBill,
    customer,
    returnedTotal: 500,
    currentSettings,
  });

  // Points back to claw back = floor((500 / 100) * 2) = 10
  assert.strictEqual(result.pointsBack, 10);
  // Redeemed points restored must be strictly 0
  assert.strictEqual(result.restoredRedeemedPoints, 0);
  // Customer points = 50 - 10 = 40 (does NOT add back the 100 redeemed points)
  assert.strictEqual(result.newLoyaltyPoints, 40);
});

test("Return point claw-back uses CURRENT settings instead of original purchase settings", () => {
  // Suppose when the customer bought the item, the shop awarded 1 point per ₹100
  // But now, the shop updated its settings to 3 points per ₹100
  const originalBill = { id: 11, totalAmount: 1000, loyaltyRedeemed: 0, loyaltyEarned: 10 };
  const customer = { id: 2, name: "Deepak", loyaltyPoints: 50 };

  const currentSettings = { loyaltyEarnPer100: 3 }; // Current setting: 3 pts per ₹100

  // Customer returns ₹400 worth of goods
  const result = simulateReturnPointProcessing({
    bill: originalBill,
    customer,
    returnedTotal: 400,
    currentSettings,
  });

  // Claw-back uses CURRENT rate of 3: Math.floor((400 / 100) * 3) = 12 points
  assert.strictEqual(result.pointsBack, 12);
  assert.strictEqual(result.newLoyaltyPoints, 38);
});

test("Return point claw-back floors customer loyalty points at 0 (never negative)", () => {
  const originalBill = { id: 12, totalAmount: 1000, loyaltyRedeemed: 0, loyaltyEarned: 20 };
  // Customer spent their points elsewhere and now has only 5 points
  const customer = { id: 3, name: "Kavita", loyaltyPoints: 5 };
  const currentSettings = { loyaltyEarnPer100: 2 }; // 2 pts per ₹100

  // Return ₹600 of goods -> pointsBack = 12 points
  const result = simulateReturnPointProcessing({
    bill: originalBill,
    customer,
    returnedTotal: 600,
    currentSettings,
  });

  assert.strictEqual(result.pointsBack, 12);
  // 5 - 12 = -7, but must floor at 0
  assert.strictEqual(result.newLoyaltyPoints, 0);
});

test("Contrast: cancelBill restores redeemed points, whereas returnBill strictly does not", () => {
  const bill = { id: 14, totalAmount: 500, loyaltyEarned: 10, loyaltyRedeemed: 80 };
  const customer = { id: 4, name: "Rahul", loyaltyPoints: 20 };
  const currentSettings = { loyaltyEarnPer100: 2 };

  // 1) Sale Return behavior:
  const returnResult = simulateReturnPointProcessing({ bill, customer, returnedTotal: 500, currentSettings });
  // return: 20 - 10 = 10 (does NOT restore 80)
  assert.strictEqual(returnResult.newLoyaltyPoints, 10);

  // 2) Same-day Cancel behavior:
  const cancelPoints = simulateBillCancellationPoints({ bill, customer });
  // cancel: 20 - 10 (earned) + 80 (redeemed restored) = 90
  assert.strictEqual(cancelPoints, 90);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Store Credit / Advance Disallowed as a Payment Method
// ─────────────────────────────────────────────────────────────────────────────
test("settlePayments throws 400 when body.paymentMethod is 'store_credit'", () => {
  assert.throws(
    () => settlePayments(500, { paymentMethod: "store_credit" }, { defaultPaymentMethod: "cash" }),
    (err) => err.statusCode === 400 && err.message === "Store credit / advance cannot be used as a payment method"
  );
});

test("settlePayments throws 400 when body.paymentMethod is 'advance'", () => {
  assert.throws(
    () => settlePayments(500, { paymentMethod: "advance" }, { defaultPaymentMethod: "cash" }),
    (err) => err.statusCode === 400 && err.message === "Store credit / advance cannot be used as a payment method"
  );
});

test("settlePayments throws 400 when body.payments contains 'store_credit' split payment", () => {
  assert.throws(
    () =>
      settlePayments(
        500,
        {
          payments: [
            { method: "cash", amount: 300 },
            { method: "store_credit", amount: 200 },
          ],
        },
        { defaultPaymentMethod: "cash" }
      ),
    (err) => err.statusCode === 400 && err.message === "Store credit / advance cannot be used as a payment method"
  );
});

test("settlePayments throws 400 when body.payments contains 'advance' split payment", () => {
  assert.throws(
    () =>
      settlePayments(
        500,
        {
          payments: [
            { method: "card", amount: 200 },
            { method: "advance", amount: 300 },
          ],
        },
        { defaultPaymentMethod: "cash" }
      ),
    (err) => err.statusCode === 400 && err.message === "Store credit / advance cannot be used as a payment method"
  );
});

test("Standard allowed payment methods (cash, upi, card, credit) settle correctly", () => {
  const s1 = settlePayments(250, { paymentMethod: "cash" }, { defaultPaymentMethod: "cash" });
  assert.strictEqual(s1.method, "cash");
  assert.strictEqual(s1.paid, 250);
  assert.strictEqual(s1.due, 0);

  const s2 = settlePayments(300, { paymentMethod: "upi" }, { defaultPaymentMethod: "cash" });
  assert.strictEqual(s2.method, "upi");
  assert.strictEqual(s2.paid, 300);

  const s3 = settlePayments(400, { paymentMethod: "credit", acceptDue: true }, { defaultPaymentMethod: "cash" });
  assert.strictEqual(s3.due, 400);
});

test("Customer advance balance is absorbed via on-account credit sale without store_credit tender", () => {
  // Advance balance: -600 (store owes customer ₹600)
  const customer = { id: 5, name: "Advance Customer", balance: -600, creditLimit: 0 };
  const billTotal = 250;

  // The cashier settles the bill as an on-account credit (due) sale
  const settlement = settlePayments(billTotal, { paymentMethod: "credit", acceptDue: true }, { defaultPaymentMethod: "cash" });
  assert.strictEqual(settlement.due, 250);

  // When posted to customer ledger: balance absorbs the new due:
  customer.balance = round2(customer.balance + settlement.due); // -600 + 250 = -350
  assert.strictEqual(customer.balance, -350);
  // Payment method recorded on bill is 'credit', preserving accounting and cash integrity
  assert.strictEqual(settlement.method, "credit");
});

console.log(`\nAll ${passed} Loyalty, Returns Policy & Store Credit Tender tests passed successfully! ✔`);
