// src/components/business/Staff.jsx — owner creates logins for managers & cashiers
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { UserCog, Plus, Edit2, Trash2, AlertTriangle } from "lucide-react";
import { staffAPI } from "../../services/api";
import { formatDateTime, getErrorMessage, ROLE_LABELS } from "../../utils/helpers";
import { useAuth } from "../../context/AuthContext";
import { Page, SectionHeader, PageLoader, EmptyState, Table, Th, Td, Modal, Field, Grid, Spinner, Pill, Toggle, ConfirmDialog } from "../shared/UI";

const PERMS = {
  owner: "Everything, including settings, staff and profit reports",
  manager: "Billing, stock, purchases, suppliers, expenses and reports",
  cashier: "Billing, sales history, customers and day closing only",
};
const EMPTY = { username: "", email: "", phone: "", password: "", role: "cashier", isActive: true };

export default function Staff() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [limits, setLimits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await staffAPI.getAll();
      setRows(r.data.data.staff);
      setLimits(r.data.data.limits);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const open = (u) => {
    setEdit(u || {});
    setForm(u ? { ...EMPTY, ...u, password: "" } : EMPTY);
  };
  const save = async () => {
    if (!form.username.trim() || !form.email.trim()) return toast.error("Name and email are required");
    if (!edit.id && form.password.length < 6) return toast.error("Password must be at least 6 characters");
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      if (edit.id) await staffAPI.update(edit.id, payload);
      else await staffAPI.create(payload);
      toast.success("Saved");
      setEdit(null);
      load();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const isSelf = edit?.id === user?.id;
  const activeUsers = rows.filter((row) => row.isActive).length;
  const overUserLimit = limits?.maxUsers > 0 && activeUsers > limits.maxUsers;
  return (
    <Page maxWidth={1080}>
      <SectionHeader
        title="Staff"
        subtitle={`${activeUsers}${limits?.maxUsers ? ` of ${limits.maxUsers}` : ""} active user logins for this shop`}
        actions={
          <button className="btn-primary" onClick={() => open(null)} disabled={limits?.maxUsers && activeUsers >= limits.maxUsers}>
            <Plus size={14} /> Add staff
          </button>
        }
      />
      {overUserLimit && (
        <div role="status" style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "11px 14px", marginBottom: 16, borderRadius: 8, background: "var(--warning-light, rgba(217, 148, 48, 0.12))", color: "var(--text-secondary)", fontSize: 12.5 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>This shop has {activeUsers - limits.maxUsers} more active user{activeUsers - limits.maxUsers === 1 ? "" : "s"} than its plan allows. Existing accounts remain available; deactivate accounts to meet the limit before adding or reactivating staff.</span>
        </div>
      )}
      <div className="grid-stats" style={{ marginBottom: 16 }}>
        {Object.entries(PERMS).map(([r, d]) => (
          <div key={r} className="card" style={{ padding: "12px 16px" }}>
            <p style={{ fontWeight: 600, fontSize: 13.5 }}>{ROLE_LABELS[r]}</p>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>{d}</p>
          </div>
        ))}
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        {loading ? (
          <PageLoader />
        ) : rows.length === 0 ? (
          <EmptyState icon={UserCog} title="No staff" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email (login)</Th>
                <Th>Role</Th>
                <Th>Last login</Th>
                <Th align="center">Status</Th>
                <Th align="center"></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <Td primary style={{ fontWeight: 500 }}>
                    {u.username} {u.id === user?.id && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(you)</span>}
                    {u.phone && <div style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 400 }}>{u.phone}</div>}
                  </Td>
                  <Td label="Email (login)" muted>{u.email}</Td>
                  <Td label="Role">{u.isSuperAdmin ? "Platform admin" : ROLE_LABELS[u.role]}</Td>
                  <Td label="Last login" muted>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</Td>
                  <Td label="Status" align="center">{u.isActive ? <Pill tone="success">Active</Pill> : <Pill tone="danger">Disabled</Pill>}</Td>
                  <Td actions align="center">
                    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                      <button className="btn-ghost" style={{ padding: "4px 8px" }} onClick={() => open(u)} aria-label="Edit">
                        <Edit2 size={13} />
                      </button>
                      {u.id !== user?.id && !u.isSuperAdmin && (
                        <button className="btn-ghost" style={{ padding: "4px 8px" }} onClick={() => setDel(u)} aria-label="Delete">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <Modal isOpen={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit staff" : "Add staff"} maxWidth={500}>
        <Grid cols={2}>
          <Field label="Name" required>
            <input className="input-field" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoFocus />
          </Field>
          <Field label="Phone">
            <input className="input-field" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Email (used to log in)" required span={2}>
            <input className="input-field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label={edit?.id ? "New password (leave blank to keep)" : "Password"} required={!edit?.id}>
            <input className="input-field" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
          </Field>
          <Field label="Role">
            <select className="input-field" value={form.role} disabled={isSelf} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.keys(PERMS).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>
        </Grid>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>{PERMS[form.role]}</p>
        {edit?.id && !isSelf && <Toggle label="Account active" checked={!!form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => setEdit(null)}>
            Cancel
          </button>
          <button className="btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={save} disabled={saving}>
            {saving && <Spinner size={13} color="var(--bg)" />} Save
          </button>
        </div>
      </Modal>
      <ConfirmDialog
        isOpen={!!del}
        onClose={() => setDel(null)}
        title="Remove staff"
        message={`Remove ${del?.username}'s login? Their past bills stay.`}
        onConfirm={async () => {
          try {
            await staffAPI.delete(del.id);
            toast.success("Removed");
            load();
          } catch (e) {
            toast.error(getErrorMessage(e));
          }
          setDel(null);
        }}
      />
    </Page>
  );
}
