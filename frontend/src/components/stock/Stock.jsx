// src/components/stock/Stock.jsx
import React, { useState, useEffect, useCallback } from "react";
import { productAPI, reportAPI, supplierAPI } from "../../services/api";
import { formatCurrency, formatQty, formatDateTime, getErrorMessage, debounce, num, getStockBadge, numericOnly, blockNonNumericKeys } from "../../utils/helpers";
import { useSettings } from "../../context/SettingsContext";
import {
  Spinner,
  Modal,
  FormField,
  EmptyState,
  ConfirmDialog,
  SearchInput,
  SectionHeader,
  Grid,
  Field,
  Table,
  Th,
  Td,
  Pagination,
  MiniStat,
} from "../shared/UI";
import BarcodeScanner from "../shared/BarcodeScanner";
import toast from "react-hot-toast";
import {
  Package,
  Plus,
  Edit2,
  Trash2,
  Scan,
  Check,
  X,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Printer,
  Download,
  History,
  Sliders,
  Minus,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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
// Net quantity must start with a number — "500ml", "1kg", "12" pass, "Snacks" is stripped to ""
const netQtyValue = (v) => String(v ?? "").replace(/^[^0-9]+/, "");
const GST_RATES = [0, 5, 12, 18, 28];

const stockBadge = (qty, reorder = 10) => getStockBadge(qty, reorder);
const expiryStatus = (dateStr) => {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(dateStr);
  const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0)
    return {
      label: "Expired",
      bg: "var(--danger-light)",
      color: "var(--danger)",
      days: diffDays,
    };
  if (diffDays <= 30)
    return {
      label: `${diffDays}d left`,
      bg: "rgba(var(--accent-rgb),0.10)",
      color: "var(--accent-dark)",
      days: diffDays,
    };
  return {
    label: exp.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    bg: "var(--success-light)",
    color: "var(--success)",
    days: diffDays,
  };
};

function ProductModal({ isOpen, onClose, product, onSaved }) {
  const { settings } = useSettings();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const isEdit = !!product;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!isOpen) return;
    productAPI
      .getCategories()
      .then((r) => setCategories(r.data.data.categories))
      .catch(() => {});
    supplierAPI
      .getAll({ limit: 1000 })
      .then((r) => setSuppliers(r.data.data.suppliers))
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
      if (!window.confirm("Selling price is higher than MRP. Save anyway?")) return;
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
      isEdit ? await productAPI.update(product.id, payload) : await productAPI.create(payload);
      toast.success(isEdit ? "Product updated" : "Product created");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // props.numeric: "int" (whole numbers only) or "decimal" — the box then accepts digits only
  const input = (label, key, props = {}, span = 1) => (
    <Field label={label} span={span} required={props.required} hint={props.hint}>
      <input
        className="input-field"
        value={form[key] ?? ""}
        onChange={(e) => set(key, props.numeric ? numericOnly(e.target.value, props.numeric === "decimal") : props.netQty ? netQtyValue(e.target.value) : e.target.value)}
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
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
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
            <select className="input-field" value={form.taxRate} onChange={(e) => set("taxRate", e.target.value)}>
              {[...new Set([...GST_RATES, num(form.taxRate)])].map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
            </select>
          </Field>
        </Grid>

        <Grid cols={4}>
          <Field label="Unit">
            <select
              className="input-field"
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value, allowDecimal: DECIMAL_UNITS.includes(e.target.value) }))}
            >
              {[...new Set([...(settings.units || ["pcs", "kg"]), form.unit])].map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
          {input(isEdit ? "Stock (adjusts)" : "Opening stock", "quantity", { numeric: form.allowDecimal ? "decimal" : "int" })}
          {input("Reorder level", "reorderLevel", { numeric: form.allowDecimal ? "decimal" : "int", hint: "Low-stock alert" })}
          {input("HSN code", "hsnCode", { mono: true })}
        </Grid>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--text-secondary)", marginTop: -6 }}>
          <input type="checkbox" checked={!!form.allowDecimal} onChange={(e) => set("allowDecimal", e.target.checked)} style={{ accentColor: "var(--accent)" }} />
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
            <select className="input-field" value={form.supplierId || ""} onChange={(e) => set("supplierId", e.target.value)}>
              <option value="">—</option>
              {suppliers.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name}
                </option>
              ))}
            </select>
          </Field>
          {input("Description", "description", { placeholder: "Optional notes" })}
        </Grid>

        <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
          <button onClick={onClose} className="btn-ghost" style={{ flex: 1, justifyContent: "center" }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading} className="btn-primary" style={{ flex: 1, justifyContent: "center" }}>
            {loading ? <Spinner size={13} color="var(--bg)" /> : <Check size={13} />}
            {isEdit ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const REASONS = ["Damaged", "Expired", "Theft / missing", "Stock count correction", "Free sample / gift", "Returned to supplier", "Other"];

function AdjustModal({ product, onClose, onSaved }) {
  const [op, setOp] = useState("subtract");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setOp("subtract");
    setQty("");
    setNote("");
    setReason(REASONS[0]);
  }, [product]);
  if (!product) return null;
  const current = num(product.quantity);
  const after = op === "set" ? num(qty) : op === "add" ? current + num(qty) : current - num(qty);
  const save = async () => {
    if (qty === "" || num(qty) < 0) return toast.error("Enter quantity");
    setBusy(true);
    try {
      await productAPI.updateStock(product.id, { quantity: num(qty), operation: op, reason, note });
      toast.success("Stock adjusted");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose} title={`Adjust stock — ${product.name}`} maxWidth={440}>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[
          ["subtract", "Remove"],
          ["add", "Add"],
          ["set", "Set exact"],
        ].map(([v, l]) => (
          <button key={v} className={op === v ? "btn-primary" : "btn-ghost"} style={{ flex: 1, justifyContent: "center" }} onClick={() => setOp(v)}>
            {l}
          </button>
        ))}
      </div>
      <Grid cols={2}>
        <Field label={`Quantity (${product.unit || "pcs"})`}>
          <input
            className="input-field"
            type="text"
            inputMode={product.allowDecimal ? "decimal" : "numeric"}
            placeholder="0"
            value={qty}
            onChange={(e) => setQty(numericOnly(e.target.value, !!product.allowDecimal))}
            onKeyDown={blockNonNumericKeys(!!product.allowDecimal)}
            autoFocus
          />
        </Field>
        <Field label="Reason">
          <select className="input-field" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label="Note" span={2}>
          <input className="input-field" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Grid>
      <p style={{ fontSize: 13, marginTop: 12, color: "var(--text-secondary)" }}>
        {formatQty(current, product.unit)} → <b style={{ color: after < 0 ? "var(--danger)" : "var(--text-primary)" }}>{formatQty(after, product.unit)}</b>
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button className="btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={save} disabled={busy || after < 0}>
          {busy && <Spinner size={13} color="var(--bg)" />} Save
        </button>
      </div>
    </Modal>
  );
}

const MOVE_LABELS = {
  sale: "Sale",
  sale_cancel: "Bill cancelled",
  return: "Customer return",
  purchase: "Purchase",
  purchase_cancel: "Purchase cancelled",
  adjustment: "Adjustment",
  opening: "Opening stock",
  import: "Bulk import",
  scan: "Scan add",
};

function MovementsModal({ product, onClose }) {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!product) return;
    setLoading(true);
    productAPI
      .getMovements(product.id, { page, limit: 30 })
      .then((r) => {
        setRows(r.data.data.movements);
        setPages(r.data.data.pages);
      })
      .catch((e) => toast.error(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [product, page]);
  useEffect(() => setPage(1), [product]);
  if (!product) return null;
  return (
    <Modal isOpen onClose={onClose} title={`Stock history — ${product.name}`} maxWidth={680}>
      {loading ? (
        <div style={{ padding: 30, display: "flex", justifyContent: "center" }}>
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: 20 }}>No movements recorded yet</p>
      ) : (
        <>
          <Table minWidth={540}>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Reference</Th>
                <Th align="right">Change</Th>
                <Th align="right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <Td primary muted style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                    {formatDateTime(m.createdAt)}
                  </Td>
                  <Td label="Type">
                    {MOVE_LABELS[m.type] || m.type}
                    {m.note && <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{m.note}</div>}
                  </Td>
                  <Td label="Reference" mono muted>
                    {m.reference || "—"}
                    {m.userName && <div style={{ fontSize: 11 }}>{m.userName}</div>}
                  </Td>
                  <Td label="Change" align="right" mono style={{ color: num(m.quantity) < 0 ? "var(--danger)" : "var(--success)" }}>
                    {num(m.quantity) > 0 ? "+" : ""}
                    {formatQty(m.quantity)}
                  </Td>
                  <Td label="Balance" align="right" mono>
                    {formatQty(m.balanceAfter)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pages={pages} onChange={setPage} />
        </>
      )}
    </Modal>
  );
}

function ScanForm({ scanned, isNew, onSubmit, onReset, loading }) {
  const [qty, setQty] = React.useState("");
  const [expiry, setExpiry] = React.useState(
    scanned?.expiryDate ? scanned.expiryDate.slice(0, 10) : "",
  );
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [category, setCategory] = React.useState("");

  return (
    <div
      className="fade-in"
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderRadius: 10,
          background: isNew ? "rgba(var(--accent-rgb),0.08)" : "var(--success-light)",
          border: `1px solid ${isNew ? "rgba(var(--accent-rgb),0.2)" : "rgba(58,122,90,0.2)"}`,
        }}
      >
        <p
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: isNew ? "var(--accent-dark)" : "var(--success)",
            marginBottom: 4,
          }}
        >
          {isNew
            ? "🆕 New product — fill details below"
            : `✅ Found: ${scanned?.name}`}
        </p>
        <p
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          {scanned?.barcode}
        </p>
        {!isNew && (
          <div
            style={{
              display: "flex",
              gap: 16,
              marginTop: 6,
              fontSize: 12,
              color: "var(--text-secondary)",
            }}
          >
            {scanned?.category && <span>📦 {scanned.category}</span>}
            {scanned?.price && (
              <span>💰 ₹{parseFloat(scanned.price).toFixed(2)}</span>
            )}
            <span>
              🗃 Stock: <strong>{scanned?.quantity}</strong>
            </span>
          </div>
        )}
      </div>

      {isNew && (
        <>
          <FormField label="Name" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="Product name"
              autoFocus
            />
          </FormField>
          <div className="form-grid" style={{ gap: 10 }}>
            <FormField label="Price (₹)" required>
              <input
                type="text"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(numericOnly(e.target.value, true))}
                onKeyDown={blockNonNumericKeys(true)}
                className="input-field"
                placeholder="0.00"
              />
            </FormField>
            <FormField label="Category">
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input-field"
                placeholder="e.g. Grains"
              />
            </FormField>
          </div>
        </>
      )}

      <div className="form-grid" style={{ gap: 10 }}>
        <FormField label={isNew ? "Initial Quantity" : "Quantity to Add"}>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Enter qty"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ""))}
            className="input-field"
            autoFocus={!isNew}
          />
        </FormField>
        <FormField label="Expiry Date">
          <input
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="input-field"
          />
        </FormField>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={onReset}
          className="btn-ghost"
          style={{ flex: 1, justifyContent: "center" }}
        >
          <X size={13} />
          Re-scan
        </button>
        <button
          onClick={() => onSubmit({ qty, expiry, name, price, category })}
          disabled={loading}
          className="btn-primary"
          style={{ flex: 1, justifyContent: "center" }}
        >
          {loading ? (
            <Spinner size={13} color="var(--bg)" />
          ) : (
            <Check size={13} />
          )}
          {isNew ? "Create Product" : "Add Stock"}
        </button>
      </div>
    </div>
  );
}

function ScanModal({ isOpen, onClose, onScanned }) {
  const [scanned, setScanned] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [manualCode, setManualCode] = React.useState("");

  useEffect(() => {
    if (isOpen) {
      setScanned(null);
      setIsNew(false);
      setScanning(true);
      setManualCode("");
    }
  }, [isOpen]);

  const handleScan = async (barcode) => {
    setScanning(false);
    try {
      const res = await productAPI.getByBarcode(barcode);
      setScanned({ ...res.data.data.product, barcode });
      setIsNew(false);
    } catch {
      setScanned({ barcode });
      setIsNew(true);
    }
  };

  const handleSubmit = async ({ qty, expiry, name, price, category }) => {
    if (!scanned) return;
    const q = parseInt(qty);
    if (!q || q < 1) return toast.error("Enter a valid quantity");
    setLoading(true);
    try {
      const payload = {
        barcode: scanned.barcode,
        quantity: q,
        expiryDate: expiry || null,
      };
      if (isNew) {
        if (!name || !price) return toast.error("Name and price required");
        Object.assign(payload, { name, price: parseFloat(price), category });
      }
      const res = await productAPI.scan(payload);
      toast.success(
        res.data.data.action === "created"
          ? "Product created"
          : "Stock updated",
      );
      onScanned?.();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (code) {
      setManualCode("");
      handleScan(code);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Scan to Update Stock"
      maxWidth={700}
    >
      {!scanned ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <BarcodeScanner
            active={scanning && isOpen}
            onScan={handleScan}
            onError={(e) => toast.error(e)}
            height={380}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <p
              style={{
                textAlign: "center",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              — or use a USB/Bluetooth barcode scanner —
            </p>
            <form
              onSubmit={handleManualSubmit}
              style={{ display: "flex", gap: 8 }}
            >
              <input
                type="text"
                className="input-field"
                placeholder="Scan with USB scanner or type barcode..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setManualCode("");
                }}
                style={{
                  flex: 1,
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 13,
                }}
                autoFocus
              />
              <button
                type="submit"
                className="btn-primary"
                style={{ whiteSpace: "nowrap", gap: 6 }}
              >
                <Scan size={13} /> Search
              </button>
            </form>
          </div>
        </div>
      ) : (
        <ScanForm
          key={scanned.barcode}
          scanned={scanned}
          isNew={isNew}
          onSubmit={handleSubmit}
          onReset={() => {
            setScanned(null);
            setIsNew(false);
            setScanning(true);
          }}
          loading={loading}
        />
      )}
    </Modal>
  );
}

// Column names are matched loosely: "Cost Price", "cost_price", "costprice" all work
const mapImportRow = (r) => {
  const v = (...keys) => {
    for (const k of keys) if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== "") return String(r[k]).trim();
    return "";
  };
  const row = {
    name: v("name", "productname", "product", "item"),
    price: v("price", "sellingprice", "salesprice", "rate"),
    mrp: v("mrp"),
    costPrice: v("costprice", "cost", "purchaseprice"),
    quantity: v("quantity", "qty", "stock") || "0",
    category: v("category"),
    brand: v("brand"),
    unit: v("unit", "uom"),
    taxRate: v("taxrate", "gst", "gstrate", "tax"),
    hsnCode: v("hsncode", "hsn"),
    barcode: v("barcode", "ean", "upc"),
    netQty: v("netqty", "netquantity", "size"),
    reorderLevel: v("reorderlevel", "minstock"),
    expiryDate: v("expirydate", "expiry"),
    description: v("description", "desc"),
  };
  Object.keys(row).forEach((k) => {
    if (row[k] === "" && k !== "name" && k !== "price") delete row[k];
  });
  return row;
};

function BulkImportModal({ isOpen, onClose, onImported }) {
  const [step, setStep] = useState("upload");
  const [rows, setRows] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = React.useRef();

  const reset = () => {
    setStep("upload");
    setRows([]);
    setResult(null);
  };

  const parseFile = (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    const reader = new FileReader();
    if (ext === "csv") {
      reader.onload = (e) => {
        const lines = e.target.result.split("\n").filter(Boolean);
        const headers = lines[0]
          .split(",")
          .map((h) => h.trim().replace(/"/g, ""));
        const parsed = lines
          .slice(1)
          .map((line) => {
            const vals = line.split(",").map((v) => v.trim().replace(/"/g, ""));
            return headers.reduce((obj, h, i) => {
              const key = h.toLowerCase().replace(/[^a-z]/g, "");
              obj[key] = vals[i] || "";
              return obj;
            }, {});
          })
          .filter((r) => r.name && r.name.trim());
        setRows(
          parsed.map(mapImportRow),
        );
        setStep("preview");
      };
      reader.readAsText(file);
    } else if (ext === "xlsx" || ext === "xls") {
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: "binary" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(ws, { defval: "" });
          const normalize = (obj) => {
            const out = {};
            Object.keys(obj).forEach((k) => {
              out[
                k
                  .toString()
                  .toLowerCase()
                  .replace(/[^a-z]/g, "")
              ] = obj[k];
            });
            return out;
          };
          setRows(
            data
              .map((r) => mapImportRow(normalize(r)))
              .filter((r) => r.name && r.name.trim()),
          );
          setStep("preview");
        } catch {
          toast.error("Failed to read Excel file");
        }
      };
      reader.readAsBinaryString(file);
    } else {
      toast.error("Only .csv, .xlsx, .xls files supported");
    }
  };

  const handleImport = async () => {
    setLoading(true);
    try {
      const res = await productAPI.bulkImport(rows);
      setResult(res.data.data);
      setStep("result");
      onImported?.();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const csv =
      "name,price,mrp,costPrice,quantity,unit,category,brand,taxRate,hsnCode,barcode,expiryDate,description\nPonni Rice 5kg,340,380,300,50,pcs,Rice & Grains,Sri Lakshmi,5,1006,8901234567890,2027-03-31,Premium\nTomato,40,,28,25,kg,Fruits & Vegetables,,0,0702,,,Loose\nSunflower Oil 1L,145,160,128,30,pcs,Oil & Ghee,Gold Winner,5,1512,8901234567891,2026-12-31,";
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "supermart-import-template.csv";
    a.click();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Bulk Import Products"
      maxWidth={780}
    >
      {step === "upload" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              parseFile(e.dataTransfer.files[0]);
            }}
            onClick={() => fileRef.current.click()}
            style={{
              border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 14,
              padding: "40px 20px",
              textAlign: "center",
              background: dragOver
                ? "rgba(var(--accent-rgb),0.06)"
                : "var(--bg-secondary)",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: "none" }}
              onChange={(e) => parseFile(e.target.files[0])}
            />
            <FileSpreadsheet
              size={40}
              style={{ color: "var(--accent)", margin: "0 auto 12px" }}
            />
            <p
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 6,
              }}
            >
              Drop your spreadsheet here
            </p>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Supports <strong>.csv</strong>, <strong>.xlsx</strong>,{" "}
              <strong>.xls</strong> — Click to browse
            </p>
          </div>
          <div
            style={{
              background: "var(--bg-secondary)",
              borderRadius: 10,
              padding: "14px 16px",
            }}
          >
            <p
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Required columns in your sheet
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[
                { col: "name", req: true },
                { col: "price", req: true },
                { col: "mrp", req: false },
                { col: "costPrice", req: false },
                { col: "quantity", req: false },
                { col: "unit", req: false },
                { col: "taxRate", req: false },
                { col: "hsnCode", req: false },
                { col: "brand", req: false },
                { col: "category", req: false },
                { col: "barcode", req: false },
                { col: "expiryDate", req: false },
                { col: "description", req: false },
              ].map(({ col, req }) => (
                <span
                  key={col}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontFamily: "monospace",
                    background: req
                      ? "rgba(var(--accent-rgb),0.12)"
                      : "var(--bg-primary)",
                    color: req ? "var(--accent-dark)" : "var(--text-muted)",
                    border: `1px solid ${req ? "rgba(var(--accent-rgb),0.25)" : "var(--border)"}`,
                  }}
                >
                  {col}
                  {req ? " *" : ""}
                </span>
              ))}
            </div>
            <p
              style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}
            >
              * Required &nbsp;|&nbsp; expiryDate format: YYYY-MM-DD
            </p>
          </div>
          <button
            onClick={downloadTemplate}
            className="btn-ghost"
            style={{ alignSelf: "flex-start", gap: 7 }}
          >
            <Upload size={13} /> Download Template CSV
          </button>
        </div>
      )}

      {step === "preview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)" }}>
                {rows.length}
              </strong>{" "}
              products ready to import
            </p>
            <button
              onClick={reset}
              className="btn-ghost"
              style={{ fontSize: 12 }}
            >
              <X size={12} /> Change file
            </button>
          </div>
          <div
            style={{
              maxHeight: 340,
              overflowY: "auto",
              borderRadius: 10,
              border: "1px solid var(--border)",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "var(--bg-secondary)",
                    position: "sticky",
                    top: 0,
                  }}
                >
                  {[
                    "#",
                    "Name",
                    "Price",
                    "MRP",
                    "Qty",
                    "Category",
                    "Barcode",
                    "Expiry",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "9px 12px",
                        textAlign: "left",
                        fontWeight: 600,
                        color: "var(--text-secondary)",
                        borderBottom: "1px solid var(--border)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background:
                        i % 2 === 0 ? "transparent" : "var(--bg-secondary)",
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 12px",
                        color: "var(--text-muted)",
                      }}
                    >
                      {i + 1}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontWeight: 500,
                        color: r.name ? "var(--text-primary)" : "var(--danger)",
                      }}
                    >
                      {r.name || "⚠ missing"}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        color: r.price
                          ? "var(--text-primary)"
                          : "var(--danger)",
                      }}
                    >
                      ₹{r.price || "⚠"}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        color: "var(--text-muted)",
                      }}
                    >
                      {r.mrp ? `₹${r.mrp}` : "—"}
                    </td>
                    <td style={{ padding: "8px 12px" }}>{r.quantity || "0"}</td>
                    <td
                      style={{
                        padding: "8px 12px",
                        color: "var(--text-muted)",
                      }}
                    >
                      {r.category || "—"}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontFamily: "monospace",
                        color: "var(--text-muted)",
                        fontSize: 11,
                      }}
                    >
                      {r.barcode || "—"}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        color: "var(--text-muted)",
                      }}
                    >
                      {r.expiryDate || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={reset}
              className="btn-ghost"
              style={{ flex: 1, justifyContent: "center" }}
            >
              <X size={13} /> Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={loading}
              className="btn-primary"
              style={{ flex: 2, justifyContent: "center" }}
            >
              {loading ? (
                <Spinner size={13} color="var(--bg)" />
              ) : (
                <Upload size={13} />
              )}{" "}
              Import {rows.length} Products
            </button>
          </div>
        </div>
      )}

      {step === "result" && result && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            alignItems: "center",
            padding: "10px 0",
          }}
        >
          <CheckCircle2 size={52} style={{ color: "var(--success)" }} />
          <p
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            Import Complete!
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 12,
              width: "100%",
            }}
          >
            {[
              {
                label: "Created",
                value: result.created,
                color: "var(--success)",
                bg: "var(--success-light)",
              },
              {
                label: "Updated",
                value: result.updated,
                color: "var(--accent-dark)",
                bg: "rgba(var(--accent-rgb),0.08)",
              },
              {
                label: "Failed",
                value: result.failed,
                color: "var(--danger)",
                bg: "var(--danger-light)",
              },
            ].map(({ label, value, color, bg }) => (
              <div
                key={label}
                style={{
                  background: bg,
                  borderRadius: 10,
                  padding: "14px",
                  textAlign: "center",
                }}
              >
                <p style={{ fontSize: 26, fontWeight: 800, color }}>{value}</p>
                <p style={{ fontSize: 12, color, marginTop: 2 }}>{label}</p>
              </div>
            ))}
          </div>
          {result.errors?.length > 0 && (
            <div
              style={{
                width: "100%",
                background: "var(--danger-light)",
                borderRadius: 10,
                padding: "12px 14px",
                maxHeight: 140,
                overflowY: "auto",
              }}
            >
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--danger)",
                  marginBottom: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <AlertCircle size={13} /> Errors
              </p>
              {result.errors.map((e, i) => (
                <p
                  key={i}
                  style={{
                    fontSize: 12,
                    color: "var(--danger)",
                    marginBottom: 3,
                  }}
                >
                  {e}
                </p>
              ))}
            </div>
          )}
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            className="btn-primary"
            style={{ alignSelf: "stretch", justifyContent: "center" }}
          >
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}
// Pulls every active product (the list API pages at 1000) for the current-stock export
const fetchAllProducts = async () => {
  const all = [];
  let page = 1;
  let pages = 1;
  do {
    const res = await productAPI.getAll({ page, limit: 1000, sort: "name" });
    all.push(...res.data.data.products);
    pages = res.data.data.pages || 1;
    page += 1;
  } while (page <= pages);
  return all;
};

function ReportModal({ isOpen, onClose, onDownload }) {
  const [type, setType] = useState("current");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [stockList, setStockList] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listSearch, setListSearch] = useState("");

  // Every time the modal opens it starts on "Current Stock" and loads the live list
  useEffect(() => {
    if (!isOpen) return;
    setType("current");
    setListSearch("");
    let cancelled = false;
    setListLoading(true);
    fetchAllProducts()
      .then((list) => !cancelled && setStockList(list))
      .catch((err) => !cancelled && toast.error(getErrorMessage(err)))
      .finally(() => !cancelled && setListLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const options = [
    { key: "current", label: "Current Stock" },
    { key: "thisMonth", label: "This Month" },
    { key: "lastMonth", label: "Last Month" },
    { key: "custom", label: "Custom" },
  ];

  const q = listSearch.trim().toLowerCase();
  const visible = q
    ? stockList.filter((p) => [p.name, p.barcode, p.category, p.brand].some((v) => v && String(v).toLowerCase().includes(q)))
    : stockList;
  const totalCostValue = stockList.reduce((a, p) => a + Math.max(0, num(p.quantity)) * num(p.costPrice), 0);
  const totalSaleValue = stockList.reduce((a, p) => a + Math.max(0, num(p.quantity)) * num(p.price), 0);

  const handleDownload = async () => {
    if (type === "current") {
      if (listLoading) return;
      if (!stockList.length) {
        toast.error("No products in stock to export");
        return;
      }
    }
    if (type === "custom") {
      if (!startDate || !endDate) {
        toast.error("Select both start and end dates");
        return;
      }
      if (new Date(startDate) > new Date(endDate)) {
        toast.error("Start date must be before end date");
        return;
      }
    }
    setLoading(true);
    try {
      await onDownload({ type, startDate, endDate, items: stockList });
    } finally {
      setLoading(false);
    }
  };

  const th = { padding: "8px 10px", fontWeight: 500, fontSize: 11.5, color: "var(--text-muted)", textAlign: "left", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--bg-secondary)" };
  const td = { padding: "8px 10px", fontSize: 12.5, borderTop: "1px solid var(--border)" };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Download Stock Report"
      maxWidth={type === "current" ? 760 : 500}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <FormField label="Report Period">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {options.map((o) => (
              <button
                key={o.key}
                onClick={() => setType(o.key)}
                className={type === o.key ? "btn-primary" : "btn-ghost"}
                style={{ flex: "1 1 100px", justifyContent: "center", fontSize: 13 }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </FormField>

        {type === "current" && (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                <b style={{ color: "var(--text-primary)" }}>{stockList.length}</b> products · Value (cost) <b style={{ color: "var(--text-primary)" }}>{formatCurrency(totalCostValue)}</b> · (selling){" "}
                <b style={{ color: "var(--text-primary)" }}>{formatCurrency(totalSaleValue)}</b>
              </span>
              <SearchInput value={listSearch} onChange={setListSearch} placeholder="Filter list…" style={{ maxWidth: 220 }} />
            </div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 10, maxHeight: 340, overflow: "auto" }}>
              {listLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
                  <Spinner size={20} />
                </div>
              ) : visible.length === 0 ? (
                <p style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>No products found</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                  <thead>
                    <tr>
                      <th style={th}>Product</th>
                      <th style={th}>Category</th>
                      <th style={{ ...th, textAlign: "right" }}>Stock</th>
                      <th style={{ ...th, textAlign: "right" }}>Price</th>
                      <th style={{ ...th, textAlign: "right" }}>Value (cost)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((p) => {
                      const qty = num(p.quantity);
                      const low = qty > 0 && qty <= num(p.reorderLevel);
                      return (
                        <tr key={p.id}>
                          <td style={{ ...td, fontWeight: 500, color: "var(--text-primary)" }}>
                            {p.name}
                            {p.barcode && <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{p.barcode}</div>}
                          </td>
                          <td style={{ ...td, color: "var(--text-secondary)" }}>{p.category || "—"}</td>
                          <td
                            style={{
                              ...td,
                              textAlign: "right",
                              fontWeight: 600,
                              color: qty <= 0 ? "var(--danger)" : low ? "var(--accent-dark)" : "var(--text-primary)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatQty(qty, p.unit)}
                          </td>
                          <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{formatCurrency(p.price)}</td>
                          <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{formatCurrency(Math.max(0, qty) * num(p.costPrice))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {type === "custom" && (
          <div className="form-grid" style={{ gap: 12 }}>
            <FormField label="Start Date">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input-field"
              />
            </FormField>
            <FormField label="End Date">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="input-field"
              />
            </FormField>
          </div>
        )}

        <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
          {type === "current"
            ? "Generates a PDF of the stock on hand right now — every product with its current quantity and stock value."
            : "Generates a PDF with opening stock, purchases, sales, adjustments and closing stock for the selected period."}
        </p>

        <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
          <button
            className="btn-ghost"
            onClick={onClose}
            style={{ flex: 1, justifyContent: "center" }}
          >
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleDownload}
            disabled={loading || (type === "current" && listLoading)}
            style={{ flex: 1, justifyContent: "center" }}
          >
            {loading ? (
              <Spinner size={13} color="var(--bg)" />
            ) : (
              <Download size={14} />
            )}
            Download PDF
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function Stock() {
  const { settings } = useSettings();
  const [status, setStatus] = useState("");
  const [summary, setSummary] = useState(null);
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [historyTarget, setHistoryTarget] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [showReportModal, setShowReportModal] = useState(false);
  const [productModal, setProductModal] = useState(false);
  const [scanModal, setScanModal] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [printMode, setPrintMode] = useState(false);
  const [printSelections, setPrintSelections] = useState({}); // { productId: copies }

  const bumpCopies = (id, delta) =>
    setPrintSelections((prev) => {
      const next = Math.max(0, (parseInt(prev[id], 10) || 0) + delta);
      return { ...prev, [id]: next ? String(next) : "" };
    });

  const fetchPage = useCallback(async (q, p, st) => {
    setLoading(true);
    try {
      const params = { search: q || undefined, page: p, limit: 25 };
      if (st) params.status = st;
      const [res, sum] = await Promise.all([productAPI.getAll(params), productAPI.getSummary()]);
      setProducts(res.data.data.products);
      setTotal(res.data.data.total);
      setPages(res.data.data.pages);
      setSummary(sum.data.data);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Always reload with the current search / page / filter
  const stateRef = React.useRef({ search, page, status });
  stateRef.current = { search, page, status };
  const load = useCallback(() => {
    const st = stateRef.current;
    return fetchPage(st.search, st.page, st.status);
  }, [fetchPage]);

  useEffect(() => {
    fetchPage(search, page, status);
  }, [page, status]); // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedLoad = useCallback(
    debounce((q) => {
      setPage(1);
      fetchPage(q, 1, stateRef.current.status);
    }, 380),
    [],
  );
  const handleSearch = (q) => {
    setSearch(q);
    debouncedLoad(q);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await productAPI.delete(deleteTarget.id);
      toast.success("Product removed");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const stepBtn = {
    width: 24,
    height: 24,
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-secondary)",
    color: "var(--text-secondary)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
  };
  const btnStyle = {
    width: 30,
    height: 30,
    borderRadius: 7,
    background: "none",
    border: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "var(--text-muted)",
    transition: "all 0.12s ease",
  };
  const downloadReport = async ({ type, startDate, endDate, items = [] }) => {
    const fmt = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    // Current stock — the live list shown in the modal
    if (type === "current") {
      try {
        const now = new Date();
        const rs = (v) => `Rs. ${num(v).toFixed(2)}`;
        const doc = new jsPDF("landscape");
        doc.setFontSize(18);
        doc.text(settings.businessName || "Stock Report", 14, 18);
        doc.setFontSize(13);
        doc.text("Current Stock Report", 14, 28);
        doc.setFontSize(10);
        doc.text(`As on : ${now.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`, 14, 36);

        let totalCost = 0;
        let totalSale = 0;
        const body = items.map((p, i) => {
          const qty = num(p.quantity);
          const cost = Math.max(0, qty) * num(p.costPrice);
          totalCost += cost;
          totalSale += Math.max(0, qty) * num(p.price);
          return [
            i + 1,
            p.name,
            p.barcode || "-",
            p.category || "-",
            `${Math.round(qty * 1000) / 1000} ${p.unit || ""}`.trim(),
            rs(p.costPrice),
            rs(p.price),
            rs(cost),
          ];
        });

        autoTable(doc, {
          startY: 44,
          head: [["#", "Product", "Barcode", "Category", "Current Stock", "Cost Price", "Selling Price", "Stock Value (cost)"]],
          body,
          foot: [["", `${items.length} products`, "", "", "", "", `Sale value: ${rs(totalSale)}`, rs(totalCost)]],
          styles: { fontSize: 8 },
          headStyles: { fillColor: [40, 40, 40] },
          footStyles: { fillColor: [240, 240, 240], textColor: [20, 20, 20], fontStyle: "bold" },
          columnStyles: { 0: { cellWidth: 10 }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } },
        });

        doc.save(`Current_Stock_${fmt(now)}.pdf`);
        setShowReportModal(false);
      } catch (err) {
        console.error(err);
        toast.error("Failed to generate stock report");
      }
      return;
    }

    let from, to, period;
    const today = new Date();
    // Named period for the "nothing to report" message — "in September 2026",
    // "between 01 Sep 2026 and 07 Sep 2026", "on 21 Oct 2026"
    const asMonth = (d) => d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    const asDay = (s) => new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

    if (type === "thisMonth") {
      from = fmt(new Date(today.getFullYear(), today.getMonth(), 1));
      to = fmt(new Date(today.getFullYear(), today.getMonth() + 1, 0));
      period = `in ${asMonth(today)}`;
    } else if (type === "lastMonth") {
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      from = fmt(lastMonth);
      to = fmt(new Date(today.getFullYear(), today.getMonth(), 0));
      period = `in ${asMonth(lastMonth)}`;
    } else {
      from = startDate;
      to = endDate;
      period = from === to ? `on ${asDay(from)}` : `between ${asDay(from)} and ${asDay(to)}`;
    }

    try {
      const res = await reportAPI.getStockReport({
        startDate: from,
        endDate: to,
      });

      const report = res.data.data;
      // Every product is filtered out when nothing was bought, sold or held in the period —
      // say so and keep the modal open instead of saving an empty PDF
      if (!report.length) {
        toast.error(`No stock activity ${period} — nothing to download`, { duration: 5000 });
        return;
      }

      const doc = new jsPDF("landscape");

      doc.setFontSize(18);
      doc.text(settings.businessName || "Stock Report", 14, 18);

      doc.setFontSize(13);
      doc.text("Stock Report", 14, 28);

      doc.setFontSize(10);
      doc.text(`Period : ${from} to ${to}`, 14, 36);

      autoTable(doc, {
        startY: 44,
        head: [
          [
            "Product",
            "Barcode",
            "Category",
            "Opening",
            "Inward",
            "Sold",
            "Adjust",
            "Closing",
            "Price",
            "Stock value",
          ],
        ],
        body: report.map((p) => [
          p.name,
          p.barcode || "-",
          p.category || "-",
          p.openingStock,
          p.inward,
          p.soldQty,
          p.adjustment,
          p.closingStock,
          `Rs. ${Number(p.price).toFixed(2)}`,
          `Rs. ${Number(p.stockValue).toFixed(2)}`,
        ]),
        styles: {
          fontSize: 8,
        },
        headStyles: {
          fillColor: [40, 40, 40],
        },
      });

      doc.save(`Stock_Report_${from}_to_${to}.pdf`);

      setShowReportModal(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate stock report");
    }
  };
  const handleMultiPrint = () => {
    const selected = Object.entries(printSelections)
      .filter(([_, copies]) => parseInt(copies) > 0)
      .map(([productId, copies]) => {
        const p = products.find((p) => String(p.id) === String(productId));
        if (!p) return null;
        return {
          name: p.name,
          barcode: p.barcode,
          mrp: p.mrp,
          price: p.price,
          copies: parseInt(copies),
        };
      })
      .filter(Boolean);
    if (!selected.length) {
      toast.error("Select at least one product with copies");
      return;
    }

    const labelCard = (name, barcode, mrp, price) => `
      <div class="label-card">
        <div class="product-name">${name}</div>
        <svg data-barcode="${barcode || name}" class="barcode-svg"></svg>
        <div class="price-row">
          ${mrp && parseFloat(mrp) > 0 ? `<span style="font-weight:800;font-size:13px;color:#888;">MRP <span class="mrp">&#8377;${parseFloat(mrp).toFixed(0)}</span></span>` : `<span></span>`}
          <span class="price">&#8377;${parseFloat(price).toFixed(0)}</span>
        </div>
      </div>`;

    const allLabels = selected
      .flatMap(({ name, barcode, mrp, price, copies }) =>
        Array.from({ length: copies }, () =>
          labelCard(name, barcode, mrp, price),
        ),
      )
      .join("");

    const win = window.open("", "_blank");
    win.document.write(`<!DOCTYPE html><html><head><title>Labels</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
      <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        body{font-family:Helvetica,Arial,sans-serif;background:#fff;}
        .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;padding:8mm;}
        .label-card{border:1px solid #ccc;border-radius:4px;padding:6px 8px;display:flex;flex-direction:column;align-items:stretch;gap:2px;break-inside:avoid;width:100%;box-sizing:border-box;}
        .product-name{font-size:9px;font-weight:600;text-align:center;word-break:break-word;}
        .barcode-svg{width:100%;height:auto;max-height:45px;}
        .price-row{display:flex;justify-content:space-between;align-items:center;width:100%;}
        .mrp{font-weight:800;font-size:13px;color:#888;position:relative;display:inline-block;}
        .mrp::after{content:"";position:absolute;top:50%;left:-5%;width:110%;border-top:1.5px solid #000;transform:rotate(-20deg);transform-origin:center;}
        .price{font-weight:800;font-size:13px;color:#bf9c5a;}
        @media print{body{margin:0;}}
      </style>
    </head><body>
      <div class="grid">${allLabels}</div>
      <script>
        window.onload = function() {
          document.querySelectorAll('.barcode-svg').forEach(function(el) {
            try { JsBarcode(el, el.getAttribute('data-barcode'), {format:"CODE128",width:1.2,height:36,displayValue:true,fontSize:9,textMargin:2,margin:2}); } catch(e){}
          });
          setTimeout(function(){ window.print(); }, 600);
        };
      </script>
    </body></html>`);
    win.document.close();
  };

  return (
    <div style={{ maxWidth: 1360, margin: "0 auto" }} className="fade-in page-content">
      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        onDownload={downloadReport}
      />
      <BulkImportModal
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        onImported={load}
      />
      <SectionHeader
        title="Stock"
        subtitle={`${total} products`}
        actions={
          <>
            {printMode ? (
              <>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {
                    Object.values(printSelections).filter(
                      (v) => parseInt(v) > 0,
                    ).length
                  }{" "}
                  selected
                </span>
                <button
                  onClick={() => {
                    setPrintMode(false);
                    setPrintSelections({});
                  }}
                  className="btn-ghost"
                  style={{ gap: 7 }}
                >
                  <X size={13} /> Cancel
                </button>
                <button
                  onClick={handleMultiPrint}
                  className="btn-primary"
                  style={{ gap: 7 }}
                >
                  <Printer size={13} /> Print Labels
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setScanModal(true)}
                  className="btn-ghost"
                >
                  <Scan size={14} /> Scan
                </button>
                <button
                  onClick={() => setShowBulkImport(true)}
                  className="btn-ghost"
                  style={{ gap: 7 }}
                >
                  <Upload size={13} /> Import Sheet
                </button>
                <button
                  onClick={() => setPrintMode(true)}
                  className="btn-ghost"
                  style={{ gap: 7 }}
                >
                  <Printer size={13} /> Print Labels
                </button>
                <button
                  onClick={() => {
                    setShowReportModal(true);
                  }}
                  className="btn-ghost"
                  style={{ gap: 7 }}
                >
                  <Download size={13} /> Download Report
                </button>
                <button
                  onClick={() => {
                    setEditProduct(null);
                    setProductModal(true);
                  }}
                  className="btn-primary"
                >
                  <Plus size={14} /> Add Product
                </button>
              </>
            )}
          </>
        }
      />

      {summary && (
        <div className="grid-stats-sm" style={{ marginBottom: 16 }}>
          <MiniStat label="Active products" value={summary.count} />
          <MiniStat label="Stock value (cost)" value={formatCurrency(summary.costValue)} />
          <MiniStat label="Stock value (selling)" value={formatCurrency(summary.saleValue)} tone="accent" />
          <MiniStat label="Low stock" value={summary.lowStock} tone={summary.lowStock ? "accent" : undefined} />
          <MiniStat label="Out of stock" value={summary.outOfStock} tone={summary.outOfStock ? "danger" : undefined} />
        </div>
      )}
      {/* Search takes the row and the five filters scroll sideways rather than wrapping
          into a three-line block of buttons on a phone. */}
      <div className="row-wrap" style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={handleSearch} placeholder="Search by name, barcode, brand or category…" style={{ maxWidth: 360 }} className="grow" />
        <div className="chip-row">
          {[
            ["", "All"],
            ["low", "Low stock"],
            ["out", "Out of stock"],
            ["expiring", "Expiring soon"],
            ["expired", "Expired"],
          ].map(([v, l]) => (
            <button
              key={v || "all"}
              className={status === v ? "btn-primary" : "btn-ghost"}
              style={{ padding: "7px 12px" }}
              onClick={() => {
                setPage(1);
                setStatus(v);
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        {loading ? (
          <div
            style={{ display: "flex", justifyContent: "center", padding: 48 }}
          >
            <Spinner size={22} />
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No products found"
            description="Add your first product to get started"
          />
        ) : (
          <>
            {/* 10 columns: scrolls sideways on a tablet, and each row becomes a card on a
                phone (.table-stack reads the data-label on every cell). The old build set
                neither, so the columns just crushed together below ~900px. */}
            <div className="table-scroll-wrapper table-stack">
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13.5,
                  minWidth: 1040,
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {printMode && (
                      <th style={{ padding: "11px 12px", width: 132 }}>
                        <span
                          style={{
                            fontSize: 11.5,
                            color: "var(--text-muted)",
                            fontWeight: 500,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          COPIES
                        </span>
                      </th>
                    )}
                    {[
                      "Product",
                      "Barcode",
                      "Category",
                      "Net Qty",
                      "MRP",
                      "Price",
                      "Stock",
                      "Expiry",
                      "Status",
                      ...(printMode ? [] : [""]),
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign:
                            h === "Price" || h === "Stock" || h === "MRP"
                              ? "right"
                              : h === "Status" || h === "" || h === "Net Qty"
                                ? "center"
                                : "left",
                          padding: "11px 18px",
                          color: "var(--text-muted)",
                          fontWeight: 500,
                          fontSize: 11.5,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => {
                    const badge = stockBadge(p.quantity, p.reorderLevel);
                    return (
                      <tr
                        key={p.id}
                        className="table-row-hover"
                        style={{
                          borderBottom:
                            i < products.length - 1
                              ? "1px solid var(--border)"
                              : "none",
                          transition: "background 0.12s ease",
                          background:
                            printMode && printSelections[p.id] > 0
                              ? "rgba(var(--accent-rgb),0.05)"
                              : undefined,
                        }}
                      >
                        {printMode && (
                          <td
                            data-label="Copies"
                            style={{
                              padding: "13px 12px",
                              textAlign: "center",
                              width: 132,
                            }}
                          >
                            {/* A bare box with a "copies" placeholder read as a button that
                                did nothing. Minus / plus make it obviously clickable, and
                                the box in the middle still accepts a typed number. */}
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <button
                                type="button"
                                onClick={() => bumpCopies(p.id, -1)}
                                disabled={!num(printSelections[p.id])}
                                aria-label={`One less label for ${p.name}`}
                                style={{ ...stepBtn, opacity: num(printSelections[p.id]) ? 1 : 0.4 }}
                              >
                                <Minus size={12} />
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="0"
                                aria-label={`Label copies for ${p.name}`}
                                value={printSelections[p.id] || ""}
                                onKeyDown={blockNonNumericKeys(false)}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) =>
                                  setPrintSelections((prev) => ({
                                    ...prev,
                                    [p.id]: numericOnly(e.target.value, false),
                                  }))
                                }
                                style={{
                                  width: 46,
                                  padding: "5px 4px",
                                  borderRadius: 6,
                                  border: "1px solid var(--border)",
                                  fontSize: 12.5,
                                  fontWeight: 600,
                                  textAlign: "center",
                                  background: "var(--bg-card)",
                                  color: "var(--text-primary)",
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => bumpCopies(p.id, 1)}
                                aria-label={`One more label for ${p.name}`}
                                style={stepBtn}
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          </td>
                        )}
                        <td data-primary="" style={{ padding: "13px 18px" }}>
                          <p
                            style={{
                              fontWeight: 500,
                              color: "var(--text-primary)",
                            }}
                          >
                            {p.name}
                          </p>
                          {(p.brand || num(p.taxRate) > 0 || p.location) && (
                            <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>
                              {[p.brand, num(p.taxRate) > 0 && `GST ${num(p.taxRate)}%`, p.location && `Rack ${p.location}`].filter(Boolean).join(" · ")}
                            </p>
                          )}
                          {p.serialNumber && (
                            <p
                              style={{
                                fontSize: 11.5,
                                color: "var(--text-muted)",
                                fontFamily: "JetBrains Mono, monospace",
                                marginTop: 1,
                              }}
                            >
                              {p.serialNumber}
                            </p>
                          )}
                        </td>
                        <td
                          data-label="Barcode"
                          style={{
                            padding: "13px 18px",
                            color: "var(--text-muted)",
                            fontFamily: "JetBrains Mono, monospace",
                            fontSize: 12.5,
                          }}
                        >
                          {p.barcode || "—"}
                        </td>
                        <td
                          data-label="Category"
                          style={{
                            padding: "13px 18px",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {p.category || "—"}
                        </td>
                        <td
                          data-label="Net qty"
                          style={{
                            padding: "13px 18px",
                            textAlign: "center",
                            color: "var(--text-muted)",
                            fontSize: 12.5,
                          }}
                        >
                          {p.netQty ? (
                            <span style={{ background: "var(--bg-secondary)", padding: "2px 8px", borderRadius: 5, fontSize: 11.5, fontWeight: 500 }}>{p.netQty}</span>
                          ) : p.description &&
                          p.description.startsWith("Net Qty:") ? (
                            <span
                              style={{
                                background: "var(--bg-secondary)",
                                padding: "2px 8px",
                                borderRadius: 5,
                                fontSize: 11.5,
                                fontWeight: 500,
                              }}
                            >
                              {p.description.replace("Net Qty:", "").trim()}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>
                              —
                            </span>
                          )}
                        </td>
                        <td
                          data-label="MRP"
                          style={{
                            padding: "13px 18px",
                            textAlign: "right",
                            fontFamily: "JetBrains Mono, monospace",
                            fontSize: 12.5,
                          }}
                        >
                          {p.mrp && parseFloat(p.mrp) > 0 ? (
                            <span
                              style={{
                                color: "var(--text-muted)",
                                fontSize: 12,
                              }}
                            >
                              <span style={{ textDecoration: "line-through" }}>
                                ₹{parseFloat(p.mrp).toFixed(2)}
                              </span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td
                          data-label="Price"
                          style={{
                            padding: "13px 18px",
                            textAlign: "right",
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            fontFamily: "JetBrains Mono, monospace",
                          }}
                        >
                          {formatCurrency(p.price)}
                        </td>
                        <td
                          data-label="Stock"
                          style={{
                            padding: "13px 18px",
                            textAlign: "right",
                            fontFamily: "JetBrains Mono, monospace",
                            color:
                              num(p.quantity) <= num(p.reorderLevel)
                                ? "var(--accent-dark)"
                                : "var(--text-primary)",
                            fontWeight: 500,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatQty(p.quantity, p.unit)}
                        </td>
                        <td
                          data-label="Expiry"
                          style={{ padding: "13px 18px", textAlign: "center" }}
                        >
                          {(() => {
                            const exp = expiryStatus(p.expiryDate);
                            if (!exp)
                              return (
                                <span
                                  style={{
                                    color: "var(--text-muted)",
                                    fontSize: 12,
                                  }}
                                >
                                  —
                                </span>
                              );
                            return (
                              <span
                                className="badge"
                                style={{
                                  background: exp.bg,
                                  color: exp.color,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {exp.label}
                              </span>
                            );
                          })()}
                        </td>
                        <td
                          data-label="Status"
                          style={{ padding: "13px 18px", textAlign: "center" }}
                        >
                          <span
                            className="badge"
                            style={{ background: badge.bg, color: badge.color }}
                          >
                            {badge.label}
                          </span>
                        </td>
                        {!printMode && (
                          <td
                            data-actions=""
                            style={{
                              padding: "13px 18px",
                              textAlign: "center",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                gap: 4,
                                justifyContent: "center",
                              }}
                            >
                              <button onClick={() => setAdjustTarget(p)} style={btnStyle} title="Adjust stock" aria-label="Adjust stock">
                                <Sliders size={13} />
                              </button>
                              <button onClick={() => setHistoryTarget(p)} style={btnStyle} title="Stock history" aria-label="Stock history">
                                <History size={13} />
                              </button>
                              <button
                                onClick={() => {
                                  setEditProduct(p);
                                  setProductModal(true);
                                }}
                                title="Edit"
                                aria-label="Edit"
                                style={btnStyle}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background =
                                    "var(--bg-sunken)";
                                  e.currentTarget.style.color =
                                    "var(--text-primary)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = "none";
                                  e.currentTarget.style.color =
                                    "var(--text-muted)";
                                }}
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(p)}
                                style={btnStyle}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background =
                                    "var(--danger-light)";
                                  e.currentTarget.style.color = "var(--danger)";
                                  e.currentTarget.style.borderColor =
                                    "rgba(184,64,64,0.2)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = "none";
                                  e.currentTarget.style.color =
                                    "var(--text-muted)";
                                  e.currentTarget.style.borderColor =
                                    "var(--border)";
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pages={pages} onChange={setPage} />
          </>
        )}
      </div>

      <ProductModal
        isOpen={productModal}
        onClose={() => setProductModal(false)}
        product={editProduct}
        onSaved={load}
      />
      <ScanModal
        isOpen={scanModal}
        onClose={() => setScanModal(false)}
        onScanned={load}
      />
      <AdjustModal product={adjustTarget} onClose={() => setAdjustTarget(null)} onSaved={load} />
      <MovementsModal product={historyTarget} onClose={() => setHistoryTarget(null)} />
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove Product"
        message={`Remove "${deleteTarget?.name}" from inventory? Historical bill records are preserved.`}
        loading={deleting}
      />
    </div>
  );
}
