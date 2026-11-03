// controllers/staffController.js — shop owner manages logins for managers / cashiers
const { Op } = require("sequelize");
const { User, RefreshToken } = require("../models/master");
const { asyncHandler, HttpError, str, bool } = require("../utils/helpers");
const { getPlatformSettings, planLimits } = require("../utils/settings");
const { logAudit } = require("../utils/auditLogger");

const ROLES = ["owner", "manager", "cashier"];

const getStaff = asyncHandler(async (req, res) => {
  const users = await User.findAll({ where: { shopId: req.shopId }, order: [["role", "ASC"], ["createdAt", "ASC"]] });
  const platform = await getPlatformSettings();
  res.json({ success: true, data: { staff: users.map((u) => u.toSafeJSON()), limits: planLimits(platform, req.shop.plan) } });
});

const createStaff = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || "").trim().toLowerCase();
  const username = str(b.username, 60);
  const role = ROLES.includes(b.role) ? b.role : "cashier";
  if (!username || !email || !b.password) throw new HttpError(400, "Name, email and password are required");
  if (String(b.password).length < 6) throw new HttpError(400, "Password must be at least 6 characters");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email");
  if (await User.findOne({ where: { email } })) throw new HttpError(409, "This email is already used by another account");

  if (!req.isSuperAdmin) {
    const platform = await getPlatformSettings();
    const { maxUsers } = planLimits(platform, req.shop.plan);
    const count = await User.count({ where: { shopId: req.shopId } });
    if (maxUsers && count >= maxUsers) throw new HttpError(403, `Your plan allows ${maxUsers} users. Upgrade to add more staff.`, "PLAN_LIMIT");
  }

  const user = await User.create({ shopId: req.shopId, username, email, phone: str(b.phone, 20), password: String(b.password), role });

  await logAudit(req, {
    action: "STAFF_CREATED",
    entityType: "user",
    entityId: user.id,
    details: { username: user.username, email: user.email, role: user.role },
    diff: {
      username: { from: null, to: user.username },
      email: { from: null, to: user.email },
      role: { from: null, to: user.role },
    },
  });

  res.status(201).json({ success: true, message: "Staff account created", data: { user: user.toSafeJSON() } });
});

const updateStaff = asyncHandler(async (req, res) => {
  const user = await User.findOne({ where: { id: req.params.id, shopId: req.shopId } });
  if (!user) throw new HttpError(404, "User not found");
  const b = req.body || {};
  const isSelf = user.id === req.user.id;
  let securityChanged = false;

  const oldValues = {
    username: user.username,
    email: user.email,
    role: user.role,
    phone: user.phone,
    isActive: user.isActive,
  };

  // A shop owner must never be able to take over the platform admin account that
  // happens to live in the same shop (change its email/password/role).
  if (user.isSuperAdmin && !isSelf && !req.isSuperAdmin) {
    throw new HttpError(403, "The platform admin account cannot be edited from here");
  }

  if (b.username !== undefined) user.username = str(b.username, 60) || user.username;
  if (b.phone !== undefined) user.phone = str(b.phone, 20);
  if (b.email !== undefined) {
    const email = String(b.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email");
    if (await User.findOne({ where: { email, id: { [Op.ne]: user.id } } })) throw new HttpError(409, "Email already in use");
    user.email = email;
    securityChanged = true;
  }
  if (b.role !== undefined && ROLES.includes(b.role) && b.role !== user.role) {
    if (isSelf) throw new HttpError(400, "You cannot change your own role");
    if (user.role === "owner") {
      const owners = await User.count({ where: { shopId: req.shopId, role: "owner", isActive: true } });
      if (owners <= 1) throw new HttpError(400, "A shop must keep at least one owner");
    }
    user.role = b.role;
    securityChanged = true;
  }
  if (b.isActive !== undefined && bool(b.isActive) !== user.isActive) {
    if (isSelf) throw new HttpError(400, "You cannot deactivate yourself");
    user.isActive = bool(b.isActive);
    securityChanged = true;
  }
  if (b.password) {
    if (String(b.password).length < 6) throw new HttpError(400, "Password must be at least 6 characters");
    user.password = String(b.password);
    securityChanged = true;
  }

  // Revoke previous tokens if security-sensitive permissions, active state, or password changed
  if (securityChanged) {
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await RefreshToken.update({ isRevoked: true }, { where: { userId: user.id } });
  }

  await user.save();

  const staffDiff = {};
  if (user.username !== oldValues.username) staffDiff.username = { from: oldValues.username, to: user.username };
  if (user.email !== oldValues.email) staffDiff.email = { from: oldValues.email, to: user.email };
  if (user.role !== oldValues.role) staffDiff.role = { from: oldValues.role, to: user.role };
  if (user.phone !== oldValues.phone) staffDiff.phone = { from: oldValues.phone, to: user.phone };
  if (user.isActive !== oldValues.isActive) staffDiff.isActive = { from: oldValues.isActive, to: user.isActive };
  if (b.password) staffDiff.password = { from: "[hidden]", to: "[changed]" };

  if (Object.keys(staffDiff).length > 0) {
    await logAudit(req, {
      action: "STAFF_UPDATED",
      entityType: "user",
      entityId: user.id,
      details: { username: user.username, email: user.email, role: user.role },
      diff: staffDiff,
    });
  }

  res.json({ success: true, message: "Staff updated", data: { user: user.toSafeJSON() } });
});

const deleteStaff = asyncHandler(async (req, res) => {
  const user = await User.findOne({ where: { id: req.params.id, shopId: req.shopId } });
  if (!user) throw new HttpError(404, "User not found");
  if (user.id === req.user.id) throw new HttpError(400, "You cannot delete yourself");
  if (user.isSuperAdmin) throw new HttpError(400, "The platform admin cannot be deleted");
  if (user.role === "owner") {
    const owners = await User.count({ where: { shopId: req.shopId, role: "owner" } });
    if (owners <= 1) throw new HttpError(400, "A shop must keep at least one owner");
  }
  await RefreshToken.destroy({ where: { userId: user.id } });
  await user.destroy();

  await logAudit(req, {
    action: "STAFF_DELETED",
    entityType: "user",
    entityId: user.id,
    details: { username: user.username, email: user.email, role: user.role },
    diff: {
      deleted: { from: false, to: true },
    },
  });

  res.json({ success: true, message: "Staff removed" });
});

module.exports = { getStaff, createStaff, updateStaff, deleteStaff };
