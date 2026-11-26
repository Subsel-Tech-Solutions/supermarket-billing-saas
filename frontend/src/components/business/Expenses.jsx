// src/components/business/Expenses.jsx — record daily shop expenses
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Wallet, Plus, Edit2, Trash2, Download } from "lucide-react";
import { expenseAPI } from "../../services/api";
import { formatCurrency, formatDate, getErrorMessage, num, todayStr, monthStartStr, downloadCSV } from "../../utils/helpers";
import { useSettings } from "../../context/SettingsContext";
import { Page, SectionHeader, PageLoader, EmptyState, Table, Th, Td, Modal, Field, Grid, Spinner, MiniStat, ConfirmDialog, Pagination } from "../shared/UI";

const emptyForm = (cat) => ({ category: cat, amount: "", expenseDate: todayStr(), paymentMethod: "cash", paidTo: "", reference: "", notes: "" });

export default function Expenses() {
  const { settings } = useSettings();
  const cats = settings.expenseCategories?.length ? settings.expenseCategories : ["General"];
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState({ startDate: monthStartStr(), endDate: todayStr(), category: "" });
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(emptyForm(cats[0]));
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 50, startDate: range.startDate, endDate: range.endDate };
      if (range.category) params.category = range.category;
      const r = await expenseAPI.getAll(params);
      setRows(r.data.data.expenses);
      setPages(r.data.data.pages);
      setSummary(r.data.data.summary);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [page, range]);
  useEffect(() => {
    load();
  }, [load]);

  const open = (e) => {
    setEdit(e || {});
    setForm(e ? { ...emptyForm(cats[0]), ...e } : emptyForm(cats[0]));
  };
  const save = async () => {
    if (!(num(form.amount) > 0)) return toast.error("Enter a valid amount");
    setSaving(true);
    try {
      if (edit?.id) await expenseAPI.update(edit.id, form);
      else await expenseAPI.create(form);
      toast.success("Expense saved");
      setEdit(null);
      load();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const allCats = [...new Set([...cats, ...(summary?.byCategory || []).map((c) => c.category)])];

  return (
    <Page>
      <SectionHeader
        title="Expenses"
        subtitle="Rent, salary, electricity and other shop costs"
        actions={
          <>
            <button
              className="btn-ghost"
              disabled={!rows.length}
              onClick={() =>
                downloadCSV("expenses.csv", [["Date", "Category", "Paid to", "Method", "Reference", "Notes", "Amount"], ...rows.map((e) => [e.expenseDate, e.category, e.paidTo, e.paymentMethod, e.reference, e.notes, e.amount])])
              }
            >
              <Download size={13} /> Export
            </button>
            <button className="btn-primary" onClick={() => open(null)}>
              <Plus size={14} /> Add expense
            </button>
          </>
        }
      />
      <div className="card" style={{ padding: "12px 16px", marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div className="filter-date-range">
          <input type="date" className="input-field filter-control" value={range.startDate} onChange={(e) => (setPage(1), setRange({ ...range, startDate: e.target.value }))} />
          <span style={{ color: "var(--text-muted)" }}>to</span>
          <input type="date" className="input-field filter-control" value={range.endDate} onChange={(e) => (setPage(1), setRange({ ...range, endDate: e.target.value }))} />
        </div>
        <select className="input-field filter-control" value={range.category} onChange={(e) => (setPage(1), setRange({ ...range, category: e.target.value }))}>
          <option value="">All categories</option>
          {allCats.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {summary && (
        <div className="grid-stats-sm" style={{ marginBottom: 16 }}>
          <MiniStat label="Total" value={formatCurrency(summary.totalAmount)} tone="danger" />
          {summary.byCategory.slice(0, 5).map((c) => (
            <MiniStat key={c.category} label={c.category} value={formatCurrency(c.total)} />
          ))}
        </div>
      )}
      <div className="card" style={{ overflow: "hidden" }}>
        {loading ? (
          <PageLoader />
        ) : rows.length === 0 ? (
          <EmptyState icon={Wallet} title="No expenses in this period" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Category</Th>
                  <Th>Paid to / notes</Th>
                  <Th>Method</Th>
                  <Th align="right">Amount</Th>
                  <Th align="center"></Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <Td primary muted>{formatDate(e.expenseDate)}</Td>
                    <Td label="Category" style={{ fontWeight: 500 }}>{e.category}</Td>
                    <Td label="Paid to / notes" muted>{[e.paidTo, e.reference, e.notes].filter(Boolean).join(" · ") || "—"}</Td>
                    <Td label="Method">{String(e.paymentMethod).toUpperCase()}</Td>
                    <Td label="Amount" align="right" mono>
                      {formatCurrency(e.amount)}
                    </Td>
                    <Td actions align="center">
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button className="btn-ghost" style={{ padding: "4px 8px" }} onClick={() => open(e)} aria-label="Edit">
                          <Edit2 size={13} />
                        </button>
                        <button className="btn-ghost" style={{ padding: "4px 8px" }} onClick={() => setDel(e)} aria-label="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pages={pages} onChange={setPage} />
          </>
        )}
      </div>

      <Modal isOpen={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit expense" : "Add expense"} maxWidth={500}>
        <Grid cols={2}>
          <Field label="Category">
            <select className="input-field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {allCats.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount" required>
            <input className="input-field" type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} autoFocus />
          </Field>
          <Field label="Date">
            <input className="input-field" type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
          </Field>
          <Field label="Paid via">
            <select className="input-field" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
              {["cash", "upi", "bank", "card", "cheque"].map((m) => (
                <option key={m} value={m}>
                  {m.toUpperCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Paid to">
            <input className="input-field" value={form.paidTo || ""} onChange={(e) => setForm({ ...form, paidTo: e.target.value })} />
          </Field>
          <Field label="Reference / bill no.">
            <input className="input-field" value={form.reference || ""} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </Field>
          <Field label="Notes" span={2}>
            <input className="input-field" value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </Grid>
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button className="btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => setEdit(null)}>
            Cancel
          </button>
          <button className="btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={save} disabled={saving}>
            {saving && <Spinner size={13} color="var(--bg)" />} Save
          </button>
        </div>
      </Modal>
      <ConfirmDialog
        isOpen={!!del}
        onClose={() => setDel(null)}
        title="Delete expense"
        message={`Delete ${del?.category} expense of ${formatCurrency(del?.amount)}?`}
        onConfirm={async () => {
          try {
            await expenseAPI.delete(del.id);
            toast.success("Deleted");
            setDel(null);
            load();
          } catch (e) {
            toast.error(getErrorMessage(e));
          }
        }}
      />
    </Page>
  );
}
