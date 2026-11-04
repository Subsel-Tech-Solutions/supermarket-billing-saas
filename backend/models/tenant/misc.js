// models/tenant/misc.js — Setting (single row), Expense
const { DataTypes } = require("sequelize");
const { money, jsonText } = require("./helpers");

module.exports = (sequelize) => {
  // One row (id = 1). `data` holds every configurable option as JSON;
  // counters are real columns so they can be row-locked safely.
  const Setting = sequelize.define(
    "Setting",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },
      data: jsonText("data", {}),
      billSeq: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "bill_seq" },
      purchaseSeq: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "purchase_seq" },
      returnSeq: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "return_seq" },
    },
    { tableName: "settings" },
  );

  const sequenceAllocation = (name, tableName) => sequelize.define(
    name,
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      isSeed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: "is_seed" },
    },
    { tableName, timestamps: false },
  );

  const BillSequenceAllocation = sequenceAllocation("BillSequenceAllocation", "bill_sequence_allocations");
  const PurchaseSequenceAllocation = sequenceAllocation("PurchaseSequenceAllocation", "purchase_sequence_allocations");
  const ReturnSequenceAllocation = sequenceAllocation("ReturnSequenceAllocation", "return_sequence_allocations");

  const Expense = sequelize.define(
    "Expense",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      category: { type: DataTypes.STRING(60), allowNull: false, defaultValue: "General" },
      amount: money(),
      expenseDate: { type: DataTypes.DATEONLY, allowNull: false, field: "expense_date" },
      paymentMethod: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "cash", field: "payment_method" },
      paidTo: { type: DataTypes.STRING(120), allowNull: true, field: "paid_to" },
      reference: { type: DataTypes.STRING(80), allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      createdBy: { type: DataTypes.STRING(60), allowNull: true, field: "created_by" },
    },
    { tableName: "expenses", indexes: [{ name: "ix_expenses_date", fields: ["expense_date"] }] },
  );

  return { Setting, BillSequenceAllocation, PurchaseSequenceAllocation, ReturnSequenceAllocation, Expense };
};
