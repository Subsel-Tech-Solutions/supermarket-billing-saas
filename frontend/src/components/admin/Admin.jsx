// src/components/admin/Admin.jsx — PLATFORM admin: create and manage businesses, their
// subscriptions, their logins and the platform's own branding. No till, no stock, no
// customers: those belong to a shop and are reached by opening that shop for support.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Store,
  Users,
  Plus,
  Eye,
  EyeOff,
  Settings as SettingsIcon,
  Database,
  LogIn,
  Save,
  Trash2,
  Key,
  TrendingUp,
  TrendingDown,
  CreditCard,
  IndianRupee,
  ArrowRight,
  Palette,
  BarChart3,
  Clock,
} from "lucide-react";
import { adminAPI } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { applyTheme } from "../../utils/theme";
import { formatCurrency, formatDate, formatDateTime, getErrorMessage, num, ROLE_LABELS, ymd } from "../../utils/helpers";
import AccountPanel from "../shared/AccountPanel";
import { Page, SectionHeader, Modal, Field, Grid, Toggle, Spinner, Table, Th, Td, Pill, SearchInput, PageLoader, EmptyState, MiniStat } from "../shared/UI";

const emptyShop = { shopName: "", ownerEmail: "", username: "", password: "", phone: "", plan: "free", days: 30 };

// Section is driven by the URL so the sidebar links are real, bookmarkable pages.
const SECTION_TITLES = {
  "": ["Dashboard", "Overview of your platform"],
  businesses: ["Businesses", "Every business runs on its own private database"],
  subscriptions: ["Subscriptions", "Plans, renewals and what is about to lapse"],
  users: ["Users", "Every login across every business"],
  branding: ["Themes & Branding", "How the platform looks to your customers"],
  reports: ["Reports", "Growth, revenue and plan mix"],
  settings: ["Settings", "Sign-ups, trial length, plans and pricing"],
  account: ["My Account", "Your own name, phone and password"],
};

export default function Admin() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const section = (pathname.split("/admin/")[1] || "").split("/")[0];
  const [title, subtitle] = SECTION_TITLES[section] || SECTION_TITLES[""];

  const [stats, setStats] = useState(null);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState(null);

  // light=1 keeps the stats call out of every tenant database; the per-business product
  // and bill counts come from the shops list, which only the Businesses tab displays.
  const load = useCallback(async () => {
    try {
      const [s, sh] = await Promise.all([adminAPI.getStats({ light: 1 }), adminAPI.getShops()]);
      setStats(s.data.data);
      setShops(sh.data.data.shops);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const filtered = shops.filter((s) => {
    const q = search.trim().toLowerCase();
    return !q || [s.name, s.ownerEmail, s.phone, s.dbName].some((v) => String(v || "").toLowerCase().includes(q));
  });

  const openCreate = () => setShowCreate(true);

  return (
    <Page maxWidth={1400}>
      <SectionHeader
        title={title}
        subtitle={subtitle}
        actions={
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={14} /> New business
          </button>
        }
      />

      {loading ? (
        <PageLoader />
      ) : section === "" ? (
        <AdminDashboard stats={stats} shops={shops} onOpen={setSelected} onCreate={openCreate} go={navigate} />
      ) : section === "businesses" ? (
        <>
          <SearchInput value={search} onChange={setSearch} placeholder="Search business, email, phone…" style={{ maxWidth: 380, marginBottom: 14 }} />
          <ShopTable shops={filtered} onOpen={setSelected} />
        </>
      ) : section === "subscriptions" ? (
        <Subscriptions stats={stats} shops={shops} onOpen={setSelected} />
      ) : section === "users" ? (
        <PlatformUsers />
      ) : section === "branding" ? (
        <PlatformSettings only="branding" />
      ) : section === "reports" ? (
        <AdminReports stats={stats} shops={shops} />
      ) : section === "account" ? (
        <div style={{ maxWidth: 900 }}>
          <AccountPanel showSubscription={false} />
        </div>
      ) : (
        <PlatformSettings only="settings" />
      )}

      <CreateShopModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        plans={stats?.plans}
        onCreated={() => {
          setShowCreate(false);
          load();
        }}
      />
      <ShopModal shopId={selected} plans={stats?.plans} onClose={() => setSelected(null)} onChanged={load} />
    </Page>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   Dashboard
   ══════════════════════════════════════════════════════════════════════════════ */

const STATUS_TONE = { active: "success", trial: "warning", expired: "danger", inactive: "neutral" };
const STATUS_LABEL = { active: "Active", trial: "Trial", expired: "Expired", inactive: "Inactive" };

function Delta({ value }) {
  if (value === null || value === undefined) return null;
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: up ? "var(--success)" : "var(--danger)", fontSize: 12.5, fontWeight: 600 }}>
      <Icon size={13} />
      {up ? "+" : ""}
      {value}%
    </span>
  );
}

function MetricCard({ icon: Icon, tint, label, value, delta }) {
  return (
    <div className="stat-card fade-in" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: `rgba(${tint}, 0.14)`,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={20} style={{ color: `rgb(${tint})` }} />
      </div>
      <div>
        <p style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 500 }}>{label}</p>
        {/* Fluid so a long revenue figure shrinks to fit the card instead of overflowing */}
        <p className="tabular" style={{ fontSize: "clamp(20px, 2.1vw + 12px, 28px)", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.15, marginTop: 2 }}>
          {value}
        </p>
      </div>
      {delta !== undefined && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Delta value={delta} />
          vs last month
        </p>
      )}
    </div>
  );
}

function Panel({ title, action, children, pad = false }) {
  return (
    <div className="card fade-in" style={{ overflow: "hidden", minWidth: 0 }}>
      <div style={{ padding: "15px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
        <p style={{ fontSize: 14.5, fontWeight: 600, color: "var(--text-primary)", flex: 1, minWidth: 0 }}>{title}</p>
        {action}
      </div>
      <div style={pad ? { padding: 18 } : undefined}>{children}</div>
    </div>
  );
}

function AdminDashboard({ stats, shops, onOpen, onCreate, go }) {
  if (!stats) return null;
  const g = stats.growth || {};
  const plans = Object.entries(stats.plans || {});
  const planTints = ["52, 168, 110", "59, 130, 246", "147, 112, 219", "191, 156, 90"];

  const expiring = shops
    .filter((s) => s.daysLeft !== null && s.daysLeft !== undefined && s.daysLeft >= 0 && s.daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return (
    <>
      <div className="grid-stats stagger" style={{ marginBottom: 16 }}>
        <MetricCard icon={Store} tint="59, 130, 246" label="Total Businesses" value={stats.totalShops.toLocaleString()} delta={g.businesses} />
        <MetricCard icon={Users} tint="52, 168, 110" label="Total Users" value={stats.totalUsers.toLocaleString()} delta={g.users} />
        <MetricCard icon={CreditCard} tint="217, 160, 54" label="Active Subscriptions" value={stats.activeSubscriptions.toLocaleString()} delta={g.subscriptions} />
        <MetricCard icon={IndianRupee} tint="226, 100, 92" label="Monthly Revenue" value={formatCurrency(stats.monthlyRevenue)} delta={g.revenue} />
      </div>

      {/* Anything about to lapse is the one thing an operator must act on today */}
      {expiring.length > 0 && (
        <div
          className="card fade-in"
          style={{ padding: "13px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderColor: "var(--accent)" }}
        >
          <Clock size={15} style={{ color: "var(--accent-dark)", flexShrink: 0 }} />
          <span style={{ fontSize: 13.5, color: "var(--text-primary)", flex: 1, minWidth: 180 }}>
            <b>{expiring.length}</b> subscription{expiring.length === 1 ? "" : "s"} ending within 7 days
            <span style={{ color: "var(--text-muted)" }}> — {expiring.slice(0, 3).map((s) => s.name).join(", ")}
            {expiring.length > 3 ? ` +${expiring.length - 3} more` : ""}</span>
          </span>
          <button className="btn-ghost" onClick={() => go("/admin/subscriptions")}>
            Review <ArrowRight size={13} />
          </button>
        </div>
      )}

      <div className="grid-main-side" style={{ marginBottom: 16 }}>
        <Panel
          title="Recent Businesses"
          action={
            <Link to="/admin/businesses" style={{ fontSize: 13, color: "var(--accent-dark)", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
              View All
            </Link>
          }
        >
          {!stats.recent?.length ? (
            <EmptyState icon={Store} title="No businesses yet" description="Create the first one to get started" />
          ) : (
            <Table minWidth={620}>
              <thead>
                <tr>
                  <Th>Business Name</Th>
                  <Th>Owner</Th>
                  <Th>Plan</Th>
                  <Th align="center">Status</Th>
                  <Th>Created On</Th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((s) => (
                  <tr key={s.id} className="table-row-hover" style={{ cursor: "pointer" }} onClick={() => onOpen(s.id)}>
                    <Td primary>
                      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <span
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            flexShrink: 0,
                            background: "rgba(var(--accent-rgb),0.16)",
                            color: "var(--accent-dark)",
                            display: "grid",
                            placeItems: "center",
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          {String(s.name || "?").trim()[0]?.toUpperCase()}
                        </span>
                        <span style={{ fontWeight: 600, minWidth: 0 }}>{s.name}</span>
                      </span>
                    </Td>
                    <Td label="Owner" muted>
                      {s.owner}
                    </Td>
                    <Td label="Plan">
                      <Pill tone="info">{s.planLabel}</Pill>
                    </Td>
                    <Td label="Status" align="center">
                      <Pill tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Pill>
                    </Td>
                    <Td label="Created On" muted>
                      {formatDate(s.createdAt)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>

        <Panel
          title="Subscription Plans"
          action={
            <Link to="/admin/settings" style={{ fontSize: 13, color: "var(--accent-dark)", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
              Manage Plans
            </Link>
          }
          pad
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {plans.map(([key, p], i) => {
              const count = stats.byPlan?.[key] || 0;
              const share = stats.totalShops ? Math.round((count / stats.totalShops) * 100) : 0;
              const tint = planTints[i % planTints.length];
              return (
                <div key={key} style={{ padding: "13px 15px", borderRadius: 12, background: `rgba(${tint}, 0.07)`, border: `1px solid rgba(${tint}, 0.2)` }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{p.label}</span>
                    <span className="tabular" style={{ fontSize: 15, fontWeight: 700, color: `rgb(${tint})` }}>
                      {p.price > 0 ? `${formatCurrency(p.price)}` : "Free"}
                      {p.price > 0 && <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)" }}>/mo</span>}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                    {count} business{count === 1 ? "" : "es"}
                  </p>
                  <div style={{ height: 5, borderRadius: 99, background: "var(--bg-sunken)", marginTop: 8, overflow: "hidden" }}>
                    <div style={{ width: `${share}%`, height: "100%", background: `rgb(${tint})`, borderRadius: 99, transition: "width .3s" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <div className="grid-2" style={{ gap: 16 }}>
        <Panel title="Quick Actions" pad>
          <div className="grid-2" style={{ gap: 12 }}>
            {[
              { icon: Store, label: "Create Business", tint: "59, 130, 246", onClick: onCreate },
              { icon: CreditCard, label: "Manage Plans", tint: "52, 168, 110", onClick: () => go("/admin/settings") },
              { icon: SettingsIcon, label: "Platform Settings", tint: "217, 160, 54", onClick: () => go("/admin/settings") },
              { icon: BarChart3, label: "View Reports", tint: "147, 112, 219", onClick: () => go("/admin/reports") },
            ].map((a) => (
              <button
                key={a.label}
                onClick={a.onClick}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 9,
                  padding: "20px 12px",
                  borderRadius: 12,
                  cursor: "pointer",
                  background: `rgba(${a.tint}, 0.08)`,
                  border: `1px solid rgba(${a.tint}, 0.18)`,
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontWeight: 600,
                  transition: "transform .15s, box-shadow .15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,0,0,0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <a.icon size={21} style={{ color: `rgb(${a.tint})` }} />
                {a.label}
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Platform Settings">
          {[
            { icon: Palette, label: "Default Theme & Colour", hint: "Applied to new businesses", to: "/admin/branding" },
            { icon: Store, label: "Platform Name & Tagline", hint: "Shown on the sign-in page", to: "/admin/branding" },
            { icon: Users, label: "Sign-ups & Trial Length", hint: "Who can create a business", to: "/admin/settings" },
            { icon: CreditCard, label: "Plans, Limits & Pricing", hint: "Users and products per plan", to: "/admin/settings" },
            { icon: Database, label: "Support Contact", hint: "Shown when a plan expires", to: "/admin/branding" },
          ].map((row, i, arr) => (
            <Link
              key={row.label}
              to={row.to}
              className="table-row-hover"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "13px 18px",
                borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <row.icon size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13.5, color: "var(--text-primary)" }}>{row.label}</span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--text-muted)" }}>{row.hint}</span>
              </span>
              <ArrowRight size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            </Link>
          ))}
        </Panel>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   Subscriptions
   ══════════════════════════════════════════════════════════════════════════════ */

function Subscriptions({ stats, shops, onOpen }) {
  const [filter, setFilter] = useState("expiring");

  const groups = useMemo(() => {
    const d = (s) => (s.daysLeft === null || s.daysLeft === undefined ? Infinity : s.daysLeft);
    return {
      expiring: shops.filter((s) => s.isActive && d(s) >= 0 && d(s) <= 14).sort((a, b) => d(a) - d(b)),
      expired: shops.filter((s) => d(s) < 0).sort((a, b) => d(a) - d(b)),
      active: shops.filter((s) => s.isActive && s.subscriptionActive).sort((a, b) => d(a) - d(b)),
      inactive: shops.filter((s) => !s.isActive),
      all: shops,
    };
  }, [shops]);

  const TABS = [
    ["expiring", "Ending soon", groups.expiring.length, "warning"],
    ["expired", "Expired", groups.expired.length, "danger"],
    ["active", "Active", groups.active.length, "success"],
    ["inactive", "Switched off", groups.inactive.length, "neutral"],
    ["all", "All", groups.all.length, "neutral"],
  ];

  return (
    <>
      <div className="grid-stats-sm" style={{ marginBottom: 16 }}>
        <MiniStat label="Active subscriptions" value={stats?.activeSubscriptions ?? 0} tone="success" />
        <MiniStat label="Monthly revenue" value={formatCurrency(stats?.monthlyRevenue)} tone="accent" />
        <MiniStat label="Ending within 14 days" value={groups.expiring.length} tone={groups.expiring.length ? "accent" : undefined} />
        <MiniStat label="Expired" value={groups.expired.length} tone={groups.expired.length ? "danger" : undefined} />
      </div>

      <div className="chip-row" style={{ marginBottom: 14 }}>
        {TABS.map(([key, label, count]) => (
          <button key={key} className={filter === key ? "btn-primary" : "btn-ghost"} style={{ padding: "7px 13px" }} onClick={() => setFilter(key)}>
            {label} ({count})
          </button>
        ))}
      </div>

      {groups[filter].length === 0 ? (
        <div className="card">
          <EmptyState icon={CreditCard} title="Nothing here" description={filter === "expiring" ? "No subscription is ending in the next 14 days." : "No businesses in this state."} />
        </div>
      ) : (
        <ShopTable shops={groups[filter]} onOpen={onOpen} />
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   Users
   ══════════════════════════════════════════════════════════════════════════════ */

function PlatformUsers() {
  const [users, setUsers] = useState(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    adminAPI
      .getUsers()
      .then((r) => setUsers(r.data.data.users))
      .catch((e) => toast.error(getErrorMessage(e)));
  }, []);

  if (!users) return <PageLoader />;

  const q = search.trim().toLowerCase();
  const rows = users.filter(
    (u) => (!role || u.role === role) && (!q || [u.username, u.email, u.phone, u.shopName].some((v) => String(v || "").toLowerCase().includes(q))),
  );
  const byRole = (r) => users.filter((u) => u.role === r).length;

  return (
    <>
      <div className="grid-stats-sm" style={{ marginBottom: 16 }}>
        <MiniStat label="Total logins" value={users.length} />
        <MiniStat label="Owners" value={byRole("owner")} />
        <MiniStat label="Managers" value={byRole("manager")} />
        <MiniStat label="Cashiers" value={byRole("cashier")} />
      </div>

      <div className="row-wrap" style={{ marginBottom: 14 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, email, phone or business…" style={{ maxWidth: 360 }} className="grow" />
        <div className="chip-row">
          {[["", "All roles"], ["owner", "Owners"], ["manager", "Managers"], ["cashier", "Cashiers"]].map(([v, l]) => (
            <button key={v || "all"} className={role === v ? "btn-primary" : "btn-ghost"} style={{ padding: "7px 13px" }} onClick={() => setRole(v)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={Users} title="No users found" />
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <Table minWidth={780}>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email (login)</Th>
                <Th>Business</Th>
                <Th>Role</Th>
                <Th>Last login</Th>
                <Th align="center">Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="table-row-hover">
                  <Td primary>
                    <p style={{ fontWeight: 600 }}>{u.username}</p>
                    {u.phone && <p style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{u.phone}</p>}
                  </Td>
                  <Td label="Email" muted>
                    {u.email}
                  </Td>
                  <Td label="Business">{u.shopName}</Td>
                  <Td label="Role">{u.isSuperAdmin ? "Platform admin" : ROLE_LABELS[u.role] || u.role}</Td>
                  <Td label="Last login" muted>
                    {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}
                  </Td>
                  <Td label="Status" align="center">
                    {!u.isActive ? <Pill tone="danger">Disabled</Pill> : !u.shopActive ? <Pill tone="warning">Shop off</Pill> : <Pill tone="success">Active</Pill>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
        Staff are added by each business owner under their own Staff page. To reset an owner's password, open the business from{" "}
        <Link to="/admin/businesses" style={{ color: "var(--accent-dark)" }}>
          Businesses
        </Link>
        .
      </p>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   Reports — plan mix, revenue and growth. Nothing about what shops sell: that is
   each business's own data and belongs on their dashboard, not here.
   ══════════════════════════════════════════════════════════════════════════════ */

function AdminReports({ stats, shops }) {
  if (!stats) return null;
  const plans = Object.entries(stats.plans || {});
  const mrrOf = (key) => (num(stats.plans[key]?.price) || 0) * (stats.byPlan?.[key] || 0);
  const totalMrr = plans.reduce((a, [k]) => a + mrrOf(k), 0);

  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      key,
      label: d.toLocaleDateString("en-IN", { month: "short" }),
      count: shops.filter((s) => String(s.createdAt).slice(0, 7) === key).length,
    });
  }
  const peak = Math.max(1, ...months.map((m) => m.count));

  return (
    <>
      <div className="grid-stats-sm" style={{ marginBottom: 16 }}>
        <MiniStat label="Monthly recurring revenue" value={formatCurrency(stats.monthlyRevenue)} tone="accent" />
        <MiniStat label="Annual run rate" value={formatCurrency(stats.monthlyRevenue * 12)} />
        <MiniStat label="Paying businesses" value={plans.filter(([k]) => num(stats.plans[k].price) > 0).reduce((a, [k]) => a + (stats.byPlan?.[k] || 0), 0)} />
        <MiniStat
          label="Average revenue per business"
          value={formatCurrency(stats.activeSubscriptions ? stats.monthlyRevenue / stats.activeSubscriptions : 0)}
        />
      </div>

      <div className="grid-2" style={{ gap: 16 }}>
        <Panel title="Revenue by plan" pad>
          {plans.map(([key, p]) => {
            const mrr = mrrOf(key);
            const share = totalMrr ? Math.round((mrr / totalMrr) * 100) : 0;
            return (
              <div key={key} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 5 }}>
                  <span>
                    {p.label} <span style={{ color: "var(--text-muted)" }}>· {stats.byPlan?.[key] || 0}</span>
                  </span>
                  <b className="tabular">{formatCurrency(mrr)}</b>
                </div>
                <div style={{ height: 6, borderRadius: 99, background: "var(--bg-sunken)", overflow: "hidden" }}>
                  <div style={{ width: `${share}%`, height: "100%", background: "var(--accent)", borderRadius: 99 }} />
                </div>
              </div>
            );
          })}
          {totalMrr === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No paid subscriptions yet.</p>}
        </Panel>

        <Panel title="New businesses — last 6 months" pad>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 170 }}>
            {months.map((m) => (
              <div key={m.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span className="tabular" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  {m.count}
                </span>
                <div
                  style={{
                    width: "100%",
                    height: `${Math.max(4, (m.count / peak) * 120)}px`,
                    background: m.count ? "var(--accent)" : "var(--bg-sunken)",
                    borderRadius: "6px 6px 0 0",
                    transition: "height .3s",
                  }}
                />
                <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{m.label}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

function ShopTable({ shops, onOpen, compact }) {
  if (!shops.length)
    return (
      <div className="card">
        <EmptyState icon={Store} title="No businesses found" />
      </div>
    );
  return (
    <div className={compact ? "" : "card"} style={{ overflow: "hidden" }}>
      <Table minWidth={860}>
        <thead>
          <tr>
            <Th>Business</Th>
            <Th>Owner</Th>
            <Th>Plan</Th>
            <Th>Valid till</Th>
            <Th align="right">Users</Th>
            <Th align="right">Products</Th>
            <Th align="right">Sales</Th>
            <Th align="center">Status</Th>
          </tr>
        </thead>
        <tbody>
          {shops.map((s) => (
            <tr key={s.id} className="table-row-hover" style={{ cursor: "pointer" }} onClick={() => onOpen(s.id)}>
              <Td primary>
                <p style={{ fontWeight: 600 }}>{s.name}</p>
                <p style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{s.dbName}</p>
              </Td>
              <Td label="Owner" muted>
                {s.ownerEmail}
                {s.phone && <div style={{ fontSize: 11.5 }}>{s.phone}</div>}
              </Td>
              <Td label="Plan">{s.planLabel}</Td>
              <Td label="Valid till" muted>
                {s.subscriptionEnds ? formatDate(s.subscriptionEnds) : "Lifetime"}
                {s.daysLeft !== null && (
                  <div style={{ fontSize: 11.5, color: s.daysLeft < 0 ? "var(--danger)" : s.daysLeft <= 7 ? "var(--accent-dark)" : "var(--text-muted)" }}>
                    {s.daysLeft < 0 ? `Expired ${-s.daysLeft}d ago` : `${s.daysLeft} days left`}
                  </div>
                )}
              </Td>
              <Td label="Users" align="right" mono>
                {s.users}
              </Td>
              <Td label="Products" align="right" mono>
                {s.products}
              </Td>
              <Td label="Sales" align="right" mono>
                {formatCurrency(s.revenue)}
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.bills} bills</div>
              </Td>
              <Td label="Status" align="center">
                {!s.dbOk ? (
                  <Pill tone="danger">DB error</Pill>
                ) : !s.isActive ? (
                  <Pill tone="danger">Inactive</Pill>
                ) : s.subscriptionActive ? (
                  <Pill tone="success">Active</Pill>
                ) : (
                  <Pill tone="warning">Expired</Pill>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function CreateShopModal({ isOpen, onClose, onCreated, plans }) {
  const [form, setForm] = useState(emptyShop);
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (isOpen) setForm(emptyShop);
  }, [isOpen]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    if (!form.shopName || !form.ownerEmail || !form.password) return toast.error("Business name, owner email and password are required");
    setSaving(true);
    try {
      const r = await adminAPI.createShop(form);
      toast.success(`Created — database ${r.data.data.dbName}`);
      onCreated();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New business" maxWidth={520}>
      <Grid cols={2}>
        <Field label="Business name" required span={2}>
          <input className="input-field" value={form.shopName} onChange={(e) => set("shopName", e.target.value)} placeholder="e.g. Krish Mart" />
        </Field>
        <Field label="Owner name">
          <input className="input-field" value={form.username} onChange={(e) => set("username", e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className="input-field" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Owner email (login)" required>
          <input className="input-field" type="email" value={form.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} />
        </Field>
        <Field label="Password" required>
          <div style={{ position: "relative" }}>
            <input className="input-field" type={showPass ? "text" : "password"} value={form.password} onChange={(e) => set("password", e.target.value)} style={{ paddingRight: 38 }} />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex" }}
            >
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </Field>
        <Field label="Plan">
          <select className="input-field" value={form.plan} onChange={(e) => set("plan", e.target.value)}>
            {Object.entries(plans || { free: { label: "Free" } }).map(([k, p]) => (
              <option key={k} value={k}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Valid for (days)">
          <input className="input-field" type="number" min={1} value={form.days} onChange={(e) => set("days", e.target.value)} />
        </Field>
      </Grid>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>A new private MySQL database is created automatically for this business.</p>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button className="btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={submit} disabled={saving}>
          {saving ? <Spinner size={13} color="var(--bg)" /> : <Plus size={14} />} Create
        </button>
      </div>
    </Modal>
  );
}

function ShopModal({ shopId, onClose, onChanged, plans }) {
  const { loginWithSession, shop: myShop } = useAuth();
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmName, setConfirmName] = useState("");

  useEffect(() => {
    if (!shopId) return;
    setData(null);
    setNewPass("");
    setConfirmName("");
    adminAPI
      .getShop(shopId)
      .then((r) => {
        setData(r.data.data);
        const s = r.data.data.shop;
        setForm({
          name: s.name,
          phone: s.phone || "",
          plan: s.plan,
          subscriptionEnds: s.subscriptionEnds ? ymd(new Date(s.subscriptionEnds)) : "",
          notes: s.notes || "",
          isActive: s.isActive,
        });
      })
      .catch((e) => toast.error(getErrorMessage(e)));
  }, [shopId]);

  const run = async (key, fn, msg) => {
    setBusy(key);
    try {
      const r = await fn();
      toast.success(msg || r?.data?.message || "Done");
      onChanged();
      return r;
    } catch (e) {
      toast.error(getErrorMessage(e));
      return null;
    } finally {
      setBusy("");
    }
  };

  const save = () =>
    run("save", () => adminAPI.updateShop(shopId, { ...form, subscriptionEnds: form.subscriptionEnds ? `${form.subscriptionEnds}T23:59:59` : null })).then((r) => {
      if (r) setData((d) => ({ ...d, shop: r.data.data.shop }));
    });
  const extend = (days) =>
    run("extend", () => adminAPI.updateShop(shopId, { extendDays: days }), `Extended by ${days} days`).then((r) => {
      if (r) {
        setData((d) => ({ ...d, shop: r.data.data.shop }));
        setForm((f) => ({ ...f, subscriptionEnds: ymd(new Date(r.data.data.shop.subscriptionEnds)) }));
      }
    });

  const s = data?.shop;
  const own = s && myShop && s.id === myShop.id;
  return (
    <Modal isOpen={!!shopId} onClose={onClose} title={s ? s.name : "Business"} maxWidth={720}>
      {!data ? (
        <PageLoader />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="grid-4" style={{ gap: 10 }}>
            <MiniStat label="Products" value={s.products} />
            <MiniStat label="Bills" value={s.bills} />
            <MiniStat label="Customers" value={s.customers} />
            <MiniStat label="Sales" value={formatCurrency(s.revenue)} />
          </div>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <Database size={13} /> Database: <code>{s.dbName}</code> · Created {formatDate(s.createdAt)}
          </p>

          <Grid cols={2}>
            <Field label="Business name">
              <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Plan">
              <select className="input-field" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                {Object.entries(plans || {}).map(([k, p]) => (
                  <option key={k} value={k}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Valid till (empty = lifetime)">
              <input className="input-field" type="date" value={form.subscriptionEnds} onChange={(e) => setForm({ ...form, subscriptionEnds: e.target.value })} />
            </Field>
            <Field label="Admin notes" span={2}>
              <textarea className="input-field" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Payment received, contact person…" />
            </Field>
          </Grid>
          {!own && <Toggle label="Business is active" description="Inactive businesses cannot log in" checked={!!form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn-primary" onClick={save} disabled={busy === "save"}>
              {busy === "save" ? <Spinner size={13} color="var(--bg)" /> : <Save size={13} />} Save
            </button>
            {[30, 90, 365].map((d) => (
              <button key={d} className="btn-ghost" onClick={() => extend(d)} disabled={busy === "extend"}>
                +{d} days
              </button>
            ))}
          </div>

          <div className="card-sunken" style={{ padding: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Users ({data.users.length})</p>
            {data.users.map((u) => (
              <div key={u.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, padding: "5px 0", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
                <span>
                  {u.username} <span style={{ color: "var(--text-muted)" }}>· {u.email}</span>
                </span>
                <span style={{ color: "var(--text-muted)" }}>
                  {u.isSuperAdmin ? "Platform admin" : ROLE_LABELS[u.role]} {u.isActive ? "" : "(disabled)"}
                </span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <input className="input-field" type="text" placeholder="New owner password" value={newPass} onChange={(e) => setNewPass(e.target.value)} style={{ maxWidth: 240 }} />
              <button
                className="btn-ghost"
                disabled={newPass.length < 6 || busy === "pw"}
                onClick={() => run("pw", () => adminAPI.resetPassword(shopId, { newPassword: newPass })).then(() => setNewPass(""))}
              >
                <Key size={13} /> Reset owner password
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!own && (
              <button
                className="btn-ghost"
                disabled={busy === "login"}
                onClick={async () => {
                  setBusy("login");
                  try {
                    const r = await adminAPI.loginAs(shopId);
                    loginWithSession(r.data.data);
                  } catch (e) {
                    toast.error(getErrorMessage(e));
                    setBusy("");
                  }
                }}
              >
                <LogIn size={13} /> Open this shop
              </button>
            )}
            <button className="btn-ghost" onClick={() => run("repair", () => adminAPI.repairDb(shopId))} disabled={busy === "repair"}>
              <Database size={13} /> Verify database
            </button>
          </div>

          {!own && (
            <div style={{ border: "1px solid var(--danger)", borderRadius: 12, padding: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)" }}>Delete business permanently</p>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "4px 0 10px" }}>
                Drops database <code>{s.dbName}</code> with all products, bills and customers. This cannot be undone. Type <b>{s.name}</b> to confirm.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input className="input-field" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={s.name} style={{ maxWidth: 260 }} />
                <button
                  className="btn-danger"
                  disabled={confirmName !== s.name || busy === "delete"}
                  onClick={() =>
                    run("delete", () => adminAPI.deleteShop(shopId, confirmName)).then((r) => {
                      if (r) onClose();
                    })
                  }
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/**
 * Platform-wide configuration, split across two sidebar entries:
 *   only="branding"  → how the platform looks (name, support contact, defaults for new shops)
 *   only="settings"  → how it is sold (sign-ups, trial, plans and limits)
 * Both post to the same endpoint; `only` just chooses which cards to show.
 */
function PlatformSettings({ only = "settings" }) {
  const { setPlatform } = useSettings();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const showBranding = only === "branding";
  const showSelling = only === "settings";
  useEffect(() => {
    adminAPI
      .getSettings()
      .then((r) => setForm(r.data.data.settings))
      .catch((e) => toast.error(getErrorMessage(e)));
  }, []);
  if (!form) return <PageLoader />;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setPlan = (key, field, value) => setForm((f) => ({ ...f, plans: { ...f.plans, [key]: { ...f.plans[key], [field]: value } } }));

  const save = async () => {
    setSaving(true);
    try {
      const r = await adminAPI.updateSettings(form);
      setForm(r.data.data.settings);
      setPlatform((p) => ({ ...p, ...r.data.data.settings }));
      // The admin panel is a platform screen, so show the new brand colour right away
      applyTheme({ themeMode: r.data.data.settings.defaultThemeMode, accentColor: r.data.data.settings.defaultAccentColor });
      toast.success("Platform settings saved");
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const card = (title, children, description) => (
    <div className="card" style={{ padding: "20px 22px", marginBottom: 16 }}>
      <h3 style={{ fontSize: 17 }}>{title}</h3>
      {description && <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 3 }}>{description}</p>}
      <div style={{ marginTop: 14 }}>{children}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 900 }}>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>
        {showBranding
          ? "How the platform presents itself. Each business can still set its own name, logo and colours — these are the defaults a new business starts with."
          : "How the platform is sold: who may create a business, how long the trial runs, and what each plan allows."}
      </p>
      {showBranding && card(
        "Platform identity",
        <Grid cols={2}>
          <Field label="Platform name (login page & title)">
            <input className="input-field" value={form.platformName} onChange={(e) => set("platformName", e.target.value)} />
          </Field>
          <Field label="Tagline">
            <input className="input-field" value={form.tagline} onChange={(e) => set("tagline", e.target.value)} />
          </Field>
          <Field label="Support phone">
            <input className="input-field" value={form.supportPhone} onChange={(e) => set("supportPhone", e.target.value)} />
          </Field>
          <Field label="Support email">
            <input className="input-field" value={form.supportEmail} onChange={(e) => set("supportEmail", e.target.value)} />
          </Field>
          <Field label="Default theme for new shops">
            <select className="input-field" value={form.defaultThemeMode} onChange={(e) => set("defaultThemeMode", e.target.value)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">Follow device</option>
            </select>
          </Field>
          <Field label="Default brand colour for new shops">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="color"
                value={form.defaultAccentColor}
                onChange={(e) => set("defaultAccentColor", e.target.value)}
                style={{ width: 46, height: 38, border: "1px solid var(--border)", borderRadius: 8, background: "none" }}
              />
              <code>{form.defaultAccentColor}</code>
            </div>
          </Field>
          <Field label="Default currency symbol">
            <input className="input-field" value={form.currencySymbol} onChange={(e) => set("currencySymbol", e.target.value)} maxLength={4} />
          </Field>
        </Grid>,
      )}
      {showSelling && card(
        "Signups & trial",
        <>
          <Toggle label="Allow public signups" description="When off, only you can create businesses" checked={!!form.allowSignup} onChange={(v) => set("allowSignup", v)} />
          <Grid cols={3} style={{ marginTop: 10 }}>
            <Field label="Free trial days">
              <input className="input-field" type="number" min={1} max={365} value={form.trialDays} onChange={(e) => set("trialDays", e.target.value)} />
            </Field>
          </Grid>
        </>,
      )}
      {showSelling && card(
        "Plans",
        <Table minWidth={560}>
          <thead>
            <tr>
              <Th>Key</Th>
              <Th>Label</Th>
              <Th>Price / month</Th>
              <Th>Max users</Th>
              <Th>Max products</Th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(form.plans).map(([k, p]) => (
              <tr key={k}>
                <Td primary mono>{k}</Td>
                <Td label="Label">
                  <input className="input-field" value={p.label} onChange={(e) => setPlan(k, "label", e.target.value)} />
                </Td>
                <Td label="Price / month">
                  <input className="input-field" type="number" min={0} value={p.price} onChange={(e) => setPlan(k, "price", e.target.value)} />
                </Td>
                <Td label="Max users">
                  <input className="input-field" type="number" min={0} value={p.maxUsers} onChange={(e) => setPlan(k, "maxUsers", e.target.value)} />
                </Td>
                <Td label="Max products">
                  <input className="input-field" type="number" min={0} value={p.maxProducts} onChange={(e) => setPlan(k, "maxProducts", e.target.value)} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>,
        "0 = unlimited",
      )}
      <button className="btn-primary" onClick={save} disabled={saving}>
        {saving ? <Spinner size={13} color="var(--bg)" /> : <Save size={14} />} Save platform settings
      </button>
    </div>
  );
}
