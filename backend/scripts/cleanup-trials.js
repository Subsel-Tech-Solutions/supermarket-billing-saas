#!/usr/bin/env node
// scripts/cleanup-trials.js — purge abandoned/expired trial tenant databases
require("dotenv").config();
const { sequelize, Shop, User } = require("../models/master");
const { Op } = require("sequelize");

const isForce = process.argv.includes("--force");
const daysThreshold = parseInt(process.env.CLEANUP_EXPIRED_DAYS || "30", 10);

async function run() {
  console.log("=== SuperMart POS: Trial Database Cleanup Utility ===");
  console.log(`Scanning for trial shops expired for more than ${daysThreshold} days...`);
  console.log(`Mode: ${isForce ? "EXECUTE (Databases will be dropped!)" : "DRY RUN (Use --force to execute)"}\n`);

  await sequelize.authenticate();

  const cutoff = new Date(Date.now() - daysThreshold * 86400000);

  const expiredShops = await Shop.findAll({
    where: {
      plan: "free",
      subscriptionEnds: { [Op.lt]: cutoff },
    },
    include: [{ model: User, as: "users" }],
  });

  if (!expiredShops.length) {
    console.log("✓ No abandoned trial databases found.");
    process.exit(0);
  }

  console.log(`Found ${expiredShops.length} expired trial shop(s):\n`);

  for (const shop of expiredShops) {
    const dbName = shop.dbName || `sm_shop_${shop.id}`;
    const daysAgo = Math.floor((Date.now() - new Date(shop.subscriptionEnds).getTime()) / 86400000);
    console.log(`- Shop #${shop.id}: "${shop.name}"`);
    console.log(`  Database: ${dbName}`);
    console.log(`  Owner: ${shop.ownerEmail}`);
    console.log(`  Trial expired: ${daysAgo} days ago (${shop.subscriptionEnds.toISOString().slice(0, 10)})`);

    if (isForce) {
      try {
        console.log(`  Dropping database \`${dbName}\`...`);
        await sequelize.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
        console.log(`  Marking shop #${shop.id} as inactive...`);
        await shop.update({ isActive: false, notes: `${shop.notes || ""}\nDatabase purged on ${new Date().toISOString()}`.trim() });
        console.log(`  ✓ Successfully cleaned up shop #${shop.id}\n`);
      } catch (err) {
        console.error(`  ✗ Failed to drop database \`${dbName}\`:`, err.message);
      }
    } else {
      console.log(`  [DRY RUN] Would drop database \`${dbName}\` and mark shop inactive.\n`);
    }
  }

  if (!isForce) {
    console.log("Run with `node scripts/cleanup-trials.js --force` to permanently drop these databases.");
  }

  process.exit(0);
}

run().catch((err) => {
  console.error("Cleanup utility failed:", err);
  process.exit(1);
});
