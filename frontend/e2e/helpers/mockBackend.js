// e2e/helpers/mockBackend.js — Stateful in-memory backend mock + UI helpers for Playwright E2E tests

const pad = (n, w = 6) => String(n).padStart(w, "0");
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const round3 = (v) => Math.round((Number(v) || 0) * 1000) / 1000;
const num = (v, fb = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fb;
};

const localDate = (daysOffset = 0) => {
  const d = new Date(Date.now() + daysOffset * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const defaultSettings = (businessName = "FreshMart Superstore", overrides = {}) => ({
  businessName,
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
  logo: "",
  locale: "en-IN",
  currencySymbol: "₹",
  currencyName: "Rupees",
  currencySubunit: "Paise",
  themeMode: "light",
  accentColor: "#bf9c5a",
  compactMode: false,
  pricesIncludeTax: true,
  taxEnabled: true,
  taxLabel: "GST",
  roundOff: true,
  invoicePrefix: "INV",
  returnPrefix: "RET",
  allowCreditSale: true,
  requireCustomerForCredit: true,
  cashierCanDiscount: true,
  cashierCanCancel: true,
  askCustomerOnCredit: true,
  paymentMethods: ["cash", "upi", "card", "credit"],
  receiptFormat: "thermal80",
  receiptHeader: "Welcome to FreshMart",
  receiptFooter: "Thank you for shopping with us!",
  showLogoOnReceipt: true,
  showHsnOnReceipt: true,
  showMrpOnReceipt: true,
  showTaxBreakupOnReceipt: true,
  showCashierOnReceipt: true,
  showCustomerOnReceipt: true,
  lowStockDefault: 5,
  lowStockThreshold: 5,
  expiryAlertDays: 30,
  trackExpiry: true,
  loyaltyEnabled: true,
  loyaltyEarnPer100: 1,
  loyaltyPointValue: 1,
  loyaltyMinRedeem: 10,
  categories: ["Groceries", "Staples", "Dairy", "Beverages", "Snacks", "Oils"],
  expenseCategories: ["Rent", "Salary", "Electricity & Water", "Packaging & Bags", "Maintenance", "Transport", "General"],
  brands: ["Fortune", "Tata", "Aavin", "India Gate"],
  ...overrides,
});

function createSeedShopDb(shopName, opts = {}) {
  const nowIso = new Date().toISOString();
  const today = localDate(0);
  const expiringDate = localDate(5);
  const expiredDate = localDate(-3);

  const suppliers = opts.empty
    ? []
    : [
        {
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
          createdAt: nowIso,
        },
        {
          id: 2,
          name: "Aavin Dairy Depot",
          contactPerson: "Mani",
          phone: "9840033344",
          email: "orders@aavindepot.in",
          gstNumber: "",
          address: "Madhavaram Milk Colony",
          balance: 0,
          notes: "Daily dairy supply",
          isActive: true,
          createdAt: nowIso,
        },
      ];

  const products = opts.empty
    ? []
    : [
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
          supplierId: 1,
          batchNo: "BG-101",
          expiryDate: null,
          isActive: true,
          createdAt: nowIso,
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
          supplierId: 1,
          batchNo: "",
          expiryDate: null,
          isActive: true,
          createdAt: nowIso,
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
          quantity: 2,
          reorderLevel: 5,
          taxRate: 12,
          hsnCode: "1509",
          supplierId: 1,
          batchNo: "OL-22",
          expiryDate: localDate(180),
          isActive: true,
          createdAt: nowIso,
        },
        {
          id: 4,
          name: "Almond Milk",
          barcode: "8901001001004",
          category: "Beverages",
          brand: "",
          unit: "pcs",
          netQty: "1 L",
          allowDecimal: false,
          mrp: 260,
          price: 240,
          costPrice: 180,
          quantity: 0,
          reorderLevel: 4,
          taxRate: 12,
          hsnCode: "2202",
          supplierId: 2,
          batchNo: "AM-04",
          expiryDate: localDate(60),
          isActive: true,
          createdAt: nowIso,
        },
        {
          id: 5,
          name: "Greek Yogurt",
          barcode: "8901001001005",
          category: "Dairy",
          brand: "Aavin",
          unit: "pcs",
          netQty: "400 g",
          allowDecimal: false,
          mrp: 75,
          price: 65,
          costPrice: 45,
          quantity: 8,
          reorderLevel: 3,
          taxRate: 5,
          hsnCode: "0403",
          supplierId: 2,
          batchNo: "GY-09",
          expiryDate: expiringDate,
          isActive: true,
          createdAt: nowIso,
        },
        {
          id: 6,
          name: "Brown Bread",
          barcode: "8901001001006",
          category: "Groceries",
          brand: "",
          unit: "pcs",
          netQty: "400 g",
          allowDecimal: false,
          mrp: 55,
          price: 50,
          costPrice: 35,
          quantity: 3,
          reorderLevel: 2,
          taxRate: 0,
          hsnCode: "1905",
          supplierId: 1,
          batchNo: "BB-01",
          expiryDate: expiredDate,
          isActive: true,
          createdAt: nowIso,
        },
      ];

  const customers = opts.empty
    ? []
    : [
        {
          id: 1,
          name: "Priya Sharma",
          phone: "9876543210",
          email: "priya@example.com",
          address: "12 Anna Nagar",
          gstNumber: "",
          balance: 500,
          creditLimit: 2000,
          loyaltyPoints: 120,
          totalSpent: 3200,
          totalBills: 2,
          lastPurchaseAt: nowIso,
          notes: "Regular customer",
          isActive: true,
          createdAt: nowIso,
        },
        {
          id: 2,
          name: "Karthik Raja",
          phone: "9998887776",
          email: "",
          address: "5 T Nagar",
          gstNumber: "",
          balance: 0,
          creditLimit: 1000,
          loyaltyPoints: 25,
          totalSpent: 499,
          totalBills: 1,
          lastPurchaseAt: nowIso,
          notes: "",
          isActive: true,
          createdAt: nowIso,
        },
      ];

  const bills = opts.empty
    ? []
    : [
        {
          id: 1,
          billNumber: "INV-000001",
          customerId: 1,
          customerName: "Priya Sharma",
          customerPhone: "9876543210",
          customerGstNumber: "",
          cashierId: 2,
          cashierName: "Owner",
          subtotal: 998,
          itemDiscount: 0,
          discountAmount: 0,
          discountPercent: 0,
          loyaltyRedeemed: 0,
          loyaltyDiscount: 0,
          loyaltyEarned: 9,
          taxableAmount: 950.48,
          taxAmount: 47.52,
          cgst: 23.76,
          sgst: 23.76,
          igst: 0,
          interState: false,
          placeOfSupply: "Tamil Nadu",
          roundOff: 0,
          totalAmount: 998,
          paidAmount: 998,
          dueAmount: 0,
          changeReturned: 0,
          returnedAmount: 0,
          paymentMethod: "upi",
          payments: [{ method: "upi", amount: 998 }],
          pricesIncludeTax: true,
          status: "completed",
          notes: "",
          createdAt: nowIso,
          updatedAt: nowIso,
          items: [
            {
              id: 1,
              billId: 1,
              productId: 1,
              productName: "Basmati Rice",
              productBarcode: "8901001001001",
              hsnCode: "1006",
              unit: "pcs",
              mrp: 550,
              unitPrice: 499,
              costPrice: 420,
              quantity: 2,
              returnedQty: 0,
              discount: 0,
              taxRate: 5,
              taxableAmount: 950.48,
              taxAmount: 47.52,
              totalPrice: 998,
            },
          ],
        },
        {
          id: 2,
          billNumber: "INV-000002",
          customerId: 1,
          customerName: "Priya Sharma",
          customerPhone: "9876543210",
          customerGstNumber: "",
          cashierId: 2,
          cashierName: "Owner",
          subtotal: 500,
          itemDiscount: 0,
          discountAmount: 0,
          discountPercent: 0,
          loyaltyRedeemed: 0,
          loyaltyDiscount: 0,
          loyaltyEarned: 0,
          taxableAmount: 500,
          taxAmount: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          interState: false,
          placeOfSupply: "Tamil Nadu",
          roundOff: 0,
          totalAmount: 500,
          paidAmount: 0,
          dueAmount: 500,
          changeReturned: 0,
          returnedAmount: 0,
          paymentMethod: "credit",
          payments: [{ method: "credit", amount: 500 }],
          pricesIncludeTax: true,
          status: "completed",
          notes: "Monthly udhaar",
          createdAt: nowIso,
          updatedAt: nowIso,
          items: [
            {
              id: 2,
              billId: 2,
              productId: 6,
              productName: "Brown Bread",
              productBarcode: "8901001001006",
              hsnCode: "1905",
              unit: "pcs",
              mrp: 55,
              unitPrice: 50,
              costPrice: 35,
              quantity: 10,
              returnedQty: 0,
              discount: 0,
              taxRate: 0,
              taxableAmount: 500,
              taxAmount: 0,
              totalPrice: 500,
            },
          ],
        },
      ];

  const purchases = opts.empty
    ? []
    : [
        {
          id: 1,
          purchaseNumber: "PUR-000001",
          supplierId: 1,
          supplierName: "Metro Wholesale Distributors",
          invoiceNo: "MWD-881",
          purchaseDate: today,
          subtotal: 1500,
          taxAmount: 75,
          otherCharges: 0,
          discountAmount: 0,
          totalAmount: 1575,
          paidAmount: 75,
          dueAmount: 1500,
          status: "completed",
          notes: "Initial dry stock",
          createdBy: "Owner",
          createdAt: nowIso,
          items: [
            {
              id: 1,
              purchaseId: 1,
              productId: 1,
              productName: "Basmati Rice",
              quantity: 3,
              costPrice: 420,
              taxRate: 5,
              taxAmount: 63,
              totalAmount: 1323,
            },
          ],
        },
      ];

  const expenses = opts.empty
    ? []
    : [
        {
          id: 1,
          title: "Shop Electricity Bill",
          paidTo: "TANGEDCO",
          category: "Electricity & Water",
          amount: 1200,
          expenseDate: today,
          paymentMethod: "cash",
          reference: "EB-APRIL",
          notes: "Shop Electricity Bill",
          createdBy: "Owner",
          createdAt: nowIso,
        },
      ];

  const stockMovements = opts.empty
    ? []
    : [
        {
          id: 1,
          productId: 1,
          productName: "Basmati Rice",
          type: "opening",
          quantity: 25,
          balanceAfter: 25,
          reference: null,
          note: "Opening stock",
          userName: "Owner",
          createdAt: nowIso,
        },
      ];

  return {
    settings: defaultSettings(shopName, opts.settings),
    products,
    suppliers,
    supplierPayments: [],
    purchases,
    customers,
    customerPayments: [],
    bills,
    heldBills: [],
    saleReturns: [],
    expenses,
    stockMovements,
    auditLogs: opts.empty
      ? []
      : [
          {
            id: 1,
            action: "SETTINGS_UPDATED",
            entityType: "settings",
            entityId: "shop",
            username: "Owner",
            userRole: "owner",
            details: { section: "Initial setup" },
            diff: {},
            createdAt: nowIso,
          },
        ],
    seq: { billSeq: bills.length + 1, returnSeq: 1, purchaseSeq: purchases.length + 1 },
    nextId: {
      product: products.length + 1,
      supplier: suppliers.length + 1,
      supplierPayment: 1,
      purchase: purchases.length + 1,
      customer: customers.length + 1,
      customerPayment: 1,
      bill: bills.length + 1,
      billItem: 10,
      heldBill: 1,
      saleReturn: 1,
      expense: expenses.length + 1,
      movement: stockMovements.length + 1,
      auditLog: 2,
    },
  };
}

function decorateShop(shop, state) {
  const validTill = shop.subscriptionEnds || shop.validTill;
  const endsDate = validTill ? new Date(`${String(validTill).slice(0, 10)}T23:59:59Z`) : null;
  const daysLeft = endsDate ? Math.ceil((endsDate.getTime() - Date.now()) / 86400000) : null;
  const subscriptionActive = Boolean(shop.isActive) && (daysLeft === null || daysLeft >= 0);
  const planMeta = state?.platform?.plans?.[shop.plan];
  const db = state?.shopDbs?.[shop.id];
  const usersCount = state ? state.users.filter((u) => u.shopId === shop.id).length : 0;
  const owner = state ? state.users.find((u) => u.shopId === shop.id && u.role === "owner") : null;
  const revenue = db ? round2(db.bills.filter((b) => b.status !== "cancelled").reduce((a, b) => a + num(b.totalAmount), 0)) : 0;
  const status = !shop.isActive ? "inactive" : !subscriptionActive ? "expired" : shop.plan === "free" ? "trial" : "active";
  return {
    ...shop,
    subscriptionEnds: validTill ? String(validTill).slice(0, 10) : null,
    daysLeft,
    subscriptionActive,
    planLabel: planMeta?.label || shop.plan,
    dbOk: true,
    users: usersCount,
    products: db ? db.products.filter((p) => p.isActive).length : 0,
    bills: db ? db.bills.length : 0,
    customers: db ? db.customers.filter((c) => c.isActive).length : 0,
    revenue,
    owner: owner?.username || shop.ownerEmail,
    status,
  };
}

function buildLoginUser(user) {
  return {
    id: user.id,
    shopId: user.shopId,
    username: user.username,
    email: user.email,
    phone: user.phone || "",
    role: user.role,
    isActive: user.isActive,
    isSuperAdmin: Boolean(user.isSuperAdmin),
  };
}

function calcBill(lines, { billDiscount = 0, loyaltyDiscount = 0, pricesIncludeTax = true, taxEnabled = true, roundOff = true } = {}) {
  const grossLines = lines.map((l) => {
    const qty = round3(num(l.quantity));
    const price = round2(num(l.price));
    const disc = round2(Math.max(0, num(l.discount)));
    const gross = round2(price * qty);
    const net = round2(Math.max(0, gross - disc));
    return { ...l, quantity: qty, price, gross, net, taxRate: num(l.taxRate) };
  });
  const subtotal = round2(grossLines.reduce((a, l) => a + l.gross, 0));
  const itemDiscount = round2(grossLines.reduce((a, l) => a + (l.gross - l.net), 0));
  const netBeforeExtra = round2(grossLines.reduce((a, l) => a + l.net, 0));
  const extraDiscount = round2(Math.min(netBeforeExtra, Math.max(0, num(billDiscount) + num(loyaltyDiscount))));

  let taxableAmount = 0;
  let taxAmount = 0;
  let runningExtra = 0;
  const computedLines = grossLines.map((l, idx) => {
    const share =
      idx === grossLines.length - 1
        ? round2(extraDiscount - runningExtra)
        : netBeforeExtra > 0
          ? round2((l.net / netBeforeExtra) * extraDiscount)
          : 0;
    runningExtra = round2(runningExtra + share);
    const finalNet = round2(Math.max(0, l.net - share));
    const rate = taxEnabled ? l.taxRate : 0;
    let taxable = finalNet;
    let tax = 0;
    let total = finalNet;
    if (rate > 0) {
      if (pricesIncludeTax) {
        taxable = round2(finalNet / (1 + rate / 100));
        tax = round2(finalNet - taxable);
      } else {
        taxable = finalNet;
        tax = round2((finalNet * rate) / 100);
        total = round2(finalNet + tax);
      }
    }
    taxableAmount = round2(taxableAmount + taxable);
    taxAmount = round2(taxAmount + tax);
    return { ...l, finalNet, taxable, tax, total, taxRate: rate };
  });

  const rawTotal = round2(computedLines.reduce((a, l) => a + l.total, 0));
  const totalAmount = roundOff ? Math.round(rawTotal) : rawTotal;
  const roundDiff = round2(totalAmount - rawTotal);
  return {
    lines: computedLines,
    subtotal,
    itemDiscount,
    billDiscount: round2(Math.min(netBeforeExtra, Math.max(0, num(billDiscount)))),
    loyaltyDiscount: round2(Math.max(0, extraDiscount - Math.min(netBeforeExtra, Math.max(0, num(billDiscount))))),
    taxableAmount,
    taxAmount,
    cgst: round2(taxAmount / 2),
    sgst: round2(taxAmount - round2(taxAmount / 2)),
    igst: 0,
    roundOff: roundDiff,
    totalAmount,
  };
}

function getAllCategories(products, settings) {
  const cats = new Set([...(settings.categories || []), ...products.filter((p) => p.isActive).map((p) => p.category).filter(Boolean)]);
  return [...cats].sort((a, b) => a.localeCompare(b));
}

function createMockState(overrides = {}) {
  const nowIso = new Date().toISOString();
  const platform = {
    platformName: "SuperMart POS",
    tagline: "Smart Supermarket Billing & Inventory",
    supportPhone: "+91 98765 00000",
    supportEmail: "support@supermartpos.com",
    allowSignup: false,
    signupInviteCode: "INVITE2026",
    inviteCode: "INVITE2026",
    trialDays: 14,
    maxTenants: 100,
    defaultAccentColor: "#bf9c5a",
    defaultThemeMode: "light",
    currencySymbol: "₹",
    plans: {
      free: { label: "Free", price: 0, maxUsers: 2, maxProducts: 100 },
      starter: { label: "Starter", price: 499, maxUsers: 5, maxProducts: 1000 },
      pro: { label: "Pro", price: 999, maxUsers: 15, maxProducts: 10000 },
    },
    ...(overrides.platform || {}),
  };

  const shops = overrides.shops || [
    {
      id: 1,
      name: "FreshMart Superstore",
      slug: "freshmart-superstore",
      dbName: "shop_1",
      ownerEmail: "owner@freshmart.com",
      phone: "9876500001",
      plan: "pro",
      subscriptionEnds: localDate(30),
      isActive: true,
      notes: "Flagship store",
      createdAt: nowIso,
    },
    {
      id: 2,
      name: "City Kirana",
      slug: "city-kirana",
      dbName: "shop_2",
      ownerEmail: "kirana@example.com",
      phone: "9876500002",
      plan: "starter",
      subscriptionEnds: localDate(3),
      isActive: true,
      notes: "Expiring soon",
      createdAt: nowIso,
    },
    {
      id: 3,
      name: "Old Bazaar",
      slug: "old-bazaar",
      dbName: "shop_3",
      ownerEmail: "old@example.com",
      phone: "9876500003",
      plan: "free",
      subscriptionEnds: localDate(-5),
      isActive: true,
      notes: "Expired trial",
      createdAt: nowIso,
    },
  ];

  const users = overrides.users || [
    { id: 1, shopId: null, username: "Platform Admin", email: "admin@supermarket.com", phone: "9000000001", password: "admin-password", role: "owner", isSuperAdmin: true, isActive: true, createdAt: nowIso, lastLoginAt: nowIso },
    { id: 2, shopId: 1, username: "Owner", email: "owner@freshmart.com", phone: "9876500001", password: "owner-password", role: "owner", isSuperAdmin: false, isActive: true, createdAt: nowIso, lastLoginAt: nowIso },
    { id: 3, shopId: 1, username: "Store Manager", email: "manager@freshmart.com", phone: "9876500011", password: "manager-password", role: "manager", isSuperAdmin: false, isActive: true, createdAt: nowIso, lastLoginAt: nowIso },
    { id: 4, shopId: 1, username: "Counter Cashier", email: "cashier@freshmart.com", phone: "9876500012", password: "cashier-password", role: "cashier", isSuperAdmin: false, isActive: true, createdAt: nowIso, lastLoginAt: nowIso },
    { id: 5, shopId: 2, username: "Kirana Owner", email: "kirana@example.com", phone: "9876500002", password: "kirana-password", role: "owner", isSuperAdmin: false, isActive: true, createdAt: nowIso, lastLoginAt: nowIso },
    { id: 6, shopId: 3, username: "Old Owner", email: "old@example.com", phone: "9876500003", password: "old-password", role: "owner", isSuperAdmin: false, isActive: true, createdAt: nowIso, lastLoginAt: nowIso },
  ];

  const shopDbs = overrides.shopDbs || {
    1: createSeedShopDb("FreshMart Superstore"),
    2: createSeedShopDb("City Kirana", { empty: true }),
    3: createSeedShopDb("Old Bazaar", { empty: true }),
  };

  return {
    platform,
    shops,
    users,
    shopDbs,
    nextShopId: Math.max(0, ...shops.map((s) => s.id)) + 1,
    nextUserId: Math.max(0, ...users.map((u) => u.id)) + 1,
    session: overrides.session || { userId: null, activeShopId: null, impersonatingFromUserId: null },
  };
}

async function installMockApi(page, state = createMockState()) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    const method = request.method();
    const q = Object.fromEntries(url.searchParams.entries());
    let body = {};
    try {
      const raw = request.postData();
      if (raw && raw.trim().startsWith("{")) body = JSON.parse(raw);
    } catch {
      body = {};
    }

    const ok = (data = {}, message, status = 200) =>
      route.fulfill({ status, json: { success: true, ...(message ? { message } : {}), data } });
    const fail = (status, message) =>
      route.fulfill({ status, json: { success: false, message } });

    const currentUser = () => state.users.find((u) => u.id === state.session.userId) || null;
    const activeShop = () => {
      const u = currentUser();
      if (!u) return null;
      const sid = state.session.activeShopId ?? u.shopId;
      const s = state.shops.find((x) => x.id === sid);
      return s ? decorateShop(s, state) : null;
    };
    const isImpersonating = () => Boolean(state.session.impersonatingFromUserId && state.session.activeShopId);
    const isSuperAdminOnly = () => {
      const u = currentUser();
      return Boolean(u?.isSuperAdmin && !isImpersonating());
    };
    const getDb = () => {
      const s = activeShop();
      if (!s) return null;
      if (!state.shopDbs[s.id]) state.shopDbs[s.id] = createSeedShopDb(s.name, { empty: true });
      return state.shopDbs[s.id];
    };
    const requireAuth = () => {
      const u = currentUser();
      if (!u || !u.isActive) {
        fail(401, "Not signed in");
        return null;
      }
      return u;
    };
    const requireWriteSubscription = () => {
      const u = requireAuth();
      if (!u) return null;
      const s = activeShop();
      if (s && !s.subscriptionActive && !u.isSuperAdmin) {
        fail(402, "Subscription expired. Please renew to make changes.");
        return null;
      }
      return u;
    };
    const addAudit = (db, u, action, entityType, entityId, details = {}, diff = {}) => {
      db.auditLogs.unshift({
        id: db.nextId.auditLog++,
        action,
        entityType,
        entityId: String(entityId || ""),
        username: u.username,
        userRole: u.role,
        details,
        diff,
        createdAt: new Date().toISOString(),
      });
    };

    // ── Public Platform ──────────────────────────────────────────────────────
    if (method === "GET" && path === "/platform/public") {
      return ok({
        platformName: state.platform.platformName,
        tagline: state.platform.tagline,
        supportPhone: state.platform.supportPhone,
        supportEmail: state.platform.supportEmail,
        allowSignup: state.platform.allowSignup,
        hasInviteCode: !state.platform.allowSignup && !!String(state.platform.signupInviteCode || state.platform.inviteCode || "").trim(),
        trialDays: state.platform.trialDays,
        defaultAccentColor: state.platform.defaultAccentColor,
        defaultThemeMode: state.platform.defaultThemeMode,
        currencySymbol: state.platform.currencySymbol,
      });
    }

    // ── Auth Routes ──────────────────────────────────────────────────────────
    if (method === "GET" && path === "/auth/csrf") {
      return route.fulfill({ json: { success: true, csrfToken: "test-csrf-token" } });
    }

    if (method === "GET" && path === "/auth/me") {
      const u = currentUser();
      if (!u || !u.isActive) return fail(401, "Not signed in");
      return ok({
        user: buildLoginUser(u),
        shop: isSuperAdminOnly() ? null : activeShop(),
        impersonating: isImpersonating(),
      });
    }

    if (method === "POST" && path === "/auth/refresh") {
      const u = currentUser();
      if (!u || !u.isActive) return fail(401, "Refresh token invalid");
      return ok({
        user: buildLoginUser(u),
        shop: isSuperAdminOnly() ? null : activeShop(),
        impersonating: isImpersonating(),
      });
    }

    if (method === "POST" && path === "/auth/login") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const u = state.users.find((x) => x.email.toLowerCase() === email);
      if (!u || u.password !== password) return fail(401, "Invalid email or password");
      if (!u.isActive) return fail(403, "Your account is disabled");
      if (u.shopId) {
        const s = state.shops.find((x) => x.id === u.shopId);
        if (!s || !s.isActive) return fail(403, "This business has been switched off");
      }
      u.lastLoginAt = new Date().toISOString();
      state.session = { userId: u.id, activeShopId: u.shopId, impersonatingFromUserId: null };
      return ok({
        user: buildLoginUser(u),
        shop: u.isSuperAdmin ? null : activeShop(),
      });
    }

    if (method === "POST" && path === "/auth/validate-invite") {
      const expectedCode = state.platform.signupInviteCode || state.platform.inviteCode;
      if (!state.platform.allowSignup && (!body.inviteCode || String(body.inviteCode).trim() !== expectedCode)) {
        return fail(403, "Invalid invitation code. Check it and try again.");
      }
      return ok({ valid: true }, "Invitation code verified");
    }

    if (method === "POST" && path === "/auth/register") {
      const expectedCode = state.platform.signupInviteCode || state.platform.inviteCode;
      if (!state.platform.allowSignup) {
        if (!body.inviteCode || String(body.inviteCode).trim() !== expectedCode) {
          return fail(403, "Invalid invite code");
        }
      }
      const email = String(body.email || "").trim().toLowerCase();
      if (!body.shopName || !body.username || !email || !body.password) {
        return fail(400, "All required fields must be provided");
      }
      if (state.users.some((u) => u.email.toLowerCase() === email)) {
        return fail(409, "An account with this email already exists");
      }
      const newShop = {
        id: state.nextShopId++,
        name: String(body.shopName).trim(),
        slug: String(body.shopName).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        dbName: `shop_${state.nextShopId}`,
        ownerEmail: email,
        phone: String(body.phone || "").trim(),
        plan: "free",
        subscriptionEnds: localDate(state.platform.trialDays || 14),
        isActive: true,
        notes: "",
        createdAt: new Date().toISOString(),
      };
      state.shops.push(newShop);
      state.shopDbs[newShop.id] = createSeedShopDb(newShop.name, {
        empty: true,
        settings: {
          businessType: body.businessType || "supermarket",
          phone: newShop.phone,
          email,
          themeMode: state.platform.defaultThemeMode || "light",
          accentColor: state.platform.defaultAccentColor || "#bf9c5a",
          currencySymbol: state.platform.currencySymbol || "₹",
        },
      });
      const newUser = {
        id: state.nextUserId++,
        shopId: newShop.id,
        username: String(body.username).trim(),
        email,
        phone: newShop.phone,
        password: String(body.password),
        role: "owner",
        isSuperAdmin: false,
        isActive: true,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
      state.users.push(newUser);
      state.session = { userId: newUser.id, activeShopId: newShop.id, impersonatingFromUserId: null };
      return ok({ user: buildLoginUser(newUser), shop: decorateShop(newShop, state) }, "Shop created", 201);
    }

    if (method === "POST" && path === "/auth/logout") {
      state.session = { userId: null, activeShopId: null, impersonatingFromUserId: null };
      return ok({}, "Signed out");
    }

    if (method === "POST" && path === "/auth/forgot-password") {
      return ok({}, "Reset link sent if account exists");
    }

    if (method === "POST" && path === "/auth/reset-password") {
      if (!body.token || body.token === "expired-token") return fail(400, "Reset token is invalid or expired");
      return ok({}, "Password updated");
    }

    if (method === "PUT" && path === "/auth/profile") {
      const u = requireAuth();
      if (!u) return;
      if (body.username !== undefined) u.username = String(body.username).trim();
      if (body.phone !== undefined) u.phone = String(body.phone).trim();
      return ok({ user: buildLoginUser(u) }, "Profile updated");
    }

    if (method === "PUT" && path === "/auth/change-password") {
      const u = requireAuth();
      if (!u) return;
      if (body.currentPassword !== u.password) return fail(400, "Current password is incorrect");
      u.password = String(body.newPassword);
      return ok({}, "Password changed");
    }

    // ── Admin Routes ─────────────────────────────────────────────────────────
    if (path.startsWith("/admin/")) {
      const u = requireAuth();
      if (!u) return;

      if (method === "POST" && path === "/admin/return-to-admin") {
        const adminId = state.session.impersonatingFromUserId || (u.isSuperAdmin ? u.id : null);
        const admin = state.users.find((x) => x.id === adminId && x.isSuperAdmin);
        if (!admin) return fail(403, "Not impersonating");
        state.session = { userId: admin.id, activeShopId: null, impersonatingFromUserId: null };
        return ok({ user: buildLoginUser(admin), shop: null });
      }

      if (!u.isSuperAdmin) return fail(403, "Platform admin access required");

      const decoratedShops = () => state.shops.map((s) => decorateShop(s, state));

      if (method === "GET" && path === "/admin/stats") {
        const decorated = decoratedShops();
        const activeSubs = decorated.filter((s) => s.subscriptionActive);
        const monthlyRevenue = activeSubs.reduce((sum, s) => sum + (state.platform.plans[s.plan]?.price || 0), 0);
        const byPlan = Object.keys(state.platform.plans).reduce((acc, k) => {
          acc[k] = decorated.filter((s) => s.plan === k).length;
          return acc;
        }, {});
        return ok({
          totalShops: decorated.length,
          totalUsers: state.users.filter((usr) => !usr.isSuperAdmin).length,
          activeSubscriptions: activeSubs.length,
          monthlyRevenue,
          plans: state.platform.plans,
          byPlan,
          recent: decorated.slice(-6).reverse(),
          growth: {},
        });
      }

      if (method === "GET" && path === "/admin/shops") {
        let list = decoratedShops();
        if (q.search) {
          const s = q.search.toLowerCase();
          list = list.filter(
            (x) =>
              x.name.toLowerCase().includes(s) ||
              (x.ownerEmail || "").toLowerCase().includes(s) ||
              (x.phone || "").includes(s),
          );
        }
        return ok({ shops: list });
      }

      if (method === "POST" && path === "/admin/shops") {
        const email = String(body.ownerEmail || body.email || "").trim().toLowerCase();
        const name = String(body.shopName || body.name || "").trim();
        if (!name || !email || !body.password) return fail(400, "Business name, owner email and password are required");
        if (state.users.some((usr) => usr.email.toLowerCase() === email)) {
          return fail(409, "Email already registered");
        }
        const days = parseInt(body.days, 10) || 14;
        const dbName = `shop_${state.nextShopId}`;
        const shop = {
          id: state.nextShopId++,
          name,
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          dbName,
          ownerEmail: email,
          phone: String(body.phone || "").trim(),
          plan: body.plan || "free",
          subscriptionEnds: localDate(days),
          isActive: true,
          notes: "",
          createdAt: new Date().toISOString(),
        };
        state.shops.push(shop);
        state.shopDbs[shop.id] = createSeedShopDb(shop.name, { empty: true, settings: { phone: shop.phone, email } });
        const owner = {
          id: state.nextUserId++,
          shopId: shop.id,
          username: String(body.username || body.ownerName || "Owner").trim(),
          email,
          phone: shop.phone,
          password: String(body.password),
          role: "owner",
          isSuperAdmin: false,
          isActive: true,
          createdAt: new Date().toISOString(),
          lastLoginAt: null,
        };
        state.users.push(owner);
        return ok({ shop: decorateShop(shop, state), dbName, owner: buildLoginUser(owner) }, "Business created", 201);
      }

      const shopIdMatch = path.match(/^\/admin\/shops\/(\d+)$/);
      if (shopIdMatch) {
        const sid = parseInt(shopIdMatch[1], 10);
        const shop = state.shops.find((x) => x.id === sid);
        if (!shop) return fail(404, "Business not found");

        if (method === "GET") {
          const shopUsers = state.users.filter((usr) => usr.shopId === sid).map(buildLoginUser);
          return ok({
            shop: decorateShop(shop, state),
            users: shopUsers,
          });
        }

        if (method === "PUT") {
          if (body.extendDays) {
            const cur = shop.subscriptionEnds ? new Date(`${String(shop.subscriptionEnds).slice(0, 10)}T00:00:00Z`) : new Date();
            const base = cur.getTime() < Date.now() ? new Date() : cur;
            base.setDate(base.getDate() + parseInt(body.extendDays, 10));
            shop.subscriptionEnds = base.toISOString().slice(0, 10);
            return ok({ shop: decorateShop(shop, state) }, `Extended by ${body.extendDays} days`);
          }
          if (body.name !== undefined) shop.name = String(body.name).trim();
          if (body.phone !== undefined) shop.phone = String(body.phone).trim();
          if (body.plan !== undefined) shop.plan = body.plan;
          if (body.subscriptionEnds !== undefined) shop.subscriptionEnds = body.subscriptionEnds ? String(body.subscriptionEnds).slice(0, 10) : null;
          if (body.notes !== undefined) shop.notes = body.notes;
          if (body.isActive !== undefined) shop.isActive = Boolean(body.isActive);
          return ok({ shop: decorateShop(shop, state) }, "Business updated");
        }

        if (method === "DELETE") {
          if (body.confirm !== shop.name) return fail(400, "Confirmation name did not match");
          const delName = shop.name;
          state.shops = state.shops.filter((x) => x.id !== sid);
          state.users = state.users.filter((usr) => usr.shopId !== sid);
          delete state.shopDbs[sid];
          return ok({}, `${delName} deleted`);
        }
      }

      const toggleMatch = path.match(/^\/admin\/shops\/(\d+)\/toggle$/);
      if (method === "PATCH" && toggleMatch) {
        const sid = parseInt(toggleMatch[1], 10);
        const shop = state.shops.find((x) => x.id === sid);
        if (!shop) return fail(404, "Business not found");
        shop.isActive = !shop.isActive;
        return ok({ shop: decorateShop(shop, state) }, shop.isActive ? "Business activated" : "Business switched off");
      }

      const resetMatch = path.match(/^\/admin\/shops\/(\d+)\/reset-password$/);
      if (method === "POST" && resetMatch) {
        const sid = parseInt(resetMatch[1], 10);
        const owner = state.users.find((usr) => usr.shopId === sid && usr.role === "owner");
        if (!owner) return fail(404, "Owner not found");
        owner.password = String(body.newPassword || "");
        return ok({}, "Owner password reset");
      }

      const repairMatch = path.match(/^\/admin\/shops\/(\d+)\/repair-db$/);
      if (method === "POST" && repairMatch) {
        const sid = parseInt(repairMatch[1], 10);
        const shop = state.shops.find((x) => x.id === sid);
        if (!shop) return fail(404, "Business not found");
        return ok({ tablesChecked: 14 }, "Database verified — all tables intact");
      }

      const loginAsMatch = path.match(/^\/admin\/shops\/(\d+)\/login-as$/);
      if (method === "POST" && loginAsMatch) {
        const sid = parseInt(loginAsMatch[1], 10);
        const shop = state.shops.find((x) => x.id === sid);
        if (!shop) return fail(404, "Business not found");
        const owner = state.users.find((usr) => usr.shopId === sid && usr.role === "owner") || u;
        state.session = {
          userId: owner.id,
          activeShopId: shop.id,
          impersonatingFromUserId: u.id,
        };
        return ok({
          user: buildLoginUser({ ...owner, isSuperAdmin: true }),
          shop: decorateShop(shop, state),
          impersonating: true,
        });
      }

      if (method === "GET" && path === "/admin/users") {
        const list = state.users
          .filter((usr) => !usr.isSuperAdmin)
          .map((usr) => {
            const shop = state.shops.find((s) => s.id === usr.shopId);
            return {
              ...buildLoginUser(usr),
              createdAt: usr.createdAt,
              lastLoginAt: usr.lastLoginAt || null,
              shopName: shop?.name || "—",
              shopActive: Boolean(shop?.isActive),
            };
          });
        return ok({ users: list });
      }

      if (method === "GET" && path === "/admin/settings") {
        return ok({ settings: state.platform });
      }

      if (method === "PUT" && path === "/admin/settings") {
        state.platform = {
          ...state.platform,
          ...body,
          inviteCode: body.signupInviteCode !== undefined ? body.signupInviteCode : state.platform.inviteCode,
          plans: body.plans ? { ...state.platform.plans, ...body.plans } : state.platform.plans,
        };
        return ok({ settings: state.platform }, "Platform settings saved");
      }

      return fail(404, `Unknown admin route ${path}`);
    }

    // ── Tenant Routes ────────────────────────────────────────────────────────
    const u = requireAuth();
    if (!u) return;
    if (isSuperAdminOnly()) return fail(403, "Platform admin must open a shop first");
    const db = getDb();
    const shop = activeShop();
    if (!db || !shop) return fail(404, "Shop context missing");

    // Settings
    if (path === "/settings" && method === "GET") {
      return ok({ settings: db.settings });
    }
    if (path === "/settings" && method === "PUT") {
      if (!requireWriteSubscription()) return;
      if (u.role !== "owner" && !u.isSuperAdmin) return fail(403, "Only owners can change store settings");
      db.settings = { ...db.settings, ...body };
      addAudit(db, u, "SETTINGS_UPDATED", "settings", "shop", { fields: Object.keys(body) });
      return ok({ settings: db.settings }, "Settings saved");
    }
    if (path === "/settings/reset-appearance" && method === "POST") {
      if (u.role !== "owner" && !u.isSuperAdmin) return fail(403, "Only owners can reset appearance");
      db.settings.themeMode = state.platform.defaultThemeMode || "light";
      db.settings.accentColor = state.platform.defaultAccentColor || "#bf9c5a";
      db.settings.compactMode = false;
      return ok({ settings: db.settings }, "Appearance reset to defaults");
    }

    // Staff
    if (path === "/staff" && method === "GET") {
      if (u.role !== "owner" && !u.isSuperAdmin) return fail(403, "Owners only");
      const users = state.users.filter((x) => x.shopId === shop.id).map((x) => ({ ...buildLoginUser(x), createdAt: x.createdAt }));
      const maxUsers = state.platform.plans[shop.plan]?.maxUsers || 10;
      return ok({ staff: users, users, limits: { maxUsers }, limit: maxUsers });
    }
    if (path === "/staff" && method === "POST") {
      if (!requireWriteSubscription()) return;
      if (u.role !== "owner" && !u.isSuperAdmin) return fail(403, "Owners only");
      const maxUsers = state.platform.plans[shop.plan]?.maxUsers || 10;
      const count = state.users.filter((x) => x.shopId === shop.id && x.isActive).length;
      if (maxUsers && count >= maxUsers) return fail(403, `Plan limit of ${maxUsers} users reached`);
      const email = String(body.email || "").trim().toLowerCase();
      if (state.users.some((x) => x.email.toLowerCase() === email)) return fail(409, "Email already in use");
      const created = {
        id: state.nextUserId++,
        shopId: shop.id,
        username: String(body.username || "").trim(),
        email,
        phone: String(body.phone || "").trim(),
        password: String(body.password || ""),
        role: body.role || "cashier",
        isSuperAdmin: false,
        isActive: true,
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
      };
      state.users.push(created);
      addAudit(db, u, "STAFF_CREATED", "staff", created.id, { username: created.username, role: created.role });
      return ok({ user: buildLoginUser(created) }, "Staff added", 201);
    }
    const staffMatch = path.match(/^\/staff\/(\d+)$/);
    if (staffMatch) {
      if (!requireWriteSubscription()) return;
      if (u.role !== "owner" && !u.isSuperAdmin) return fail(403, "Owners only");
      const id = parseInt(staffMatch[1], 10);
      const target = state.users.find((x) => x.id === id && x.shopId === shop.id);
      if (!target) return fail(404, "Staff user not found");
      if (method === "PUT") {
        if (body.username !== undefined) target.username = String(body.username).trim();
        if (body.phone !== undefined) target.phone = String(body.phone).trim();
        if (body.role !== undefined) target.role = body.role;
        if (body.isActive !== undefined) target.isActive = Boolean(body.isActive);
        if (body.password) target.password = String(body.password);
        addAudit(db, u, "STAFF_UPDATED", "staff", id, { role: target.role, isActive: target.isActive });
        return ok({ user: buildLoginUser(target) }, "Staff updated");
      }
      if (method === "DELETE") {
        if (target.id === u.id) return fail(400, "Cannot delete yourself");
        state.users = state.users.filter((x) => x.id !== id);
        addAudit(db, u, "STAFF_DELETED", "staff", id, { username: target.username });
        return ok({}, "Staff removed");
      }
    }

    // Products
    if (path === "/products/summary" && method === "GET") {
      const today = localDate(0);
      const limitDay = localDate(db.settings.expiryAlertDays || 30);
      const active = db.products.filter((p) => p.isActive);
      return ok({
        count: active.length,
        total: active.length,
        costValue: round2(active.reduce((a, p) => a + Math.max(0, num(p.quantity)) * num(p.costPrice), 0)),
        saleValue: round2(active.reduce((a, p) => a + Math.max(0, num(p.quantity)) * num(p.price), 0)),
        lowStock: active.filter((p) => num(p.quantity) > 0 && num(p.quantity) <= num(p.reorderLevel)).length,
        outOfStock: active.filter((p) => num(p.quantity) <= 0).length,
        expiringSoon: active.filter((p) => p.expiryDate && p.expiryDate >= today && p.expiryDate <= limitDay && num(p.quantity) > 0).length,
        expired: active.filter((p) => p.expiryDate && p.expiryDate < today && num(p.quantity) > 0).length,
      });
    }
    if (path === "/products/categories" && method === "GET") {
      return ok({ categories: getAllCategories(db.products, db.settings) });
    }
    const barcodeMatch = path.match(/^\/products\/barcode\/(.+)$/);
    if (barcodeMatch && method === "GET") {
      const code = decodeURIComponent(barcodeMatch[1]).trim();
      const found = db.products.find((p) => p.isActive && p.barcode === code);
      if (!found) return fail(404, "Product not found for this barcode");
      return ok({ product: found });
    }
    if (path === "/products/scan" && method === "POST") {
      if (!requireWriteSubscription()) return;
      if (u.role === "cashier" && !u.isSuperAdmin) return fail(403, "Not allowed");
      const barcode = String(body.barcode || "").trim();
      if (!barcode) return fail(400, "Barcode is required");
      const qty = round3(Math.max(0, num(body.quantity, 1)));
      let p = db.products.find((x) => x.isActive && x.barcode === barcode);
      if (p) {
        if (body.name) p.name = body.name;
        if (body.mrp !== undefined && body.mrp !== "" && body.mrp !== null) p.mrp = round2(body.mrp);
        if (body.price !== undefined && body.price !== "") p.price = round2(body.price);
        if (body.costPrice !== undefined && body.costPrice !== "") p.costPrice = round2(body.costPrice);
        if (p.mrp && p.price > p.mrp) return fail(400, "Selling price cannot exceed MRP");
        if (qty > 0) {
          p.quantity = round3(num(p.quantity) + qty);
          db.stockMovements.unshift({
            id: db.nextId.movement++,
            productId: p.id,
            productName: p.name,
            type: "scan",
            quantity: qty,
            balanceAfter: p.quantity,
            reference: null,
            note: "Stock added by scan",
            userName: u.username,
            createdAt: new Date().toISOString(),
          });
        }
        return ok({ product: p, action: "updated" }, "Stock updated successfully");
      }
      if (!body.name) return fail(400, "Product name is required for a new barcode");
      if (body.mrp && num(body.price) > num(body.mrp)) return fail(400, "Selling price cannot exceed MRP");
      const created = {
        id: db.nextId.product++,
        name: String(body.name).trim(),
        barcode,
        category: body.category || "",
        brand: body.brand || "",
        unit: body.unit || "pcs",
        netQty: body.netQty || "",
        allowDecimal: Boolean(body.allowDecimal || ["kg", "g", "l", "ml"].includes(body.unit)),
        mrp: body.mrp ? round2(body.mrp) : null,
        price: round2(body.price),
        costPrice: round2(body.costPrice || 0),
        quantity: qty,
        reorderLevel: num(body.reorderLevel, 5),
        taxRate: num(body.taxRate, 0),
        hsnCode: body.hsnCode || "",
        supplierId: body.supplierId ? parseInt(body.supplierId, 10) : null,
        batchNo: body.batchNo || "",
        expiryDate: body.expiryDate || null,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      db.products.unshift(created);
      if (qty > 0) {
        db.stockMovements.unshift({
          id: db.nextId.movement++,
          productId: created.id,
          productName: created.name,
          type: "opening",
          quantity: qty,
          balanceAfter: qty,
          reference: null,
          note: "Created by scan",
          userName: u.username,
          createdAt: new Date().toISOString(),
        });
      }
      return ok({ product: created, action: "created" }, "New product created", 201);
    }
    if (path === "/products/bulk-import" && method === "POST") {
      if (!requireWriteSubscription()) return;
      const list = Array.isArray(body.products) ? body.products : [];
      let created = 0;
      let updated = 0;
      let failed = 0;
      const errors = [];
      list.forEach((row, idx) => {
        if (!row.name || !Number.isFinite(parseFloat(row.price))) {
          failed++;
          errors.push(`Row ${idx + 2}: Valid name and price required`);
          return;
        }
        const existing = db.products.find(
          (p) => p.isActive && ((row.barcode && p.barcode === row.barcode) || p.name.toLowerCase() === String(row.name).toLowerCase()),
        );
        const qtyIn = round3(Math.max(0, num(row.quantity)));
        if (existing) {
          existing.price = round2(row.price);
          if (row.mrp !== undefined && row.mrp !== "") existing.mrp = round2(row.mrp);
          existing.quantity = round3(num(existing.quantity) + qtyIn);
          updated++;
        } else {
          const item = {
            id: db.nextId.product++,
            name: String(row.name).trim(),
            barcode: row.barcode || null,
            category: row.category || "",
            brand: row.brand || "",
            unit: row.unit || "pcs",
            netQty: row.netQty || "",
            allowDecimal: ["kg", "g", "l", "ml"].includes(row.unit),
            mrp: row.mrp ? round2(row.mrp) : null,
            price: round2(row.price),
            costPrice: round2(row.costPrice || 0),
            quantity: qtyIn,
            reorderLevel: num(row.reorderLevel, 5),
            taxRate: num(row.taxRate, 0),
            hsnCode: row.hsnCode || "",
            supplierId: null,
            batchNo: row.batchNo || "",
            expiryDate: row.expiryDate || null,
            isActive: true,
            createdAt: new Date().toISOString(),
          };
          db.products.unshift(item);
          created++;
        }
      });
      return ok({ created, updated, failed, errors }, `Import complete: ${created} created, ${updated} updated, ${failed} failed`);
    }
    if (path === "/products" && method === "GET") {
      const today = localDate(0);
      const limitDay = localDate(db.settings.expiryAlertDays || 30);
      let list = db.products.filter((p) => p.isActive);
      if (q.search) {
        const s = q.search.toLowerCase();
        list = list.filter(
          (p) =>
            p.name.toLowerCase().includes(s) ||
            (p.barcode || "").toLowerCase().includes(s) ||
            (p.category || "").toLowerCase().includes(s),
        );
      }
      if (q.category) list = list.filter((p) => p.category === q.category);
      if (q.status === "low" || q.lowStock === "true") list = list.filter((p) => num(p.quantity) > 0 && num(p.quantity) <= num(p.reorderLevel));
      if (q.status === "out" || q.outOfStock === "true") list = list.filter((p) => num(p.quantity) <= 0);
      if (q.status === "expiring" || q.expiring === "true") list = list.filter((p) => p.expiryDate && p.expiryDate >= today && p.expiryDate <= limitDay && num(p.quantity) > 0);
      if (q.status === "expired" || q.expired === "true") list = list.filter((p) => p.expiryDate && p.expiryDate < today && num(p.quantity) > 0);
      const total = list.length;
      const limit = parseInt(q.limit, 10) || 50;
      const page = parseInt(q.page, 10) || 1;
      const paged = list.slice((page - 1) * limit, page * limit);
      return ok({ products: paged, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
    }
    if (path === "/products" && method === "POST") {
      if (!requireWriteSubscription()) return;
      if (u.role === "cashier" && !u.isSuperAdmin) return fail(403, "Not allowed");
      if (body.mrp && num(body.price) > num(body.mrp)) return fail(400, "Selling price cannot exceed MRP");
      const qty = round3(Math.max(0, num(body.quantity)));
      const created = {
        id: db.nextId.product++,
        name: String(body.name || "").trim(),
        barcode: body.barcode || null,
        category: body.category || "",
        brand: body.brand || "",
        unit: body.unit || "pcs",
        netQty: body.netQty || "",
        allowDecimal: Boolean(body.allowDecimal),
        mrp: body.mrp !== undefined && body.mrp !== "" && body.mrp !== null ? round2(body.mrp) : null,
        price: round2(body.price),
        costPrice: round2(body.costPrice || 0),
        quantity: qty,
        reorderLevel: num(body.reorderLevel, 5),
        taxRate: num(body.taxRate, 0),
        hsnCode: body.hsnCode || "",
        supplierId: body.supplierId ? parseInt(body.supplierId, 10) : null,
        batchNo: body.batchNo || "",
        expiryDate: body.expiryDate || null,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      db.products.unshift(created);
      if (qty > 0) {
        db.stockMovements.unshift({
          id: db.nextId.movement++,
          productId: created.id,
          productName: created.name,
          type: "opening",
          quantity: qty,
          balanceAfter: qty,
          reference: null,
          note: "Opening stock",
          userName: u.username,
          createdAt: new Date().toISOString(),
        });
      }
      return ok({ product: created }, "Product added successfully", 201);
    }
    const prodStockMatch = path.match(/^\/products\/(\d+)\/stock$/);
    if (prodStockMatch && method === "PATCH") {
      if (!requireWriteSubscription()) return;
      const pid = parseInt(prodStockMatch[1], 10);
      const p = db.products.find((x) => x.id === pid);
      if (!p) return fail(404, "Product not found");
      const cur = num(p.quantity);
      const amt = round3(num(body.quantity));
      const delta = body.operation === "set" ? amt - cur : body.operation === "subtract" ? -amt : amt;
      if (cur + delta < 0) return fail(400, `Insufficient stock. Available: ${cur}`);
      p.quantity = round3(cur + delta);
      db.stockMovements.unshift({
        id: db.nextId.movement++,
        productId: p.id,
        productName: p.name,
        type: "adjustment",
        quantity: round3(delta),
        balanceAfter: p.quantity,
        reference: null,
        note: [body.reason, body.note].filter(Boolean).join(" — ") || "Manual adjustment",
        userName: u.username,
        createdAt: new Date().toISOString(),
      });
      return ok({ product: p }, "Stock updated");
    }
    const prodMoveMatch = path.match(/^\/products\/(\d+)\/movements$/);
    if (prodMoveMatch && method === "GET") {
      const pid = parseInt(prodMoveMatch[1], 10);
      const movements = db.stockMovements.filter((m) => m.productId === pid);
      return ok({ movements, total: movements.length, page: 1, pages: 1 });
    }
    const prodIdMatch = path.match(/^\/products\/(\d+)$/);
    if (prodIdMatch) {
      const pid = parseInt(prodIdMatch[1], 10);
      const p = db.products.find((x) => x.id === pid);
      if (!p) return fail(404, "Product not found");
      if (method === "GET") return ok({ product: p });
      if (method === "PUT") {
        if (!requireWriteSubscription()) return;
        const oldPrice = p.price;
        Object.assign(p, {
          ...body,
          price: body.price !== undefined ? round2(body.price) : p.price,
          mrp: body.mrp === null || body.mrp === "" ? null : body.mrp !== undefined ? round2(body.mrp) : p.mrp,
          costPrice: body.costPrice !== undefined ? round2(body.costPrice) : p.costPrice,
        });
        if (oldPrice !== p.price) {
          addAudit(db, u, "PRICE_CHANGE", "product", p.id, { name: p.name }, { price: { from: oldPrice, to: p.price } });
        }
        return ok({ product: p }, "Product updated successfully");
      }
      if (method === "DELETE") {
        if (!requireWriteSubscription()) return;
        p.isActive = false;
        return ok({}, "Product deleted successfully");
      }
    }

    // Customers
    if (path === "/customers/lookup" && method === "GET") {
      const phone = String(q.phone || "").replace(/\D/g, "");
      const found = db.customers.find((c) => c.isActive && c.phone.replace(/\D/g, "") === phone) || null;
      return ok({ customer: found });
    }
    if (path === "/customers" && method === "GET") {
      let list = db.customers.filter((c) => c.isActive);
      if (q.search) {
        const s = q.search.toLowerCase();
        list = list.filter((c) => c.name.toLowerCase().includes(s) || (c.phone || "").includes(s));
      }
      if (q.withDues === "true" || q.due === "true") list = list.filter((c) => num(c.balance) > 0);
      if (q.sort === "spent") list = [...list].sort((a, b) => num(b.totalSpent) - num(a.totalSpent));
      else if (q.sort === "due") list = [...list].sort((a, b) => num(b.balance) - num(a.balance));
      else if (q.sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
      const allActive = db.customers.filter((c) => c.isActive);
      return ok({
        customers: list,
        total: list.length,
        page: 1,
        pages: 1,
        summary: {
          totalCustomers: allActive.length,
          totalDue: round2(allActive.filter((c) => num(c.balance) > 0).reduce((a, c) => a + num(c.balance), 0)),
          totalReceivable: round2(allActive.filter((c) => num(c.balance) > 0).reduce((a, c) => a + num(c.balance), 0)),
          totalSpent: round2(allActive.reduce((a, c) => a + num(c.totalSpent), 0)),
          totalPoints: round2(allActive.reduce((a, c) => a + num(c.loyaltyPoints), 0)),
        },
      });
    }
    if (path === "/customers" && method === "POST") {
      if (!requireWriteSubscription()) return;
      const phone = String(body.phone || "").trim();
      if (!phone) return fail(400, "Phone is required");
      if (db.customers.some((c) => c.isActive && c.phone === phone)) return fail(409, "Customer with this phone already exists");
      const c = {
        id: db.nextId.customer++,
        name: String(body.name || "").trim(),
        phone,
        email: body.email || "",
        address: body.address || "",
        gstNumber: body.gstNumber || "",
        balance: round2(body.balance || 0),
        creditLimit: round2(body.creditLimit || 0),
        loyaltyPoints: 0,
        totalSpent: 0,
        totalBills: 0,
        lastPurchaseAt: null,
        notes: body.notes || "",
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      db.customers.unshift(c);
      return ok({ customer: c }, "Customer added", 201);
    }
    const custPayMatch = path.match(/^\/customers\/(\d+)\/payments$/);
    if (custPayMatch && method === "POST") {
      if (!requireWriteSubscription()) return;
      const cid = parseInt(custPayMatch[1], 10);
      const c = db.customers.find((x) => x.id === cid);
      if (!c) return fail(404, "Customer not found");
      const amt = round2(body.amount);
      if (!(amt > 0)) return fail(400, "Enter a positive amount");
      c.balance = round2(c.balance - amt);
      const payment = {
        id: db.nextId.customerPayment++,
        customerId: cid,
        amount: amt,
        method: body.method || "cash",
        reference: body.reference || "",
        notes: body.notes || "",
        createdBy: u.username,
        receivedBy: u.username,
        createdAt: new Date().toISOString(),
      };
      db.customerPayments.unshift(payment);
      return ok({ customer: c, payment }, "Payment recorded", 201);
    }
    const custPtsMatch = path.match(/^\/customers\/(\d+)\/points$/);
    if (custPtsMatch && method === "POST") {
      if (!requireWriteSubscription()) return;
      if (u.role === "cashier" && !u.isSuperAdmin) return fail(403, "Only managers/owners can adjust points");
      const cid = parseInt(custPtsMatch[1], 10);
      const c = db.customers.find((x) => x.id === cid);
      if (!c) return fail(404, "Customer not found");
      const delta = round2(body.points);
      c.loyaltyPoints = round2(Math.max(0, num(c.loyaltyPoints) + delta));
      return ok({ customer: c }, "Points updated");
    }
    const custIdMatch = path.match(/^\/customers\/(\d+)$/);
    if (custIdMatch) {
      const cid = parseInt(custIdMatch[1], 10);
      const c = db.customers.find((x) => x.id === cid);
      if (!c) return fail(404, "Customer not found");
      if (method === "GET") {
        return ok({
          customer: c,
          bills: db.bills.filter((b) => b.customerId === cid),
          payments: db.customerPayments.filter((p) => p.customerId === cid),
          returns: db.saleReturns.filter((r) => r.customerId === cid),
        });
      }
      if (method === "PUT") {
        if (!requireWriteSubscription()) return;
        Object.assign(c, {
          ...body,
          creditLimit: body.creditLimit !== undefined ? round2(body.creditLimit) : c.creditLimit,
        });
        return ok({ customer: c }, "Customer updated");
      }
      if (method === "DELETE") {
        if (!requireWriteSubscription()) return;
        if (num(c.balance) > 0.01) return fail(400, "Settle customer due before removing");
        c.isActive = false;
        return ok({}, "Customer removed");
      }
    }

    // Suppliers
    if (path === "/suppliers" && method === "GET") {
      let list = db.suppliers.filter((s) => s.isActive);
      if (q.search) {
        const s = q.search.toLowerCase();
        list = list.filter((x) => x.name.toLowerCase().includes(s) || (x.phone || "").includes(s));
      }
      const totalPayable = round2(db.suppliers.filter((s) => s.isActive && num(s.balance) > 0).reduce((a, s) => a + num(s.balance), 0));
      return ok({ suppliers: list, summary: { totalPayable } });
    }
    if (path === "/suppliers" && method === "POST") {
      if (!requireWriteSubscription()) return;
      const sup = {
        id: db.nextId.supplier++,
        name: String(body.name || "").trim(),
        contactPerson: body.contactPerson || "",
        phone: body.phone || "",
        email: body.email || "",
        gstNumber: body.gstNumber || "",
        address: body.address || "",
        balance: round2(body.openingBalance ?? body.balance ?? 0),
        notes: body.notes || "",
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      db.suppliers.unshift(sup);
      return ok({ supplier: sup }, "Supplier added", 201);
    }
    const supPayMatch = path.match(/^\/suppliers\/(\d+)\/payments$/);
    if (supPayMatch && method === "POST") {
      if (!requireWriteSubscription()) return;
      const sid = parseInt(supPayMatch[1], 10);
      const sup = db.suppliers.find((x) => x.id === sid);
      if (!sup) return fail(404, "Supplier not found");
      const amt = round2(body.amount);
      if (!(amt > 0)) return fail(400, "Enter a positive amount");
      sup.balance = round2(Math.max(0, num(sup.balance) - amt));
      const payment = {
        id: db.nextId.supplierPayment++,
        supplierId: sid,
        amount: amt,
        method: body.method || "cash",
        reference: body.reference || "",
        notes: body.notes || "",
        paidBy: u.username,
        createdAt: new Date().toISOString(),
      };
      db.supplierPayments.unshift(payment);
      return ok({ supplier: sup, payment }, "Supplier payment recorded", 201);
    }
    const supIdMatch = path.match(/^\/suppliers\/(\d+)$/);
    if (supIdMatch) {
      const sid = parseInt(supIdMatch[1], 10);
      const sup = db.suppliers.find((x) => x.id === sid);
      if (!sup) return fail(404, "Supplier not found");
      if (method === "GET") {
        return ok({
          supplier: sup,
          purchases: db.purchases.filter((p) => p.supplierId === sid),
          payments: db.supplierPayments.filter((p) => p.supplierId === sid),
          productCount: db.products.filter((p) => p.isActive && p.supplierId === sid).length,
        });
      }
      if (method === "PUT") {
        if (!requireWriteSubscription()) return;
        Object.assign(sup, body);
        return ok({ supplier: sup }, "Supplier updated");
      }
      if (method === "DELETE") {
        if (!requireWriteSubscription()) return;
        if (Math.abs(num(sup.balance)) > 0.01) return fail(400, "Supplier has unpaid balance. Pay before removing.");
        sup.isActive = false;
        return ok({}, "Supplier removed");
      }
    }

    // Purchases
    if (path === "/purchases" && method === "GET") {
      let list = [...db.purchases];
      if (q.supplierId) list = list.filter((p) => p.supplierId === parseInt(q.supplierId, 10));
      if (q.due === "true" || q.unpaid === "true") list = list.filter((p) => num(p.dueAmount) > 0 && p.status === "completed");
      if (q.startDate) list = list.filter((p) => p.purchaseDate >= q.startDate);
      if (q.endDate) list = list.filter((p) => p.purchaseDate <= q.endDate);
      const activeList = list.filter((p) => p.status !== "cancelled");
      return ok({
        purchases: list,
        total: list.length,
        page: 1,
        pages: 1,
        summary: {
          totalAmount: round2(activeList.reduce((a, p) => a + num(p.totalAmount), 0)),
          dueAmount: round2(activeList.reduce((a, p) => a + num(p.dueAmount), 0)),
        },
      });
    }
    if (path === "/purchases" && method === "POST") {
      if (!requireWriteSubscription()) return;
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) return fail(400, "Add at least one item");
      const sup = body.supplierId ? db.suppliers.find((s) => s.id === parseInt(body.supplierId, 10)) : null;
      const purNum = `PUR-${pad(db.seq.purchaseSeq++)}`;
      let subtotal = 0;
      let taxAmount = 0;
      const lines = items.map((it, i) => {
        const prod = db.products.find((p) => p.id === parseInt(it.productId, 10));
        const qty = round3(num(it.quantity));
        const cost = round2(num(it.costPrice));
        const rate = num(it.taxRate);
        const lineSub = round2(qty * cost);
        const lineTax = round2((lineSub * rate) / 100);
        subtotal = round2(subtotal + lineSub);
        taxAmount = round2(taxAmount + lineTax);
        if (prod) {
          prod.quantity = round3(num(prod.quantity) + qty);
          prod.costPrice = cost;
          if (body.updatePrices) {
            if (it.mrp !== undefined && it.mrp !== "") prod.mrp = round2(it.mrp);
            const sp = it.sellingPrice ?? it.price;
            if (sp !== undefined && sp !== "") prod.price = round2(sp);
          }
          db.stockMovements.unshift({
            id: db.nextId.movement++,
            productId: prod.id,
            productName: prod.name,
            type: "purchase",
            quantity: qty,
            balanceAfter: prod.quantity,
            reference: purNum,
            note: `Purchase ${purNum}`,
            userName: u.username,
            createdAt: new Date().toISOString(),
          });
        }
        return {
          id: i + 1,
          productId: parseInt(it.productId, 10),
          productName: prod?.name || it.productName || "Item",
          quantity: qty,
          costPrice: cost,
          taxRate: rate,
          taxAmount: lineTax,
          totalAmount: round2(lineSub + lineTax),
        };
      });
      const otherCharges = round2(num(body.otherCharges));
      const discountAmount = round2(num(body.discountAmount));
      const totalAmount = round2(subtotal + taxAmount + otherCharges - discountAmount);
      const paidAmount = round2(Math.min(totalAmount, Math.max(0, num(body.paidAmount, totalAmount))));
      const dueAmount = round2(totalAmount - paidAmount);
      if (sup && dueAmount > 0) sup.balance = round2(num(sup.balance) + dueAmount);
      const pur = {
        id: db.nextId.purchase++,
        purchaseNumber: purNum,
        supplierId: sup?.id || null,
        supplierName: sup?.name || "Direct Purchase",
        invoiceNo: body.invoiceNo || body.invoiceNumber || "",
        purchaseDate: body.purchaseDate || localDate(0),
        subtotal,
        taxAmount,
        otherCharges,
        discountAmount,
        totalAmount,
        paidAmount,
        dueAmount,
        status: "completed",
        notes: body.notes || "",
        createdBy: u.username,
        createdAt: new Date().toISOString(),
        items: lines,
      };
      db.purchases.unshift(pur);
      return ok({ purchase: pur }, "Purchase saved and stock updated", 201);
    }
    const purCancelMatch = path.match(/^\/purchases\/(\d+)\/cancel$/);
    if (purCancelMatch && method === "PATCH") {
      if (!requireWriteSubscription()) return;
      const id = parseInt(purCancelMatch[1], 10);
      const pur = db.purchases.find((p) => p.id === id);
      if (!pur) return fail(404, "Purchase not found");
      if (pur.status === "cancelled") return fail(400, "Already cancelled");
      pur.items.forEach((it) => {
        const prod = db.products.find((p) => p.id === it.productId);
        if (prod) {
          prod.quantity = round3(Math.max(0, num(prod.quantity) - num(it.quantity)));
          db.stockMovements.unshift({
            id: db.nextId.movement++,
            productId: prod.id,
            productName: prod.name,
            type: "purchase_cancel",
            quantity: -num(it.quantity),
            balanceAfter: prod.quantity,
            reference: pur.purchaseNumber,
            note: "Purchase cancelled",
            userName: u.username,
            createdAt: new Date().toISOString(),
          });
        }
      });
      if (pur.supplierId && num(pur.dueAmount) > 0) {
        const sup = db.suppliers.find((s) => s.id === pur.supplierId);
        if (sup) sup.balance = round2(Math.max(0, num(sup.balance) - num(pur.dueAmount)));
      }
      pur.status = "cancelled";
      return ok({ purchase: pur }, "Purchase cancelled");
    }
    const purIdMatch = path.match(/^\/purchases\/(\d+)$/);
    if (purIdMatch && method === "GET") {
      const pur = db.purchases.find((p) => p.id === parseInt(purIdMatch[1], 10));
      if (!pur) return fail(404, "Purchase not found");
      return ok({ purchase: pur });
    }

    // Expenses
    if (path === "/expenses" && method === "GET") {
      let list = [...db.expenses];
      if (q.category) list = list.filter((e) => e.category === q.category);
      if (q.startDate) list = list.filter((e) => e.expenseDate >= q.startDate);
      if (q.endDate) list = list.filter((e) => e.expenseDate <= q.endDate);
      const byCategoryMap = {};
      list.forEach((e) => {
        byCategoryMap[e.category] = round2((byCategoryMap[e.category] || 0) + num(e.amount));
      });
      const total = round2(list.reduce((a, e) => a + num(e.amount), 0));
      const byCategory = Object.entries(byCategoryMap).map(([category, tot]) => ({ category, total: tot }));
      return ok({ expenses: list, summary: { totalAmount: total, byCategory }, total: list.length, byCategory, pages: 1, page: 1 });
    }
    if (path === "/expenses" && method === "POST") {
      if (!requireWriteSubscription()) return;
      const exp = {
        id: db.nextId.expense++,
        title: String(body.title || body.paidTo || body.notes || "").trim(),
        paidTo: body.paidTo || "",
        category: body.category || "General",
        amount: round2(body.amount),
        expenseDate: body.expenseDate || localDate(0),
        paymentMethod: body.paymentMethod || "cash",
        reference: body.reference || "",
        notes: body.notes || "",
        createdBy: u.username,
        createdAt: new Date().toISOString(),
      };
      db.expenses.unshift(exp);
      return ok({ expense: exp }, "Expense recorded", 201);
    }
    const expIdMatch = path.match(/^\/expenses\/(\d+)$/);
    if (expIdMatch) {
      const id = parseInt(expIdMatch[1], 10);
      const exp = db.expenses.find((e) => e.id === id);
      if (!exp) return fail(404, "Expense not found");
      if (method === "PUT") {
        if (!requireWriteSubscription()) return;
        Object.assign(exp, { ...body, amount: body.amount !== undefined ? round2(body.amount) : exp.amount });
        return ok({ expense: exp }, "Expense updated");
      }
      if (method === "DELETE") {
        if (!requireWriteSubscription()) return;
        db.expenses = db.expenses.filter((e) => e.id !== id);
        return ok({}, "Expense deleted");
      }
    }

    // Bills / POS
    if (path === "/bills/preview" && method === "POST") {
      const items = Array.isArray(body.items) ? body.items : [];
      const prices = items
        .map((item) => {
          const product = db.products.find((candidate) => candidate.id === parseInt(item.productId, 10) && candidate.isActive);
          return product ? { productId: product.id, price: product.price, taxRate: product.taxRate } : null;
        })
        .filter(Boolean);
      const foundIds = new Set(prices.map((price) => price.productId));
      const unavailableProductIds = [...new Set(items.map((item) => parseInt(item.productId, 10)))].filter(
        (id) => !foundIds.has(id),
      );
      const lines = items
        .map((it) => {
          const p = db.products.find((x) => x.id === parseInt(it.productId, 10) && x.isActive);
          return p ? { price: p.price, quantity: it.quantity, discount: it.discount, taxRate: p.taxRate } : null;
        })
        .filter(Boolean);
      const calc = calcBill(lines, {
        billDiscount: body.discountAmount,
        loyaltyDiscount: num(body.redeemPoints) * num(db.settings.loyaltyPointValue, 1),
        pricesIncludeTax: db.settings.pricesIncludeTax,
        taxEnabled: db.settings.taxEnabled,
        roundOff: db.settings.roundOff,
      });
      delete calc.lines;
      return ok({ ...calc, prices, unavailableProductIds });
    }

    if (path === "/bills/held" && method === "GET") {
      return ok({ held: db.heldBills, total: db.heldBills.length, page: 1, pages: 1, expiresAfterDays: 7 });
    }
    if (path === "/bills/held" && method === "POST") {
      if (!requireWriteSubscription()) return;
      const held = {
        id: db.nextId.heldBill++,
        label: body.label || `Hold ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`,
        cart: body.cart || [],
        meta: body.meta || {},
        createdBy: u.username,
        createdAt: new Date().toISOString(),
      };
      db.heldBills.unshift(held);
      return ok({ held }, "Bill put on hold", 201);
    }
    const heldIdMatch = path.match(/^\/bills\/held\/(\d+)$/);
    if (heldIdMatch && method === "DELETE") {
      const id = parseInt(heldIdMatch[1], 10);
      db.heldBills = db.heldBills.filter((h) => h.id !== id);
      return ok({}, "Held bill removed");
    }

    if (path === "/bills/returns" && method === "GET") {
      return ok({ returns: db.saleReturns, total: db.saleReturns.length, page: 1, pages: 1 });
    }

    if (path === "/bills" && method === "POST") {
      if (!requireWriteSubscription()) return;
      const rawItems = Array.isArray(body.items) ? body.items : [];
      if (!rawItems.length) return fail(400, "Add at least one product");
      if (u.role === "cashier" && !u.isSuperAdmin && !db.settings.cashierCanDiscount) {
        if (num(body.discountAmount) > 0 || rawItems.some((it) => num(it.discount) > 0)) {
          return fail(403, "Cashiers are not allowed to apply discounts");
        }
      }
      const lines = [];
      for (const it of rawItems) {
        const p = db.products.find((x) => x.id === parseInt(it.productId, 10) && x.isActive);
        if (!p) return fail(400, "Product not found");
        const qty = round3(num(it.quantity));
        if (num(p.quantity) < qty) {
          return fail(400, `Insufficient stock for ${p.name} (Available: ${p.quantity})`);
        }
        lines.push({ product: p, price: p.price, quantity: qty, discount: num(it.discount), taxRate: p.taxRate });
      }
      const redeem = num(body.redeemPoints);
      let customer = null;
      if (body.customerId) customer = db.customers.find((c) => c.id === parseInt(body.customerId, 10));
      else if (body.customerPhone) {
        const phone = String(body.customerPhone).replace(/\D/g, "");
        customer = db.customers.find((c) => c.isActive && c.phone.replace(/\D/g, "") === phone);
        if (!customer && phone) {
          customer = {
            id: db.nextId.customer++,
            name: body.customerName || `Customer ${phone.slice(-4)}`,
            phone,
            email: "",
            address: "",
            gstNumber: body.customerGstNumber || "",
            balance: 0,
            creditLimit: 0,
            loyaltyPoints: 0,
            totalSpent: 0,
            totalBills: 0,
            lastPurchaseAt: null,
            notes: "",
            isActive: true,
            createdAt: new Date().toISOString(),
          };
          db.customers.unshift(customer);
        }
      }
      if (redeem > 0) {
        if (!customer) return fail(400, "Customer required to redeem points");
        if (redeem > num(customer.loyaltyPoints)) return fail(400, "Not enough loyalty points");
      }

      const calc = calcBill(lines, {
        billDiscount: body.discountAmount,
        loyaltyDiscount: redeem * num(db.settings.loyaltyPointValue, 1),
        pricesIncludeTax: db.settings.pricesIncludeTax,
        taxEnabled: db.settings.taxEnabled,
        roundOff: db.settings.roundOff,
      });

      const pays = Array.isArray(body.payments) && body.payments.length
        ? body.payments
        : [{ method: body.paymentMethod || "cash", amount: body.paidAmount ?? calc.totalAmount }];
      let nonCreditPaid = 0;
      const normalizedPays = pays.map((p) => {
        const amt = round2(Math.max(0, num(p.amount)));
        if (p.method !== "credit") nonCreditPaid = round2(nonCreditPaid + amt);
        return { method: p.method || "cash", amount: amt };
      });
      const paidTowardsBill = round2(Math.min(calc.totalAmount, nonCreditPaid));
      const changeReturned = round2(Math.max(0, nonCreditPaid - calc.totalAmount));
      const dueAmount = round2(Math.max(0, calc.totalAmount - nonCreditPaid));
      if (dueAmount > 0 && !customer && db.settings.askCustomerOnCredit) {
        return fail(400, "Customer phone & name are required for a credit / due bill");
      }
      if (dueAmount > 0 && customer && num(customer.creditLimit) > 0 && num(customer.balance) + dueAmount > num(customer.creditLimit)) {
        return fail(400, `Exceeds credit limit (${customer.creditLimit})`);
      }

      const billNumber = `${db.settings.invoicePrefix || "INV"}-${pad(db.seq.billSeq++)}`;
      const loyaltyEarned = db.settings.loyaltyEnabled && customer ? Math.floor((calc.totalAmount / 100) * num(db.settings.loyaltyEarnPer100, 1)) : 0;
      const now = new Date().toISOString();
      const bill = {
        id: db.nextId.bill++,
        billNumber,
        customerId: customer?.id || null,
        customerName: customer?.name || body.customerName || "Walk-in",
        customerPhone: customer?.phone || body.customerPhone || "",
        customerGstNumber: body.customerGstNumber || "",
        cashierId: u.id,
        cashierName: u.username,
        subtotal: calc.subtotal,
        itemDiscount: calc.itemDiscount,
        discountAmount: calc.billDiscount,
        loyaltyRedeemed: redeem,
        loyaltyDiscount: calc.loyaltyDiscount,
        loyaltyEarned,
        taxableAmount: calc.taxableAmount,
        taxAmount: calc.taxAmount,
        cgst: calc.cgst,
        sgst: calc.sgst,
        igst: 0,
        interState: Boolean(body.interState),
        placeOfSupply: body.placeOfSupply || db.settings.state || "",
        roundOff: calc.roundOff,
        totalAmount: calc.totalAmount,
        paidAmount: paidTowardsBill,
        dueAmount,
        changeReturned,
        returnedAmount: 0,
        paymentMethod: normalizedPays.length > 1 ? "split" : normalizedPays[0]?.method || "cash",
        payments: normalizedPays,
        pricesIncludeTax: db.settings.pricesIncludeTax,
        status: "completed",
        notes: body.notes || "",
        createdAt: now,
        updatedAt: now,
        items: calc.lines.map((l) => ({
          id: db.nextId.billItem++,
          productId: l.product.id,
          productName: l.product.name,
          productBarcode: l.product.barcode,
          hsnCode: l.product.hsnCode,
          unit: l.product.unit,
          mrp: l.product.mrp,
          unitPrice: l.price,
          costPrice: num(l.product.costPrice),
          quantity: l.quantity,
          returnedQty: 0,
          discount: round2(l.gross - l.finalNet),
          taxRate: l.taxRate,
          taxableAmount: l.taxable,
          taxAmount: l.tax,
          totalPrice: l.total,
        })),
      };

      calc.lines.forEach((l) => {
        l.product.quantity = round3(num(l.product.quantity) - l.quantity);
        db.stockMovements.unshift({
          id: db.nextId.movement++,
          productId: l.product.id,
          productName: l.product.name,
          type: "sale",
          quantity: -l.quantity,
          balanceAfter: l.product.quantity,
          reference: billNumber,
          note: null,
          userName: u.username,
          createdAt: now,
        });
      });

      if (customer) {
        customer.totalSpent = round2(num(customer.totalSpent) + calc.totalAmount);
        customer.totalBills = num(customer.totalBills) + 1;
        customer.lastPurchaseAt = now;
        customer.balance = round2(num(customer.balance) + dueAmount);
        customer.loyaltyPoints = round2(num(customer.loyaltyPoints) + loyaltyEarned - redeem);
      }

      if (body.heldBillId) {
        db.heldBills = db.heldBills.filter((h) => h.id !== parseInt(body.heldBillId, 10));
      }

      if (calc.billDiscount > 0 || calc.itemDiscount > 0) {
        addAudit(db, u, "DISCOUNT_APPLIED", "bill", billNumber, { billNumber, totalAmount: calc.totalAmount }, { billDiscount: { from: 0, to: calc.billDiscount } });
      }

      db.bills.unshift(bill);
      return ok({ bill }, "Bill created successfully", 201);
    }

    if (path === "/bills" && method === "GET") {
      let list = [...db.bills];
      if (q.status) list = list.filter((b) => b.status === q.status);
      if (q.paymentMethod) list = list.filter((b) => b.paymentMethod === q.paymentMethod);
      if (q.due === "true") list = list.filter((b) => num(b.dueAmount) > 0);
      if (q.startDate) list = list.filter((b) => b.createdAt.slice(0, 10) >= q.startDate);
      if (q.endDate) list = list.filter((b) => b.createdAt.slice(0, 10) <= q.endDate);
      if (q.search) {
        const s = q.search.toLowerCase();
        list = list.filter(
          (b) =>
            b.billNumber.toLowerCase().includes(s) ||
            (b.customerName || "").toLowerCase().includes(s) ||
            (b.customerPhone || "").includes(s),
        );
      }
      const nonCancelled = list.filter((b) => b.status !== "cancelled");
      const summary = {
        totalAmount: round2(nonCancelled.reduce((a, b) => a + num(b.totalAmount), 0)),
        dueAmount: round2(nonCancelled.reduce((a, b) => a + num(b.dueAmount), 0)),
      };
      return ok({ bills: list, total: list.length, page: 1, pages: 1, summary });
    }

    const billInvoiceMatch = path.match(/^\/bills\/(\d+)\/invoice$/);
    if (billInvoiceMatch && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF",
      });
    }

    const billCancelMatch = path.match(/^\/bills\/(\d+)\/cancel$/);
    if (billCancelMatch && method === "PATCH") {
      if (!requireWriteSubscription()) return;
      if (u.role === "cashier" && !u.isSuperAdmin && !db.settings.cashierCanCancel) {
        return fail(403, "Cashiers are not allowed to cancel bills");
      }
      const id = parseInt(billCancelMatch[1], 10);
      const bill = db.bills.find((b) => b.id === id);
      if (!bill) return fail(404, "Bill not found");
      if (bill.status !== "completed") return fail(400, "Only completed bills can be cancelled");
      bill.items.forEach((it) => {
        const p = db.products.find((x) => x.id === it.productId);
        const back = round3(num(it.quantity) - num(it.returnedQty));
        if (p && back > 0) {
          p.quantity = round3(num(p.quantity) + back);
          db.stockMovements.unshift({
            id: db.nextId.movement++,
            productId: p.id,
            productName: p.name,
            type: "sale_cancel",
            quantity: back,
            balanceAfter: p.quantity,
            reference: bill.billNumber,
            note: "Bill cancelled",
            userName: u.username,
            createdAt: new Date().toISOString(),
          });
        }
      });
      if (bill.customerId) {
        const cust = db.customers.find((c) => c.id === bill.customerId);
        if (cust) {
          cust.totalSpent = round2(Math.max(0, num(cust.totalSpent) - num(bill.totalAmount)));
          cust.totalBills = Math.max(0, num(cust.totalBills) - 1);
          cust.balance = round2(num(cust.balance) - num(bill.dueAmount));
          cust.loyaltyPoints = round2(Math.max(0, num(cust.loyaltyPoints) - num(bill.loyaltyEarned) + num(bill.loyaltyRedeemed)));
        }
      }
      bill.status = "cancelled";
      bill.updatedAt = new Date().toISOString();
      bill.notes = [bill.notes, `Cancelled by ${u.username}${body.reason ? `: ${body.reason}` : ""}`].filter(Boolean).join("\n");
      addAudit(db, u, "BILL_CANCELLED", "bill", bill.billNumber, { reason: body.reason || "No reason" }, { status: { from: "completed", to: "cancelled" } });
      return ok({}, "Bill cancelled and stock restored");
    }

    const billReturnMatch = path.match(/^\/bills\/(\d+)\/return$/);
    if (billReturnMatch && method === "POST") {
      if (!requireWriteSubscription()) return;
      if (u.role === "cashier" && !u.isSuperAdmin && !db.settings.cashierCanCancel) {
        return fail(403, "Cashiers are not allowed to process returns");
      }
      const id = parseInt(billReturnMatch[1], 10);
      const bill = db.bills.find((b) => b.id === id);
      if (!bill) return fail(404, "Bill not found");
      const clientRef = typeof body.clientRef === "string" ? body.clientRef.slice(0, 64) : null;
      if (clientRef) {
        const existing = db.saleReturns.find((r) => r.billId === bill.id && r.clientRef === clientRef);
        if (existing) {
          return route.fulfill({
            status: 200,
            json: {
              success: true,
              message: "Return already saved",
              data: { bill, returnNumber: existing.returnNumber, amount: existing.totalAmount },
              duplicate: true,
            },
          });
        }
      }
      const reqItems = (Array.isArray(body.items) ? body.items : []).filter((i) => num(i.quantity) > 0);
      if (!reqItems.length) return fail(400, "Select at least one item to return");
      const refundMethod = body.refundMethod || "cash";
      if (!bill.customerId && (refundMethod === "adjust_due" || refundMethod === "store_credit")) {
        return fail(400, "Customer required for adjust_due / store_credit");
      }
      if (refundMethod === "cash") {
        const priorMoneyRefunds = db.saleReturns
          .filter((r) => r.billId === bill.id && ["cash", "upi", "card"].includes(r.refundMethod))
          .reduce((sum, r) => sum + num(r.totalAmount), 0);
        const available = round2(Math.max(0, num(bill.paidAmount) - priorMoneyRefunds));
        const requestedTotal = round2(reqItems.reduce((sum, r) => {
          const item = bill.items.find((x) => x.id === parseInt(r.billItemId, 10));
          return item ? sum + (num(item.totalPrice) / num(item.quantity)) * num(r.quantity) : sum;
        }, 0));
        if (requestedTotal > available + 0.001) {
          return fail(400, `Cash refund exceeds the amount collected. Maximum cash refund available is ${available.toFixed(2)}`);
        }
      }
      const retNum = `${db.settings.returnPrefix || "RET"}-${pad(db.seq.returnSeq++)}`;
      let total = 0;
      const retRows = [];
      for (const r of reqItems) {
        const it = bill.items.find((x) => x.id === parseInt(r.billItemId, 10));
        if (!it) return fail(400, "Invalid bill item");
        const qRet = round3(num(r.quantity));
        const avail = round3(num(it.quantity) - num(it.returnedQty));
        if (qRet > avail + 0.0001) return fail(400, `Only ${avail} of ${it.productName} can be returned`);
        const amount = round2((num(it.totalPrice) / num(it.quantity)) * qRet);
        total = round2(total + amount);
        it.returnedQty = round3(num(it.returnedQty) + qRet);
        if (r.restock !== false) {
          const p = db.products.find((x) => x.id === it.productId);
          if (p) {
            p.quantity = round3(num(p.quantity) + qRet);
            db.stockMovements.unshift({
              id: db.nextId.movement++,
              productId: p.id,
              productName: p.name,
              type: "return",
              quantity: qRet,
              balanceAfter: p.quantity,
              reference: retNum,
              note: "Customer return",
              userName: u.username,
              createdAt: new Date().toISOString(),
            });
          }
        }
        retRows.push({ id: retRows.length + 1, billItemId: it.id, productId: it.productId, productName: it.productName, quantity: qRet, amount, restock: r.restock !== false });
      }
      const full = bill.items.every((i) => num(i.returnedQty) >= num(i.quantity) - 0.0001);
      bill.returnedAmount = round2(num(bill.returnedAmount) + total);
      bill.status = full ? "returned" : "partially_returned";
      if (refundMethod === "adjust_due") bill.dueAmount = round2(Math.max(0, num(bill.dueAmount) - total));
      if (bill.customerId) {
        const cust = db.customers.find((c) => c.id === bill.customerId);
        if (cust) {
          cust.totalSpent = round2(Math.max(0, num(cust.totalSpent) - total));
          if (refundMethod === "adjust_due" || refundMethod === "store_credit") cust.balance = round2(num(cust.balance) - total);
        }
      }
      db.saleReturns.unshift({
        id: db.nextId.saleReturn++,
        returnNumber: retNum,
        clientRef,
        billId: bill.id,
        billNumber: bill.billNumber,
        customerId: bill.customerId,
        totalAmount: total,
        refundMethod,
        reason: body.reason || "",
        createdBy: u.username,
        createdAt: new Date().toISOString(),
        items: retRows,
      });
      addAudit(db, u, "BILL_RETURN", "bill", bill.billNumber, { returnNumber: retNum, refundAmount: total, refundMethod }, { status: { to: bill.status } });
      return ok({ bill, returnNumber: retNum, amount: total }, `Return ${retNum} saved`, 201);
    }

    const billIdMatch = path.match(/^\/bills\/(\d+)$/);
    if (billIdMatch && method === "GET") {
      const bill = db.bills.find((b) => b.id === parseInt(billIdMatch[1], 10));
      if (!bill) return fail(404, "Bill not found");
      return ok({ bill });
    }

    // Reports
    if (path === "/reports/dashboard" && method === "GET") {
      const activeBills = db.bills.filter((b) => b.status !== "cancelled");
      const todayRev = round2(activeBills.reduce((a, b) => a + (num(b.totalAmount) - num(b.returnedAmount)), 0));
      const todayCost = round2(
        activeBills.reduce(
          (a, b) => a + b.items.reduce((s, it) => s + num(it.costPrice) * (num(it.quantity) - num(it.returnedQty)), 0),
          0,
        ),
      );
      const todayTax = round2(activeBills.reduce((a, b) => a + num(b.taxAmount), 0));
      const grossProfit = round2(todayRev - todayTax - todayCost);
      const monthExp = round2(db.expenses.reduce((a, e) => a + num(e.amount), 0));
      const cashier = u.role === "cashier" && !u.isSuperAdmin;
      const hide = (v) => (cashier ? null : v);

      const payMap = {};
      activeBills.forEach((b) => {
        (b.payments || []).forEach((p) => {
          payMap[p.method] = round2((payMap[p.method] || 0) + num(p.amount));
        });
      });

      const activeProducts = db.products.filter((p) => p.isActive);
      const today = localDate(0);
      const limitDay = localDate(db.settings.expiryAlertDays || 30);

      const last7Days = [];
      for (let i = 6; i >= 0; i--) {
        const d = localDate(-i);
        last7Days.push({
          date: d,
          count: i === 0 ? activeBills.length : 0,
          revenue: i === 0 ? todayRev : 0,
        });
      }

      const itemTotals = {};
      activeBills.forEach((b) =>
        b.items.forEach((it) => {
          const cur = itemTotals[it.productName] || { name: it.productName, qty: 0, amount: 0 };
          cur.qty = round3(cur.qty + num(it.quantity) - num(it.returnedQty));
          cur.amount = round2(cur.amount + num(it.totalPrice));
          itemTotals[it.productName] = cur;
        }),
      );

      return ok({
        canSeeProfit: !cashier,
        today: {
          revenue: todayRev,
          bills: activeBills.length,
          profit: hide(grossProfit),
          avgBill: activeBills.length ? round2(todayRev / activeBills.length) : 0,
        },
        yesterday: { revenue: 0 },
        month: {
          revenue: todayRev,
          bills: activeBills.length,
          profit: hide(grossProfit),
          expenses: hide(monthExp),
          netProfit: hide(round2(grossProfit - monthExp)),
        },
        last7Days,
        todayPayments: Object.entries(payMap).map(([method, amount]) => ({ method, amount })),
        topToday: Object.values(itemTotals).slice(0, 5),
        lowStock: activeProducts.filter((p) => num(p.quantity) <= num(p.reorderLevel)),
        expiring: activeProducts.filter((p) => p.expiryDate && p.expiryDate <= limitDay && num(p.quantity) > 0),
        counts: {
          lowStock: activeProducts.filter((p) => num(p.quantity) > 0 && num(p.quantity) <= num(p.reorderLevel)).length,
          outOfStock: activeProducts.filter((p) => num(p.quantity) <= 0).length,
          expiring: activeProducts.filter((p) => p.expiryDate && p.expiryDate >= today && p.expiryDate <= limitDay).length,
          stockValue: hide(round2(activeProducts.reduce((a, p) => a + Math.max(0, num(p.quantity)) * num(p.costPrice), 0))),
        },
        recentBills: db.bills.slice(0, 8),
        totalProducts: activeProducts.length,
        receivable: round2(db.customers.filter((c) => c.isActive && num(c.balance) > 0).reduce((a, c) => a + num(c.balance), 0)),
        payable: hide(round2(db.suppliers.filter((s) => s.isActive && num(s.balance) > 0).reduce((a, s) => a + num(s.balance), 0))),
      });
    }

    if (path === "/reports/sales" && method === "GET") {
      const activeBills = db.bills.filter((b) => b.status !== "cancelled");
      const totalRevenue = round2(activeBills.reduce((a, b) => a + num(b.totalAmount) - num(b.returnedAmount), 0));
      const totalTax = round2(activeBills.reduce((a, b) => a + num(b.taxAmount), 0));
      const totalDiscount = round2(activeBills.reduce((a, b) => a + num(b.discountAmount) + num(b.itemDiscount), 0));
      const totalDue = round2(activeBills.reduce((a, b) => a + num(b.dueAmount), 0));
      const totalReturns = round2(activeBills.reduce((a, b) => a + num(b.returnedAmount), 0));
      const costOfGoods = round2(
        activeBills.reduce((a, b) => a + b.items.reduce((s, it) => s + num(it.costPrice) * (num(it.quantity) - num(it.returnedQty)), 0), 0),
      );
      const totalItems = round3(
        activeBills.reduce((a, b) => a + b.items.reduce((s, it) => s + num(it.quantity) - num(it.returnedQty), 0), 0),
      );
      const payMap = {};
      activeBills.forEach((b) => (b.payments || []).forEach((p) => (payMap[p.method] = round2((payMap[p.method] || 0) + num(p.amount)))));
      const duesCollected = round2(db.customerPayments.reduce((a, p) => a + num(p.amount), 0));
      return ok({
        range: { from: localDate(0), to: localDate(0) },
        summary: {
          totalBills: activeBills.length,
          totalRevenue,
          totalItems,
          averageBillValue: activeBills.length ? round2(totalRevenue / activeBills.length) : 0,
          totalTax,
          totalDiscount,
          totalDue,
          totalReturns,
          grossProfit: round2(totalRevenue - totalTax - costOfGoods),
          costOfGoods,
          duesCollected,
        },
        payments: Object.entries(payMap).map(([method, amount]) => ({ method, amount })),
        daily: activeBills.length ? [{ date: localDate(0), bills: activeBills.length, revenue: totalRevenue, tax: totalTax, discount: totalDiscount }] : [],
        hourly: activeBills.length ? [{ hour: 12, bills: activeBills.length, revenue: totalRevenue }] : [],
      });
    }

    if (path === "/reports/top-products" && method === "GET") {
      const map = {};
      db.bills
        .filter((b) => b.status !== "cancelled")
        .forEach((b) =>
          b.items.forEach((it) => {
            const cur = map[it.productId] || { productId: it.productId, productName: it.productName, totalSold: 0, totalRevenue: 0, profit: 0, orderCount: 0 };
            const qty = num(it.quantity) - num(it.returnedQty);
            cur.totalSold = round3(cur.totalSold + qty);
            cur.totalRevenue = round2(cur.totalRevenue + num(it.totalPrice));
            cur.profit = round2(cur.profit + num(it.totalPrice) - num(it.taxAmount) - num(it.costPrice) * qty);
            cur.orderCount += 1;
            map[it.productId] = cur;
          }),
        );
      return ok({ topProducts: Object.values(map) });
    }

    if (path === "/reports/categories" && method === "GET") {
      const map = {};
      db.bills
        .filter((b) => b.status !== "cancelled")
        .forEach((b) =>
          b.items.forEach((it) => {
            const p = db.products.find((x) => x.id === it.productId);
            const cat = p?.category || "Uncategorised";
            const cur = map[cat] || { category: cat, qty: 0, revenue: 0, profit: 0 };
            const qty = num(it.quantity) - num(it.returnedQty);
            cur.qty = round3(cur.qty + qty);
            cur.revenue = round2(cur.revenue + num(it.totalPrice));
            cur.profit = round2(cur.profit + num(it.totalPrice) - num(it.taxAmount) - num(it.costPrice) * qty);
            map[cat] = cur;
          }),
        );
      return ok({ categories: Object.values(map) });
    }

    if (path === "/reports/gst" && method === "GET") {
      const slabMap = {};
      const hsnMap = {};
      db.bills
        .filter((b) => b.status !== "cancelled")
        .forEach((b) =>
          b.items.forEach((it) => {
            const rate = num(it.taxRate);
            const sk = `${rate}-${b.interState ? 1 : 0}`;
            const cur = slabMap[sk] || { rate, interState: Boolean(b.interState), taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, total: 0 };
            cur.taxable = round2(cur.taxable + num(it.taxableAmount));
            cur.tax = round2(cur.tax + num(it.taxAmount));
            cur.cgst = round2(cur.tax / 2);
            cur.sgst = round2(cur.tax - cur.cgst);
            cur.total = round2(cur.total + num(it.totalPrice));
            slabMap[sk] = cur;

            const hk = `${it.hsnCode || "-"}-${rate}`;
            const h = hsnMap[hk] || { hsn: it.hsnCode || "-", rate, qty: 0, taxable: 0, tax: 0 };
            h.qty = round3(h.qty + num(it.quantity));
            h.taxable = round2(h.taxable + num(it.taxableAmount));
            h.tax = round2(h.tax + num(it.taxAmount));
            hsnMap[hk] = h;
          }),
        );
      const slabs = Object.values(slabMap);
      const outputTax = round2(slabs.reduce((a, s) => a + s.tax, 0));
      const inputTax = round2(db.purchases.filter((p) => p.status === "completed").reduce((a, p) => a + num(p.taxAmount), 0));
      return ok({
        range: { from: localDate(0), to: localDate(0) },
        gstNumber: db.settings.gstNumber,
        state: db.settings.state,
        slabs,
        hsn: Object.values(hsnMap),
        totals: {
          taxable: round2(slabs.reduce((a, s) => a + s.taxable, 0)),
          cgst: round2(slabs.reduce((a, s) => a + s.cgst, 0)),
          sgst: round2(slabs.reduce((a, s) => a + s.sgst, 0)),
          igst: 0,
          outputTax,
          inputTax,
          netPayable: round2(outputTax - inputTax),
        },
      });
    }

    if (path === "/reports/profit" && method === "GET") {
      if (u.role !== "owner" && !u.isSuperAdmin) return fail(403, "Owner access required");
      const activeBills = db.bills.filter((b) => b.status !== "cancelled");
      const revenue = round2(activeBills.reduce((a, b) => a + num(b.totalAmount) - num(b.returnedAmount), 0));
      const tax = round2(activeBills.reduce((a, b) => a + num(b.taxAmount), 0));
      const cost = round2(activeBills.reduce((a, b) => a + b.items.reduce((s, it) => s + num(it.costPrice) * (num(it.quantity) - num(it.returnedQty)), 0), 0));
      const grossProfit = round2(revenue - tax - cost);
      const expByCat = {};
      db.expenses.forEach((e) => (expByCat[e.category] = round2((expByCat[e.category] || 0) + num(e.amount))));
      const expTotal = round2(db.expenses.reduce((a, e) => a + num(e.amount), 0));
      return ok({
        range: { from: localDate(0), to: localDate(0) },
        summary: {
          revenue,
          tax,
          cost,
          grossProfit,
          expenses: expTotal,
          netProfit: round2(grossProfit - expTotal),
          margin: revenue ? round2((grossProfit / Math.max(1, revenue - tax)) * 100) : 0,
        },
        daily: activeBills.length ? [{ date: localDate(0), revenue, tax, cost, profit: grossProfit }] : [],
        expenses: Object.entries(expByCat).map(([category, total]) => ({ category, total })),
      });
    }

    if (path === "/reports/staff" && method === "GET") {
      const map = {};
      db.bills.forEach((b) => {
        const name = b.cashierName || "-";
        const cur = map[name] || { cashier: name, bills: 0, revenue: 0, discount: 0, cancelled: 0 };
        if (b.status === "cancelled") cur.cancelled += 1;
        else {
          cur.bills += 1;
          cur.revenue = round2(cur.revenue + num(b.totalAmount) - num(b.returnedAmount));
          cur.discount = round2(cur.discount + num(b.discountAmount) + num(b.itemDiscount));
        }
        map[name] = cur;
      });
      return ok({ staff: Object.values(map) });
    }

    if (path === "/reports/day-end" && method === "GET") {
      const date = q.date || localDate(0);
      const dayBills = db.bills.filter((b) => b.createdAt.slice(0, 10) === date);
      const active = dayBills.filter((b) => b.status !== "cancelled");
      const cancelled = dayBills.filter((b) => b.status === "cancelled");
      const payMap = {};
      dayBills.forEach((b) => (b.payments || []).forEach((p) => (payMap[p.method] = round2((payMap[p.method] || 0) + num(p.amount)))));
      const cashSales = payMap.cash || 0;
      const cashCancel = cancelled.reduce(
        (a, b) => a + (b.payments || []).filter((p) => p.method === "cash").reduce((s, p) => s + num(p.amount), 0),
        0,
      );
      const cashCollected = round2(db.customerPayments.filter((p) => p.method === "cash" && p.createdAt.slice(0, 10) === date).reduce((a, p) => a + num(p.amount), 0));
      const cashExp = round2(db.expenses.filter((e) => e.paymentMethod === "cash" && e.expenseDate === date).reduce((a, e) => a + num(e.amount), 0));
      const cashRefunds = round2(db.saleReturns.filter((r) => r.refundMethod === "cash" && r.createdAt.slice(0, 10) === date).reduce((a, r) => a + num(r.totalAmount), 0));
      const cashSup = round2(db.supplierPayments.filter((p) => p.method === "cash" && p.createdAt.slice(0, 10) === date).reduce((a, p) => a + num(p.amount), 0));
      return ok({
        date,
        sales: {
          bills: active.length,
          revenue: round2(active.reduce((a, b) => a + num(b.totalAmount) - num(b.returnedAmount), 0)),
          due: round2(active.reduce((a, b) => a + num(b.dueAmount), 0)),
        },
        cancelledBills: cancelled.length,
        payments: Object.entries(payMap).map(([method, amount]) => ({ method, amount })),
        collections: round2(db.customerPayments.filter((p) => p.createdAt.slice(0, 10) === date).reduce((a, p) => a + num(p.amount), 0)),
        expenses: round2(db.expenses.filter((e) => e.expenseDate === date).reduce((a, e) => a + num(e.amount), 0)),
        refunds: round2(db.saleReturns.filter((r) => r.createdAt.slice(0, 10) === date).reduce((a, r) => a + num(r.totalAmount), 0)),
        cash: {
          sales: round2(cashSales),
          collected: cashCollected,
          expenses: cashExp,
          refunds: cashRefunds,
          cancellations: round2(cashCancel),
          suppliers: cashSup,
          expectedInDrawer: round2(cashSales + cashCollected - cashExp - cashRefunds - cashCancel - cashSup),
        },
      });
    }

    if (path === "/reports/stock" && method === "GET") {
      const rows = db.products
        .filter((p) => p.isActive)
        .map((p) => ({
          id: p.id,
          name: p.name,
          barcode: p.barcode,
          category: p.category,
          unit: p.unit,
          price: p.price,
          costPrice: p.costPrice,
          openingStock: p.quantity,
          inward: 0,
          soldQty: 0,
          adjustment: 0,
          closingStock: p.quantity,
          currentStock: p.quantity,
          stockValue: round2(Math.max(0, num(p.quantity)) * num(p.costPrice)),
        }));
      return ok(rows);
    }

    if (path === "/reports/expiry" && method === "GET") {
      const days = parseInt(q.days, 10) || 30;
      const today = localDate(0);
      const limitDay = localDate(days);
      const list = db.products.filter((p) => p.isActive && p.expiryDate && p.expiryDate <= limitDay);
      return ok({
        today,
        days,
        expired: list.filter((p) => p.expiryDate < today),
        expiring: list.filter((p) => p.expiryDate >= today),
        valueAtRisk: round2(list.reduce((a, p) => a + Math.max(0, num(p.quantity)) * num(p.costPrice), 0)),
      });
    }

    if (path === "/reports/audit-logs" && method === "GET") {
      return ok({ logs: db.auditLogs, total: db.auditLogs.length, page: 1, pages: 1 });
    }

    return fail(404, `Unhandled API route ${method} ${path}`);
  });

  return state;
}

async function signIn(page, email, password) {
  await page.goto("/login");
  await page.getByPlaceholder("you@yourstore.com").fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
}

// Locate an input/select/textarea inside a <Field label="..."> component (which lacks htmlFor)
function fieldControl(root, labelText) {
  return root
    .locator(`xpath=.//label[starts-with(normalize-space(.), "${labelText}")]/..//*[self::input or self::select or self::textarea]`)
    .first();
}

function toggleSwitch(root, labelText) {
  return root.locator("label", { hasText: labelText }).getByRole("switch");
}

module.exports = {
  createMockState,
  installMockApi,
  signIn,
  fieldControl,
  toggleSwitch,
  localDate,
};
