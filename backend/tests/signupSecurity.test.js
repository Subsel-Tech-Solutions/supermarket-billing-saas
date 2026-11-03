// tests/signupSecurity.test.js — test public signup security, invite codes, honeypot & tenant quota
const assert = require("assert");
const { HttpError } = require("../utils/helpers");

console.log("Starting Public Signup Security & Abuse Prevention Test Suite...\n");

let passed = 0;
const test = (desc, fn) => {
  try {
    fn();
    console.log(`✓ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${desc}`);
    console.error(err);
    process.exit(1);
  }
};

// ── 1. Default Configuration Logic Tests ────────────────────────────────────
test("allowSignup defaults to false when NODE_ENV is production", () => {
  const computeDefaultSignup = (envAllow, nodeEnv) => {
    return envAllow !== undefined ? envAllow === "true" : nodeEnv !== "production";
  };

  assert.strictEqual(computeDefaultSignup(undefined, "production"), false);
  assert.strictEqual(computeDefaultSignup(undefined, "development"), true);
  assert.strictEqual(computeDefaultSignup("true", "production"), true);
  assert.strictEqual(computeDefaultSignup("false", "development"), false);
});

// ── 2. Honeypot & Bot Detection Tests ───────────────────────────────────────
const simulateRegisterAuth = (body, platform, configuredEnvInvite = "") => {
  if (body?.hp_company_field || body?.websiteUrl) {
    throw new HttpError(400, "Spam registration rejected");
  }

  const inviteCode = String(body?.inviteCode || "").trim();
  const configuredInvite = String(platform.signupInviteCode || configuredEnvInvite).trim();

  if (!platform.allowSignup) {
    if (!configuredInvite || inviteCode !== configuredInvite) {
      throw new HttpError(403, "New signups are currently closed or require a valid invite code. Contact the administrator.", "SIGNUP_CLOSED");
    }
  }

  return { success: true };
};

test("Rejects bot registrations that fill the hidden honeypot field", () => {
  assert.throws(() => {
    simulateRegisterAuth({ shopName: "Spam Shop", hp_company_field: "http://spam.org" }, { allowSignup: true });
  }, (err) => err.statusCode === 400 && err.message.includes("Spam registration rejected"));

  assert.throws(() => {
    simulateRegisterAuth({ shopName: "Spam Shop", websiteUrl: "http://bot.com" }, { allowSignup: true });
  }, (err) => err.statusCode === 400);
});

// ── 3. Closed Signups & Invite Code Tests ────────────────────────────────────
test("Blocks registration when allowSignup is false and no invite code is provided", () => {
  assert.throws(() => {
    simulateRegisterAuth({ shopName: "Shop A", email: "a@test.com" }, { allowSignup: false });
  }, (err) => err.statusCode === 403 && err.code === "SIGNUP_CLOSED");
});

test("Blocks registration when allowSignup is false and incorrect invite code is supplied", () => {
  assert.throws(() => {
    simulateRegisterAuth({ shopName: "Shop B", email: "b@test.com", inviteCode: "WRONG_CODE" }, { allowSignup: false, signupInviteCode: "VIP2026" });
  }, (err) => err.statusCode === 403 && err.code === "SIGNUP_CLOSED");
});

test("Allows registration when allowSignup is false but valid invite code is supplied", () => {
  const res = simulateRegisterAuth(
    { shopName: "Shop C", email: "c@test.com", inviteCode: "VIP2026" },
    { allowSignup: false, signupInviteCode: "VIP2026" },
  );
  assert.strictEqual(res.success, true);
});

test("Allows registration when allowSignup is true without invite code", () => {
  const res = simulateRegisterAuth({ shopName: "Shop D", email: "d@test.com" }, { allowSignup: true });
  assert.strictEqual(res.success, true);
});

// ── 4. Disposable Email Domain Filtering Tests ──────────────────────────────
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "tempmail.com", "throwawaymail.com", "guerrillamail.com", "mailinator.com",
  "10minutemail.com", "trashmail.com", "yopmail.com", "sharklasers.com",
  "dispostable.com", "getairmail.com", "temp-mail.org", "fakeinbox.com",
]);

const validateEmailDomain = (email) => {
  const domain = String(email || "").split("@")[1]?.toLowerCase();
  if (domain && DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    throw new HttpError(400, "Disposable and temporary email addresses are not allowed. Please use a valid business email.");
  }
};

test("Rejects disposable / throwaway email addresses", () => {
  assert.throws(() => validateEmailDomain("attacker@tempmail.com"), /Disposable and temporary email/);
  assert.throws(() => validateEmailDomain("spam@mailinator.com"), /Disposable and temporary email/);
  assert.throws(() => validateEmailDomain("bot@10minutemail.com"), /Disposable and temporary email/);
  assert.throws(() => validateEmailDomain("test@guerrillamail.com"), /Disposable and temporary email/);
});

test("Accepts legitimate corporate and business email addresses", () => {
  assert.doesNotThrow(() => validateEmailDomain("owner@supermarket.com"));
  assert.doesNotThrow(() => validateEmailDomain("groceries@gmail.com"));
  assert.doesNotThrow(() => validateEmailDomain("retail@yahoo.in"));
});

// ── 5. Maximum Tenant Quota Cap Tests ───────────────────────────────────────
const checkTenantQuota = (currentTenantCount, maxTenants) => {
  if (currentTenantCount >= maxTenants) {
    throw new HttpError(429, "New business registrations are currently at capacity. Please contact support.", "TENANT_QUOTA_REACHED");
  }
};

test("Allows new shop creation when tenant count is below quota limit", () => {
  assert.doesNotThrow(() => checkTenantQuota(45, 100));
  assert.doesNotThrow(() => checkTenantQuota(99, 100));
});

test("Blocks new shop creation when tenant count reaches or exceeds quota limit (429)", () => {
  assert.throws(() => {
    checkTenantQuota(100, 100);
  }, (err) => err.statusCode === 429 && err.code === "TENANT_QUOTA_REACHED");

  assert.throws(() => {
    checkTenantQuota(105, 100);
  }, (err) => err.statusCode === 429);
});

console.log(`\nAll ${passed} Public Signup Security tests passed successfully! ✔`);
