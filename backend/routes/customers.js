const router = require("express").Router();
const c = require("../controllers/customerController");
const { protect, authorize, requireActiveSubscription } = require("../middleware/auth");

router.use(protect, requireActiveSubscription);

const read = authorize("customers:read");
const write = authorize("customers:write");
const manage = authorize("customers:manage");

router.get("/", read, c.getCustomers);
router.get("/lookup", read, c.lookupCustomer);
router.post("/", write, c.createCustomer);
router.get("/:id", read, c.getCustomer);
router.put("/:id", write, c.updateCustomer);
router.delete("/:id", manage, c.deleteCustomer);
router.post("/:id/payments", write, c.receivePayment);
router.post("/:id/points", manage, c.adjustPoints);

module.exports = router;
