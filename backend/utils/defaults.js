// utils/defaults.js — default values for platform + per-business settings

const PLATFORM_DEFAULTS = {
  platformName: "SuperMart POS",
  tagline: "A premium operating system for modern retail.",
  supportEmail: "",
  supportPhone: "",
  allowSignup: process.env.ALLOW_PUBLIC_SIGNUP !== undefined
    ? process.env.ALLOW_PUBLIC_SIGNUP === "true"
    : process.env.NODE_ENV !== "production",
  trialDays: 14,
  signupInviteCode: process.env.SIGNUP_INVITE_CODE || "",
  maxTenants: parseInt(process.env.MAX_TENANTS || "100", 10),
  defaultThemeMode: "light",
  defaultAccentColor: "#bf9c5a",
  currencySymbol: "₹",
  // 0 = unlimited
  plans: {
    free: { label: "Free Trial", maxUsers: 2, maxProducts: 500, price: 0 },
    basic: { label: "Basic", maxUsers: 5, maxProducts: 5000, price: 499 },
    pro: { label: "Pro", maxUsers: 0, maxProducts: 0, price: 999 },
  },
};

const SHOP_SETTING_DEFAULTS = {
  // ── Business profile ──
  businessName: "My Supermarket",
  legalName: "",
  tagline: "Point of Sale",
  phone: "",
  email: "",
  website: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  gstNumber: "",
  fssaiNumber: "",
  logo: "", // data URL (small PNG/JPG)

  // ── Appearance ──
  themeMode: "light", // light | dark | system
  accentColor: "#bf9c5a",
  sidebarStyle: "dark", // dark | light | accent
  fontScale: 100, // % (90–115)
  compactMode: false,

  // ── Regional ──
  currencySymbol: "₹",
  currencyCode: "INR",
  locale: "en-IN",
  timezoneOffsetMinutes: 330, // IST

  // ── Tax & pricing ──
  taxEnabled: true,
  pricesIncludeTax: true, // MRP style pricing (GST included in selling price)
  defaultTaxRate: 0,
  taxLabel: "GST",
  roundOff: true, // round bill total to nearest rupee

  // ── Billing ──
  billPrefix: "INV",
  purchasePrefix: "PUR",
  returnPrefix: "RET",
  allowNegativeStock: false,
  allowCreditSale: true,
  requireCustomerForCredit: true,
  maxBillDiscountPercent: 100,
  cashierCanDiscount: true,
  cashierCanCancel: false,
  paymentMethods: ["cash", "upi", "card", "credit"],
  defaultPaymentMethod: "cash",
  autoPrintAfterSale: false,

  // ── Receipt / invoice ──
  receiptFormat: "thermal80", // thermal58 | thermal80 | a4
  showLogoOnReceipt: true,
  showMrpOnReceipt: true,
  showSavingsOnReceipt: true,
  showTaxBreakupOnReceipt: true,
  showCashierOnReceipt: true,
  receiptHeader: "",
  receiptFooter: "Thank you for shopping! Please visit again.",
  termsAndConditions: "Goods once sold can be exchanged within 7 days with bill.",

  // ── Inventory ──
  lowStockThreshold: 10,
  expiryAlertDays: 30,
  trackExpiry: true,
  units: ["pcs", "kg", "g", "l", "ml", "pack", "box", "dozen", "bottle", "bag"],
  categories: [
    "Grocery", "Rice & Grains", "Pulses", "Oil & Ghee", "Spices", "Snacks", "Beverages",
    "Dairy", "Bakery", "Fruits & Vegetables", "Frozen", "Personal Care", "Household",
    "Baby Care", "Stationery",
  ],
  expenseCategories: ["Rent", "Salary", "Electricity", "Transport", "Maintenance", "Tea & Snacks", "Other"],

  // ── Loyalty ──
  loyaltyEnabled: true,
  loyaltyEarnPer100: 1, // points earned per ₹100 spent
  loyaltyPointValue: 1, // ₹ value of 1 point when redeemed
  loyaltyMinRedeem: 50, // min points before redemption
};

// Settings keys a user may write (anything else is ignored)
const SHOP_SETTING_KEYS = Object.keys(SHOP_SETTING_DEFAULTS);

const mergeSettings = (stored) => ({ ...SHOP_SETTING_DEFAULTS, ...(stored || {}) });

const mergePlatform = (stored) => {
  const s = stored || {};
  return {
    ...PLATFORM_DEFAULTS,
    ...s,
    plans: { ...PLATFORM_DEFAULTS.plans, ...(s.plans || {}) },
  };
};

module.exports = {
  PLATFORM_DEFAULTS,
  SHOP_SETTING_DEFAULTS,
  SHOP_SETTING_KEYS,
  mergeSettings,
  mergePlatform,
};
