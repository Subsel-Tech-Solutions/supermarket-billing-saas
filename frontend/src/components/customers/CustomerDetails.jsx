// src/components/customers/CustomerDetails.jsx — profile, bills, dues, payments, loyalty
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Edit2, Wallet, Printer, FileText, Trash2, Gift, MessageCircle } from "lucide-react";
import { customerAPI, openInvoice } from "../../services/api";
import { formatCurrency, formatDateTime, getErrorMessage, num, PAYMENT_LABELS } from "../../utils/helpers";
import { printReceipt } from "../../utils/receipt";
import { useSettings } from "../../context/SettingsContext";
import { useAuth } from "../../context/AuthContext";
import { Page, PageLoader, Tabs, Table, Th, Td, MiniStat, Pill, EmptyState, ConfirmDialog, Modal, Field } from "../shared/UI";
import CustomerForm from "./CustomerForm";
import PaymentModal from "./PaymentModal";

export default function CustomerDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("bills");
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [points, setPoints] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await customerAPI.getById(id);
      setData(r.data.data);
    } catch (e) {
      toast.error(getErrorMessage(e));
      navigate("/customers");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);
  useEffect(() => {
    load();
  }, [load]);

  if (loading || !data) return <PageLoader />;
  const { customer: c, bills, payments, returns } = data;
  const balance = num(c.balance);

  const reminder = () => {
    const phone = String(c.phone || "").replace(/\D/g, "");
    const text = `Dear ${c.name}, your pending balance at ${settings.businessName} is ${formatCurrency(balance)}. Kindly clear it at your earliest convenience. Thank you!`;
    window.open(`https://wa.me/${phone.length === 10 ? `91${phone}` : phone}?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <Page>
      <button className="btn-ghost" style={{ marginBottom: 16 }} onClick={() => navigate("/customers")}>
        <ArrowLeft size={14} /> Customers
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, paddingBottom: 18, borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 300 }}>{c.name}</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            {[c.phone, c.email, c.gstNumber && `GSTIN ${c.gstNumber}`].filter(Boolean).join(" · ")}
          </p>
          {c.address && <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{c.address}</p>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {balance > 0 && (
            <button className="btn-ghost" onClick={reminder}>
              <MessageCircle size={13} /> WhatsApp reminder
            </button>
          )}
          <button className="btn-ghost" onClick={() => setEditOpen(true)}>
            <Edit2 size={13} /> Edit
          </button>
          {can("owner", "manager") && settings.loyaltyEnabled && (
            <button className="btn-ghost" onClick={() => setPointsOpen(true)}>
              <Gift size={13} /> Points
            </button>
          )}
          <button className="btn-primary" onClick={() => setPayOpen(true)}>
            <Wallet size={14} /> Receive payment
          </button>
        </div>
      </div>

      <div className="grid-stats-sm" style={{ marginBottom: 20 }}>
        <MiniStat label="Total spent" value={formatCurrency(c.totalSpent)} />
        <MiniStat label="Bills" value={c.totalBills} />
        <MiniStat label={balance >= 0 ? "Due (to collect)" : "Advance / store credit"} value={formatCurrency(Math.abs(balance))} tone={balance > 0 ? "danger" : balance < 0 ? "success" : undefined} />
        <MiniStat label="Loyalty points" value={num(c.loyaltyPoints)} tone="accent" />
        <MiniStat
          label="Credit limit"
          value={
            c.creditLimit === null
              ? "Unlimited"
              : num(c.creditLimit) > 0
              ? formatCurrency(c.creditLimit)
              : "₹0.00 (No credit)"
          }
          tone={c.creditLimit === null ? "accent" : num(c.creditLimit) > 0 ? undefined : "danger"}
        />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "bills", label: `Bills (${bills.length})` },
          { value: "payments", label: `Payments (${payments.length})` },
          { value: "returns", label: `Returns (${returns.length})` },
        ]}
      />

      <div className="card" style={{ overflow: "hidden" }}>
        {tab === "bills" &&
          (bills.length === 0 ? (
            <EmptyState icon={FileText} title="No bills yet" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Bill</Th>
                  <Th>Date</Th>
                  <Th>Payment</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Due</Th>
                  <Th align="center">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id}>
                    <Td primary mono>
                      {b.billNumber} {b.status !== "completed" && <Pill tone={b.status === "cancelled" ? "danger" : "warning"}>{b.status.replace("_", " ")}</Pill>}
                    </Td>
                    <Td label="Date" muted>{formatDateTime(b.createdAt)}</Td>
                    <Td label="Payment">{PAYMENT_LABELS[b.paymentMethod] || b.paymentMethod}</Td>
                    <Td label="Total" align="right" mono>
                      {formatCurrency(b.totalAmount)}
                    </Td>
                    <Td label="Due" align="right" mono style={{ color: num(b.dueAmount) > 0 ? "var(--danger)" : "var(--text-muted)" }}>
                      {num(b.dueAmount) > 0 ? formatCurrency(b.dueAmount) : "—"}
                    </Td>
                    <Td label="Actions" align="center">
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button className="btn-ghost" style={{ padding: "4px 8px" }} title="Print" onClick={() => printReceipt(b, settings)}>
                          <Printer size={13} />
                        </button>
                        <button className="btn-ghost" style={{ padding: "4px 8px" }} title="PDF" onClick={() => openInvoice(b.id).catch((e) => toast.error(getErrorMessage(e)))}>
                          <FileText size={13} />
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ))}
        {tab === "payments" &&
          (payments.length === 0 ? (
            <EmptyState icon={Wallet} title="No payments recorded" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Method</Th>
                  <Th>Reference</Th>
                  <Th>By</Th>
                  <Th align="right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <Td primary muted>{formatDateTime(p.createdAt)}</Td>
                    <Td label="Method">{PAYMENT_LABELS[p.method] || p.method}</Td>
                    <Td label="Reference" muted>{[p.reference, p.notes].filter(Boolean).join(" · ") || "—"}</Td>
                    <Td label="By" muted>{p.createdBy}</Td>
                    <Td label="Amount" align="right" mono style={{ color: "var(--success)" }}>
                      {formatCurrency(p.amount)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ))}
        {tab === "returns" &&
          (returns.length === 0 ? (
            <EmptyState icon={FileText} title="No returns" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Return</Th>
                  <Th>Bill</Th>
                  <Th>Date</Th>
                  <Th>Refund</Th>
                  <Th align="right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r) => (
                  <tr key={r.id}>
                    <Td primary mono>{r.returnNumber}</Td>
                    <Td label="Bill" mono>{r.billNumber}</Td>
                    <Td label="Date" muted>{formatDateTime(r.createdAt)}</Td>
                    <Td label="Refund">{r.refundMethod.replace("_", " ")}</Td>
                    <Td label="Amount" align="right" mono>
                      {formatCurrency(r.totalAmount)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ))}
      </div>

      {can("owner", "manager") && (
        <button className="btn-danger" style={{ marginTop: 20 }} onClick={() => setDelOpen(true)}>
          <Trash2 size={13} /> Remove customer
        </button>
      )}

      <CustomerForm isOpen={editOpen} onClose={() => setEditOpen(false)} customer={c} onSaved={load} />
      <PaymentModal
        isOpen={payOpen}
        onClose={() => setPayOpen(false)}
        title={`Receive payment — ${c.name}`}
        balance={balance}
        onSubmit={async (p) => {
          await customerAPI.receivePayment(c.id, p);
          toast.success("Payment received");
          load();
        }}
      />
      <ConfirmDialog
        isOpen={delOpen}
        onClose={() => setDelOpen(false)}
        title="Remove customer"
        message={`Remove ${c.name}? Their bills stay in sales history.`}
        onConfirm={async () => {
          try {
            await customerAPI.delete(c.id);
            toast.success("Customer removed");
            navigate("/customers");
          } catch (e) {
            toast.error(getErrorMessage(e));
            setDelOpen(false);
          }
        }}
      />
      <Modal isOpen={pointsOpen} onClose={() => setPointsOpen(false)} title="Adjust loyalty points" maxWidth={360}>
        <Field label={`Add (+) or remove (−) points · current ${num(c.loyaltyPoints)}`}>
          <input className="input-field" type="number" value={points} onChange={(e) => setPoints(e.target.value)} autoFocus />
        </Field>
        <button
          className="btn-primary"
          style={{ marginTop: 14, width: "100%", justifyContent: "center" }}
          onClick={async () => {
            try {
              await customerAPI.adjustPoints(c.id, { points: num(points) });
              toast.success("Points updated");
              setPointsOpen(false);
              setPoints("");
              load();
            } catch (e) {
              toast.error(getErrorMessage(e));
            }
          }}
        >
          Save
        </button>
      </Modal>
    </Page>
  );
}
