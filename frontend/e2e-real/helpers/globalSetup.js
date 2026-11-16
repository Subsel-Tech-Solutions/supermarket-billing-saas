// e2e-real/helpers/globalSetup.js — Runs before any Playwright real test workers start
const { seed } = require("../../../backend/scripts/seed-e2e");

module.exports = async function globalSetup() {
  console.log("\n🚀 [Global Setup] Seeding Real E2E test databases in MySQL...");
  process.env.E2E_MODE = "true";
  await seed();
  console.log("🚀 [Global Setup] Test database successfully seeded & ready for tests.\n");
};
