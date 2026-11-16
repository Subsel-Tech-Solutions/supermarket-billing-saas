// e2e-real/helpers/realHelpers.js — Real browser automation helpers & direct DB verification
const { expect } = require("@playwright/test");
const mysql = require("../../../backend/node_modules/mysql2/promise");
const path = require("path");

function getDbConfig(dbName = "sm_test_shop_1") {
  return {
    host: "localhost",
    port: 3306,
    user: "supermart_e2e",
    password: "E2eSecurePass_2026!",
    database: dbName,
  };
}

async function queryTenantDb(sql, params = []) {
  const conn = await mysql.createConnection(getDbConfig("sm_test_shop_1"));
  try {
    const [rows] = await conn.query(sql, params);
    return rows;
  } finally {
    await conn.end();
  }
}

async function queryMasterDb(sql, params = []) {
  const conn = await mysql.createConnection(getDbConfig("supermart_test_master"));
  try {
    const [rows] = await conn.query(sql, params);
    return rows;
  } finally {
    await conn.end();
  }
}

async function realSignIn(page, email, password) {
  await page.goto("/login");
  await expect(page.getByPlaceholder("you@yourstore.com")).toBeVisible({ timeout: 15000 });
  await page.getByPlaceholder("you@yourstore.com").fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);

  const loginResponsePromise = page.waitForResponse(
    (res) => res.url().includes("/api/auth/login") && res.request().method() === "POST",
  );

  await page.getByRole("button", { name: "Sign In" }).click();

  const loginRes = await loginResponsePromise;
  expect(loginRes.status()).toBe(200);

  // Wait for redirect out of /login
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 15000 });
}

async function realSignOut(page) {
  // If user dropdown / logout button is present
  const logoutBtn = page.getByRole("button", { name: /sign out|log out/i });
  if (await logoutBtn.isVisible()) {
    await logoutBtn.click();
  } else {
    // Navigate or trigger via user menu
    const userMenu = page.locator("aside, header").getByRole("button").filter({ hasText: /Owner|Admin|Cashier|Manager/i }).first();
    if (await userMenu.isVisible()) {
      await userMenu.click();
      await page.getByRole("button", { name: /sign out|log out/i }).click();
    } else {
      await page.goto("/login");
    }
  }
  await expect(page).toHaveURL(/\/login$/, { timeout: 10000 });
}

function fieldControl(root, labelText) {
  return root
    .locator(`xpath=.//label[starts-with(normalize-space(.), "${labelText}")]/..//*[self::input or self::select or self::textarea]`)
    .first();
}

function toggleSwitch(root, labelText) {
  return root.locator("label", { hasText: labelText }).getByRole("switch");
}

module.exports = {
  realSignIn,
  realSignOut,
  fieldControl,
  toggleSwitch,
  queryTenantDb,
  queryMasterDb,
};
