// src/components/shared/AccountPanel.jsx
// "My account" — name, phone and password for whoever is signed in. Shared, because both
// the shop Settings page and the platform admin panel need it and neither should be the
// only way for a user to change their own password.
import React, { useState } from "react";
import toast from "react-hot-toast";
import { Save, Key } from "lucide-react";
import { authAPI } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { formatDate, getErrorMessage, ROLE_LABELS } from "../../utils/helpers";
import { Grid, Field, Spinner } from "./UI";

// A value the user can read but not change — deliberately not an input box
const readOnlyValue = {
  padding: "9px 0",
  fontSize: 14,
  fontWeight: 500,
  color: "var(--text-primary)",
  wordBreak: "break-word",
};

export const Section = ({ title, description, children }) => (
  <div className="card" style={{ padding: "20px 22px", marginBottom: 16 }}>
    <h3 style={{ fontSize: 17, color: "var(--text-primary)" }}>{title}</h3>
    {description && <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 3 }}>{description}</p>}
    <div style={{ marginTop: 16 }}>{children}</div>
  </div>
);

/**
 * @param {boolean} showSubscription  shop plan summary — off in the admin panel, where the
 *                                    admin has no shop of their own to show a plan for.
 */
export default function AccountPanel({ showSubscription = true }) {
  const { user, shop, setUser, isSuperAdmin } = useAuth();
  const [profile, setProfile] = useState({ username: user?.username || "", phone: user?.phone || "" });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [busy, setBusy] = useState("");

  const saveProfile = async () => {
    const name = profile.username.trim();
    const phone = (profile.phone || "").trim();
    if (!name) return toast.error("Name is required");
    // Clicking Save without touching anything used to report "Profile updated"
    if (name === (user?.username || "") && phone === (user?.phone || "")) return toast("No changes to save");
    setBusy("profile");
    try {
      const r = await authAPI.updateProfile({ username: name, phone });
      setUser(r.data.data.user);
      localStorage.setItem("user", JSON.stringify(r.data.data.user));
      toast.success("Profile updated");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy("");
    }
  };

  const changePassword = async () => {
    if (pw.newPassword.length < 6) return toast.error("New password must be at least 6 characters");
    if (pw.newPassword !== pw.confirm) return toast.error("Passwords do not match");
    setBusy("pw");
    try {
      await authAPI.changePassword({ currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      setPw({ currentPassword: "", newPassword: "", confirm: "" });
      toast.success("Password changed");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <Section title="Profile">
        <Grid cols={2}>
          <Field label="Name">
            <input className="input-field" value={profile.username} onChange={(e) => setProfile({ ...profile, username: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input className="input-field" value={profile.phone || ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
          </Field>
          {/* Email is the login identity and role is granted by the owner, so neither can be
              edited here. They used to render as empty-looking disabled inputs, which read as
              broken fields — shown as plain read-only values with the reason instead. */}
          <Field label="Email (login)" hint="Cannot be changed — this is your login">
            <p style={readOnlyValue}>{user?.email || "—"}</p>
          </Field>
          <Field label="Role" hint={isSuperAdmin ? "Platform administrator" : "Set by the business owner under Staff"}>
            <p style={readOnlyValue}>{isSuperAdmin ? "Platform admin" : ROLE_LABELS[user?.role] || user?.role || "—"}</p>
          </Field>
        </Grid>
        <button className="btn-primary" style={{ marginTop: 14 }} onClick={saveProfile} disabled={busy === "profile"}>
          {busy === "profile" ? <Spinner size={13} color="var(--bg)" /> : <Save size={13} />} Save profile
        </button>
      </Section>

      <Section title="Change password">
        <Grid cols={3}>
          <Field label="Current password">
            <input
              type="password"
              className="input-field"
              value={pw.currentPassword}
              onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
              autoComplete="current-password"
            />
          </Field>
          <Field label="New password">
            <input
              type="password"
              className="input-field"
              value={pw.newPassword}
              onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm new password">
            <input
              type="password"
              className="input-field"
              value={pw.confirm}
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              autoComplete="new-password"
            />
          </Field>
        </Grid>
        <button className="btn-primary" style={{ marginTop: 14 }} onClick={changePassword} disabled={busy === "pw" || !pw.currentPassword}>
          {busy === "pw" ? <Spinner size={13} color="var(--bg)" /> : <Key size={13} />} Update password
        </button>
      </Section>

      {showSubscription && shop && (
        <Section title="Subscription">
          <Grid cols={3}>
            <div className="card-sunken" style={{ padding: "12px 14px" }}>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Plan</p>
              <p style={{ fontSize: 16, fontWeight: 600 }}>{shop.planLabel || shop.plan}</p>
            </div>
            <div className="card-sunken" style={{ padding: "12px 14px" }}>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Valid till</p>
              <p style={{ fontSize: 16, fontWeight: 600, color: shop.subscriptionActive ? "var(--text-primary)" : "var(--danger)" }}>
                {shop.subscriptionEnds ? formatDate(shop.subscriptionEnds) : "Lifetime"}
              </p>
            </div>
            <div className="card-sunken" style={{ padding: "12px 14px" }}>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Limits</p>
              <p style={{ fontSize: 13.5, fontWeight: 500 }}>
                {shop.limits?.maxUsers ? `${shop.limits.maxUsers} users` : "Unlimited users"} ·{" "}
                {shop.limits?.maxProducts ? `${shop.limits.maxProducts} products` : "Unlimited products"}
              </p>
            </div>
          </Grid>
        </Section>
      )}
    </>
  );
}
