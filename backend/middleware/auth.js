// middleware/auth.js — Secure JWT authentication with HTTP-only cookies & tokenVersion revocation
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { User, Shop, RefreshToken } = require("../models/master");
const { getTenant } = require("../tenant/tenantManager");
const { setCsrfCookie } = require("./csrf");

const isProd = process.env.NODE_ENV === "production";

const JWT_SECRET = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not configured");
  return s;
};

const JWT_REFRESH_SECRET = () => process.env.JWT_REFRESH_SECRET || `${JWT_SECRET()}_refresh`;

const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || "15m";
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || "7d";

const ACCESS_COOKIE_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const signAccessToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      shopId: user.shopId,
      tokenVersion: user.tokenVersion || 0,
    },
    JWT_SECRET(),
    { expiresIn: ACCESS_TOKEN_EXPIRY },
  );

const signRefreshToken = (user, family) =>
  jwt.sign(
    {
      id: user.id,
      family,
      tokenVersion: user.tokenVersion || 0,
      jti: crypto.randomUUID(),
    },
    JWT_REFRESH_SECRET(),
    { expiresIn: REFRESH_TOKEN_EXPIRY },
  );

const setAuthCookies = async (res, user, existingFamily = null) => {
  const family = existingFamily || crypto.randomUUID();
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user, family);
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_COOKIE_MAX_AGE);

  // Save new refresh token in DB
  await RefreshToken.create({
    userId: user.id,
    tokenHash,
    family,
    isRevoked: false,
    expiresAt,
  });

  // Access token cookie (HTTP-only, 15 minutes)
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });

  // Refresh token cookie (HTTP-only, 7 days, restricted to auth routes)
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });

  // CSRF token cookie (readable by JS/Axios)
  setCsrfCookie(res);

  return { accessToken, refreshToken, family };
};

const clearAuthCookies = (res) => {
  const opts = { httpOnly: true, secure: isProd, sameSite: "lax" };
  res.clearCookie("accessToken", { ...opts, path: "/" });
  res.clearCookie("refreshToken", { ...opts, path: "/api/auth" });
  res.clearCookie("XSRF-TOKEN", { secure: isProd, sameSite: "lax", path: "/" });
  res.clearCookie("adminAccessToken", { ...opts, path: "/" });
  res.clearCookie("adminRefreshToken", { ...opts, path: "/api/auth" });
};

const revokeAllUserTokens = async (userId) => {
  await RefreshToken.update({ isRevoked: true }, { where: { userId } });
  await User.increment("tokenVersion", { where: { id: userId } });
};

const revokeTokenFamily = async (family) => {
  await RefreshToken.update({ isRevoked: true }, { where: { family } });
};

const deny = (res, status, message, code) =>
  res.status(status).json({ success: false, message, ...(code ? { code } : {}) });

const isSuperAdminUser = (user) =>
  !!user &&
  (user.isSuperAdmin ||
    (process.env.SUPER_ADMIN_EMAIL && user.email === String(process.env.SUPER_ADMIN_EMAIL).toLowerCase()));

const subscriptionActive = (shop) => {
  if (!shop.subscriptionEnds) return true; // no end date = lifetime
  return new Date(shop.subscriptionEnds).getTime() >= Date.now();
};

/**
 * Verifies access token from HTTP-only cookie (or Authorization Bearer fallback),
 * validates user and tokenVersion against the MASTER db, and attaches the
 * shop's private database handle as `req.db` (models) / `req.tenant`.
 */
const protect = async (req, res, next) => {
  let token = req.cookies?.accessToken;

  // Fallback to Bearer token for CLI or integration tools
  if (!token) {
    const header = req.headers.authorization || "";
    if (header.startsWith("Bearer ")) {
      token = header.slice(7);
    }
  }

  if (!token) return deny(res, 401, "Not authorized, no token", "NO_TOKEN");

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET());
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return deny(res, 401, "Access token expired", "TOKEN_EXPIRED");
    }
    return deny(res, 401, "Session invalid, please login again", "TOKEN_INVALID");
  }

  try {
    const user = await User.findByPk(decoded.id, { include: [{ model: Shop, as: "shop" }] });
    if (!user || !user.isActive) return deny(res, 401, "User not found or inactive", "USER_INACTIVE");

    // Validate tokenVersion: if user's tokenVersion was incremented (e.g. password changed), reject!
    if ((user.tokenVersion || 0) !== (decoded.tokenVersion || 0)) {
      return deny(res, 401, "Token has been revoked, please login again", "TOKEN_REVOKED");
    }

    if (!user.shop) return deny(res, 403, "Shop not found", "SHOP_NOT_FOUND");

    const superAdmin = isSuperAdminUser(user);
    if (!user.shop.isActive && !superAdmin) {
      return deny(res, 403, "Your shop is inactive. Contact support.", "SHOP_INACTIVE");
    }

    req.user = user;
    req.shop = user.shop;
    req.shopId = user.shopId;
    req.isSuperAdmin = superAdmin;
    req.subscriptionActive = superAdmin || subscriptionActive(user.shop);

    const tenant = await getTenant(user.shop);
    req.tenant = tenant;
    req.db = tenant.models;
    next();
  } catch (err) {
    next(err);
  }
};

// Block every write (POST/PUT/PATCH/DELETE) when the plan/trial has expired.
const requireActiveSubscription = (req, res, next) => {
  if (req.method === "GET" || req.subscriptionActive) return next();
  return deny(res, 402, "Your subscription / trial has expired. Please renew to continue.", "SUBSCRIPTION_EXPIRED");
};

// allow('owner','manager') → only these shop roles may continue
const allow = (...roles) => (req, res, next) => {
  if (req.isSuperAdmin || roles.includes(req.user.role)) return next();
  return deny(res, 403, "You don't have permission to do this", "FORBIDDEN");
};

const requireSuperAdmin = (req, res, next) => {
  if (!req.isSuperAdmin) return deny(res, 403, "Platform admin access only", "FORBIDDEN");
  next();
};

module.exports = {
  protect,
  requireActiveSubscription,
  allow,
  requireSuperAdmin,
  signAccessToken,
  signRefreshToken,
  hashToken,
  setAuthCookies,
  clearAuthCookies,
  revokeAllUserTokens,
  revokeTokenFamily,
  isSuperAdminUser,
  subscriptionActive,
  ACCESS_COOKIE_MAX_AGE,
  REFRESH_COOKIE_MAX_AGE,
};
