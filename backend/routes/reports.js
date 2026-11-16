const router = require("express").Router();
const c = require("../controllers/reportsController");
const { protect, allow } = require("../middleware/auth");

router.use(protect);
const managers = allow("owner", "manager");

router.get("/dashboard", c.getDashboard);
router.get("/day-end", c.getDayEnd);
router.get("/sales", managers, c.getSalesReport);
router.get("/top-products", managers, c.getTopProducts);
router.get("/categories", managers, c.getCategorySales);
router.get("/gst", managers, c.getGstReport);
router.get("/profit", allow("owner"), c.getProfitReport);
router.get("/staff", managers, c.getStaffReport);
router.get("/stock", managers, c.getStockReport);
router.get("/expiry", managers, c.getExpiryReport);
router.get("/audit-logs", managers, c.getAuditLogs);

module.exports = router;
