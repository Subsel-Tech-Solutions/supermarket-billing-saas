// scripts/reset-e2e.js — Explicit reset command to drop test databases for a completely fresh start
const path = require("path");
const fs = require("fs");

const envPath = path.resolve(__dirname, "../.env.e2e.local");
if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath, override: true });
} else {
  require("dotenv").config();
}

function assertResetSafety() {
  const dbName = process.env.DB_NAME;
  const tenantPrefix = process.env.TENANT_DB_PREFIX;
  if (dbName !== "supermart_test_master") {
    throw new Error(`[CRITICAL SECURITY] Reset aborted! DB_NAME must be 'supermart_test_master', got '${dbName}'.`);
  }
  if (!tenantPrefix || !tenantPrefix.startsWith("sm_test_shop_")) {
    throw new Error(`[CRITICAL SECURITY] Reset aborted! TENANT_DB_PREFIX must start with 'sm_test_shop_', got '${tenantPrefix}'.`);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(`[CRITICAL SECURITY] Cannot reset databases in production environment.`);
  }
}

assertResetSafety();

const mysql = require("mysql2/promise");

async function reset() {
  console.log("⚠️ Resetting Real E2E Test Databases...");
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  const [dbs] = await conn.query("SHOW DATABASES;");
  const testDbs = dbs
    .map((r) => r.Database)
    .filter((d) => d === "supermart_test_master" || d.startsWith(process.env.TENANT_DB_PREFIX));

  for (const d of testDbs) {
    console.log(`   Dropping test database: ${d}`);
    await conn.query(`DROP DATABASE IF EXISTS \`${d}\`;`);
  }

  console.log("✅ All test databases dropped. Run 'node backend/scripts/seed-e2e.js' to recreate.");
  await conn.end();
}

if (require.main === module) {
  reset()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Reset failed:", err);
      process.exit(1);
    });
}

module.exports = { reset };
