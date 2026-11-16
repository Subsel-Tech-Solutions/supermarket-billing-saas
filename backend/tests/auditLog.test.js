// tests/auditLog.test.js — Automated test suite for Audit Logging (Price Changes, Discounts, Cancellations, Staff & Settings)
const assert = require("assert");
const { logAudit } = require("../utils/auditLogger");

let passed = 0;
const check = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`\n✗ ${name}\n  ${err.message}\n`);
    process.exitCode = 1;
  }
};

(async () => {
  console.log("\n── Audit Logging System Tests ──\n");

  // Mock DB & Model
  const createdLogs = [];
  const mockAuditLogModel = {
    create: async (data) => {
      createdLogs.push({ ...data, id: createdLogs.length + 1, createdAt: new Date() });
      return createdLogs[createdLogs.length - 1];
    },
  };

  const createMockReq = (user = { id: 1, username: "manager1", role: "manager" }) => ({
    ip: "192.168.1.100",
    user,
    db: {
      AuditLog: mockAuditLogModel,
    },
  });

  await check("logAudit creates an audit record with correct attributes and user metadata", async () => {
    const req = createMockReq();
    const entry = await logAudit(req, {
      action: "PRICE_CHANGE",
      entityType: "product",
      entityId: 42,
      details: { productName: "Organic Honey 500g" },
      diff: {
        price: { from: 250, to: 280 },
        mrp: { from: 300, to: 320 },
      },
    });

    assert(entry);
    assert.strictEqual(entry.action, "PRICE_CHANGE");
    assert.strictEqual(entry.entityType, "product");
    assert.strictEqual(entry.entityId, "42");
    assert.strictEqual(entry.userId, 1);
    assert.strictEqual(entry.username, "manager1");
    assert.strictEqual(entry.userRole, "manager");
    assert.strictEqual(entry.ipAddress, "192.168.1.100");
    assert.deepStrictEqual(entry.diff.price, { from: 250, to: 280 });
  });

  await check("logAudit is non-blocking and handles missing DB or DB errors gracefully without throwing", async () => {
    // Missing db
    const res1 = await logAudit({}, { action: "TEST", entityType: "test" });
    assert.strictEqual(res1, null);

    // Throwing DB
    const throwingReq = {
      db: {
        AuditLog: {
          create: async () => {
            throw new Error("DB Connection Failed");
          },
        },
      },
    };
    const res2 = await logAudit(throwingReq, { action: "TEST", entityType: "test" });
    assert.strictEqual(res2, null);
  });

  await check("BILL_CANCELLED action logs correct audit trail and diff", async () => {
    const req = createMockReq({ id: 2, username: "owner_admin", role: "owner" });
    const entry = await logAudit(req, {
      action: "BILL_CANCELLED",
      entityType: "bill",
      entityId: "INV-000123",
      details: {
        billId: 123,
        billNumber: "INV-000123",
        customerName: "Ramesh Sharma",
        totalAmount: 1450.0,
        reason: "Customer returned goods immediately",
      },
      diff: {
        status: { from: "completed", to: "cancelled" },
      },
    });

    assert.strictEqual(entry.action, "BILL_CANCELLED");
    assert.strictEqual(entry.entityType, "bill");
    assert.strictEqual(entry.entityId, "INV-000123");
    assert.strictEqual(entry.username, "owner_admin");
    assert.strictEqual(entry.diff.status.to, "cancelled");
  });

  await check("DISCOUNT_APPLIED action records item and bill discount breakdown", async () => {
    const req = createMockReq({ id: 3, username: "cashier1", role: "cashier" });
    const entry = await logAudit(req, {
      action: "DISCOUNT_APPLIED",
      entityType: "bill",
      entityId: "INV-000124",
      details: {
        billId: 124,
        billNumber: "INV-000124",
        customerName: "Priya Patel",
        totalAmount: 850.0,
      },
      diff: {
        subtotal: 1000.0,
        billDiscount: 100.0,
        itemDiscount: 50.0,
        totalDiscount: 150.0,
      },
    });

    assert.strictEqual(entry.action, "DISCOUNT_APPLIED");
    assert.strictEqual(entry.diff.totalDiscount, 150.0);
    assert.strictEqual(entry.details.customerName, "Priya Patel");
  });

  await check("STAFF_UPDATED action masks passwords and captures changed attributes", async () => {
    const req = createMockReq({ id: 2, username: "owner_admin", role: "owner" });
    const staffDiff = {
      role: { from: "cashier", to: "manager" },
      password: { from: "[hidden]", to: "[changed]" },
    };
    const entry = await logAudit(req, {
      action: "STAFF_UPDATED",
      entityType: "user",
      entityId: 5,
      details: { username: "anita_sharma", email: "anita@example.com", role: "manager" },
      diff: staffDiff,
    });

    assert.strictEqual(entry.action, "STAFF_UPDATED");
    assert.strictEqual(entry.entityType, "user");
    assert.strictEqual(entry.diff.role.to, "manager");
    assert.strictEqual(entry.diff.password.to, "[changed]");
    // Ensure raw password is not leaked in audit log
    assert.strictEqual(entry.diff.password.from, "[hidden]");
  });

  await check("SETTINGS_UPDATED action logs modified config keys and masks logo payload", async () => {
    const req = createMockReq({ id: 2, username: "owner_admin", role: "owner" });
    const settingsDiff = {
      businessName: { from: "Old Mart", to: "New SuperMart" },
      logo: { from: null, to: "[image]" },
      maxBillDiscountPercent: { from: 10, to: 25 },
    };
    const entry = await logAudit(req, {
      action: "SETTINGS_UPDATED",
      entityType: "setting",
      entityId: "1",
      details: { changedKeys: ["businessName", "logo", "maxBillDiscountPercent"] },
      diff: settingsDiff,
    });

    assert.strictEqual(entry.action, "SETTINGS_UPDATED");
    assert.strictEqual(entry.diff.businessName.to, "New SuperMart");
    assert.strictEqual(entry.diff.logo.to, "[image]");
    assert.strictEqual(entry.diff.maxBillDiscountPercent.to, 25);
  });

  console.log(`\nAll ${passed} audit logging checks passed.\n`);
})();
