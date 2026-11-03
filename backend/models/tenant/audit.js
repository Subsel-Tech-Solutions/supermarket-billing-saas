// models/tenant/audit.js — AuditLog model for tracking security & financial operations
const { DataTypes } = require("sequelize");
const { jsonText } = require("./helpers");

module.exports = (sequelize) => {
  const AuditLog = sequelize.define(
    "AuditLog",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      action: { type: DataTypes.STRING(60), allowNull: false },
      entityType: { type: DataTypes.STRING(40), allowNull: false, field: "entity_type" },
      entityId: { type: DataTypes.STRING(60), allowNull: true, field: "entity_id" },
      userId: { type: DataTypes.INTEGER, allowNull: true, field: "user_id" },
      username: { type: DataTypes.STRING(80), allowNull: true },
      userRole: { type: DataTypes.STRING(30), allowNull: true, field: "user_role" },
      ipAddress: { type: DataTypes.STRING(60), allowNull: true, field: "ip_address" },
      details: jsonText("details", {}),
      diff: jsonText("diff", {}),
    },
    {
      tableName: "audit_logs",
      indexes: [
        { name: "ix_audit_action", fields: ["action"] },
        { name: "ix_audit_entity", fields: ["entity_type", "entity_id"] },
        { name: "ix_audit_user", fields: ["user_id"] },
        { name: "ix_audit_created", fields: ["createdAt"] },
      ],
    },
  );

  return { AuditLog };
};
