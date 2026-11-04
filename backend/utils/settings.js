// utils/settings.js — read platform settings (master) and shop settings (tenant)
const { PlatformSetting } = require("../models/master");
const { mergePlatform, mergeSettings } = require("./defaults");

const sequenceAllocations = {
  billSeq: "BillSequenceAllocation",
  purchaseSeq: "PurchaseSequenceAllocation",
  returnSeq: "ReturnSequenceAllocation",
};

let platformCache = { value: null, at: 0 };

const getPlatformSettings = async (fresh = false) => {
  if (!fresh && platformCache.value && Date.now() - platformCache.at < 30000) return platformCache.value;
  const row = await PlatformSetting.findByPk(1);
  const value = mergePlatform(row ? row.data : {});
  platformCache = { value, at: Date.now() };
  return value;
};

const clearPlatformCache = () => {
  platformCache = { value: null, at: 0 };
};

const getShopSettings = async (db, options = {}) => {
  const row = await db.Setting.findByPk(1, options);
  return mergeSettings(row ? row.data : {});
};

/**
 * The settings row (id = 1) is created when a tenant database is provisioned, but a
 * database restored from a partial backup — or one whose provisioning was interrupted —
 * can be missing it. Every writer goes through here so a missing row self-heals instead
 * of throwing "Cannot read properties of null".
 */
const getSettingRow = async (db, options = {}) => {
  const existing = await db.Setting.findByPk(1, options);
  if (existing) return existing;
  const [row] = await db.Setting.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1, data: mergeSettings({}) },
    transaction: options.transaction,
  });
  // Re-read so the caller gets the row under the same lock it asked for
  return options.lock ? db.Setting.findByPk(1, options) : row;
};

// Seed independent auto-increment allocators from legacy settings counters.
const initializeSequenceCounters = async (db) => {
  const settings = await db.Setting.findByPk(1);
  if (!settings) return;

  for (const [column, modelName] of Object.entries(sequenceAllocations)) {
    const SequenceAllocation = db[modelName];
    const current = Math.max(0, Number(settings[column]) || 0);
    const maximum = Number(await SequenceAllocation.max("id")) || 0;
    if (current > maximum) {
      await SequenceAllocation.findOrCreate({
        where: { id: current },
        defaults: { id: current, isSeed: true },
      });
    }
  }
};

// Durable auto-increment allocation rows avoid locking the shared settings row or a
// sequence counter for the duration of a checkout transaction.
const nextSequence = async (db, column, transaction) => {
  const modelName = sequenceAllocations[column];
  if (!modelName || !db[modelName]) throw new Error(`Unknown sequence: ${column}`);

  const SequenceAllocation = db[modelName];
  const allocation = await SequenceAllocation.create({}, { transaction });
  return {
    next: Number(allocation.id),
    settings: await getShopSettings(db, transaction ? { transaction } : {}),
  };
};

const planLimits = (platform, plan) => platform.plans[plan] || platform.plans.free || { maxUsers: 0, maxProducts: 0 };

module.exports = {
  getPlatformSettings,
  clearPlatformCache,
  getShopSettings,
  getSettingRow,
  initializeSequenceCounters,
  nextSequence,
  planLimits,
};
