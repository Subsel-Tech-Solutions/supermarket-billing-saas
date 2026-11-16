// src/components/dashboard/DayEnd.jsx — end-of-day cash register closing
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Printer, Calculator } from "lucide-react";
import { reportAPI } from "../../services/api";
import { formatCurrency, getErrorMessage, todayStr, num, PAYMENT_LABELS, escapeHtml, formatDate, numericOnly, blockNonNumericKeys } from "../../utils/helpers";
import { printHtml } from "../../utils/receipt";
import { useSettings } from "../../context/SettingsContext";
import { Page, SectionHeader, PageLoader, MiniStat } from "../shared/UI";

const DENOMS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

export default function DayEnd() {
  const { settings } = useSettings();
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await reportAPI.getDayEnd({ date });
      setData(r.data.data);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [date]);
  useEffect(() => {
    load();
  }, [load]);

  const counted = DENOMS.reduce((a, d) => a + d * num(counts[d]), 0);
  const expected = data?.cash.expectedInDrawer || 0;
  const diff = Math.round((counted - expected) * 100) / 100;

  const print = () => {
    if (!data) return;
    const row = (l, v) => `<tr><td>${escapeHtml(l)}</td><td style="text-align:right">${escapeHtml(v)}</td></tr>`;
    // Printed through a hidden iframe, so a pop-up blocker cannot silently swallow the
    // day-closing slip the owner signs.
    const ok = printHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Day closing ${escapeHtml(data.date)}</title>
      <style>@page{size:80mm auto;margin:4mm}body{font-family:'Courier New',monospace;font-size:12px;width:76mm;margin:0 auto}table{width:100%;border-collapse:collapse}h2{text-align:center;font-family:Arial,sans-serif;font-size:16px}hr{border:0;border-top:1px dashed #000;margin:6px 0}</style>
      </head><body>
      <h2>${escapeHtml(settings.businessName)}</h2><div style="text-align:center">Day closing — ${escapeHtml(formatDate(data.date))}</div><hr>
      <table>${row("Bills", data.sales.bills)}${row("Net sales", formatCurrency(data.sales.revenue))}${row("Cancelled bills", data.cancelledBills)}</table><hr>
      <table>${data.payments.map((p) => row(PAYMENT_LABELS[p.method] || p.method, formatCurrency(p.amount))).join("")}</table><hr>
      <table>${row("Cash sales", formatCurrency(data.cash.sales))}${row("+ Dues collected (cash)", formatCurrency(data.cash.collected))}${row("− Expenses (cash)", formatCurrency(data.cash.expenses))}${row("− Refunds (cash)", formatCurrency(data.cash.refunds))}${row("− Cancelled bills (cash)", formatCurrency(data.cash.cancellations))}${row("− Paid to suppliers (cash)", formatCurrency(data.cash.suppliers))}${row("Expected in drawer", formatCurrency(expected))}${counted ? row("Counted", formatCurrency(counted)) + row("Difference", formatCurrency(diff)) : ""}</table><hr>
      <div style="margin-top:30px">Signature: ____________</div>
      </body></html>`);
    if (!ok) toast.error("Could not open the print dialog");
  };

  return (
    <Page maxWidth={1100}>
      <SectionHeader
        title="Day Closing"
        subtitle="Cash register summary — count the drawer and match"
        actions={
          <>
            <input type="date" className="input-field" style={{ width: 160 }} value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
            <button className="btn-ghost" onClick={print} disabled={!data}>
              <Printer size={13} /> Print
            </button>
          </>
        }
      />
      {loading || !data ? (
        <PageLoader />
      ) : (
        <>
          <div className="grid-stats-sm" style={{ marginBottom: 16 }}>
            <MiniStat label="Bills" value={data.sales.bills} />
            <MiniStat label="Net sales" value={formatCurrency(data.sales.revenue)} tone="accent" />
            <MiniStat label="Credit given" value={formatCurrency(data.sales.due)} tone="danger" />
            <MiniStat label="Dues collected" value={formatCurrency(data.collections)} tone="success" />
            <MiniStat label="Expenses" value={formatCurrency(data.expenses)} />
            <MiniStat label="Cancelled bills" value={data.cancelledBills} />
          </div>
          <div className="grid-panels">
            <div className="card" style={{ padding: 20, minWidth: 0 }}>
              <h3 style={{ fontSize: 17, marginBottom: 12 }}>Payments received</h3>
              {data.payments.length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No sales on this day</p>}
              {data.payments.map((p) => (
                <div key={p.method} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 14 }}>
                  <span>{PAYMENT_LABELS[p.method] || p.method}</span>
                  <b className="tabular">{formatCurrency(p.amount)}</b>
                </div>
              ))}
              <h3 style={{ fontSize: 17, margin: "20px 0 12px" }}>Cash in drawer</h3>
              {[
                ["Cash sales", data.cash.sales, "+"],
                ["Dues collected in cash", data.cash.collected, "+"],
                ["Expenses paid in cash", data.cash.expenses, "−"],
                ["Refunds in cash", data.cash.refunds, "−"],
                ["Cancelled bills refunded in cash", data.cash.cancellations, "−"],
                ["Paid to suppliers in cash", data.cash.suppliers, "−"],
              ].map(([l, v, s]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13.5, color: "var(--text-secondary)" }}>
                  <span>
                    {s} {l}
                  </span>
                  <span className="tabular">{formatCurrency(v)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", marginTop: 6, borderTop: "1px solid var(--border)", fontSize: 17, fontWeight: 600 }}>
                <span>Expected cash</span>
                <span className="tabular" style={{ color: "var(--accent-dark)" }}>
                  {formatCurrency(expected)}
                </span>
              </div>
              <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 6 }}>Add your opening cash float to this amount.</p>
            </div>

            <div className="card" style={{ padding: 20, minWidth: 0 }}>
              <h3 style={{ fontSize: 17, marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <Calculator size={16} /> Count the drawer
              </h3>
              {DENOMS.map((d) => (
                // minmax(0,…) on the middle column so the number input can shrink on a
                // narrow phone instead of pushing the line total off the card
                <div
                  key={d}
                  style={{ display: "grid", gridTemplateColumns: "58px minmax(0, 1fr) 92px", alignItems: "center", gap: 8, marginBottom: 6 }}
                >
                  <span className="tabular" style={{ fontSize: 13.5, fontWeight: 500 }}>
                    {settings.currencySymbol}
                    {d}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="input-field"
                    style={{ padding: "6px 10px", textAlign: "center" }}
                    value={counts[d] || ""}
                    onKeyDown={blockNonNumericKeys(false)}
                    onChange={(e) => setCounts({ ...counts, [d]: numericOnly(e.target.value, false) })}
                    placeholder="0"
                    aria-label={`Number of ${settings.currencySymbol}${d} notes`}
                  />
                  <span className="tabular truncate-1" style={{ textAlign: "right", fontSize: 13, color: "var(--text-secondary)" }}>
                    {formatCurrency(d * num(counts[d]))}
                  </span>
                </div>
              ))}
              <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10, fontSize: 15 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                  <span>Counted</span>
                  <span className="tabular">{formatCurrency(counted)}</span>
                </div>
                {counted > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, marginTop: 6, color: Math.abs(diff) < 1 ? "var(--success)" : "var(--danger)" }}>
                    <span>{Math.abs(diff) < 1 ? "Matched ✓" : diff > 0 ? "Excess" : "Short"}</span>
                    <span className="tabular">{formatCurrency(diff)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
