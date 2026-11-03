// src/components/dashboard/Reports.jsx — business reports with date range + CSV export
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BarChart3, Package, Layers, Percent, TrendingUp, Users, Clock, Download, IndianRupee, ShoppingBag, Receipt, ShieldCheck } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { reportAPI } from "../../services/api";
import { formatCurrency, formatQty, formatDate, getErrorMessage, downloadCSV, ymd, PAYMENT_LABELS, currencySymbol } from "../../utils/helpers";
import { Page, SectionHeader, Tabs, StatCard, PageLoader, Table, Th, Td, MiniStat, EmptyState, Pill } from "../shared/UI";
import { useAuth } from "../../context/AuthContext";

const PIE = ["var(--accent)", "#3a7a5a", "#3a5a7a", "#8a5cc2", "#b06a5a", "#7a7a3a", "#5a7a7a"];

const presets = () => {
  const t = new Date();
  const d = (y, m, day) => ymd(new Date(y, m, day));
  const Y = t.getFullYear();
  const M = t.getMonth();
  const monday = new Date(t);
  monday.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  const fyStart = M >= 3 ? new Date(Y, 3, 1) : new Date(Y - 1, 3, 1);
  const yest = new Date(t);
  yest.setDate(t.getDate() - 1);
  return [
    ["today", "Today", ymd(t), ymd(t)],
    ["yesterday", "Yesterday", ymd(yest), ymd(yest)],
    ["week", "This week", ymd(monday), ymd(t)],
    ["month", "This month", d(Y, M, 1), ymd(t)],
    ["lastMonth", "Last month", d(Y, M - 1, 1), d(Y, M, 0)],
    ["fy", "This FY", ymd(fyStart), ymd(t)],
  ];
};

const ChartTip = ({ active, payload, label }) =>
  active && payload?.length ? (
    <div className="card" style={{ padding: "8px 12px", fontSize: 12.5 }}>
      <p style={{ color: "var(--text-muted)" }}>{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ fontWeight: 600 }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  ) : null;

export default function Reports() {
  const { can } = useAuth();
  const [tab, setTab] = useState("sales");
  const [preset, setPreset] = useState("month");
  const [range, setRange] = useState(() => {
    const p = presets().find((x) => x[0] === "month");
    return { startDate: p[2], endDate: p[3] };
  });
  // data is stored together with the tab it belongs to, so a tab switch never renders stale data
  const [result, setResult] = useState({ tab: null, data: null });
  const data = result.tab === tab ? result.data : null;
  const [loading, setLoading] = useState(true);
  const [expiryDays, setExpiryDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = { ...range };
      const fetchers = {
        sales: () => reportAPI.getSales(p),
        products: () => reportAPI.getTopProducts({ ...p, limit: 100 }),
        categories: () => reportAPI.getCategories(p),
        gst: () => reportAPI.getGst(p),
        profit: () => reportAPI.getProfit(p),
        staff: () => reportAPI.getStaff(p),
        stock: () => reportAPI.getStockReport(p),
        expiry: () => reportAPI.getExpiry({ days: expiryDays }),
        audit: () => reportAPI.getAuditLogs({ ...p, limit: 100 }),
      };
      const r = await fetchers[tab]();
      setResult({ tab, data: r.data.data });
    } catch (e) {
      toast.error(getErrorMessage(e));
      setResult({ tab, data: null });
    } finally {
      setLoading(false);
    }
  }, [tab, range, expiryDays]);

  useEffect(() => {
    load();
  }, [load]);

  const tabs = [
    { value: "sales", label: "Sales", icon: BarChart3 },
    { value: "products", label: "Products", icon: Package },
    { value: "categories", label: "Categories", icon: Layers },
    { value: "gst", label: "GST", icon: Percent },
    ...(can("owner") ? [{ value: "profit", label: "Profit & Loss", icon: TrendingUp }] : []),
    { value: "staff", label: "Staff", icon: Users },
    { value: "stock", label: "Stock movement", icon: Package },
    { value: "expiry", label: "Expiry", icon: Clock },
    { value: "audit", label: "Audit Trail", icon: ShieldCheck },
  ];

  const exportCSV = () => {
    if (!data) return;
    const name = `${tab}_${range.startDate}_to_${range.endDate}.csv`;
    if (tab === "sales") downloadCSV(name, [["Date", "Bills", "Revenue", "Tax", "Discount"], ...data.daily.map((d) => [d.date, d.bills, d.revenue, d.tax, d.discount])]);
    if (tab === "products") downloadCSV(name, [["Product", "Qty sold", "Revenue", "Profit", "Bills"], ...data.topProducts.map((p) => [p.productName, p.totalSold, p.totalRevenue, p.profit, p.orderCount])]);
    if (tab === "categories") downloadCSV(name, [["Category", "Qty", "Revenue", "Profit"], ...data.categories.map((c) => [c.category, c.qty, c.revenue, c.profit])]);
    if (tab === "gst")
      downloadCSV(name, [
        ["GST %", "Supply", "Taxable", "CGST", "SGST", "IGST", "Total tax", "Invoice value"],
        ...data.slabs.map((s) => [s.rate, s.interState ? "Inter-state" : "Intra-state", s.taxable, s.cgst, s.sgst, s.igst, s.tax, s.total]),
        ["", "Total", data.totals.taxable, data.totals.cgst, data.totals.sgst, data.totals.igst, data.totals.outputTax, ""],
        [],
        ["HSN", "GST %", "Qty", "Taxable", "Tax"],
        ...data.hsn.map((h) => [h.hsn, h.rate, h.qty, h.taxable, h.tax]),
      ]);
    if (tab === "profit") downloadCSV(name, [["Date", "Revenue", "Tax", "Cost", "Gross profit"], ...data.daily.map((d) => [d.date, d.revenue, d.tax, d.cost, d.profit])]);
    if (tab === "staff") downloadCSV(name, [["Cashier", "Bills", "Revenue", "Discount", "Cancelled"], ...data.staff.map((s) => [s.cashier, s.bills, s.revenue, s.discount, s.cancelled])]);
    if (tab === "stock")
      downloadCSV(name, [
        ["Product", "Barcode", "Category", "Opening", "Inward", "Sold", "Adjustment", "Closing", "Cost", "Stock value"],
        ...data.map((r) => [r.name, r.barcode, r.category, r.openingStock, r.inward, r.soldQty, r.adjustment, r.closingStock, r.costPrice, r.stockValue]),
      ]);
    if (tab === "expiry")
      downloadCSV(name, [["Product", "Barcode", "Batch", "Expiry", "Qty"], ...[...data.expired, ...data.expiring].map((p) => [p.name, p.barcode, p.batchNo, p.expiryDate, p.quantity])]);
    if (tab === "audit")
      downloadCSV(name, [
        ["Date", "Action", "Entity", "ID", "User", "Role", "Details / Diff"],
        ...(data.logs || []).map((l) => [
          formatDate(l.createdAt),
          l.action,
          l.entityType,
          l.entityId || "",
          l.username || "",
          l.userRole || "",
          JSON.stringify(l.diff && Object.keys(l.diff).length ? l.diff : l.details || {}),
        ]),
      ]);
  };

  return (
    <Page maxWidth={1320}>
      <SectionHeader
        title="Reports"
        subtitle={tab === "expiry" ? "Products nearing expiry" : `${formatDate(range.startDate)} – ${formatDate(range.endDate)}`}
        actions={
          <button className="btn-ghost" onClick={exportCSV} disabled={!data}>
            <Download size={13} /> Export CSV
          </button>
        }
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab !== "expiry" ? (
        <div className="card" style={{ padding: "12px 16px", marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {presets().map(([k, label, s, e]) => (
            <button
              key={k}
              className={preset === k ? "btn-primary" : "btn-ghost"}
              style={{ padding: "6px 12px" }}
              onClick={() => {
                setPreset(k);
                setRange({ startDate: s, endDate: e });
              }}
            >
              {label}
            </button>
          ))}
          <input type="date" className="input-field" style={{ width: 150 }} value={range.startDate} onChange={(e) => (setPreset(""), setRange({ ...range, startDate: e.target.value }))} />
          <span style={{ color: "var(--text-muted)" }}>to</span>
          <input type="date" className="input-field" style={{ width: 150 }} value={range.endDate} onChange={(e) => (setPreset(""), setRange({ ...range, endDate: e.target.value }))} />
        </div>
      ) : (
        <div className="card" style={{ padding: "12px 16px", marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          Show products expiring within
          {[7, 15, 30, 60, 90].map((d) => (
            <button key={d} className={expiryDays === d ? "btn-primary" : "btn-ghost"} style={{ padding: "6px 12px" }} onClick={() => setExpiryDays(d)}>
              {d} days
            </button>
          ))}
        </div>
      )}

      {loading || result.tab !== tab ? <PageLoader /> : !data ? <EmptyState icon={BarChart3} title="No data" /> : <ReportBody tab={tab} data={data} />}
    </Page>
  );
}

function ReportBody({ tab, data }) {
  const sym = currencySymbol();
  if (tab === "sales") {
    const s = data.summary;
    return (
      <>
        <div className="grid-stats" style={{ marginBottom: 14 }}>
          <StatCard icon={IndianRupee} label="Net sales" value={formatCurrency(s.totalRevenue)} sub={`${s.totalBills} bills`} />
          <StatCard icon={Receipt} label="Average bill" value={formatCurrency(s.averageBillValue)} sub={`${formatQty(s.totalItems)} items sold`} accentColor="#3a5a7a" />
          <StatCard icon={Percent} label="Tax collected" value={formatCurrency(s.totalTax)} sub={`Discounts ${formatCurrency(s.totalDiscount)}`} accentColor="#7a5a3a" />
          {s.grossProfit !== undefined && <StatCard icon={TrendingUp} label="Gross profit" value={formatCurrency(s.grossProfit)} sub={`Cost ${formatCurrency(s.costOfGoods)}`} accentColor="#3a7a5a" />}
        </div>
        <div className="grid-stats-sm" style={{ marginBottom: 16 }}>
          <MiniStat label="Credit given (due)" value={formatCurrency(s.totalDue)} tone="danger" />
          <MiniStat label="Dues collected" value={formatCurrency(s.duesCollected)} tone="success" />
          <MiniStat label="Returns" value={formatCurrency(s.totalReturns)} />
        </div>
        <div className="grid-main-side" style={{ marginBottom: 16 }}>
          <div className="card" style={{ padding: 20 }}>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12 }}>Daily sales</p>
            {data.daily.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.daily.map((d) => ({ ...d, label: d.date.slice(5) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${sym}${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: "var(--bg-sunken)" }} />
                  <Bar dataKey="revenue" name="Sales" fill="var(--accent)" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: 13, padding: 30, textAlign: "center" }}>No sales in this period</p>
            )}
          </div>
          <div className="card" style={{ padding: 20 }}>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12 }}>Payment methods</p>
            {data.payments.length ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={data.payments} dataKey="amount" nameKey="method" innerRadius={42} outerRadius={70} paddingAngle={2}>
                      {data.payments.map((p, i) => (
                        <Cell key={p.method} fill={PIE[i % PIE.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                {data.payments.map((p, i) => (
                  <div key={p.method} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: PIE[i % PIE.length] }} />
                      {PAYMENT_LABELS[p.method] || p.method}
                    </span>
                    <b className="tabular">{formatCurrency(p.amount)}</b>
                  </div>
                ))}
              </>
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>—</p>
            )}
          </div>
        </div>
        {data.hourly.length > 0 && (
          <div className="card" style={{ padding: 20 }}>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12 }}>Busy hours</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.hourly.map((h) => ({ ...h, label: `${h.hour % 12 || 12}${h.hour < 12 ? "am" : "pm"}` }))}>
                <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "var(--bg-sunken)" }} />
                <Bar dataKey="revenue" name="Sales" fill="#3a7a5a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </>
    );
  }

  if (tab === "products")
    return (
      <div className="card" style={{ overflow: "hidden" }}>
        <Table stack={false}>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Product</Th>
              <Th align="right">Qty sold</Th>
              <Th align="right">Revenue</Th>
              <Th align="right">Profit</Th>
              <Th align="right">Bills</Th>
            </tr>
          </thead>
          <tbody>
            {data.topProducts.map((p, i) => (
              <tr key={p.productId}>
                <Td muted>{i + 1}</Td>
                <Td style={{ fontWeight: 500 }}>{p.productName}</Td>
                <Td align="right" mono>{formatQty(p.totalSold)}</Td>
                <Td align="right" mono>{formatCurrency(p.totalRevenue)}</Td>
                <Td align="right" mono style={{ color: p.profit < 0 ? "var(--danger)" : "var(--success)" }}>
                  {formatCurrency(p.profit)}
                </Td>
                <Td align="right" mono>{p.orderCount}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!data.topProducts.length && <EmptyState icon={ShoppingBag} title="No sales in this period" />}
      </div>
    );

  if (tab === "categories")
    return (
      <div className="card" style={{ overflow: "hidden" }}>
        <Table stack={false}>
          <thead>
            <tr>
              <Th>Category</Th>
              <Th align="right">Qty</Th>
              <Th align="right">Revenue</Th>
              <Th align="right">Profit</Th>
            </tr>
          </thead>
          <tbody>
            {data.categories.map((c) => (
              <tr key={c.category}>
                <Td style={{ fontWeight: 500 }}>{c.category}</Td>
                <Td align="right" mono>{formatQty(c.qty)}</Td>
                <Td align="right" mono>{formatCurrency(c.revenue)}</Td>
                <Td align="right" mono>{formatCurrency(c.profit)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!data.categories.length && <EmptyState icon={Layers} title="No sales in this period" />}
      </div>
    );

  if (tab === "gst")
    return (
      <>
        <div className="grid-stats-sm" style={{ marginBottom: 16 }}>
          <MiniStat label="Taxable value" value={formatCurrency(data.totals.taxable)} />
          <MiniStat label="Output tax (sales)" value={formatCurrency(data.totals.outputTax)} />
          <MiniStat label="Input tax (purchases)" value={formatCurrency(data.totals.inputTax)} tone="success" />
          <MiniStat label="Net payable" value={formatCurrency(data.totals.netPayable)} tone="accent" />
        </div>
        <div className="card" style={{ overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, borderBottom: "1px solid var(--border)" }}>Rate-wise summary {data.gstNumber ? `· GSTIN ${data.gstNumber}` : ""}</div>
          <Table stack={false} minWidth={720}>
            <thead>
              <tr>
                <Th>GST rate</Th>
                <Th>Supply</Th>
                <Th align="right">Taxable</Th>
                <Th align="right">CGST</Th>
                <Th align="right">SGST</Th>
                <Th align="right">IGST</Th>
                <Th align="right">Total tax</Th>
                <Th align="right">Invoice value</Th>
              </tr>
            </thead>
            <tbody>
              {/* Intra-state and inter-state sales at the same rate are separate rows:
                  GSTR-1 reports CGST+SGST and IGST separately. */}
              {data.slabs.map((s) => (
                <tr key={`${s.rate}-${s.interState ? "inter" : "intra"}`}>
                  <Td>{s.rate}%</Td>
                  <Td muted style={{ fontSize: 12.5 }}>{s.interState ? "Inter-state" : "Intra-state"}</Td>
                  <Td align="right" mono>{formatCurrency(s.taxable)}</Td>
                  <Td align="right" mono muted={!s.cgst}>{formatCurrency(s.cgst)}</Td>
                  <Td align="right" mono muted={!s.sgst}>{formatCurrency(s.sgst)}</Td>
                  <Td align="right" mono muted={!s.igst}>{formatCurrency(s.igst)}</Td>
                  <Td align="right" mono>{formatCurrency(s.tax)}</Td>
                  <Td align="right" mono>{formatCurrency(s.total)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 600, background: "var(--bg-sunken)" }}>
                <Td colSpan={2}>Total</Td>
                <Td align="right" mono>{formatCurrency(data.totals.taxable)}</Td>
                <Td align="right" mono>{formatCurrency(data.totals.cgst)}</Td>
                <Td align="right" mono>{formatCurrency(data.totals.sgst)}</Td>
                <Td align="right" mono>{formatCurrency(data.totals.igst)}</Td>
                <Td align="right" mono>{formatCurrency(data.totals.outputTax)}</Td>
                <Td />
              </tr>
            </tfoot>
          </Table>
        </div>
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, borderBottom: "1px solid var(--border)" }}>HSN summary</div>
          <Table stack={false}>
            <thead>
              <tr>
                <Th>HSN</Th>
                <Th>Rate</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Taxable</Th>
                <Th align="right">Tax</Th>
              </tr>
            </thead>
            <tbody>
              {data.hsn.map((h) => (
                <tr key={`${h.hsn}-${h.rate}`}>
                  <Td mono>{h.hsn}</Td>
                  <Td>{h.rate}%</Td>
                  <Td align="right" mono>{formatQty(h.qty)}</Td>
                  <Td align="right" mono>{formatCurrency(h.taxable)}</Td>
                  <Td align="right" mono>{formatCurrency(h.tax)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </>
    );

  if (tab === "profit") {
    const s = data.summary;
    return (
      <>
        <div className="grid-stats-sm" style={{ marginBottom: 16 }}>
          <MiniStat label="Sales (incl. tax)" value={formatCurrency(s.revenue)} />
          <MiniStat label="Tax" value={formatCurrency(s.tax)} />
          <MiniStat label="Cost of goods" value={formatCurrency(s.cost)} />
          <MiniStat label="Gross profit" value={formatCurrency(s.grossProfit)} tone="success" />
          <MiniStat label="Expenses" value={formatCurrency(s.expenses)} tone="danger" />
          <MiniStat label="Net profit" value={formatCurrency(s.netProfit)} tone={s.netProfit >= 0 ? "success" : "danger"} />
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 12 }}>
          Profit uses each product's cost price at the time of sale. Keep cost prices updated (Purchases do this automatically). Margin: {s.margin}%
        </p>
        <div className="grid-main-side">
          <div className="card" style={{ overflow: "hidden" }}>
            <Table stack={false}>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th align="right">Sales</Th>
                  <Th align="right">Cost</Th>
                  <Th align="right">Gross profit</Th>
                </tr>
              </thead>
              <tbody>
                {data.daily.map((d) => (
                  <tr key={d.date}>
                    <Td>{formatDate(d.date)}</Td>
                    <Td align="right" mono>{formatCurrency(d.revenue)}</Td>
                    <Td align="right" mono>{formatCurrency(d.cost)}</Td>
                    <Td align="right" mono style={{ color: d.profit < 0 ? "var(--danger)" : "var(--success)" }}>
                      {formatCurrency(d.profit)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <div className="card" style={{ padding: 18 }}>
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Expenses by category</p>
            {data.expenses.length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No expenses recorded</p>}
            {data.expenses.map((e) => (
              <div key={e.category} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                <span>{e.category}</span>
                <b className="tabular">{formatCurrency(e.total)}</b>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  if (tab === "staff")
    return (
      <div className="card" style={{ overflow: "hidden" }}>
        <Table stack={false}>
          <thead>
            <tr>
              <Th>Cashier</Th>
              <Th align="right">Bills</Th>
              <Th align="right">Sales</Th>
              <Th align="right">Discounts given</Th>
              <Th align="right">Cancelled</Th>
            </tr>
          </thead>
          <tbody>
            {data.staff.map((s) => (
              <tr key={s.cashier}>
                <Td style={{ fontWeight: 500 }}>{s.cashier}</Td>
                <Td align="right" mono>{s.bills}</Td>
                <Td align="right" mono>{formatCurrency(s.revenue)}</Td>
                <Td align="right" mono>{formatCurrency(s.discount)}</Td>
                <Td align="right" mono style={{ color: s.cancelled ? "var(--danger)" : undefined }}>
                  {s.cancelled}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!data.staff.length && <EmptyState icon={Users} title="No sales in this period" />}
      </div>
    );

  if (tab === "stock") {
    const value = data.reduce((a, r) => a + r.stockValue, 0);
    return (
      <>
        <div className="grid-stats-sm" style={{ marginBottom: 16 }}>
          <MiniStat label="Products" value={data.length} />
          <MiniStat label="Closing stock value (cost)" value={formatCurrency(value)} tone="accent" />
        </div>
        <div className="card" style={{ overflow: "hidden" }}>
          <Table minWidth={900} stack={false}>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th align="right">Opening</Th>
                <Th align="right">Inward</Th>
                <Th align="right">Sold</Th>
                <Th align="right">Adjust</Th>
                <Th align="right">Closing</Th>
                <Th align="right">Value</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <p style={{ fontWeight: 500 }}>{r.name}</p>
                    <p style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{[r.category, r.barcode].filter(Boolean).join(" · ")}</p>
                  </Td>
                  <Td align="right" mono>{formatQty(r.openingStock)}</Td>
                  <Td align="right" mono>{formatQty(r.inward)}</Td>
                  <Td align="right" mono>{formatQty(r.soldQty)}</Td>
                  <Td align="right" mono>{formatQty(r.adjustment)}</Td>
                  <Td align="right" mono style={{ fontWeight: 600 }}>
                    {formatQty(r.closingStock, r.unit)}
                  </Td>
                  <Td align="right" mono>{formatCurrency(r.stockValue)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </>
    );
  }

  if (tab === "expiry") {
    const rows = [...data.expired, ...data.expiring];
    return (
      <>
        <div className="grid-stats-sm" style={{ marginBottom: 16 }}>
          <MiniStat label="Already expired" value={data.expired.length} tone="danger" />
          <MiniStat label={`Expiring in ${data.days} days`} value={data.expiring.length} tone="accent" />
          <MiniStat label="Stock value at risk" value={formatCurrency(data.valueAtRisk)} />
        </div>
        <div className="card" style={{ overflow: "hidden" }}>
          <Table stack={false}>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Batch</Th>
                <Th>Expiry</Th>
                <Th align="right">Stock</Th>
                <Th align="center">Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <Td style={{ fontWeight: 500 }}>{p.name}</Td>
                  <Td muted>{p.batchNo || "—"}</Td>
                  <Td>{formatDate(p.expiryDate)}</Td>
                  <Td align="right" mono>{formatQty(p.quantity, p.unit)}</Td>
                  <Td align="center">{p.expiryDate < data.today ? <Pill tone="danger">Expired</Pill> : <Pill tone="warning">Expiring</Pill>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {!rows.length && <EmptyState icon={Clock} title="Nothing expiring" description="Great — no products expire in this window." />}
        </div>
      </>
    );
  }
  if (tab === "audit") {
    const logs = data?.logs || [];
    const priceCount = logs.filter((l) => l.action === "PRICE_CHANGE").length;
    const billCount = logs.filter((l) => l.action.startsWith("BILL_") || l.action === "DISCOUNT_APPLIED").length;
    const staffCount = logs.filter((l) => l.action.startsWith("STAFF_") || l.action.startsWith("SETTINGS_")).length;

    const actionTone = (action) => {
      if (action === "BILL_CANCELLED" || action === "STAFF_DELETED") return "danger";
      if (action === "BILL_RETURN" || action === "PRICE_CHANGE") return "warning";
      if (action === "DISCOUNT_APPLIED") return "accent";
      return "muted";
    };

    const renderAuditDiff = (log) => {
      if (log.diff && Object.keys(log.diff).length > 0) {
        return (
          <div style={{ fontSize: 12 }}>
            {Object.entries(log.diff).map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>{k}:</span>
                <span style={{ textDecoration: v.from !== null && v.from !== undefined ? "line-through" : "none", color: "var(--text-muted)" }}>
                  {typeof v.from === "object" ? JSON.stringify(v.from) : String(v.from ?? "—")}
                </span>
                <span>→</span>
                <span style={{ fontWeight: 600 }}>
                  {typeof v.to === "object" ? JSON.stringify(v.to) : String(v.to ?? "—")}
                </span>
              </div>
            ))}
          </div>
        );
      }
      if (log.details && Object.keys(log.details).length > 0) {
        return (
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {Object.entries(log.details)
              .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
              .join(" · ")}
          </div>
        );
      }
      return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>;
    };

    return (
      <>
        <div className="grid-stats-sm" style={{ marginBottom: 16 }}>
          <MiniStat label="Total Audited Events" value={logs.length} />
          <MiniStat label="Price Changes" value={priceCount} tone="warning" />
          <MiniStat label="Discounts & Cancellations" value={billCount} tone="danger" />
          <MiniStat label="Staff & Setting Changes" value={staffCount} tone="accent" />
        </div>
        <div className="card" style={{ overflow: "hidden" }}>
          <Table stack={false}>
            <thead>
              <tr>
                <Th>Timestamp</Th>
                <Th>Action</Th>
                <Th>Target Entity</Th>
                <Th>User</Th>
                <Th>Details / Changes</Th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <Td style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>{formatDate(l.createdAt)}</Td>
                  <Td>
                    <Pill tone={actionTone(l.action)}>{l.action.replace(/_/g, " ")}</Pill>
                  </Td>
                  <Td>
                    <span style={{ fontWeight: 500 }}>{l.entityType}</span>
                    {l.entityId && (
                      <span style={{ fontSize: 11.5, color: "var(--text-muted)", marginLeft: 6 }}>
                        #{l.entityId}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <span style={{ fontWeight: 500 }}>{l.username || "system"}</span>
                    {l.userRole && (
                      <span style={{ fontSize: 11.5, color: "var(--text-muted)", marginLeft: 6 }}>
                        ({l.userRole})
                      </span>
                    )}
                  </Td>
                  <Td>{renderAuditDiff(l)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {!logs.length && (
            <EmptyState
              icon={ShieldCheck}
              title="No audit events found"
              description="No price changes, discounts, cancellations, or configuration changes recorded for this date range."
            />
          )}
        </div>
      </>
    );
  }

  return null;
}
