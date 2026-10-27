// src/components/inventory/Purchases.jsx — stock inward (GRN) from suppliers
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ClipboardList, Plus, Trash2, XCircle, Search } from "lucide-react";
import { purchaseAPI, supplierAPI, productAPI } from "../../services/api";
import { formatCurrency, formatDate, formatQty, getErrorMessage, num, todayStr, debounce, numericOnly, blockNonNumericKeys } from "../../utils/helpers";
import { Page, SectionHeader, PageLoader, EmptyState, Table, Th, Td, Modal, Field, Grid, Spinner, Pill, Pagination, MiniStat, Toggle, ConfirmDialog } from "../shared/UI";

export default function Purchases() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ startDate: "", endDate: "", supplierId: "", due: false });
  const [suppliers, setSuppliers] = useState([]);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState(null);
  const [cancelFor, setCancelFor] = useState(null);

  const load = useCallback(async (p, f) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 20 };
      if (f.startDate) params.startDate = f.startDate;
      if (f.endDate) params.endDate = f.endDate;
      if (f.supplierId) params.supplierId = f.supplierId;
      if (f.due) params.due = "true";
      const r = await purchaseAPI.getAll(params);
      setRows(r.data.data.purchases);
      setPages(r.data.data.pages);
      setSummary(r.data.data.summary);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page, filters);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    supplierAPI
      .getAll({ limit: 1000 })
      .then((r) => setSuppliers(r.data.data.suppliers))
      .catch(() => {});
  }, []);

  const setFilter = (k, v) => {
    const next = { ...filters, [k]: v };
    setFilters(next);
    setPage(1);
    load(1, next);
  };

  return (
    <Page>
      <SectionHeader
        title="Purchases"
        subtitle="Stock received from suppliers — updates stock & cost price automatically"
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14} /> New purchase
          </button>
        }
      />
      {summary && (
        <div className="grid-stats-sm" style={{ marginBottom: 16 }}>
          <MiniStat label="Purchase value (filtered)" value={formatCurrency(summary.totalAmount)} />
          <MiniStat label="Unpaid" value={formatCurrency(summary.dueAmount)} tone="danger" />
        </div>
      )}
      <div className="card" style={{ padding: "12px 16px", marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input type="date" className="input-field" style={{ width: 150 }} value={filters.startDate} onChange={(e) => setFilter("startDate", e.target.value)} />
        <input type="date" className="input-field" style={{ width: 150 }} value={filters.endDate} onChange={(e) => setFilter("endDate", e.target.value)} />
        <select className="input-field" style={{ width: 200 }} value={filters.supplierId} onChange={(e) => setFilter("supplierId", e.target.value)}>
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={filters.due} onChange={(e) => setFilter("due", e.target.checked)} style={{ accentColor: "var(--accent)" }} /> Unpaid only
        </label>
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        {loading ? (
          <PageLoader />
        ) : rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No purchases yet" description="Record stock you receive from suppliers." />
        ) : (
          <>
            <Table minWidth={760}>
              <thead>
                <tr>
                  <Th>Purchase</Th>
                  <Th>Date</Th>
                  <Th>Supplier</Th>
                  <Th align="right">Items</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Due</Th>
                  <Th align="center">Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="table-row-hover" style={{ cursor: "pointer" }} onClick={() => setView(p)}>
                    <Td primary mono>
                      {p.purchaseNumber}
                      {p.invoiceNo && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Inv {p.invoiceNo}</div>}
                    </Td>
                    <Td label="Date" muted>{formatDate(p.purchaseDate)}</Td>
                    <Td label="Supplier">{p.supplierName || "—"}</Td>
                    <Td label="Items" align="right" mono>
                      {p.items?.length || 0}
                    </Td>
                    <Td label="Total" align="right" mono>
                      {formatCurrency(p.totalAmount)}
                    </Td>
                    <Td label="Due" align="right" mono style={{ color: num(p.dueAmount) > 0 ? "var(--danger)" : "var(--text-muted)" }}>
                      {num(p.dueAmount) > 0 ? formatCurrency(p.dueAmount) : "Paid"}
                    </Td>
                    <Td label="Status" align="center">{p.status === "cancelled" ? <Pill tone="danger">Cancelled</Pill> : <Pill tone="success">Received</Pill>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pages={pages} onChange={setPage} />
          </>
        )}
      </div>

      <PurchaseForm
        isOpen={creating}
        suppliers={suppliers}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          load(1, filters);
          setPage(1);
        }}
      />

      <Modal isOpen={!!view} onClose={() => setView(null)} title={view?.purchaseNumber} maxWidth={660}>
        {view && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {view.supplierName || "No supplier"} · {formatDate(view.purchaseDate)} {view.invoiceNo ? `· Supplier invoice ${view.invoiceNo}` : ""} · by {view.createdBy}
            </p>
            <Table minWidth={520}>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th align="right">Qty</Th>
                  <Th align="right">Cost</Th>
                  <Th align="right">GST</Th>
                  <Th align="right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {view.items?.map((it) => (
                  <tr key={it.id}>
                    <Td primary>
                      {it.productName}
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{[it.batchNo && `Batch ${it.batchNo}`, it.expiryDate && `Exp ${formatDate(it.expiryDate)}`].filter(Boolean).join(" · ")}</div>
                    </Td>
                    <Td label="Qty" align="right" mono>
                      {formatQty(it.quantity)}
                    </Td>
                    <Td label="Cost" align="right" mono>
                      {formatCurrency(it.costPrice)}
                    </Td>
                    <Td label="GST" align="right" mono>
                      {num(it.taxRate)}%
                    </Td>
                    <Td label="Amount" align="right" mono>
                      {formatCurrency(it.totalAmount)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="card-sunken" style={{ padding: "10px 14px", fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                ["Subtotal", view.subtotal],
                ["Tax", view.taxAmount],
                ["Other charges", view.otherCharges],
                ["Discount", -num(view.discountAmount)],
                ["Total", view.totalAmount],
                ["Paid", view.paidAmount],
                ["Due", view.dueAmount],
              ]
                .filter(([l, v]) => num(v) !== 0 || l === "Total")
                .map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", fontWeight: l === "Total" ? 600 : 400 }}>
                    <span>{l}</span>
                    <span className="tabular">{formatCurrency(v)}</span>
                  </div>
                ))}
            </div>
            {view.notes && <p style={{ fontSize: 12.5, color: "var(--text-muted)", whiteSpace: "pre-line" }}>{view.notes}</p>}
            {view.status === "completed" && (
              <button className="btn-danger" style={{ alignSelf: "flex-start" }} onClick={() => setCancelFor(view)}>
                <XCircle size={13} /> Cancel purchase (reverse stock)
              </button>
            )}
          </div>
        )}
      </Modal>
      <ConfirmDialog
        isOpen={!!cancelFor}
        onClose={() => setCancelFor(null)}
        title="Cancel purchase"
        message={`Cancel ${cancelFor?.purchaseNumber}? The received stock will be removed and the supplier balance reduced.`}
        onConfirm={async () => {
          try {
            await purchaseAPI.cancel(cancelFor.id);
            toast.success("Purchase cancelled");
            setCancelFor(null);
            setView(null);
            load(page, filters);
          } catch (e) {
            toast.error(getErrorMessage(e));
            setCancelFor(null);
          }
        }}
      />
    </Page>
  );
}

const emptyForm = () => ({ supplierId: "", invoiceNo: "", purchaseDate: todayStr(), discountAmount: "", otherCharges: "", paidAmount: "", paymentMethod: "cash", notes: "", updatePrices: true, payFull: true });

function PurchaseForm({ isOpen, onClose, onSaved, suppliers }) {
  const [form, setForm] = useState(emptyForm());
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(emptyForm());
      setItems([]);
      setQ("");
      setResults([]);
    }
  }, [isOpen]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const search = useCallback(
    debounce(async (text) => {
      if (!text.trim()) return setResults([]);
      try {
        // Only products still in the catalogue — active: "all" was also returning
        // deleted ones, so a removed product could be added to a new purchase
        const r = await productAPI.getAll({ search: text, limit: 8 });
        setResults(r.data.data.products);
      } catch {
        /* ignore */
      }
    }, 250),
    [],
  );

  const add = (p) => {
    if (items.some((i) => i.productId === p.id)) return toast.error("Already added");
    setItems((list) => [
      ...list,
      { productId: p.id, name: p.name, unit: p.unit, quantity: "", costPrice: num(p.costPrice) || "", taxRate: num(p.taxRate), mrp: p.mrp || "", sellingPrice: p.price || "", expiryDate: "", batchNo: "" },
    ]);
    setQ("");
    setResults([]);
  };
  const setItem = (idx, k, v) => setItems((list) => list.map((it, i) => (i === idx ? { ...it, [k]: v } : it)));

  const subtotal = items.reduce((a, i) => a + num(i.costPrice) * num(i.quantity), 0);
  const tax = items.reduce((a, i) => a + (num(i.costPrice) * num(i.quantity) * num(i.taxRate)) / 100, 0);
  const total = Math.max(0, subtotal + tax + num(form.otherCharges) - num(form.discountAmount));

  const save = async () => {
    const valid = items.filter((i) => num(i.quantity) > 0);
    if (!valid.length) return toast.error("Add products with quantity");
    if (!form.payFull && num(form.paidAmount) < total && !form.supplierId) return toast.error("Select a supplier for an unpaid purchase");
    setSaving(true);
    try {
      const r = await purchaseAPI.create({
        ...form,
        paidAmount: form.payFull ? total : num(form.paidAmount),
        items: valid.map((i) => ({ ...i, quantity: num(i.quantity), costPrice: num(i.costPrice) })),
      });
      toast.success(r.data.message);
      onSaved();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const cell = { padding: "5px 6px", fontSize: 13 };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New purchase" maxWidth={1000}>
      <Grid cols={4}>
        <Field label="Supplier">
          <select className="input-field" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
            <option value="">— none —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Supplier invoice no.">
          <input className="input-field" value={form.invoiceNo} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} />
        </Field>
        <Field label="Date">
          <input className="input-field" type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
        </Field>
        <Field label="Payment method">
          <select className="input-field" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
            {["cash", "upi", "bank", "cheque", "card"].map((m) => (
              <option key={m} value={m}>
                {m.toUpperCase()}
              </option>
            ))}
          </select>
        </Field>
      </Grid>

      <div style={{ position: "relative", margin: "16px 0 10px" }}>
        <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input
          className="input-field"
          style={{ paddingLeft: 34 }}
          placeholder="Search product by name or barcode to add…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            search(e.target.value);
          }}
        />
        {results.length > 0 && (
          <div className="card" style={{ position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", zIndex: 10, maxHeight: 260, overflowY: "auto" }}>
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => add(p)}
                className="table-row-hover"
                style={{ width: "100%", textAlign: "left", display: "flex", justifyContent: "space-between", padding: "9px 14px", border: "none", background: "none", cursor: "pointer", color: "inherit", borderBottom: "1px solid var(--border)" }}
              >
                <span>
                  {p.name} <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{p.barcode}</span>
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>stock {formatQty(p.quantity, p.unit)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>New item? Create it first in Stock → Add product, then add it here.</p>

      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr style={{ background: "var(--bg-sunken)", fontSize: 11.5, color: "var(--text-muted)", textAlign: "left" }}>
              {["Product", "Qty", "Cost (excl. GST)", "GST %", "MRP", "Selling price", "Expiry", "Batch", "Amount", ""].map((h) => (
                <th key={h} style={{ padding: "8px 6px", fontWeight: 500 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={10} style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  No products added
                </td>
              </tr>
            )}
            {items.map((it, i) => {
              const amount = num(it.costPrice) * num(it.quantity) * (1 + num(it.taxRate) / 100);
              // "number" boxes are text inputs that keep digits only, so letters can't be typed or pasted
              const inp = (k, w, type = "number") =>
                type === "number" ? (
                  <input
                    className="input-field"
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={it[k]}
                    onKeyDown={blockNonNumericKeys(true)}
                    onChange={(e) => setItem(i, k, numericOnly(e.target.value, true))}
                    style={{ width: w, padding: "5px 7px", fontSize: 12.5 }}
                  />
                ) : (
                  <input className="input-field" type={type} value={it[k]} onChange={(e) => setItem(i, k, e.target.value)} style={{ width: w, padding: "5px 7px", fontSize: 12.5 }} />
                );
              return (
                <tr key={it.productId} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ ...cell, fontWeight: 500, maxWidth: 180 }}>{it.name}</td>
                  <td style={cell}>{inp("quantity", 70)}</td>
                  <td style={cell}>{inp("costPrice", 90)}</td>
                  <td style={cell}>
                    <select className="input-field" value={it.taxRate} onChange={(e) => setItem(i, "taxRate", e.target.value)} style={{ width: 70, padding: "5px 4px", fontSize: 12.5 }}>
                      {[0, 5, 12, 18, 28].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={cell}>{inp("mrp", 80)}</td>
                  <td style={cell}>{inp("sellingPrice", 80)}</td>
                  <td style={cell}>{inp("expiryDate", 135, "date")}</td>
                  <td style={cell}>{inp("batchNo", 80, "text")}</td>
                  <td style={{ ...cell, textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{formatCurrency(amount)}</td>
                  <td style={cell}>
                    <button className="btn-ghost" style={{ padding: "4px 7px" }} onClick={() => setItems(items.filter((_, x) => x !== i))} aria-label="Remove">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid-main-side" style={{ marginTop: 16 }}>
        <div>
          <Grid cols={2}>
            <Field label="Other charges (freight etc.)">
              <input className="input-field" type="number" min="0" value={form.otherCharges} onChange={(e) => setForm({ ...form, otherCharges: e.target.value })} />
            </Field>
            <Field label="Discount received">
              <input className="input-field" type="number" min="0" value={form.discountAmount} onChange={(e) => setForm({ ...form, discountAmount: e.target.value })} />
            </Field>
            <Field label="Notes" span={2}>
              <input className="input-field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </Grid>
          <div style={{ marginTop: 8 }}>
            <Toggle label="Update product cost / MRP / selling price / expiry" checked={form.updatePrices} onChange={(v) => setForm({ ...form, updatePrices: v })} />
            <Toggle label="Paid in full now" description="Turn off to record a credit purchase (adds to supplier payable)" checked={form.payFull} onChange={(v) => setForm({ ...form, payFull: v })} />
            {!form.payFull && (
              <Field label="Amount paid now">
                <input className="input-field" type="number" min="0" value={form.paidAmount} onChange={(e) => setForm({ ...form, paidAmount: e.target.value })} style={{ maxWidth: 200 }} />
              </Field>
            )}
          </div>
        </div>
        <div className="card-sunken" style={{ padding: 16, fontSize: 13.5, display: "flex", flexDirection: "column", gap: 6, alignSelf: "start" }}>
          {[
            ["Subtotal", subtotal],
            ["GST", tax],
            ["Other charges", num(form.otherCharges)],
            ["Discount", -num(form.discountAmount)],
          ].map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{l}</span>
              <span className="tabular">{formatCurrency(v)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 600, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <span>Total</span>
            <span className="tabular" style={{ color: "var(--accent-dark)" }}>
              {formatCurrency(total)}
            </span>
          </div>
          {!form.payFull && (
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--danger)" }}>
              <span>Due to supplier</span>
              <span className="tabular">{formatCurrency(Math.max(0, total - num(form.paidAmount)))}</span>
            </div>
          )}
          <button className="btn-primary" style={{ justifyContent: "center", marginTop: 10, padding: 11 }} onClick={save} disabled={saving}>
            {saving && <Spinner size={13} color="var(--bg)" />} Save purchase
          </button>
        </div>
      </div>
    </Modal>
  );
}
