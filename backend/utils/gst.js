// GSTIN state codes used in the first two characters of an Indian GSTIN.
const GST_STATES = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
  "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
  "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "28": "Andhra Pradesh",
  "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
  "34": "Puducherry", "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh",
  "38": "Ladakh", "97": "Other Territory", "25": "Daman and Diu",
};

const BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_PATTERN = /^(0[1-9]|1[0-9]|2[0-9]|3[0-8]|97)[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const normalizeGstin = (value) => String(value || "").trim().toUpperCase();

const gstinCheckDigit = (gstin) => {
  let sum = 0;
  let factor = 2;
  for (let i = gstin.length - 2; i >= 0; i -= 1) {
    const product = BASE36.indexOf(gstin[i]) * factor;
    sum += Math.floor(product / 36) + (product % 36);
    factor = factor === 2 ? 1 : 2;
  }
  return BASE36[(36 - (sum % 36)) % 36];
};

const isValidGstin = (value) => {
  const gstin = normalizeGstin(value);
  return GSTIN_PATTERN.test(gstin) && gstinCheckDigit(gstin) === gstin[14];
};

const stateCodeFromGstin = (value) => {
  const gstin = normalizeGstin(value);
  return isValidGstin(gstin) ? gstin.slice(0, 2) : null;
};

// Used only as a compatibility fallback for shops created before GSTIN was configured.
// State names are resolved to GST codes once; billing decisions compare codes, never text.
const STATE_ALIASES = {
  "andaman and nicobar islands": "35", "andaman & nicobar islands": "35", "andhra pradesh": "37",
  "arunachal pradesh": "12", assam: "18", bihar: "10", chandigarh: "04", chhattisgarh: "22",
  "dadra and nagar haveli and daman and diu": "26", delhi: "07", "nct of delhi": "07", goa: "30",
  gujarat: "24", haryana: "06", "himachal pradesh": "02", "jammu and kashmir": "01", jharkhand: "20",
  karnataka: "29", kerala: "32", ladakh: "38", lakshadweep: "31", "madhya pradesh": "23",
  maharashtra: "27", manipur: "14", meghalaya: "17", mizoram: "15", nagaland: "13", odisha: "21",
  orissa: "21", puducherry: "34", pondicherry: "34", punjab: "03", rajasthan: "08", sikkim: "11",
  "tamil nadu": "33", telangana: "36", tripura: "16", uttarakhand: "05", uttaranchal: "05",
  "uttar pradesh": "09", "west bengal": "19", "daman and diu": "25", "dadra and nagar haveli": "26",
};

const stateCodeFromName = (value) => STATE_ALIASES[String(value || "").trim().toLowerCase()] || null;
const stateNameFromCode = (code) => GST_STATES[code] || null;

module.exports = { normalizeGstin, isValidGstin, stateCodeFromGstin, stateCodeFromName, stateNameFromCode };
