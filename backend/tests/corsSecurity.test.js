// tests/corsSecurity.test.js — Automated test suite for CORS origin whitelisting & credentials security
const assert = require("assert");
const { buildCorsOptions, isLocalhost } = require("../utils/corsConfig");

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

const runValidator = (corsOptions, origin) =>
  new Promise((resolve) => {
    corsOptions.origin(origin, (err, allowed) => {
      resolve({ err, allowed });
    });
  });

(async () => {
  console.log("\n── CORS Security Hardening Tests ──\n");

  await check("isLocalhost correctly identifies local origins", () => {
    assert.strictEqual(isLocalhost("http://localhost:5173"), true);
    assert.strictEqual(isLocalhost("https://localhost:3000"), true);
    assert.strictEqual(isLocalhost("http://127.0.0.1:8080"), true);
    assert.strictEqual(isLocalhost("https://supermart.com"), false);
    assert.strictEqual(isLocalhost("not-a-valid-url"), false);
  });

  await check("Production: disallows arbitrary origin when CORS_ORIGIN is wildcard '*'", async () => {
    const opts = buildCorsOptions({ NODE_ENV: "production", CORS_ORIGIN: "*" });
    assert.strictEqual(opts.credentials, true);
    const res = await runValidator(opts, "https://evil-attacker.com");
    assert.strictEqual(res.allowed, false, "Wildcard '*' must never allow cross-origin requests in production");
  });

  await check("Production: disallows arbitrary origin when CORS_ORIGIN is empty", async () => {
    const opts = buildCorsOptions({ NODE_ENV: "production", CORS_ORIGIN: "" });
    const res = await runValidator(opts, "https://evil-attacker.com");
    assert.strictEqual(res.allowed, false, "Empty CORS_ORIGIN must reject cross-origin requests in production");
  });

  await check("Production: allows whitelisted origins and rejects non-whitelisted", async () => {
    const opts = buildCorsOptions({
      NODE_ENV: "production",
      CORS_ORIGIN: "https://supermart.example.com, https://admin.supermart.example.com",
    });

    const res1 = await runValidator(opts, "https://supermart.example.com");
    assert.strictEqual(res1.allowed, true, "Explicitly whitelisted origin 1 must be allowed");

    const res2 = await runValidator(opts, "https://admin.supermart.example.com");
    assert.strictEqual(res2.allowed, true, "Explicitly whitelisted origin 2 must be allowed");

    const res3 = await runValidator(opts, "https://attacker.com");
    assert.strictEqual(res3.allowed, false, "Non-whitelisted origin must be blocked");
  });

  await check("Production & Dev: allows server-to-server / curl requests with no origin header", async () => {
    const optsProd = buildCorsOptions({ NODE_ENV: "production", CORS_ORIGIN: "https://supermart.example.com" });
    const resProd = await runValidator(optsProd, undefined);
    assert.strictEqual(resProd.allowed, true, "No-origin requests must be allowed in production");

    const optsDev = buildCorsOptions({ NODE_ENV: "development", CORS_ORIGIN: "*" });
    const resDev = await runValidator(optsDev, null);
    assert.strictEqual(resDev.allowed, true, "No-origin requests must be allowed in development");
  });

  await check("Development: allows localhost on any port even if CORS_ORIGIN is empty", async () => {
    const opts = buildCorsOptions({ NODE_ENV: "development", CORS_ORIGIN: "" });
    const res1 = await runValidator(opts, "http://localhost:5173");
    assert.strictEqual(res1.allowed, true);

    const res2 = await runValidator(opts, "http://127.0.0.1:3000");
    assert.strictEqual(res2.allowed, true);
  });

  console.log(`\nAll ${passed} CORS security checks passed.\n`);
})();
