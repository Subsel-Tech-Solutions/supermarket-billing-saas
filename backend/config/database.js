// config/database.js
// ─────────────────────────────────────────────────────────────────────────────
// Two kinds of databases are used:
//   1. MASTER database  (DB_NAME)        → platform data: shops, users, platform settings
//   2. TENANT databases (one per shop)   → that shop's products, bills, customers …
// Every business gets its OWN MySQL database, so data is physically separated.
// ─────────────────────────────────────────────────────────────────────────────
const { Sequelize } = require("sequelize");
require("dotenv").config();

const baseOptions = () => ({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306", 10),
  dialect: "mysql",
  logging: process.env.DB_LOGGING === "true" ? console.log : false,
  timezone: "+00:00", // store everything in UTC; reports convert to shop time
  dialectOptions: {
    decimalNumbers: true, // DECIMAL columns come back as JS numbers, not strings
  },
  define: {
    timestamps: true,
    underscored: false,
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci",
  },
});

const DB_USER = () => process.env.DB_USER || "root";
const DB_PASS = () => process.env.DB_PASSWORD || "";

const sequelize = new Sequelize(process.env.DB_NAME || "supermart_master", DB_USER(), DB_PASS(), {
  ...baseOptions(),
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
});

// Only letters, numbers and underscore are allowed in database names we create.
const SAFE_DB_NAME = /^[a-zA-Z0-9_]{1,64}$/;

const assertSafeDbName = (name) => {
  if (!SAFE_DB_NAME.test(name || "")) {
    throw new Error(`Unsafe database name: ${name}`);
  }
};

// Connection with no default database — used to CREATE / DROP DATABASE.
const serverConnection = () =>
  new Sequelize("", DB_USER(), DB_PASS(), {
    ...baseOptions(),
    pool: { max: 1, min: 0, idle: 5000 },
  });

const createDatabaseIfMissing = async (dbName) => {
  assertSafeDbName(dbName);
  const conn = serverConnection();
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await conn.close();
  }
};

const createTenantSequelize = (dbName) => {
  assertSafeDbName(dbName);
  return new Sequelize(dbName, DB_USER(), DB_PASS(), {
    ...baseOptions(),
    pool: {
      max: parseInt(process.env.TENANT_POOL_MAX || "2", 10),
      min: 0,
      acquire: 30000,
      idle: parseInt(process.env.TENANT_POOL_IDLE || "5000", 10),
    },
  });
};

module.exports = {
  sequelize,
  createDatabaseIfMissing,
  createTenantSequelize,
  assertSafeDbName,
};
