const { test, expect } = require("@playwright/test");
const { createMockState, installMockApi, signIn } = require("./helpers/mockBackend");

const VIEWPORTS = [
  { width: 320, height: 760 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 900, height: 768 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

const OWNER_PAGES = [
  ["/dashboard", "Dashboard"],
  ["/billing", "Billing"],
  ["/transactions", "Sales History"],
  ["/customers", "Customers"],
  ["/customers/1", "Customer details"],
  ["/day-end", "Day Closing"],
  ["/stock", "Stock"],
  ["/barcode", "Barcodes"],
  ["/purchases", "Purchases"],
  ["/suppliers", "Suppliers"],
  ["/reports", "Reports"],
  ["/expenses", "Expenses"],
  ["/staff", "Staff"],
  ["/settings", "Settings"],
];

const ADMIN_PAGES = [
  ["/admin", "Dashboard"],
  ["/admin/businesses", "Businesses"],
  ["/admin/subscriptions", "Subscriptions"],
  ["/admin/users", "Users"],
  ["/admin/branding", "Themes & Branding"],
  ["/admin/reports", "Reports"],
  ["/admin/settings", "Settings"],
  ["/admin/account", "My Account"],
];

async function checkViewport(page, path, width, height) {
  await page.setViewportSize({ width, height });
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    mobileNav: document.querySelector(".mobile-nav-bar")
      ? getComputedStyle(document.querySelector(".mobile-nav-bar")).display
      : null,
  }));
  expect(dimensions.document, `${path} document overflow at ${width}px: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(width);
  expect(dimensions.body, `${path} body overflow at ${width}px: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(width);
  if (dimensions.mobileNav !== null) {
    expect(dimensions.mobileNav).toBe(width <= 860 ? "flex" : "none");
  }
}

async function checkPages(page, routes) {
  for (const [path, label] of routes) {
    await page.goto(path);
    await expect(page.locator('.breadcrumbs [aria-current="page"]')).toHaveText(label);
    for (const { width, height } of VIEWPORTS) {
      await checkViewport(page, path, width, height);
    }
  }
}

test("owner and authentication pages fit mobile, tablet, and desktop viewports", async ({ page }) => {
  test.setTimeout(180_000);
  await installMockApi(page, createMockState());
  await signIn(page, "owner@freshmart.com", "owner-password");
  await expect(page).toHaveURL(/\/dashboard$/);

  await checkPages(page, OWNER_PAGES);
  for (const path of ["/login", "/forgot-password", "/reset-password", "/signup"]) {
    await page.goto(path);
    for (const { width, height } of VIEWPORTS) {
      await checkViewport(page, path, width, height);
    }
  }
});

test("platform admin pages fit mobile, tablet, and desktop viewports", async ({ page }) => {
  test.setTimeout(120_000);
  await installMockApi(page, createMockState());
  await signIn(page, "admin@supermarket.com", "admin-password");
  await expect(page).toHaveURL(/\/admin$/);
  await checkPages(page, ADMIN_PAGES);
});

test("mobile checkout controls fit a narrow viewport", async ({ page }) => {
  await installMockApi(page, createMockState());
  await signIn(page, "owner@freshmart.com", "owner-password");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/billing");

  const search = page.getByPlaceholder("Search product name / scan or type barcode, then Enter…");
  await search.fill("8901001001001");
  await search.press("Enter");
  await expect(page.locator(".billing-cart").getByText("Basmati Rice")).toBeVisible();
  await page.getByRole("button", { name: "Pay" }).click();

  const checkout = page.getByRole("dialog", { name: "Complete sale" });
  await expect(checkout).toBeVisible();
  await expect(checkout.locator(".checkout-actions")).toHaveCSS("flex-direction", "column");
  const paymentColumns = await checkout.locator(".checkout-payment-grid").evaluate((grid) =>
    getComputedStyle(grid).gridTemplateColumns.split(" ").length,
  );
  expect(paymentColumns).toBeGreaterThan(1);
  await checkViewport(page, "/billing checkout", 320, 760);
});
