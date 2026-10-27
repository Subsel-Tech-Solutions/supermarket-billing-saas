// src/components/settings/Settings.jsx — the business owner configures EVERYTHING here
import React, { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  Store,
  Palette,
  Receipt,
  Percent,
  Package,
  Gift,
  User,
  Save,
  Sun,
  Moon,
  Monitor,
  Upload,
  Trash2,
  RotateCcw,
  Printer,
} from "lucide-react";
import { useSettings } from "../../context/SettingsContext";
import { isAccentTooLight } from "../../utils/theme";
import { useAuth } from "../../context/AuthContext";
import { settingsAPI } from "../../services/api";
import { getErrorMessage } from "../../utils/helpers";
import { printReceipt } from "../../utils/receipt";
import AccountPanel from "../shared/AccountPanel";
import { Page, SectionHeader, Tabs, Field, Grid, Toggle, Spinner } from "../shared/UI";

const ACCENTS = ["#bf9c5a", "#c0673f", "#b0445a", "#7a4fb5", "#3f6fb5", "#2f8c86", "#4c8a4a", "#8a7a2a", "#3d3d3d", "#d4a017"];
const PAYMENT_OPTIONS = [
  ["cash", "Cash"],
  ["upi", "UPI"],
  ["card", "Card"],
  ["credit", "Credit (Due)"],
  ["wallet", "Wallet"],
  ["cheque", "Cheque"],
  ["other", "Other"],
];

const Section = ({ title, description, children }) => (
  <div className="card" style={{ padding: "20px 22px", marginBottom: 16 }}>
    <h3 style={{ fontSize: 17, color: "var(--text-primary)" }}>{title}</h3>
    {description && <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 3 }}>{description}</p>}
    <div style={{ marginTop: 16 }}>{children}</div>
  </div>
);

// Resize an uploaded logo to max 256px so it stays small
const readLogo = (file) =>
  new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file"));
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type)) return reject(new Error("Use a PNG, JPG, WEBP or SVG image"));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      if (file.type === "image/svg+xml") return resolve(reader.result);
      const img = new Image();
      img.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("Invalid image"));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

const SAMPLE_BILL = {
  billNumber: "INV-000123",
  createdAt: new Date().toISOString(),
  customerName: "Ramesh",
  customerPhone: "9876543210",
  cashierName: "Cashier",
  items: [
    { productName: "Ponni Rice 5kg", quantity: 1, unit: "pcs", unitPrice: 340, mrp: 380, taxRate: 5, discount: 0, totalPrice: 340 },
    { productName: "Tomato (loose)", quantity: 1.25, unit: "kg", unitPrice: 40, mrp: null, taxRate: 0, discount: 0, totalPrice: 50 },
    { productName: "Sunflower Oil 1L", quantity: 2, unit: "pcs", unitPrice: 145, mrp: 160, taxRate: 5, discount: 10, totalPrice: 280 },
  ],
  subtotal: 680,
  itemDiscount: 10,
  discountAmount: 0,
  taxableAmount: 628.57,
  taxAmount: 29.43,
  cgst: 14.71,
  sgst: 14.72,
  roundOff: 0,
  totalAmount: 670,
  payments: [{ method: "upi", amount: 670 }],
  loyaltyEarned: 6,
  pricesIncludeTax: true,
};

export default function Settings() {
  const { settings, save, preview, apply } = useSettings();
  const { can } = useAuth();
  const isOwner = can("owner");
  const [tab, setTab] = useState(isOwner ? "business" : "account");
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => setForm(settings), [settings]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(settings), [form, settings]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setAppearance = (k, v) => {
    const next = { ...form, [k]: v };
    setForm(next);
    preview(next); // live preview across the whole app
  };

  // Restore the last SAVED theme if the user leaves the page without saving
  const savedRef = useRef(settings);
  useEffect(() => {
    savedRef.current = settings;
  }, [settings]);
  useEffect(() => () => apply(savedRef.current), []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setSaving(true);
    try {
      await save(form);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setForm(settings);
    apply(settings);
  };

  const onLogo = async (file) => {
    try {
      set("logo", await readLogo(file));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const tabs = [
    ...(isOwner
      ? [
          { value: "business", label: "Business", icon: Store },
          { value: "appearance", label: "Appearance", icon: Palette },
          { value: "billing", label: "Billing & Tax", icon: Percent },
          { value: "receipt", label: "Receipt", icon: Receipt },
          { value: "inventory", label: "Inventory", icon: Package },
          { value: "loyalty", label: "Loyalty", icon: Gift },
        ]
      : []),
    { value: "account", label: "My Account", icon: User },
  ];

  const text = (label, key, props = {}, span = 1) => (
    <Field label={label} span={span}>
      <input className="input-field" value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)} {...props} />
    </Field>
  );
  const number = (label, key, props = {}, span = 1) => (
    <Field label={label} span={span} hint={props.hint}>
      <input
        type="number"
        className="input-field"
        value={form[key] ?? ""}
        onChange={(e) => set(key, e.target.value === "" ? "" : Number(e.target.value))}
        min={props.min ?? 0}
        max={props.max}
        step={props.step ?? "any"}
      />
    </Field>
  );
  const toggle = (label, key, description) => <Toggle label={label} description={description} checked={!!form[key]} onChange={(v) => set(key, v)} />;
  const listEditor = (label, key, hint) => (
    <Field label={label} hint={hint || "Separate with commas"} span={2}>
      <textarea
        className="input-field"
        rows={2}
        value={(form[key] || []).join(", ")}
        onChange={(e) => set(key, e.target.value.split(",").map((s) => s.trimStart()))}
        onBlur={(e) => set(key, e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
        style={{ resize: "vertical" }}
      />
    </Field>
  );

  return (
    <Page maxWidth={1040}>
      <SectionHeader
        title="Settings"
        subtitle={isOwner ? "Configure your business, look & feel, billing and receipts" : "Your account"}
        actions={
          isOwner && tab !== "account" ? (
            <>
              {dirty && (
                <button className="btn-ghost" onClick={discard}>
                  Discard
                </button>
              )}
              <button className="btn-primary" onClick={handleSave} disabled={saving || !dirty}>
                {saving ? <Spinner size={13} color="var(--bg)" /> : <Save size={14} />} Save changes
              </button>
            </>
          ) : null
        }
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "business" && (
        <>
          <Section title="Business profile" description="Shown on the sidebar, receipts and invoices.">
            <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
              <div
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: 14,
                  border: "1px dashed var(--border-strong)",
                  display: "grid",
                  placeItems: "center",
                  overflow: "hidden",
                  background: "var(--bg-sunken)",
                }}
              >
                {form.logo ? <img src={form.logo} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <Store size={26} style={{ color: "var(--text-muted)" }} />}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {/* SVG is deliberately not offered: the logo is inlined into printed
                    receipt HTML, and the server only accepts base64 rasters. */}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => onLogo(e.target.files[0])} />
                <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
                  <Upload size={13} /> Upload logo
                </button>
                {form.logo && (
                  <button className="btn-danger" onClick={() => set("logo", "")}>
                    <Trash2 size={13} /> Remove
                  </button>
                )}
              </div>
            </div>
            <Grid cols={2}>
              {text("Business name *", "businessName", { placeholder: "e.g. Sri Krishna Supermarket" })}
              {text("Tagline (under name in sidebar)", "tagline", { placeholder: "Point of Sale" })}
              {text("Legal / registered name", "legalName")}
              {text("Phone", "phone", { type: "tel" })}
              {text("Email", "email", { type: "email" })}
              {text("Website", "website")}
              <Field label="Address" span={2}>
                <textarea className="input-field" rows={2} value={form.address || ""} onChange={(e) => set("address", e.target.value)} style={{ resize: "vertical" }} />
              </Field>
              {text("City", "city")}
              {text("State", "state")}
              {text("PIN code", "pincode")}
              {text("GSTIN", "gstNumber", { style: { textTransform: "uppercase" }, placeholder: "33ABCDE1234F1Z5" })}
              {text("FSSAI licence no.", "fssaiNumber")}
            </Grid>
          </Section>
          <Section title="Region & currency">
            <Grid cols={3}>
              {text("Currency symbol", "currencySymbol", { maxLength: 4 })}
              {text("Currency code", "currencyCode", { maxLength: 3 })}
              <Field label="Number format">
                <select className="input-field" value={form.locale} onChange={(e) => set("locale", e.target.value)}>
                  <option value="en-IN">India (1,00,000.00)</option>
                  <option value="en-US">International (100,000.00)</option>
                  <option value="en-GB">UK (100,000.00)</option>
                  <option value="en-KE">Kenya (100,000.00)</option>
                  <option value="ar-AE">UAE</option>
                </select>
              </Field>
              <Field label="Time zone" hint="Used for daily reports and day closing">
                <select className="input-field" value={form.timezoneOffsetMinutes} onChange={(e) => set("timezoneOffsetMinutes", Number(e.target.value))}>
                  {[
                    [330, "India (UTC+05:30)"],
                    [345, "Nepal (UTC+05:45)"],
                    [360, "Bangladesh (UTC+06:00)"],
                    [240, "UAE (UTC+04:00)"],
                    [180, "Kenya / Saudi (UTC+03:00)"],
                    [480, "Singapore / Malaysia (UTC+08:00)"],
                    [0, "UTC / UK (UTC+00:00)"],
                    [-300, "US Eastern (UTC-05:00)"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
            </Grid>
          </Section>
        </>
      )}

      {tab === "appearance" && (
        <>
          <Section title="Theme" description="Changes preview instantly — click Save to keep them for everyone in your shop.">
            <div className="grid-stats-sm" style={{ gap: 10 }}>
              {[
                ["light", "Light", Sun],
                ["dark", "Dark", Moon],
                ["system", "Follow device", Monitor],
              ].map(([v, label, Icon]) => {
                const active = form.themeMode === v;
                return (
                  <button
                    key={v}
                    onClick={() => setAppearance("themeMode", v)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "14px 16px",
                      borderRadius: 12,
                      cursor: "pointer",
                      border: `1.5px solid ${active ? "var(--accent)" : "var(--border)"}`,
                      background: active ? "var(--accent-light)" : "var(--bg-card)",
                      color: active ? "var(--accent-dark)" : "var(--text-secondary)",
                      fontWeight: 600,
                      fontSize: 13.5,
                    }}
                  >
                    <Icon size={17} /> {label}
                  </button>
                );
              })}
            </div>
          </Section>
          <Section title="Brand colour" description="Used for buttons, highlights, charts and the active menu item across the whole site.">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  onClick={() => setAppearance("accentColor", c)}
                  aria-label={`Colour ${c}`}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: c,
                    cursor: "pointer",
                    border: form.accentColor === c ? "3px solid var(--text-primary)" : "3px solid transparent",
                    boxShadow: "0 0 0 1px var(--border)",
                  }}
                />
              ))}
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", marginLeft: 6 }}>
                Custom
                <input
                  type="color"
                  value={form.accentColor || "#bf9c5a"}
                  onChange={(e) => setAppearance("accentColor", e.target.value)}
                  style={{ width: 42, height: 36, border: "1px solid var(--border)", borderRadius: 8, background: "none", cursor: "pointer" }}
                />
                <code style={{ fontSize: 12 }}>{form.accentColor}</code>
              </label>
            </div>
            {isAccentTooLight(form.accentColor) && (
              <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>
                Too light — buttons and links in this colour will be hard to see. Pick a deeper shade.
              </p>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
              <button className="btn-accent" style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}>
                Accent button
              </button>
              <button className="btn-primary">Primary button</button>
              <button className="btn-ghost">Ghost button</button>
              <span className="badge" style={{ background: "var(--accent-light)", color: "var(--accent-dark)" }}>
                Badge
              </span>
            </div>
          </Section>
          <Section title="Sidebar & layout">
            <Grid cols={2}>
              <Field label="Sidebar style">
                <select className="input-field" value={form.sidebarStyle} onChange={(e) => setAppearance("sidebarStyle", e.target.value)}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="accent">Brand colour</option>
                </select>
              </Field>
              <Field label={`Text size — ${form.fontScale || 100}%`}>
                <input
                  type="range"
                  min={85}
                  max={120}
                  step={5}
                  value={form.fontScale || 100}
                  onChange={(e) => setAppearance("fontScale", Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
              </Field>
            </Grid>
            <div style={{ marginTop: 10 }}>
              <Toggle label="Compact mode" description="Tighter spacing to fit more on screen" checked={!!form.compactMode} onChange={(v) => setAppearance("compactMode", v)} />
            </div>
            <button
              className="btn-ghost"
              style={{ marginTop: 14 }}
              onClick={async () => {
                try {
                  const r = await settingsAPI.resetAppearance();
                  apply(r.data.data.settings);
                  toast.success("Appearance reset to default");
                } catch (err) {
                  toast.error(getErrorMessage(err));
                }
              }}
            >
              <RotateCcw size={13} /> Reset appearance
            </button>
          </Section>
        </>
      )}

      {tab === "billing" && (
        <>
          <Section title="Tax (GST)">
            {toggle("Enable GST / tax", "taxEnabled", "Tax rate is set on each product (0, 5, 12, 18, 28%)")}
            {toggle("Selling prices include tax", "pricesIncludeTax", "ON = MRP style (tax is inside the price). OFF = tax is added on top.")}
            {toggle("Round off bill total", "roundOff", "Round the final amount to the nearest rupee")}
            <Grid cols={2} style={{ marginTop: 12 }}>
              {text("Tax label", "taxLabel", { placeholder: "GST" })}
              {number("Default tax % for new products", "defaultTaxRate", { max: 100 })}
            </Grid>
          </Section>
          <Section title="Numbering">
            <Grid cols={3}>
              {text("Bill prefix", "billPrefix", { maxLength: 10 })}
              {text("Purchase prefix", "purchasePrefix", { maxLength: 10 })}
              {text("Return prefix", "returnPrefix", { maxLength: 10 })}
            </Grid>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>Example: {form.billPrefix || "INV"}-000124</p>
          </Section>
          <Section title="Payment methods" description="Which buttons appear at checkout.">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PAYMENT_OPTIONS.map(([v, l]) => {
                const on = (form.paymentMethods || []).includes(v);
                return (
                  <button
                    key={v}
                    onClick={() => set("paymentMethods", on ? form.paymentMethods.filter((m) => m !== v) : [...(form.paymentMethods || []), v])}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 9,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 500,
                      border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                      background: on ? "var(--accent-light)" : "var(--bg-card)",
                      color: on ? "var(--accent-dark)" : "var(--text-secondary)",
                    }}
                  >
                    {on ? "✓ " : ""}
                    {l}
                  </button>
                );
              })}
            </div>
            <Grid cols={2} style={{ marginTop: 14 }}>
              <Field label="Default payment method">
                <select className="input-field" value={form.defaultPaymentMethod} onChange={(e) => set("defaultPaymentMethod", e.target.value)}>
                  {(form.paymentMethods || []).map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_OPTIONS.find((p) => p[0] === m)?.[1] || m}
                    </option>
                  ))}
                </select>
              </Field>
              {number("Max bill discount (%)", "maxBillDiscountPercent", { max: 100 })}
            </Grid>
          </Section>
          <Section title="Rules">
            {toggle("Allow credit (due / udhaar) sales", "allowCreditSale")}
            {toggle("Require customer phone for credit sales", "requireCustomerForCredit")}
            {toggle("Allow selling when stock is zero", "allowNegativeStock", "Stock can go negative (fix it later with a purchase)")}
            {toggle("Cashiers can give discounts", "cashierCanDiscount")}
            {toggle("Cashiers can cancel bills", "cashierCanCancel")}
            {toggle("Print receipt automatically after each sale", "autoPrintAfterSale")}
          </Section>
        </>
      )}

      {tab === "receipt" && (
        <>
          <Section title="Receipt format">
            <Grid cols={2}>
              <Field label="Paper size">
                <select className="input-field" value={form.receiptFormat} onChange={(e) => set("receiptFormat", e.target.value)}>
                  <option value="thermal58">Thermal 58 mm (2 inch)</option>
                  <option value="thermal80">Thermal 80 mm (3 inch)</option>
                  <option value="a4">A4 invoice</option>
                </select>
              </Field>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button className="btn-ghost" onClick={() => printReceipt(SAMPLE_BILL, form)}>
                  <Printer size={13} /> Print test receipt
                </button>
              </div>
            </Grid>
            <div style={{ marginTop: 12 }}>
              {toggle("Show logo", "showLogoOnReceipt")}
              {toggle("Show MRP", "showMrpOnReceipt")}
              {toggle("Show 'You saved' line", "showSavingsOnReceipt")}
              {toggle("Show CGST / SGST break-up", "showTaxBreakupOnReceipt")}
              {toggle("Show cashier name", "showCashierOnReceipt")}
            </div>
          </Section>
          <Section title="Receipt text">
            <Grid cols={1}>
              {text("Header line (optional)", "receiptHeader", { placeholder: "e.g. Free home delivery above ₹500" })}
              {text("Footer message", "receiptFooter")}
              <Field label="Terms & conditions">
                <textarea className="input-field" rows={2} value={form.termsAndConditions || ""} onChange={(e) => set("termsAndConditions", e.target.value)} />
              </Field>
            </Grid>
          </Section>
        </>
      )}

      {tab === "inventory" && (
        <>
          <Section title="Stock alerts">
            <Grid cols={2}>
              {number("Default low-stock level", "lowStockThreshold", { hint: "Used when a product has no reorder level" })}
              {number("Expiry alert (days before)", "expiryAlertDays", { min: 1, max: 365 })}
            </Grid>
            {toggle("Track expiry dates", "trackExpiry")}
          </Section>
          <Section title="Lists">
            <Grid cols={2}>
              {listEditor("Product categories", "categories")}
              {listEditor("Units", "units", "e.g. pcs, kg, g, l, ml, pack")}
              {listEditor("Expense categories", "expenseCategories")}
            </Grid>
          </Section>
        </>
      )}

      {tab === "loyalty" && (
        <Section title="Loyalty points" description="Customers earn points on every bill (when their phone number is entered).">
          {toggle("Enable loyalty points", "loyaltyEnabled")}
          <Grid cols={3} style={{ marginTop: 12 }}>
            {number(`Points per ${form.currencySymbol || "₹"}100 spent`, "loyaltyEarnPer100", { step: 0.5 })}
            {number(`Value of 1 point (${form.currencySymbol || "₹"})`, "loyaltyPointValue", { step: 0.1 })}
            {number("Minimum points to redeem", "loyaltyMinRedeem")}
          </Grid>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 12 }}>
            Example: a {form.currencySymbol || "₹"}1,000 bill earns {Math.floor(10 * (Number(form.loyaltyEarnPer100) || 0))} points worth{" "}
            {form.currencySymbol || "₹"}
            {(Math.floor(10 * (Number(form.loyaltyEarnPer100) || 0)) * (Number(form.loyaltyPointValue) || 0)).toFixed(2)}.
          </p>
        </Section>
      )}

      {tab === "account" && <AccountPanel />}
    </Page>
  );
}
