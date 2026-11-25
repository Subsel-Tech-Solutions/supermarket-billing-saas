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
const { createBill, returnBill } = require("../controllers/billingController");

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
    let beta = await tenantManager.getTenant({ id: 202, name: "Isolation Beta", dbName: betaName });

    assert.notStrictEqual(alpha.sequelize, beta.sequelize);
    assert.notStrictEqual(alpha.models.Product, beta.models.Product);

    await beta.sequelize.query("ALTER TABLE sale_returns MODIFY client_ref VARCHAR(64) NULL");
    const [legacyReturn] = await beta.sequelize.query(
      "INSERT INTO sale_returns (return_number, client_ref, bill_id, total_amount, refund_method, createdAt, updatedAt) VALUES (:returnNumber, NULL, 999, 1, 'cash', NOW(), NOW())",
      { replacements: { returnNumber: `LEGACY-${runId}` } },
    );
    await tenantManager.closeTenant(betaName);
    beta = await tenantManager.getTenant({ id: 202, name: "Isolation Beta", dbName: betaName });
    const migratedReturn = await beta.models.SaleReturn.findByPk(legacyReturn.insertId);
    assert.match(migratedReturn.clientRef, /^legacy-return-\d+$/);
    const [clientRefColumn] = await beta.sequelize.query(
      "SELECT IS_NULLABLE AS isNullable FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_returns' AND COLUMN_NAME = 'client_ref'",
    );
    assert.strictEqual(clientRefColumn[0].isNullable, "NO");
    const [clientRefIndex] = await beta.sequelize.query(
      "SELECT NON_UNIQUE AS nonUnique, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS indexColumns FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_returns' AND INDEX_NAME = 'uq_returns_bill_client_ref' GROUP BY INDEX_NAME, NON_UNIQUE",
    );
    assert.strictEqual(Number(clientRefIndex[0].nonUnique), 0);
    assert.strictEqual(clientRefIndex[0].indexColumns, "bill_id,client_ref");

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

    await reopenedAlpha.models.Product.create({
      id: 2,
      name: "Concurrent checkout product",
      price: 10,
      quantity: 5,
      unit: "pcs",
      isActive: true,
    });
    const checkedProduct = await reopenedAlpha.models.Product.findByPk(2);
    checkedProduct.quantity = -1;
    await assert.rejects(() => checkedProduct.save());
    await checkedProduct.reload();
    assert.strictEqual(Number(checkedProduct.quantity), 5, "The database constraint must reject negative inventory.");

    const submitSale = async (clientRef) => {
      const response = {
        statusCode: 200,
        body: null,
        json(body) {
          this.body = body;
          return this;
        },
        status(statusCode) {
          this.statusCode = statusCode;
          return this;
        },
      };
      const request = {
        body: { clientRef, items: [{ productId: 2, quantity: 4 }], paymentMethod: "cash" },
        db: reopenedAlpha.models,
        isSuperAdmin: false,
        tenant: reopenedAlpha,
        user: { id: 1, role: "owner", username: "Concurrent Test" },
      };
      try {
        await createBill(request, response, (error) => {
          throw error;
        });
        return { response };
      } catch (error) {
        return { error, response };
      }
    };
    const checkoutResults = await Promise.all([
      submitSale(`stock-race-a-${runId}`),
      submitSale(`stock-race-b-${runId}`),
    ]);
    assert.strictEqual(checkoutResults.filter(({ response }) => response.statusCode === 201).length, 1);
    assert.strictEqual(checkoutResults.filter(({ error }) => error).length, 1);
    const failedCheckout = checkoutResults.find(({ error }) => error);
    assert.strictEqual(failedCheckout.error.statusCode, 400);
    assert.match(failedCheckout.error.message, /Insufficient stock/);
    assert.strictEqual(Number((await reopenedAlpha.models.Product.findByPk(2)).quantity), 1);
    assert.strictEqual(await reopenedAlpha.models.Bill.count(), 1);
    const billItems = await reopenedAlpha.models.BillItem.findAll({ where: { productId: 2 } });
    assert.strictEqual(billItems.length, 1);
    const bill = await reopenedAlpha.models.Bill.findByPk(billItems[0].billId);
    assert.strictEqual(Number(bill.paidAmount), 40);
    assert.strictEqual(bill.payments.length, 1);
    assert.strictEqual(await reopenedAlpha.models.StockMovement.count({ where: { productId: 2, type: "sale" } }), 1);

    const checkoutItem = billItems[0];
    const submitReturn = async () => {
      const response = {
        statusCode: 200,
        body: null,
        json(body) {
          this.body = body;
          return this;
        },
        status(statusCode) {
          this.statusCode = statusCode;
          return this;
        },
      };
      const request = {
        body: {
          clientRef: `real-return-${runId}`,
          items: [{ billItemId: checkoutItem.id, quantity: 2 }],
          refundMethod: "cash",
        },
        db: reopenedAlpha.models,
        isSuperAdmin: false,
        params: { id: bill.id },
        tenant: reopenedAlpha,
        user: { id: 1, role: "owner", username: "Concurrent Test" },
      };
      try {
        await returnBill(request, response, (error) => {
          throw error;
        });
        return { response };
      } catch (error) {
        return { error, response };
      }
    };
    const returnResults = await Promise.all(Array.from({ length: 10 }, submitReturn));
    assert.strictEqual(returnResults.filter(({ response }) => response.statusCode === 201).length, 1);
    assert.strictEqual(returnResults.filter(({ response }) => response.body?.duplicate).length, 9);
    assert.strictEqual(await reopenedAlpha.models.SaleReturn.count({ where: { billId: bill.id } }), 1);
    assert.strictEqual(await reopenedAlpha.models.SaleReturnItem.count(), 1);
    const returnedBill = await reopenedAlpha.models.Bill.findByPk(bill.id);
    const returnedItem = await reopenedAlpha.models.BillItem.findByPk(checkoutItem.id);
    assert.strictEqual(Number(returnedBill.returnedAmount), 20);
    assert.strictEqual(returnedBill.status, "partially_returned");
    assert.strictEqual(Number(returnedItem.returnedQty), 2);
    assert.strictEqual(Number((await reopenedAlpha.models.Product.findByPk(2)).quantity), 3);
    assert.strictEqual(await reopenedAlpha.models.StockMovement.count({ where: { productId: 2, type: "return" } }), 1);

    const excessiveReturnResponse = {
      statusCode: 200,
      body: null,
      json(body) {
        this.body = body;
        return this;
      },
      status(statusCode) {
        this.statusCode = statusCode;
        return this;
      },
    };
    let excessiveReturnError;
    await returnBill(
      {
        body: { clientRef: `real-return-excess-${runId}`, items: [{ billItemId: checkoutItem.id, quantity: 3 }] },
        db: reopenedAlpha.models,
        isSuperAdmin: false,
        params: { id: bill.id },
        tenant: reopenedAlpha,
        user: { id: 1, role: "owner", username: "Concurrent Test" },
      },
      excessiveReturnResponse,
      (error) => { excessiveReturnError = error; },
    );
    assert.strictEqual(excessiveReturnError?.statusCode, 400);
    assert.strictEqual(Number((await reopenedAlpha.models.Product.findByPk(2)).quantity), 3);

    await beta.models.Product.create({
      id: 3,
      name: "Beta-only product",
      price: 30,
      quantity: 3,
      unit: "pcs",
      isActive: true,
    });
    await reopenedAlpha.models.Customer.create({ id: 1, name: "Alpha Customer", phone: "9876543210" });
    await beta.models.Customer.create({ id: 1, name: "Beta Customer", phone: "9876543211" });
    await beta.models.Customer.create({ id: 3, name: "Beta-only customer", phone: "9876543212" });
    await beta.models.Bill.create({
      id: 1,
      billNumber: "BETA-000001",
      customerId: 1,
      customerName: "Beta Customer",
      subtotal: 22,
      totalAmount: 22,
      paidAmount: 22,
      paymentMethod: "cash",
      payments: [{ method: "cash", amount: 22 }],
    });
    await beta.models.BillItem.create({
      billId: 1,
      productId: 1,
      productName: "Beta-only product",
      quantity: 1,
      unitPrice: 22,
      costPrice: 10,
      totalPrice: 22,
    });
    await beta.models.Bill.create({
      id: 2,
      billNumber: "BETA-000002",
      customerId: 3,
      customerName: "Beta-only customer",
      subtotal: 30,
      totalAmount: 30,
      paidAmount: 30,
      paymentMethod: "cash",
      payments: [{ method: "cash", amount: 30 }],
    });
    await beta.models.BillItem.create({
      billId: 2,
      productId: 3,
      productName: "Beta-only product",
      quantity: 1,
      unitPrice: 30,
      costPrice: 15,
      totalPrice: 30,
    });

    const express = require("express");
    const { User } = require("../models/master");
    const authPath = require.resolve("../middleware/auth");
    const previousAuthModule = require.cache[authPath];
    const originalFindByPk = User.findByPk;
    const originalGetTenant = tenantManager.getTenant;
    const originalJwtSecret = process.env.JWT_SECRET;
    const users = new Map([
      [101, { id: 101, shopId: 101, role: "owner", isActive: true, isSuperAdmin: false, tokenVersion: 0, shop: { id: 101, isActive: true, subscriptionEnds: null } }],
      [202, { id: 202, shopId: 202, role: "owner", isActive: true, isSuperAdmin: false, tokenVersion: 0, shop: { id: 202, isActive: true, subscriptionEnds: null } }],
    ]);
    let server;

    process.env.JWT_SECRET = "tenant-route-test-secret-at-least-32-characters";
    User.findByPk = async (id) => users.get(Number(id)) || null;
    tenantManager.getTenant = async (shop) => (shop.id === 101 ? reopenedAlpha : beta);
    delete require.cache[authPath];

    try {
      const { signAccessToken } = require("../middleware/auth");
      const app = express();
      app.use(express.json());
      app.use("/api/products", require("../routes/products"));
      app.use("/api/bills", require("../routes/bills"));
      app.use("/api/customers", require("../routes/customers"));
      app.use("/api/admin", require("../routes/admin"));
      app.use(require("../middleware/errorHandler").errorHandler);
      server = await new Promise((resolve, reject) => {
        const listeningServer = app.listen(0, "127.0.0.1", () => resolve(listeningServer));
        listeningServer.once("error", reject);
      });

      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const tokenA = signAccessToken(users.get(101));
      const tokenB = signAccessToken(users.get(202));
      const request = async (token, method, url, body, spoofedTenantId) => {
        const headers = {
          Authorization: `Bearer ${token}`,
          "X-Tenant-ID": String(spoofedTenantId),
        };
        const options = { method, headers };
        if (body !== undefined) {
          headers["Content-Type"] = "application/json";
          options.body = JSON.stringify(body);
        }
        const response = await fetch(`${baseUrl}${url}`, options);
        const contentType = response.headers.get("content-type") || "";
        const payload = contentType.includes("application/json") ? await response.json() : await response.arrayBuffer();
        return { status: response.status, contentType, payload };
      };

      let response = await request(tokenA, "GET", "/api/products/1?shopId=202", undefined, 202);
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.payload.data.product.name, "Alpha-only product");
      response = await request(tokenB, "GET", "/api/products/1?shopId=101", undefined, 101);
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.payload.data.product.name, "Beta-only product");
      response = await request(tokenA, "GET", "/api/products/3?shopId=202", undefined, 202);
      assert.strictEqual(response.status, 404, "Business A must not read a product that exists only in Business B.");

      response = await request(tokenA, "GET", "/api/customers/1?shopId=202", undefined, 202);
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.payload.data.customer.name, "Alpha Customer");
      response = await request(tokenA, "GET", "/api/customers/3?shopId=202", undefined, 202);
      assert.strictEqual(response.status, 404, "Business A must not read a customer that exists only in Business B.");

      response = await request(tokenA, "GET", "/api/bills/1?shopId=202", undefined, 202);
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.payload.data.bill.items[0].productName, "Concurrent checkout product");
      response = await request(tokenB, "GET", "/api/bills/2?shopId=101", undefined, 101);
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.payload.data.bill.billNumber, "BETA-000002");
      response = await request(tokenA, "GET", "/api/bills/2?shopId=202", undefined, 202);
      assert.strictEqual(response.status, 404, "Business A must not read a bill that exists only in Business B.");
      response = await request(tokenA, "GET", "/api/bills/2/invoice?shopId=202", undefined, 202);
      assert.strictEqual(response.status, 404, "Invoice downloads must use the authenticated tenant database.");

      response = await request(
        tokenA,
        "POST",
        "/api/customers?shopId=202",
        { shopId: 202, name: "A-created customer", phone: "9876543213" },
        202,
      );
      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.payload.data.customer.name, "A-created customer");
      assert.strictEqual(await beta.models.Customer.findOne({ where: { phone: "9876543213" } }), null);

      response = await request(
        tokenA,
        "PUT",
        "/api/products/1?shopId=202",
        { shopId: 202, name: "Alpha renamed product" },
        202,
      );
      assert.strictEqual(response.status, 200);
      assert.strictEqual((await reopenedAlpha.models.Product.findByPk(1)).name, "Alpha renamed product");
      assert.strictEqual((await beta.models.Product.findByPk(1)).name, "Beta-only product");
      response = await request(tokenA, "DELETE", "/api/products/1?shopId=202", undefined, 202);
      assert.strictEqual(response.status, 200);
      assert.strictEqual((await reopenedAlpha.models.Product.findByPk(1)).isActive, false);
      assert.strictEqual((await beta.models.Product.findByPk(1)).isActive, true);

      response = await request(tokenA, "GET", "/api/admin/shops?shopId=202", undefined, 202);
      assert.strictEqual(response.status, 403, "Business accounts must not access platform-wide tenant administration.");
    } finally {
      if (server) {
        const serverClosed = new Promise((resolve) => server.close(resolve));
        if (server.closeAllConnections) server.closeAllConnections();
        await serverClosed;
      }
      User.findByPk = originalFindByPk;
      tenantManager.getTenant = originalGetTenant;
      if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = originalJwtSecret;
      delete require.cache[authPath];
      if (previousAuthModule) require.cache[authPath] = previousAuthModule;
      ["products", "bills", "customers", "admin"].forEach((route) => {
        delete require.cache[require.resolve(`../routes/${route}`)];
      });
    }

    console.log("Real MySQL tests passed: tenant isolation, cross-tenant API access, stock constraints, concurrent checkout and return locking.");
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
