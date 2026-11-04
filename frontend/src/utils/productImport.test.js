import * as XLSX from "xlsx";
import { mapImportRow, mapSpreadsheetRows, parseProductCsv, parseProductSpreadsheet } from "./productImport";

test("maps common product column spellings and defaults quantity", () => {
  expect(
    mapImportRow({
      "Product Name": "  Rice  ",
      "Selling Price": 42.5,
      "Cost Price": 31,
      "Tax Rate": 5,
      HSN: "1006",
      "Net Qty": "5 kg",
    }),
  ).toEqual({
    name: "Rice",
    price: "42.5",
    costPrice: "31",
    quantity: "0",
    taxRate: "5",
    hsnCode: "1006",
    netQty: "5 kg",
  });
});

test("parses quoted CSV fields and excludes rows without a product name", () => {
  expect(parseProductCsv('Product Name,Price,Category\n"Rice, premium",42,"Staples, grains"\n,2,Other')).toEqual([
    { name: "Rice, premium", price: "42", quantity: "0", category: "Staples, grains" },
  ]);
});

test("maps spreadsheet row objects and drops empty product rows", () => {
  expect(mapSpreadsheetRows([{ Product: "Tea", Rate: 12 }, { Product: "", Rate: 5 }])).toEqual([
    { name: "Tea", price: "12", quantity: "0" },
  ]);
});

test("parses XLSX workbooks through the same product field mapping", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ "Product Name": "Oil", "Selling Price": 150, Qty: 4 }]), "Products");
  const contents = XLSX.write(workbook, { type: "binary", bookType: "xlsx" });

  expect(parseProductSpreadsheet(contents)).toEqual([{ name: "Oil", price: "150", quantity: "4" }]);
});
