const router = require("express").Router();
const c = require("../controllers/productController");
const { protect, authorize, requireActiveSubscription } = require("../middleware/auth");

router.use(protect, requireActiveSubscription);
const read = authorize("products:read");
const manage = authorize("products:manage");
const history = authorize("products:history");

router.get("/", read, c.getProducts);
router.get("/summary", read, c.getSummary);
router.get("/categories", read, c.getCategories);
router.get("/barcode/:barcode", read, c.getProductByBarcode);
router.post("/scan", manage, c.scanBarcode);
router.post("/bulk-import", manage, c.bulkImport);
router.post("/", manage, c.createProduct);
router.get("/:id", read, c.getProduct);
router.put("/:id", manage, c.updateProduct);
router.delete("/:id", manage, c.deleteProduct);
router.patch("/:id/restore", manage, c.restoreProduct);
router.patch("/:id/stock", manage, c.updateStock);
router.get("/:id/movements", history, c.getMovements);

module.exports = router;
