const assert = require("assert");
const { PassThrough } = require("stream");
const zlib = require("zlib");

let businessName = "SuperMart";
const settingsPath = require.resolve("../utils/settings");
require.cache[settingsPath] = {
  id: settingsPath,
  filename: settingsPath,
  loaded: true,
  exports: {
    getShopSettings: async () => ({
      currencySymbol: "\u20b9",
      businessName,
      timezoneOffsetMinutes: 330,
    }),
  },
};

const { generateInvoice } = require("../controllers/invoiceController");

const extractPdfText = (rawString) => {
  const buf = Buffer.from(rawString, "latin1");
  let pos = 0, text = "";
  while ((pos = buf.indexOf(Buffer.from("stream\n"), pos)) !== -1) {
    const start = pos + 7;
    const end = buf.indexOf(Buffer.from("\nendstream"), start);
    if (end === -1) break;
    try {
      const dec = zlib.inflateSync(buf.slice(start, end)).toString("latin1");
      const tjText = dec.replace(/\[([\s\S]*?)\]\s*TJ/g, (_, inner) => {
        const hexes = inner.match(/<([0-9a-fA-F]+)>/g) || [];
        return hexes.map((h) => Buffer.from(h.slice(1, -1), "hex").toString("latin1")).join("");
      });
      text += " " + tjText;
    } catch {}
    pos = end + 10;
  }
  return text;
};

const createInvoicePdf = async (format, itemNames, name = "SuperMart") => {
  businessName = name;
  const response = new PassThrough();
  const chunks = [];
  response.on("data", (chunk) => chunks.push(chunk));
  const completed = new Promise((resolve, reject) => {
    response.on("end", resolve);
    response.on("error", reject);
  });
  response.setHeader = () => {};

  const bill = {
    billNumber: "TEST-1",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    items: itemNames.map((productName) => ({
      productName,
      hsnCode: "1006",
      quantity: 1,
      unitPrice: 10,
      totalPrice: 10,
    })),
    subtotal: 10,
    totalAmount: 10,
    taxAmount: 0,
    payments: [],
  };
  await generateInvoice(
    {
      db: { Bill: { findByPk: async () => ({ get: () => bill, billNumber: bill.billNumber }) } },
      params: { id: 1 },
      query: { format },
    },
    response,
    (error) => {
      throw error;
    },
  );
  await completed;
  return Buffer.concat(chunks).toString("latin1");
};

const run = async () => {
  const scripts = [
    ["Tamil", "\u0ba4\u0bae\u0bbf\u0bb4\u0bcd"],
    ["Devanagari", "\u0939\u093f\u0928\u094d\u0926\u0940"],
    ["Bengali", "\u09ac\u09be\u0982\u09b2\u09be"],
    ["Gujarati", "\u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0"],
    ["AnekGurmukhi", "\u0a2a\u0a70\u0a1c\u0a3e\u0a2c\u0a40"],
    ["Kannada", "\u0c95\u0ca8\u0ccd\u0ca8\u0ca1"],
    ["Malayalam", "\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02"],
    ["MeeteiMayek", "\uabc0\uabc1\uabc2"],
    ["Oriya", "\u0b13\u0b21\u0b3c\u0b3f\u0b06"],
    ["Tamil", "Rice \u20b9 10"],
    ["Telugu", "\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41"],
    ["Arabic", "\u0627\u0631\u062f\u0648"],
  ];
  const pdf = await createInvoicePdf("a4", scripts.map(([, name]) => name), "\u0ba4\u0bae\u0bbf\u0bb4\u0bcd Mart");
  assert(pdf.startsWith("%PDF-"));
  for (const [script] of scripts) {
    const fontName = script === "AnekGurmukhi" ? script : `NotoSans${script}`;
    assert(pdf.includes(fontName), `Missing embedded ${script} font`);
  }
  assert(pdf.includes("NotoSansTamil-Bold"), "Bold Tamil business name should use an embedded Tamil font");

  const rupeePdf = await createInvoicePdf("a4", ["Rice \u20b9 10"]);
  assert(rupeePdf.includes("NotoSansTamil"), "The rupee sign should use an embedded font instead of a text substitution");
  const a4Text = extractPdfText(rupeePdf);
  assert(a4Text.includes("1006"), "A4 PDF should include HSN code 1006");
  assert(a4Text.includes("Amount Chargeable (in words)"), "A4 PDF should include Amount Chargeable (in words)");
  assert(a4Text.includes("Rupees Ten Only"), "A4 PDF should include amount in words text");

  for (const format of ["thermal58", "thermal80"]) {
    const receipt = await createInvoicePdf(format, ["\u0ba4\u0bae\u0bbf\u0bb4\u0bcd \u20b9 10"]);
    assert(receipt.startsWith("%PDF-"));
    assert(receipt.includes("NotoSansTamil"), `${format} should embed the Tamil and rupee font`);
    const thermalText = extractPdfText(receipt);
    assert(thermalText.includes("1006"), `${format} should include HSN code 1006`);
    assert(thermalText.includes("Amount in words"), `${format} should include Amount in words`);
    assert(thermalText.includes("Rupees Ten Only"), `${format} should include amount in words text`);
  }
  console.log("Invoice PDF tests passed: HSN code, amount-in-words, rupee symbol and Indian-language fonts render in A4 and thermal formats.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
