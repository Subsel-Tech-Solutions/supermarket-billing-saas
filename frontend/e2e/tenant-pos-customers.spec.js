const { test, expect } = require("@playwright/test");
const { createMockState, installMockApi, signIn, fieldControl } = require("./helpers/mockBackend");

test.describe("Tenant POS Billing, Sales History, Customers & Day Closing", () => {
  test("POS cart operations, reload persistence, hold/resume bills, cash/split/credit checkouts & loyalty", async ({ page }) => {
    test.slow();
    const state = createMockState();
    await installMockApi(page, state);
    await signIn(page, "owner@freshmart.com", "owner-password");

    await page.locator("nav").getByRole("link", { name: "Billing" }).click();
    await expect(page).toHaveURL(/\/billing$/);

    // Search barcode with Enter key to add Basmati Rice
    const searchInput = page.getByPlaceholder("Search product name / scan or type barcode, then Enter…");
    await searchInput.fill("8901001001001");
    await searchInput.press("Enter");
    const cartPanel = page.locator(".billing-cart");
    await expect(cartPanel.getByText("Basmati Rice")).toBeVisible();

    // Add loose item (Toor Dal 1.5 kg) and verify decimal qty
    await searchInput.fill("Toor Dal");
    await page.locator("button", { hasText: "Toor Dal (Loose)" }).first().click();
    const dalItem = cartPanel.locator("div.fade-in", { hasText: "Toor Dal (Loose)" });
    const dalQtyInput = dalItem.getByLabel("Quantity");
    await dalQtyInput.fill("1.5");
    await dalQtyInput.blur();

    // Verify cart persists across page reload
    await page.reload();
    await expect(cartPanel.getByText("Basmati Rice")).toBeVisible();
    await expect(cartPanel.getByText("Toor Dal (Loose)")).toBeVisible();

    // Hold bill -> Held (1) -> Resume bill
    await cartPanel.getByRole("button", { name: "Hold" }).click();
    await expect(page.getByText("Bill put on hold")).toBeVisible();
    await expect(page.getByRole("button", { name: /Held \(1\)/ })).toBeVisible();
    await page.getByRole("button", { name: /Held \(1\)/ }).click();
    const heldDialog = page.getByRole("dialog", { name: /Held bills/i });
    await expect(heldDialog).toBeVisible();
    await heldDialog.getByRole("button", { name: "Resume" }).click();
    await expect(cartPanel.getByText("Basmati Rice")).toBeVisible();

    // Lookup existing customer Priya Sharma (has loyalty points + credit limit 2000)
    await page.getByPlaceholder("Phone number").fill("9876543210");
    await page.getByPlaceholder("Phone number").press("Enter");
    await expect(page.getByText(/Priya Sharma/).first()).toBeVisible();

    // Checkout: redeem loyalty points + Cash payment with change
    await page.getByRole("button", { name: /Checkout/i }).click();
    const checkout = page.getByRole("dialog", { name: "Complete sale" });
    await expect(checkout).toBeVisible();

    // Redeem 20 points
    await fieldControl(checkout, "Redeem points").fill("20");
    // Cash tendered higher than total to check change return
    await fieldControl(checkout, "Cash received").fill("1000");
    await expect(checkout.getByText(/Change to return/)).toBeVisible();

    await checkout.getByRole("button", { name: /Confirm sale/i }).click();
    const doneModal = page.getByRole("dialog", { name: /Sale complete/i });
    await expect(doneModal).toBeVisible();
    await expect(doneModal.getByText(/INV-000003/)).toBeVisible();

    await doneModal.getByRole("button", { name: "New bill" }).click();
    await expect(page.getByRole("button", { name: /Reprint/i })).toBeVisible();

    // Credit sale with new customer
    await searchInput.fill("8901001001003"); // Olive Oil ₹820 (qty 2 in stock)
    await searchInput.press("Enter");
    await page.getByPlaceholder("Phone number").fill("9123456780");
    await page.getByPlaceholder("Name", { exact: true }).fill("Aravind Credit");

    await page.getByRole("button", { name: /Checkout/i }).click();
    const creditCheckout = page.getByRole("dialog", { name: "Complete sale" });
    await creditCheckout.getByRole("button", { name: "Credit (Due)", exact: true }).click();
    await creditCheckout.getByRole("button", { name: /Confirm sale/i }).click();

    await expect(page.getByRole("dialog", { name: /Sale complete/i })).toBeVisible();
  });

  test("sales history filters, partial/full return, bill cancellation, customers ledger/payment/points & day closing", async ({ page }) => {
    const state = createMockState();
    await installMockApi(page, state);
    await signIn(page, "owner@freshmart.com", "owner-password");

    // 1. Sales History: inspect bill, process return, and cancel bill
    await page.locator("nav").getByRole("link", { name: "Sales History" }).click();
    await expect(page).toHaveURL(/\/transactions$/);
    await expect(page.locator("tbody").getByText("INV-000001")).toBeVisible();
    await expect(page.locator("tbody").getByText("INV-000002")).toBeVisible();

    // Filter Due only
    await page.getByLabel("Due only").check();
    await expect(page.getByText("INV-000002")).toBeVisible();
    await expect(page.getByText("INV-000001")).toHaveCount(0);
    await page.getByRole("button", { name: "Clear" }).click();

    // Open INV-000001 -> Partial return of 1 Basmati Rice
    await page.getByText("INV-000001").click();
    const billModal = page.getByRole("dialog", { name: "INV-000001" });
    await expect(billModal.getByText("Basmati Rice")).toBeVisible();
    await billModal.getByRole("button", { name: "Return items" }).click();

    const retModal = page.getByRole("dialog", { name: /Return — INV-000001/ });
    await retModal.locator("tbody tr input[type='text']").first().fill("1");
    await fieldControl(retModal, "Reason").fill("Damaged pack");
    let returnPayload;
    const captureReturn = (request) => {
      if (request.method() === "POST" && request.url().includes("/api/bills/1/return")) {
        returnPayload = JSON.parse(request.postData());
      }
    };
    page.on("request", captureReturn);
    await retModal.getByRole("button", { name: /Save return/ }).click();
    await expect(page.getByText(/Return RET-000001 saved/)).toBeVisible();
    page.off("request", captureReturn);
    expect(returnPayload?.clientRef).toBeTruthy();
    const retriedReturn = await page.evaluate(async (payload) => {
      const response = await fetch("/api/bills/1/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { status: response.status, body: await response.json() };
    }, returnPayload);
    expect(retriedReturn.status).toBe(200);
    expect(retriedReturn.body.duplicate).toBe(true);
    expect(state.shopDbs[1].saleReturns.filter((r) => r.clientRef === returnPayload.clientRef)).toHaveLength(1);
    await expect(billModal.getByText("Part returned").first()).toBeVisible();
    await billModal.getByRole("button", { name: "Close" }).click();

    // Open INV-000002 -> Cancel bill
    await page.getByText("INV-000002").click();
    const inv2Modal = page.getByRole("dialog", { name: "INV-000002" });
    await inv2Modal.getByRole("button", { name: "Return items" }).click();
    const unpaidReturn = page.getByRole("dialog", { name: /Return — INV-000002/ });
    await unpaidReturn.locator("tbody tr input[type='text']").first().fill("1");
    await fieldControl(unpaidReturn, "Refund as").selectOption("cash");
    await unpaidReturn.getByRole("button", { name: /Save return/ }).click();
    await expect(page.getByText(/Cash refund exceeds the amount collected/)).toBeVisible();
    await unpaidReturn.getByRole("button", { name: "Back" }).click();

    await inv2Modal.getByRole("button", { name: "Cancel bill" }).click();
    const cancelConfirm = page.getByRole("dialog", { name: "Cancel bill" });
    await cancelConfirm.getByPlaceholder("e.g. Wrong billing").fill("Customer changed mind");
    await cancelConfirm.getByRole("button", { name: "Cancel bill" }).click();
    await expect(page.getByText(/Bill cancelled/)).toBeVisible();

    // 2. Customers list + Create + Detail page (Bills, Payments, Points, Edit, Remove)
    await page.locator(".desktop-sidebar nav").getByRole("link", { name: "Customers" }).click();
    await expect(page).toHaveURL(/\/customers$/);
    await expect(page.getByText("Priya Sharma").first()).toBeVisible();

    await page.getByRole("button", { name: "Add customer" }).click();
    const addCust = page.getByRole("dialog", { name: "Add customer" });
    await fieldControl(addCust, "Name").fill("Meera Nair");
    await fieldControl(addCust, "Phone").fill("9876501122");
    await fieldControl(addCust, "Credit limit").fill("3000");
    await addCust.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Customer added")).toBeVisible();
    await expect(page).toHaveURL(/\/customers\/3$/);

    // Go back to customers list -> Priya Sharma detail page & receive payment + adjust points
    await page.getByRole("button", { name: "Customers" }).click();
    await page.locator("tr", { hasText: "Priya Sharma" }).click();
    await expect(page).toHaveURL(/\/customers\/1$/);
    await expect(page.getByText(/9876543210/)).toBeVisible();

    await page.getByRole("button", { name: "Receive payment" }).click();
    const custPay = page.getByRole("dialog", { name: /Receive payment — Priya Sharma/ });
    await fieldControl(custPay, "Amount").fill("250");
    await fieldControl(custPay, "Method").selectOption("cash");
    await custPay.getByRole("button", { name: "Save payment" }).click();
    await expect(page.getByText("Payment received")).toBeVisible();

    // Check Payments tab shows ₹250 collection
    await page.getByRole("tab", { name: /Payments/ }).click();
    await expect(page.getByText("₹250.00").first()).toBeVisible();

    // Adjust loyalty points
    await page.getByRole("button", { name: /Points/ }).click();
    const ptsModal = page.getByRole("dialog", { name: /Adjust loyalty points/ });
    await ptsModal.locator("input").fill("50");
    await ptsModal.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Points updated")).toBeVisible();

    // Remove zero-balance customer Karthik Raja
    await page.locator(".desktop-sidebar nav").getByRole("link", { name: "Customers" }).click();
    await page.locator("tr", { hasText: "Karthik Raja" }).click();
    await page.getByRole("button", { name: "Remove customer" }).click();
    await page.getByRole("dialog", { name: "Remove customer" }).getByRole("button", { name: "Confirm" }).click();
    await expect(page).toHaveURL(/\/customers$/);
    await expect(page.getByText("Karthik Raja")).toHaveCount(0);

    // 3. Day Closing reflects collections, cancellations, refunds, and drawer note counter
    await page.locator("nav").getByRole("link", { name: "Day Closing" }).click();
    await expect(page).toHaveURL(/\/day-end$/);
    await expect(page.getByText("Payments received")).toBeVisible();
    await expect(page.getByText("Expected cash")).toBeVisible();

    await page.getByLabel("Number of ₹500 notes").fill("2");
    await page.getByLabel("Number of ₹100 notes").fill("5");
    await expect(page.getByText("₹1,500.00").first()).toBeVisible();
  });
});
