const router = require("express").Router();
const c = require("../controllers/reportsController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);
const managers = authorize("reports:view");

router.get("/dashboard", managers, c.getDashboard);
router.get("/day-end", managers, c.getDayEnd);
router.get("/sales", managers, c.getSalesReport);
router.get("/top-products", managers, c.getTopProducts);
router.get("/categories", managers, c.getCategorySales);
router.get("/gst", managers, c.getGstReport);
router.get("/profit", authorize("reports:profit"), c.getProfitReport);
router.get("/staff", managers, c.getStaffReport);
router.get("/stock", managers, c.getStockReport);
router.get("/expiry", managers, c.getExpiryReport);
router.get("/audit-logs", managers, c.getAuditLogs);

module.exports = router;
