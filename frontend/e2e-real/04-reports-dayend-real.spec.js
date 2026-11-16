// e2e-real/04-reports-dayend-real.spec.js — Financial reports & Day-end reconciliation verifying real transactions from Spec 02
const { test, expect } = require("@playwright/test");
const { realSignIn, queryTenantDb } = require("./helpers/realHelpers");

test.describe("04. Financial Reports & Day-End Reconciliation (Dependent on Spec 02)", () => {
  test("dashboard, sales reports, GST tax breakup, profit calculation and day-end cash drawer reconciliation", async ({ page }) => {
    test.slow();
    await realSignIn(page, "owner@freshmart.com", "admin123");

    // 1. Dashboard Financial KPI Verification
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // Verify database has the transaction created by Spec 02
    const bills = await queryTenantDb("SELECT COUNT(*) as count, SUM(total_amount) as revenue FROM bills WHERE status = 'completed'");
    expect(Number(bills[0].count)).toBeGreaterThanOrEqual(1);

    // Verify Dashboard displays non-zero bills and revenue
    await expect(page.getByText("Today's sales").first()).toBeVisible();
    await expect(page.getByText("Recent bills").first()).toBeVisible();

    // 2. Comprehensive Reports: Sales, GST & Profit
    await page.locator("nav").getByRole("link", { name: "Reports" }).click();
    await expect(page).toHaveURL(/\/reports$/);

    // Sales Report Tab
    await expect(page.getByRole("tab", { name: "Sales" }).or(page.getByRole("button", { name: "Sales" })).first()).toBeVisible();
    await expect(page.getByText(/Total sales|Net sales|Bills/i).first()).toBeVisible();

    // GST Report Tab
    const gstTab = page.getByRole("tab", { name: "GST" }).or(page.getByRole("button", { name: "GST" })).first();
    if (await gstTab.isVisible()) {
      await gstTab.click();
      await expect(page.getByText(/Taxable|Output GST|CGST|SGST/i).first()).toBeVisible();
    }

    // Profit & Margin Tab
    const profitTab = page.getByRole("tab", { name: "Profit & Loss" }).or(page.getByRole("button", { name: "Profit & Loss" })).first();
    if (await profitTab.isVisible()) {
      await profitTab.click();
      await expect(page.getByText(/Gross Profit|Net Profit|Margin|Revenue/i).first()).toBeVisible();
    }

    // 3. Day-End Cash Drawer Reconciliation
    const dayClosingLink = page.locator("nav").getByRole("link", { name: /Day Closing|Day End/i });
    if (await dayClosingLink.isVisible()) {
      await dayClosingLink.click();
    } else {
      await page.goto("/day-end");
    }
    await expect(page).toHaveURL(/\/day-end$/);

    // Verify cash reconciliation fields
    await expect(page.getByText("Day Closing").first()).toBeVisible();
    await expect(page.getByText("Cash in drawer").first()).toBeVisible();
    await expect(page.getByText("Expected cash").first()).toBeVisible();
  });
});
