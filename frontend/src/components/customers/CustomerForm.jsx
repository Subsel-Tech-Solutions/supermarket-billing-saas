// src/components/customers/CustomerForm.jsx — add / edit customer modal (shared)
import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { customerAPI } from "../../services/api";
import { getErrorMessage, cleanPhone, isValidPhone, numericOnly, blockNonNumericKeys } from "../../utils/helpers";
import { Modal, Field, Grid, Spinner } from "../shared/UI";
import { useAuth } from "../../context/AuthContext";

const EMPTY = { name: "", phone: "", email: "", address: "", gstNumber: "", creditLimit: "", notes: "" };

export default function CustomerForm({ isOpen, onClose, customer, onSaved }) {
  const { can } = useAuth();
  const canEditCredit = can("owner", "manager");

  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(
        customer
          ? {
              ...EMPTY,
              ...customer,
              creditLimit: customer.creditLimit === null ? "" : customer.creditLimit ?? "",
            }
          : EMPTY,
      );
    }
  }, [isOpen, customer]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const cleaned = cleanPhone(form.phone);
    if (!cleaned) return toast.error("Phone number is required");
    if (!isValidPhone(cleaned)) return toast.error("Enter a valid 10-digit mobile number");
    setSaving(true);
    try {
      const payload = { ...form, phone: cleaned };
      if (!canEditCredit) {
        if (!customer) {
          delete payload.creditLimit;
        } else {
          payload.creditLimit = customer.creditLimit;
        }
      }
      const r = customer ? await customerAPI.update(customer.id, payload) : await customerAPI.create(payload);
      toast.success(r.data.message);
      onSaved?.(r.data.data.customer);
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={customer ? "Edit customer" : "Add customer"} maxWidth={520}>
      <Grid cols={2}>
        <Field label="Name">
          <input className="input-field" value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
        </Field>
        <Field label="Phone" required>
          <input className="input-field" type="tel" value={form.phone} onChange={(e) => set("phone", cleanPhone(e.target.value))} placeholder="e.g. 9876543210" />
        </Field>
        <Field label="Email">
          <input className="input-field" type="email" value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="GSTIN (B2B)">
          <input className="input-field" value={form.gstNumber || ""} onChange={(e) => set("gstNumber", e.target.value)} />
        </Field>
        <Field label="Address" span={2}>
          <textarea className="input-field" rows={2} value={form.address || ""} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <Field
          label={canEditCredit ? "Credit limit (₹0 = no credit permitted)" : "Credit limit"}
          hint={!canEditCredit ? "🔒 Only owners and managers can modify credit limits" : undefined}
        >
          <input
            className="input-field"
            type="text"
            inputMode="decimal"
            disabled={!canEditCredit}
            value={form.creditLimit === null || form.creditLimit === undefined ? "" : form.creditLimit}
            onChange={(e) => set("creditLimit", numericOnly(e.target.value, true))}
            onKeyDown={blockNonNumericKeys(true)}
            placeholder={!canEditCredit ? (customer?.creditLimit === null ? "Unlimited" : "₹0.00 (No credit)") : "0 (No credit allowed)"}
            style={!canEditCredit ? { opacity: 0.7, cursor: "not-allowed", background: "var(--bg-sunken)" } : undefined}
          />
        </Field>
        <Field label="Notes">
          <input className="input-field" value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </Grid>
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button className="btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={save} disabled={saving}>
          {saving && <Spinner size={13} color="var(--bg)" />} Save
        </button>
      </div>
    </Modal>
  );
}
