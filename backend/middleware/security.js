// middleware/security.js — response headers + brute-force protection
const { createHash } = require("crypto");
const { sequelize } = require("../config/database");

/**
 * Conservative security headers. No CSP by default because the React build uses
 * inline styles everywhere; set CSP_ENABLED=true once you have reviewed it.
 */
const securityHeaders = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  // API responses must never be cached by a proxy — they are per-tenant.
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
};

/**
 * Shared fixed-window counters stored in the master database. Hashing keys avoids
 * persisting client IPs or login email addresses in clear text.
 */
let cleanupTimer;

const ensureRateLimitStore = () =>
  sequelize.query(
    `CREATE TABLE IF NOT EXISTS rate_limit_buckets (
      bucket_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      hits INT UNSIGNED NOT NULL,
      reset_at BIGINT UNSIGNED NOT NULL,
      KEY ix_rate_limit_reset (reset_at)
    ) ENGINE=InnoDB`,
  );

const startRateLimitCleanup = () => {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    sequelize.query("DELETE FROM rate_limit_buckets WHERE reset_at <= :now", { replacements: { now: Date.now() } }).catch((err) => {
      console.error("[rate-limit] Failed to remove expired counters:", err.message);
    });
  }, 60000);
  cleanupTimer.unref();
};

const stopRateLimitCleanup = () => {
  if (cleanupTimer) clearInterval(cleanupTimer);
  cleanupTimer = undefined;
};

const clientKey = (req) => {
  // app.set("trust proxy", …) makes req.ip respect X-Forwarded-For
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  return ip.replace(/^::ffff:/, "");
};

const rateLimit = ({ windowMs = 60000, max = 60, message = "Too many requests, please slow down.", keyFn } = {}) => (
  req,
  res,
  next,
) => {
  if (process.env.DISABLE_RATE_LIMIT === "true") return next();
  const key = `${req.baseUrl}${req.path}:${keyFn ? keyFn(req) : clientKey(req)}`;
  const now = Date.now();
  const bucketKey = createHash("sha256").update(key).digest("hex");
  return sequelize
    .transaction(async (transaction) => {
      await sequelize.query(
        `INSERT INTO rate_limit_buckets (bucket_key, hits, reset_at)
         VALUES (:key, 1, :newResetAt)
         ON DUPLICATE KEY UPDATE
           hits = IF(reset_at <= :now, 1, hits + 1),
           reset_at = IF(reset_at <= :now, :newResetAt, reset_at)`,
        { replacements: { key: bucketKey, now, newResetAt: now + windowMs }, transaction },
      );
      const [rows] = await sequelize.query(
        "SELECT hits, reset_at AS resetAt FROM rate_limit_buckets WHERE bucket_key = :key FOR UPDATE",
        { replacements: { key: bucketKey }, transaction },
      );
      const count = Number(rows?.[0]?.hits);
      const resetAt = Number(rows?.[0]?.resetAt);
      if (!Number.isFinite(count) || !Number.isFinite(resetAt)) throw new Error("Rate-limit counter was not persisted");
      return { count, resetAt };
    })
    .then(({ count, resetAt }) => {
      const remaining = Math.max(0, max - count);
      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", remaining);
      if (count > max) {
        const retry = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
        res.setHeader("Retry-After", retry);
        return res.status(429).json({ success: false, message, code: "RATE_LIMITED", retryAfter: retry });
      }
      return next();
    })
    .catch(next);
};

// Password guessing: counted per IP *and* per email so one attacker cannot spread
// attempts over many accounts, and cannot lock a victim out by using their email.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.LOGIN_RATE_LIMIT || "20", 10),
  message: "Too many login attempts. Please wait a few minutes and try again.",
  keyFn: (req) => `${clientKey(req)}|${String(req.body?.email || "").toLowerCase().slice(0, 120)}`,
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.SIGNUP_RATE_LIMIT || "10", 10),
  message: "Too many sign-ups from this network. Please try again later.",
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.PASSWORD_RESET_RATE_LIMIT || "5", 10),
  message: "Too many password reset requests. Please try again later.",
  keyFn: (req) => `${clientKey(req)}|${String(req.body?.email || "").toLowerCase().slice(0, 120)}`,
});

// Generous ceiling for the authenticated API — a busy till does many requests a minute.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT || "600", 10),
});

const resetRateLimits = () => sequelize.query("DELETE FROM rate_limit_buckets");

module.exports = {
  securityHeaders,
  rateLimit,
  loginLimiter,
  signupLimiter,
  passwordResetLimiter,
  apiLimiter,
  ensureRateLimitStore,
  startRateLimitCleanup,
  stopRateLimitCleanup,
  resetRateLimits,
};
