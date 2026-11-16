const assert = require("assert");
const { initializeSequenceCounters, nextSequence } = require("../utils/settings");

const run = async () => {
  const transaction = { id: "checkout" };
  const settings = { data: { purchasePrefix: "PUR" }, billSeq: 18, purchaseSeq: 6, returnSeq: 0 };
  const createAllocationModel = (nextId, maximum = 0) => ({
    create: async (_values, options) => {
      assert.strictEqual(options.transaction, transaction);
      return { id: nextId };
    },
    max: async () => maximum,
    findOrCreate: async (options) => {
      initialized.push(options);
      return [{ id: options.where.id }];
    },
  });
  const initialized = [];
  const db = {
    Setting: { findByPk: async () => settings },
    BillSequenceAllocation: createAllocationModel(19),
    PurchaseSequenceAllocation: createAllocationModel(7),
    ReturnSequenceAllocation: createAllocationModel(1),
  };

  const result = await nextSequence(db, "billSeq", transaction);
  assert.strictEqual(result.next, 19);
  assert.strictEqual(result.settings.purchasePrefix, "PUR");

  await initializeSequenceCounters(db);
  assert.deepStrictEqual(initialized.map(({ where }) => where.id), [18, 6]);
  assert(initialized.every(({ defaults }) => defaults.isSeed));
  await assert.rejects(() => nextSequence(db, "unknownSeq"), /Unknown sequence/);

  console.log("sequence allocation tests passed");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
