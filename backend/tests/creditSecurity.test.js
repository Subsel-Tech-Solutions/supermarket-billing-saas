// tests/creditSecurity.test.js — test credit limit role security & zero-credit enforcement
const assert = require("assert");
const { HttpError, round2, num } = require("../utils/helpers");

console.log("Starting Credit Limit Security & Fraud Test Suite...\n");

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

// ── Mock Helpers for Controller Testing ──────────────────────────────────────
const parseCreditLimit = (raw) => {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "" || raw === "unlimited") return null;
  return round2(Math.max(0, num(raw)));
};

const customerFields = (b, isCashier = false, existingCustomer = null) => {
  let creditLimit = existingCustomer ? existingCustomer.creditLimit : 0;
  if (!isCashier && b.creditLimit !== undefined) {
    creditLimit = parseCreditLimit(b.creditLimit);
  }
  return {
    name: b.name || "Customer",
    phone: b.phone || null,
    creditLimit,
  };
};

const simulateCreateCustomer = (body, user) => {
  const isCashier = user.role === "cashier" && !user.isSuperAdmin;
  if (isCashier && body && body.creditLimit !== undefined && body.creditLimit !== null && String(body.creditLimit).trim() !== "") {
    const rawVal = body.creditLimit;
    if (rawVal === "unlimited" || num(rawVal) > 0) {
      throw new HttpError(403, "Cashiers are not allowed to assign customer credit limits");
    }
  }
  return customerFields(body || {}, isCashier);
};

const simulateUpdateCustomer = (customer, body, user) => {
  const isCashier = user.role === "cashier" && !user.isSuperAdmin;
  if (isCashier && body && body.creditLimit !== undefined) {
    const requested = parseCreditLimit(body.creditLimit);
    const current = customer.creditLimit === null ? null : round2(num(customer.creditLimit));
    if (requested !== current) {
      throw new HttpError(403, "Cashiers are not allowed to change customer credit limits");
    }
  }
  return customerFields({ ...customer, ...(body || {}) }, isCashier, customer);
};

const simulateCreditLimitCheck = (customer, payDue) => {
  if (!customer) return;
  const hasExplicitLimit = customer.creditLimit !== null && customer.creditLimit !== undefined;
  if (hasExplicitLimit) {
    const limit = round2(num(customer.creditLimit));
    const currentDue = round2(num(customer.balance));
    const newTotalDue = round2(currentDue + payDue);

    if (limit <= 0) {
      if (newTotalDue > 0) {
        throw new HttpError(
          400,
          `Credit sales are not allowed for ${customer.name} (Credit limit is ₹0.00). Only store owners and managers can grant credit limits.`,
          "CREDIT_NOT_ALLOWED",
        );
      }
    } else if (newTotalDue > limit) {
      const room = round2(Math.max(0, limit - currentDue));
      throw new HttpError(
        400,
        `Credit limit exceeded for ${customer.name}. Limit ${limit.toFixed(2)}, already due ${currentDue.toFixed(2)} — only ${room.toFixed(2)} more can go on account.`,
        "CREDIT_LIMIT",
      );
    }
  }
};

// ── 1. Cashier Role Security Tests ───────────────────────────────────────────
test("Cashier cannot assign positive credit limit on customer creation", () => {
  const cashierUser = { role: "cashier", isSuperAdmin: false };
  assert.throws(() => {
    simulateCreateCustomer({ name: "Rajesh", phone: "9876543210", creditLimit: 5000 }, cashierUser);
  }, (err) => err.statusCode === 403 && err.message.includes("Cashiers are not allowed to assign customer credit limits"));
});

test("Cashier cannot assign unlimited credit limit on customer creation", () => {
  const cashierUser = { role: "cashier", isSuperAdmin: false };
  assert.throws(() => {
    simulateCreateCustomer({ name: "Rajesh", phone: "9876543210", creditLimit: "unlimited" }, cashierUser);
  }, (err) => err.statusCode === 403);
});

test("Cashier creating customer with 0 or omitted credit limit succeeds with creditLimit: 0", () => {
  const cashierUser = { role: "cashier", isSuperAdmin: false };
  const res1 = simulateCreateCustomer({ name: "Rajesh", phone: "9876543210" }, cashierUser);
  assert.strictEqual(res1.creditLimit, 0);

  const res2 = simulateCreateCustomer({ name: "Rajesh", phone: "9876543210", creditLimit: 0 }, cashierUser);
  assert.strictEqual(res2.creditLimit, 0);
});

test("Cashier cannot modify customer credit limit on update", () => {
  const cashierUser = { role: "cashier", isSuperAdmin: false };
  const existingCustomer = { id: 10, name: "Suresh", phone: "9876543210", creditLimit: 0, balance: 0 };

  assert.throws(() => {
    simulateUpdateCustomer(existingCustomer, { creditLimit: 10000 }, cashierUser);
  }, (err) => err.statusCode === 403 && err.message.includes("Cashiers are not allowed to change customer credit limits"));
});

test("Cashier updating customer contact info preserves creditLimit unchanged", () => {
  const cashierUser = { role: "cashier", isSuperAdmin: false };
  const existingCustomer = { id: 10, name: "Suresh", phone: "9876543210", creditLimit: 2500, balance: 500 };

  const updated = simulateUpdateCustomer(existingCustomer, { name: "Suresh Kumar", address: "Sector 4" }, cashierUser);
  assert.strictEqual(updated.name, "Suresh Kumar");
  assert.strictEqual(updated.creditLimit, 2500);
});

test("Owner / manager can set and update customer credit limits", () => {
  const ownerUser = { role: "owner", isSuperAdmin: false };
  const created = simulateCreateCustomer({ name: "VIP Customer", creditLimit: 50000 }, ownerUser);
  assert.strictEqual(created.creditLimit, 50000);

  const existingCustomer = { id: 12, name: "VIP Customer", creditLimit: 50000, balance: 10000 };
  const updated = simulateUpdateCustomer(existingCustomer, { creditLimit: 100000 }, ownerUser);
  assert.strictEqual(updated.creditLimit, 100000);

  const setUnlimited = simulateUpdateCustomer(existingCustomer, { creditLimit: "unlimited" }, ownerUser);
  assert.strictEqual(setUnlimited.creditLimit, null);
});

// ── 2. Zero Credit Limit Enforcement Tests ──────────────────────────────────
test("Customer with creditLimit = 0 cannot buy on credit (CREDIT_NOT_ALLOWED)", () => {
  const customer = { name: "Walk-in", creditLimit: 0, balance: 0 };
  assert.throws(() => {
    simulateCreditLimitCheck(customer, 450);
  }, (err) => err.statusCode === 400 && err.code === "CREDIT_NOT_ALLOWED");
});

test("Customer with creditLimit = 0 can use up pre-existing advance balance", () => {
  // Advance deposit: balance is -1000 (store owes customer ₹1000)
  const customer = { name: "Advance Customer", creditLimit: 0, balance: -1000 };
  // Due of 400: new total due is -1000 + 400 = -600 (still within advance)
  assert.doesNotThrow(() => {
    simulateCreditLimitCheck(customer, 400);
  });
});

test("Customer with creditLimit = 0 exceeds advance balance throws CREDIT_NOT_ALLOWED", () => {
  const customer = { name: "Advance Customer", creditLimit: 0, balance: -1000 };
  // Due of 1200: new total due is -1000 + 1200 = +200 (exceeds advance into positive debt)
  assert.throws(() => {
    simulateCreditLimitCheck(customer, 1200);
  }, (err) => err.statusCode === 400 && err.code === "CREDIT_NOT_ALLOWED");
});

// ── 3. Positive Credit Limit Enforcement Tests ──────────────────────────────
test("Customer with positive credit limit allows due sales within limit", () => {
  const customer = { name: "Regular", creditLimit: 5000, balance: 1200 };
  assert.doesNotThrow(() => {
    simulateCreditLimitCheck(customer, 2500); // 1200 + 2500 = 3700 <= 5000
  });
});

test("Customer with positive credit limit blocks sale exceeding limit (CREDIT_LIMIT)", () => {
  const customer = { name: "Regular", creditLimit: 5000, balance: 4000 };
  assert.throws(() => {
    simulateCreditLimitCheck(customer, 1500); // 4000 + 1500 = 5500 > 5000
  }, (err) => err.statusCode === 400 && err.code === "CREDIT_LIMIT" && err.message.includes("only 1000.00 more can go on account"));
});

// ── 4. Explicit Unlimited Credit Tests ──────────────────────────────────────
test("Customer with creditLimit = null allows credit without limit", () => {
  const customer = { name: "Enterprise VIP", creditLimit: null, balance: 150000 };
  assert.doesNotThrow(() => {
    simulateCreditLimitCheck(customer, 80000);
  });
});

console.log(`\nAll ${passed} Credit Limit Security tests passed successfully! ✔`);
