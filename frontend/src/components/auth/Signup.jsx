// src/components/auth/Signup.jsx — new business signup (gets its own private database)
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { getErrorMessage } from "../../utils/helpers";
import toast from "react-hot-toast";
import { Eye, EyeOff, Check, Key } from "lucide-react";
import { Spinner } from "../shared/UI";

const BUSINESS_TYPES = [
  ["supermarket", "Supermarket"],
  ["grocery", "Grocery / Kirana"],
  ["departmental", "Departmental store"],
  ["pharmacy", "Pharmacy"],
  ["bakery", "Bakery / Sweets"],
  ["other", "Other retail"],
];

export default function Signup() {
  const [form, setForm] = useState({
    shopName: "",
    businessType: "supermarket",
    username: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
    inviteCode: "",
    hp_company_field: "", // Honeypot field for bot protection
  });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unlockedWithInvite, setUnlockedWithInvite] = useState(false);
  const [inviteInput, setInviteInput] = useState("");

  const { register } = useAuth();
  const { platform } = useSettings();
  const navigate = useNavigate();
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.shopName.trim() || !form.email.trim() || !form.password) return toast.error("Business name, email and password are required");
    if (form.password.length < 6) return toast.error("Password must be at least 6 characters");
    if (form.password !== form.confirm) return toast.error("Passwords do not match");
    setLoading(true);
    try {
      const { confirm, ...payload } = form;
      await register({ ...payload, email: payload.email.trim() });
      toast.success("Welcome! Your store is ready.");
      navigate("/settings", { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const input = (label, key, type = "text", placeholder = "", extra = {}) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>{label}</label>
      <input type={type} value={form[key]} onChange={(e) => set(key, e.target.value)} className="input-field" placeholder={placeholder} style={{ borderRadius: 11, padding: "11px 13px" }} {...extra} />
    </div>
  );

  if (platform.allowSignup === false && !unlockedWithInvite) {
    return (
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "var(--bg)", padding: 24 }}>
        <div className="card" style={{ padding: 32, maxWidth: 440, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Signups are closed</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            Contact {platform.supportPhone || platform.supportEmail || "the administrator"} to get an account.
          </p>

          <div style={{ marginTop: 24, padding: "16px", background: "var(--bg-sunken)", borderRadius: 12, textAlign: "left" }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
              Have an invitation code?
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                className="input-field"
                placeholder="Enter invite code"
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
                style={{ padding: "8px 12px", fontSize: 13 }}
              />
              <button
                type="button"
                className="btn-primary"
                style={{ padding: "8px 14px", fontSize: 13 }}
                onClick={() => {
                  if (!inviteInput.trim()) return toast.error("Enter an invite code");
                  set("inviteCode", inviteInput.trim());
                  setUnlockedWithInvite(true);
                }}
              >
                Continue
              </button>
            </div>
          </div>

          <Link to="/login" className="btn-ghost" style={{ marginTop: 18, textDecoration: "none", width: "100%", justifyContent: "center" }}>
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "clamp(0px, 3vw, 24px)" }}>
      <div
        className="auth-card"
        style={{
          width: "100%",
          maxWidth: 1000,
          background: "var(--bg-card)",
          display: "flex",
          overflow: "hidden",
          border: "1px solid var(--border)",
        }}
      >
        <div
          className="hidden lg:flex"
          style={{
            width: "40%",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 40,
            background: "linear-gradient(160deg, var(--accent-light) 0%, var(--bg-sunken) 100%)",
          }}
        >
          <div>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--accent)", color: "var(--accent-contrast)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, marginBottom: 20 }}>
              SM
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 300, lineHeight: 1.25 }}>Get started with {platform.platformName || "SuperMart POS"}</h2>
            <p style={{ marginTop: 12, color: "var(--text-secondary)", fontSize: 14 }}>{platform.trialDays || 14}-day free trial · No card required · Instant setup</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {["Multi-counter barcode billing", "Live inventory & low stock alerts", "Thermal receipt printing (USB/BT)", "GST compliance & credit accounts", "Dedicated, isolated database for your store"].map((t) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text-secondary)" }}>
                <span style={{ width: 18, height: 18, borderRadius: 99, background: "var(--accent)", color: "var(--accent-contrast)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Check size={11} strokeWidth={3} />
                </span>
                <span>{t}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>© {new Date().getFullYear()} {platform.platformName || "SuperMart POS"}</p>
        </div>

        <div style={{ flex: 1, padding: "clamp(24px, 4vw, 48px)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ maxWidth: 440, width: "100%", margin: "0 auto" }}>
            <h1 style={{ fontSize: 26, fontWeight: 300 }}>Create your store</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13.5, marginTop: 4, marginBottom: 24 }}>Set up your point of sale in under a minute.</p>

            {form.inviteCode && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--accent-light)", borderRadius: 8, fontSize: 12.5, marginBottom: 16, color: "var(--accent-dark)" }}>
                <Key size={14} />
                <span>Invited registration: <b>{form.inviteCode}</b></span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Bot Honeypot */}
              <input
                type="text"
                name="hp_company_field"
                value={form.hp_company_field}
                onChange={(e) => set("hp_company_field", e.target.value)}
                style={{ display: "none" }}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
              />

              {input("Store / Business name", "shopName", "text", "e.g. Metro Supermarket", { autoFocus: true })}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Business type</label>
                <select className="input-field" value={form.businessType} onChange={(e) => set("businessType", e.target.value)} style={{ borderRadius: 11, padding: "11px 13px" }}>
                  {BUSINESS_TYPES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-grid" style={{ gap: 12 }}>
                {input("Your name", "username", "text", "Owner name")}
                {input("Phone", "phone", "tel", "+91 …")}
              </div>
              {input("Email (login)", "email", "email", "you@store.com", { autoComplete: "email" })}
              <div className="form-grid" style={{ gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Password</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showPass ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => set("password", e.target.value)}
                      className="input-field"
                      placeholder="Min 6 characters"
                      autoComplete="new-password"
                      style={{ borderRadius: 11, padding: "11px 40px 11px 13px" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      aria-label="Show password"
                      style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
                    >
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                {input("Confirm password", "confirm", showPass ? "text" : "password", "Repeat password", { autoComplete: "new-password" })}
              </div>
              <button type="submit" disabled={loading} className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: "13px 18px", marginTop: 6, fontSize: 14.5, borderRadius: 12 }}>
                {loading ? <Spinner size={14} color="var(--bg)" /> : null}
                {loading ? "Setting up your store…" : "Create store"}
              </button>
            </form>
            <p style={{ marginTop: 20, fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>
              Already have an account?{" "}
              <Link to="/login" style={{ color: "var(--accent-dark)", fontWeight: 600 }}>
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
