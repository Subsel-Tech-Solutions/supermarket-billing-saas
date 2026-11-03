// utils/helpers.js — shared helpers for controllers
const { amountToWords, numberToIndianWords } = require("./numberToWords");

// Wrap async route handlers so thrown errors reach the error middleware
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

class HttpError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.statusCode = statusCode;
    if (code) this.code = code;
  }
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
const int = (v, fallback = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};
const str = (v, max = 255) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s.slice(0, max);
};
const bool = (v) => v === true || v === "true" || v === 1 || v === "1";

const pad = (n, width = 6) => String(n).padStart(width, "0");

/**
 * Normalizes phone numbers:
 * - Strips all non-digit characters (spaces, dashes, parens, plus, dots).
 * - Strips leading zero if 11 digits (e.g., 09876543210 -> 9876543210).
 * - Strips country code 91 if 12 digits (e.g., 919876543210 -> 9876543210).
 * - Rejects if exceeding ITU-T E.164 maximum of 15 digits.
 */
const normalizePhone = (v) => {
  if (v === undefined || v === null) return null;
  let digits = String(v).replace(/\D/g, "");
  if (!digits) return null;

  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }

  if (digits.length > 15) return null;

  return digits;
};

/**
 * Validates normalized phone number:
 * - Standard Indian mobile: 10 digits starting with 6, 7, 8, or 9
 * - Or international mobile between 11 and 15 digits
 */
const isValidPhone = (v) => {
  const p = normalizePhone(v);
  if (!p) return false;
  if (p.length === 10) {
    return /^[6-9]\d{9}$/.test(p);
  }
  return /^\d{11,15}$/.test(p);
};

// Pagination params (?page & ?limit) with sane bounds
const paging = (query, defLimit = 20, maxLimit = 500) => {
  const page = Math.max(1, int(query.page, 1));
  const limit = Math.min(maxLimit, Math.max(1, int(query.limit, defLimit)));
  return { page, limit, offset: (page - 1) * limit };
};

/**
 * Asserts that selling price does not exceed declared Maximum Retail Price (MRP).
 * Selling above MRP is a statutory offence under the Legal Metrology Act & Consumer Protection Act.
 * If mrp is null, undefined, or 0 (e.g. loose produce/staples), the check is skipped.
 */
const assertPriceWithinMrp = (price, mrp, productName = "Product") => {
  const p = Number(price);
  const m = mrp !== null && mrp !== undefined && mrp !== "" ? Number(mrp) : null;
  if (m !== null && Number.isFinite(m) && m > 0) {
    if (Number.isFinite(p) && p > m + 0.001) {
      throw new HttpError(
        400,
        `Selling price (₹${p.toFixed(2)}) cannot exceed MRP (₹${m.toFixed(2)}) for "${productName}". Selling above MRP is a statutory violation.`,
        "PRICE_EXCEEDS_MRP",
      );
    }
  }
};

module.exports = {
  asyncHandler,
  HttpError,
  round2,
  round3,
  num,
  int,
  str,
  bool,
  pad,
  normalizePhone,
  isValidPhone,
  paging,
  assertPriceWithinMrp,
  amountToWords,
  numberToIndianWords,
};
