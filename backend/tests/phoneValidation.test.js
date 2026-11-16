// tests/phoneValidation.test.js — test phone normalization and validation
const assert = require("assert");
const { normalizePhone, isValidPhone, HttpError } = require("../utils/helpers");

console.log("Starting Customer Phone Validation Test Suite...\n");

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

// ── 1. Phone Normalization Unit Tests ────────────────────────────────────────
test("Normalizes standard 10-digit number as-is", () => {
  assert.strictEqual(normalizePhone("9876543210"), "9876543210");
});

test("Strips spaces, dashes, dots, parentheses, and plus sign", () => {
  assert.strictEqual(normalizePhone("+91 98765-43210"), "9876543210");
  assert.strictEqual(normalizePhone("(987) 654-3210"), "9876543210");
  assert.strictEqual(normalizePhone("98765.43210"), "9876543210");
  assert.strictEqual(normalizePhone(" +91  98765  43210 "), "9876543210");
});

test("Strips leading zero on 11-digit numbers", () => {
  assert.strictEqual(normalizePhone("09876543210"), "9876543210");
  assert.strictEqual(normalizePhone("0-98765-43210"), "9876543210");
});

test("Strips leading '91' on 12-digit numbers", () => {
  assert.strictEqual(normalizePhone("919876543210"), "9876543210");
  assert.strictEqual(normalizePhone("+919876543210"), "9876543210");
});

test("Handles international numbers (up to 15 digits ITU-T E.164)", () => {
  assert.strictEqual(normalizePhone("+1 (415) 555-2671"), "14155552671");
  assert.strictEqual(normalizePhone("+44 20 7946 0991"), "442079460991");
});

test("Returns null for empty, undefined, null, or non-digit input", () => {
  assert.strictEqual(normalizePhone(""), null);
  assert.strictEqual(normalizePhone(null), null);
  assert.strictEqual(normalizePhone(undefined), null);
  assert.strictEqual(normalizePhone("   "), null);
  assert.strictEqual(normalizePhone("abc-xyz"), null);
  assert.strictEqual(normalizePhone("++--()"), null);
});

// ── 2. Phone Validation Unit Tests ──────────────────────────────────────────
test("Validates standard 10-digit Indian mobile prefixes (6, 7, 8, 9)", () => {
  assert.strictEqual(isValidPhone("9876543210"), true);
  assert.strictEqual(isValidPhone("8123456789"), true);
  assert.strictEqual(isValidPhone("7012345678"), true);
  assert.strictEqual(isValidPhone("6234567890"), true);
});

test("Validates raw formatted phone numbers", () => {
  assert.strictEqual(isValidPhone("+91 98765 43210"), true);
  assert.strictEqual(isValidPhone("098765-43210"), true);
  assert.strictEqual(isValidPhone("+91-98765-43210"), true);
});

test("Validates international numbers between 10 and 15 digits", () => {
  assert.strictEqual(isValidPhone("+1 415 555 2671"), true);
  assert.strictEqual(isValidPhone("+44 20 7946 0991"), true);
});

test("Rejects invalid numbers (too short, too long, non-mobile prefix)", () => {
  assert.strictEqual(isValidPhone("12345"), false);
  assert.strictEqual(isValidPhone("98765"), false);
  assert.strictEqual(isValidPhone("5999999999"), false); // 10 digits starting with 5 (not a mobile prefix)
  assert.strictEqual(isValidPhone("0123456789"), false); // 10 digits starting with 0
  assert.strictEqual(isValidPhone("1234567890123456"), false); // 16 digits
  assert.strictEqual(isValidPhone("abcdefghij"), false);
  assert.strictEqual(isValidPhone(""), false);
  assert.strictEqual(isValidPhone(null), false);
  assert.strictEqual(isValidPhone(undefined), false);
});

// ── 3. Controller Phone Integration Logic Tests ─────────────────────────────
test("Controller customerFields normalizes valid phone", () => {
  const customerFields = (b) => {
    const rawPhone = b.phone !== undefined && b.phone !== null ? String(b.phone).trim() : null;
    let phone = null;
    if (rawPhone) {
      phone = normalizePhone(rawPhone);
      if (!isValidPhone(rawPhone)) {
        throw new HttpError(400, "Enter a valid 10-digit mobile number");
      }
    }
    return { name: b.name || "Customer", phone };
  };

  const res1 = customerFields({ name: "Ramesh", phone: "+91 98765 43210" });
  assert.strictEqual(res1.phone, "9876543210");

  const res2 = customerFields({ name: "Suresh", phone: "09876543210" });
  assert.strictEqual(res2.phone, "9876543210");

  assert.throws(() => {
    customerFields({ name: "Invalid", phone: "12345" });
  }, /Enter a valid 10-digit mobile number/);

  assert.throws(() => {
    customerFields({ name: "Invalid", phone: "5999999999" });
  }, /Enter a valid 10-digit mobile number/);
});

test("Controller billing customer lookup normalizes phone before query", () => {
  const queryPhone = " +91 98765-43210 ";
  const normalized = normalizePhone(queryPhone);
  assert.strictEqual(normalized, "9876543210");
  assert.strictEqual(isValidPhone(normalized), true);
});

// ── 4. Model Phone Setter Simulation Tests ──────────────────────────────────
test("Model setter normalizes phone on customer and bill assignment", () => {
  class MockCustomer {
    constructor() {
      this._data = {};
    }
    setDataValue(k, v) {
      this._data[k] = v;
    }
    set phone(val) {
      this.setDataValue("phone", normalizePhone(val));
    }
    get phone() {
      return this._data.phone;
    }
  }

  class MockBill {
    constructor() {
      this._data = {};
    }
    setDataValue(k, v) {
      this._data[k] = v;
    }
    set customerPhone(val) {
      this.setDataValue("customerPhone", normalizePhone(val));
    }
    get customerPhone() {
      return this._data.customerPhone;
    }
  }

  const c = new MockCustomer();
  c.phone = "+91 98765-43210";
  assert.strictEqual(c.phone, "9876543210");

  const b = new MockBill();
  b.customerPhone = "09876543210";
  assert.strictEqual(b.customerPhone, "9876543210");
});

console.log(`\nAll ${passed} Customer Phone Validation tests passed successfully! ✔`);
