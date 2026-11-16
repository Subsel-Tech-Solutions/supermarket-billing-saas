const assert = require("assert");
const { sequelize } = require("../config/database");
const { rateLimit } = require("../middleware/security");

const buckets = new Map();
const originalQuery = sequelize.query;
const originalTransaction = sequelize.transaction;

sequelize.query = async (sql, options = {}) => {
  const { key, now, newResetAt } = options.replacements || {};
  if (sql.includes("INSERT INTO rate_limit_buckets")) {
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) buckets.set(key, { hits: 1, resetAt: newResetAt });
    else bucket.hits += 1;
    return [[], {}];
  }
  if (sql.includes("SELECT hits, reset_at")) {
    const bucket = buckets.get(key);
    return [[bucket ? { hits: bucket.hits, resetAt: bucket.resetAt } : undefined].filter(Boolean), {}];
  }
  throw new Error(`Unexpected SQL in rate-limit test: ${sql}`);
};
sequelize.transaction = async (callback) => callback({});

const callLimiter = (limiter) =>
  new Promise((resolve, reject) => {
    const headers = {};
    const res = {
      setHeader: (name, value) => {
        headers[name] = value;
      },
      status(statusCode) {
        this.statusCode = statusCode;
        return this;
      },
      json(body) {
        this.body = body;
        resolve({ headers, statusCode: this.statusCode, body });
      },
    };
    const req = { baseUrl: "/api/auth", path: "/login", ip: "192.0.2.1", body: { email: "cashier@example.com" } };
    limiter(req, res, (err) => {
      if (err) reject(err);
      else resolve({ headers, statusCode: res.statusCode || 200 });
    });
  });

(async () => {
  try {
    const instanceA = rateLimit({
      windowMs: 60000,
      max: 2,
      keyFn: (req) => `${req.ip}|${req.body.email}`,
    });
    const instanceB = rateLimit({
      windowMs: 60000,
      max: 2,
      keyFn: (req) => `${req.ip}|${req.body.email}`,
    });

    const first = await callLimiter(instanceA);
    const second = await callLimiter(instanceB);
    const blocked = await callLimiter(instanceA);

    assert.strictEqual(first.statusCode, 200);
    assert.strictEqual(first.headers["X-RateLimit-Remaining"], 1);
    assert.strictEqual(second.statusCode, 200, "separate middleware instances should share the same bucket");
    assert.strictEqual(second.headers["X-RateLimit-Remaining"], 0);
    assert.strictEqual(blocked.statusCode, 429);
    assert.strictEqual(blocked.body.code, "RATE_LIMITED");
    assert(Number(blocked.headers["Retry-After"]) > 0);

    const otherIdentity = rateLimit({ windowMs: 60000, max: 1, keyFn: () => "another-identity" });
    assert.strictEqual((await callLimiter(otherIdentity)).statusCode, 200);
    console.log("Shared rate-limit counter tests passed.");
  } finally {
    sequelize.query = originalQuery;
    sequelize.transaction = originalTransaction;
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
