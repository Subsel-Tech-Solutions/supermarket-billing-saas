// src/components/customers/Customers.jsx
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Users, Plus, Download } from "lucide-react";
import { customerAPI } from "../../services/api";
import { formatCurrency, formatDate, getErrorMessage, debounce, num, downloadCSV } from "../../utils/helpers";
import { Page, SectionHeader, SearchInput, PageLoader, EmptyState, Table, Th, Td, Pagination, MiniStat, Pill } from "../shared/UI";
import CustomerForm from "./CustomerForm";

export default function Customers() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [dueOnly, setDueOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async (p, q, s, d) => {
    setLoading(true);
    try {
      const r = await customerAPI.getAll({ page: p, limit: 50, search: q || undefined, sort: s, due: d ? "true" : undefined });
      setRows(r.data.data.customers);
      setTotal(r.data.data.total);
      setPages(r.data.data.pages);
      setSummary(r.data.data.summary);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page, search, sort, dueOnly);
  }, [page, sort, dueOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debounced = useCallback(
    debounce((q, s, d) => {
      setPage(1);
      load(1, q, s, d);
    }, 350),
    [],
  );

  return (
    <Page>
      <SectionHeader
        title="Customers"
        subtitle={`${total} customers`}
        actions={
          <>
            <button
              className="btn-ghost"
              onClick={() =>
                downloadCSV("customers.csv", [
                  ["Name", "Phone", "Email", "Bills", "Total spent", "Due", "Points", "Last purchase"],
                  ...rows.map((c) => [c.name, c.phone, c.email, c.totalBills, c.totalSpent, c.balance, c.loyaltyPoints, c.lastPurchaseAt ? formatDate(c.lastPurchaseAt) : ""]),
                ])
              }
            >
              <Download size={13} /> Export
            </button>
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={14} /> Add customer
            </button>
          </>
        }
      />
      {summary && (
        <div className="grid-stats-sm" style={{ marginBottom: 16 }}>
          <MiniStat label="Total customers" value={total} />
          <MiniStat label="Pending dues (to collect)" value={formatCurrency(summary.totalDue)} tone="danger" />
          <MiniStat label="Lifetime sales" value={formatCurrency(summary.totalSpent)} />
          <MiniStat label="Loyalty points outstanding" value={num(summary.totalPoints).toLocaleString()} tone="accent" />
        </div>
      )}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            debounced(v, sort, dueOnly);
          }}
          placeholder="Search name, phone, email…"
          style={{ width: 300, maxWidth: "100%" }}
        />
        <select className="input-field" style={{ width: 170 }} value={sort} onChange={(e) => (setPage(1), setSort(e.target.value))}>
          <option value="recent">Recent purchase</option>
          <option value="spent">Top spenders</option>
          <option value="due">Highest due</option>
          <option value="name">Name A–Z</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={dueOnly} onChange={(e) => (setPage(1), setDueOnly(e.target.checked))} style={{ accentColor: "var(--accent)" }} /> With dues only
        </label>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        {loading ? (
          <PageLoader />
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title="No customers yet" description="Customers are saved automatically when you enter a phone number while billing." />
        ) : (
          <>
            <Table minWidth={760}>
              <thead>
                <tr>
                  <Th>Customer</Th>
                  <Th align="right">Bills</Th>
                  <Th align="right">Total spent</Th>
                  <Th align="right">Due</Th>
                  <Th align="right">Points</Th>
                  <Th>Last purchase</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="table-row-hover" style={{ cursor: "pointer" }} onClick={() => navigate(`/customers/${c.id}`)}>
                    <Td primary>
                      <p style={{ fontWeight: 500 }}>{c.name}</p>
                      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.phone}</p>
                    </Td>
                    <Td label="Bills" align="right" mono>
                      {c.totalBills}
                    </Td>
                    <Td label="Total spent" align="right" mono>
                      {formatCurrency(c.totalSpent)}
                    </Td>
                    <Td label="Due" align="right">
                      {num(c.balance) > 0 ? <Pill tone="danger">{formatCurrency(c.balance)}</Pill> : num(c.balance) < 0 ? <Pill tone="success">Adv {formatCurrency(-num(c.balance))}</Pill> : "—"}
                    </Td>
                    <Td label="Points" align="right" mono>
                      {num(c.loyaltyPoints)}
                    </Td>
                    <Td label="Last purchase" muted>{c.lastPurchaseAt ? formatDate(c.lastPurchaseAt) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pages={pages} onChange={setPage} />
          </>
        )}
      </div>
      <CustomerForm isOpen={showForm} onClose={() => setShowForm(false)} onSaved={(c) => navigate(`/customers/${c.id}`)} />
    </Page>
  );
}
