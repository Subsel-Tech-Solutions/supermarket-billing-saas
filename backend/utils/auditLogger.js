// utils/auditLogger.js — audit logging helper for tenant actions
const logAudit = async (req, { action, entityType, entityId, details = {}, diff = {}, transaction, required = false }) => {
  try {
    if (!req || !req.db || !req.db.AuditLog) {
      if (required) throw new Error("Audit log model is unavailable for a required audit record");
      return null;
    }
    const ip = req.ip || req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || null;
    const auditRecord = {
      action,
      entityType,
      entityId: entityId !== undefined && entityId !== null ? String(entityId) : null,
      userId: req.user?.id || null,
      username: req.user?.username || req.user?.email || "system",
      userRole: req.user?.role || (req.isSuperAdmin ? "superadmin" : "unknown"),
      ipAddress: typeof ip === "string" ? ip.slice(0, 60) : null,
      details,
      diff,
    };
    return await req.db.AuditLog.create(auditRecord, transaction ? { transaction } : undefined);
  } catch (err) {
    if (required) throw err;
    // Audit logging is non-blocking to prevent aborting successful business operations
    console.error("[AuditLog Error]", err.message);
    return null;
  }
};

module.exports = { logAudit };
