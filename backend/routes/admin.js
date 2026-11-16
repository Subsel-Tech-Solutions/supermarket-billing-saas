// Platform super-admin routes
const router = require("express").Router();
const c = require("../controllers/adminController");
const { protect, requireSuperAdmin } = require("../middleware/auth");

// Return to admin can be called while impersonating a shop owner (who has adminAccessToken cookie)
router.post("/return-to-admin", c.returnToAdmin);

router.use(protect, requireSuperAdmin);

router.get("/stats", c.getStats);
router.get("/settings", c.getPlatform);
router.put("/settings", c.updatePlatform);
router.get("/users", c.getUsers);
router.get("/shops", c.getShops);
router.post("/shops", c.createShop);
router.get("/shops/:id", c.getShop);
router.put("/shops/:id", c.updateShop);
router.delete("/shops/:id", c.deleteShop);
router.patch("/shops/:id/toggle", c.toggleShop);
router.post("/shops/:id/reset-password", c.resetPassword);
router.post("/shops/:id/login-as", c.loginAs);
router.post("/shops/:id/repair-db", c.repairDb);

module.exports = router;
