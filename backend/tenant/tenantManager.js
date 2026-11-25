// tenant/tenantManager.js
// ─────────────────────────────────────────────────────────────────────────────
// Each shop has its own MySQL database (e.g. `sm_shop_7`).
// This module:
//   • creates the database + tables the first time a shop is used / registered
//   • keeps one Sequelize connection per active shop (LRU-cached, max 20)
//   • closes connections of shops that have been idle for a while
// ─────────────────────────────────────────────────────────────────────────────
const { createDatabaseIfMissing, createTenantSequelize } = require("../config/database");
const defineTenantModels = require("../models/tenant");
const { mergeSettings } = require("../utils/defaults");
const { initializeSequenceCounters } = require("../utils/settings");

const PREFIX = (process.env.TENANT_DB_PREFIX || "sm_shop_").replace(/[^a-zA-Z0-9_]/g, "");
const IDLE_MS = parseInt(process.env.TENANT_IDLE_MINUTES || "10", 10) * 60 * 1000;
const MAX_CACHED_TENANTS = parseInt(process.env.MAX_CACHED_TENANTS || "20", 10);
const SYNC_ALTER = process.env.DB_SYNC_ALTER === "true";
const STOCK_CHECK_CONSTRAINT = "chk_products_quantity_nonnegative";
const RETURN_CLIENT_REF_INDEX = "uq_returns_bill_client_ref";

const cache = new Map(); // dbName → { sequelize, models, ready: Promise, lastUsed }

const dbNameForShop = (shopId) => `${PREFIX}${shopId}`;

const supportsEnforcedCheckConstraints = (version) => {
  const isMariaDb = /mariadb/i.test(version);
  const versions = version.match(/\d+\.\d+\.\d+/g) || [];
  const parts = (isMariaDb ? versions[versions.length - 1] : versions[0])?.split(".").map(Number);
  if (!parts) return false;
  const minimum = isMariaDb ? [10, 2, 1] : [8, 0, 16];
  for (let i = 0; i < minimum.length; i += 1) {
    if (parts[i] > minimum[i]) return true;
    if (parts[i] < minimum[i]) return false;
  }
  return true;
};

const ensureNonnegativeProductStock = async (sequelize) => {
  const [versionRows] = await sequelize.query("SELECT VERSION() AS version");
  const version = String(versionRows[0]?.version || "");
  if (!supportsEnforcedCheckConstraints(version)) {
    throw new Error(
      `Tenant database ${sequelize.config.database} requires MySQL 8.0.16+ or MariaDB 10.2.1+ for enforced stock constraints (found ${version || "unknown"}).`,
    );
  }

  const findConstraint = () =>
    sequelize.query(
      "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND CONSTRAINT_NAME = :name AND CONSTRAINT_TYPE = 'CHECK'",
      { replacements: { name: STOCK_CHECK_CONSTRAINT } },
    );
  const [constraints] = await findConstraint();
  if (constraints.length) return;

  const [negativeProducts] = await sequelize.query("SELECT id FROM products WHERE quantity < 0 LIMIT 1");
  if (negativeProducts.length) {
    throw new Error(
      `Tenant database ${sequelize.config.database} has negative stock for product #${negativeProducts[0].id}; correct existing inventory before enabling the non-negative stock constraint.`,
    );
  }

  try {
    await sequelize.query(`ALTER TABLE products ADD CONSTRAINT ${STOCK_CHECK_CONSTRAINT} CHECK (quantity >= 0)`);
  } catch (error) {
    const [constraintsAfterRace] = await findConstraint();
    if (!constraintsAfterRace.length) throw error;
  }
};

const ensureReturnIdempotency = async (sequelize) => {
  const [tables] = await sequelize.query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_returns'",
  );
  if (!tables.length) return;

  await sequelize.query(
    "UPDATE sale_returns SET client_ref = CONCAT('legacy-return-', id) WHERE client_ref IS NULL",
  );

  const [duplicates] = await sequelize.query(
    "SELECT bill_id, client_ref FROM sale_returns GROUP BY bill_id, client_ref HAVING COUNT(*) > 1 LIMIT 1",
  );
  if (duplicates.length) {
    throw new Error(
      `Tenant database ${sequelize.config.database} has duplicate return idempotency keys for bill #${duplicates[0].bill_id}; resolve the duplicate return records before startup.`,
    );
  }

  const findIndex = () =>
    sequelize.query(
      "SELECT NON_UNIQUE AS nonUnique, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS indexColumns FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_returns' AND INDEX_NAME = :name GROUP BY INDEX_NAME, NON_UNIQUE",
      { replacements: { name: RETURN_CLIENT_REF_INDEX } },
    );
  const validIndex = (rows) =>
    rows.length > 0 && Number(rows[0].nonUnique) === 0 && rows[0].indexColumns === "bill_id,client_ref";

  const [indexes] = await findIndex();
  if (indexes.length && !validIndex(indexes)) {
    throw new Error(
      `Tenant database ${sequelize.config.database} has an incompatible ${RETURN_CLIENT_REF_INDEX} index on sale_returns.`,
    );
  }
  if (!indexes.length) {
    try {
      await sequelize.query(
        `ALTER TABLE sale_returns ADD UNIQUE INDEX ${RETURN_CLIENT_REF_INDEX} (bill_id, client_ref)`,
      );
    } catch (error) {
      const [indexesAfterRace] = await findIndex();
      if (!validIndex(indexesAfterRace)) throw error;
    }
  }

  const findColumn = () =>
    sequelize.query(
      "SELECT IS_NULLABLE AS isNullable FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_returns' AND COLUMN_NAME = 'client_ref'",
    );
  const [columns] = await findColumn();
  if (!columns.length) throw new Error(`Tenant database ${sequelize.config.database} is missing sale_returns.client_ref.`);
  if (columns[0].isNullable === "YES") {
    try {
      await sequelize.query("ALTER TABLE sale_returns MODIFY client_ref VARCHAR(64) NOT NULL");
    } catch (error) {
      const [columnsAfterRace] = await findColumn();
      if (!columnsAfterRace.length || columnsAfterRace[0].isNullable === "YES") throw error;
    }
  }
};

const buildEntry = (dbName, seed = {}) => {
  const sequelize = createTenantSequelize(dbName);
  const models = defineTenantModels(sequelize);
  const entry = { dbName, sequelize, models, lastUsed: Date.now(), ready: null };

  entry.ready = (async () => {
    await createDatabaseIfMissing(dbName);
    await sequelize.authenticate();
    await ensureReturnIdempotency(sequelize);
    await sequelize.sync(SYNC_ALTER ? { alter: true } : {});
    await ensureReturnIdempotency(sequelize);
    await ensureNonnegativeProductStock(sequelize);
    // Make sure the single settings row exists
    const existing = await models.Setting.findByPk(1);
    if (!existing) {
      await models.Setting.create({ id: 1, data: mergeSettings(seed) });
    }
    await initializeSequenceCounters(models);
    return entry;
  })();

  // If initialisation fails, drop it from the cache so the next request retries
  entry.ready.catch(() => {
    cache.delete(dbName);
    sequelize.close().catch(() => {});
  });

  return entry;
};

const evictLruTenant = async (excludeDbName) => {
  if (cache.size < MAX_CACHED_TENANTS) return;
  let oldestDbName = null;
  let oldestTime = Infinity;

  for (const [dbName, entry] of cache.entries()) {
    if (dbName === excludeDbName) continue;
    if (entry.lastUsed < oldestTime) {
      oldestTime = entry.lastUsed;
      oldestDbName = dbName;
    }
  }

  if (oldestDbName) {
    await closeTenant(oldestDbName);
  }
};

/**
 * Get (and lazily create) the database handle of a shop.
 * @param {{id:number, dbName?:string, name?:string}} shop
 * @param {object} seedSettings  initial settings used only when the DB is brand new
 * @returns {Promise<{sequelize, models, dbName}>}
 */
const getTenant = async (shop, seedSettings = {}) => {
  const dbName = shop.dbName || dbNameForShop(shop.id);
  let entry = cache.get(dbName);
  if (!entry) {
    if (cache.size >= MAX_CACHED_TENANTS) {
      await evictLruTenant(dbName);
    }
    entry = buildEntry(dbName, { businessName: shop.name, ...seedSettings });
    cache.set(dbName, entry);
  }
  entry.lastUsed = Date.now();
  await entry.ready;
  return entry;
};

// Provision a brand-new shop database right after signup / admin create
const provisionTenant = (shop, seedSettings = {}) => getTenant(shop, seedSettings);

const closeTenant = async (dbName) => {
  const entry = cache.get(dbName);
  if (!entry) return;
  cache.delete(dbName);
  try {
    await entry.sequelize.close();
  } catch {
    /* ignore */
  }
};

const closeAll = async () => {
  await Promise.all([...cache.keys()].map(closeTenant));
};

// Evict idle connections so hundreds of shops don't exhaust MySQL connections
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [dbName, entry] of cache.entries()) {
    if (now - entry.lastUsed > IDLE_MS) closeTenant(dbName);
  }
}, 60 * 1000);
sweeper.unref();

const stats = () => ({ openConnections: cache.size, databases: [...cache.keys()] });

module.exports = { getTenant, provisionTenant, closeTenant, closeAll, dbNameForShop, stats, MAX_CACHED_TENANTS };
