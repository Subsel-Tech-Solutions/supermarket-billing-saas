// controllers/invoiceController.js — PDF invoice (thermal 58mm / 80mm or A4) from shop settings
const PDFDocument = require("pdfkit");
const path = require("path");
const { asyncHandler, HttpError } = require("../utils/helpers");
const { getShopSettings } = require("../utils/settings");

const money = (v, sym) => `${sym}${(Number(v) || 0).toFixed(2)}`;
const pdfSymbol = (s) => s || "₹";

const invoiceScriptFonts = [
  ["arabic", "noto-sans-arabic", "arabic"],
  ["bengali", "noto-sans-bengali", "bengali"],
  ["devanagari", "noto-sans-devanagari", "devanagari"],
  ["gujarati", "noto-sans-gujarati", "gujarati"],
  ["gurmukhi", "anek-gurmukhi", "gurmukhi"],
  ["kannada", "noto-sans-kannada", "kannada"],
  ["malayalam", "noto-sans-malayalam", "malayalam"],
  ["meetei", "noto-sans-meetei-mayek", "meetei-mayek"],
  ["oriya", "noto-sans-oriya", "oriya"],
  ["tamil", "noto-sans-tamil", "tamil"],
  ["telugu", "noto-sans-telugu", "telugu"],
];

const scriptForCodePoint = (codePoint) => {
  if ((codePoint >= 0x0600 && codePoint <= 0x08ff)) return "arabic";
  if ((codePoint >= 0x0980 && codePoint <= 0x09ff)) return "bengali";
  if ((codePoint >= 0x0900 && codePoint <= 0x097f) || (codePoint >= 0x1cd0 && codePoint <= 0x1cff) || (codePoint >= 0xa8e0 && codePoint <= 0xa8ff)) return "devanagari";
  if (codePoint >= 0x0a00 && codePoint <= 0x0a7f) return "gurmukhi";
  if (codePoint >= 0x0a80 && codePoint <= 0x0aff) return "gujarati";
  if (codePoint >= 0x0b00 && codePoint <= 0x0b7f) return "oriya";
  if (codePoint >= 0x0b80 && codePoint <= 0x0bff) return "tamil";
  if (codePoint >= 0x0c00 && codePoint <= 0x0c7f) return "telugu";
  if (codePoint >= 0x0c80 && codePoint <= 0x0cff) return "kannada";
  if (codePoint >= 0x0d00 && codePoint <= 0x0d7f) return "malayalam";
  if ((codePoint >= 0xabc0 && codePoint <= 0xabff) || (codePoint >= 0xaae0 && codePoint <= 0xaaff)) return "meetei";
  if (codePoint === 0x20b9) return "tamil";
  return null;
};

const registerInvoiceFonts = (doc) => {
  const fontNames = {};
  for (const [script, packageName, subset] of invoiceScriptFonts) {
    fontNames[script] = {};
    for (const [weight, weightName] of [[400, "Regular"], [700, "Bold"]]) {
      const name = `Invoice${script}${weightName}`;
      const file = `${packageName}-${subset}-${weight}-normal.woff`;
      const fontPath = path.join(__dirname, "..", "node_modules", "@fontsource", packageName, "files", file);
      doc.registerFont(name, fontPath);
      fontNames[script][weight] = name;
    }
  }

  const text = doc.text.bind(doc);
  doc.text = function (value, x, y, options) {
    if (typeof value !== "string") return text(value, x, y, options);

    const bold = /bold/i.test(this._font?.name || "");
    const weight = bold ? 700 : 400;
    const runs = [];
    for (const character of value) {
      let script = scriptForCodePoint(character.codePointAt(0));
      if (!script && /[\u200c\u200d]/u.test(character) && runs.length) script = runs[runs.length - 1].script;
      const font = script ? fontNames[script][weight] : null;
      const last = runs[runs.length - 1];
      if (last && last.font === font) last.text += character;
      else runs.push({ text: character, font, script });
    }
    if (!runs.some((run) => run.font)) return text(value, x, y, options);

    const suppliedOptions = typeof x === "object" && x !== null ? x : options || {};
    const startX = typeof x === "number" ? x : suppliedOptions.x ?? this.x;
    const drawOptions = { ...suppliedOptions };
    if (drawOptions.width === undefined && drawOptions.lineBreak !== false) {
      drawOptions.width = this.page.width - startX - this.page.margins.right;
    }
    const originalFont = this._font?.name || "Helvetica";
    runs.forEach((run, index) => {
      this.font(run.font || originalFont);
      const runOptions = index === 0 ? { ...drawOptions } : {};
      runOptions.continued = index < runs.length - 1 || suppliedOptions.continued === true;
      if (index === 0) text(run.text, x, y, runOptions);
      else text(run.text, undefined, undefined, runOptions);
    });
    this.font(originalFont);
    return this;
  };
};

const fmtDate = (d, offset) => {
  const x = new Date(new Date(d).getTime() + offset * 60000);
  const p = (n) => String(n).padStart(2, "0");
  let h = x.getUTCHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${p(x.getUTCDate())}-${p(x.getUTCMonth() + 1)}-${x.getUTCFullYear()} ${p(h)}:${p(x.getUTCMinutes())} ${ampm}`;
};

const drawLogo = (doc, logo, x, y, size) => {
  if (!logo || !/^data:image\/(png|jpe?g);base64,/.test(logo)) return false;
  try {
    doc.image(Buffer.from(logo.split(",")[1], "base64"), x, y, { fit: [size, size] });
    return true;
  } catch {
    return false;
  }
};

const thermalInvoice = (doc, bill, s, width) => {
  const margin = width < 200 ? 8 : 12;
  const cw = width - margin * 2;
  const lx = margin;
  const sym = pdfSymbol(s.currencySymbol);
  const small = width < 200 ? 6.5 : 7;

  const center = (text, size = small, bold = false) => {
    doc.fontSize(size).font(bold ? "Helvetica-Bold" : "Helvetica").text(text, lx, doc.y, { width: cw, align: "center" });
  };
  const line = (dash = false) => {
    doc.moveDown(0.25);
    const y = doc.y;
    if (dash) doc.moveTo(lx, y).lineTo(lx + cw, y).dash(2, { space: 2 }).stroke().undash();
    else doc.moveTo(lx, y).lineTo(lx + cw, y).stroke();
    doc.moveDown(0.3);
  };
  // Label and value are drawn at the same y. PDFKit leaves doc.y wherever the LAST text
  // call ended, so an empty value (Cashier, "Items: n  Qty: n") pulled doc.y back to the
  // top of the row and the next row printed on top of it. Keep the lower of the two ends.
  // The two columns also used to overlap sideways (0.6 wide starting at 0.4) — now 0.52/0.46.
  const row = (label, value, bold = false, size = small) => {
    const y = doc.y;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);
    doc.text(label, lx, y, { width: cw * 0.52 });
    const afterLabel = doc.y;
    let afterValue = y;
    if (value !== "" && value !== null && value !== undefined) {
      doc.text(String(value), lx + cw * 0.54, y, { width: cw * 0.46, align: "right" });
      afterValue = doc.y;
    }
    doc.y = Math.max(afterLabel, afterValue);
    doc.moveDown(0.25);
  };

  if (s.showLogoOnReceipt && s.logo) {
    const size = 40;
    if (drawLogo(doc, s.logo, lx + (cw - size) / 2, doc.y, size)) doc.y += size + 4;
  }
  center(s.businessName || "INVOICE", width < 200 ? 12 : 14, true);
  if (s.receiptHeader) center(s.receiptHeader);
  const addr = [s.address, s.city, s.state, s.pincode].filter(Boolean).join(", ");
  if (addr) center(addr);
  if (s.phone) center(`Ph: ${s.phone}`);
  if (s.gstNumber) center(`GSTIN: ${s.gstNumber}`);
  if (s.fssaiNumber) center(`FSSAI: ${s.fssaiNumber}`);
  line();
  center(bill.taxAmount > 0 ? "TAX INVOICE" : "INVOICE", small + 1, true);
  row(`Bill: ${bill.billNumber}`, fmtDate(bill.createdAt, s.timezoneOffsetMinutes));
  if (bill.customerName || bill.customerPhone) row(`Customer: ${bill.customerName || "-"}`, bill.customerPhone || "");
  if (s.showCashierOnReceipt && bill.cashierName) row(`Cashier: ${bill.cashierName}`, "");
  line(true);

  // Items table
  const cols = width < 200
    ? { name: lx, qty: lx + cw * 0.5, rate: lx + cw * 0.62, amt: lx + cw * 0.8 }
    : { name: lx, qty: lx + cw * 0.46, rate: lx + cw * 0.58, amt: lx + cw * 0.78 };
  const colW = { qty: cw * 0.12, rate: cw * 0.2, amt: cw * 0.22 };
  doc.font("Helvetica-Bold").fontSize(small);
  let y = doc.y;
  doc.text("ITEM", cols.name, y, { width: cols.qty - lx - 2 });
  doc.text("QTY", cols.qty, y, { width: colW.qty, align: "center" });
  doc.text("RATE", cols.rate, y, { width: colW.rate, align: "right" });
  doc.text("AMT", cols.amt, y, { width: colW.amt, align: "right" });
  doc.moveDown(0.3);
  line();

  doc.font("Helvetica").fontSize(small);
  let savings = 0;
  (bill.items || []).forEach((item) => {
    y = doc.y;
    const q = Number(item.quantity);
    const qtyTxt = Number.isInteger(q) ? String(q) : q.toFixed(3).replace(/0+$/, "");
    doc.text(item.productName, cols.name, y, { width: cols.qty - lx - 2 });
    const after = doc.y;
    doc.text(qtyTxt, cols.qty, y, { width: colW.qty, align: "center" });
    doc.text(Number(item.unitPrice).toFixed(2), cols.rate, y, { width: colW.rate, align: "right" });
    doc.text(Number(item.totalPrice).toFixed(2), cols.amt, y, { width: colW.amt, align: "right" });
    doc.y = Math.max(after, doc.y);
    const extras = [];
    if (s.showMrpOnReceipt && item.mrp && Number(item.mrp) > Number(item.unitPrice)) extras.push(`MRP ${Number(item.mrp).toFixed(2)}`);
    if (Number(item.taxRate) > 0) extras.push(`${s.taxLabel || "GST"} ${Number(item.taxRate)}%`);
    if (Number(item.discount) > 0) extras.push(`Disc ${Number(item.discount).toFixed(2)}`);
    if (Number(item.returnedQty) > 0) extras.push(`Returned ${Number(item.returnedQty)}`);
    if (extras.length) {
      doc.fontSize(small - 1).fillColor("#555").text(extras.join(" · "), cols.name, doc.y, { width: cw });
      doc.fillColor("#000").fontSize(small);
    }
    if (item.mrp && Number(item.mrp) > Number(item.unitPrice)) savings += (Number(item.mrp) - Number(item.unitPrice)) * q;
    savings += Number(item.discount) || 0;
    doc.moveDown(0.35);
  });
  line(true);

  const itemCount = (bill.items || []).reduce((a, i) => a + Number(i.quantity), 0);
  row(`Items: ${(bill.items || []).length}  Qty: ${Number(itemCount.toFixed(3))}`, "");
  row("Subtotal", money(bill.subtotal, sym));
  if (Number(bill.itemDiscount) > 0) row("Item discount", `-${money(bill.itemDiscount, sym)}`);
  if (Number(bill.discountAmount) > 0) row("Bill discount", `-${money(bill.discountAmount, sym)}`);
  if (Number(bill.loyaltyDiscount) > 0) row(`Points redeemed (${Number(bill.loyaltyRedeemed)})`, `-${money(bill.loyaltyDiscount, sym)}`);
  if (Number(bill.taxAmount) > 0) {
    if (s.showTaxBreakupOnReceipt) {
      row("Taxable value", money(bill.taxableAmount, sym));
      row("CGST", money(bill.cgst, sym));
      row("SGST", money(bill.sgst, sym));
    } else {
      row(bill.pricesIncludeTax ? `${s.taxLabel || "GST"} (incl.)` : s.taxLabel || "GST", money(bill.taxAmount, sym));
    }
  }
  if (Number(bill.roundOff) !== 0) row("Round off", money(bill.roundOff, sym));
  line();
  row("TOTAL", money(bill.totalAmount, sym), true, small + 3);
  line();

  (bill.payments || []).forEach((p) => row(`Paid by ${String(p.method).toUpperCase()}`, money(p.amount, sym)));
  if (Number(bill.changeReturned) > 0) row("Change returned", money(bill.changeReturned, sym));
  if (Number(bill.dueAmount) > 0) row("BALANCE DUE", money(bill.dueAmount, sym), true);
  if (Number(bill.returnedAmount) > 0) row("Returned amount", `-${money(bill.returnedAmount, sym)}`);
  if (Number(bill.loyaltyEarned) > 0) row("Points earned", String(Number(bill.loyaltyEarned)));
  if (bill.status === "cancelled") {
    doc.moveDown(0.3);
    center("*** CANCELLED ***", small + 3, true);
  }

  if (s.showSavingsOnReceipt && savings > 0.009) {
    doc.moveDown(0.3);
    center(`You saved ${money(savings, sym)} today!`, small + 1, true);
  }
  line(true);
  if (s.receiptFooter) center(s.receiptFooter, small, true);
  if (s.termsAndConditions) {
    doc.moveDown(0.2);
    center(s.termsAndConditions, small - 1);
  }
};

const a4Invoice = (doc, bill, s) => {
  const sym = pdfSymbol(s.currencySymbol);
  const L = 40;
  const W = 515;
  let top = 40;
  if (s.logo && drawLogo(doc, s.logo, L, top, 60)) {
    doc.fontSize(18).font("Helvetica-Bold").text(s.businessName, L + 72, top);
  } else {
    doc.fontSize(20).font("Helvetica-Bold").text(s.businessName, L, top);
  }
  doc.fontSize(9).font("Helvetica");
  const addr = [s.address, s.city, s.state, s.pincode].filter(Boolean).join(", ");
  const infoX = s.logo ? L + 72 : L;
  if (addr) doc.text(addr, infoX, doc.y, { width: 300 });
  if (s.phone || s.email) doc.text([s.phone && `Ph: ${s.phone}`, s.email].filter(Boolean).join("  |  "), infoX);
  if (s.gstNumber) doc.text(`GSTIN: ${s.gstNumber}`, infoX);
  if (s.fssaiNumber) doc.text(`FSSAI: ${s.fssaiNumber}`, infoX);

  doc.fontSize(16).font("Helvetica-Bold").text(Number(bill.taxAmount) > 0 ? "TAX INVOICE" : "INVOICE", 350, top, { width: 205, align: "right" });
  doc.fontSize(9).font("Helvetica");
  doc.text(`Invoice No: ${bill.billNumber}`, 350, top + 24, { width: 205, align: "right" });
  doc.text(`Date: ${fmtDate(bill.createdAt, s.timezoneOffsetMinutes)}`, 350, doc.y, { width: 205, align: "right" });
  if (bill.cashierName) doc.text(`Cashier: ${bill.cashierName}`, 350, doc.y, { width: 205, align: "right" });

  top = Math.max(doc.y, 130) + 10;
  doc.rect(L, top, W, 40).stroke("#999");
  doc.fillColor("#000").fontSize(9).font("Helvetica-Bold").text("Bill To:", L + 8, top + 7);
  doc.font("Helvetica").text(`${bill.customerName || "Walk-in customer"}${bill.customerPhone ? `  ·  ${bill.customerPhone}` : ""}`, L + 8, top + 20);

  let y = top + 55;
  const cols = [
    ["#", 22, "left"],
    ["Item", 170, "left"],
    ["HSN", 50, "left"],
    ["Qty", 45, "right"],
    ["Rate", 60, "right"],
    ["Disc", 50, "right"],
    [s.taxLabel || "GST", 45, "right"],
    ["Amount", 73, "right"],
  ];
  const header = () => {
    doc.rect(L, y, W, 18).fill("#eeeeee");
    doc.fillColor("#000").font("Helvetica-Bold").fontSize(8.5);
    let x = L + 4;
    cols.forEach(([h, w, a]) => {
      doc.text(h, x, y + 5, { width: w - 6, align: a });
      x += w;
    });
    y += 22;
  };
  header();
  doc.font("Helvetica").fontSize(8.5);
  (bill.items || []).forEach((it, idx) => {
    if (y > 740) {
      doc.addPage();
      y = 40;
      header();
      doc.font("Helvetica").fontSize(8.5);
    }
    const vals = [
      String(idx + 1),
      it.productName,
      it.hsnCode || "-",
      `${Number(it.quantity)} ${it.unit || ""}`.trim(),
      Number(it.unitPrice).toFixed(2),
      Number(it.discount) > 0 ? Number(it.discount).toFixed(2) : "-",
      `${Number(it.taxRate)}%`,
      Number(it.totalPrice).toFixed(2),
    ];
    let x = L + 4;
    let rowH = 14;
    cols.forEach(([, w, a], i) => {
      const h = doc.heightOfString(vals[i], { width: w - 6 });
      rowH = Math.max(rowH, h + 4);
      doc.text(vals[i], x, y, { width: w - 6, align: a });
      x += w;
    });
    y += rowH;
    doc.moveTo(L, y - 2).lineTo(L + W, y - 2).stroke("#dddddd");
  });

  y += 8;
  const tRow = (label, value, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 9);
    doc.text(label, 330, y, { width: 130 });
    doc.text(value, 460, y, { width: 95, align: "right" });
    y += bold ? 18 : 14;
  };
  tRow("Subtotal", money(bill.subtotal, sym));
  if (Number(bill.itemDiscount) > 0) tRow("Item discount", `-${money(bill.itemDiscount, sym)}`);
  if (Number(bill.discountAmount) > 0) tRow("Bill discount", `-${money(bill.discountAmount, sym)}`);
  if (Number(bill.loyaltyDiscount) > 0) tRow("Loyalty discount", `-${money(bill.loyaltyDiscount, sym)}`);
  if (Number(bill.taxAmount) > 0) {
    tRow("Taxable value", money(bill.taxableAmount, sym));
    tRow("CGST", money(bill.cgst, sym));
    tRow("SGST", money(bill.sgst, sym));
  }
  if (Number(bill.roundOff) !== 0) tRow("Round off", money(bill.roundOff, sym));
  tRow("GRAND TOTAL", money(bill.totalAmount, sym), true);
  (bill.payments || []).forEach((p) => tRow(`Paid (${String(p.method).toUpperCase()})`, money(p.amount, sym)));
  if (Number(bill.dueAmount) > 0) tRow("Balance due", money(bill.dueAmount, sym), true);
  if (bill.status === "cancelled") tRow("STATUS", "CANCELLED", true);

  y = Math.max(y + 20, 700);
  if (y > 780) {
    doc.addPage();
    y = 60;
  }
  doc.font("Helvetica").fontSize(8.5).fillColor("#333");
  if (s.termsAndConditions) doc.text(`Terms: ${s.termsAndConditions}`, L, y, { width: 300 });
  doc.text("Authorised Signatory", 400, y + 30, { width: 155, align: "right" });
  if (s.receiptFooter) doc.text(s.receiptFooter, L, y + 50, { width: W, align: "center" });
};

// GET /api/bills/:id/invoice?format=a4|thermal58|thermal80
const generateInvoice = asyncHandler(async (req, res) => {
  const db = req.db;
  const bill = await db.Bill.findByPk(req.params.id, { include: [{ model: db.BillItem, as: "items" }] });
  if (!bill) throw new HttpError(404, "Bill not found");
  const s = await getShopSettings(db);
  const format = ["a4", "thermal58", "thermal80"].includes(req.query.format) ? req.query.format : s.receiptFormat;
  const plain = bill.get({ plain: true });

  let doc;
  if (format === "a4") {
    doc = new PDFDocument({ size: "A4", margin: 40 });
  } else {
    const width = format === "thermal58" ? 164 : 227;
    const lineCount = (plain.items || []).length;
    const height = 430 + lineCount * 30 + (s.logo ? 50 : 0) + (plain.payments || []).length * 12 + (s.termsAndConditions ? 30 : 0);
    doc = new PDFDocument({ size: [width, Math.max(420, height)], margins: { top: 10, bottom: 10, left: 8, right: 8 } });
  }

  registerInvoiceFonts(doc);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=invoice-${bill.billNumber}.pdf`);
  doc.pipe(res);
  if (format === "a4") a4Invoice(doc, plain, s);
  else thermalInvoice(doc, plain, s, format === "thermal58" ? 164 : 227);
  doc.end();
});

module.exports = { generateInvoice };
