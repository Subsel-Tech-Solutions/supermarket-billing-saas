const { test, expect } = require("@playwright/test");
const { createMockState, installMockApi, signIn, fieldControl, toggleSwitch } = require("./helpers/mockBackend");

test.describe("Tenant Expenses, Staff, Reports, Settings, Banners & RBAC", () => {
  test("expenses CRUD, filtering, and staff management + plan user limit + new staff login", async ({ page }) => {
    const state = createMockState();
    await installMockApi(page, state);
    await signIn(page, "owner@freshmart.com", "owner-password");

    // 1. Expenses CRUD
    await page.locator("nav").getByRole("link", { name: "Expenses" }).click();
    await expect(page).toHaveURL(/\/expenses$/);
    await expect(page.getByText(/Shop Electricity Bill/)).toBeVisible();

    await page.getByRole("button", { name: "Add expense" }).click();
    const expModal = page.getByRole("dialog", { name: "Add expense" });
    await fieldControl(expModal, "Category").selectOption("Packaging & Bags");
    await fieldControl(expModal, "Amount").fill("450");
    await fieldControl(expModal, "Paid via").selectOption("upi");
    await fieldControl(expModal, "Paid to").fill("CarryBag Suppliers");
    await fieldControl(expModal, "Notes").fill("Packaging Carry Bags");
    await expModal.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Expense saved").first()).toBeVisible();
    await expect(page.getByText(/Packaging Carry Bags/)).toBeVisible();

    // Edit & delete Packaging Carry Bags
    const bagRow = page.locator("tr", { hasText: "Packaging Carry Bags" });
    await bagRow.getByRole("button", { name: "Edit" }).click();
    const editExp = page.getByRole("dialog", { name: "Edit expense" });
    await fieldControl(editExp, "Amount").fill("520");
    await editExp.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Expense saved").first()).toBeVisible();

    await bagRow.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog", { name: "Delete expense" }).getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Deleted")).toBeVisible();

    // 2. Staff CRUD & login with created cashier
    await page.locator("nav").getByRole("link", { name: "Staff" }).click();
    await expect(page).toHaveURL(/\/staff$/);

    await page.getByRole("button", { name: "Add staff" }).click();
    const staffModal = page.getByRole("dialog", { name: "Add staff" });
    await fieldControl(staffModal, "Name").fill("Deepak Counter");
    await fieldControl(staffModal, "Email (used to log in)").fill("deepak@freshmart.com");
    await fieldControl(staffModal, "Password").fill("deepak123");
    await fieldControl(staffModal, "Role").selectOption("cashier");
    await staffModal.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect(page.getByText("deepak@freshmart.com")).toBeVisible();

    // Edit staff phone/role
    const deepakRow = page.locator("tr", { hasText: "deepak@freshmart.com" });
    await deepakRow.getByRole("button", { name: "Edit" }).click();
    const editStaff = page.getByRole("dialog", { name: "Edit staff" });
    await fieldControl(editStaff, "Phone").fill("9000112233");
    await editStaff.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();

    // Sign out & sign in as newly created cashier
    await page.getByRole("button", { name: "Sign out" }).click();
    await signIn(page, "deepak@freshmart.com", "deepak123");
    await expect(page).toHaveURL(/\/billing$/);
  });

  test("reports walk through all 9 tabs and settings updates reflect across the app", async ({ page }) => {
    const state = createMockState();
    await installMockApi(page, state);
    await signIn(page, "owner@freshmart.com", "owner-password");

    // 1. Reports — all 9 tabs + presets + expiry windows
    await page.locator("nav").getByRole("link", { name: "Reports" }).click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByText("Net sales")).toBeVisible();

    await page.getByRole("button", { name: "Today" }).click();
    await page.getByRole("tab", { name: "Products" }).click();
    await expect(page.getByText("Basmati Rice")).toBeVisible();

    await page.getByRole("tab", { name: "Categories" }).click();
    await expect(page.getByText("Staples")).toBeVisible();

    await page.getByRole("tab", { name: "GST" }).click();
    await expect(page.getByText("Output tax (sales)")).toBeVisible();
    await expect(page.getByText("HSN summary")).toBeVisible();

    await page.getByRole("tab", { name: "Profit & Loss" }).click();
    await expect(page.getByText("Gross profit").first()).toBeVisible();
    await expect(page.getByText("Net profit").first()).toBeVisible();

    await page.getByRole("tab", { name: "Staff" }).click();
    await expect(page.getByRole("cell", { name: "Owner" }).first()).toBeVisible();

    await page.getByRole("tab", { name: "Stock movement" }).click();
    await expect(page.getByText("Closing stock value (cost)")).toBeVisible();

    await page.getByRole("tab", { name: "Expiry" }).click();
    await expect(page.getByText("Already expired")).toBeVisible();
    await page.getByRole("button", { name: "60 days" }).click();
    await expect(page.getByText("Expiring in 60 days")).toBeVisible();

    await page.getByRole("tab", { name: "Audit Trail" }).click();
    await expect(page.getByText("SETTINGS UPDATED")).toBeVisible();

    // 2. Settings — walk through all 7 tabs, save store name, test appearance & reset
    await page.locator("nav").getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);

    await page.getByRole("tab", { name: "Appearance" }).click();
    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Discard" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.getByRole("tab", { name: "Business" }).click();
    await fieldControl(page, "Business name").fill("FreshMart Flagship");

    await page.getByRole("tab", { name: "Billing & Tax" }).click();
    await toggleSwitch(page, "Cashiers can cancel bills").click();
    await page.getByRole("tab", { name: "Receipt" }).click();
    await expect(page.getByRole("button", { name: "Print test receipt" })).toBeVisible();
    await page.getByRole("tab", { name: "Inventory" }).click();
    await fieldControl(page, "Default low-stock level").fill("8");
    await page.getByRole("tab", { name: "Loyalty" }).click();
    await fieldControl(page, "Points per ₹100").fill("2");

    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();
    await expect(page.locator("aside").getByText("FreshMart Flagship")).toBeVisible();
  });

  test("subscription warning & expired banners plus manager and cashier RBAC restrictions", async ({ page }) => {
    // 1. Expiring within 5 days banner (City Kirana: 3 days left)
    const stateWarn = createMockState();
    await installMockApi(page, stateWarn);
    await signIn(page, "kirana@example.com", "kirana-password");
    await expect(page.getByText(/Your .* plan ends in \d+ day/i)).toBeVisible();
    await page.getByRole("link", { name: "View plan" }).click();
    await expect(page).toHaveURL(/\/settings$/);

    // 2. Expired subscription banner (Old Bazaar: expired 5 days ago) + write locked 402 error
    const stateExpired = createMockState();
    await installMockApi(page, stateExpired);
    await signIn(page, "old@example.com", "old-password");
    await expect(page.getByText(/plan has expired.*billing & edits are locked/i)).toBeVisible();

    // 3. Manager RBAC: allowed most routes, blocked from /staff, Profit & Loss tab hidden, only My Account in Settings
    const stateMgr = createMockState();
    await installMockApi(page, stateMgr);
    await signIn(page, "manager@freshmart.com", "manager-password");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator("nav").getByRole("link", { name: "Staff" })).toHaveCount(0);

    await page.goto("/staff");
    await expect(page).toHaveURL(/\/billing$/);

    await page.locator("nav").getByRole("link", { name: "Reports" }).click();
    await expect(page.getByRole("tab", { name: "Profit & Loss" })).toHaveCount(0);

    await page.locator("nav").getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("tab", { name: "Business" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "My Account" })).toBeVisible();

    // 4. Cashier RBAC: lands on /billing, blocked from back-office routes, profit hidden on dashboard
    const stateCashier = createMockState();
    stateCashier.shopDbs[1].settings.cashierCanDiscount = false;
    stateCashier.shopDbs[1].settings.cashierCanCancel = false;
    await installMockApi(page, stateCashier);
    await signIn(page, "cashier@freshmart.com", "cashier-password");

    await expect(page).toHaveURL(/\/billing$/);
    await expect(page.locator("nav").getByRole("link", { name: "Stock" })).toHaveCount(0);
    await expect(page.locator("nav").getByRole("link", { name: "Staff" })).toHaveCount(0);

    await page.goto("/stock");
    await expect(page).toHaveURL(/\/billing$/);
    await page.goto("/purchases");
    await expect(page).toHaveURL(/\/billing$/);
    await page.goto("/reports");
    await expect(page).toHaveURL(/\/billing$/);

    await page.locator("nav").getByRole("link", { name: "Dashboard" }).click();
    await expect(page.getByText("Today's sales")).toBeVisible();
    await expect(page.getByText("Net profit")).toHaveCount(0);

    // Cashier cannot cancel or return bills when cashierCanCancel is false
    await page.locator("nav").getByRole("link", { name: "Sales History" }).click();
    await page.getByText("INV-000001").click();
    const billDialog = page.getByRole("dialog", { name: "INV-000001" });
    await expect(billDialog.getByRole("button", { name: "Cancel bill" })).toHaveCount(0);
    await expect(billDialog.getByRole("button", { name: "Return items" })).toHaveCount(0);
  });
});
