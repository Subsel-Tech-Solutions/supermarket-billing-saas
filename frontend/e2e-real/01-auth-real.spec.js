// e2e-real/01-auth-real.spec.js — Authentication, HTTP-only cookie sessions & RBAC
const { test, expect } = require("@playwright/test");
const { realSignIn } = require("./helpers/realHelpers");

test.describe("01. Authentication & Session Management (Real Backend)", () => {
  test("invalid login is rejected with HTTP 401 by Express backend", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByPlaceholder("you@yourstore.com")).toBeVisible();

    await page.getByPlaceholder("you@yourstore.com").fill("owner@freshmart.com");
    await page.locator('input[autocomplete="current-password"]').fill("wrongpassword123");

    const [loginResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/auth/login")),
      page.getByRole("button", { name: "Sign In" }).click(),
    ]);

    expect(loginResponse.status()).toBe(401);
    await expect(page.getByText(/Invalid email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("valid owner login receives HTTP-only cookies, stores session and loads till", async ({ page, context }) => {
    await page.goto("/login");

    await page.getByPlaceholder("you@yourstore.com").fill("owner@freshmart.com");
    await page.locator('input[autocomplete="current-password"]').fill("admin123");

    const [loginResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/auth/login")),
      page.getByRole("button", { name: "Sign In" }).click(),
    ]);

    expect(loginResponse.status()).toBe(200);

    // Verify real cookies set by the backend in the browser context
    const cookies = await context.cookies();
    const tokenNames = cookies.map((c) => c.name);
    expect(tokenNames).toContain("accessToken");
    expect(tokenNames).toContain("XSRF-TOKEN");

    // Verify redirect away from login into dashboard / billing
    await expect(page).toHaveURL(/\/(dashboard|billing)/);
    await expect(page.locator("nav").getByRole("link", { name: "Billing" })).toBeVisible();

    // Verify session persistence across page reload via /api/auth/me
    await page.reload();
    await expect(page).toHaveURL(/\/(dashboard|billing)/);
    await expect(page.locator("nav").getByRole("link", { name: "Billing" })).toBeVisible();
  });

  test("platform super-admin login navigates to platform admin panel", async ({ page }) => {
    await page.goto("/login");

    await page.getByPlaceholder("you@yourstore.com").fill("admin@supermarket.com");
    await page.locator('input[autocomplete="current-password"]').fill("admin123");

    const [loginResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/auth/login")),
      page.getByRole("button", { name: "Sign In" }).click(),
    ]);

    expect(loginResponse.status()).toBe(200);
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByText(/Platform Admin|Businesses|Platform/i).first()).toBeVisible();
  });
});
