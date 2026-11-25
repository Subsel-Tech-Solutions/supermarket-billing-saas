const router = require("express").Router();
const c = require("../controllers/billingController");
const { generateInvoice } = require("../controllers/invoiceController");
const { protect, authorize, requireActiveSubscription } = require("../middleware/auth");

router.use(protect, requireActiveSubscription, authorize("bills:use"));

router.get("/", c.getBills);
router.post("/", c.createBill);
router.post("/preview", c.previewBill);
router.get("/returns", c.getReturns);
router.get("/held", c.getHeldBills);
router.post("/held", c.holdBill);
router.delete("/held/:id", c.deleteHeldBill);
router.get("/:id", c.getBill);
router.get("/:id/invoice", generateInvoice);
router.patch("/:id/cancel", c.cancelBill);
router.post("/:id/return", c.returnBill);

module.exports = router;
