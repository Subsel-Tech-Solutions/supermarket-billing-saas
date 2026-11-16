const assert = require("assert");
const { amountToWords, numberToIndianWords } = require("../utils/numberToWords");

console.log("Starting Amount in Words & Indian Numbering Test Suite...");

// 1. Basic numbers
assert.strictEqual(amountToWords(0), "Rupees Zero Only");
assert.strictEqual(amountToWords(5), "Rupees Five Only");
assert.strictEqual(amountToWords(18), "Rupees Eighteen Only");
assert.strictEqual(amountToWords(45), "Rupees Forty Five Only");
assert.strictEqual(amountToWords(100), "Rupees One Hundred Only");
assert.strictEqual(amountToWords(105), "Rupees One Hundred Five Only");
assert.strictEqual(amountToWords(340), "Rupees Three Hundred Forty Only");

// 2. Thousands, Lakhs, Crores
assert.strictEqual(amountToWords(1000), "Rupees One Thousand Only");
assert.strictEqual(amountToWords(1500), "Rupees One Thousand Five Hundred Only");
assert.strictEqual(amountToWords(25000), "Rupees Twenty Five Thousand Only");
assert.strictEqual(amountToWords(100000), "Rupees One Lakh Only");
assert.strictEqual(amountToWords(150000), "Rupees One Lakh Fifty Thousand Only");
assert.strictEqual(amountToWords(2540300), "Rupees Twenty Five Lakh Forty Thousand Three Hundred Only");
assert.strictEqual(amountToWords(10000000), "Rupees One Crore Only");
assert.strictEqual(amountToWords(500000000), "Rupees Fifty Crore Only");

// 3. Decimals / Paise
assert.strictEqual(amountToWords(0.5), "Fifty Paise Only");
assert.strictEqual(amountToWords(0.05), "Five Paise Only");
assert.strictEqual(amountToWords(340.25), "Rupees Three Hundred Forty and Twenty Five Paise Only");
assert.strictEqual(amountToWords(1250.75), "Rupees One Thousand Two Hundred Fifty and Seventy Five Paise Only");

// 4. Negative amounts
assert.strictEqual(amountToWords(-50), "Minus Rupees Fifty Only");
assert.strictEqual(amountToWords(-100.5), "Minus Rupees One Hundred and Fifty Paise Only");

// 5. Custom currencies
assert.strictEqual(amountToWords(150.25, "Dollars", "Cents"), "Dollars One Hundred Fifty and Twenty Five Cents Only");

console.log("All 19 Amount in Words & Indian Numbering tests passed successfully! ✔");
