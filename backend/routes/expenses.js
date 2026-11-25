const router = require("express").Router();
const c = require("../controllers/expenseController");
const { protect, authorize, requireActiveSubscription } = require("../middleware/auth");

router.use(protect, requireActiveSubscription, authorize("expenses:manage"));

router.get("/", c.getExpenses);
router.post("/", c.createExpense);
router.put("/:id", c.updateExpense);
router.delete("/:id", c.deleteExpense);

module.exports = router;
