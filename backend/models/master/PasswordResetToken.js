const { DataTypes } = require("sequelize");
const { sequelize } = require("../../config/database");

const PasswordResetToken = sequelize.define(
  "PasswordResetToken",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: "user_id" },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: "token_hash" },
    expiresAt: { type: DataTypes.DATE, allowNull: false, field: "expires_at" },
    usedAt: { type: DataTypes.DATE, allowNull: true, field: "used_at" },
  },
  {
    tableName: "password_reset_tokens",
    indexes: [{ name: "ix_password_reset_user", fields: ["user_id"] }],
  },
);

module.exports = PasswordResetToken;
