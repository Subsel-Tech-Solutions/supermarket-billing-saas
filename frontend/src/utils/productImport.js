import * as XLSX from "xlsx";

const normalizeColumn = (name) => String(name).toLowerCase().replace(/[^a-z]/g, "");

export const mapImportRow = (row) => {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeColumn(key), value]));
  const value = (...keys) => {
    for (const key of keys) {
      const current = normalized[normalizeColumn(key)];
      if (current !== undefined && current !== null && String(current).trim() !== "") return String(current).trim();
    }
    return "";
  };
  const mapped = {
    name: value("name", "productname", "product", "item"),
    price: value("price", "sellingprice", "salesprice", "rate"),
    mrp: value("mrp"),
    costPrice: value("costprice", "cost", "purchaseprice"),
    quantity: value("quantity", "qty", "stock") || "0",
    category: value("category"),
    brand: value("brand"),
    unit: value("unit", "uom"),
    taxRate: value("taxrate", "gst", "gstrate", "tax"),
    hsnCode: value("hsncode", "hsn"),
    barcode: value("barcode", "ean", "upc"),
    netQty: value("netqty", "netquantity", "size"),
    reorderLevel: value("reorderlevel", "minstock"),
    expiryDate: value("expirydate", "expiry"),
    description: value("description", "desc"),
  };
  Object.keys(mapped).forEach((key) => {
    if (mapped[key] === "" && key !== "name" && key !== "price") delete mapped[key];
  });
  return mapped;
};

export const parseProductCsv = (contents) => {
  const workbook = XLSX.read(contents, { type: "string" });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  return mapSpreadsheetRows(XLSX.utils.sheet_to_json(worksheet, { defval: "" }));
};

export const mapSpreadsheetRows = (rows) => rows.map(mapImportRow).filter((row) => row.name && row.name.trim());

export const parseProductSpreadsheet = (contents) => {
  const workbook = XLSX.read(contents, { type: "binary" });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  return mapSpreadsheetRows(XLSX.utils.sheet_to_json(worksheet, { defval: "" }));
};
