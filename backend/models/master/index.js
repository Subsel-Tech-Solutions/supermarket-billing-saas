// models/master/index.js
const { sequelize } = require("../../config/database");
const Shop = require("./Shop");
const User = require("./User");
const PlatformSetting = require("./PlatformSetting");
const RefreshToken = require("./RefreshToken");
const PasswordResetToken = require("./PasswordResetToken");

Shop.hasMany(User, { foreignKey: "shopId", as: "users", onDelete: "CASCADE" });
User.belongsTo(Shop, { foreignKey: "shopId", as: "shop" });

User.hasMany(RefreshToken, { foreignKey: "userId", as: "refreshTokens", onDelete: "CASCADE" });
RefreshToken.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasMany(PasswordResetToken, { foreignKey: "userId", as: "passwordResetTokens", onDelete: "CASCADE" });
PasswordResetToken.belongsTo(User, { foreignKey: "userId", as: "user" });

module.exports = { sequelize, Shop, User, PlatformSetting, RefreshToken, PasswordResetToken };
