// controllers/settingsController.js — per-business settings (stored in the shop's own DB)
const { asyncHandler, HttpError, bool, num } = require("../utils/helpers");
const { SHOP_SETTING_DEFAULTS, SHOP_SETTING_KEYS, mergeSettings } = require("../utils/defaults");
const { getSettingRow } = require("../utils/settings");
const { Shop } = require("../models/master");
const { normalizeGstin, isValidGstin } = require("../utils/gst");
const { logAudit } = require("../utils/auditLogger");

const ENUMS = {
  themeMode: ["light", "dark", "system"],
  sidebarStyle: ["dark", "light", "accent"],
  receiptFormat: ["thermal58", "thermal80", "a4"],
};
const LIMITS = { fontScale: [85, 120], maxBillDiscountPercent: [0, 100], timezoneOffsetMinutes: [-720, 840] };
const PAYMENT_METHODS = ["cash", "upi", "card", "credit", "wallet", "cheque", "other"];

// Coerce each incoming value to the type of its default
const sanitize = (key, value) => {
  const def = SHOP_SETTING_DEFAULTS[key];
  if (ENUMS[key]) return ENUMS[key].includes(value) ? value : def;
  if (key === "accentColor") return /^#[0-9a-fA-F]{6}$/.test(value || "") ? value : def;
  if (key === "logo") {
    const s = String(value || "").trim();
    if (!s) return "";
    // Strict shape: nothing but a base64 raster data URL. The logo is interpolated into
    // printed receipt HTML and into the PDF, so anything else (an SVG that can carry
    // markup, or stray quotes that would break out of the src="…" attribute) is rejected.
    const m = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(s);
    if (!m) throw new HttpError(400, "Logo must be a PNG, JPG or WEBP image");
    if (s.length > 700000) throw new HttpError(400, "Logo is too large (max ~500 KB)");
    return s;
  }
  if (key === "paymentMethods") {
    const list = (Array.isArray(value) ? value : []).filter((m) => PAYMENT_METHODS.includes(m));
    return list.length ? [...new Set(list)] : def;
  }
  if (typeof def === "boolean") return bool(value);
  if (typeof def === "number") {
    let n = num(value, def);
    if (LIMITS[key]) n = Math.min(LIMITS[key][1], Math.max(LIMITS[key][0], n));
    return Math.max(key === "timezoneOffsetMinutes" ? -720 : 0, n);
  }
  if (Array.isArray(def)) {
    return (Array.isArray(value) ? value : String(value || "").split(","))
      .map((v) => String(v).trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 200);
  }
  return String(value ?? "").slice(0, 2000);
};

// GET /api/settings
const getSettings = asyncHandler(async (req, res) => {
  const row = await req.db.Setting.findByPk(1);
  res.json({ success: true, data: { settings: mergeSettings(row ? row.data : {}) } });
});

// PUT /api/settings  (owner)
const updateSettings = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const row = await getSettingRow(req.db);
  const current = mergeSettings(row.data);
  const next = { ...current };
  SHOP_SETTING_KEYS.forEach((key) => {
    if (body[key] !== undefined) next[key] = sanitize(key, body[key]);
  });
  if (body.gstNumber !== undefined) {
    next.gstNumber = normalizeGstin(next.gstNumber);
    if (next.gstNumber && !isValidGstin(next.gstNumber)) throw new HttpError(400, "Enter a valid 15-character shop GSTIN");
  }
  if (!String(next.businessName || "").trim()) throw new HttpError(400, "Business name is required");
  if (!next.paymentMethods.includes(next.defaultPaymentMethod)) next.defaultPaymentMethod = next.paymentMethods[0];

  row.data = next;
  await row.save();

  // Keep the master registry (admin panel, login) in sync with the business name/phone
  const shop = await Shop.findByPk(req.shopId);
  if (shop) {
    const changes = {};
    if (next.businessName !== shop.name) changes.name = next.businessName.slice(0, 150);
    if ((next.phone || null) !== (shop.phone || null)) changes.phone = next.phone ? next.phone.slice(0, 20) : null;
    if (Object.keys(changes).length) await shop.update(changes);
  }

  const changedKeys = {};
  for (const key of Object.keys(next)) {
    if (JSON.stringify(current[key]) !== JSON.stringify(next[key])) {
      if (key === "logo") {
        changedKeys[key] = { from: current[key] ? "[image]" : null, to: next[key] ? "[image]" : null };
      } else {
        changedKeys[key] = { from: current[key], to: next[key] };
      }
    }
  }

  if (Object.keys(changedKeys).length > 0) {
    await logAudit(req, {
      action: "SETTINGS_UPDATED",
      entityType: "setting",
      entityId: "1",
      details: { changedKeys: Object.keys(changedKeys) },
      diff: changedKeys,
    });
  }

  res.json({ success: true, message: "Settings saved", data: { settings: next } });
});

// POST /api/settings/reset-appearance
const resetAppearance = asyncHandler(async (req, res) => {
  const row = await getSettingRow(req.db);
  const next = mergeSettings(row.data);
  ["themeMode", "accentColor", "sidebarStyle", "fontScale", "compactMode"].forEach((k) => {
    next[k] = SHOP_SETTING_DEFAULTS[k];
  });
  row.data = next;
  await row.save();
  res.json({ success: true, message: "Appearance reset", data: { settings: next } });
});

module.exports = { getSettings, updateSettings, resetAppearance };
