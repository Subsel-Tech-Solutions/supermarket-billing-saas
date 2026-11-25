// scripts/seed-e2e.js — Deterministic E2E test database seeder with strict safety guards
const path = require("path");
const fs = require("fs");

const envPath = path.resolve(__dirname, "../.env.e2e.local");
if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath, override: true });
} else {
  require("dotenv").config();
}

// ── Strict Safety Checks ───────────────────────────────────────────────────────
function assertE2eSafety() {
  const dbName = process.env.DB_NAME;
  const tenantPrefix = process.env.TENANT_DB_PREFIX;
  const dbUser = process.env.DB_USER;

  if (dbName !== "supermart_test_master") {
    throw new Error(`[CRITICAL SECURITY] Seeder refused to run! DB_NAME must be 'supermart_test_master', got '${dbName}'.`);
  }
  if (!tenantPrefix || !tenantPrefix.startsWith("sm_test_shop_")) {
    throw new Error(`[CRITICAL SECURITY] Seeder refused to run! TENANT_DB_PREFIX must start with 'sm_test_shop_', got '${tenantPrefix}'.`);
  }
  if (dbUser === "root") {
    throw new Error(`[CRITICAL SECURITY] Seeder refused to run with 'root' user! Use dedicated 'supermart_e2e' user.`);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(`[CRITICAL SECURITY] Seeder cannot run when NODE_ENV=production.`);
  }
}

assertE2eSafety();

const { createDatabaseIfMissing, createTenantSequelize } = require("../config/database");
const { sequelize, Shop, User, PlatformSetting, RefreshToken } = require("../models/master");
const defineTenantModels = require("../models/tenant");
const { PLATFORM_DEFAULTS, SIGNUP_POLICY_VERSION, mergeSettings } = require("../utils/defaults");

const localDateStr = (daysOffset = 0) => {
  const d = new Date(Date.now() + daysOffset * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

async function seed() {
  console.log("🌱 Starting Real E2E Database Seed...");
  console.log(`   Database: ${process.env.DB_NAME} (User: ${process.env.DB_USER})`);

  // 1. Ensure master test database exists and is synced
  await createDatabaseIfMissing(process.env.DB_NAME);
  await sequelize.authenticate();
  await sequelize.sync({ force: false });
  await RefreshToken.sync();

  // 2. Seed Platform Settings
  let [platform] = await PlatformSetting.findOrCreate({
    where: { id: 1 },
    defaults: {
      id: 1,
      data: {
        ...PLATFORM_DEFAULTS,
        platformName: "SuperMart POS",
        tagline: "Modern Retail SaaS",
        allowSignup: false,
        signupInviteCode: "Beta@2026",
        _signupPolicyVersion: SIGNUP_POLICY_VERSION,
      },
    },
  });
  platform.data = {
    ...platform.data,
    allowSignup: false,
    signupInviteCode: "Beta@2026",
  };
  await platform.save();

  // 3. Seed Test Shop (FreshMart Superstore) FIRST (users reference shop.id)
  const tenantDbName = "sm_test_shop_1";
  let shop = await Shop.findByPk(1);
  if (!shop) {
    shop = await Shop.create({
      id: 1,
      name: "FreshMart Superstore",
      ownerEmail: "owner@freshmart.com",
      plan: "pro",
      dbName: tenantDbName,
      subscriptionEnds: null,
      isActive: true,
    });
  } else {
    shop.name = "FreshMart Superstore";
    shop.dbName = tenantDbName;
    shop.isActive = true;
    await shop.save();
  }

  // 4. Seed Platform Super Admin
  const adminEmail = "admin@supermarket.com";
  let admin = await User.findOne({ where: { email: adminEmail } });
  if (!admin) {
    admin = await User.create({
      shopId: shop.id,
      username: "Platform Admin",
      email: adminEmail,
      password: "admin123",
      role: "owner",
      isSuperAdmin: true,
      isActive: true,
    });
  } else {
    admin.isSuperAdmin = true;
    admin.password = "admin123";
    await admin.save();
  }

  // 5. Seed Shop Users (Owner, Manager, Cashier)
  const usersToSeed = [
    { email: "owner@freshmart.com", username: "FreshMart Owner", role: "owner" },
    { email: "manager@freshmart.com", username: "Store Manager", role: "manager" },
    { email: "cashier@freshmart.com", username: "Store Cashier", role: "cashier" },
  ];

  for (const u of usersToSeed) {
    let existingUser = await User.findOne({ where: { email: u.email } });
    if (!existingUser) {
      await User.create({
        shopId: shop.id,
        username: u.username,
        email: u.email,
        password: "admin123",
        role: u.role,
        isSuperAdmin: false,
        isActive: true,
      });
    } else {
      existingUser.username = u.username;
      existingUser.role = u.role;
      existingUser.password = "admin123";
      existingUser.isActive = true;
      existingUser.shopId = shop.id;
      await existingUser.save();
    }
  }

  console.log("   ✅ Master DB seeded: Platform settings, Super Admin, Shop 1 & users (owner, manager, cashier)");

  // 6. Connect & Seed Tenant Database (sm_test_shop_1)
  await createDatabaseIfMissing(tenantDbName);
  const tenantSequelize = createTenantSequelize(tenantDbName);
  const m = defineTenantModels(tenantSequelize);
  await tenantSequelize.authenticate();
  await tenantSequelize.sync({ force: false });

  // 7. Seed Shop Settings
  const defaultShopSettings = {
    businessName: "FreshMart Superstore",
    businessType: "supermarket",
    tagline: "Fresh groceries every day",
    phone: "9876500001",
    email: "store@freshmart.com",
    gstNumber: "33ABCDE1234F1Z5",
    fssaiNumber: "12423000000123",
    state: "Tamil Nadu",
    address: "42 Market Road",
    city: "Chennai",
    pincode: "600001",
    currencySymbol: "₹",
    currencyName: "Rupees",
    pricesIncludeTax: true,
    taxEnabled: true,
    roundOff: true,
    billPrefix: "INV",
    returnPrefix: "RET",
    cashierCanDiscount: true,
    cashierCanCancel: true,
    allowCreditSale: true,
    requireCustomerForCredit: true,
    loyaltyEnabled: true,
    loyaltyEarnPer100: 1,
    loyaltyPointValue: 1,
    loyaltyMinRedeem: 10,
    categories: ["Groceries", "Staples", "Dairy", "Beverages", "Snacks", "Oils", "Bakery"],
    paymentMethods: ["cash", "upi", "card", "credit"],
  };

  let [shopSetting] = await m.Setting.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1, data: defaultShopSettings, billSeq: 0 },
  });
  shopSetting.data = mergeSettings(defaultShopSettings);
  shopSetting.billSeq = 0;
  await shopSetting.save();

  // Clean existing transactional rows for clean reproducible test runs
  await m.BillItem.destroy({ where: {} });
  await m.SaleReturnItem.destroy({ where: {} });
  await m.SaleReturn.destroy({ where: {} });
  await m.HeldBill.destroy({ where: {} });
  await m.Bill.destroy({ where: {} });
  await m.StockMovement.destroy({ where: {} });
  await m.Product.destroy({ where: {} });
  await m.Customer.destroy({ where: {} });
  await m.Supplier.destroy({ where: {} });
  await m.Expense.destroy({ where: {} });

  // 8. Seed Supplier
  const supplier = await m.Supplier.create({
    id: 1,
    name: "Metro Wholesale Distributors",
    contactPerson: "Suresh",
    phone: "9840011122",
    email: "metro@wholesale.in",
    gstNumber: "33METR01234A1Z1",
    address: "18 Koyambedu Market",
    balance: 1500,
    notes: "Weekly dry goods delivery",
    isActive: true,
  });

  // 9. Seed Customer (Priya Sharma with 50 loyalty points)
  const customer = await m.Customer.create({
    id: 1,
    name: "Priya Sharma",
    phone: "9876543210",
    email: "priya.sharma@example.com",
    address: "12 Park Avenue, Chennai",
    loyaltyPoints: 50,
    creditLimit: 2000,
    balance: 0,
    totalSpent: 0,
    totalBills: 0,
    isActive: true,
  });

  // 10. Seed Canonical Products
  await m.Product.bulkCreate([
    {
      id: 1,
      name: "Basmati Rice",
      barcode: "8901001001001",
      category: "Staples",
      brand: "India Gate",
      unit: "pcs",
      netQty: "5 kg",
      allowDecimal: false,
      mrp: 550,
      price: 499,
      costPrice: 420,
      quantity: 25,
      reorderLevel: 5,
      taxRate: 5,
      hsnCode: "1006",
      supplierId: supplier.id,
      isActive: true,
    },
    {
      id: 2,
      name: "Toor Dal (Loose)",
      barcode: "8901001001002",
      category: "Staples",
      brand: "Tata",
      unit: "kg",
      netQty: "1 kg",
      allowDecimal: true,
      mrp: 160,
      price: 140,
      costPrice: 115,
      quantity: 12.5,
      reorderLevel: 3,
      taxRate: 0,
      hsnCode: "0713",
      supplierId: supplier.id,
      isActive: true,
    },
    {
      id: 3,
      name: "Olive Oil",
      barcode: "8901001001003",
      category: "Oils",
      brand: "Fortune",
      unit: "pcs",
      netQty: "1 L",
      allowDecimal: false,
      mrp: 900,
      price: 820,
      costPrice: 700,
      quantity: 2, // Low stock: 2 <= reorderLevel 5
      reorderLevel: 5,
      taxRate: 12,
      hsnCode: "1509",
      supplierId: supplier.id,
      expiryDate: localDateStr(180),
      isActive: true,
    },
    {
      id: 4,
      name: "Almond Milk",
      barcode: "8901001001004",
      category: "Dairy",
      brand: "Amul",
      unit: "pcs",
      netQty: "1 L",
      allowDecimal: false,
      mrp: 260,
      price: 250,
      costPrice: 200,
      quantity: 0, // Out of stock
      reorderLevel: 5,
      taxRate: 5,
      hsnCode: "0401",
      supplierId: supplier.id,
      isActive: true,
    },
    {
      id: 5,
      name: "Greek Yogurt",
      barcode: "8901001001005",
      category: "Dairy",
      brand: "Epigamia",
      unit: "pcs",
      netQty: "200 g",
      allowDecimal: false,
      mrp: 90,
      price: 80,
      costPrice: 60,
      quantity: 10,
      reorderLevel: 2,
      taxRate: 5,
      hsnCode: "0403",
      supplierId: supplier.id,
      expiryDate: localDateStr(3), // Expiring soon (within 30 days)
      isActive: true,
    },
    {
      id: 6,
      name: "Brown Bread",
      barcode: "8901001001006",
      category: "Bakery",
      brand: "Modern",
      unit: "pcs",
      netQty: "400 g",
      allowDecimal: false,
      mrp: 50,
      price: 45,
      costPrice: 35,
      quantity: 5,
      reorderLevel: 2,
      taxRate: 0,
      hsnCode: "1905",
      supplierId: supplier.id,
      expiryDate: localDateStr(-2), // Expired
      isActive: true,
    },
  ]);

  console.log("   ✅ Tenant DB seeded: sm_test_shop_1 (settings, supplier, customer Priya Sharma [50 pts], 6 products)");
  console.log("🎉 Real E2E Database Seed Complete!");

  await tenantSequelize.close();
  await sequelize.close();
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Seed failed:", err);
      process.exit(1);
    });
}

module.exports = { seed, assertE2eSafety };
