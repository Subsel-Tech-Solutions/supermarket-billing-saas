// Known temporary / disposable email domains
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "tempmail.com", "throwawaymail.com", "guerrillamail.com", "mailinator.com",
  "10minutemail.com", "trashmail.com", "yopmail.com", "sharklasers.com",
  "dispostable.com", "getairmail.com", "temp-mail.org", "fakeinbox.com",
]);

const isDisposableEmail = (email) => {
  const domain = String(email || "").split("@")[1]?.toLowerCase();
  return domain ? DISPOSABLE_EMAIL_DOMAINS.has(domain) : false;
};
// utils/shopService.js — create a business: master rows + its own private database
const { sequelize, Shop, User } = require("../models/master");
const { provisionTenant, dbNameForShop, closeTenant } = require("../tenant/tenantManager");
const { HttpError, str } = require("./helpers");
const { getPlatformSettings } = require("./settings");

const createShopWithOwner = async ({
  shopName,
  email,
  username,
  password,
  phone,
  address,
  businessType = "supermarket",
  plan = "free",
  days,
}) => {
  const name = str(shopName, 150);
  const mail = String(email || "").trim().toLowerCase();
  if (!name || !mail || !password) throw new HttpError(400, "Business name, email and password are required");
  if (String(password).length < 6) throw new HttpError(400, "Password must be at least 6 characters");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw new HttpError(400, "Enter a valid email address");

  const platform = await getPlatformSettings();
  if (isDisposableEmail(mail)) {
    throw new HttpError(400, "Disposable and temporary email addresses are not allowed. Please use a valid business email.");
  }

  const maxTenants = platform.maxTenants || parseInt(process.env.MAX_TENANTS || "100", 10);
  const activeCount = await Shop.count({ where: { isActive: true } });
  if (activeCount >= maxTenants) {
    throw new HttpError(429, "New business registrations are currently at capacity. Please contact support.", "TENANT_QUOTA_REACHED");
  }

  if (await User.findOne({ where: { email: mail } })) throw new HttpError(409, "Email already registered");

  const validDays = Number.isFinite(Number(days)) && Number(days) > 0 ? Number(days) : platform.trialDays || 14;
  const ends = new Date(Date.now() + validDays * 86400000);

  const t = await sequelize.transaction();
  let shop;
  let user;
  try {
    shop = await Shop.create(
      {
        name,
        ownerEmail: mail,
        phone: str(phone, 20),
        address: str(address, 1000),
        businessType: str(businessType, 40) || "supermarket",
        plan: platform.plans[plan] ? plan : "free",
        subscriptionEnds: ends,
        isActive: true,
      },
      { transaction: t },
    );
    shop.dbName = dbNameForShop(shop.id);
    await shop.save({ transaction: t });

    user = await User.create(
      {
        shopId: shop.id,
        username: str(username, 60) || "Owner",
        email: mail,
        phone: str(phone, 20),
        password: String(password),
        role: "owner",
      },
      { transaction: t },
    );
    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }

  // Create the shop's own database (outside the transaction — DDL can't be rolled back)
  try {
    await provisionTenant(shop, {
      businessName: name,
      phone: str(phone, 20) || "",
      email: mail,
      address: str(address, 1000) || "",
      themeMode: platform.defaultThemeMode,
      accentColor: platform.defaultAccentColor,
      currencySymbol: platform.currencySymbol || "₹",
    });
  } catch (err) {
    // Undo the master rows so the email can be used again
    await User.destroy({ where: { id: user.id } }).catch(() => {});
    await Shop.destroy({ where: { id: shop.id } }).catch(() => {});
    await closeTenant(shop.dbName);
    console.error("Tenant provisioning failed:", err);
    throw new HttpError(
      500,
      "Could not create the business database. Make sure the DB user has CREATE DATABASE permission.",
    );
  }

  return { shop, user };
};

module.exports = { createShopWithOwner };
