// src/components/shared/Sidebar.jsx — role-aware navigation, colours follow Settings → Appearance
import React, { useEffect, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { ROLE_LABELS } from "../../utils/helpers";
import {
  LayoutDashboard,
  Package,
  FileText,
  LogOut,
  ShoppingCart,
  TrendingUp,
  Users,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ScanLine,
  Crown,
  Store,
  CreditCard,
  Palette,
  Truck,
  ClipboardList,
  Wallet,
  UserCog,
  Settings as SettingsIcon,
  Calculator,
} from "lucide-react";

// The platform admin runs the SaaS: create businesses, manage their plans, set platform
// branding. No till, no stock, no customers — those belong to a shop, and the admin only
// sees them by opening a specific shop for support (which switches to the owner's token).
const ADMIN_SECTIONS = [
  {
    title: "Platform",
    items: [
      { to: "/admin", icon: LayoutDashboard, label: "Dashboard", end: true },
      { to: "/admin/businesses", icon: Store, label: "Businesses" },
      { to: "/admin/subscriptions", icon: CreditCard, label: "Subscriptions" },
      { to: "/admin/users", icon: Users, label: "Users" },
    ],
  },
  {
    title: "Configure",
    items: [
      { to: "/admin/branding", icon: Palette, label: "Themes & Branding" },
      { to: "/admin/reports", icon: TrendingUp, label: "Reports" },
      { to: "/admin/settings", icon: SettingsIcon, label: "Settings" },
      // Without this the platform admin has no way to change their own password —
      // the shop Settings page is not reachable from the admin panel.
      { to: "/admin/account", icon: UserCog, label: "My Account" },
    ],
  },
];

// roles: who can see the item (super admin sees everything)
const SECTIONS = [
  {
    title: "Sell",
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", roles: ["owner", "manager"] },
      { to: "/billing", icon: ShoppingCart, label: "Billing" },
      { to: "/transactions", icon: FileText, label: "Sales History" },
      { to: "/customers", icon: Users, label: "Customers" },
      { to: "/day-end", icon: Calculator, label: "Day Closing", roles: ["owner", "manager"] },
    ],
  },
  {
    title: "Inventory",
    items: [
      { to: "/stock", icon: Package, label: "Stock", roles: ["owner", "manager"] },
      { to: "/purchases", icon: ClipboardList, label: "Purchases", roles: ["owner", "manager"] },
      { to: "/suppliers", icon: Truck, label: "Suppliers", roles: ["owner", "manager"] },
      { to: "/barcode", icon: ScanLine, label: "Barcodes", roles: ["owner", "manager"] },
    ],
  },
  {
    title: "Business",
    items: [
      { to: "/reports", icon: TrendingUp, label: "Reports", roles: ["owner", "manager"] },
      { to: "/expenses", icon: Wallet, label: "Expenses", roles: ["owner", "manager"] },
      { to: "/staff", icon: UserCog, label: "Staff", roles: ["owner"] },
      // Everyone needs this — staff see only the "My Account" tab, where they change
      // their own password; the shop settings tabs are owner-only inside the page.
      { to: "/settings", icon: SettingsIcon, label: "Settings" },
    ],
  },
];

function NavItem({ to, icon: Icon, label, collapsed, onClick, end }) {
  const [hovered, setHovered] = useState(false);
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={collapsed ? label : undefined}
      style={({ isActive }) => ({
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 14px",
        borderRadius: 8,
        fontSize: 13.5,
        fontWeight: isActive ? 500 : 400,
        color: isActive || hovered ? "var(--sidebar-text)" : "var(--sidebar-muted)",
        background: isActive ? "rgba(var(--accent-rgb),0.16)" : hovered ? "var(--sidebar-hover)" : "transparent",
        textDecoration: "none",
        transition: "all 0.15s ease",
        justifyContent: collapsed ? "center" : "flex-start",
        position: "relative",
      })}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              style={{
                position: "absolute",
                left: 0,
                top: "50%",
                transform: "translateY(-50%)",
                width: 3,
                height: 16,
                background: "var(--accent)",
                borderRadius: "0 2px 2px 0",
              }}
            />
          )}
          <Icon size={15} style={{ flexShrink: 0, color: isActive ? "var(--accent)" : "inherit" }} />
          {!collapsed && <span>{label}</span>}
        </>
      )}
    </NavLink>
  );
}

function SidebarBody({ collapsed, onClose }) {
  const { user, shop, logout, isSuperAdmin, isPlatformOnly, can } = useAuth();
  const { settings, platform } = useSettings();
  const navigate = useNavigate();
  const [logoutHover, setLogoutHover] = useState(false);
  const shopName = isPlatformOnly ? platform.platformName || "SuperMart" : settings.businessName || shop?.name || "My Shop";
  const tagline = isPlatformOnly ? "Admin Panel" : settings.tagline || "Point of Sale";
  const sections = isPlatformOnly ? ADMIN_SECTIONS : SECTIONS;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div style={{ background: "var(--sidebar-bg)", display: "flex", flexDirection: "column", height: "100%", borderRight: "1px solid var(--sidebar-border)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: collapsed ? "20px 12px" : "20px 18px",
          borderBottom: "1px solid var(--sidebar-border)",
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        {!isPlatformOnly && settings.logo ? (
          <img src={settings.logo} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover", flexShrink: 0, background: "#fff" }} />
        ) : (
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {isPlatformOnly ? <Crown size={14} color="var(--accent-contrast)" /> : <ShoppingCart size={14} color="var(--accent-contrast)" />}
          </div>
        )}
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontFamily: "'Fraunces','Playfair Display',serif",
                fontSize: 16,
                color: "var(--sidebar-text)",
                lineHeight: 1.15,
                letterSpacing: "-0.02em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {shopName}
            </p>
            <p style={{ fontSize: 10.5, color: "var(--sidebar-muted)", marginTop: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {tagline}
            </p>
          </div>
        )}
      </div>

      <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 1, overflowY: "auto" }}>
        {sections.map((section) => {
          const items = section.items.filter((i) => !i.roles || can(...i.roles));
          if (!items.length) return null;
          return (
            <div key={section.title} style={{ marginBottom: 6 }}>
              {!collapsed && (
                <p style={{ fontSize: 10.5, color: "var(--sidebar-muted)", opacity: 0.7, padding: "10px 14px 4px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {section.title}
                </p>
              )}
              {items.map((item) => (
                <NavItem key={item.to} {...item} collapsed={collapsed} onClick={onClose} />
              ))}
            </div>
          );
        })}
      </nav>

      <div style={{ padding: "10px 8px", borderTop: "1px solid var(--sidebar-border)" }}>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", marginBottom: 4 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "rgba(var(--accent-rgb),0.2)",
                border: "1px solid rgba(var(--accent-rgb),0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ color: "var(--accent)", fontSize: 11, fontWeight: 600 }}>{user?.username?.[0]?.toUpperCase()}</span>
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ color: "var(--sidebar-text)", fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user?.username}
              </p>
              <p style={{ color: "var(--sidebar-muted)", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {isSuperAdmin ? "Super Administrator" : ROLE_LABELS[user?.role] || user?.role}
              </p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          title={collapsed ? "Sign out" : undefined}
          onMouseEnter={() => setLogoutHover(true)}
          onMouseLeave={() => setLogoutHover(false)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 14px",
            borderRadius: 8,
            background: logoutHover ? "rgba(220,80,80,0.12)" : "transparent",
            border: "none",
            color: logoutHover ? "#f87171" : "var(--sidebar-muted)",
            cursor: "pointer",
            fontSize: 13.5,
            justifyContent: collapsed ? "center" : "flex-start",
          }}
        >
          <LogOut size={14} />
          {!collapsed && "Sign out"}
        </button>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "1");
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const { settings } = useSettings();
  const { shop } = useAuth();

  const toggle = () => {
    localStorage.setItem("sidebarCollapsed", collapsed ? "0" : "1");
    setCollapsed(!collapsed);
  };

  // Close on navigation (a tap on a link) and on Escape, and stop the page behind the
  // drawer from scrolling under it.
  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setMobileOpen(false);
    const onResize = () => window.innerWidth > 860 && setMobileOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [mobileOpen]);

  return (
    <>
      {/* Mobile top bar. The old build had only a floating button, so every page needed
          its own guesswork padding to avoid it covering the title. A real bar reserves
          the space once, and shows which shop the till belongs to. */}
      <div
        className="mobile-nav-bar no-print"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 46,
          zIndex: 50,
          alignItems: "center",
          gap: 10,
          padding: "0 12px",
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          style={{
            padding: 7,
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 8,
            cursor: "pointer",
            color: "var(--text-secondary)",
            display: "flex",
            flexShrink: 0,
          }}
        >
          <Menu size={17} />
        </button>
        <span
          className="truncate-1"
          style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)", minWidth: 0 }}
        >
          {settings.businessName || shop?.name || "SuperMart"}
        </span>
      </div>

      {mobileOpen && (
        <div className="mobile-nav-layer" style={{ position: "fixed", inset: 0, zIndex: 60 }}>
          <div
            style={{ position: "absolute", inset: 0, background: "var(--overlay)", backdropFilter: "blur(5px)" }}
            onClick={() => setMobileOpen(false)}
          />
          <div
            className="slide-down"
            style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "min(250px, 82vw)", animation: "none" }}
          >
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              style={{
                position: "absolute",
                top: 14,
                right: 12,
                zIndex: 1,
                padding: 6,
                color: "var(--sidebar-muted)",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              <X size={18} />
            </button>
            <SidebarBody collapsed={false} onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <aside
        className="desktop-sidebar no-print"
        style={{
          width: collapsed ? 58 : 212,
          flexShrink: 0,
          height: "100dvh",
          position: "sticky",
          top: 0,
          transition: "width 0.24s ease",
        }}
      >
        <SidebarBody collapsed={collapsed} />
        <button
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            position: "absolute",
            right: -10,
            top: 68,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "var(--text-muted)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
            zIndex: 5,
          }}
        >
          {collapsed ? <ChevronRight size={10} /> : <ChevronLeft size={10} />}
        </button>
      </aside>
    </>
  );
}
