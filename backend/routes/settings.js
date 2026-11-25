const router = require("express").Router();
const c = require("../controllers/settingsController");
const { protect, authorize, requireActiveSubscription } = require("../middleware/auth");

router.use(protect);
router.get("/", authorize("settings:read"), c.getSettings);
router.get("/pos", authorize("settings:pos-read"), c.getPosSettings);
router.put("/", requireActiveSubscription, authorize("settings:write"), c.updateSettings);
router.post("/reset-appearance", requireActiveSubscription, authorize("settings:write"), c.resetAppearance);

module.exports = router;
