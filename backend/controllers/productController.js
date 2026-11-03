// controllers/productController.js — inventory (tenant database)
const { Op, fn, col, literal } = require("sequelize");
const { asyncHandler, HttpError, num, str, bool, round2, round3, paging } = require("../utils/helpers");
const { getPlatformSettings, getShopSettings, planLimits } = require("../utils/settings");
const { moveStock } = require("../utils/stock");

const DECIMAL_UNITS = ["kg", "g", "l", "ml", "mtr"];

// Net quantity has to start with a number — "500ml", "1kg", "12" are fine, "Snacks" is not
const netQtyField = (v) => {
  const nq = str(v, 40);
  if (nq && !/^[0-9]/.test(nq.trim())) throw new HttpError(400, "Net quantity must start with a number (e.g. 500ml, 1kg)");
  return nq;
};

// Barcodes must be valid identifiers (alphanumeric, hyphens, dots, underscores, slashes, pluses, percent, spaces)
// Strictly reject HTML tags, quotes, angles, backticks, or script payloads
const sanitizeBarcode = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (!/^[A-Za-z0-9._\-\/+% ]+$/.test(s)) {
    throw new HttpError(400, "Barcode contains invalid characters. Only alphanumeric characters, hyphens, dots, underscores, slashes, and spaces are allowed.");
  }
  return s.slice(0, 100);
};

// Normalise incoming product fields. `partial` = only include keys present in body.
const productFields = (b, partial = false) => {
  const out = {};
  const has = (k) => !partial || b[k] !== undefined;
  if (has("name")) out.name = str(b.name, 180);
  if (has("barcode")) out.barcode = sanitizeBarcode(b.barcode);
  if (has("serialNumber")) out.serialNumber = sanitizeBarcode(b.serialNumber);
  if (has("category")) out.category = str(b.category, 80);
  if (has("brand")) out.brand = str(b.brand, 80);
  if (has("unit")) out.unit = str(b.unit, 12) || "pcs";
  if (has("allowDecimal") || has("unit")) {
    out.allowDecimal = b.allowDecimal !== undefined ? bool(b.allowDecimal) : DECIMAL_UNITS.includes(String(b.unit || "").toLowerCase());
  }
  if (has("netQty")) out.netQty = netQtyField(b.netQty);
  if (has("hsnCode")) out.hsnCode = str(b.hsnCode, 20);
  if (has("taxRate")) out.taxRate = Math.min(100, Math.max(0, num(b.taxRate)));
  if (has("mrp")) out.mrp = b.mrp === "" || b.mrp === null || b.mrp === undefined ? null : round2(num(b.mrp));
  if (has("price")) out.price = round2(Math.max(0, num(b.price)));
  if (has("costPrice")) out.costPrice = round2(Math.max(0, num(b.costPrice)));
  if (has("reorderLevel")) out.reorderLevel = round3(Math.max(0, num(b.reorderLevel, 10)));
  if (has("expiryDate")) out.expiryDate = b.expiryDate ? String(b.expiryDate).slice(0, 10) : null;
  if (has("batchNo")) out.batchNo = str(b.batchNo, 60);
  if (has("location")) out.location = str(b.location, 60);
  if (has("supplierId")) out.supplierId = b.supplierId ? parseInt(b.supplierId, 10) || null : null;
  if (has("description")) out.description = str(b.description, 5000);
  if (has("isActive") && b.isActive !== undefined) out.isActive = bool(b.isActive);
  return out;
};

// Rejects text in a quantity field instead of silently treating it as 0
// (which, on edit, would wipe the product's stock).
const assertQuantity = (value, label = "Quantity") => {
  if (value === undefined || value === null || value === "") return;
  const n = Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${label} must be a number`);
};

const assertBarcodeFree = async (db, barcode, exceptId) => {
  if (!barcode) return;
  const where = { barcode, isActive: true };
  if (exceptId) where.id = { [Op.ne]: exceptId };
  const dup = await db.Product.findOne({ where });
  if (dup) throw new HttpError(409, `Barcode already used by "${dup.name}"`);
};

const assertProductLimit = async (req, adding = 1) => {
  if (req.isSuperAdmin) return;
  const platform = await getPlatformSettings();
  const { maxProducts } = planLimits(platform, req.shop.plan);
  if (!maxProducts) return;
  const count = await req.db.Product.count({ where: { isActive: true } });
  if (count + adding > maxProducts) {
    throw new HttpError(403, `Your plan allows ${maxProducts} products. Upgrade your plan to add more.`, "PLAN_LIMIT");
  }
};

// GET /api/products
const getProducts = asyncHandler(async (req, res) => {
  const db = req.db;
  const { search, category, status, sort = "name", supplierId } = req.query;
  const { page, limit, offset } = paging(req.query, 50, 1000);
  const where = {};
  if (req.query.active !== "all") where.isActive = req.query.active === "false" ? false : true;
  if (category) where.category = category;
  if (supplierId) where.supplierId = supplierId;
  if (search) {
    const q = `%${String(search).trim()}%`;
    where[Op.or] = [
      { name: { [Op.like]: q } },
      { barcode: { [Op.like]: q } },
      { serialNumber: { [Op.like]: q } },
      { category: { [Op.like]: q } },
      { brand: { [Op.like]: q } },
    ];
  }
  if (status === "low") where[Op.and] = [literal("`Product`.`quantity` <= `Product`.`reorder_level`"), { quantity: { [Op.gt]: 0 } }];
  if (status === "out") where.quantity = { [Op.lte]: 0 };
  if (status === "expiring" || status === "expired") {
    const settings = await getShopSettings(db);
    const today = new Date().toISOString().slice(0, 10);
    const limitDay = new Date(Date.now() + settings.expiryAlertDays * 86400000).toISOString().slice(0, 10);
    where.expiryDate = status === "expired" ? { [Op.lt]: today } : { [Op.between]: [today, limitDay] };
  }
  const orders = {
    name: [["name", "ASC"]],
    stock: [["quantity", "ASC"]],
    newest: [["createdAt", "DESC"]],
    price: [["price", "DESC"]],
    expiry: [["expiryDate", "ASC"]],
  };
  const { count, rows } = await db.Product.findAndCountAll({
    where,
    order: orders[sort] || orders.name,
    limit,
    offset,
    include: [{ model: db.Supplier, as: "supplier", attributes: ["id", "name"] }],
  });
  res.json({ success: true, data: { products: rows, total: count, page, pages: Math.max(1, Math.ceil(count / limit)) } });
});

// GET /api/products/summary — inventory valuation
const getSummary = asyncHandler(async (req, res) => {
  const db = req.db;
  const row = await db.Product.findOne({
    where: { isActive: true },
    attributes: [
      [fn("COUNT", col("id")), "count"],
      [fn("SUM", literal("GREATEST(quantity,0) * cost_price")), "costValue"],
      [fn("SUM", literal("GREATEST(quantity,0) * price")), "saleValue"],
      [fn("SUM", literal("CASE WHEN quantity <= 0 THEN 1 ELSE 0 END")), "outOfStock"],
      [fn("SUM", literal("CASE WHEN quantity > 0 AND quantity <= reorder_level THEN 1 ELSE 0 END")), "lowStock"],
    ],
    raw: true,
  });
  res.json({
    success: true,
    data: {
      count: Number(row?.count) || 0,
      costValue: round2(row?.costValue),
      saleValue: round2(row?.saleValue),
      outOfStock: Number(row?.outOfStock) || 0,
      lowStock: Number(row?.lowStock) || 0,
    },
  });
});

// GET /api/products/:id  (id, barcode or serial)
const getProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const include = [{ model: req.db.Supplier, as: "supplier", attributes: ["id", "name"] }];
  let product = /^\d{1,9}$/.test(id) ? await req.db.Product.findByPk(id, { include }) : null;
  if (!product) {
    product = await req.db.Product.findOne({ where: { [Op.or]: [{ barcode: id }, { serialNumber: id }] }, include });
  }
  if (!product) throw new HttpError(404, "Product not found");
  res.json({ success: true, data: { product } });
});

// GET /api/products/barcode/:barcode
const getProductByBarcode = asyncHandler(async (req, res) => {
  const code = String(req.params.barcode || "").trim();
  const product = await req.db.Product.findOne({
    where: { isActive: true, [Op.or]: [{ barcode: code }, { serialNumber: code }] },
  });
  if (!product) throw new HttpError(404, "Product not found with this barcode");
  res.json({ success: true, data: { product } });
});

// POST /api/products
const createProduct = asyncHandler(async (req, res) => {
  const db = req.db;
  const data = productFields(req.body || {});
  if (!data.name) throw new HttpError(400, "Product name is required");
  if (req.body.price === undefined || req.body.price === "") throw new HttpError(400, "Selling price is required");
  assertQuantity(req.body.quantity, "Opening stock");
  assertQuantity(req.body.reorderLevel, "Reorder level");
  await assertProductLimit(req);
  await assertBarcodeFree(db, data.barcode);
  const openingQty = round3(Math.max(0, num(req.body.quantity)));

  const t = await req.tenant.sequelize.transaction();
  try {
    const product = await db.Product.create({ ...data, quantity: 0 }, { transaction: t });
    if (openingQty > 0) {
      await moveStock(db, product, openingQty, { type: "opening", note: "Opening stock", userName: req.user.username, transaction: t });
    }
    await t.commit();
    res.status(201).json({ success: true, message: "Product created successfully", data: { product } });
  } catch (err) {
    await t.rollback();
    throw err;
  }
});

// PUT /api/products/:id
const updateProduct = asyncHandler(async (req, res) => {
  const db = req.db;
  const product = await db.Product.findByPk(req.params.id);
  if (!product) throw new HttpError(404, "Product not found");
  const data = productFields(req.body || {}, true);
  if (data.name === null) throw new HttpError(400, "Product name is required");
  assertQuantity(req.body.quantity, "Stock");
  assertQuantity(req.body.reorderLevel, "Reorder level");
  if (data.barcode !== undefined) await assertBarcodeFree(db, data.barcode, product.id);

  const t = await req.tenant.sequelize.transaction();
  try {
    await product.update(data, { transaction: t });
    if (req.body.quantity !== undefined && req.body.quantity !== "") {
      const target = round3(num(req.body.quantity));
      const delta = round3(target - Number(product.quantity));
      if (delta !== 0) {
        await moveStock(db, product, delta, { type: "adjustment", note: "Edited in product form", userName: req.user.username, transaction: t });
      }
    }
    await t.commit();
    res.json({ success: true, message: "Product updated successfully", data: { product } });
  } catch (err) {
    await t.rollback();
    throw err;
  }
});

// PATCH /api/products/:id/stock  { quantity, operation: add|subtract|set, reason, note }
const updateStock = asyncHandler(async (req, res) => {
  const db = req.db;
  const { operation = "add", reason, note } = req.body || {};
  if (req.body?.quantity === undefined || req.body?.quantity === "") throw new HttpError(400, "Enter a valid quantity");
  assertQuantity(req.body.quantity);
  const amount = round3(num(req.body?.quantity));
  if (!(amount >= 0)) throw new HttpError(400, "Enter a valid quantity");

  const t = await req.tenant.sequelize.transaction();
  try {
    const product = await db.Product.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!product) throw new HttpError(404, "Product not found");
    const current = Number(product.quantity);
    let delta = operation === "set" ? amount - current : operation === "subtract" ? -amount : amount;
    delta = round3(delta);
    if (current + delta < 0) throw new HttpError(400, `Insufficient stock. Available: ${current}`);
    if (delta !== 0) {
      await moveStock(db, product, delta, {
        type: "adjustment",
        note: [reason, note].filter(Boolean).join(" — ") || "Manual adjustment",
        userName: req.user.username,
        transaction: t,
      });
    }
    await t.commit();
    res.json({ success: true, message: "Stock updated", data: { product } });
  } catch (err) {
    await t.rollback();
    throw err;
  }
});

// GET /api/products/:id/movements
const getMovements = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paging(req.query, 50, 500);
  const { count, rows } = await req.db.StockMovement.findAndCountAll({
    where: { productId: req.params.id },
    order: [["createdAt", "DESC"], ["id", "DESC"]],
    limit,
    offset,
  });
  res.json({ success: true, data: { movements: rows, total: count, page, pages: Math.max(1, Math.ceil(count / limit)) } });
});

// POST /api/products/scan — add stock by barcode (creates product if new)
const scanBarcode = asyncHandler(async (req, res) => {
  const db = req.db;
  const b = req.body || {};
  const barcode = sanitizeBarcode(b.barcode);
  if (!barcode) throw new HttpError(400, "Barcode is required");
  const quantity = round3(Math.max(0, num(b.quantity, 1)));

  const t = await req.tenant.sequelize.transaction();
  try {
    let product = await db.Product.findOne({ where: { barcode, isActive: true }, transaction: t, lock: t.LOCK.UPDATE });
    if (product) {
      const updates = {};
      if (b.expiryDate) updates.expiryDate = String(b.expiryDate).slice(0, 10);
      if (b.mrp !== undefined && b.mrp !== "" && b.mrp !== null) updates.mrp = round2(num(b.mrp));
      if (b.netQty) updates.netQty = netQtyField(b.netQty);
      if (b.price !== undefined && b.price !== "") updates.price = round2(num(b.price));
      if (b.costPrice !== undefined && b.costPrice !== "") updates.costPrice = round2(num(b.costPrice));
      if (b.name) updates.name = str(b.name, 180);
      if (b.category !== undefined) updates.category = str(b.category, 80);
      if (Object.keys(updates).length) await product.update(updates, { transaction: t });
      if (quantity > 0) await moveStock(db, product, quantity, { type: "scan", note: "Stock added by scan", userName: req.user.username, transaction: t });
      await t.commit();
      return res.json({ success: true, message: "Stock updated successfully", data: { product, action: "updated" } });
    }

    const name = str(b.name, 180);
    if (!name) throw new HttpError(400, "Product name is required for a new barcode");
    await assertProductLimit(req);
    product = await db.Product.create(
      {
        ...productFields({ ...b, barcode, name }),
        quantity: 0,
      },
      { transaction: t },
    );
    if (quantity > 0) await moveStock(db, product, quantity, { type: "opening", note: "Created by scan", userName: req.user.username, transaction: t });
    await t.commit();
    res.status(201).json({ success: true, message: "New product created", data: { product, action: "created" } });
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
});

// DELETE /api/products/:id  (soft delete — bill history keeps working)
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await req.db.Product.findByPk(req.params.id);
  if (!product) throw new HttpError(404, "Product not found");
  await product.update({ isActive: false });
  res.json({ success: true, message: "Product deleted successfully" });
});

// PATCH /api/products/:id/restore
const restoreProduct = asyncHandler(async (req, res) => {
  const product = await req.db.Product.findByPk(req.params.id);
  if (!product) throw new HttpError(404, "Product not found");
  await assertBarcodeFree(req.db, product.barcode, product.id);
  await product.update({ isActive: true });
  res.json({ success: true, message: "Product restored", data: { product } });
});

// GET /api/products/categories
const getCategories = asyncHandler(async (req, res) => {
  const rows = await req.db.Product.findAll({
    attributes: [[fn("DISTINCT", col("category")), "category"]],
    where: { isActive: true, category: { [Op.ne]: null } },
    raw: true,
  });
  const settings = await getShopSettings(req.db);
  const categories = [...new Set([...rows.map((r) => r.category).filter(Boolean), ...(settings.categories || [])])].sort((a, b) =>
    a.localeCompare(b),
  );
  res.json({ success: true, data: { categories } });
});

// POST /api/products/bulk-import  { products: [...] }
const bulkImport = asyncHandler(async (req, res) => {
  const db = req.db;
  const list = req.body?.products;
  if (!Array.isArray(list) || list.length === 0) throw new HttpError(400, "No products data provided");
  if (list.length > 5000) throw new HttpError(400, "Import at most 5000 rows at a time");

  const results = { created: 0, updated: 0, failed: 0, errors: [] };
  const failedRows = new Set();
  const addError = (rowNum, message) => {
    if (failedRows.has(rowNum)) return;
    failedRows.add(rowNum);
    results.failed++;
    if (results.errors.length < 200) results.errors.push(`Row ${rowNum}: ${message}`);
  };
  const platform = await getPlatformSettings();
  const { maxProducts } = planLimits(platform, req.shop.plan);
  let activeCount = await db.Product.count({ where: { isActive: true } });
  const rows = [];

  for (let i = 0; i < list.length; i++) {
    const row = list[i] || {};
    const rowNum = i + 2; // +1 header, +1 human numbering
    try {
      const name = str(row.name, 180);
      if (!name) throw new Error("Name is required");
      if (row.price === undefined || row.price === "" || !Number.isFinite(parseFloat(row.price))) throw new Error("Valid price is required");
      if (row.expiryDate && Number.isNaN(new Date(row.expiryDate).getTime())) throw new Error("Invalid expiry date (use YYYY-MM-DD)");

      const data = productFields({ ...row, name }, true);
      delete data.isActive;
      const qtyIn = round3(Math.max(0, num(row.quantity)));
      rows.push({ rowNum, data, name, qtyIn });
    } catch (err) {
      addError(rowNum, err.message);
    }
  }

  const chunkSize = 100;
  const keyOf = (value) => String(value || "").toLowerCase();
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const barcodes = [...new Set(chunk.map(({ data }) => data.barcode).filter(Boolean))];
    const names = [...new Set(chunk.map(({ name }) => name))];
    const where = [];
    if (barcodes.length) where.push({ barcode: { [Op.in]: barcodes } });
    if (names.length) where.push({ name: { [Op.in]: names }, isActive: true });

    let t;
    const attemptedRows = [];
    try {
      t = await req.tenant.sequelize.transaction();
      const matches = await db.Product.findAll({ where: { [Op.or]: where }, transaction: t });
      const byBarcode = new Map();
      const byName = new Map();
      const indexProduct = (map, key, product, prepend = false) => {
        if (!key) return;
        const indexKey = keyOf(key);
        const products = map.get(indexKey) || [];
        if (!products.includes(product)) {
          if (prepend) products.unshift(product);
          else products.push(product);
        }
        map.set(indexKey, products);
      };
      const unindexProduct = (map, key, product) => {
        if (!key) return;
        const indexKey = keyOf(key);
        const products = map.get(indexKey);
        if (!products) return;
        const index = products.indexOf(product);
        if (index >= 0) products.splice(index, 1);
        if (!products.length) map.delete(indexKey);
      };
      for (const product of matches) {
        indexProduct(byBarcode, product.barcode, product);
        if (product.isActive) indexProduct(byName, product.name, product);
      }

      let chunkCreated = 0;
      let chunkUpdated = 0;
      let chunkActiveCount = activeCount;
      const existingProducts = new Map();
      const newProducts = [];
      const stockMovements = [];
      for (const { rowNum, data, name, qtyIn } of chunk) {
        let product = (data.barcode && byBarcode.get(keyOf(data.barcode))?.[0]) || byName.get(keyOf(name))?.[0];
        const existing = product;
        if (!existing && maxProducts && !req.isSuperAdmin && chunkActiveCount + 1 > maxProducts) {
          addError(rowNum, "Plan product limit reached");
          continue;
        }
        if (existing && !existing.isActive && maxProducts && !req.isSuperAdmin && chunkActiveCount + 1 > maxProducts) {
          addError(rowNum, "Plan product limit reached");
          continue;
        }

        attemptedRows.push({ rowNum });
        if (product) {
          const previousBarcode = existing.barcode;
          const previousName = existing.name;
          const wasActive = existing.isActive;
          product.set({ ...data, isActive: true });
          if (previousBarcode !== product.barcode) unindexProduct(byBarcode, previousBarcode, product);
          if (wasActive && previousName !== product.name) unindexProduct(byName, previousName, product);
          existingProducts.set(product.id, product);
          if (!wasActive) chunkActiveCount++;
          chunkUpdated++;
        } else {
          product = db.Product.build({ ...data, quantity: 0, isActive: true });
          newProducts.push(product);
          chunkActiveCount++;
          chunkCreated++;
        }
        indexProduct(byBarcode, product.barcode, product, true);
        indexProduct(byName, product.name, product, true);
        if (qtyIn > 0) {
          const balanceAfter = round3(Number(product.quantity) + qtyIn);
          product.quantity = balanceAfter;
          stockMovements.push({
            productId: product.id || null,
            product,
            productName: product.name,
            type: "import",
            quantity: qtyIn,
            balanceAfter,
            reference: null,
            note: "Bulk import",
            userName: req.user.username,
          });
        }
      }
      const updateFields = Object.keys(db.Product.rawAttributes).filter((field) => field !== "id" && field !== "createdAt");
      if (newProducts.length) {
        const created = await db.Product.bulkCreate(newProducts.map((product) => product.get({ plain: true })), {
          transaction: t,
          validate: true,
        });
        newProducts.forEach((product, index) => {
          product.id = created[index].id;
        });
      }
      if (existingProducts.size) {
        const updatedAt = new Date();
        await db.Product.bulkCreate(
          [...existingProducts.values()].map((product) => ({ ...product.get({ plain: true }), updatedAt })),
          { transaction: t, validate: true, updateOnDuplicate: updateFields },
        );
      }
      if (stockMovements.length) {
        const movements = stockMovements.map(({ product, ...movement }) => ({ ...movement, productId: product.id }));
        await db.StockMovement.bulkCreate(movements, { transaction: t });
      }
      await t.commit();
      activeCount = chunkActiveCount;
      results.created += chunkCreated;
      results.updated += chunkUpdated;
    } catch (err) {
      if (t && !t.finished) await t.rollback();
      for (const { rowNum } of attemptedRows.length ? attemptedRows : chunk) {
        addError(rowNum, `Batch failed: ${err.message}`);
      }
    }
  }

  res.json({
    success: true,
    message: `Import complete: ${results.created} created, ${results.updated} updated, ${results.failed} failed`,
    data: results,
  });
});

module.exports = {
  getProducts,
  getSummary,
  getProduct,
  getProductByBarcode,
  createProduct,
  updateProduct,
  updateStock,
  getMovements,
  scanBarcode,
  deleteProduct,
  restoreProduct,
  getCategories,
  bulkImport,
  sanitizeBarcode,
  productFields,
};
