const assert = require("assert");
const crypto = require("crypto");
const path = require("path");

if (process.env.RUN_REAL_TENANT_TESTS !== "true") {
  throw new Error("Set RUN_REAL_TENANT_TESTS=true to run the real MySQL tenant isolation test.");
}

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const dbHost = process.env.DB_HOST || "localhost";
const dbPort = Number(process.env.DB_PORT || 3306);
if (!["localhost", "127.0.0.1", "::1"].includes(dbHost) || process.env.NODE_ENV === "production") {
  throw new Error("Real tenant isolation tests are restricted to a local, non-production MySQL server.");
}

const mysql = require("mysql2/promise");
const runId = crypto.randomBytes(8).toString("hex");
const prefix = `sm_test_isolation_${runId}_`;
const databaseNames = [`${prefix}alpha`, `${prefix}beta`];
const createdDatabases = [];
const databaseConfig = {
  host: dbHost,
  port: dbPort,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
};

process.env.E2E_MODE = "false";
const { sequelize: masterSequelize } = require("../config/database");
process.env.E2E_MODE = "true";
process.env.TENANT_DB_PREFIX = prefix;
process.env.TENANT_IDLE_MINUTES = "120";
const tenantManager = require("../tenant/tenantManager");

const run = async () => {
  let connection;
  try {
    connection = await mysql.createConnection(databaseConfig);
    const [existing] = await connection.query(
      "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME IN (?, ?)",
      databaseNames,
    );
    assert.deepStrictEqual(existing, [], "Generated test database names already exist; refusing to alter them.");
    await connection.end();
    connection = null;

    const alphaName = databaseNames[0];
    const betaName = databaseNames[1];
    createdDatabases.push(alphaName, betaName);

    const alpha = await tenantManager.getTenant({ id: 101, name: "Isolation Alpha", dbName: alphaName });
    const beta = await tenantManager.getTenant({ id: 202, name: "Isolation Beta", dbName: betaName });

    assert.notStrictEqual(alpha.sequelize, beta.sequelize);
    assert.notStrictEqual(alpha.models.Product, beta.models.Product);

    const alphaProduct = await alpha.models.Product.create({
      id: 1,
      name: "Alpha-only product",
      price: 11,
      quantity: 7,
      unit: "pcs",
      isActive: true,
    });
    assert.strictEqual(await beta.models.Product.findByPk(alphaProduct.id), null, "Tenant Beta must not read Alpha's product.");

    await beta.models.Product.create({
      id: alphaProduct.id,
      name: "Beta-only product",
      price: 22,
      quantity: 3,
      unit: "pcs",
      isActive: true,
    });
    const [alphaSettings, betaSettings] = await Promise.all([
      alpha.models.Setting.findByPk(1),
      beta.models.Setting.findByPk(1),
    ]);
    alphaSettings.data = { businessName: "Isolation Alpha" };
    betaSettings.data = { businessName: "Isolation Beta" };
    await Promise.all([alphaSettings.save(), betaSettings.save()]);

    const [alphaProductUpdated, betaProduct] = await Promise.all([
      alpha.models.Product.findByPk(alphaProduct.id),
      beta.models.Product.findByPk(alphaProduct.id),
    ]);
    alphaProductUpdated.quantity = 6;
    await alphaProductUpdated.save();
    assert.strictEqual((await beta.models.Product.findByPk(alphaProduct.id)).quantity, 3);
    assert.strictEqual(betaProduct.name, "Beta-only product");
    assert.strictEqual((await alpha.models.Setting.findByPk(1)).data.businessName, "Isolation Alpha");
    assert.strictEqual((await beta.models.Setting.findByPk(1)).data.businessName, "Isolation Beta");

    await tenantManager.closeTenant(alphaName);
    const reopenedAlpha = await tenantManager.getTenant({ id: 101, name: "Isolation Alpha", dbName: alphaName });
    assert.strictEqual((await reopenedAlpha.models.Product.findByPk(alphaProduct.id)).quantity, 6);
    assert.strictEqual((await reopenedAlpha.models.Setting.findByPk(1)).data.businessName, "Isolation Alpha");

    console.log("Real MySQL tenant isolation tests passed: separate models, same-ID data isolation, writes, and persistence after reconnect.");
  } finally {
    if (connection) await connection.end();
    await tenantManager.closeAll();
    if (createdDatabases.length) {
      const cleanup = await mysql.createConnection(databaseConfig);
      try {
        for (const databaseName of createdDatabases) {
          if (!databaseName.startsWith(prefix)) throw new Error(`Refusing to drop unexpected database ${databaseName}`);
          await cleanup.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
        }
      } finally {
        await cleanup.end();
      }
    }
    await masterSequelize.close();
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
