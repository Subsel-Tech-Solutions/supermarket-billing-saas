// src/components/dashboard/Dashboard.jsx
import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { IndianRupee, ShoppingBag, Package, TrendingUp, AlertTriangle, Clock, Wallet, Users, RefreshCw } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { reportAPI } from "../../services/api";
import { formatCurrency, formatDateTime, formatDate, formatQty, getErrorMessage, num, PAYMENT_LABELS, paymentColor, currencySymbol } from "../../utils/helpers";
import { StatCard, PageLoader, Pill, EmptyState, Breadcrumbs } from "../shared/UI";
import { useSettings } from "../../context/SettingsContext";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card" style={{ padding: "10px 14px", fontSize: 12.5 }}>
      <p style={{ color: "var(--text-muted)", marginBottom: 4 }}>{label}</p>
      <p style={{ color: "var(--accent-dark)", fontWeight: 600 }}>{formatCurrency(payload[0]?.value)}</p>
      <p style={{ color: "var(--text-muted)" }}>{payload[0]?.payload?.bills} bills</p>
    </div>
  );
};

const Panel = ({ title, icon: Icon, children, action }) => (
  <div className="card fade-in" style={{ overflow: "hidden" }}>
    <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
      {Icon && <Icon size={14} style={{ color: "var(--accent)" }} />}
      <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.02em", flex: 1 }}>{title}</p>
      {action}
    </div>
    {children}
  </div>
);

const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

export default function Dashboard() {
  const { settings } = useSettings();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await reportAPI.getDashboard();
      setData(res.data.data);
      setLoadError("");
    } catch (err) {
      setLoadError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Only poll while the dashboard is actually on screen. A till left open on another
    // tab overnight was otherwise making a full report query every minute.
    let t = null;
    const start = () => {
      if (!t) t = setInterval(load, 60000);
    };
    const stop = () => {
      if (t) clearInterval(t);
      t = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        load();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  if (loading) return <PageLoader />;
  if (!data) {
    return (
      <div className="page-content">
        <Breadcrumbs />
        <EmptyState
          icon={AlertTriangle}
          title="Dashboard unavailable"
          description={loadError}
          action={<button className="btn-primary" onClick={load}>Try again</button>}
        />
      </div>
    );
  }

  const chartData = data.last7Days.map((d) => ({
    date: new Date(`${d.date}T00:00:00`).toLocaleDateString(settings.locale || "en-IN", { weekday: "short", day: "numeric" }),
    revenue: d.revenue,
    bills: d.count,
  }));
  const change = pct(data.today.revenue, data.yesterday.revenue);
  const sym = currencySymbol();

  return (
    <div style={{ maxWidth: 1320, margin: "0 auto" }} className="fade-in page-content">
      <Breadcrumbs />
      <div className="section-head">
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontFamily: "'Fraunces','Playfair Display',serif", fontSize: "clamp(22px, 5vw, 28px)", fontWeight: 300, color: "var(--text-primary)" }}>
            Dashboard
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            {new Date().toLocaleDateString(settings.locale || "en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="section-head-actions">
          <button className="btn-ghost" onClick={load}>
            <RefreshCw size={13} /> Refresh
          </button>
          <Link to="/billing" className="btn-primary" style={{ textDecoration: "none" }}>
            <ShoppingBag size={14} /> New bill
          </Link>
        </div>
      </div>

      {loadError && (
        <div role="alert" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 14px", marginBottom: 16, borderRadius: 8, background: "var(--warning-light, rgba(217, 148, 48, 0.12))", color: "var(--text-secondary)", fontSize: 13 }}>
          <span>Could not refresh dashboard: {loadError}</span>
          <button className="btn-ghost" onClick={load}><RefreshCw size={13} /> Try again</button>
        </div>
      )}

      <div className="stagger grid-stats" style={{ marginBottom: 16 }}>
        <StatCard
          icon={IndianRupee}
          label="Today's sales"
          value={formatCurrency(data.today.revenue)}
          sub={`${data.today.bills} bills${change !== null ? ` · ${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}% vs yesterday` : ""}`}
        />
        <StatCard
          icon={TrendingUp}
          label="This month"
          value={formatCurrency(data.month.revenue)}
          sub={data.canSeeProfit ? `Profit ${formatCurrency(data.month.profit)} · ${data.month.bills} bills` : `${data.month.bills} bills`}
          accentColor="#3a7a5a"
        />
        <StatCard icon={Users} label="Customer dues" value={formatCurrency(data.receivable)} sub="To collect (credit sales)" accentColor="#b06a5a" />
        <StatCard
          icon={Package}
          label="Active products"
          value={data.totalProducts.toLocaleString()}
          // The list below is capped at 10 rows for display, so the real counts come
          // from the server rather than from lowStock.length.
          sub={`${num(data.counts?.lowStock)} low · ${num(data.counts?.outOfStock)} out of stock`}
          accentColor="#3a5a7a"
        />
      </div>

      {data.canSeeProfit && (
        <div className="grid-stats-sm" style={{ marginBottom: 20 }}>
          {[
            ["Today's gross profit", formatCurrency(data.today.profit)],
            ["Avg bill today", formatCurrency(data.today.avgBill)],
            ["Month expenses", formatCurrency(data.month.expenses)],
            ["Month net profit", formatCurrency(data.month.netProfit)],
            ["Supplier payable", formatCurrency(data.payable)],
          ].map(([l, v]) => (
            <div key={l} className="card" style={{ padding: "12px 16px" }}>
              <p style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{l}</p>
              <p className="tabular" style={{ fontSize: 17, fontWeight: 600, marginTop: 2, color: "var(--text-primary)" }}>
                {v}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="grid-main-side" style={{ marginBottom: 16 }}>
        <div className="card fade-in" style={{ padding: "20px 22px", minWidth: 0 }}>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 16 }}>Sales — last 7 days</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${sym}${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--border)", strokeWidth: 1 }} />
              <Area type="monotone" dataKey="revenue" stroke="var(--accent)" strokeWidth={2} fill="url(#grad)" dot={false} activeDot={{ r: 4, fill: "var(--accent)", strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <Panel title="Today's payments" icon={Wallet}>
          <div style={{ padding: "8px 0" }}>
            {data.todayPayments.length === 0 ? (
              <p style={{ padding: "24px 18px", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>No sales yet today</p>
            ) : (
              data.todayPayments.map((p) => (
                <div key={p.method} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 18px", fontSize: 13.5 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: paymentColor(p.method) }} />
                    {PAYMENT_LABELS[p.method] || p.method}
                  </span>
                  <span className="tabular" style={{ fontWeight: 600 }}>
                    {formatCurrency(p.amount)}
                  </span>
                </div>
              ))
            )}
            {data.topToday.length > 0 && (
              <>
                <p style={{ padding: "12px 18px 4px", fontSize: 11.5, color: "var(--text-muted)", borderTop: "1px solid var(--border)", marginTop: 6 }}>Top sellers today</p>
                {data.topToday.map((t) => (
                  <div key={t.name} style={{ display: "flex", justifyContent: "space-between", padding: "5px 18px", fontSize: 12.5 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>{t.name}</span>
                    <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>×{formatQty(t.qty)}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid-panels" style={{ marginBottom: 16 }}>
        <Panel
          title={`Low stock${num(data.counts?.lowStock) > data.lowStock.length ? ` (${num(data.counts.lowStock)})` : ""}`}
          icon={AlertTriangle}
          action={<Link to="/stock" style={{ fontSize: 12, color: "var(--accent-dark)" }}>View all</Link>}
        >
          <div style={{ padding: "6px 0", maxHeight: 330, overflowY: "auto" }}>
            {data.lowStock.length === 0 ? (
              <p style={{ padding: "24px 18px", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>All items stocked ✓</p>
            ) : (
              data.lowStock.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 18px" }}>
                  <div style={{ minWidth: 0, marginRight: 8 }}>
                    <p style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</p>
                    <p style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                      {p.category || "—"} · reorder at {formatQty(p.reorderLevel)}
                    </p>
                  </div>
                  <Pill tone={num(p.quantity) <= 0 ? "danger" : "warning"}>{formatQty(p.quantity, p.unit)} left</Pill>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel title={`Expiring within ${settings.expiryAlertDays || 30} days`} icon={Clock}>
          <div style={{ padding: "6px 0", maxHeight: 330, overflowY: "auto" }}>
            {data.expiring.length === 0 ? (
              <p style={{ padding: "24px 18px", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>Nothing expiring soon ✓</p>
            ) : (
              data.expiring.map((p) => {
                const expired = p.expiryDate < data.todayDate;
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 18px" }}>
                    <div style={{ minWidth: 0, marginRight: 8 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</p>
                      <p style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{formatQty(p.quantity, p.unit)} in stock</p>
                    </div>
                    <Pill tone={expired ? "danger" : "warning"}>{expired ? "Expired" : formatDate(p.expiryDate)}</Pill>
                  </div>
                );
              })
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Recent bills" icon={ShoppingBag} action={<Link to="/transactions" style={{ fontSize: 12, color: "var(--accent-dark)" }}>View all</Link>}>
        {data.recentBills.length === 0 ? (
          <p style={{ padding: 32, textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>No transactions yet</p>
        ) : (
          data.recentBills.map((bill, i) => (
            <div
              key={bill.id}
              className="table-row-hover"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 20px",
                borderBottom: i < data.recentBills.length - 1 ? "1px solid var(--border)" : "none",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: paymentColor(bill.paymentMethod), flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: "var(--text-primary)", fontFamily: "JetBrains Mono, monospace", fontWeight: 500 }}>{bill.billNumber}</p>
                  <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>
                    {formatDateTime(bill.createdAt)}
                    {bill.customerName ? ` · ${bill.customerName}` : ""}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0 }}>
                {bill.status !== "completed" && <Pill tone={bill.status === "cancelled" ? "danger" : "warning"}>{bill.status.replace("_", " ")}</Pill>}
                {num(bill.dueAmount) > 0 && <Pill tone="danger">Due</Pill>}
                <span
                  className="badge hidden sm:inline-flex"
                  style={{ background: "var(--bg-sunken)", color: "var(--text-secondary)", border: "1px solid var(--border)", fontSize: 11 }}
                >
                  {PAYMENT_LABELS[bill.paymentMethod] || bill.paymentMethod}
                </span>
                <p className="tabular" style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", fontFamily: "JetBrains Mono, monospace" }}>
                  {formatCurrency(bill.totalAmount)}
                </p>
              </div>
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}
