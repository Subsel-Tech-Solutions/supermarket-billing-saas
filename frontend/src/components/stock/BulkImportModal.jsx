import React, { useState } from "react";
import toast from "react-hot-toast";
import { FileSpreadsheet, X, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { productAPI } from "../../services/api";
import { getErrorMessage } from "../../utils/helpers";
import { Spinner, Modal } from "../shared/UI";
import { parseProductCsv, parseProductSpreadsheet } from "../../utils/productImport";

export default function BulkImportModal({ isOpen, onClose, onImported }) {
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
        setRows(parseProductCsv(e.target.result));
        setStep("preview");
      };
      reader.readAsText(file);
    } else if (ext === "xlsx" || ext === "xls") {
      reader.onload = (e) => {
        try {
          setRows(parseProductSpreadsheet(e.target.result));
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
