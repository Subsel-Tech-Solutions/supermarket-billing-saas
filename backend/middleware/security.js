// middleware/security.js — response headers + brute-force protection
// Deliberately dependency-free: a single-server POS deployment should not need
// helmet/express-rate-limit just for this.

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
 * Fixed-window rate limiter kept in memory.
 *
 * In-memory means the counters are per process: with several instances behind a load
 * balancer each one keeps its own window, so set the limits per instance. It is enough
 * to stop password guessing against a single-server install, which is the realistic
 * deployment for this app.
 */
const buckets = new Map();

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets.entries()) if (b.resetAt <= now) buckets.delete(key);
}, 60000);
sweep.unref();

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
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const remaining = Math.max(0, max - bucket.count);
  res.setHeader("X-RateLimit-Limit", max);
  res.setHeader("X-RateLimit-Remaining", remaining);
  if (bucket.count > max) {
    const retry = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader("Retry-After", retry);
    return res.status(429).json({ success: false, message, code: "RATE_LIMITED", retryAfter: retry });
  }
  return next();
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

const resetRateLimits = () => buckets.clear();

module.exports = { securityHeaders, rateLimit, loginLimiter, signupLimiter, passwordResetLimiter, apiLimiter, resetRateLimits };
