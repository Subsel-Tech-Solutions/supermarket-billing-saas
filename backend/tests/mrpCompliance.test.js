// tests/mrpCompliance.test.js — test selling price <= MRP compliance across catalog, purchases, and billing
const assert = require("assert");
const { assertPriceWithinMrp, HttpError, round2 } = require("../utils/helpers");
const { productFields } = require("../controllers/productController");

console.log("Starting Selling Price <= MRP Compliance Test Suite...\n");

let passed = 0;
const test = (desc, fn) => {
  try {
    fn();
    console.log(`✓ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${desc}`);
    console.error(err);
    process.exit(1);
  }
};

// ── 1. Unit Tests for assertPriceWithinMrp ────────────────────────────────────
test("Allows selling price strictly below MRP (discounted retail)", () => {
  assert.doesNotThrow(() => assertPriceWithinMrp(85, 100, "Biscuits"));
  assert.doesNotThrow(() => assertPriceWithinMrp(340, 380, "Rice 5kg"));
});

test("Allows selling price exactly equal to MRP (full retail price)", () => {
  assert.doesNotThrow(() => assertPriceWithinMrp(100, 100, "Milk 1L"));
  assert.doesNotThrow(() => assertPriceWithinMrp(49.99, 49.99, "Soap"));
});

test("Allows loose commodities where MRP is null, undefined, or 0", () => {
  assert.doesNotThrow(() => assertPriceWithinMrp(45, null, "Tomato 1kg"));
  assert.doesNotThrow(() => assertPriceWithinMrp(60, undefined, "Onion 1kg"));
  assert.doesNotThrow(() => assertPriceWithinMrp(120, 0, "Loose Sugar 1kg"));
  assert.doesNotThrow(() => assertPriceWithinMrp(80, "", "Loose Dal"));
});

test("Rejects selling price strictly higher than MRP with PRICE_EXCEEDS_MRP error", () => {
  assert.throws(
    () => assertPriceWithinMrp(105, 100, "Sunflower Oil 1L"),
    (err) => {
      assert(err instanceof HttpError);
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "PRICE_EXCEEDS_MRP");
      assert(err.message.includes("Selling price (₹105.00) cannot exceed MRP (₹100.00)"));
      assert(err.message.includes("statutory violation"));
      return true;
    },
  );
});

test("Rejects fractional overcharges above MRP", () => {
  assert.throws(
    () => assertPriceWithinMrp(50.5, 50, "Snack Bar"),
    (err) => err instanceof HttpError && err.code === "PRICE_EXCEEDS_MRP",
  );
});

// ── 2. Controller Ingestion: productFields Validation ─────────────────────────
test("productFields normalizes valid product with price <= mrp", () => {
  const fields = productFields({
    name: "Wheat Flour 5kg",
    price: "240",
    mrp: "260",
  });
  assert.strictEqual(fields.price, 240);
  assert.strictEqual(fields.mrp, 260);
});

test("productFields allows product with loose commodity (no MRP)", () => {
  const fields = productFields({
    name: "Fresh Potatoes",
    price: "35",
    mrp: "",
  });
  assert.strictEqual(fields.price, 35);
  assert.strictEqual(fields.mrp, null);
});

test("productFields throws HttpError(400) when price exceeds mrp", () => {
  assert.throws(
    () =>
      productFields({
        name: "Shampoo 200ml",
        price: "180",
        mrp: "150",
      }),
    (err) => err instanceof HttpError && err.code === "PRICE_EXCEEDS_MRP",
  );
});

// ── 3. Partial Update Merged State Simulation ─────────────────────────────────
test("Merged state validation rejects raising price above existing MRP", () => {
  const existingProduct = { name: "Juice Box", price: 90, mrp: 100 };
  const incomingUpdate = { price: 110 }; // MRP omitted in partial update

  const targetPrice = incomingUpdate.price !== undefined ? incomingUpdate.price : Number(existingProduct.price);
  const targetMrp = incomingUpdate.mrp !== undefined ? incomingUpdate.mrp : existingProduct.mrp;

  assert.throws(
    () => assertPriceWithinMrp(targetPrice, targetMrp, existingProduct.name),
    (err) => err instanceof HttpError && err.code === "PRICE_EXCEEDS_MRP",
  );
});

test("Merged state validation rejects lowering MRP below existing price", () => {
  const existingProduct = { name: "Coffee Powder 100g", price: 120, mrp: 150 };
  const incomingUpdate = { mrp: 110 }; // Lowering MRP below current selling price

  const targetPrice = incomingUpdate.price !== undefined ? incomingUpdate.price : Number(existingProduct.price);
  const targetMrp = incomingUpdate.mrp !== undefined ? incomingUpdate.mrp : existingProduct.mrp;

  assert.throws(
    () => assertPriceWithinMrp(targetPrice, targetMrp, existingProduct.name),
    (err) => err instanceof HttpError && err.code === "PRICE_EXCEEDS_MRP",
  );
});

test("Merged state validation permits valid partial updates", () => {
  const existingProduct = { name: "Tea 250g", price: 120, mrp: 150 };
  // Only update price to 130 (still <= 150)
  const targetPrice = 130;
  const targetMrp = existingProduct.mrp;

  assert.doesNotThrow(() => assertPriceWithinMrp(targetPrice, targetMrp, existingProduct.name));
});

// ── 4. Inward Purchases Validation Simulation ─────────────────────────────────
test("Purchase inward validation rejects sellingPrice > MRP", () => {
  const purchaseLine = { productId: 1, sellingPrice: "160", mrp: "140" };
  const targetMrp = purchaseLine.mrp !== "" ? Number(purchaseLine.mrp) : null;
  const targetPrice = Number(purchaseLine.sellingPrice);

  assert.throws(
    () => assertPriceWithinMrp(targetPrice, targetMrp, "Test Item"),
    (err) => err instanceof HttpError && err.code === "PRICE_EXCEEDS_MRP",
  );
});

// ── 5. Transactional Billing Checkout Defense ──────────────────────────────────
test("Billing allows checkout when effective rate is within MRP (tax-inclusive)", () => {
  const product = { name: "Ghee 500ml", price: 320, mrp: 350, taxRate: 12 };
  const pricesIncludeTax = true;

  const unitRate = Number(product.price);
  const effectiveUnitRate = pricesIncludeTax ? unitRate : round2(unitRate * (1 + Number(product.taxRate) / 100));

  assert.doesNotThrow(() => assertPriceWithinMrp(effectiveUnitRate, product.mrp, product.name));
});

test("Billing blocks checkout when tax-exclusive pricing causes billed rate to exceed MRP", () => {
  // A store with tax-exclusive pricing sets price equal to MRP (100).
  // At checkout with 18% GST, the customer would be charged 118, violating MRP!
  const product = { name: "Battery Pack", price: 100, mrp: 100, taxRate: 18 };
  const pricesIncludeTax = false;
  const taxEnabled = true;

  const unitRate = Number(product.price);
  const effectiveUnitRate = pricesIncludeTax || !taxEnabled
    ? unitRate
    : round2(unitRate * (1 + Number(product.taxRate) / 100)); // 118.00

  assert.strictEqual(effectiveUnitRate, 118);
  assert.throws(
    () => assertPriceWithinMrp(effectiveUnitRate, product.mrp, product.name),
    (err) => err instanceof HttpError && err.code === "PRICE_EXCEEDS_MRP",
  );
});

test("Billing allows checkout for loose commodity without MRP", () => {
  const product = { name: "Watermelon", price: 45, mrp: null, taxRate: 0 };
  const effectiveUnitRate = Number(product.price);
  assert.doesNotThrow(() => assertPriceWithinMrp(effectiveUnitRate, product.mrp, product.name));
});

console.log(`\nAll ${passed} Selling Price <= MRP Compliance tests passed successfully! ✔`);
