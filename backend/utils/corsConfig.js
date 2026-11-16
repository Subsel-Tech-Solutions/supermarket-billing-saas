// utils/corsConfig.js — Strict and secure CORS origin validator
const isLocalhost = (origin) => {
  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
};

const buildCorsOptions = (env = process.env) => {
  const isProd = env.NODE_ENV === "production";
  const raw = env.CORS_ORIGIN || "";
  const allowed = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const originValidator = (origin, callback) => {
    // 1. Requests with no origin (mobile apps, curl, Postman, server-to-server health checks)
    if (!origin) {
      return callback(null, true);
    }

    // 2. Production mode: strictly enforce explicit whitelist, disallow '*' with credentials
    if (isProd) {
      if (allowed.length === 0 || allowed.includes("*")) {
        console.warn(
          `[CORS] Rejected cross-origin request from "${origin}". In production, CORS_ORIGIN must be set to explicit trusted origins and cannot be "*".`,
        );
        return callback(null, false);
      }
      if (allowed.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    }

    // 3. Development / Test mode:
    if (allowed.length === 0 || allowed.includes("*")) {
      return callback(null, true);
    }
    if (allowed.includes(origin)) {
      return callback(null, true);
    }
    if (isLocalhost(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  };

  return {
    origin: originValidator,
    credentials: true,
  };
};

module.exports = { buildCorsOptions, isLocalhost };
