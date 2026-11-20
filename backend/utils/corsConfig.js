// utils/corsConfig.js — Strict and secure CORS origin validator
const isLocalhost = (origin) => {
  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
};

const isAllowedOrigin = (origin, env = process.env) => {
  if (!origin) return true;

  const isProd = env.NODE_ENV === "production";
  const allowed = String(env.CORS_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (isProd) return allowed.length > 0 && !allowed.includes("*") && allowed.includes(origin);
  if (allowed.length === 0 || allowed.includes("*")) return true;
  return allowed.includes(origin) || isLocalhost(origin);
};

const buildCorsOptions = (env = process.env) => {
  const originValidator = (origin, callback) => {
    if (
      origin &&
      env.NODE_ENV === "production" &&
      (!String(env.CORS_ORIGIN || "").trim() ||
        String(env.CORS_ORIGIN).split(",").map((s) => s.trim()).includes("*"))
    ) {
      console.warn(
        `[CORS] Rejected cross-origin request from "${origin}". In production, CORS_ORIGIN must be set to explicit trusted origins and cannot be "*".`,
      );
    }
    return callback(null, isAllowedOrigin(origin, env));
  };

  return {
    origin: originValidator,
    credentials: true,
    exposedHeaders: ["X-CSRF-Token"],
  };
};

module.exports = { buildCorsOptions, isLocalhost, isAllowedOrigin };
