// src/components/auth/Login.jsx
import React, { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { getErrorMessage } from "../../utils/helpers";
import toast from "react-hot-toast";
import { Eye, EyeOff } from "lucide-react";
import { Spinner } from "../shared/UI";

export default function Login() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { platform } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const brand = platform.platformName || "SuperMart POS";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password)
      return toast.error("Please enter your email and password");
    setLoading(true);
    try {
      const u = await login(form.email.trim(), form.password);
      const from = location.state?.from?.pathname;
      navigate(from && from !== "/login" ? from : u.role === "cashier" && !u.isSuperAdmin ? "/billing" : "/dashboard", { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(0px, 3vw, 24px)",
      }}
    >
      <div
        className="auth-card"
        style={{
          width: "100%",
          maxWidth: 1120,
          background: "var(--bg-card)",
          display: "flex",
          overflow: "hidden",
          border: "1px solid var(--border)",
        }}
      >
        {/* ── LEFT: warm illustrated panel ── */}
        <div
          className="hidden lg:block"
          style={{
            width: "46%",
            position: "relative",
            background:
              "linear-gradient(160deg, #efe7d6 0%, #e4dcc6 42%, #cdd3bb 100%)",
            overflow: "hidden",
            borderRadius: "28px 0 0 28px",
          }}
        >
          {/* soft arch */}
          <div
            style={{
              position: "absolute",
              top: 60,
              left: "50%",
              transform: "translateX(-50%)",
              width: 300,
              height: 360,
              borderRadius: "150px 150px 0 0",
              background:
                "linear-gradient(180deg, rgba(255,252,244,0.55), rgba(255,252,244,0))",
            }}
          />
          {/* hanging lamp */}
          <div style={{ position: "absolute", top: 0, left: 92 }}>
            <div style={{ width: 2, height: 120, background: "#b89a63", margin: "0 auto" }} />
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: "50%",
                background: "radial-gradient(circle at 40% 35%, #fff6df, #e8cf95)",
                boxShadow: "0 8px 30px rgba(232,207,149,0.6)",
                border: "2px solid #cbb07a",
              }}
            />
          </div>
          {/* counter / POS scene (simple elegant SVG) */}
          <svg
            viewBox="0 0 400 300"
            style={{ position: "absolute", bottom: 120, left: 0, width: "100%" }}
          >
            <rect x="60" y="150" width="280" height="90" rx="10" fill="#c9cdb4" />
            <rect x="60" y="150" width="280" height="12" rx="6" fill="#b8bda0" />
            <rect x="95" y="95" width="70" height="58" rx="6" fill="#5f5a4e" />
            <rect x="103" y="103" width="54" height="34" rx="3" fill="#8f9e7d" />
            <rect x="120" y="153" width="20" height="34" fill="#4e4a40" />
            <rect x="108" y="185" width="44" height="8" rx="4" fill="#3f3c34" />
            <circle cx="250" cy="120" r="26" fill="#e8c9a0" />
            <rect x="240" y="120" width="20" height="52" rx="9" fill="#d9b98c" />
            <rect x="285" y="128" width="26" height="46" rx="6" fill="#a9805a" />
          </svg>
          {/* leaves accent */}
          <svg viewBox="0 0 100 120" style={{ position: "absolute", bottom: 150, left: 24, width: 70 }}>
            <path d="M50 120 Q20 70 40 30 Q55 60 50 120" fill="#8f9e7d" />
            <path d="M50 120 Q80 75 62 34 Q52 66 50 120" fill="#a3b189" />
          </svg>

          {/* branding footer */}
          <div style={{ position: "absolute", bottom: 40, left: 44, right: 44 }}>
            <p
              style={{
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#7d7358",
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              {brand}
            </p>
            <p
              style={{
                fontFamily: "'Fraunces','Playfair Display',serif",
                fontSize: 28,
                lineHeight: 1.25,
                color: "#2f2a1d",
                fontWeight: 500,
                letterSpacing: "-0.01em",
              }}
            >
              {platform.tagline || "A premium operating system for modern retail."}
            </p>
          </div>
        </div>

        {/* ── RIGHT: form ── */}
        <div
          className="auth-form"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div className="fade-in" style={{ width: "100%", maxWidth: 380 }}>
            {/* logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 34 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background: "var(--accent-light)",
                  border: "1px solid var(--accent)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--accent-dark)",
                  fontFamily: "'Fraunces',serif",
                  fontWeight: 600,
                  fontSize: 17,
                }}
              >
                {brand[0]}
              </div>
              <span style={{ fontFamily: "'Fraunces',serif", fontSize: 17, color: "var(--text-primary)" }}>
                {brand}
              </span>
            </div>

            <h1
              style={{
                fontFamily: "'Fraunces','Playfair Display',serif",
                fontSize: "clamp(26px, 6vw, 34px)",
                fontWeight: 500,
                color: "var(--text-primary)",
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              Hello! Welcome Back
            </h1>
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 8, marginBottom: 30 }}>
              We're glad to see you again.
            </p>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="input-field"
                  placeholder="you@yourstore.com"
                  autoComplete="email"
                  style={{ borderRadius: 12, padding: "12px 14px" }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Password
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPass ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="input-field"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    style={{ borderRadius: 12, padding: "12px 44px 12px 14px", width: "100%" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-muted)",
                      display: "flex",
                    }}
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: -2 }}>
                <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Staff? Use the login your owner created.</span>
                <Link to="/forgot-password" style={{ fontSize: 13, color: "var(--accent-dark)", fontWeight: 600, textDecoration: "none" }}>
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  justifyContent: "center",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "13px 18px",
                  marginTop: 6,
                  fontSize: 14.5,
                  fontWeight: 600,
                  color: "var(--bg)",
                  background: "var(--text-primary)",
                  border: "none",
                  borderRadius: 12,
                  cursor: loading ? "default" : "pointer",
                  opacity: loading ? 0.8 : 1,
                }}
              >
                {loading ? <Spinner size={15} color="var(--bg)" /> : null}
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>
            {platform.allowSignup !== false && (
              <p style={{ marginTop: 22, fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>
                New business?{" "}
                <Link to="/signup" style={{ color: "var(--accent-dark)", fontWeight: 600 }}>
                  Start your {platform.trialDays || 14}-day free trial
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
