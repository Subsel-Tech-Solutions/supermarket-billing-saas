const router = require("express").Router();
const c = require("../controllers/supplierController");
const { protect, authorize, requireActiveSubscription } = require("../middleware/auth");

router.use(protect, requireActiveSubscription, authorize("suppliers:manage"));

router.get("/", c.getSuppliers);
router.post("/", c.createSupplier);
router.get("/:id", c.getSupplier);
router.put("/:id", c.updateSupplier);
router.delete("/:id", c.deleteSupplier);
router.post("/:id/payments", c.paySupplier);

module.exports = router;
