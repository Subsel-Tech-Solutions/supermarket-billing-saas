// src/components/shared/UI.jsx
import React from "react";
import ReactDOM from "react-dom";
import { Loader2, Search } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

export const Spinner = ({ size = 18, color = "var(--accent)", style = {} }) => (
  <Loader2
    size={size}
    style={{ color, animation: "spin 0.8s linear infinite", flexShrink: 0, ...style }}
  />
);

export const PageLoader = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: 240,
      gap: 12,
    }}
  >
    <Spinner size={24} />
    <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading…</p>
  </div>
);

export const EmptyState = ({ icon: Icon, title, description, action }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "56px 24px",
      textAlign: "center",
      gap: 10,
    }}
  >
    {Icon && (
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: "var(--bg-sunken)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 4,
        }}
      >
        <Icon size={22} style={{ color: "var(--text-muted)" }} />
      </div>
    )}
    <p
      style={{
        fontFamily: "'Fraunces','Playfair Display',serif",
        fontSize: 17,
        color: "var(--text-primary)",
        fontWeight: 400,
      }}
    >
      {title}
    </p>
    {description && (
      <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 280 }}>
        {description}
      </p>
    )}
    {action && <div style={{ marginTop: 8 }}>{action}</div>}
  </div>
);

// Open dialogs, innermost last. Escape must close only the top one, so a confirm dialog
// over a form does not dismiss the form underneath it too.
const modalStack = [];

export const Modal = ({ isOpen, onClose, title, children, maxWidth = 480 }) => {
  const shellRef = React.useRef(null);
  const id = React.useRef({});

  React.useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalStack.push(id.current);

    // Escape closes the dialog, and Tab is trapped inside it — otherwise focus walks
    // onto the page behind, which on the billing screen means typing into the barcode
    // field while a modal is open.
    const onKeyDown = (e) => {
      // Only the topmost dialog reacts
      if (modalStack[modalStack.length - 1] !== id.current) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== "Tab" || !shellRef.current) return;
      const focusable = shellRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown, true);
      const at = modalStack.indexOf(id.current);
      if (at !== -1) modalStack.splice(at, 1);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        background: "var(--overlay)",
        backdropFilter: "blur(6px)",
        animation: "fadeIn 0.15s ease",
        boxSizing: "border-box",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={shellRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className="card fade-in modal-shell"
        style={{
          maxWidth,
          boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="modal-head"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "18px 22px 14px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <h3
            style={{
              fontFamily: "'Fraunces','Playfair Display',serif",
              fontSize: 18,
              fontWeight: 400,
              color: "var(--text-primary)",
            }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: 6,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--text-primary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--text-muted)")
            }
          >
            <svg
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div style={{ padding: "18px 22px 22px" }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
};

export const Badge = ({ children, style = {} }) => (
  <span className="badge" style={style}>
    {children}
  </span>
);

export const StatCard = ({
  icon: Icon,
  label,
  value,
  sub,
  accentColor = "var(--accent)",
}) => (
  <div className="stat-card fade-in">
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: accentColor.startsWith("#") ? `${accentColor}15` : "var(--bg-sunken)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={17} style={{ color: accentColor }} />
      </div>
    </div>
    <p
      style={{
        fontFamily: "'Fraunces','Playfair Display',serif",
        fontSize: 26,
        fontWeight: 300,
        color: "var(--text-primary)",
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}
    >
      {value}
    </p>
    <p
      style={{
        fontSize: 12.5,
        color: "var(--text-secondary)",
        marginTop: 5,
        fontWeight: 500,
      }}
    >
      {label}
    </p>
    {sub && (
      <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
        {sub}
      </p>
    )}
  </div>
);

export const FormField = ({ label, error, required, children, hint }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    {label && (
      <label
        style={{
          fontSize: 12.5,
          fontWeight: 500,
          color: "var(--text-secondary)",
          letterSpacing: "0.01em",
        }}
      >
        {label}
        {required && (
          <span style={{ color: "var(--accent)", marginLeft: 3 }}>*</span>
        )}
      </label>
    )}
    {children}
    {hint && (
      <p style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{hint}</p>
    )}
    {error && <p style={{ fontSize: 11.5, color: "var(--danger)" }}>{error}</p>}
  </div>
);

export const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  loading,
}) => (
  <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth={380}>
    <p
      style={{
        fontSize: 13.5,
        color: "var(--text-secondary)",
        lineHeight: 1.6,
        marginBottom: 20,
      }}
    >
      {message}
    </p>
    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
      <button onClick={onClose} className="btn-ghost">
        Cancel
      </button>
      <button onClick={onConfirm} disabled={loading} className="btn-danger">
        {loading ? <Spinner size={13} color="var(--danger)" /> : null}Confirm
      </button>
    </div>
  </Modal>
);

export const SearchInput = ({
  value,
  onChange,
  placeholder = "Search…",
  style = {},
  className = "",
}) => (
  <div className={className} style={{ position: "relative", ...style }}>
    <Search
      size={14}
      style={{
        position: "absolute",
        left: 12,
        top: "50%",
        transform: "translateY(-50%)",
        color: "var(--text-muted)",
        pointerEvents: "none",
      }}
    />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="input-field"
      style={{ paddingLeft: 36 }}
    />
  </div>
);

export const SectionHeader = ({ title, subtitle, actions }) => (
  <div className="section-head">
    <div style={{ minWidth: 0 }}>
      <h1
        style={{
          fontFamily: "'Fraunces','Playfair Display',serif",
          fontSize: "clamp(21px, 4.5vw, 26px)",
          fontWeight: 300,
          color: "var(--text-primary)",
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>
          {subtitle}
        </p>
      )}
    </div>
    {actions && <div className="section-head-actions">{actions}</div>}
  </div>
);

// ── Additional building blocks ───────────────────────────────────────────────
const SHOP_BREADCRUMB_LABELS = {
  dashboard: "Dashboard",
  billing: "Billing",
  transactions: "Sales History",
  customers: "Customers",
  "day-end": "Day Closing",
  stock: "Stock",
  barcode: "Barcodes",
  purchases: "Purchases",
  suppliers: "Suppliers",
  reports: "Reports",
  expenses: "Expenses",
  staff: "Staff",
  settings: "Settings",
};

const ADMIN_BREADCRUMB_LABELS = {
  businesses: "Businesses",
  subscriptions: "Subscriptions",
  users: "Users",
  branding: "Themes & Branding",
  reports: "Reports",
  settings: "Settings",
  account: "My Account",
};

const breadcrumbTitle = (segment) =>
  segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const Breadcrumbs = () => {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);
  if (!segments.length) return null;

  const crumbs = [{ label: "Home", to: "/" }];
  if (segments[0] === "admin") {
    crumbs.push({ label: "Platform", to: "/admin" });
    crumbs.push({
      label: segments[1] ? ADMIN_BREADCRUMB_LABELS[segments[1]] || breadcrumbTitle(segments[1]) : "Dashboard",
    });
  } else {
    segments.forEach((segment, index) => {
      const isCustomerDetails = segments[0] === "customers" && index === 1;
      const label = isCustomerDetails
        ? "Customer details"
        : SHOP_BREADCRUMB_LABELS[segment] || breadcrumbTitle(segment);
      const to = index < segments.length - 1 ? `/${segments.slice(0, index + 1).join("/")}` : undefined;
      crumbs.push({ label, to });
    });
  }

  return (
    <nav className="breadcrumbs no-print" aria-label="Breadcrumb">
      <ol>
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`}>
            {index > 0 && <span className="breadcrumb-separator" aria-hidden="true">/</span>}
            {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span aria-current="page">{crumb.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
};

export const Page = ({ children, maxWidth = 1280, className = "" }) => (
  <div style={{ maxWidth, margin: "0 auto" }} className={`fade-in page-content ${className}`.trim()}>
    <Breadcrumbs />
    {children}
  </div>
);

export const Tabs = ({ tabs, value, onChange, style = {} }) => (
  <div
    role="tablist"
    style={{
      display: "flex",
      gap: 4,
      padding: 4,
      background: "var(--bg-sunken)",
      border: "1px solid var(--border)",
      borderRadius: 11,
      overflowX: "auto",
      marginBottom: 20,
      ...style,
    }}
  >
    {tabs.map((t) => {
      const active = t.value === value;
      const Icon = t.icon;
      return (
        <button
          key={t.value}
          role="tab"
          aria-selected={active}
          onClick={() => onChange(t.value)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            whiteSpace: "nowrap",
            fontSize: 13,
            fontWeight: active ? 600 : 500,
            background: active ? "var(--bg-card)" : "transparent",
            color: active ? "var(--text-primary)" : "var(--text-secondary)",
            boxShadow: active ? "var(--shadow)" : "none",
          }}
        >
          {Icon && <Icon size={14} style={{ color: active ? "var(--accent)" : "inherit" }} />}
          {t.label}
        </button>
      );
    })}
  </div>
);

export const Pagination = ({ page, pages, onChange }) =>
  pages > 1 ? (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 18px",
        borderTop: "1px solid var(--border)",
      }}
    >
      <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
        Page {page} of {pages}
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onChange(page - 1)} disabled={page <= 1} className="btn-ghost" style={{ padding: "6px 12px" }}>
          ‹ Prev
        </button>
        <button onClick={() => onChange(page + 1)} disabled={page >= pages} className="btn-ghost" style={{ padding: "6px 12px" }}>
          Next ›
        </button>
      </div>
    </div>
  ) : null;

const TONES = {
  success: ["var(--success-light)", "var(--success)"],
  danger: ["var(--danger-light)", "var(--danger)"],
  warning: ["rgba(var(--accent-rgb),0.12)", "var(--accent-dark)"],
  info: ["var(--info-light)", "var(--info)"],
  neutral: ["var(--bg-sunken)", "var(--text-secondary)"],
  muted: ["var(--bg-sunken)", "var(--text-muted)"],
  accent: ["rgba(var(--accent-rgb),0.12)", "var(--accent-dark)"],
};
export const Pill = ({ tone = "neutral", children, style = {} }) => {
  const colors = TONES[tone] || TONES.neutral;
  return (
    <span className="badge" style={{ background: colors[0], color: colors[1], whiteSpace: "nowrap", ...style }}>
      {children}
    </span>
  );
};

export const Th = ({ children, align = "left", style = {} }) => (
  <th
    style={{
      textAlign: align,
      padding: "11px 16px",
      color: "var(--text-muted)",
      fontWeight: 500,
      fontSize: 11.5,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
      borderBottom: "1px solid var(--border)",
      ...style,
    }}
  >
    {children}
  </th>
);

/**
 * A table cell.
 *
 * `label` is what the column is called; on a phone the row collapses into a card and
 * that label is printed beside the value (see `.table-stack` in index.css), so no
 * column has to be hidden to make the table fit. `primary` marks the cell that acts
 * as the card's heading, `actions` the trailing button cell.
 */
export const Td = ({
  children,
  align = "left",
  mono = false,
  muted = false,
  label,
  primary = false,
  actions = false,
  style = {},
  ...rest
}) => (
  <td
    data-label={label}
    data-primary={primary ? "" : undefined}
    data-actions={actions ? "" : undefined}
    data-empty={children === null || children === undefined || children === "" ? "" : undefined}
    style={{
      textAlign: align,
      padding: "12px 16px",
      color: muted ? "var(--text-muted)" : "var(--text-primary)",
      fontFamily: mono ? "JetBrains Mono, monospace" : undefined,
      fontSize: mono ? 12.5 : 13.5,
      borderBottom: "1px solid var(--border)",
      verticalAlign: "middle",
      ...style,
    }}
    {...rest}
  >
    {children}
  </td>
);

/**
 * `stack` (default) turns rows into cards on phones and tablets up to 1024px.
 * Pass `stack={false}` only for rare read-only grids that must remain horizontally scrollable.
 */
export const Table = ({ children, minWidth = 640, stack = true }) => (
  <div className={`table-scroll-wrapper${stack ? " table-stack" : ""}`}>
    <table style={{ width: "100%", borderCollapse: "collapse", minWidth }}>{children}</table>
  </div>
);

export const Field = ({ label, children, hint, required, span = 1 }) => (
  <div style={{ gridColumn: `span ${span}`, minWidth: 0 }}>
    <FormField label={label} hint={hint} required={required}>
      {children}
    </FormField>
  </div>
);

export const Grid = ({ cols = 2, gap = 12, children, style = {} }) => (
  // The class carries the responsive collapse; the inline gap is the only override.
  <div className={cols >= 3 ? "form-grid-3" : "form-grid"} style={{ gap, ...style }}>
    {children}
  </div>
);

export const Toggle = ({ checked, onChange, label, description }) => (
  <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", padding: "6px 0" }}>
    <span
      onClick={(e) => {
        e.preventDefault();
        onChange(!checked);
      }}
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      style={{
        flexShrink: 0,
        width: 38,
        height: 22,
        borderRadius: 99,
        background: checked ? "var(--accent)" : "var(--border-strong)",
        position: "relative",
        transition: "background 0.15s",
        marginTop: 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 19 : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.15s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </span>
    <span>
      <span style={{ display: "block", fontSize: 13.5, color: "var(--text-primary)", fontWeight: 500 }}>{label}</span>
      {description && <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>{description}</span>}
    </span>
  </label>
);

export const MiniStat = ({ label, value, tone }) => (
  <div className="card" style={{ padding: "14px 16px" }}>
    <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</p>
    <p
      className="tabular"
      style={{
        fontSize: 19,
        fontWeight: 600,
        marginTop: 3,
        color: tone === "danger" ? "var(--danger)" : tone === "success" ? "var(--success)" : tone === "accent" ? "var(--accent-dark)" : "var(--text-primary)",
      }}
    >
      {value}
    </p>
  </div>
);
