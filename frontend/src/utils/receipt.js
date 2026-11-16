// src/utils/receipt.js — prints a thermal / A4 receipt directly from the browser
import { escapeHtml as e, num, formatQty, amountToWords } from "./helpers";

const money = (v, sym) => `${sym}${num(v).toFixed(2)}`;

// The logo is a data URL that goes straight into src="…". The server only accepts strict
// base64 rasters, but a value stored by an older build could still contain a quote and
// break out of the attribute, so it is re-checked here before being printed.
const safeLogo = (logo) => {
  const s = String(logo || "").trim();
  return /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(s) ? s : "";
};

export const buildReceiptHtml = (bill, s = {}) => {
  const sym = s.currencySymbol || "₹";
  const width = s.receiptFormat === "thermal58" ? "58mm" : s.receiptFormat === "a4" ? "190mm" : "80mm";
  const fs = s.receiptFormat === "thermal58" ? 10 : 12;
  const addr = [s.address, s.city, s.state, s.pincode].filter(Boolean).join(", ");
  let savings = 0;
  const rows = (bill.items || [])
    .map((it) => {
      const q = num(it.quantity);
      if (num(it.mrp) > num(it.unitPrice)) savings += (num(it.mrp) - num(it.unitPrice)) * q;
      savings += num(it.discount);
      const extra = [
        it.hsnCode ? `HSN: ${e(it.hsnCode)}` : "",
        s.showMrpOnReceipt && num(it.mrp) > num(it.unitPrice) ? `MRP ${num(it.mrp).toFixed(2)}` : "",
        num(it.taxRate) > 0 ? `${e(s.taxLabel || "GST")} ${num(it.taxRate)}%` : "",
        num(it.discount) > 0 ? `Disc ${num(it.discount).toFixed(2)}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `<tr><td colspan="4" class="name">${e(it.productName)}${extra ? `<div class="sub">${extra}</div>` : ""}</td></tr>
        <tr><td></td><td class="r">${e(formatQty(q, it.unit))}</td><td class="r">${num(it.unitPrice).toFixed(2)}</td><td class="r">${num(it.totalPrice).toFixed(2)}</td></tr>`;
    })
    .join("");
  const line = (label, value, cls = "") => `<tr class="${cls}"><td>${label}</td><td class="r">${value}</td></tr>`;
  const payments = (bill.payments || []).filter((p) => !p.settlement);
  const date = new Date(bill.createdAt || Date.now()).toLocaleString(s.locale || "en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${e(bill.billNumber)}</title>
<style>
  @page { size: ${s.receiptFormat === "a4" ? "A4" : `${width} auto`}; margin: 4mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; font-size: ${fs}px; color: #000; width: ${width}; margin: 0 auto; padding: 4px; }
  .c { text-align: center; } .r { text-align: right; } .b { font-weight: bold; }
  h1 { font-size: ${fs + 6}px; text-align: center; font-family: Arial, sans-serif; }
  .hr { border-top: 1px dashed #000; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  .name { font-weight: bold; padding-top: 3px; }
  .sub { font-weight: normal; font-size: ${fs - 2}px; }
  .total td { font-size: ${fs + 4}px; font-weight: bold; padding: 3px 0; }
  img { max-width: 60px; max-height: 60px; display: block; margin: 0 auto 4px; }
  .muted { font-size: ${fs - 1}px; }
</style></head><body>
  ${s.showLogoOnReceipt && safeLogo(s.logo) ? `<img src="${safeLogo(s.logo)}" alt="">` : ""}
  <h1>${e(s.businessName || "Invoice")}</h1>
  ${s.receiptHeader ? `<div class="c">${e(s.receiptHeader)}</div>` : ""}
  ${addr ? `<div class="c muted">${e(addr)}</div>` : ""}
  ${s.phone ? `<div class="c muted">Ph: ${e(s.phone)}</div>` : ""}
  ${s.gstNumber ? `<div class="c muted">GSTIN: ${e(s.gstNumber)}</div>` : ""}
  ${s.fssaiNumber ? `<div class="c muted">FSSAI: ${e(s.fssaiNumber)}</div>` : ""}
  <div class="hr"></div>
  <div class="c b">${num(bill.taxAmount) > 0 ? "TAX INVOICE" : "INVOICE"}</div>
  <table>
    ${line(`Bill: <b>${e(bill.billNumber)}</b>`, e(date))}
    ${bill.customerName || bill.customerPhone ? line(`Customer: ${e(bill.customerName || "-")}`, e(bill.customerPhone || "")) : ""}
    ${bill.customerGstNumber ? line(`Customer GSTIN: ${e(bill.customerGstNumber)}`, "") : ""}
    ${bill.interState && bill.placeOfSupply ? line(`Place of supply: ${e(bill.placeOfSupply)}`, "") : ""}
    ${s.showCashierOnReceipt && bill.cashierName ? line(`Cashier: ${e(bill.cashierName)}`, "") : ""}
  </table>
  <div class="hr"></div>
  <table><tr class="b"><td>Item</td><td class="r">Qty</td><td class="r">Rate</td><td class="r">Amt</td></tr>${rows}</table>
  <div class="hr"></div>
  <table>
    ${line(`Items: ${(bill.items || []).length}`, "")}
    ${line("Subtotal", money(bill.subtotal, sym))}
    ${num(bill.itemDiscount) > 0 ? line("Item discount", "-" + money(bill.itemDiscount, sym)) : ""}
    ${num(bill.discountAmount) > 0 ? line("Bill discount", "-" + money(bill.discountAmount, sym)) : ""}
    ${num(bill.loyaltyDiscount) > 0 ? line(`Points redeemed (${num(bill.loyaltyRedeemed)})`, "-" + money(bill.loyaltyDiscount, sym)) : ""}
    ${num(bill.taxAmount) > 0 && s.showTaxBreakupOnReceipt
      ? line("Taxable value", money(bill.taxableAmount, sym)) +
        (bill.interState
          ? line("IGST", money(bill.igst ?? bill.taxAmount, sym))
          : line("CGST", money(bill.cgst, sym)) + line("SGST", money(bill.sgst, sym)))
      : num(bill.taxAmount) > 0 ? line(`${e(s.taxLabel || "GST")}${bill.pricesIncludeTax ? " (incl.)" : ""}`, money(bill.taxAmount, sym)) : ""}
    ${num(bill.roundOff) !== 0 ? line("Round off", money(bill.roundOff, sym)) : ""}
  </table>
  <div class="hr"></div>
  <table>${line("TOTAL", money(bill.totalAmount, sym), "total")}</table>
  <div class="muted c" style="font-style:italic;margin:3px 0 5px;font-size:${fs - 1}px;">Amount in words: ${e(amountToWords(bill.totalAmount, s.currencyName || "Rupees", s.currencySubunit || "Paise"))}</div>
  <div class="hr"></div>
  <table>
    ${payments.map((p) => line(`Paid (${e(String(p.method).toUpperCase())})`, money(p.amount, sym))).join("")}
    ${num(bill.changeReturned) > 0 ? line("Change", money(bill.changeReturned, sym)) : ""}
    ${num(bill.dueAmount) > 0 ? line("<b>BALANCE DUE</b>", `<b>${money(bill.dueAmount, sym)}</b>`) : ""}
    ${num(bill.loyaltyEarned) > 0 ? line("Points earned", num(bill.loyaltyEarned)) : ""}
  </table>
  ${bill.status === "cancelled" ? `<div class="c b" style="margin-top:6px">*** CANCELLED ***</div>` : ""}
  ${s.showSavingsOnReceipt && savings > 0.009 ? `<div class="hr"></div><div class="c b">You saved ${money(savings, sym)} today!</div>` : ""}
  <div class="hr"></div>
  ${s.receiptFooter ? `<div class="c b">${e(s.receiptFooter)}</div>` : ""}
  ${s.termsAndConditions ? `<div class="c muted" style="margin-top:3px">${e(s.termsAndConditions)}</div>` : ""}
</body></html>`;
};

/**
 * Print through a hidden iframe rather than a pop-up window.
 *
 * A pop-up is blocked whenever the print is not a direct result of a click — which is
 * exactly the case for "auto print after sale" — and the blocked window is silent, so the
 * cashier hands over goods believing a receipt printed. An iframe is same-document, so it
 * is never blocked and never steals focus from the barcode field.
 */
export const printReceipt = (bill, settings) => {
  if (!bill) return false;
  const html = buildReceiptHtml(bill, settings);
  try {
    // Remove a frame left behind by a print dialog the user cancelled.
    document.getElementById("receipt-print-frame")?.remove();

    const frame = document.createElement("iframe");
    frame.id = "receipt-print-frame";
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;left:-9999px;top:-9999px;";
    document.body.appendChild(frame);

    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    const fire = () => {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } catch {
        /* dialog refused — the frame is cleaned up below either way */
      }
      // Keep the frame alive long enough for the dialog; some browsers print
      // asynchronously and tear-down too early produces a blank page.
      setTimeout(() => frame.remove(), 60000);
    };

    // Wait for the logo image to decode, otherwise the first print can omit it.
    if (doc.images.length) {
      let left = doc.images.length;
      let fired = false;
      const done = () => {
        left -= 1;
        if (left <= 0 && !fired) {
          fired = true;
          fire();
        }
      };
      Array.from(doc.images).forEach((img) => {
        if (img.complete) done();
        else {
          img.addEventListener("load", done);
          img.addEventListener("error", done);
        }
      });
      // Never hang on a broken image.
      setTimeout(() => {
        if (!fired) {
          fired = true;
          fire();
        }
      }, 1200);
    } else {
      setTimeout(fire, 120);
    }
    return true;
  } catch (err) {
    console.error("[SuperMart] print failed:", err);
    return false;
  }
};

/** Same mechanism for any other printable document (day closing, barcode labels). */
export const printHtml = (html) => {
  try {
    document.getElementById("doc-print-frame")?.remove();
    const frame = document.createElement("iframe");
    frame.id = "doc-print-frame";
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;left:-9999px;top:-9999px;";
    document.body.appendChild(frame);
    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } catch {
        /* ignore */
      }
      setTimeout(() => frame.remove(), 60000);
    }, 150);
    return true;
  } catch (err) {
    console.error("[SuperMart] print failed:", err);
    return false;
  }
};
