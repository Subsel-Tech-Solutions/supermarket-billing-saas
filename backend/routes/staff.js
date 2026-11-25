const router = require("express").Router();
const c = require("../controllers/staffController");
const { protect, authorize, requireActiveSubscription } = require("../middleware/auth");

router.use(protect, requireActiveSubscription, authorize("staff:manage"));

router.get("/", c.getStaff);
router.post("/", c.createStaff);
router.put("/:id", c.updateStaff);
router.delete("/:id", c.deleteStaff);

module.exports = router;
