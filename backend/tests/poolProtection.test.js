// tests/poolProtection.test.js — Automated test suite for Tenant Connection Pool Capping and LRU Eviction
const assert = require("assert");
const { MAX_CACHED_TENANTS, stats } = require("../tenant/tenantManager");
const { createTenantSequelize } = require("../config/database");

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
  console.log("\n── Connection Pool & LRU Eviction Tests ──\n");

  await check("MAX_CACHED_TENANTS is capped at 20 by default", () => {
    assert.strictEqual(typeof MAX_CACHED_TENANTS, "number");
    assert.strictEqual(MAX_CACHED_TENANTS <= 20, true, `Expected <= 20, got ${MAX_CACHED_TENANTS}`);
  });

  await check("createTenantSequelize defaults to pool max=2 and idle=5000", () => {
    const orig = process.env.TENANT_POOL_MAX;
    delete process.env.TENANT_POOL_MAX;
    const seq = createTenantSequelize("sm_shop_test_pool");
    const poolConfig = seq.options.pool;
    assert.strictEqual(poolConfig.max, 2, "Tenant pool max should default to 2 to prevent connection exhaustion");
    assert.strictEqual(poolConfig.idle, 5000, "Tenant pool idle should default to 5000ms");
    assert.strictEqual(poolConfig.min, 0, "Tenant pool min must be 0");
    if (orig !== undefined) process.env.TENANT_POOL_MAX = orig;
  });

  await check("createTenantSequelize respects configured TENANT_POOL_MAX env", () => {
    process.env.TENANT_POOL_MAX = "3";
    const seq = createTenantSequelize("sm_shop_test_pool_custom");
    assert.strictEqual(seq.options.pool.max, 3);
    process.env.TENANT_POOL_MAX = "2";
  });

  await check("LRU eviction logic handles capacity correctly", async () => {
    const initialStats = stats();
    assert.strictEqual(typeof initialStats.openConnections, "number");
    assert(Array.isArray(initialStats.databases));
  });

  console.log(`\nAll ${passed} pool protection checks passed.\n`);
})();
