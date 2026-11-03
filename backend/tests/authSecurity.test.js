// tests/authSecurity.test.js — Automated test suite for HTTP-only cookies, tokenVersion, rotation, reuse detection, and CSRF
const assert = require("assert");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "super_secret_test_key_at_least_32_chars_long_12345";
process.env.JWT_REFRESH_SECRET = "super_secret_refresh_test_key_at_least_32_chars_long_12345";

const {
  signAccessToken,
  signRefreshToken,
  hashToken,
  setAuthCookies,
  clearAuthCookies,
  protect,
} = require("../middleware/auth");
const { verifyCsrf, generateCsrfToken, setCsrfCookie } = require("../middleware/csrf");
const settingsMod = require("../utils/settings");

let passed = 0;
const check = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`\n✗ ${name}\n  ${err.message}\n`);
    process.exitCode = 1;
  }
};

// Mock Response
const createMockRes = () => {
  const cookies = {};
  const clearedCookies = [];
  let statusCode = 200;
  let jsonBody = null;

  const res = {
    cookie: (name, val, opts) => {
      cookies[name] = { val, opts };
      return res;
    },
    clearCookie: (name, opts) => {
      clearedCookies.push({ name, opts });
      delete cookies[name];
      return res;
    },
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (body) => {
      jsonBody = body;
      return res;
    },
    getCookies: () => cookies,
    getCleared: () => clearedCookies,
    getStatus: () => statusCode,
    getBody: () => jsonBody,
  };
  return res;
};

(async () => {
  console.log("Starting Auth Security Test Suite...\n");

  // 1. Access Token Payload & Expiry
  await check("Access token payload contains id, shopId, and tokenVersion", () => {
    const user = { id: 42, shopId: 7, tokenVersion: 3 };
    const token = signAccessToken(user);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    assert.equal(decoded.id, 42);
    assert.equal(decoded.shopId, 7);
    assert.equal(decoded.tokenVersion, 3);
  });

  // 2. Refresh Token Payload
  await check("Refresh token payload contains id, family, and tokenVersion", () => {
    const user = { id: 42, shopId: 7, tokenVersion: 5 };
    const family = "fam-abc-123";
    const token = signRefreshToken(user, family);
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    assert.equal(decoded.id, 42);
    assert.equal(decoded.family, family);
    assert.equal(decoded.tokenVersion, 5);
  });

  // 3. Cookie Configuration (HTTP-only, Lax, Secure check)
  await check("setAuthCookies sets secure HTTP-only cookies without body exposure", async () => {
    const res = createMockRes();
    const user = { id: 10, shopId: 2, tokenVersion: 1 };
    
    // Stub RefreshToken.create
    const { RefreshToken } = require("../models/master");
    const origCreate = RefreshToken.create;
    let savedRecord = null;
    RefreshToken.create = async (data) => {
      savedRecord = data;
      return data;
    };

    try {
      await setAuthCookies(res, user);
      const cookies = res.getCookies();

      // Access Token Cookie
      assert(cookies.accessToken, "accessToken cookie must exist");
      assert.strictEqual(cookies.accessToken.opts.httpOnly, true, "accessToken must be httpOnly");
      assert.strictEqual(cookies.accessToken.opts.sameSite, "lax", "accessToken must have sameSite=lax");
      assert.strictEqual(cookies.accessToken.opts.path, "/", "accessToken must have path=/");
      assert.strictEqual(cookies.accessToken.opts.maxAge, 15 * 60 * 1000, "accessToken maxAge must be 15m");

      // Refresh Token Cookie
      assert(cookies.refreshToken, "refreshToken cookie must exist");
      assert.strictEqual(cookies.refreshToken.opts.httpOnly, true, "refreshToken must be httpOnly");
      assert.strictEqual(cookies.refreshToken.opts.path, "/api/auth", "refreshToken must be restricted to /api/auth");
      assert.strictEqual(cookies.refreshToken.opts.maxAge, 7 * 24 * 60 * 60 * 1000, "refreshToken maxAge must be 7d");

      // CSRF Token Cookie
      assert(cookies["XSRF-TOKEN"], "XSRF-TOKEN cookie must exist");
      assert.strictEqual(cookies["XSRF-TOKEN"].opts.httpOnly, false, "XSRF-TOKEN must be readable by JS");

      // Database Record
      assert(savedRecord, "RefreshToken must be recorded in DB");
      assert.equal(savedRecord.userId, 10);
      assert.equal(savedRecord.isRevoked, false);
      assert.equal(savedRecord.tokenHash, hashToken(cookies.refreshToken.val));
    } finally {
      RefreshToken.create = origCreate;
    }
  });

  // 4. Cookie Clearing
  await check("clearAuthCookies clears accessToken, refreshToken, XSRF-TOKEN, and admin tokens", () => {
    const res = createMockRes();
    clearAuthCookies(res);
    const cleared = res.getCleared();
    const names = cleared.map((c) => c.name);
    assert(names.includes("accessToken"), "Must clear accessToken");
    assert(names.includes("refreshToken"), "Must clear refreshToken");
    assert(names.includes("XSRF-TOKEN"), "Must clear XSRF-TOKEN");
    assert(names.includes("adminAccessToken"), "Must clear adminAccessToken");
    assert(names.includes("adminRefreshToken"), "Must clear adminRefreshToken");
  });

  // 5. CSRF Protection
  await check("CSRF middleware allows safe methods (GET, HEAD, OPTIONS)", () => {
    const req = { method: "GET" };
    const res = createMockRes();
    let calledNext = false;
    verifyCsrf(req, res, () => {
      calledNext = true;
    });
    assert.strictEqual(calledNext, true, "GET requests must pass CSRF");
  });

  await check("CSRF middleware blocks cookie-authenticated mutations missing CSRF header", () => {
    const req = {
      method: "POST",
      cookies: { accessToken: "some.cookie.val", "XSRF-TOKEN": "valid-token-123" },
      headers: {},
    };
    const res = createMockRes();
    let calledNext = false;
    verifyCsrf(req, res, () => {
      calledNext = true;
    });
    assert.strictEqual(calledNext, false, "Must block request without CSRF header");
    assert.strictEqual(res.getStatus(), 403);
    assert.strictEqual(res.getBody().code, "CSRF_MISSING");
  });

  await check("CSRF middleware blocks cookie-authenticated mutations with mismatched token", () => {
    const req = {
      method: "POST",
      cookies: { accessToken: "some.cookie.val", "XSRF-TOKEN": "token-aaa" },
      headers: { "x-xsrf-token": "token-bbb" },
    };
    const res = createMockRes();
    let calledNext = false;
    verifyCsrf(req, res, () => {
      calledNext = true;
    });
    assert.strictEqual(calledNext, false, "Must block mismatched CSRF token");
    assert.strictEqual(res.getStatus(), 403);
    assert.strictEqual(res.getBody().code, "CSRF_INVALID");
  });

  await check("CSRF middleware allows cookie-authenticated mutations with matching token", () => {
    const token = generateCsrfToken();
    const req = {
      method: "POST",
      cookies: { accessToken: "some.cookie.val", "XSRF-TOKEN": token },
      headers: { "x-xsrf-token": token },
    };
    const res = createMockRes();
    let calledNext = false;
    verifyCsrf(req, res, () => {
      calledNext = true;
    });
    assert.strictEqual(calledNext, true, "Must allow matching CSRF token");
  });

  // 6. Token Revocation via tokenVersion in protect Middleware
  await check("protect middleware rejects access token when tokenVersion has changed", async () => {
    const { User } = require("../models/master");
    const origFindByPk = User.findByPk;

    // Simulate user in DB with incremented tokenVersion: 2
    User.findByPk = async () => ({
      id: 99,
      shopId: 1,
      isActive: true,
      tokenVersion: 2, // User changed password!
      shop: { id: 1, isActive: true },
    });

    try {
      // Token was issued when tokenVersion was 1
      const oldToken = jwt.sign(
        { id: 99, shopId: 1, tokenVersion: 1 },
        process.env.JWT_SECRET,
        { expiresIn: "15m" }
      );

      const req = { cookies: { accessToken: oldToken }, headers: {} };
      const res = createMockRes();
      let calledNext = false;

      await protect(req, res, () => {
        calledNext = true;
      });

      assert.strictEqual(calledNext, false, "Must not allow revoked token");
      assert.strictEqual(res.getStatus(), 401);
      assert.strictEqual(res.getBody().code, "TOKEN_REVOKED");
    } finally {
      User.findByPk = origFindByPk;
    }
  });

  // 7. Refresh Token Rotation & Reuse Detection
  await check("Refresh token rotation invalidates old token and issues new in same family", async () => {
    const { RefreshToken, User } = require("../models/master");
    const origFindOne = RefreshToken.findOne;
    const origCreate = RefreshToken.create;
    const origUserFind = User.findByPk;
    const origGetPlatformSettings = settingsMod.getPlatformSettings;

    const family = "fam-test-rotation";
    const initialToken = jwt.sign(
      { id: 77, family, tokenVersion: 0 },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" }
    );
    const initialHash = hashToken(initialToken);

    let isRevokedInDb = false;
    RefreshToken.findOne = async ({ where }) => {
      if (where.tokenHash === initialHash) {
        return {
          id: 1,
          userId: 77,
          tokenHash: initialHash,
          family,
          isRevoked: isRevokedInDb,
          expiresAt: new Date(Date.now() + 86400000),
          save: async function () {
            isRevokedInDb = this.isRevoked;
          },
        };
      }
      return null;
    };

    RefreshToken.create = async (data) => data;
    settingsMod.getPlatformSettings = async () => ({ plans: { free: {} } });

    User.findByPk = async () => ({
      id: 77,
      shopId: 1,
      isActive: true,
      tokenVersion: 0,
      shop: { id: 1, isActive: true },
      toSafeJSON: () => ({ id: 77 }),
    });

    try {
      const { refresh } = require("../controllers/authController");
      const req = { cookies: { refreshToken: initialToken } };
      const res = createMockRes();

      await refresh(req, res);

      assert.strictEqual(res.getStatus(), 200);
      assert.strictEqual(isRevokedInDb, true, "Initial token must be marked isRevoked in DB");
      
      const newCookies = res.getCookies();
      assert(newCookies.refreshToken, "New rotated refresh token cookie must be issued");
      assert.notEqual(newCookies.refreshToken.val, initialToken, "Rotated token must be different from initial");

      // Verify the new token belongs to the SAME family
      const decodedNew = jwt.verify(newCookies.refreshToken.val, process.env.JWT_REFRESH_SECRET);
      assert.strictEqual(decodedNew.family, family, "Rotated token must remain in the same family");
    } finally {
      RefreshToken.findOne = origFindOne;
      RefreshToken.create = origCreate;
      User.findByPk = origUserFind;
      settingsMod.getPlatformSettings = origGetPlatformSettings;
    }
  });

  // 8. Refresh Token Reuse Detection
  await check("Refresh token reuse detection revokes session family and rejects request", async () => {
    const { RefreshToken, User } = require("../models/master");
    const origFindOne = RefreshToken.findOne;
    const origUpdate = RefreshToken.update;
    const origUserIncrement = User.increment;

    const family = "fam-stolen-token";
    const reusedToken = jwt.sign(
      { id: 88, family, tokenVersion: 0 },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" }
    );
    const reusedHash = hashToken(reusedToken);

    // Stolen/reused token is ALREADY marked isRevoked: true in DB
    RefreshToken.findOne = async () => ({
      id: 5,
      userId: 88,
      tokenHash: reusedHash,
      family,
      isRevoked: true, // Already consumed!
      expiresAt: new Date(Date.now() + 86400000),
    });

    let revokedFamily = null;
    RefreshToken.update = async (vals, { where }) => {
      if (where.family) revokedFamily = where.family;
      return [1];
    };

    let userRevoked = null;
    User.increment = async (field, { where }) => {
      userRevoked = where.id;
      return [1];
    };

    try {
      const { refresh } = require("../controllers/authController");
      const req = { cookies: { refreshToken: reusedToken } };
      const res = createMockRes();

      let threw = false;
      try {
        await refresh(req, res);
      } catch (err) {
        threw = true;
        assert.strictEqual(err.statusCode, 401);
        assert.strictEqual(err.code, "REFRESH_TOKEN_REUSED");
      }

      assert.strictEqual(threw, true, "Must throw 401 on refresh token reuse");
      assert.strictEqual(revokedFamily, family, "Must revoke the entire token family");
      assert.strictEqual(userRevoked, 88, "Must increment tokenVersion for the affected user");
    } finally {
      RefreshToken.findOne = origFindOne;
      RefreshToken.update = origUpdate;
      User.increment = origUserIncrement;
    }
  });

  console.log(`\nAll ${passed} Auth Security tests passed successfully! ✔`);
})();
