const { test, expect } = require("@playwright/test");

const platform = {
  platformName: "SuperMart POS",
  tagline: "A test platform",
  allowSignup: false,
  trialDays: 14,
  defaultAccentColor: "#bf9c5a",
};

const tenantUser = {
  id: 2,
  username: "Store Owner",
  email: "owner@example.com",
  role: "owner",
  isSuperAdmin: false,
};

const adminUser = {
  id: 1,
  username: "Platform Admin",
  email: "admin@supermarket.com",
  role: "owner",
  isSuperAdmin: true,
};

const shop = {
  id: 1,
  name: "Example Market",
  plan: "free",
  subscriptionActive: true,
  daysLeft: 30,
};

const dashboard = {
  today: { revenue: 0, bills: 0, profit: 0, avgBill: 0 },
  yesterday: { revenue: 0 },
  month: { revenue: 0, profit: 0, bills: 0, expenses: 0, netProfit: 0 },
  receivable: 0,
  payable: 0,
  totalProducts: 0,
  counts: { lowStock: 0, outOfStock: 0 },
  canSeeProfit: true,
  last7Days: [],
  todayPayments: [],
  topToday: [],
  lowStock: [],
  expiring: [],
  recentBills: [],
};

async function mockApi(page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path.endsWith("/auth/csrf")) {
      await route.fulfill({ json: { success: true, csrfToken: "test-csrf-token" } });
      return;
    }

    if (path.endsWith("/auth/me") || path.endsWith("/auth/refresh")) {
      await route.fulfill({
        status: 401,
        json: { success: false, message: "Not signed in" },
      });
      return;
    }

    if (path.endsWith("/platform/public")) {
      await route.fulfill({ json: { success: true, data: platform } });
      return;
    }

    if (method === "POST" && path.endsWith("/auth/login")) {
      const { email } = request.postDataJSON();
      const user = email === adminUser.email ? adminUser : email === tenantUser.email ? tenantUser : null;
      if (!user) {
        await route.fulfill({
          status: 401,
          json: { success: false, message: "Invalid email or password" },
        });
        return;
      }

      await route.fulfill({
        json: {
          success: true,
          data: { user, shop: user.isSuperAdmin ? null : shop },
        },
      });
      return;
    }

    if (path.endsWith("/settings")) {
      await route.fulfill({
        json: {
          success: true,
          data: {
            settings: {
              businessName: shop.name,
              locale: "en-IN",
              currencySymbol: "₹",
              themeMode: "light",
            },
          },
        },
      });
      return;
    }

    if (path.endsWith("/admin/stats")) {
      await route.fulfill({
        json: {
          success: true,
          data: {
            totalShops: 1,
            totalUsers: 2,
            activeSubscriptions: 1,
            monthlyRevenue: 0,
            plans: {},
            recent: [],
            byPlan: {},
          },
        },
      });
      return;
    }

    if (path.endsWith("/admin/shops")) {
      await route.fulfill({ json: { success: true, data: { shops: [] } } });
      return;
    }

    if (path.endsWith("/reports/dashboard")) {
      await route.fulfill({ json: { success: true, data: dashboard } });
      return;
    }

    await route.fulfill({ json: { success: true, data: {} } });
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("renders the sign-in form", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Hello! Welcome Back" })).toBeVisible();
  await expect(page.getByPlaceholder("you@yourstore.com")).toBeVisible();
  await expect(page.locator('input[autocomplete="current-password"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
});

test("shows an error and stays signed out after invalid credentials", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("you@yourstore.com").fill("invalid@example.com");
  await page.locator('input[autocomplete="current-password"]').fill("wrong-password");
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page.getByText("Invalid email or password")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("tenant owner signs in and reaches the shop dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("you@yourstore.com").fill(tenantUser.email);
  await page.locator('input[autocomplete="current-password"]').fill("tenant-password");
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.locator("nav").getByRole("link", { name: "Billing" })).toBeVisible();
  await expect(page.locator("nav").getByRole("link", { name: "Businesses" })).toHaveCount(0);
});

test("platform admin signs in and reaches the admin dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("you@yourstore.com").fill(adminUser.email);
  await page.locator('input[autocomplete="current-password"]').fill("admin-password");
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Total Businesses")).toBeVisible();
  await expect(page.locator("nav").getByRole("link", { name: "Businesses" })).toBeVisible();
  await expect(page.locator("nav").getByRole("link", { name: "Billing" })).toHaveCount(0);
});
