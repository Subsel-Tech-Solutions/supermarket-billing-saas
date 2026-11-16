// src/components/shared/Layout.jsx
import React from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import ErrorBoundary from "./ErrorBoundary";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import useOnline from "../../hooks/useOnline";
import { AlertTriangle, ArrowLeft, WifiOff, RefreshCw } from "lucide-react";

const bar = (tone, content, key) => (
  <div
    key={key}
    className="no-print"
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "9px 18px",
      fontSize: 13,
      lineHeight: 1.45,
      background:
        tone === "danger" ? "var(--danger-light)" : tone === "info" ? "var(--info-light)" : "rgba(var(--accent-rgb),0.12)",
      color: tone === "danger" ? "var(--danger)" : tone === "info" ? "var(--info)" : "var(--accent-dark)",
      borderBottom: "1px solid var(--border)",
      flexWrap: "wrap",
    }}
  >
    {content}
  </div>
);

function OfflineBanner() {
  const { online, recheck, isChecking } = useOnline();
  if (online) return null;
  return bar(
    "danger",
    <>
      <WifiOff size={14} style={{ flexShrink: 0 }} />
      <span>
        <b>No connection to the server.</b> Selling &amp; checkouts are paused to prevent stock &amp; invoice numbering errors. Active carts are preserved.
      </span>
      <button
        className="btn-ghost"
        style={{ padding: "4px 10px", marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}
        onClick={recheck}
        disabled={isChecking}
      >
        <RefreshCw size={12} className={isChecking ? "spin" : ""} /> {isChecking ? "Checking…" : "Retry"}
      </button>
    </>,
    "offline",
  );
}

function Banner() {
  const { shop, subscriptionExpired, isSuperAdmin, isImpersonating, returnToAdmin } = useAuth();
  const { platform } = useSettings();

  if (isImpersonating)
    return bar(
      "warn",
      <>
        <AlertTriangle size={14} style={{ flexShrink: 0 }} /> You are viewing <b>{shop?.name}</b> as platform admin.
        <button onClick={returnToAdmin} className="btn-ghost" style={{ padding: "4px 10px", marginLeft: "auto" }}>
          <ArrowLeft size={13} /> Back to admin
        </button>
      </>,
      "impersonating",
    );
  if (isSuperAdmin || !shop) return null;
  if (subscriptionExpired || shop.subscriptionActive === false)
    return bar(
      "danger",
      <>
        <AlertTriangle size={14} style={{ flexShrink: 0 }} /> Your {shop.planLabel || shop.plan} plan has expired. You can view
        data, but billing &amp; edits are locked.
        {platform.supportPhone || platform.supportEmail
          ? ` Contact ${platform.supportPhone || platform.supportEmail} to renew.`
          : " Contact the administrator to renew."}
      </>,
      "expired",
    );
  if (shop.daysLeft !== null && shop.daysLeft !== undefined && shop.daysLeft <= 5)
    return bar(
      "warn",
      <>
        <AlertTriangle size={14} style={{ flexShrink: 0 }} /> Your {shop.planLabel || shop.plan} plan ends in{" "}
        {Math.max(0, shop.daysLeft)} day(s).
        <Link to="/settings" style={{ color: "inherit", fontWeight: 600 }}>
          View plan
        </Link>
      </>,
      "ending",
    );
  return null;
}

const Layout = () => {
  const { pathname } = useLocation();
  return (
    <div style={{ display: "flex", minHeight: "100dvh", background: "var(--bg)" }}>
      <Sidebar />
      <main className="flex-1 min-w-0">
        <OfflineBanner />
        <Banner />
        {/* Keyed on the route so a crash on one page does not keep the error screen
            pinned after the user navigates somewhere else. */}
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
};

export default Layout;
