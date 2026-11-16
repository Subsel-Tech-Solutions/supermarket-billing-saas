const { test, expect } = require("@playwright/test");
const { createMockState, installMockApi, signIn, fieldControl, toggleSwitch } = require("./helpers/mockBackend");

test.describe("Platform Admin Full Flows", () => {
  test("admin dashboard KPIs, expiring alerts, route guard, and quick actions", async ({ page }) => {
    const state = createMockState();
    await installMockApi(page, state);
    await signIn(page, "admin@supermarket.com", "admin-password");

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText("Total Businesses")).toBeVisible();
    await expect(page.getByText("Active Subscriptions")).toBeVisible();
    await expect(page.getByText("Monthly Revenue")).toBeVisible();
    await expect(page.getByText("Recent Businesses")).toBeVisible();
    await expect(page.getByText("Subscription Plans")).toBeVisible();

    // Expiring within 7 days alert banner -> Review navigates to /admin/subscriptions
    await expect(page.getByText(/City Kirana/).first()).toBeVisible();
    await page.getByRole("button", { name: "Review" }).click();
    await expect(page).toHaveURL(/\/admin\/subscriptions$/);

    // Super admin cannot open tenant routes directly without impersonating
    await page.goto("/billing");
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/stock");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("create business, edit/extend/reset-password/verify-db, impersonate shop, return to admin, and delete business", async ({ page }) => {
    const state = createMockState();
    await installMockApi(page, state);
    await signIn(page, "admin@supermarket.com", "admin-password");

    await page.locator("nav").getByRole("link", { name: "Businesses" }).click();
    await expect(page).toHaveURL(/\/admin\/businesses$/);

    // Create a new business
    await page.getByRole("button", { name: "New business" }).click();
    const createDialog = page.getByRole("dialog", { name: "New business" });
    await expect(createDialog).toBeVisible();

    await createDialog.getByPlaceholder("e.g. Krish Mart").fill("Lotus Supermart");
    await fieldControl(createDialog, "Owner name").fill("Arjun Rao");
    await fieldControl(createDialog, "Phone").fill("9876512345");
    await fieldControl(createDialog, "Owner email (login)").fill("arjun@lotus.com");
    await fieldControl(createDialog, "Password").fill("lotus123");
    await fieldControl(createDialog, "Plan").selectOption("pro");
    await createDialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByText(/Created — database/)).toBeVisible();

    // Search for the newly created business
    await page.getByPlaceholder("Search business, email, phone…").fill("Lotus");
    await expect(page.getByText("Lotus Supermart").first()).toBeVisible();

    // Open ShopModal
    await page.getByText("Lotus Supermart").first().click();
    const shopDialog = page.getByRole("dialog", { name: "Lotus Supermart" });
    await expect(shopDialog).toBeVisible();
    await expect(shopDialog.getByText("arjun@lotus.com")).toBeVisible();

    // Edit plan + notes and save
    await fieldControl(shopDialog, "Plan").selectOption("starter");
    await fieldControl(shopDialog, "Admin notes").fill("VIP priority onboarding");
    await shopDialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Business updated")).toBeVisible();

    // Quick extend, password reset, and verify DB inside ShopModal
    await shopDialog.getByRole("button", { name: "+30 days" }).click();
    await expect(page.getByText("Extended by 30 days")).toBeVisible();

    await shopDialog.getByPlaceholder("New owner password").fill("lotus999");
    await shopDialog.getByRole("button", { name: "Reset owner password" }).click();
    await expect(page.getByText("Owner password reset")).toBeVisible();

    await shopDialog.getByRole("button", { name: "Verify database" }).click();
    await expect(page.getByText(/Database verified/)).toBeVisible();

    // Close modal, clear search, and impersonate FreshMart Superstore
    await shopDialog.getByRole("button", { name: "Close" }).click();
    await page.getByPlaceholder("Search business, email, phone…").fill("");
    await page.getByText("FreshMart Superstore").first().click();
    const freshDialog = page.getByRole("dialog", { name: "FreshMart Superstore" });
    await freshDialog.getByRole("button", { name: "Open this shop" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Viewing FreshMart Superstore")).toBeVisible();
    await page.locator("nav").getByRole("link", { name: "Billing" }).click();
    await expect(page).toHaveURL(/\/billing$/);

    // Return to admin
    await page.getByRole("button", { name: "Back to admin" }).click();
    await expect(page).toHaveURL(/\/admin$/);

    // Delete Lotus Supermart with confirmation guard
    await page.locator("nav").getByRole("link", { name: "Businesses" }).click();
    await page.getByText("Lotus Supermart").first().click();
    const delDialog = page.getByRole("dialog", { name: "Lotus Supermart" });
    const deleteBtn = delDialog.getByRole("button", { name: "Delete", exact: true });
    await expect(deleteBtn).toBeDisabled();
    await delDialog.getByPlaceholder("Lotus Supermart").fill("Lotus Supermart");
    await expect(deleteBtn).toBeEnabled();
    await deleteBtn.click();
    await expect(page.getByText("Lotus Supermart deleted")).toBeVisible();
    await expect(page.getByRole("cell", { name: /Lotus Supermart/ })).toHaveCount(0);
  });

  test("subscriptions filters, users role filtering, reports, branding, platform settings & admin account", async ({ page }) => {
    const state = createMockState();
    await installMockApi(page, state);
    await signIn(page, "admin@supermarket.com", "admin-password");

    // Subscriptions tabs & switch business off
    await page.locator("nav").getByRole("link", { name: "Subscriptions" }).click();
    await expect(page).toHaveURL(/\/admin\/subscriptions$/);
    await expect(page.getByText("City Kirana").first()).toBeVisible();

    await page.getByRole("button", { name: /^Expired/ }).click();
    await expect(page.getByText("Old Bazaar").first()).toBeVisible();

    await page.getByRole("button", { name: /^Active/ }).click();
    await expect(page.getByText("FreshMart Superstore").first()).toBeVisible();

    // Open Old Bazaar via All tab & switch it off via Toggle
    await page.getByRole("button", { name: /^All/ }).click();
    await page.getByText("Old Bazaar").first().click();
    const oldDialog = page.getByRole("dialog", { name: "Old Bazaar" });
    await toggleSwitch(oldDialog, "Business is active").click();
    await oldDialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Business updated")).toBeVisible();
    await oldDialog.getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: /^Switched off/ }).click();
    await expect(page.getByText("Old Bazaar").first()).toBeVisible();

    // Users list, search & role filter chips
    await page.locator("nav").getByRole("link", { name: "Users" }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByText("owner@freshmart.com")).toBeVisible();
    await expect(page.getByText("cashier@freshmart.com")).toBeVisible();

    await page.getByRole("button", { name: "Cashiers" }).click();
    await expect(page.getByText("cashier@freshmart.com")).toBeVisible();
    await expect(page.getByText("owner@freshmart.com")).toHaveCount(0);

    await page.getByRole("button", { name: "All roles" }).click();
    await page.getByPlaceholder("Search name, email, phone or business…").fill("Manager");
    await expect(page.getByText("manager@freshmart.com")).toBeVisible();

    // Platform Reports
    await page.locator("nav").getByRole("link", { name: "Reports" }).click();
    await expect(page).toHaveURL(/\/admin\/reports$/);
    await expect(page.getByText("Monthly recurring revenue")).toBeVisible();
    await expect(page.getByText("Revenue by plan")).toBeVisible();

    // Themes & Branding
    await page.locator("nav").getByRole("link", { name: "Themes & Branding" }).click();
    await expect(page).toHaveURL(/\/admin\/branding$/);
    await fieldControl(page, "Platform name").fill("MegaMart Cloud");
    await fieldControl(page, "Tagline").fill("Enterprise Retail OS");
    await page.getByRole("button", { name: "Save platform settings" }).click();
    await expect(page.getByText("Platform settings saved")).toBeVisible();

    // Platform Settings (enable public signups, edit trial days)
    await page.locator("nav").getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/admin\/settings$/);
    await toggleSwitch(page, "Allow public signups").click();
    await fieldControl(page, "Free trial days").fill("30");
    await page.getByRole("button", { name: "Save platform settings" }).click();
    await expect(page.getByText("Platform settings saved").first()).toBeVisible();

    // Admin My Account
    await page.locator("nav").getByRole("link", { name: "My Account" }).click();
    await expect(page).toHaveURL(/\/admin\/account$/);
    await fieldControl(page, "Name").fill("Chief Admin");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile updated")).toBeVisible();

    // Verify branding + public signup toggle are reflected on /login after sign out
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("MegaMart Cloud").first()).toBeVisible();
    await expect(page.getByText("Enterprise Retail OS")).toBeVisible();
    await expect(page.getByRole("link", { name: /Start your 30-day free trial/i })).toBeVisible();
  });
});
