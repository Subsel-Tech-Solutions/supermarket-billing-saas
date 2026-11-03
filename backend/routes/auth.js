const router = require("express").Router();
const c = require("../controllers/authController");
const { protect } = require("../middleware/auth");
const { loginLimiter, signupLimiter, passwordResetLimiter } = require("../middleware/security");

router.post("/register", signupLimiter, c.register);
router.post("/login", loginLimiter, c.login);
router.post("/forgot-password", passwordResetLimiter, c.forgotPassword);
router.post("/reset-password", passwordResetLimiter, c.resetPassword);
router.post("/refresh", c.refresh);
router.post("/logout", c.logout);
router.get("/csrf", c.getCsrf);
router.get("/me", protect, c.getMe);
router.put("/profile", protect, c.updateProfile);
router.put("/change-password", protect, loginLimiter, c.changePassword);

module.exports = router;
