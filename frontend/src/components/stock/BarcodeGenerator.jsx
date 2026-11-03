// src/components/stock/BarcodeGenerator.jsx
import React, { useState, useRef, useEffect } from "react";
import {
  Plus,
  Printer,
  Trash2,
  Copy,
  Tag,
  RefreshCw,
  Save,
  CheckCircle2,
} from "lucide-react";
import toast from "react-hot-toast";
import { productAPI } from "../../services/api";
import { numericOnly, blockNonNumericKeys, escapeHtml } from "../../utils/helpers";

function useJsBarcode() {
  const [ready, setReady] = useState(!!window.JsBarcode);
  useEffect(() => {
    if (window.JsBarcode) {
      setReady(true);
      return;
    }
    const s = document.createElement("script");
    s.src =
      "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js";
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);
  return ready;
}

const genBarcode = () => {
  const d = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
  const check =
    (10 - (d.reduce((s, v, i) => s + v * (i % 2 === 0 ? 1 : 3), 0) % 10)) % 10;
  return d.join("") + check;
};

function BarcodeImage({ value, width = 1.5, height = 40 }) {
  const ref = useRef();
  const barcodeReady = useJsBarcode();
  useEffect(() => {
    if (!barcodeReady || !ref.current || !value) return;
    try {
      window.JsBarcode(ref.current, value, {
        format: "CODE128",
        width,
        height,
        displayValue: true,
        fontSize: 10,
        fontOptions: "bold",
        textMargin: 4,
        margin: 4,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch (_) {}
  }, [value, barcodeReady, width, height]);
  return <svg ref={ref} />;
}

function LabelCard({ label, index, onDelete, onDuplicate }) {
  return (
    <div
      className="label-card"
      style={{
        background: "#fff",
        border: "1px solid #e0dbd3",
        borderRadius: 12,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        position: "relative",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        width: "100%",
      }}
    >
      {/* No store name */}
      <div
        style={{
          textAlign: "center",
          fontSize: 12,
          fontWeight: 600,
          color: "#1a1714",
          lineHeight: 1.3,
          wordBreak: "break-word",
        }}
      >
        {label.name || "Product Name"}
      </div>
      <div
        style={{ display: "flex", justifyContent: "center", margin: "2px 0" }}
      >
        <BarcodeImage value={label.barcode} width={1.2} height={36} />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          padding: "0 2px",
        }}
      >
        {label.mrp ? (
          <span
            style={{
              position: "relative",
              fontWeight: 800,
              fontSize: 13,
              color: "#888",
              flexShrink: 0,
            }}
          >
            MRP{" "}
            <span style={{ position: "relative" }}>
              ₹{label.mrp}
              <span
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "-5%",
                  width: "110%",
                  borderTop: "1.5px solid #000",
                  transform: "rotate(-20deg)",
                  transformOrigin: "center",
                }}
              />
            </span>
          </span>
        ) : (
          <span style={{ flex: 1 }} />
        )}
        <span
          style={{
            fontWeight: 800,
            fontSize: 13,
            color: "#bf9c5a",
            flexShrink: 0,
            marginLeft: "auto",
          }}
        >
          ₹{label.price || "—"}
        </span>
      </div>
      <div
        className="no-print"
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          display: "flex",
          gap: 4,
        }}
      >
        <button
          onClick={() => onDuplicate(index)}
          title="Duplicate"
          style={{
            padding: "3px 5px",
            borderRadius: 6,
            border: "1px solid #e0dbd3",
            background: "#faf9f7",
            cursor: "pointer",
            color: "#888",
          }}
        >
          <Copy size={11} />
        </button>
        <button
          onClick={() => onDelete(index)}
          title="Remove"
          style={{
            padding: "3px 5px",
            borderRadius: 6,
            border: "1px solid #fecaca",
            background: "#fff5f5",
            cursor: "pointer",
            color: "#e57373",
          }}
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

const EMPTY = {
  name: "",
  mrp: "",
  price: "",
  qty: "",
  category: "",
  barcode: "",
};

export default function BarcodeGenerator() {
  const [form, setForm] = useState({ ...EMPTY, barcode: genBarcode() });
  const [labels, setLabels] = useState([]);
  const [copies, setCopies] = useState(1);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const [savedBarcodes, setSavedBarcodes] = useState(new Set());
  const [saving, setSaving] = useState(false);

  const handleSaveToStock = async () => {
    if (!form.name) {
      toast.error("Product name required");
      return;
    }
    if (!form.price) {
      toast.error("Sell price required");
      return;
    }
    if (!form.barcode) {
      toast.error("Barcode required");
      return;
    }
    if (form.mrp && parseFloat(form.price) > parseFloat(form.mrp)) {
      toast.error(`Selling price (₹${form.price}) cannot exceed MRP (₹${form.mrp})`);
      return;
    }
    setSaving(true);
    try {
      await productAPI.scan({
        barcode: form.barcode,
        name: form.name,
        price: parseFloat(form.price),
        mrp: form.mrp ? parseFloat(form.mrp) : null,
        quantity: 0,
        category: form.category || "",
        netQty: form.qty || "",
      });
      setSavedBarcodes((prev) => new Set([...prev, form.barcode]));
      toast.success(`"${form.name}" saved to stock!`);
    } catch (err) {
      const msg = err?.response?.data?.message || err.message;
      if (msg?.includes("already") || err?.response?.status === 409) {
        setSavedBarcodes((prev) => new Set([...prev, form.barcode]));
        toast.success("Product already in stock — updated!");
      } else {
        toast.error("Could not save to stock");
      }
    }
    setSaving(false);
  };

  const handleAdd = () => {
    if (!form.name) {
      toast.error("Product name required");
      return;
    }
    if (!form.price) {
      toast.error("Sell price required");
      return;
    }
    if (form.mrp && parseFloat(form.price) > parseFloat(form.mrp)) {
      toast.error(`Selling price (₹${form.price}) cannot exceed MRP (₹${form.mrp})`);
      return;
    }
    const newLabels = Array.from({ length: parseInt(copies) || 1 }, () => ({
      ...form,
    }));
    setLabels((prev) => [...prev, ...newLabels]);
    setForm({ ...EMPTY, barcode: genBarcode() });
    setCopies(1);
    toast.success(`${copies} label${copies > 1 ? "s" : ""} added`);
  };

  const handleDelete = (i) =>
    setLabels((prev) => prev.filter((_, idx) => idx !== i));
  const handleDuplicate = (i) =>
    setLabels((prev) => {
      const copy = [...prev];
      copy.splice(i + 1, 0, { ...prev[i] });
      return copy;
    });

  const handlePrint = () => {
    if (!labels.length) {
      toast.error("Add at least one label first");
      return;
    }
    const svgMap = {};
    document
      .querySelectorAll("#label-print-area .label-card")
      .forEach((card, i) => {
        const svg = card.querySelector("svg");
        svgMap[i] = svg ? svg.outerHTML : "";
      });

    const labelHTML = labels
      .map(
        (label, i) => `
      <div class="label-card">
        <div class="product-name">${escapeHtml(label.name || "")}</div>
        <div class="barcode-area">${(svgMap[i] || "").replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/\s+on\w+\s*=\s*(['"]).*?\1/gi, "")}</div>
        <div class="price-row">
          ${label.mrp ? `<span style="font-weight:800;font-size:13px;color:#888;">MRP <span class="mrp">₹${escapeHtml(label.mrp)}</span></span>` : `<span></span>`}
          <span class="price">₹${escapeHtml(label.price || "")}</span>
        </div>
      </div>`,
      )
      .join("");

    const printWindow = window.open("", "_blank");
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Labels</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        body{font-family:Helvetica,Arial,sans-serif;background:#fff;}
        .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;padding:8mm;}
        .label-card{border:1px solid #ccc;border-radius:4px;padding:6px 8px;display:flex;flex-direction:column;align-items:stretch;gap:2px;break-inside:avoid;page-break-inside:avoid;width:100%;box-sizing:border-box;}
        .product-name{font-size:9px;font-weight:600;text-align:center;word-break:break-word;}
        .barcode-area svg{width:100%;height:auto;max-height:45px;}
        .price-row{display:flex;justify-content:space-between;align-items:center;width:100%;}
        .mrp{font-weight:800;font-size:13px;color:#888;position:relative;display:inline-block;}
        .mrp::after{content:"";position:absolute;top:50%;left:-5%;width:110%;border-top:1.5px solid #000;transform:rotate(-20deg);transform-origin:center;}
        .price{font-weight:800;font-size:13px;color:#bf9c5a;}
        @media print{body{margin:0;} .grid{padding:5mm;gap:3mm;}}
      </style>
    </head><body>
      <div class="grid">${labelHTML}</div>
      <script>window.onload=function(){setTimeout(function(){window.print();},500);};</script>
    </body></html>`);
    printWindow.document.close();
  };

  return (
    <div
      style={{ maxWidth: 1280, margin: "0 auto" }}
      className="fade-in page-content"
    >
      <style>{`
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body * { visibility: hidden !important; }
          #label-print-area, #label-print-area * { visibility: visible !important; }
          #label-print-area { position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; padding: 8mm !important; display: grid !important; grid-template-columns: repeat(4, 1fr) !important; gap: 6mm !important; }
          .no-print { display: none !important; }
          .label-card { break-inside: avoid !important; page-break-inside: avoid !important; box-shadow: none !important; border: 1px solid #ddd !important; }
        }
      `}</style>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "var(--text-primary)",
              fontFamily: "'Fraunces','Playfair Display',serif",
            }}
          >
            Barcode Generator
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>
            Create product labels with barcodes — fill details, generate, print
            & stick
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {labels.length > 0 && (
            <button
              onClick={() => setLabels([])}
              className="btn-ghost no-print"
              style={{ gap: 7, color: "var(--danger)" }}
            >
              <Trash2 size={13} /> Clear All
            </button>
          )}
          <button
            onClick={handlePrint}
            className="btn-primary no-print"
            style={{ gap: 7 }}
          >
            <Printer size={14} /> Print Labels ({labels.length})
          </button>
        </div>
      </div>

      <div className="grid-side-main" style={{ gap: 24, alignItems: "start" }}>
        {/* Form */}
        <div
          className="card no-print"
          style={{
            padding: "20px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            position: "sticky",
            top: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 2,
            }}
          >
            <Tag size={15} style={{ color: "var(--accent)" }} />
            <span
              style={{
                fontWeight: 600,
                fontSize: 14,
                color: "var(--text-primary)",
              }}
            >
              Label Details
            </span>
          </div>

          {[
            {
              label: "PRODUCT NAME *",
              key: "name",
              placeholder: "e.g. Tata Salt 1kg",
            },
            {
              label: "NET QUANTITY (saved to stock, not printed)",
              key: "qty",
              placeholder: "e.g. 500ml, 1kg, 12",
            },
            {
              label: "CATEGORY",
              key: "category",
              placeholder: "e.g. Grains, Oils, Essentials",
            },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  display: "block",
                  marginBottom: 5,
                }}
              >
                {label}
              </label>
              <input
                className="input-field"
                type="text"
                placeholder={placeholder}
                value={form[key]}
                onChange={(e) => set(key, key === "qty" ? e.target.value.replace(/^[^0-9]+/, "") : e.target.value)}
              />
            </div>
          ))}

          <div className="form-grid" style={{ gap: 10 }}>
            {[
              { label: "MRP (₹)", key: "mrp", placeholder: "150" },
              { label: "SELL PRICE (₹) *", key: "price", placeholder: "100" },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    display: "block",
                    marginBottom: 5,
                  }}
                >
                  {label}
                </label>
                <input
                  className="input-field"
                  type="text"
                  inputMode="decimal"
                  placeholder={placeholder}
                  value={form[key]}
                  onKeyDown={blockNonNumericKeys(true)}
                  onChange={(e) => set(key, numericOnly(e.target.value, true))}
                />
              </div>
            ))}
          </div>

          <div>
            <label
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                display: "block",
                marginBottom: 5,
              }}
            >
              BARCODE NUMBER
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="input-field"
                type="text"
                placeholder="Auto-generated"
                value={form.barcode}
                onChange={(e) => set("barcode", e.target.value)}
                style={{ fontFamily: "monospace", flex: 1 }}
              />
              <button
                onClick={() => set("barcode", genBarcode())}
                title="Generate new"
                style={{
                  padding: "8px 10px",
                  borderRadius: 9,
                  border: "1px solid var(--border)",
                  background: "var(--bg-secondary)",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  flexShrink: 0,
                }}
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </div>

          {form.barcode && (
            <div
              style={{
                background: "var(--bg-secondary)",
                borderRadius: 10,
                padding: "10px",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <BarcodeImage value={form.barcode} />
            </div>
          )}

          <div>
            <label
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                display: "block",
                marginBottom: 5,
              }}
            >
              NUMBER OF COPIES
            </label>
            <input
              className="input-field"
              type="text"
              inputMode="numeric"
              placeholder="1"
              value={copies}
              onKeyDown={blockNonNumericKeys(false)}
              onChange={(e) =>
                setCopies(e.target.value.replace(/[^0-9]/g, "") || 1)
              }
              onFocus={(e) => e.target.select()}
            />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              onClick={handleSaveToStock}
              disabled={saving}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: savedBarcodes.has(form.barcode)
                  ? "var(--success-light)"
                  : "var(--bg-secondary)",
                color: savedBarcodes.has(form.barcode)
                  ? "var(--success)"
                  : "var(--text-secondary)",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {savedBarcodes.has(form.barcode) ? (
                <CheckCircle2 size={14} />
              ) : (
                <Save size={14} />
              )}
              {savedBarcodes.has(form.barcode)
                ? "Saved!"
                : saving
                  ? "Saving..."
                  : "Save to Stock"}
            </button>
            <button
              onClick={handleAdd}
              className="btn-primary"
              style={{ flex: 1, justifyContent: "center", gap: 8 }}
            >
              <Plus size={14} /> Add {copies > 1 ? `${copies} Labels` : "Label"}
            </button>
          </div>
        </div>

        {/* Label grid */}
        <div>
          {labels.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "60px 20px",
                color: "var(--text-muted)",
                gap: 12,
              }}
            >
              <Tag size={40} style={{ opacity: 0.2 }} />
              <p style={{ fontSize: 14, fontWeight: 500 }}>No labels yet</p>
              <p style={{ fontSize: 13 }}>
                Fill the form and click "Add Label"
              </p>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 14,
                }}
                className="no-print"
              >
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  <strong style={{ color: "var(--text-primary)" }}>
                    {labels.length}
                  </strong>{" "}
                  label{labels.length !== 1 ? "s" : ""} ready to print
                </p>
              </div>
              <div
                id="label-print-area"
                className="label-sheet"
                style={{ display: "grid", gap: 12 }}
              >
                {labels.map((label, i) => (
                  <LabelCard
                    key={i}
                    label={label}
                    index={i}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
