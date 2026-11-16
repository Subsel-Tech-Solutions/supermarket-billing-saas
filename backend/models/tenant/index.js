// models/tenant/index.js — defines ALL models of one business on its own Sequelize connection
const defineCatalog = require("./catalog");
const defineSales = require("./sales");
const definePurchases = require("./purchases");
const defineMisc = require("./misc");
const defineAudit = require("./audit");

module.exports = function defineTenantModels(sequelize) {
  const m = {
    ...defineCatalog(sequelize),
    ...defineSales(sequelize),
    ...definePurchases(sequelize),
    ...defineMisc(sequelize),
    ...defineAudit(sequelize),
  };

  // Catalog
  m.Supplier.hasMany(m.Product, { foreignKey: "supplierId", as: "products", constraints: false });
  m.Product.belongsTo(m.Supplier, { foreignKey: "supplierId", as: "supplier", constraints: false });
  m.Product.hasMany(m.StockMovement, { foreignKey: "productId", as: "movements", constraints: false });

  // Sales
  m.Bill.hasMany(m.BillItem, { foreignKey: "billId", as: "items", onDelete: "CASCADE" });
  m.BillItem.belongsTo(m.Bill, { foreignKey: "billId", as: "bill" });
  m.BillItem.belongsTo(m.Product, { foreignKey: "productId", as: "product", constraints: false });
  m.Customer.hasMany(m.Bill, { foreignKey: "customerId", as: "bills", constraints: false });
  m.Bill.belongsTo(m.Customer, { foreignKey: "customerId", as: "customer", constraints: false });
  m.Customer.hasMany(m.CustomerPayment, { foreignKey: "customerId", as: "payments", constraints: false });
  m.Bill.hasMany(m.SaleReturn, { foreignKey: "billId", as: "returns", constraints: false });
  m.SaleReturn.hasMany(m.SaleReturnItem, { foreignKey: "returnId", as: "items", onDelete: "CASCADE" });

  // Purchases
  m.Purchase.hasMany(m.PurchaseItem, { foreignKey: "purchaseId", as: "items", onDelete: "CASCADE" });
  m.Purchase.belongsTo(m.Supplier, { foreignKey: "supplierId", as: "supplier", constraints: false });
  m.Supplier.hasMany(m.Purchase, { foreignKey: "supplierId", as: "purchases", constraints: false });
  m.Supplier.hasMany(m.SupplierPayment, { foreignKey: "supplierId", as: "payments", constraints: false });

  return m;
};
