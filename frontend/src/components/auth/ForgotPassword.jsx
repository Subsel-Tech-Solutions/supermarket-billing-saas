import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Mail, Send } from "lucide-react";
import { authAPI } from "../../services/api";
import { getErrorMessage } from "../../utils/helpers";
import { useSettings } from "../../context/SettingsContext";
import { Spinner } from "../shared/UI";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const { platform } = useSettings();
  const brand = platform.platformName || "SuperMart POS";

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await authAPI.forgotPassword({ email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20, background: "var(--bg)" }}>
      <section className="auth-card fade-in" style={{ width: "100%", maxWidth: 440, padding: "clamp(24px, 6vw, 42px)", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 30 }}>
          <span style={{ width: 38, height: 38, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--accent-light)", color: "var(--accent-dark)", fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 600 }}>{brand[0]}</span>
          <span style={{ color: "var(--text-primary)", fontFamily: "'Fraunces',serif", fontSize: 17 }}>{brand}</span>
        </div>
        <div style={{ width: 44, height: 44, borderRadius: 13, display: "grid", placeItems: "center", background: "var(--accent-light)", color: "var(--accent-dark)", marginBottom: 16 }}><Mail size={21} /></div>
        <h1 style={{ fontFamily: "'Fraunces','Playfair Display',serif", color: "var(--text-primary)", fontSize: 30, fontWeight: 500 }}>Forgot your password?</h1>
        {sent ? (
          <div role="status" className="card-sunken" style={{ padding: 15, marginTop: 18, color: "var(--text-secondary)", fontSize: 13.5, lineHeight: 1.6 }}>
            If an account exists for <b>{email.trim()}</b>, we’ve sent a reset link. Check your inbox and spam folder. The link expires in 30 minutes.
          </div>
        ) : (
          <>
            <p style={{ margin: "9px 0 24px", color: "var(--text-muted)", fontSize: 13.5, lineHeight: 1.6 }}>Enter the email address for your account and we’ll send you a link to choose a new password.</p>
            <form onSubmit={submit} style={{ display: "grid", gap: 13 }}>
              <label htmlFor="reset-email" style={{ color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 600 }}>Email address</label>
              <input id="reset-email" className="input-field" type="email" autoComplete="email" required maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourstore.com" />
              {error && <p role="alert" style={{ color: "var(--danger)", fontSize: 12.5 }}>{error}</p>}
              <button type="submit" className="btn-primary" disabled={loading} style={{ justifyContent: "center", padding: 12, marginTop: 3 }}>
                {loading ? <Spinner size={15} /> : <Send size={15} />}{loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </>
        )}
        <Link to="/login" style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 24, color: "var(--accent-dark)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}><ArrowLeft size={15} /> Back to sign in</Link>
      </section>
    </main>
  );
}
