// src/utils/numberToWords.js
// Converts numbers into currency amount in words using Indian numbering system (Crores, Lakhs, Thousands, Hundreds).

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];

const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const ones = ONES[n % 10];
  return ones ? `${tens} ${ones}` : tens;
}

function threeDigits(n) {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  if (!hundred) return twoDigits(rest);
  const restStr = twoDigits(rest);
  return restStr ? `${ONES[hundred]} Hundred ${restStr}` : `${ONES[hundred]} Hundred`;
}

export function numberToIndianWords(n) {
  if (n === 0) return "Zero";
  let num = Math.floor(Math.abs(n));
  const parts = [];

  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  if (crore > 0) parts.push(`${numberToIndianWords(crore)} Crore`);

  const lakh = Math.floor(num / 100000);
  num %= 100000;
  if (lakh > 0) parts.push(`${twoDigits(lakh)} Lakh`);

  const thousand = Math.floor(num / 1000);
  num %= 1000;
  if (thousand > 0) parts.push(`${twoDigits(thousand)} Thousand`);

  const hundred = num;
  if (hundred > 0) parts.push(threeDigits(hundred));

  return parts.join(" ").trim();
}

export function amountToWords(amount, currencyName = "Rupees", subunitName = "Paise") {
  const val = Number(amount) || 0;
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  const integerPart = Math.floor(absVal);
  const decimalPart = Math.round((absVal - integerPart) * 100);

  let result = "";
  if (integerPart === 0 && decimalPart === 0) return `${currencyName} Zero Only`;
  if (integerPart > 0) result += `${currencyName} ${numberToIndianWords(integerPart)}`;
  if (decimalPart > 0) {
    const paiseWords = twoDigits(decimalPart);
    result += result ? ` and ${paiseWords} ${subunitName}` : `${paiseWords} ${subunitName}`;
  }
  result += " Only";
  return isNegative ? `Minus ${result}` : result;
}

export default amountToWords;
