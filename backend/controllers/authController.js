// controllers/authController.js — HTTP-only cookie-based authentication with refresh rotation & revocation
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { Op } = require("sequelize");
const { sequelize, User, Shop, RefreshToken, PasswordResetToken } = require("../models/master");
const {
  setAuthCookies,
  clearAuthCookies,
  revokeAllUserTokens,
  revokeTokenFamily,
  hashToken,
  isSuperAdminUser,
} = require("../middleware/auth");
const { setCsrfCookie } = require("../middleware/csrf");
const { asyncHandler, HttpError, str } = require("../utils/helpers");
const { getPlatformSettings } = require("../utils/settings");
const { shopPayload } = require("../utils/shopPayload");
const { createShopWithOwner } = require("../utils/shopService");
const { sendPasswordResetEmail } = require("../utils/passwordResetEmail");

const JWT_REFRESH_SECRET = () => process.env.JWT_REFRESH_SECRET || `${process.env.JWT_SECRET}_refresh`;

const sessionPayload = async (user, shop) => {
  const platform = await getPlatformSettings();
  const superAdmin = isSuperAdminUser(user);
  return {
    user: { ...user.toSafeJSON(), isSuperAdmin: superAdmin },
    shop: shopPayload(shop, platform, superAdmin),
  };
};

// POST /api/auth/register — public SaaS signup (creates business + owner + private DB + cookies)
const register = asyncHandler(async (req, res) => {
  const platform = await getPlatformSettings();
  if (!platform.allowSignup) throw new HttpError(403, "New signups are currently closed. Contact the administrator.");

  const { shopName, username, email, password, phone, address, businessType } = req.body || {};
  const { shop, user } = await createShopWithOwner({ shopName, username, email, password, phone, address, businessType });

  await setAuthCookies(res, user);

  res.status(201).json({
    success: true,
    message: "Account created successfully",
    data: await sessionPayload(user, shop),
  });
});

// POST /api/auth/login — authenticates and sets HTTP-only cookies
const login = asyncHandler(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = req.body?.password;
  if (!email || !password) throw new HttpError(400, "Email and password are required");

  const user = await User.findOne({ where: { email }, include: [{ model: Shop, as: "shop" }] });
  if (!user || !(await user.comparePassword(password))) throw new HttpError(401, "Invalid email or password");
  if (!user.isActive) throw new HttpError(403, "Your account is disabled. Contact your shop owner.");
  if (!user.shop) throw new HttpError(403, "Shop not found");
  if (!user.shop.isActive && !isSuperAdminUser(user)) throw new HttpError(403, "Your shop is inactive. Contact support.");

  user.lastLoginAt = new Date();
  await user.save({ fields: ["lastLoginAt"] });

  await setAuthCookies(res, user);

  res.json({
    success: true,
    message: "Login successful",
    data: await sessionPayload(user, user.shop),
  });
});

// POST /api/auth/refresh — rotates refresh token & issues new access token in HTTP-only cookies
const refresh = asyncHandler(async (req, res) => {
  const rawRefreshToken = req.cookies?.refreshToken;
  if (!rawRefreshToken) {
    clearAuthCookies(res);
    throw new HttpError(401, "No refresh token provided", "NO_REFRESH_TOKEN");
  }

  let decoded;
  try {
    decoded = jwt.verify(rawRefreshToken, JWT_REFRESH_SECRET());
  } catch (err) {
    clearAuthCookies(res);
    throw new HttpError(401, "Refresh token expired or invalid", "REFRESH_TOKEN_EXPIRED");
  }

  const tokenHash = hashToken(rawRefreshToken);
  const tokenRecord = await RefreshToken.findOne({ where: { tokenHash } });

  // ── Reuse Detection ───────────────────────────────────────────────────────────
  // If the token is not found or is already revoked, an attacker or compromised client
  // is presenting an old refresh token. Revoke the entire family immediately!
  if (!tokenRecord || tokenRecord.isRevoked) {
    if (decoded?.family) {
      await revokeTokenFamily(decoded.family);
    }
    if (decoded?.id) {
      await revokeAllUserTokens(decoded.id);
    }
    clearAuthCookies(res);
    throw new HttpError(401, "Refresh token reuse detected. All sessions revoked for security.", "REFRESH_TOKEN_REUSED");
  }

  // Check token expiry in DB
  if (new Date(tokenRecord.expiresAt).getTime() < Date.now()) {
    tokenRecord.isRevoked = true;
    await tokenRecord.save();
    clearAuthCookies(res);
    throw new HttpError(401, "Refresh token expired", "REFRESH_TOKEN_EXPIRED");
  }

  // Load user from master DB
  const user = await User.findByPk(decoded.id, { include: [{ model: Shop, as: "shop" }] });
  if (!user || !user.isActive) {
    clearAuthCookies(res);
    throw new HttpError(401, "User not found or inactive", "USER_INACTIVE");
  }

  // Validate tokenVersion
  if ((user.tokenVersion || 0) !== (decoded.tokenVersion || 0)) {
    tokenRecord.isRevoked = true;
    await tokenRecord.save();
    clearAuthCookies(res);
    throw new HttpError(401, "Session revoked. Please login again.", "TOKEN_REVOKED");
  }

  if (!user.shop) {
    clearAuthCookies(res);
    throw new HttpError(403, "Shop not found", "SHOP_NOT_FOUND");
  }

  if (!user.shop.isActive && !isSuperAdminUser(user)) {
    clearAuthCookies(res);
    throw new HttpError(403, "Your shop is inactive. Contact support.", "SHOP_INACTIVE");
  }

  // ── Token Rotation ────────────────────────────────────────────────────────────
  // Mark current refresh token as revoked/used
  tokenRecord.isRevoked = true;
  await tokenRecord.save();

  // Issue new tokens in the SAME family
  await setAuthCookies(res, user, tokenRecord.family);

  res.json({
    success: true,
    message: "Session refreshed successfully",
    data: await sessionPayload(user, user.shop),
  });
});

// POST /api/auth/logout — revokes session & clears authentication cookies
const logout = asyncHandler(async (req, res) => {
  const rawRefreshToken = req.cookies?.refreshToken;
  if (rawRefreshToken) {
    try {
      const decoded = jwt.verify(rawRefreshToken, JWT_REFRESH_SECRET());
      if (decoded?.family) {
        await revokeTokenFamily(decoded.family);
      }
    } catch {
      // Ignore verification error on logout
      const tokenHash = hashToken(rawRefreshToken);
      await RefreshToken.update({ isRevoked: true }, { where: { tokenHash } });
    }
  }

  clearAuthCookies(res);
  res.json({ success: true, message: "Logged out successfully" });
});

// GET /api/auth/me — returns current session payload
const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await sessionPayload(req.user, req.shop) });
});

// GET /api/auth/csrf — sets & returns CSRF token
const getCsrf = asyncHandler(async (req, res) => {
  const token = setCsrfCookie(res);
  res.json({ success: true, csrfToken: token });
});

// PUT /api/auth/profile
const updateProfile = asyncHandler(async (req, res) => {
  const username = str(req.body?.username, 60);
  const phone = str(req.body?.phone, 20);
  if (!username) throw new HttpError(400, "Name is required");
  const user = await User.findByPk(req.user.id);
  user.username = username;
  user.phone = phone;
  await user.save();
  res.json({ success: true, message: "Profile updated", data: { user: { ...user.toSafeJSON(), isSuperAdmin: req.isSuperAdmin } } });
});

// PUT /api/auth/change-password — revokes all old sessions & issues fresh cookies
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) throw new HttpError(400, "Both passwords are required");
  if (String(newPassword).length < 6) throw new HttpError(400, "New password must be at least 6 characters");
  const user = await User.findByPk(req.user.id);
  if (!(await user.comparePassword(currentPassword))) throw new HttpError(400, "Current password is incorrect");

  // Increment tokenVersion to immediately invalidate all previously issued access tokens
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.password = String(newPassword);
  await user.save();

  // Invalidate all existing refresh tokens for this user
  await RefreshToken.update({ isRevoked: true }, { where: { userId: user.id } });

  // Issue fresh cookies for the current session
  await setAuthCookies(res, user);

  res.json({ success: true, message: "Password updated successfully" });
});

// POST /api/auth/forgot-password — sends a short-lived, single-use reset link
const forgotPassword = asyncHandler(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address");
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.FRONTEND_URL) {
    throw new HttpError(503, "Password reset email is not configured. Contact your administrator.");
  }

  const user = await User.findOne({ where: { email, isActive: true } });
  if (user) {
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await PasswordResetToken.destroy({ where: { userId: user.id } });
    await PasswordResetToken.create({ userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) });

    const appUrl = process.env.FRONTEND_URL.replace(/\/+$/, "");
    try {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.username,
        resetUrl: `${appUrl}/reset-password?token=${encodeURIComponent(rawToken)}`,
      });
    } catch (err) {
      await PasswordResetToken.destroy({ where: { tokenHash } });
      console.error("Password reset email could not be sent:", err.message);
      throw new HttpError(503, "Unable to send a password reset email right now. Please try again later.");
    }
  }

  res.json({ success: true, message: "If an account exists for that email, a reset link is on its way." });
});

// POST /api/auth/reset-password — consumes the reset link and revokes all old sessions
const resetPassword = asyncHandler(async (req, res) => {
  const rawToken = String(req.body?.token || "");
  const password = String(req.body?.password || "");
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(rawToken)) throw new HttpError(400, "This password reset link is invalid or has expired");
  if (password.length < 8 || password.length > 128) throw new HttpError(400, "Password must be between 8 and 128 characters");

  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const transaction = await sequelize.transaction();
  try {
    const reset = await PasswordResetToken.findOne({
      where: { tokenHash, usedAt: null, expiresAt: { [Op.gt]: new Date() } },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!reset) throw new HttpError(400, "This password reset link is invalid or has expired");

    const user = await User.findByPk(reset.userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user || !user.isActive) throw new HttpError(400, "This password reset link is invalid or has expired");

    user.password = password;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save({ transaction });
    await RefreshToken.update({ isRevoked: true }, { where: { userId: user.id }, transaction });
    await PasswordResetToken.update({ usedAt: new Date() }, { where: { userId: user.id, usedAt: null }, transaction });
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  res.json({ success: true, message: "Password reset. You can now sign in with your new password." });
});

module.exports = { register, login, refresh, logout, getMe, getCsrf, updateProfile, changePassword, forgotPassword, resetPassword };
