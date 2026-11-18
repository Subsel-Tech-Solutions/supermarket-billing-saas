// src/components/inventory/Suppliers.jsx — suppliers / vendors with payable balance
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Truck, Plus, Edit2, Wallet, Trash2 } from "lucide-react";
import { supplierAPI } from "../../services/api";
import { formatCurrency, formatDate, formatDateTime, getErrorMessage, num } from "../../utils/helpers";
import { Page, SectionHeader, SearchInput, PageLoader, EmptyState, Table, Th, Td, Modal, Field, Grid, Spinner, MiniStat, Pill, ConfirmDialog } from "../shared/UI";
import PaymentModal from "../customers/PaymentModal";

const EMPTY = { name: "", contactPerson: "", phone: "", email: "", gstNumber: "", address: "", notes: "", openingBalance: "" };

export default function Suppliers() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState(null); // null | {} | supplier
  const [detail, setDetail] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [delFor, setDelFor] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await supplierAPI.getAll();
      setRows(r.data.data.suppliers);
      setSummary(r.data.data.summary);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (s) => {
    try {
      const r = await supplierAPI.getById(s.id);
      setDetail(r.data.data);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const filtered = rows.filter((s) => {
    const q = search.toLowerCase();
    return !q || [s.name, s.phone, s.contactPerson, s.gstNumber].some((v) => String(v || "").toLowerCase().includes(q));
  });

  return (
    <Page>
      <SectionHeader
        title="Suppliers"
        subtitle={`${rows.length} suppliers`}
        actions={
          <button className="btn-primary" onClick={() => setEdit({})}>
            <Plus size={14} /> Add supplier
          </button>
        }
      />
      {summary && (
        <div className="grid-stats-sm" style={{ marginBottom: 16 }}>
          <MiniStat label="Suppliers" value={rows.length} />
          <MiniStat label="Total payable" value={formatCurrency(summary.totalPayable)} tone="danger" />
        </div>
      )}
      <SearchInput value={search} onChange={setSearch} placeholder="Search supplier…" style={{ maxWidth: 360, marginBottom: 14 }} />
      <div className="card" style={{ overflow: "hidden" }}>
        {loading ? (
          <PageLoader />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Truck} title="No suppliers" description="Add the distributors / wholesalers you buy from." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Supplier</Th>
                <Th>Contact</Th>
                <Th>GSTIN</Th>
                <Th align="right">Payable</Th>
                <Th align="center">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="table-row-hover">
                  <Td primary>
                    <button onClick={() => openDetail(s)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text-primary)", fontWeight: 600, fontSize: 13.5, textAlign: "left" }}>
                      {s.name}
                    </button>
                  </Td>
                  <Td label="Contact" muted>{[s.contactPerson, s.phone].filter(Boolean).join(" · ") || "—"}</Td>
                  <Td label="GSTIN" mono muted>
                    {s.gstNumber || "—"}
                  </Td>
                  <Td label="Payable" align="right">{num(s.balance) > 0 ? <Pill tone="danger">{formatCurrency(s.balance)}</Pill> : <span style={{ color: "var(--text-muted)" }}>{formatCurrency(s.balance)}</span>}</Td>
                  <Td label="Actions" align="center">
                    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                      <button className="btn-ghost" style={{ padding: "5px 9px" }} title="Pay" onClick={() => setPayFor(s)}>
                        <Wallet size={13} />
                      </button>
                      <button className="btn-ghost" style={{ padding: "5px 9px" }} title="Edit" onClick={() => setEdit(s)}>
                        <Edit2 size={13} />
                      </button>
                      <button className="btn-ghost" style={{ padding: "5px 9px" }} title="Delete" onClick={() => setDelFor(s)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <SupplierForm supplier={edit} onClose={() => setEdit(null)} onSaved={load} />
      <PaymentModal
        isOpen={!!payFor}
        onClose={() => setPayFor(null)}
        title={`Pay ${payFor?.name || ""}`}
        balance={num(payFor?.balance)}
        methods={["cash", "upi", "bank", "cheque", "card", "other"]}
        onSubmit={async (p) => {
          await supplierAPI.pay(payFor.id, p);
          toast.success("Payment recorded");
          load();
        }}
      />
      <ConfirmDialog
        isOpen={!!delFor}
        onClose={() => setDelFor(null)}
        title="Remove supplier"
        message={`Remove ${delFor?.name}? Purchase history is kept.`}
        onConfirm={async () => {
          try {
            await supplierAPI.delete(delFor.id);
            toast.success("Supplier removed");
            setDelFor(null);
            load();
          } catch (e) {
            toast.error(getErrorMessage(e));
          }
        }}
      />
      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title={detail?.supplier.name} maxWidth={680}>
        {detail && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="form-grid-3" style={{ gap: 10 }}>
              <MiniStat label="Payable" value={formatCurrency(detail.supplier.balance)} tone={num(detail.supplier.balance) > 0 ? "danger" : undefined} />
              <MiniStat label="Purchases" value={detail.purchases.length} />
              <MiniStat label="Products supplied" value={detail.productCount} />
            </div>
            <p style={{ fontSize: 13, fontWeight: 600 }}>Purchases</p>
            <Table minWidth={460}>
              <thead>
                <tr>
                  <Th>No.</Th>
                  <Th>Date</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Due</Th>
                </tr>
              </thead>
              <tbody>
                {detail.purchases.map((p) => (
                  <tr key={p.id}>
                    <Td primary mono>
                      {p.purchaseNumber} {p.status === "cancelled" && <Pill tone="danger">cancelled</Pill>}
                    </Td>
                    <Td label="Date" muted>{formatDate(p.purchaseDate)}</Td>
                    <Td label="Total" align="right" mono>
                      {formatCurrency(p.totalAmount)}
                    </Td>
                    <Td label="Due" align="right" mono style={{ color: num(p.dueAmount) > 0 ? "var(--danger)" : undefined }}>
                      {formatCurrency(p.dueAmount)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <p style={{ fontSize: 13, fontWeight: 600 }}>Payments</p>
            {detail.payments.length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>None</p>}
            {detail.payments.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid var(--border)", padding: "5px 0" }}>
                <span>
                  {formatDateTime(p.createdAt)} · {p.method.toUpperCase()} {p.reference ? `· ${p.reference}` : ""}
                </span>
                <b className="tabular">{formatCurrency(p.amount)}</b>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </Page>
  );
}

function SupplierForm({ supplier, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const isEdit = !!supplier?.id;
  useEffect(() => {
    if (supplier) setForm({ ...EMPTY, ...supplier, openingBalance: "" });
  }, [supplier]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    if (!form.name.trim()) return toast.error("Supplier name is required");
    setSaving(true);
    try {
      if (isEdit) await supplierAPI.update(supplier.id, form);
      else await supplierAPI.create(form);
      toast.success(isEdit ? "Supplier updated" : "Supplier added");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal isOpen={!!supplier} onClose={onClose} title={isEdit ? "Edit supplier" : "Add supplier"} maxWidth={540}>
      <Grid cols={2}>
        <Field label="Name" required span={2}>
          <input className="input-field" value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
        </Field>
        <Field label="Contact person">
          <input className="input-field" value={form.contactPerson || ""} onChange={(e) => set("contactPerson", e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className="input-field" value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Email">
          <input className="input-field" value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="GSTIN">
          <input className="input-field" value={form.gstNumber || ""} onChange={(e) => set("gstNumber", e.target.value)} />
        </Field>
        <Field label="Address" span={2}>
          <textarea className="input-field" rows={2} value={form.address || ""} onChange={(e) => set("address", e.target.value)} />
        </Field>
        {!isEdit && (
          <Field label="Opening balance (you owe)">
            <input className="input-field" type="number" min="0" value={form.openingBalance} onChange={(e) => set("openingBalance", e.target.value)} />
          </Field>
        )}
        <Field label="Notes" span={isEdit ? 2 : 1}>
          <input className="input-field" value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </Grid>
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button className="btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={save} disabled={saving}>
          {saving && <Spinner size={13} color="var(--bg)" />} Save
        </button>
      </div>
    </Modal>
  );
}
