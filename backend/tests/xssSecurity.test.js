// tests/xssSecurity.test.js — test Stored XSS defense, barcode validation, and HTML escaping
const assert = require("assert");
const { sanitizeBarcode, productFields } = require("../controllers/productController");
const { HttpError } = require("../utils/helpers");

// Replicate frontend escapeHtml and svg cleaning helper for testing
const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const cleanSvg = (html) => {
  if (!html || typeof html !== "string") return "";
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/\s+on\w+\s*=\s*(['"]).*?\1/gi, "");
};

console.log("Starting Barcode Label XSS & Input Sanitization Test Suite...\n");

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

// ── 1. Barcode Sanitizer & Input Validation Tests ─────────────────────────────
test("Accepts standard EAN-13, UPC-A, and Code 128 barcodes", () => {
  assert.strictEqual(sanitizeBarcode("8901234567890"), "8901234567890");
  assert.strictEqual(sanitizeBarcode("012345678905"), "012345678905");
  assert.strictEqual(sanitizeBarcode("SKU-100_A.1/02"), "SKU-100_A.1/02");
  assert.strictEqual(sanitizeBarcode("PROD+SALE%20"), "PROD+SALE%20");
  assert.strictEqual(sanitizeBarcode("BOX 42"), "BOX 42");
});

test("Returns null for empty, undefined, or null barcodes", () => {
  assert.strictEqual(sanitizeBarcode(null), null);
  assert.strictEqual(sanitizeBarcode(undefined), null);
  assert.strictEqual(sanitizeBarcode(""), null);
  assert.strictEqual(sanitizeBarcode("   "), null);
});

test("Rejects barcode containing <script> tags", () => {
  assert.throws(
    () => sanitizeBarcode("<script>alert(1)</script>"),
    (err) => err instanceof HttpError && err.statusCode === 400 && /invalid characters/i.test(err.message),
  );
});

test("Rejects barcode containing image onerror payload", () => {
  assert.throws(
    () => sanitizeBarcode('<img src=x onerror="alert(document.cookie)">'),
    (err) => err instanceof HttpError && err.statusCode === 400,
  );
});

test("Rejects barcode containing double quotes or attribute breakouts", () => {
  assert.throws(
    () => sanitizeBarcode('890123" onload="alert(1)'),
    (err) => err instanceof HttpError && err.statusCode === 400,
  );
  assert.throws(
    () => sanitizeBarcode('"><svg onload=alert(1)>'),
    (err) => err instanceof HttpError && err.statusCode === 400,
  );
});

test("Rejects barcode containing single quotes or event handlers", () => {
  assert.throws(
    () => sanitizeBarcode("1234' onfocus='alert(1)"),
    (err) => err instanceof HttpError && err.statusCode === 400,
  );
});

test("Rejects barcode containing backticks or shell/script syntax", () => {
  assert.throws(
    () => sanitizeBarcode("BAR`alert(1)`"),
    (err) => err instanceof HttpError && err.statusCode === 400,
  );
});

// ── 2. Product Fields Controller Normalization Tests ─────────────────────────
test("productFields allows valid product and normalizes fields", () => {
  const fields = productFields({
    name: "Basmati Rice 5kg",
    barcode: "8901030800000",
    price: "450",
  });
  assert.strictEqual(fields.name, "Basmati Rice 5kg");
  assert.strictEqual(fields.barcode, "8901030800000");
  assert.strictEqual(fields.price, 450);
});

test("productFields preserves retail names with quotes and ampersands", () => {
  const fields = productFields({
    name: "Ben & Jerry's Chocolate 500ml",
    barcode: "123456789012",
    price: "350",
  });
  assert.strictEqual(fields.name, "Ben & Jerry's Chocolate 500ml");
});

test("productFields rejects product with malicious barcode", () => {
  assert.throws(
    () =>
      productFields({
        name: "Test Item",
        barcode: '12345"><script>alert(1)</script>',
        price: "10",
      }),
    (err) => err instanceof HttpError && err.statusCode === 400,
  );
});

// ── 3. Frontend HTML Escaping & Attribute Neutralization Tests ────────────────
test("escapeHtml escapes HTML tags and script elements", () => {
  const payload = "<script>alert('pwned')</script>";
  const escaped = escapeHtml(payload);
  assert.strictEqual(escaped, "&lt;script&gt;alert(&#39;pwned&#39;)&lt;/script&gt;");
  assert.strictEqual(escaped.includes("<"), false);
  assert.strictEqual(escaped.includes(">"), false);
});

test("escapeHtml escapes double quotes preventing attribute breakout", () => {
  const payload = '890123" onload="fetch(\'/api/steal\')" data-dummy="';
  const escaped = escapeHtml(payload);
  assert.strictEqual(escaped.includes('"'), false);
  assert.strictEqual(escaped.includes("&quot;"), true);

  // When placed inside an HTML attribute string:
  const attrHtml = `<svg data-barcode="${escaped}" class="barcode-svg"></svg>`;
  // Verify it does NOT contain an unescaped onload attribute
  assert.strictEqual(attrHtml.includes(' onload="'), false);
});

test("escapeHtml safely handles null and undefined values", () => {
  assert.strictEqual(escapeHtml(null), "");
  assert.strictEqual(escapeHtml(undefined), "");
  assert.strictEqual(escapeHtml(0), "0");
  assert.strictEqual(escapeHtml(false), "false");
});

// ── 4. Label Card Markup Security Tests ───────────────────────────────────────
test("Stock labelCard escapes both name and barcode attribute", () => {
  const name = '<b onmouseover=alert("name-xss")>Apple</b>';
  const barcode = '12345" onfocus="alert(\'barcode-xss\')"';
  const mrp = "50";
  const price = "40";

  const labelCard = (n, b, m, p) => `
    <div class="label-card">
      <div class="product-name">${escapeHtml(n || "")}</div>
      <svg data-barcode="${escapeHtml(b || n || "")}" class="barcode-svg"></svg>
      <div class="price-row">
        ${m && parseFloat(m) > 0 ? `<span style="font-weight:800;font-size:13px;color:#888;">MRP <span class="mrp">&#8377;${parseFloat(m).toFixed(0)}</span></span>` : `<span></span>`}
        <span class="price">&#8377;${parseFloat(p || 0).toFixed(0)}</span>
      </div>
    </div>`;

  const rendered = labelCard(name, barcode, mrp, price);

  // Verify dangerous tags and event handlers are neutralized
  assert.strictEqual(rendered.includes("<b onmouseover"), false);
  assert.strictEqual(rendered.includes("&lt;b onmouseover"), true);
  assert.strictEqual(rendered.includes('" onfocus="'), false);
  assert.strictEqual(rendered.includes('&quot; onfocus='), true);
});

test("cleanSvg removes any injected script tags or event handlers from SVG outerHTML", () => {
  const dirtySvg = '<svg width="100"><script>alert(1)</script><rect onload="alert(2)" width="10" height="10"/></svg>';
  const cleaned = cleanSvg(dirtySvg);
  assert.strictEqual(cleaned.includes("<script>"), false);
  assert.strictEqual(cleaned.includes("onload="), false);
  assert.strictEqual(cleaned.startsWith("<svg"), true);
});

console.log(`\nAll ${passed} Barcode Label XSS & Input Sanitization tests passed successfully! ✔`);
