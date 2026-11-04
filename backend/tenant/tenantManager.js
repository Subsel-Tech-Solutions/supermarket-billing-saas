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

const cache = new Map(); // dbName → { sequelize, models, ready: Promise, lastUsed }

const dbNameForShop = (shopId) => `${PREFIX}${shopId}`;

const buildEntry = (dbName, seed = {}) => {
  const sequelize = createTenantSequelize(dbName);
  const models = defineTenantModels(sequelize);
  const entry = { dbName, sequelize, models, lastUsed: Date.now(), ready: null };

  entry.ready = (async () => {
    await createDatabaseIfMissing(dbName);
    await sequelize.authenticate();
    await sequelize.sync(SYNC_ALTER ? { alter: true } : {});
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
