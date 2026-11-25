// utils/stock.js — stock movement logging
const { HttpError, round3 } = require("./helpers");

/**
 * Change a product's stock and write a movement row.
 * @param {object} db         tenant models
 * @param {object} product    Product instance (ideally row-locked inside `transaction`)
 * @param {number} delta      + adds stock, − removes stock
 */
const moveStock = async (db, product, delta, { type, reference, note, userName, transaction } = {}) => {
  const newQty = round3(Number(product.quantity) + Number(delta));
  if (newQty < 0) throw new HttpError(400, `Insufficient stock for "${product.name}". Available: ${Number(product.quantity)}`);
  product.quantity = newQty;
  await product.save({ transaction, fields: ["quantity"] });
  await db.StockMovement.create(
    {
      productId: product.id,
      productName: product.name,
      type,
      quantity: round3(delta),
      balanceAfter: newQty,
      reference: reference || null,
      note: note ? String(note).slice(0, 255) : null,
      userName: userName || null,
    },
    { transaction },
  );
  return newQty;
};

module.exports = { moveStock };
