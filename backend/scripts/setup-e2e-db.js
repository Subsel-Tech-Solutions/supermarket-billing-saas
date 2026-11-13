// scripts/setup-e2e-db.js — Creates dedicated supermart_e2e user & test databases in MySQL
require("dotenv").config({ path: __dirname + "/../.env" });
const mysql = require("mysql2/promise");

async function main() {
  const rootPassword = process.env.DB_PASSWORD || "8203";
  const rootUser = process.env.DB_USER || "root";
  const host = process.env.DB_HOST || "localhost";
  const port = parseInt(process.env.DB_PORT || "3306", 10);

  console.log(`Connecting to MySQL on ${host}:${port} as ${rootUser}...`);
  const conn = await mysql.createConnection({ host, port, user: rootUser, password: rootPassword });

  const e2eUser = "supermart_e2e";
  const e2ePassword = "E2eSecurePass_2026!";

  console.log(`Ensuring dedicated test user '${e2eUser}' exists...`);
  await conn.query(`CREATE USER IF NOT EXISTS '${e2eUser}'@'localhost' IDENTIFIED BY '${e2ePassword}';`);
  await conn.query(`ALTER USER '${e2eUser}'@'localhost' IDENTIFIED BY '${e2ePassword}';`);
  await conn.query(`CREATE USER IF NOT EXISTS '${e2eUser}'@'%' IDENTIFIED BY '${e2ePassword}';`);
  await conn.query(`ALTER USER '${e2eUser}'@'%' IDENTIFIED BY '${e2ePassword}';`);
  await conn.query(`CREATE USER IF NOT EXISTS '${e2eUser}'@'127.0.0.1' IDENTIFIED BY '${e2ePassword}';`);
  await conn.query(`ALTER USER '${e2eUser}'@'127.0.0.1' IDENTIFIED BY '${e2ePassword}';`);

  console.log("Creating test databases: supermart_test_master, sm_test_shop_1...");
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`supermart_test_master\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`sm_test_shop_1\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);

  console.log("Restricting privileges to test databases only...");
  await conn.query(`GRANT ALL PRIVILEGES ON \`supermart_test_master\`.* TO '${e2eUser}'@'localhost';`);
  await conn.query(`GRANT ALL PRIVILEGES ON \`sm_test_shop_%\`.* TO '${e2eUser}'@'localhost';`);
  await conn.query(`GRANT ALL PRIVILEGES ON \`supermart_test_master\`.* TO '${e2eUser}'@'%';`);
  await conn.query(`GRANT ALL PRIVILEGES ON \`sm_test_shop_%\`.* TO '${e2eUser}'@'%';`);
  await conn.query(`GRANT ALL PRIVILEGES ON \`supermart_test_master\`.* TO '${e2eUser}'@'127.0.0.1';`);
  await conn.query(`GRANT ALL PRIVILEGES ON \`sm_test_shop_%\`.* TO '${e2eUser}'@'127.0.0.1';`);
  await conn.query(`FLUSH PRIVILEGES;`);

  console.log("✅ Dedicated E2E MySQL user and databases successfully configured!");
  await conn.end();
}

main().catch((err) => {
  console.error("❌ Failed to setup E2E database:", err);
  process.exit(1);
});
