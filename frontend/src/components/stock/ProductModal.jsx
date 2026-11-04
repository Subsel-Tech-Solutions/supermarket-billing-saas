import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Check } from "lucide-react";
import { productAPI, supplierAPI } from "../../services/api";
import { getErrorMessage, num, numericOnly, blockNonNumericKeys } from "../../utils/helpers";
import { useSettings } from "../../context/SettingsContext";
import { Spinner, Modal, Grid, Field } from "../shared/UI";

const EMPTY = {
  name: "",
  barcode: "",
  serialNumber: "",
  mrp: "",
  price: "",
  costPrice: "",
  quantity: "",
  category: "",
  brand: "",
  unit: "pcs",
  allowDecimal: false,
  taxRate: "",
  hsnCode: "",
  reorderLevel: "",
  netQty: "",
  description: "",
  expiryDate: "",
  batchNo: "",
  location: "",
};
const DECIMAL_UNITS = ["kg", "g", "l", "ml", "mtr"];
const GST_RATES = [0, 5, 12, 18, 28];
const netQtyValue = (value) => String(value ?? "").replace(/^[^0-9]+/, "");

export default function ProductModal({ isOpen, onClose, product, onSaved }) {
  const { settings } = useSettings();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const isEdit = !!product;
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!isOpen) return;
    productAPI
      .getCategories()
      .then((response) => setCategories(response.data.data.categories))
      .catch(() => {});
    supplierAPI
      .getAll({ limit: 1000 })
      .then((response) => setSuppliers(response.data.data.suppliers))
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!product) {
      setForm({ ...EMPTY, taxRate: settings.defaultTaxRate ?? 0, reorderLevel: settings.lowStockThreshold ?? 10 });
      return;
    }
    const legacyNet = product.description && product.description.startsWith("Net Qty:");
    setForm({
      ...EMPTY,
      name: product.name || "",
      barcode: product.barcode || "",
      serialNumber: product.serialNumber || "",
      mrp: product.mrp ?? "",
      price: product.price ?? "",
      costPrice: product.costPrice ?? "",
      quantity: product.quantity ?? 0,
      category: product.category || "",
      brand: product.brand || "",
      unit: product.unit || "pcs",
      allowDecimal: !!product.allowDecimal,
      taxRate: product.taxRate ?? 0,
      hsnCode: product.hsnCode || "",
      reorderLevel: product.reorderLevel ?? 10,
      netQty: product.netQty || (legacyNet ? product.description.replace("Net Qty:", "").trim() : ""),
      description: legacyNet ? "" : product.description || "",
      expiryDate: product.expiryDate ? String(product.expiryDate).slice(0, 10) : "",
      batchNo: product.batchNo || "",
      location: product.location || "",
      supplierId: product.supplierId || "",
    });
  }, [product, isOpen, settings.defaultTaxRate, settings.lowStockThreshold]);

  const margin = num(form.price) > 0 && num(form.costPrice) > 0 ? ((num(form.price) - num(form.costPrice)) / num(form.price)) * 100 : null;

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error("Product name is required");
    if (form.price === "" || num(form.price) < 0) return toast.error("Selling price is required");
    if (form.netQty.trim() && !/^[0-9]/.test(form.netQty.trim())) return toast.error("Net quantity must start with a number (e.g. 500ml, 1kg)");
    if (form.mrp !== "" && num(form.mrp) > 0 && num(form.price) > num(form.mrp)) {
      return toast.error(`Selling price (₹${form.price}) cannot exceed MRP (₹${form.mrp})`);
    }
    setLoading(true);
    try {
      const payload = {
        ...form,
        mrp: form.mrp === "" ? null : num(form.mrp),
        price: num(form.price),
        costPrice: num(form.costPrice),
        taxRate: num(form.taxRate),
        reorderLevel: num(form.reorderLevel, 10),
        quantity: form.quantity === "" ? 0 : num(form.quantity),
        barcode: form.barcode.trim() || null,
        serialNumber: form.serialNumber.trim() || null,
        expiryDate: form.expiryDate || null,
        supplierId: form.supplierId || null,
      };
      if (isEdit) await productAPI.update(product.id, payload);
      else await productAPI.create(payload);
      toast.success(isEdit ? "Product updated" : "Product created");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const input = (label, key, props = {}, span = 1) => (
    <Field label={label} span={span} required={props.required} hint={props.hint}>
      <input
        className="input-field"
        value={form[key] ?? ""}
        onChange={(event) => set(key, props.numeric ? numericOnly(event.target.value, props.numeric === "decimal") : props.netQty ? netQtyValue(event.target.value) : event.target.value)}
        onKeyDown={props.numeric ? blockNonNumericKeys(props.numeric === "decimal") : undefined}
        type={props.type || "text"}
        inputMode={props.numeric ? (props.numeric === "decimal" ? "decimal" : "numeric") : undefined}
        placeholder={props.placeholder}
        list={props.list}
        style={props.mono ? { fontFamily: "JetBrains Mono, monospace" } : undefined}
        autoFocus={props.autoFocus}
      />
    </Field>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? "Edit Product" : "New Product"} maxWidth={720}>
      <datalist id="cat-list">
        {categories.map((category) => <option key={category} value={category} />)}
      </datalist>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Grid cols={3}>
          {input("Product name", "name", { required: true, placeholder: "e.g. Ponni Rice 5kg", autoFocus: true }, 2)}
          {input("Brand", "brand", { placeholder: "e.g. Aashirvaad" })}
          {input("Category", "category", { list: "cat-list", placeholder: "Type or pick" })}
          {input("Barcode", "barcode", { mono: true, placeholder: "Scan or type" })}
          {input("SKU / Serial", "serialNumber", { mono: true, placeholder: "Optional" })}
        </Grid>
        <Grid cols={4}>
          {input("MRP", "mrp", { numeric: "decimal" })}
          {input("Selling price", "price", { numeric: "decimal", required: true })}
          {input("Cost price", "costPrice", { numeric: "decimal", hint: margin !== null ? `Margin ${margin.toFixed(1)}%` : "For profit reports" })}
          <Field label={`${settings.taxLabel || "GST"} %`}>
            <select className="input-field" value={form.taxRate} onChange={(event) => set("taxRate", event.target.value)}>
              {[...new Set([...GST_RATES, num(form.taxRate)])].map((rate) => <option key={rate} value={rate}>{rate}%</option>)}
            </select>
          </Field>
        </Grid>
        <Grid cols={4}>
          <Field label="Unit">
            <select className="input-field" value={form.unit} onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value, allowDecimal: DECIMAL_UNITS.includes(event.target.value) }))}>
              {[...new Set([...(settings.units || ["pcs", "kg"]), form.unit])].map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </Field>
          {input(isEdit ? "Stock (adjusts)" : "Opening stock", "quantity", { numeric: form.allowDecimal ? "decimal" : "int" })}
          {input("Reorder level", "reorderLevel", { numeric: form.allowDecimal ? "decimal" : "int", hint: "Low-stock alert" })}
          {input("HSN code", "hsnCode", { mono: true })}
        </Grid>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--text-secondary)", marginTop: -6 }}>
          <input type="checkbox" checked={!!form.allowDecimal} onChange={(event) => set("allowDecimal", event.target.checked)} style={{ accentColor: "var(--accent)" }} />
          Sold loose — allow decimal quantity (e.g. 1.250 kg)
        </label>
        <Grid cols={4}>
          {input("Net quantity", "netQty", { netQty: true, placeholder: "500ml / 1kg / 12" })}
          {input("Expiry date", "expiryDate", { type: "date" })}
          {input("Batch no.", "batchNo")}
          {input("Rack / shelf", "location")}
        </Grid>
        <Grid cols={2}>
          <Field label="Supplier">
            <select className="input-field" value={form.supplierId || ""} onChange={(event) => set("supplierId", event.target.value)}>
              <option value="">—</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </Field>
          {input("Description", "description", { placeholder: "Optional notes" })}
        </Grid>
        <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
          <button onClick={onClose} className="btn-ghost" style={{ flex: 1, justifyContent: "center" }}>Cancel</button>
          <button onClick={handleSubmit} disabled={loading} className="btn-primary" style={{ flex: 1, justifyContent: "center" }}>
            {loading ? <Spinner size={13} color="var(--bg)" /> : <Check size={13} />}
            {isEdit ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
