// controllers/platformController.js — public platform info (used by login / signup pages)
const { asyncHandler } = require("../utils/helpers");
const { getPlatformSettings } = require("../utils/settings");

const getPublicSettings = asyncHandler(async (req, res) => {
  const p = await getPlatformSettings();
  res.json({
    success: true,
    data: {
      platformName: p.platformName,
      tagline: p.tagline,
      allowSignup: p.allowSignup,
      hasInviteCode: !p.allowSignup && !!(p.signupInviteCode || process.env.SIGNUP_INVITE_CODE),
      trialDays: p.trialDays,
      supportEmail: p.supportEmail,
      supportPhone: p.supportPhone,
      defaultThemeMode: p.defaultThemeMode,
      defaultAccentColor: p.defaultAccentColor,
      currencySymbol: p.currencySymbol,
      plans: Object.fromEntries(
        Object.entries(p.plans).map(([k, v]) => [k, { label: v.label, price: v.price, maxUsers: v.maxUsers, maxProducts: v.maxProducts }]),
      ),
    },
  });
});

module.exports = { getPublicSettings };
