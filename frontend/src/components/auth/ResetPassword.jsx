import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, KeyRound } from "lucide-react";
import { authAPI } from "../../services/api";
import { getErrorMessage } from "../../utils/helpers";
import { useSettings } from "../../context/SettingsContext";
import { Spinner } from "../shared/UI";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const { platform } = useSettings();
  const navigate = useNavigate();
  const brand = platform.platformName || "SuperMart POS";
  const token = searchParams.get("token") || "";

  const submit = async (event) => {
    event.preventDefault();
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    setError("");
    try {
      await authAPI.resetPassword({ token, password });
      setDone(true);
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
        <div style={{ width: 44, height: 44, borderRadius: 13, display: "grid", placeItems: "center", background: "var(--accent-light)", color: "var(--accent-dark)", marginBottom: 16 }}><KeyRound size={21} /></div>
        <h1 style={{ fontFamily: "'Fraunces','Playfair Display',serif", color: "var(--text-primary)", fontSize: 30, fontWeight: 500 }}>{done ? "Password updated" : "Choose a new password"}</h1>
        {done ? (
          <>
            <p role="status" style={{ marginTop: 10, color: "var(--text-muted)", fontSize: 13.5, lineHeight: 1.6 }}>Your password has been changed. Sign in using your new password.</p>
            <button type="button" onClick={() => navigate("/login", { replace: true })} className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: 12, marginTop: 20 }}>Go to sign in</button>
          </>
        ) : !token ? (
          <>
            <p style={{ margin: "10px 0 18px", color: "var(--text-muted)", fontSize: 13.5, lineHeight: 1.6 }}>This reset link is missing or invalid. Request a new one to continue.</p>
            <Link to="/forgot-password" className="btn-primary" style={{ justifyContent: "center", padding: 12, textDecoration: "none" }}>Request a new link</Link>
          </>
        ) : (
          <>
            <p style={{ margin: "10px 0 22px", color: "var(--text-muted)", fontSize: 13.5 }}>Choose a password between 8 and 128 characters.</p>
            <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
              <label htmlFor="new-password" style={{ color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 600 }}>New password</label>
              <input id="new-password" className="input-field" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} />
              <label htmlFor="confirm-password" style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 600 }}>Confirm new password</label>
              <input id="confirm-password" className="input-field" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              {error && <p role="alert" style={{ color: "var(--danger)", fontSize: 12.5 }}>{error}</p>}
              <button type="submit" className="btn-primary" disabled={loading} style={{ justifyContent: "center", padding: 12, marginTop: 4 }}>
                {loading ? <Spinner size={15} /> : <KeyRound size={15} />}{loading ? "Updating…" : "Reset password"}
              </button>
            </form>
          </>
        )}
        {!done && <Link to="/login" style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 24, color: "var(--accent-dark)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}><ArrowLeft size={15} /> Back to sign in</Link>}
      </section>
    </main>
  );
}
