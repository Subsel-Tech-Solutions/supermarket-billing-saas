// controllers/adminController.js — PLATFORM super-admin: manage every business
const { Op } = require("sequelize");
const jwt = require("jsonwebtoken");
const { Shop, User, PlatformSetting, RefreshToken } = require("../models/master");
const { getTenant, closeTenant, stats: tenantStats } = require("../tenant/tenantManager");
const { createDatabaseIfMissing, assertSafeDbName, sequelize: master } = require("../config/database");
const { asyncHandler, HttpError, str, int, num, bool, round2 } = require("../utils/helpers");
const { getPlatformSettings, clearPlatformCache } = require("../utils/settings");
const { mergePlatform, SIGNUP_POLICY_VERSION } = require("../utils/defaults");
const { createShopWithOwner } = require("../utils/shopService");
const { setAuthCookies } = require("../middleware/auth");
const { shopPayload } = require("../utils/shopPayload");

// Per-shop numbers come from each shop's own database → cache briefly
const summaryCache = new Map();
const tenantSummary = async (shop) => {
  const hit = summaryCache.get(shop.id);
  if (hit && Date.now() - hit.at < 60000) return hit.value;
  let value = { products: 0, bills: 0, revenue: 0, customers: 0, dbOk: false };
  try {
    const { models } = await getTenant(shop);
    const [products, bills, revenue, customers] = await Promise.all([
      models.Product.count({ where: { isActive: true } }),
      models.Bill.count({ where: { status: { [Op.ne]: "cancelled" } } }),
      models.Bill.sum("totalAmount", { where: { status: { [Op.ne]: "cancelled" } } }),
      models.Customer.count(),
    ]);
    value = { products, bills, revenue: Number(revenue) || 0, customers, dbOk: true };
  } catch (err) {
    value.error = err.message;
  }
  summaryCache.set(shop.id, { value, at: Date.now() });
  return value;
};

// Run async fn over items with limited concurrency
const mapLimit = async (items, limit, fn) => {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
};

const shopRow = async (shop, platform) => {
  const [users, summary] = await Promise.all([User.count({ where: { shopId: shop.id } }), tenantSummary(shop)]);
  return {
    ...shopPayload(shop, platform),
    dbName: shop.dbName,
    ownerEmail: shop.ownerEmail,
    phone: shop.phone,
    address: shop.address,
    businessType: shop.businessType,
    notes: shop.notes,
    createdAt: shop.createdAt,
    users,
    ...summary,
  };
};

// A business counts as a live subscription when it is switched on and its plan has not run out.
const isLiveAt = (shop, at) => shop.isActive && (!shop.subscriptionEnds || new Date(shop.subscriptionEnds).getTime() >= at);

// Percentage change, guarding the "nothing to compare against" case.
const growthPct = (current, before) => {
  if (before > 0) return Math.round(((current - before) / before) * 100);
  return current > 0 ? 100 : 0;
};

const shopStatus = (shop, now) => {
  if (!shop.isActive) return "inactive";
  if (shop.subscriptionEnds && new Date(shop.subscriptionEnds).getTime() < now) return "expired";
  return shop.plan === "free" ? "trial" : "active";
};

// GET /api/admin/stats   (?light=1 skips the per-tenant rollups)
const getStats = asyncHandler(async (req, res) => {
  const platform = await getPlatformSettings();
  const shops = await Shop.findAll({ order: [["createdAt", "DESC"]] });
  const now = Date.now();
  const monthAgo = new Date(now - 30 * 86400000);
  const priceOf = (s) => Number(platform.plans[s.plan]?.price) || 0;

  const byPlan = {};
  shops.forEach((s) => {
    byPlan[s.plan] = (byPlan[s.plan] || 0) + 1;
  });

  const live = shops.filter((s) => isLiveAt(s, now));
  const monthlyRevenue = round2(live.reduce((a, s) => a + priceOf(s), 0));

  // "vs last month" compares against the businesses that already existed a month ago and
  // whose plan had not run out by then. Deleted businesses are gone from the table, so
  // this measures growth among the ones still on the platform.
  const existedThen = shops.filter((s) => new Date(s.createdAt).getTime() < monthAgo.getTime());
  const liveThen = existedThen.filter((s) => isLiveAt(s, monthAgo.getTime()));
  const revenueThen = round2(liveThen.reduce((a, s) => a + priceOf(s), 0));

  const recentShops = shops.slice(0, 6);
  const [totalUsers, usersThen, owners] = await Promise.all([
    User.count(),
    User.count({ where: { createdAt: { [Op.lt]: monthAgo } } }),
    recentShops.length
      ? User.findAll({ where: { shopId: recentShops.map((s) => s.id), role: "owner" }, order: [["id", "ASC"]] })
      : [],
  ]);
  const ownerByShop = new Map();
  owners.forEach((u) => {
    if (!ownerByShop.has(u.shopId)) ownerByShop.set(u.shopId, u);
  });

  const data = {
    totalShops: shops.length,
    activeShops: shops.filter((s) => s.isActive).length,
    inactiveShops: shops.filter((s) => !s.isActive).length,
    expiredShops: shops.filter((s) => s.subscriptionEnds && new Date(s.subscriptionEnds).getTime() < now).length,
    activeSubscriptions: live.length,
    monthlyRevenue,
    totalUsers,
    growth: {
      businesses: growthPct(shops.length, existedThen.length),
      users: growthPct(totalUsers, usersThen),
      subscriptions: growthPct(live.length, liveThen.length),
      revenue: growthPct(monthlyRevenue, revenueThen),
    },
    recent: recentShops.map((s) => ({
      id: s.id,
      name: s.name,
      owner: ownerByShop.get(s.id)?.username || s.ownerEmail,
      ownerEmail: s.ownerEmail,
      plan: s.plan,
      planLabel: platform.plans[s.plan]?.label || s.plan,
      status: shopStatus(s, now),
      createdAt: s.createdAt,
    })),
    byPlan,
    plans: platform.plans,
    currencySymbol: platform.currencySymbol || "₹",
    connections: tenantStats().openConnections,
  };

  // Rolling these up opens one database connection per business, which is far too heavy
  // for a dashboard that does not show them. Only the Businesses tab asks for them.
  if (req.query.light !== "1") {
    const summaries = await mapLimit(shops, 5, tenantSummary);
    data.totalProducts = summaries.reduce((a, s) => a + s.products, 0);
    data.totalBills = summaries.reduce((a, s) => a + s.bills, 0);
    data.totalRevenue = summaries.reduce((a, s) => a + s.revenue, 0);
    data.totalCustomers = summaries.reduce((a, s) => a + s.customers, 0);
  }

  res.json({ success: true, data });
});

// GET /api/admin/shops
const getShops = asyncHandler(async (req, res) => {
  const platform = await getPlatformSettings();
  const where = {};
  if (req.query.search) {
    const q = `%${req.query.search}%`;
    where[Op.or] = [{ name: { [Op.like]: q } }, { ownerEmail: { [Op.like]: q } }, { phone: { [Op.like]: q } }];
  }
  const shops = await Shop.findAll({ where, order: [["createdAt", "DESC"]] });
  const data = await mapLimit(shops, 5, (s) => shopRow(s, platform));
  res.json({ success: true, data: { shops: data } });
});

// GET /api/admin/users — every login on the platform, with the business it belongs to
const getUsers = asyncHandler(async (req, res) => {
  const search = str(req.query.search, 120);
  const where = {};
  if (search) {
    const q = `%${search}%`;
    where[Op.or] = [{ username: { [Op.like]: q } }, { email: { [Op.like]: q } }, { phone: { [Op.like]: q } }];
  }
  if (req.query.role) where.role = req.query.role;
  if (req.query.shopId) where.shopId = int(req.query.shopId);

  const users = await User.findAll({
    where,
    order: [["createdAt", "DESC"]],
    limit: Math.min(1000, Math.max(1, int(req.query.limit, 300))),
  });
  // One lookup for the shop names rather than an include per row
  const shops = await Shop.findAll({ attributes: ["id", "name", "plan", "isActive"] });
  const shopById = new Map(shops.map((s) => [s.id, s]));

  res.json({
    success: true,
    data: {
      users: users.map((u) => ({
        ...u.toSafeJSON(),
        shopName: shopById.get(u.shopId)?.name || "—",
        shopPlan: shopById.get(u.shopId)?.plan || null,
        shopActive: !!shopById.get(u.shopId)?.isActive,
      })),
      total: users.length,
    },
  });
});

// GET /api/admin/shops/:id — detail incl. users
const getShop = asyncHandler(async (req, res) => {
  const platform = await getPlatformSettings();
  const shop = await Shop.findByPk(req.params.id);
  if (!shop) throw new HttpError(404, "Shop not found");
  summaryCache.delete(shop.id);
  const users = await User.findAll({ where: { shopId: shop.id }, order: [["createdAt", "ASC"]] });
  res.json({ success: true, data: { shop: await shopRow(shop, platform), users: users.map((u) => u.toSafeJSON()) } });
});

// POST /api/admin/shops
const createShop = asyncHandler(async (req, res) => {
  const { shopName, ownerEmail, username, password, phone, plan, days, address, businessType } = req.body || {};
  const { shop } = await createShopWithOwner({
    shopName,
    email: ownerEmail,
    username,
    password,
    phone,
    plan,
    days: days || 365,
    address,
    businessType,
  });
  res.status(201).json({ success: true, message: "Business created with its own database", data: { shopId: shop.id, dbName: shop.dbName } });
});

// PUT /api/admin/shops/:id — plan, validity, status, details
const updateShop = asyncHandler(async (req, res) => {
  const platform = await getPlatformSettings();
  const shop = await Shop.findByPk(req.params.id);
  if (!shop) throw new HttpError(404, "Shop not found");
  const b = req.body || {};
  if (b.name !== undefined) shop.name = str(b.name, 150) || shop.name;
  if (b.phone !== undefined) shop.phone = str(b.phone, 20);
  if (b.address !== undefined) shop.address = str(b.address, 1000);
  if (b.notes !== undefined) shop.notes = str(b.notes, 2000);
  if (b.plan !== undefined) {
    if (!platform.plans[b.plan]) throw new HttpError(400, "Unknown plan");
    shop.plan = b.plan;
  }
  if (b.subscriptionEnds !== undefined) shop.subscriptionEnds = b.subscriptionEnds ? new Date(b.subscriptionEnds) : null;
  if (b.extendDays) {
    const base = shop.subscriptionEnds && new Date(shop.subscriptionEnds) > new Date() ? new Date(shop.subscriptionEnds) : new Date();
    shop.subscriptionEnds = new Date(base.getTime() + int(b.extendDays) * 86400000);
  }
  if (b.isActive !== undefined) {
    if (shop.id === req.shopId && !bool(b.isActive)) throw new HttpError(400, "You cannot deactivate your own shop");
    shop.isActive = bool(b.isActive);
  }
  await shop.save();

  // keep the business name inside the shop's own settings in sync
  if (b.name !== undefined) {
    try {
      const { models } = await getTenant(shop);
      const row = await models.Setting.findByPk(1);
      if (row) {
        row.data = { ...row.data, businessName: shop.name };
        await row.save();
      }
    } catch {
      /* non-fatal */
    }
  }
  summaryCache.delete(shop.id);
  res.json({ success: true, message: "Shop updated", data: { shop: await shopRow(shop, platform) } });
});

// PATCH /api/admin/shops/:id/toggle
const toggleShop = asyncHandler(async (req, res) => {
  const shop = await Shop.findByPk(req.params.id);
  if (!shop) throw new HttpError(404, "Shop not found");
  if (shop.id === req.shopId) throw new HttpError(400, "You cannot deactivate your own shop");
  shop.isActive = !shop.isActive;
  await shop.save();

  if (!shop.isActive) {
    const users = await User.findAll({ where: { shopId: shop.id } });
    const userIds = users.map((u) => u.id);
    if (userIds.length) {
      await User.increment("tokenVersion", { where: { id: userIds } });
      await RefreshToken.update({ isRevoked: true }, { where: { userId: userIds } });
    }
  }

  res.json({ success: true, message: shop.isActive ? "Shop activated" : "Shop deactivated", data: { isActive: shop.isActive } });
});

// POST /api/admin/shops/:id/reset-password  { userId?, newPassword }
const resetPassword = asyncHandler(async (req, res) => {
  const shop = await Shop.findByPk(req.params.id);
  if (!shop) throw new HttpError(404, "Shop not found");
  const newPassword = String(req.body?.newPassword || "");
  if (newPassword.length < 6) throw new HttpError(400, "Password must be at least 6 characters");
  const where = req.body?.userId ? { id: req.body.userId, shopId: shop.id } : { shopId: shop.id, role: "owner" };
  const user = await User.findOne({ where, order: [["id", "ASC"]] });
  if (!user) throw new HttpError(404, "User not found");
  user.password = newPassword;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  await RefreshToken.update({ isRevoked: true }, { where: { userId: user.id } });
  res.json({ success: true, message: `Password reset for ${user.email}` });
});

// POST /api/admin/shops/:id/login-as — support access: cookies for the shop owner
const loginAs = asyncHandler(async (req, res) => {
  const platform = await getPlatformSettings();
  const shop = await Shop.findByPk(req.params.id);
  if (!shop) throw new HttpError(404, "Shop not found");
  const owner = await User.findOne({ where: { shopId: shop.id, role: "owner", isActive: true }, order: [["id", "ASC"]] });
  if (!owner) throw new HttpError(404, "No active owner for this shop");

  console.warn(
    `[AUDIT] ${new Date().toISOString()} support login: ${req.user.email} (user #${req.user.id}) opened shop #${shop.id} "${shop.name}" as ${owner.email}`,
  );

  const isProd = process.env.NODE_ENV === "production";
  if (req.cookies?.accessToken) {
    res.cookie("adminAccessToken", req.cookies.accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
  if (req.cookies?.refreshToken) {
    res.cookie("adminRefreshToken", req.cookies.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/api/auth",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  await setAuthCookies(res, owner);

  res.json({
    success: true,
    data: { user: owner.toSafeJSON(), shop: shopPayload(shop, platform), isImpersonating: true },
  });
});

// POST /api/admin/return-to-admin — restore admin session from admin cookies
const returnToAdmin = asyncHandler(async (req, res) => {
  const adminAccessToken = req.cookies?.adminAccessToken;
  const adminRefreshToken = req.cookies?.adminRefreshToken;
  if (!adminAccessToken) {
    throw new HttpError(400, "No admin session found to return to");
  }
  let decoded;
  try {
    decoded = jwt.verify(adminAccessToken, process.env.JWT_SECRET);
  } catch {
    throw new HttpError(401, "Admin session expired");
  }
  const admin = await User.findByPk(decoded.id, { include: [{ model: Shop, as: "shop" }] });
  if (!admin || !admin.isActive || !admin.isSuperAdmin) {
    throw new HttpError(403, "Admin user not found or inactive");
  }

  const isProd = process.env.NODE_ENV === "production";
  res.cookie("accessToken", adminAccessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60 * 1000,
  });
  if (adminRefreshToken) {
    res.cookie("refreshToken", adminRefreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/api/auth",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
  res.clearCookie("adminAccessToken", { httpOnly: true, secure: isProd, sameSite: "lax", path: "/" });
  res.clearCookie("adminRefreshToken", { httpOnly: true, secure: isProd, sameSite: "lax", path: "/api/auth" });

  const platform = await getPlatformSettings();
  res.json({
    success: true,
    message: "Returned to admin console",
    data: { user: { ...admin.toSafeJSON(), isSuperAdmin: true }, shop: shopPayload(admin.shop, platform, true) },
  });
});

// DELETE /api/admin/shops/:id  { confirm: "<shop name>" } — drops the shop's database permanently
const deleteShop = asyncHandler(async (req, res) => {
  const shop = await Shop.findByPk(req.params.id);
  if (!shop) throw new HttpError(404, "Shop not found");
  if (shop.id === req.shopId) throw new HttpError(400, "You cannot delete your own shop");
  if (String(req.body?.confirm || "").trim() !== shop.name) throw new HttpError(400, "Type the exact shop name to confirm deletion");
  const dbName = shop.dbName;
  await closeTenant(dbName);
  if (dbName) {
    assertSafeDbName(dbName);
    await master.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  }
  await User.destroy({ where: { shopId: shop.id } });
  await shop.destroy();
  summaryCache.delete(shop.id);
  res.json({ success: true, message: `"${shop.name}" and its database were deleted` });
});

// POST /api/admin/shops/:id/repair-db — re-create database / tables if missing
const repairDb = asyncHandler(async (req, res) => {
  const shop = await Shop.findByPk(req.params.id);
  if (!shop) throw new HttpError(404, "Shop not found");
  await closeTenant(shop.dbName);
  await createDatabaseIfMissing(shop.dbName);
  await getTenant(shop);
  summaryCache.delete(shop.id);
  res.json({ success: true, message: "Database verified" });
});

// GET /api/admin/settings
const getPlatform = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { settings: await getPlatformSettings(true) } });
});

// PUT /api/admin/settings
const updatePlatform = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const current = await getPlatformSettings(true);
  const next = { ...current };
  ["platformName", "tagline", "supportEmail", "supportPhone", "currencySymbol"].forEach((k) => {
    if (b[k] !== undefined) next[k] = String(b[k] ?? "").slice(0, 200);
  });
  if (b.allowSignup !== undefined) next.allowSignup = bool(b.allowSignup);
  if (b.signupInviteCode !== undefined) next.signupInviteCode = String(b.signupInviteCode).trim().slice(0, 100);
  if (b.maxTenants !== undefined) next.maxTenants = Math.max(1, int(b.maxTenants, 100));
  if (b.trialDays !== undefined) next.trialDays = Math.max(1, Math.min(365, int(b.trialDays, 14)));
  if (b.defaultThemeMode !== undefined) next.defaultThemeMode = ["light", "dark", "system"].includes(b.defaultThemeMode) ? b.defaultThemeMode : "light";
  if (b.defaultAccentColor !== undefined && /^#[0-9a-fA-F]{6}$/.test(b.defaultAccentColor)) next.defaultAccentColor = b.defaultAccentColor;
  if (b.plans && typeof b.plans === "object") {
    const plans = {};
    Object.entries(b.plans).forEach(([key, v]) => {
      if (!/^[a-z0-9_]{2,20}$/.test(key) || !v) return;
      plans[key] = {
        label: String(v.label || key).slice(0, 40),
        maxUsers: Math.max(0, int(v.maxUsers)),
        maxProducts: Math.max(0, int(v.maxProducts)),
        price: Math.max(0, num(v.price)),
      };
    });
    if (!plans.free) throw new HttpError(400, "The 'free' plan is required");
    next.plans = plans;
  }
  const [row] = await PlatformSetting.findOrCreate({ where: { id: 1 }, defaults: { id: 1, data: {} } });
  row.data = { ...mergePlatform(next), _signupPolicyVersion: SIGNUP_POLICY_VERSION };
  await row.save();
  clearPlatformCache();
  res.json({ success: true, message: "Platform settings saved", data: { settings: await getPlatformSettings(true) } });
});

module.exports = {
  getStats,
  getUsers,
  getShops,
  getShop,
  createShop,
  updateShop,
  toggleShop,
  resetPassword,
  loginAs,
  returnToAdmin,
  deleteShop,
  repairDb,
  getPlatform,
  updatePlatform,
};
