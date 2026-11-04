import { calculateBill } from "./billMath";

test("allocates discounts proportionally before calculating inclusive tax", () => {
  const result = calculateBill(
    [
      { productId: 1, price: 118, quantity: 1, taxRate: 18 },
      { productId: 2, price: 56, quantity: 1, taxRate: 12 },
    ],
    { billDiscount: 17.4, pricesIncludeTax: true, taxEnabled: true, roundOff: false },
  );

  expect(result.subtotal).toBe(174);
  expect(result.billDiscount).toBe(17.4);
  expect(result.taxableAmount).toBe(135);
  expect(result.taxAmount).toBe(21.6);
  expect(result.totalAmount).toBe(156.6);
});

test("calculates exclusive tax and optional total rounding", () => {
  const result = calculateBill([{ price: 10, quantity: 1, taxRate: 5 }], {
    pricesIncludeTax: false,
    taxEnabled: true,
    roundOff: true,
  });

  expect(result.taxableAmount).toBe(10);
  expect(result.taxAmount).toBe(0.5);
  expect(result.totalAmount).toBe(11);
  expect(result.roundOff).toBe(0.5);
});
