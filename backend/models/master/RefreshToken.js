// models/master/RefreshToken.js — server-side refresh tokens for rotation & reuse detection
const { DataTypes } = require("sequelize");
const { sequelize } = require("../../config/database");

const RefreshToken = sequelize.define(
  "RefreshToken",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: "user_id" },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, field: "token_hash" },
    family: { type: DataTypes.STRING(64), allowNull: false },
    isRevoked: { type: DataTypes.BOOLEAN, defaultValue: false, field: "is_revoked" },
    expiresAt: { type: DataTypes.DATE, allowNull: false, field: "expires_at" },
  },
  {
    tableName: "refresh_tokens",
    indexes: [
      { name: "ix_refresh_tokens_user", fields: ["user_id"] },
      { name: "ix_refresh_tokens_hash", fields: ["token_hash"] },
      { name: "ix_refresh_tokens_family", fields: ["family"] },
    ],
  },
);

module.exports = RefreshToken;
