const assert = require("assert");
const express = require("express");

process.env.JWT_SECRET = "super_secret_test_key_at_least_32_chars_long_12345";
process.env.JWT_REFRESH_SECRET = "super_secret_refresh_test_key_at_least_32_chars_long_12345";
process.env.NODE_ENV = "test";

const authPath = require.resolve("../middleware/auth");
const authModule = require(authPath);
const originalAuthExports = require.cache[authPath].exports;
const routePaths = [
  "../routes/reports",
  "../routes/settings",
  "../routes/staff",
  "../routes/products",
  "../routes/bills",
  "../routes/admin",
];
const loadedRoutes = [];

require.cache[authPath].exports = {
  ...authModule,
  protect: (req, res, next) => {
    req.user = { id: 1, role: req.headers["x-test-role"] || "cashier", username: "test" };
    req.isSuperAdmin = false;
    req.shopId = 101;
    req.db = {
      Setting: {
        findByPk: async () => ({
          data: {
            businessName: "Example Market",
            purchasePrefix: "PUR",
            expenseCategories: ["Rent"],
            trackExpiry: true,
            paymentMethods: ["cash", "upi"],
            cashierCanCancel: false,
          },
        }),
      },
    };
    next();
  },
  requireActiveSubscription: (req, res, next) => next(),
};

const loadRoute = (path) => {
  const resolved = require.resolve(path);
  delete require.cache[resolved];
  loadedRoutes.push(resolved);
  return require(resolved);
};

const app = express();
app.use(express.json());
app.use("/api/reports", loadRoute(routePaths[0]));
app.use("/api/settings", loadRoute(routePaths[1]));
app.use("/api/staff", loadRoute(routePaths[2]));
app.use("/api/products", loadRoute(routePaths[3]));
app.use("/api/bills", loadRoute(routePaths[4]));
app.use("/api/admin", loadRoute(routePaths[5]));
app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({ success: false, message: err.message });
});

const request = async (server, path, role, method = "GET", body) => {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      "x-test-role": role,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
};

const check = async (name, fn) => {
  await fn();
  console.log(`✓ ${name}`);
};

(async () => {
  let server;
  try {
    server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });

    await check("cashier cannot access dashboard or day-end financial reports", async () => {
      for (const path of ["/api/reports/dashboard", "/api/reports/day-end"]) {
        const result = await request(server, path, "cashier");
        assert.strictEqual(result.status, 403, `${path} should reject cashiers`);
      }
    });

    await check("manager cannot access owner-only profit reports or full settings", async () => {
      for (const path of ["/api/reports/profit", "/api/settings"]) {
        const result = await request(server, path, "manager");
        assert.strictEqual(result.status, 403, `${path} should reject managers`);
      }
    });

    await check("manager cannot create staff accounts or change platform settings", async () => {
      const staff = await request(server, "/api/staff", "manager", "POST", {
        username: "Escalation",
        email: "escalation@example.com",
        password: "password",
        role: "owner",
      });
      const platform = await request(server, "/api/admin/settings", "manager");
      assert.strictEqual(staff.status, 403);
      assert.strictEqual(platform.status, 403);
    });

    await check("cashier cannot delete products", async () => {
      const result = await request(server, "/api/products/9", "cashier", "DELETE");
      assert.strictEqual(result.status, 403);
    });

    await check("cashier cannot cancel invoices unless an owner has enabled that permission", async () => {
      const result = await request(server, "/api/bills/9/cancel", "cashier", "PATCH", { reason: "not allowed" });
      assert.strictEqual(result.status, 403);
    });

    await check("owner receives full settings while cashier POS settings exclude management-only fields", async () => {
      const ownerSettings = await request(server, "/api/settings", "owner");
      const cashierSettings = await request(server, "/api/settings/pos", "cashier");
      assert.strictEqual(ownerSettings.status, 200);
      assert.strictEqual(ownerSettings.body.data.settings.purchasePrefix, "PUR");
      assert.strictEqual(cashierSettings.status, 200);
      assert.strictEqual(cashierSettings.body.data.settings.businessName, "Example Market");
      assert.strictEqual(cashierSettings.body.data.settings.purchasePrefix, undefined);
      assert.strictEqual(cashierSettings.body.data.settings.expenseCategories, undefined);
      assert.strictEqual(cashierSettings.body.data.settings.trackExpiry, undefined);
    });

    await check("owner cannot change their own role through the staff controller", async () => {
      const { User } = require("../models/master");
      const { updateStaff } = require("../controllers/staffController");
      const originalFindOne = User.findOne;
      const owner = {
        id: 1,
        username: "owner",
        email: "owner@example.com",
        role: "owner",
        phone: null,
        isActive: true,
        isSuperAdmin: false,
      };
      User.findOne = async () => owner;
      let error;
      try {
        await updateStaff(
          { params: { id: "1" }, user: { id: 1 }, shopId: 101, body: { role: "manager" } },
          { json: () => assert.fail("self role change must not succeed") },
          (err) => { error = err; },
        );
      } finally {
        User.findOne = originalFindOne;
      }
      assert.strictEqual(error?.statusCode, 400);
    });

    await check("return-to-admin rejects revoked admin access and refresh sessions", async () => {
      const { User, RefreshToken } = require("../models/master");
      const { returnToAdmin } = require("../controllers/adminController");
      const originalFindByPk = User.findByPk;
      const originalRefreshFindOne = RefreshToken.findOne;
      const { signAccessToken, signRefreshToken } = authModule;
      const response = {
        cookie: () => response,
        clearCookie: () => response,
        json: () => response,
      };
      const invoke = async (accessVersion, currentVersion, refreshToken) => {
        User.findByPk = async () => ({
          id: 1,
          isActive: true,
          isSuperAdmin: true,
          tokenVersion: currentVersion,
        });
        RefreshToken.findOne = async () => null;
        let error;
        await returnToAdmin(
          {
            cookies: {
              adminAccessToken: signAccessToken({ id: 1, tokenVersion: accessVersion }),
              adminRefreshToken: refreshToken,
            },
          },
          response,
          (err) => { error = err; },
        );
        return error;
      };
      try {
        const staleRefresh = signRefreshToken({ id: 1, tokenVersion: 0 }, "admin-family");
        const staleAccess = await invoke(0, 1, staleRefresh);
        assert.strictEqual(staleAccess?.statusCode, 401);

        const refresh = signRefreshToken({ id: 1, tokenVersion: 0 }, "admin-family");
        const revokedRefresh = await invoke(0, 0, refresh);
        assert.strictEqual(revokedRefresh?.statusCode, 401);
      } finally {
        User.findByPk = originalFindByPk;
        RefreshToken.findOne = originalRefreshFindOne;
      }
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    loadedRoutes.forEach((path) => delete require.cache[path]);
    require.cache[authPath].exports = originalAuthExports;
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
