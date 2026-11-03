const assert = require("assert");
const { PassThrough } = require("stream");

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
  for (const format of ["thermal58", "thermal80"]) {
    const receipt = await createInvoicePdf(format, ["\u0ba4\u0bae\u0bbf\u0bb4\u0bcd \u20b9 10"]);
    assert(receipt.startsWith("%PDF-"));
    assert(receipt.includes("NotoSansTamil"), `${format} should embed the Tamil and rupee font`);
  }
  console.log("Invoice PDF tests passed: rupee symbol and Indian-language fonts render in A4 and thermal formats.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
