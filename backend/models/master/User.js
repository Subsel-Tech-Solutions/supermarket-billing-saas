// models/master/User.js — every login (owner / manager / cashier / super admin)
const { DataTypes } = require("sequelize");
const bcrypt = require("bcryptjs");
const { sequelize } = require("../../config/database");

const ROLES = ["owner", "manager", "cashier"];

const User = sequelize.define(
  "User",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shopId: { type: DataTypes.INTEGER, allowNull: false, field: "shop_id" },
    username: { type: DataTypes.STRING(60), allowNull: false },
    email: {
      type: DataTypes.STRING(120),
      allowNull: false,
      validate: { isEmail: true },
      set(v) {
        this.setDataValue("email", String(v || "").trim().toLowerCase());
      },
    },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    password: { type: DataTypes.STRING(255), allowNull: false },
    role: { type: DataTypes.ENUM(...ROLES), allowNull: false, defaultValue: "owner" },
    isSuperAdmin: { type: DataTypes.BOOLEAN, defaultValue: false, field: "is_super_admin" },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: "is_active" },
    tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "token_version" },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true, field: "last_login_at" },
  },
  {
    tableName: "users",
    // Named indexes are NOT duplicated by sync({alter}) (unlike `unique: true` on a column)
    indexes: [
      { name: "uq_users_email", unique: true, fields: ["email"] },
      { name: "ix_users_shop", fields: ["shop_id"] },
    ],
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) user.password = await bcrypt.hash(user.password, 12);
      },
      beforeUpdate: async (user) => {
        if (user.changed("password")) user.password = await bcrypt.hash(user.password, 12);
      },
    },
  },
);

User.prototype.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(String(candidate || ""), this.password);
};

User.prototype.toSafeJSON = function toSafeJSON() {
  return {
    id: this.id,
    shopId: this.shopId,
    username: this.username,
    email: this.email,
    phone: this.phone,
    role: this.role,
    isSuperAdmin: !!this.isSuperAdmin,
    isActive: this.isActive,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
  };
};

User.ROLES = ROLES;
module.exports = User;
