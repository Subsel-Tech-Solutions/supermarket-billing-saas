const { test, expect } = require("@playwright/test");
const { createMockState, installMockApi, signIn, fieldControl, toggleSwitch } = require("./helpers/mockBackend");

test.describe("Tenant Inventory: Stock, Barcodes, Suppliers & Purchases", () => {
  test("stock CRUD, filters, validation, stock adjustment, history, scan, bulk import, print mode, report & delete", async ({ page }) => {
    test.slow();
    const state = createMockState();
    await installMockApi(page, state);
    await signIn(page, "owner@freshmart.com", "owner-password");

    await page.locator("nav").getByRole("link", { name: "Stock" }).click();
    await expect(page).toHaveURL(/\/stock$/);
    await expect(page.getByText("Active products")).toBeVisible();
    await expect(page.getByText("Basmati Rice")).toBeVisible();

    // Status filter chips
    await page.getByRole("button", { name: "Low stock", exact: true }).click();
    await expect(page.getByText("Olive Oil")).toBeVisible();
    await expect(page.getByText("Basmati Rice")).toHaveCount(0);

    await page.getByRole("button", { name: "Out of stock", exact: true }).click();
    await expect(page.getByText("Almond Milk")).toBeVisible();

    await page.getByRole("button", { name: "Expiring soon", exact: true }).click();
    await expect(page.getByText("Greek Yogurt")).toBeVisible();

    await page.getByRole("button", { name: "Expired", exact: true }).click();
    await expect(page.getByText("Brown Bread")).toBeVisible();

    await page.getByRole("button", { name: "All", exact: true }).click();

    // Add Product + MRP validation + loose decimal creation
    await page.getByRole("button", { name: "Add Product" }).click();
    const newProdModal = page.getByRole("dialog", { name: "New Product" });
    await fieldControl(newProdModal, "Product name").fill("Organic Honey");
    await fieldControl(newProdModal, "MRP").fill("300");
    await fieldControl(newProdModal, "Selling price").fill("350");
    await newProdModal.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(/Selling price .* cannot exceed MRP/)).toBeVisible();

    await fieldControl(newProdModal, "Selling price").fill("280");
    await fieldControl(newProdModal, "Cost price").fill("210");
    await fieldControl(newProdModal, "Category").fill("Groceries");
    await fieldControl(newProdModal, "Barcode").fill("8901009900111");
    await fieldControl(newProdModal, "Unit").selectOption("kg");
    await fieldControl(newProdModal, "Opening stock").fill("10.5");
    await fieldControl(newProdModal, "Net quantity").fill("500g");
    await newProdModal.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("Product created")).toBeVisible();
    await expect(page.getByText("Organic Honey")).toBeVisible();

    // Edit Olive Oil price
    const oliveRow = page.locator("tr", { hasText: "Olive Oil" });
    await oliveRow.getByRole("button", { name: "Edit" }).click();
    const editModal = page.getByRole("dialog", { name: "Edit Product" });
    await fieldControl(editModal, "Selling price").fill("840");
    await editModal.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Product updated")).toBeVisible();

    // Adjust stock (Add 10 to Olive Oil) + inspect Stock History
    await oliveRow.getByRole("button", { name: "Adjust stock" }).click();
    const adjModal = page.getByRole("dialog", { name: /Adjust stock — Olive Oil/ });
    await adjModal.getByRole("button", { name: "Add", exact: true }).click();
    await adjModal.getByPlaceholder("0").fill("10");
    await fieldControl(adjModal, "Note").fill("Restocked shelf");
    await adjModal.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Stock adjusted")).toBeVisible();

    await oliveRow.getByRole("button", { name: "Stock history" }).click();
    const histModal = page.getByRole("dialog", { name: /Stock history — Olive Oil/ });
    await expect(histModal.getByText("Adjustment")).toBeVisible();
    await expect(histModal.getByText(/Restocked shelf/)).toBeVisible();
    await histModal.getByRole("button", { name: "Close" }).click();

    // Scan to Update Stock: existing product & brand-new barcode
    await page.getByRole("button", { name: "Scan", exact: true }).click();
    const scanModal = page.getByRole("dialog", { name: "Scan to Update Stock" });
    await scanModal.getByPlaceholder("Scan with USB scanner or type barcode...").fill("8909991112223");
    await scanModal.getByRole("button", { name: "Search" }).click();
    await expect(scanModal.getByRole("button", { name: "Create Product" })).toBeVisible();
    await scanModal.getByPlaceholder("Product name").fill("Scanned Oats 1kg");
    await fieldControl(scanModal, "Price (₹)").fill("180");
    await fieldControl(scanModal, "Initial Quantity").fill("6");
    await scanModal.getByRole("button", { name: "Create Product" }).click();
    await expect(page.getByText("Product created")).toBeVisible();
    await expect(page.getByText("Scanned Oats 1kg")).toBeVisible();

    // Bulk CSV Import (3-step upload -> preview -> result)
    await page.getByRole("button", { name: "Import Sheet" }).click();
    const importModal = page.getByRole("dialog", { name: "Bulk Import Products" });
    const csvContent = [
      "name,price,mrp,costPrice,quantity,unit,category,barcode",
      "Masala Oats,95,105,72,20,pcs,Groceries,8907771110001",
      "Filter Coffee,220,250,175,15,pcs,Beverages,8907771110002",
    ].join("\n");
    await importModal.locator('input[type="file"]').setInputFiles({
      name: "products.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent, "utf-8"),
    });
    await expect(importModal.getByText("2 products ready to import")).toBeVisible();
    await importModal.getByRole("button", { name: /Import/ }).click();
    await expect(importModal.getByText("Import Complete!")).toBeVisible();
    await importModal.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("Masala Oats")).toBeVisible();

    // Print Labels mode
    await page.getByRole("button", { name: "Print Labels" }).click();
    await page.getByRole("button", { name: "One more label for Basmati Rice" }).click();
    await expect(page.getByText("1 selected")).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();

    // Download Stock Report modal
    await page.getByRole("button", { name: "Download Report" }).click();
    const repModal = page.getByRole("dialog", { name: /Stock Report/i });
    await expect(repModal).toBeVisible();
    await repModal.getByRole("button", { name: "Close" }).click();

    // Delete Brown Bread
    const breadRow = page.locator("tr", { hasText: "Brown Bread" });
    await breadRow.locator("td[data-actions] button").nth(3).click();
    const delDialog = page.getByRole("dialog", { name: "Remove Product" });
    await delDialog.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Product removed")).toBeVisible();
    await expect(page.getByText("Brown Bread")).toHaveCount(0);
  });

  test("barcode generator creates product labels, saves to stock, and manages label queue", async ({ page }) => {
    const state = createMockState();
    await installMockApi(page, state);
    await signIn(page, "owner@freshmart.com", "owner-password");

    await page.locator("nav").getByRole("link", { name: "Barcodes" }).click();
    await expect(page).toHaveURL(/\/barcode$/);

    await page.getByPlaceholder("e.g. Tata Salt 1kg").fill("Chana Dal 1kg");
    await page.getByPlaceholder("e.g. 500ml, 1kg, 12").fill("1 kg");
    await page.getByPlaceholder("e.g. Grains, Oils, Essentials").fill("Staples");
    await page.getByPlaceholder("150", { exact: true }).fill("140");
    await page.getByPlaceholder("100", { exact: true }).fill("150");
    await page.getByRole("button", { name: "Add Label" }).click();
    await expect(page.getByText(/Selling price .* cannot exceed MRP/)).toBeVisible();

    await page.getByPlaceholder("100", { exact: true }).fill("125");
    await page.getByRole("button", { name: "Save to Stock" }).click();
    await expect(page.getByText(/saved to stock!/i)).toBeVisible();

    await page.getByRole("button", { name: "Add Label" }).click();
    await expect(page.getByRole("button", { name: "Print Labels (1)" })).toBeVisible();
    await expect(page.locator("#label-print-area").getByText("Chana Dal 1kg")).toBeVisible();

    await page.getByRole("button", { name: "Clear All" }).click();
    await expect(page.getByRole("button", { name: "Print Labels (0)" })).toBeVisible();
  });

  test("suppliers & purchases full cycle: add supplier, credit purchase, pay supplier, cancel purchase, and delete supplier", async ({ page }) => {
    const state = createMockState();
    await installMockApi(page, state);
    await signIn(page, "owner@freshmart.com", "owner-password");

    // 1. Add a supplier
    await page.locator("nav").getByRole("link", { name: "Suppliers" }).click();
    await expect(page).toHaveURL(/\/suppliers$/);
    await page.getByRole("button", { name: "Add supplier" }).click();
    const supModal = page.getByRole("dialog", { name: "Add supplier" });
    await fieldControl(supModal, "Name").fill("Kaveri Traders");
    await fieldControl(supModal, "Phone").fill("9840055566");
    await fieldControl(supModal, "Opening balance").fill("0");
    await supModal.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Supplier added")).toBeVisible();
    await expect(page.getByText("Kaveri Traders")).toBeVisible();

    // 2. Open Metro Wholesale Distributors detail modal
    await page.getByRole("button", { name: "Metro Wholesale Distributors" }).click();
    const detailModal = page.getByRole("dialog", { name: "Metro Wholesale Distributors" });
    await expect(detailModal.getByText("PUR-000001")).toBeVisible();
    await detailModal.getByRole("button", { name: "Close" }).click();

    // 3. Create an unpaid credit purchase for Kaveri Traders -> updates stock & supplier payable
    await page.locator("nav").getByRole("link", { name: "Purchases" }).click();
    await expect(page).toHaveURL(/\/purchases$/);
    await page.getByRole("button", { name: "New purchase" }).click();

    const purModal = page.getByRole("dialog", { name: "New purchase" });
    await fieldControl(purModal, "Supplier").first().selectOption({ label: "Kaveri Traders" });
    await fieldControl(purModal, "Supplier invoice no.").fill("KT-901");

    await purModal.getByPlaceholder("Search product by name or barcode to add…").fill("Basmati");
    await purModal.locator("button", { hasText: "Basmati Rice" }).first().click();

    const itemRow = purModal.locator("tbody tr", { hasText: "Basmati Rice" });
    await itemRow.locator("input").nth(0).fill("5"); // Qty
    await itemRow.locator("input").nth(1).fill("400"); // Cost price

    await toggleSwitch(purModal, "Paid in full now").click();
    await fieldControl(purModal, "Amount paid now").fill("100");
    await purModal.getByRole("button", { name: /Save purchase/ }).click();
    await expect(page.getByText(/Purchase saved/)).toBeVisible();
    await expect(page.getByText("PUR-000002")).toBeVisible();

    // Verify Unpaid only filter
    await page.getByLabel("Unpaid only").check();
    await expect(page.getByText("PUR-000002")).toBeVisible();

    // 4. Go to Suppliers -> verify Kaveri Traders has payable & pay full due
    await page.locator("nav").getByRole("link", { name: "Suppliers" }).click();
    const kaveriRow = page.locator("tr", { hasText: "Kaveri Traders" });
    await kaveriRow.getByTitle("Pay").click();
    const payModal = page.getByRole("dialog", { name: "Pay Kaveri Traders" });
    await expect(fieldControl(payModal, "Amount")).not.toHaveValue("");
    await payModal.getByRole("button", { name: "Save payment" }).click();
    await expect(page.getByText("Payment recorded")).toBeVisible();

    // 5. Cancel PUR-000002 -> reverses stock & purchase status becomes Cancelled
    await page.locator("nav").getByRole("link", { name: "Purchases" }).click();
    await page.getByText("PUR-000002").click();
    const viewPur = page.getByRole("dialog", { name: "PUR-000002" });
    await viewPur.getByRole("button", { name: /Cancel purchase/ }).click();
    await page.getByRole("dialog", { name: "Cancel purchase" }).getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Purchase cancelled")).toBeVisible();

    // 6. Delete Aavin Dairy Depot (zero balance)
    await page.locator("nav").getByRole("link", { name: "Suppliers" }).click();
    const aavinRow = page.locator("tr", { hasText: "Aavin Dairy Depot" });
    await aavinRow.getByTitle("Delete").click();
    await page.getByRole("dialog", { name: "Remove supplier" }).getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Supplier removed")).toBeVisible();
    await expect(page.getByText("Aavin Dairy Depot")).toHaveCount(0);
  });
});
