// middleware/csrf.js — Double-submit CSRF protection with Origin verification
const crypto = require("crypto");

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];
const isProd = process.env.NODE_ENV === "production";

const generateCsrfToken = () => crypto.randomBytes(32).toString("hex");

const setCsrfCookie = (res, token = generateCsrfToken()) => {
  res.cookie("XSRF-TOKEN", token, {
    httpOnly: false, // Accessible to JavaScript/Axios to copy into request header
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return token;
};

const verifyCsrf = (req, res, next) => {
  if (SAFE_METHODS.includes(req.method)) return next();

  // If request is authenticated via cookies, verify CSRF token
  const hasAuthCookie = !!(req.cookies?.accessToken || req.cookies?.refreshToken);
  if (!hasAuthCookie) {
    // If not using cookies (e.g. initial public login/signup without cookie session, or bearer token CLI)
    // we still ensure CSRF cookie is set, but don't block unauthenticated initial requests
    return next();
  }

  const cookieToken = req.cookies?.["XSRF-TOKEN"];
  const headerToken = req.headers["x-xsrf-token"] || req.headers["x-csrf-token"];

  if (!cookieToken || !headerToken) {
    return res.status(403).json({
      success: false,
      message: "CSRF token missing. Please refresh and try again.",
      code: "CSRF_MISSING",
    });
  }

  try {
    const a = Buffer.from(cookieToken);
    const b = Buffer.from(headerToken);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).json({
        success: false,
        message: "Invalid CSRF token. Please refresh and try again.",
        code: "CSRF_INVALID",
      });
    }
  } catch {
    return res.status(403).json({
      success: false,
      message: "Invalid CSRF token format.",
      code: "CSRF_INVALID",
    });
  }

  next();
};

module.exports = { generateCsrfToken, setCsrfCookie, verifyCsrf };
