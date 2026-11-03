// server.js — SuperMart POS SaaS API
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const cookieParser = require("cookie-parser");
const { createDatabaseIfMissing } = require("./config/database");
const { sequelize, Shop, User, PlatformSetting, RefreshToken } = require("./models/master");
const { provisionTenant, dbNameForShop, closeAll, stats } = require("./tenant/tenantManager");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const { securityHeaders, apiLimiter } = require("./middleware/security");
const { verifyCsrf } = require("./middleware/csrf");
const { PLATFORM_DEFAULTS, SIGNUP_POLICY_VERSION, migratePlatformSignupPolicy } = require("./utils/defaults");

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ───────────────────────────────────────────────────────────────
// Behind Railway / Render / nginx the real client IP is in X-Forwarded-For; without
// this every request looks like it comes from the proxy and rate limiting is useless.
app.set("trust proxy", process.env.TRUST_PROXY === "false" ? false : 1);

const origins = (process.env.CORS_ORIGIN || "*").split(",").map((s) => s.trim());
app.use(cors({ origin: origins.includes("*") ? true : origins, credentials: true }));
app.use(securityHeaders);
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use(cookieParser());
app.disable("x-powered-by");

// ── API Routes ───────────────────────────────────────────────────────────────
// Deep health check: a 200 here means the master database really answers, so an
// orchestrator restarts the container when MySQL is gone instead of leaving it up.
app.get("/api/health", async (req, res) => {
  try {
    await sequelize.query("SELECT 1");
    res.json({ status: "OK", database: "up", timestamp: new Date(), tenants: stats().openConnections });
  } catch (err) {
    res.status(503).json({ status: "DEGRADED", database: "down", message: err.message });
  }
});

app.use("/api", apiLimiter);
app.use("/api", verifyCsrf);
app.use("/api/platform", require("./routes/platform"));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/products", require("./routes/products"));
app.use("/api/bills", require("./routes/bills"));
app.use("/api/customers", require("./routes/customers"));
app.use("/api/suppliers", require("./routes/suppliers"));
app.use("/api/purchases", require("./routes/purchases"));
app.use("/api/expenses", require("./routes/expenses"));
app.use("/api/staff", require("./routes/staff"));
app.use("/api/reports", require("./routes/reports"));

// ── Serve the React build (single-server deployments) ───────────────────────
const buildPath = path.join(__dirname, "../frontend/build");
if (process.env.NODE_ENV === "production" && fs.existsSync(buildPath)) {
  // Hashed bundles under /static can be cached forever; everything else (index.html,
  // manifest, service worker) must revalidate or the till keeps running old code.
  app.use(
    express.static(buildPath, {
      setHeaders: (res, filePath) => {
        if (/[.-][0-9a-f]{8,}\.(js|css)$/i.test(filePath) || filePath.includes(`${path.sep}static${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(buildPath, "index.html"));
  });
}

app.use(notFound);
app.use(errorHandler);

// ── Bootstrap ────────────────────────────────────────────────────────────────
// Creates the platform settings row, the platform-admin shop and the super admin.
const seed = async () => {
  const [platformSettings, platformSettingsCreated] = await PlatformSetting.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1, data: { ...PLATFORM_DEFAULTS, _signupPolicyVersion: SIGNUP_POLICY_VERSION } },
  });
  if (!platformSettingsCreated) {
    const migratedSettings = migratePlatformSignupPolicy(platformSettings.data);
    if (migratedSettings) {
      platformSettings.data = migratedSettings;
      await platformSettings.save();
      console.log("Public signups are closed by default. Enable them in Platform Admin settings to reopen.");
    }
  }

  const adminEmail = String(process.env.ADMIN_EMAIL || "admin@supermarket.com").toLowerCase();
  let admin = await User.findOne({ where: { email: adminEmail } });
  let shop = admin ? await Shop.findByPk(admin.shopId) : await Shop.findOne({ order: [["id", "ASC"]] });

  if (!shop) {
    shop = await Shop.create({
      name: process.env.DEFAULT_SHOP_NAME || "Demo Supermarket",
      ownerEmail: adminEmail,
      plan: "pro",
      subscriptionEnds: null, // lifetime
      isActive: true,
    });
    console.log("✅ Default shop created");
  }
  if (!shop.dbName) {
    shop.dbName = dbNameForShop(shop.id);
    await shop.save();
  }

  const isProd = process.env.NODE_ENV === "production";
  const defaultPasswordUsed = !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === "admin123";

  if (!admin) {
    if (isProd && defaultPasswordUsed) {
      throw new Error(
        "CRITICAL SECURITY: Cannot seed default super-admin password 'admin123' in production. Configure a strong ADMIN_PASSWORD in .env."
      );
    }
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
    admin = await User.create({
      shopId: shop.id,
      username: process.env.ADMIN_USERNAME || "Admin",
      email: adminEmail,
      password: adminPassword,
      role: "owner",
      isSuperAdmin: true,
    });
    console.log(`✅ Super admin created → ${adminEmail}`);
    if (defaultPasswordUsed) {
      console.warn("⚠️ [SECURITY WARNING] Super admin created with default password 'admin123'. Change it before deploying to production.");
    }
  } else {
    // If admin account already exists in database, verify it is not using the default password in production
    const hasDefaultPassword = await admin.comparePassword("admin123");
    if (hasDefaultPassword) {
      if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD !== "admin123") {
        admin.password = process.env.ADMIN_PASSWORD;
        admin.tokenVersion = (admin.tokenVersion || 0) + 1;
        await admin.save();
        console.log(`🔒 Super-admin password successfully updated from ADMIN_PASSWORD env variable.`);
      } else if (isProd) {
        throw new Error(
          "CRITICAL SECURITY: The super-admin account in the database is currently using the default password 'admin123'. You must update ADMIN_PASSWORD in your .env and reset it before running in production."
        );
      } else {
        console.warn("⚠️ [SECURITY WARNING] Super admin is using default password 'admin123'. In production, the server will refuse to start until a strong ADMIN_PASSWORD is set.");
      }
    }
    if (!admin.isSuperAdmin) {
      admin.isSuperAdmin = true;
      await admin.save();
    }
  }

  await provisionTenant(shop, { businessName: shop.name });
  console.log(`✅ Default shop database ready (${shop.dbName})`);
};

const assertAdminPasswordSecurity = (env = process.env) => {
  const isProd = env.NODE_ENV === "production";
  if (!isProd) return;

  const password = env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      "ADMIN_PASSWORD is required in production — set a strong, unique password (at least 8 characters) in .env before starting the server."
    );
  }
  if (password.length < 8) {
    throw new Error(
      "ADMIN_PASSWORD must be at least 8 characters in production."
    );
  }
  if (/^(admin123|password|admin|123456|12345678|supermarket)$/i.test(password.trim())) {
    throw new Error(
      "ADMIN_PASSWORD cannot be a common default password ('admin123', 'password', etc.) in production."
    );
  }
};

const start = async () => {
  try {
    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is missing in .env");
    if (process.env.JWT_SECRET.length < 32) {
      throw new Error("JWT_SECRET must be at least 32 characters — anyone who guesses it can sign in as any shop");
    }
    if (process.env.NODE_ENV === "production" && /change_this|secret_key|yourpassword/i.test(process.env.JWT_SECRET)) {
      throw new Error("JWT_SECRET is still the example value — set a long random string before going live");
    }

    // Verify super-admin password security in production
    assertAdminPasswordSecurity(process.env);

    await createDatabaseIfMissing(process.env.DB_NAME || "supermart_master");
    await sequelize.authenticate();
    console.log("✅ Master database connected");
    await sequelize.sync(process.env.DB_SYNC_ALTER === "true" ? { alter: true } : {});
    // Ensure token_version column exists on users table and refresh_tokens table exists
    const [cols] = await sequelize.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'token_version';"
    ).catch(() => [[]]);
    if (!cols || cols.length === 0) {
      await sequelize.query("ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0;").catch(() => {});
    }
    await RefreshToken.sync();
    await seed();
    const server = app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

    const shutdown = async (sig) => {
      console.log(`\n${sig} received — closing…`);
      server.close();
      await closeAll();
      await sequelize.close();
      process.exit(0);
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error("❌ Server startup failed:", error.message);
    if (/Access denied|ER_DBACCESS|CREATE command denied/i.test(error.message)) {
      console.error("   → The DB user needs permission to CREATE DATABASE (each shop gets its own database).");
    }
    process.exit(1);
  }
};

if (require.main === module) start();

module.exports = { app, assertAdminPasswordSecurity };
