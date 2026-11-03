// src/utils/helpers.js
// Currency/locale follow the shop's settings (set by SettingsContext via configureFormat)
let FORMAT = { symbol: "₹", locale: "en-IN", code: "INR" };
export const configureFormat = ({ currencySymbol, locale, currencyCode } = {}) => {
  FORMAT = {
    symbol: currencySymbol || "₹",
    locale: locale || "en-IN",
    code: currencyCode || "INR",
  };
};
export const currencySymbol = () => FORMAT.symbol;

export const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

// Keeps only digits (and a single "." when decimals are allowed) as the user types,
// so quantity / price boxes can never hold letters, "e", "+", "-" or pasted text.
export const numericOnly = (value, allowDecimal = false) => {
  let s = String(value ?? "").replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, "");
  if (allowDecimal) {
    const dot = s.indexOf(".");
    if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  }
  return s;
};

// Blocks non-numeric keys before they reach the box (paste is still cleaned by numericOnly).
export const blockNonNumericKeys = (allowDecimal = false) => (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.key.length > 1) return; // shortcuts, arrows, Backspace, Tab…
  if (/[0-9]/.test(e.key)) return;
  if (allowDecimal && e.key === "." && !String(e.currentTarget.value).includes(".")) return;
  e.preventDefault();
};

export const formatCurrency = (amount) => {
  const n = num(amount);
  const formatted = new Intl.NumberFormat(FORMAT.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));
  return `${n < 0 ? "-" : ""}${FORMAT.symbol}${formatted}`;
};

export const formatQty = (q, unit) => {
  const n = num(q);
  const s = Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
  return unit && unit !== "pcs" ? `${s} ${unit}` : s;
};

export const formatDate = (date) =>
  date ? new Date(date).toLocaleDateString(FORMAT.locale, { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const formatDateTime = (date) =>
  date
    ? new Date(date).toLocaleString(FORMAT.locale, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

export const formatNumber = (n) => new Intl.NumberFormat(FORMAT.locale).format(num(n));

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const monthStartStr = () => {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
};

export const getErrorMessage = (err) => err?.response?.data?.message || err?.message || "Something went wrong";

export const debounce = (fn, ms = 300) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

export const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const downloadCSV = (filename, rows) => {
  const csv = rows
    .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
};

export const getStockBadge = (qty, reorder = 10) => {
  const q = num(qty);
  if (q <= 0) return { label: "Out of stock", bg: "var(--danger-light)", color: "var(--danger)" };
  if (q <= num(reorder, 10)) return { label: "Low stock", bg: "rgba(var(--accent-rgb),0.12)", color: "var(--accent-dark)" };
  return { label: "In stock", bg: "var(--success-light)", color: "var(--success)" };
};

export const PAYMENT_LABELS = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  credit: "Credit (Due)",
  wallet: "Wallet",
  cheque: "Cheque",
  split: "Split",
  other: "Other",
  bank: "Bank",
};

export const paymentColor = (m) =>
  ({ cash: "var(--success)", card: "var(--info)", upi: "#8a5cc2", credit: "var(--danger)", split: "var(--accent)" })[m] || "var(--text-muted)";

export const ROLE_LABELS = { owner: "Owner", manager: "Manager", cashier: "Cashier" };

export const cleanPhone = (val) => {
  if (val === undefined || val === null) return "";
  let digits = String(val).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 15);
};

export const isValidPhone = (val) => {
  if (!val) return false;
  const rawDigits = String(val).replace(/\D/g, "");
  if (rawDigits.length > 15) return false;
  const p = cleanPhone(val);
  if (!p) return false;
  if (p.length === 10) {
    return /^[6-9]\d{9}$/.test(p);
  }
  return /^\d{11,15}$/.test(p);
};
