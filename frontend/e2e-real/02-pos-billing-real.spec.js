// e2e-real/02-pos-billing-real.spec.js — POS billing, barcode search, decimal items, loyalty verification & real checkout
const { test, expect } = require("@playwright/test");
const { realSignIn, fieldControl, queryTenantDb } = require("./helpers/realHelpers");

test.describe("02. POS Billing & Checkout Integration (Real Backend & MySQL)", () => {
  test("cart operations, customer loyalty checks, negative checkout cancellation, and successful sale with real DB updates", async ({ page }) => {
    test.slow();
    await realSignIn(page, "owner@freshmart.com", "admin123");

    await page.locator("nav").getByRole("link", { name: "Billing" }).click();
    await expect(page).toHaveURL(/\/billing$/);
    await page.evaluate(() => {
      localStorage.removeItem("cart_held");
      localStorage.removeItem("active_cart");
    });

    // 1. Customer Loyalty Points Initial State Verification (50 points)
    const phoneInput = page.getByPlaceholder("Phone number");
    await phoneInput.fill("9876543210");
    await phoneInput.press("Enter");

    await expect(page.getByText(/Priya Sharma/).first()).toBeVisible();
    await expect(page.getByText(/50 pts/).first()).toBeVisible();

    const [dbCustomerInitial] = await queryTenantDb("SELECT loyalty_points FROM customers WHERE phone = '9876543210'");
    expect(Number(dbCustomerInitial.loyalty_points)).toBe(50);

    // 2. Barcode Scan & Add Item (Basmati Rice ₹499)
    const searchInput = page.getByPlaceholder("Search product name / scan or type barcode, then Enter…");
    await searchInput.fill("8901001001001");
    await searchInput.press("Enter");

    const cartPanel = page.locator(".billing-cart");
    await expect(cartPanel.getByText("Basmati Rice")).toBeVisible();

    // 3. Add Loose Item with Decimal Quantity (Toor Dal 1.5 kg)
    await searchInput.fill("Toor Dal");
    await page.locator("button", { hasText: "Toor Dal (Loose)" }).first().click();

    const dalItem = cartPanel.locator("div.fade-in", { hasText: "Toor Dal (Loose)" });
    const dalQtyInput = dalItem.getByLabel("Quantity");
    await dalQtyInput.fill("1.5");
    await dalQtyInput.blur();

    // 4. Cart Persistence Across Page Reload
    await page.reload();
    await expect(cartPanel.getByText("Basmati Rice")).toBeVisible();
    await expect(cartPanel.getByText("Toor Dal (Loose)")).toBeVisible();

    // Re-attach customer after reload
    await phoneInput.fill("9876543210");
    await phoneInput.press("Enter");
    await expect(page.getByText(/Priya Sharma/).first()).toBeVisible();

    // 5. Hold and Resume Bill
    await cartPanel.getByRole("button", { name: "Hold" }).click();
    await expect(page.getByText("Bill put on hold")).toBeVisible();
    await expect(page.getByRole("button", { name: /Held \(\d+\)/ })).toBeVisible();

    await page.getByRole("button", { name: /Held \(\d+\)/ }).click();
    const heldDialog = page.getByRole("dialog", { name: /Held bills/i });
    await expect(heldDialog).toBeVisible();
    await heldDialog.getByRole("button", { name: "Resume" }).first().click();
    await expect(cartPanel.getByText("Basmati Rice")).toBeVisible();

    // Re-verify customer
    await phoneInput.fill("9876543210");
    await phoneInput.press("Enter");
    await expect(page.getByText(/Priya Sharma/).first()).toBeVisible();

    // 6. Test Failed / Cancelled Checkout Does NOT Deduct Loyalty Points
    await page.getByRole("button", { name: /Checkout/i }).click();
    const checkoutDialog = page.getByRole("dialog", { name: "Complete sale" });
    await expect(checkoutDialog).toBeVisible();

    await fieldControl(checkoutDialog, "Redeem points").fill("20");
    // Cancel the modal via Escape key / Close button instead of completing
    await page.keyboard.press("Escape");
    await expect(checkoutDialog).not.toBeVisible();

    // Verify DB: Points must STILL be 50
    const [dbCustomerAfterCancel] = await queryTenantDb("SELECT loyalty_points FROM customers WHERE phone = '9876543210'");
    expect(Number(dbCustomerAfterCancel.loyalty_points)).toBe(50);
    await expect(page.getByText(/50 pts/).first()).toBeVisible();

    // 7. Complete Real Sale Checkout
    await page.getByRole("button", { name: /Checkout/i }).click();
    await expect(checkoutDialog).toBeVisible();

    // Redeem 20 points
    await fieldControl(checkoutDialog, "Redeem points").fill("20");
    // Tender Cash ₹1000
    await fieldControl(checkoutDialog, "Cash received").fill("1000");
    await expect(checkoutDialog.getByText(/Change to return/)).toBeVisible();

    const [billResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/bills") && res.request().method() === "POST"),
      checkoutDialog.getByRole("button", { name: /Confirm sale/i }).click(),
    ]);

    expect(billResponse.status()).toBe(201);
    const billData = await billResponse.json();
    const createdBillNumber = billData.data.bill.billNumber;
    expect(createdBillNumber).toMatch(/^INV-\d{6}$/);

    const doneModal = page.getByRole("dialog", { name: /Sale complete/i });
    await expect(doneModal).toBeVisible();
    await expect(doneModal.getByText(createdBillNumber)).toBeVisible();
    await doneModal.getByRole("button", { name: "New bill" }).click();

    // 8. Direct Database Verifications in MySQL sm_test_shop_1
    // A) Bill and Items recorded
    const bills = await queryTenantDb("SELECT * FROM bills WHERE bill_number = ?", [createdBillNumber]);
    expect(bills.length).toBe(1);
    expect(bills[0].status).toBe("completed");
    expect(Number(bills[0].loyalty_redeemed)).toBe(20);

    const billItems = await queryTenantDb("SELECT * FROM bill_items WHERE bill_id = ?", [bills[0].id]);
    expect(billItems.length).toBe(2);

    // B) Real Stock decremented in products table
    // Basmati Rice: was 25, bought 1 -> now 24
    const [rice] = await queryTenantDb("SELECT quantity FROM products WHERE barcode = '8901001001001'");
    expect(Number(rice.quantity)).toBe(24);

    // Toor Dal: was 12.5, bought 1.5 -> now 11
    const [dal] = await queryTenantDb("SELECT quantity FROM products WHERE barcode = '8901001001002'");
    expect(Number(dal.quantity)).toBe(11);

    // C) Customer loyalty points updated: 50 - 20 + loyaltyEarned
    const [dbCustomerFinal] = await queryTenantDb("SELECT loyalty_points, total_bills FROM customers WHERE phone = '9876543210'");
    expect(dbCustomerFinal.total_bills).toBe(1);
    // 50 - 20 = 30 + earned points (totalAmount / 100)
    expect(Number(dbCustomerFinal.loyalty_points)).toBeGreaterThan(30);
  });
});
