const router = require("express").Router();
const c = require("../controllers/purchaseController");
const { protect, authorize, requireActiveSubscription } = require("../middleware/auth");

router.use(protect, requireActiveSubscription, authorize("purchases:manage"));

router.get("/", c.getPurchases);
router.post("/", c.createPurchase);
router.get("/:id", c.getPurchase);
router.patch("/:id/cancel", c.cancelPurchase);

module.exports = router;
