// e2e-real/03-inventory-real.spec.js — Stock inventory, MRP negative validation test & direct MySQL verification
const { test, expect } = require("@playwright/test");
const { realSignIn, fieldControl, queryTenantDb } = require("./helpers/realHelpers");

test.describe("03. Inventory & MRP Compliance (Real Backend & MySQL)", () => {
  test("stock list, status filter chips, MRP statutory validation rejection, product creation and adjustment", async ({ page }) => {
    test.slow();
    await realSignIn(page, "owner@freshmart.com", "admin123");

    await page.locator("nav").getByRole("link", { name: "Stock" }).click();
    await expect(page).toHaveURL(/\/stock$/);
    await expect(page.getByText("Active products")).toBeVisible();

    // 1. Initial Seeded Inventory Verification
    await expect(page.getByText("Basmati Rice")).toBeVisible();
    await expect(page.getByText("Toor Dal (Loose)")).toBeVisible();

    // 2. Filter chips
    // Low stock chip -> Olive Oil
    await page.getByRole("button", { name: "Low stock", exact: true }).click();
    await expect(page.getByText("Olive Oil")).toBeVisible();
    await expect(page.getByText("Basmati Rice")).toHaveCount(0);

    // Out of stock chip -> Almond Milk
    await page.getByRole("button", { name: "Out of stock", exact: true }).click();
    await expect(page.getByText("Almond Milk")).toBeVisible();

    // Reset filter
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(page.getByText("Basmati Rice")).toBeVisible();

    // 3. MRP Compliance Negative Validation Test (Requirement B)
    // Product: Organic Honey, MRP ₹300, Selling price ₹350
    // A) In UI: attempting creation shows statutory error and blocks invalid payload
    await page.getByRole("button", { name: "Add Product" }).click();
    const modal = page.getByRole("dialog", { name: "New Product" });
    await expect(modal).toBeVisible();

    await fieldControl(modal, "Product name").fill("Organic Honey");
    await fieldControl(modal, "MRP").fill("300");
    await fieldControl(modal, "Selling price").fill("350");

    await modal.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(/cannot exceed MRP/i).first()).toBeVisible();

    // B) Direct Backend API test: verify Express backend rejects with HTTP 400 even if bypassed
    const cookies = await page.context().cookies();
    const xsrf = cookies.find((c) => c.name === "XSRF-TOKEN")?.value;
    const apiDirect = await page.request.post("http://127.0.0.1:5000/api/products", {
      headers: {
        "x-xsrf-token": xsrf || "",
      },
      data: {
        name: "Organic Honey Direct",
        mrp: 300,
        price: 350,
      },
    });
    expect(apiDirect.status()).toBe(400);
    const apiError = await apiDirect.json();
    expect(apiError.message).toMatch(/cannot exceed MRP/i);

    // C) Direct MySQL verification: Ensure NO invalid product record exists in DB
    const noProduct = await queryTenantDb("SELECT * FROM products WHERE name LIKE 'Organic Honey%'");
    expect(noProduct.length).toBe(0);

    // 4. Correct Selling Price and Successfully Create Product via UI
    await fieldControl(modal, "Selling price").fill("280");
    await fieldControl(modal, "Cost price").fill("210");
    await fieldControl(modal, "Category").fill("Groceries");
    await fieldControl(modal, "Barcode").fill("8901009900111");
    await fieldControl(modal, "Unit").selectOption("kg");
    await fieldControl(modal, "Opening stock").fill("10");

    const [createResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/products") && res.request().method() === "POST"),
      modal.getByRole("button", { name: "Create" }).click(),
    ]);

    expect(createResponse.status()).toBe(201);
    await expect(modal).not.toBeVisible();
    await expect(page.getByText("Organic Honey").first()).toBeVisible();

    // Direct MySQL verification: Ensure row exists in database
    const createdProduct = await queryTenantDb("SELECT * FROM products WHERE name = 'Organic Honey'");
    expect(createdProduct.length).toBe(1);
    expect(Number(createdProduct[0].price)).toBe(280);
    expect(Number(createdProduct[0].mrp)).toBe(300);
  });
});
