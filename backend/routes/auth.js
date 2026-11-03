const router = require("express").Router();
const c = require("../controllers/authController");
const { protect } = require("../middleware/auth");
const { loginLimiter, signupLimiter } = require("../middleware/security");

router.post("/register", signupLimiter, c.register);
router.post("/login", loginLimiter, c.login);
router.post("/refresh", c.refresh);
router.post("/logout", c.logout);
router.get("/csrf", c.getCsrf);
router.get("/me", protect, c.getMe);
router.put("/profile", protect, c.updateProfile);
router.put("/change-password", protect, loginLimiter, c.changePassword);

module.exports = router;
