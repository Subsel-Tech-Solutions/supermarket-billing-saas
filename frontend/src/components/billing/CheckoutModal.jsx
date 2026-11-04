import React from "react";
import { CheckCircle, WifiOff } from "lucide-react";
import { amountToWords, currencySymbol, formatCurrency, num, PAYMENT_LABELS } from "../../utils/helpers";
import { FormField, Modal, Spinner } from "../shared/UI";

export default function CheckoutModal({
  isOpen,
  onClose,
  online,
  cart,
  custName,
  custPhone,
  calc,
  canDiscount,
  checkout,
  setCheckout,
  settings,
  customer,
  methods,
  tendered,
  change,
  due,
  creditChosen,
  submitting,
  submitBill,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Complete sale" maxWidth={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {!online && (
          <div style={{ background: "var(--danger-light)", color: "var(--danger)", padding: "10px 14px", borderRadius: 8, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <WifiOff size={16} style={{ flexShrink: 0 }} />
            <span>Connection lost. Selling is paused until the server reconnects. Scanned cart items remain safe.</span>
          </div>
        )}
        <div className="card-sunken" style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{cart.length} items · {custName || custPhone || "Walk-in customer"}</p>
            <p style={{ fontSize: 26, fontWeight: 600, color: "var(--accent-dark)", fontFamily: "JetBrains Mono, monospace" }}>{formatCurrency(calc.totalAmount)}</p>
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", fontStyle: "italic", marginTop: 2 }}>{amountToWords(calc.totalAmount)}</p>
          </div>
          {(calc.billDiscount > 0 || calc.loyaltyDiscount > 0) && (
            <div style={{ textAlign: "right", fontSize: 12, color: "var(--success)" }}>
              {calc.billDiscount > 0 && <p>Discount −{formatCurrency(calc.billDiscount)}</p>}
              {calc.loyaltyDiscount > 0 && <p>Points −{formatCurrency(calc.loyaltyDiscount)}</p>}
            </div>
          )}
        </div>

        {canDiscount && (
          <FormField label="Bill discount">
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" min="0" className="input-field" value={checkout.discountValue} onChange={(e) => setCheckout({ ...checkout, discountValue: e.target.value })} placeholder="0" style={{ flex: 1 }} />
              <select className="input-field" style={{ width: 90 }} value={checkout.discountType} onChange={(e) => setCheckout({ ...checkout, discountType: e.target.value })}>
                <option value="amount">{currencySymbol()}</option>
                <option value="percent">%</option>
              </select>
            </div>
          </FormField>
        )}

        {settings.loyaltyEnabled && customer && num(customer.loyaltyPoints) >= num(settings.loyaltyMinRedeem) && (
          <FormField label={`Redeem points (has ${num(customer.loyaltyPoints)}, 1 pt = ${formatCurrency(settings.loyaltyPointValue)})`}>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" min="0" max={num(customer.loyaltyPoints)} className="input-field" value={checkout.redeemPoints} onChange={(e) => setCheckout({ ...checkout, redeemPoints: e.target.value })} style={{ flex: 1 }} />
              <button className="btn-ghost" onClick={() => setCheckout({ ...checkout, redeemPoints: String(Math.floor(num(customer.loyaltyPoints))) })}>Use all</button>
            </div>
          </FormField>
        )}

        <FormField label="Payment">
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(4, methods.length + 1)}, 1fr)`, gap: 8 }}>
            {methods.map((method) => {
              const active = !checkout.split && checkout.method === method;
              return (
                <button
                  key={method}
                  onClick={() => setCheckout({ ...checkout, split: false, method, tendered: "" })}
                  style={{
                    padding: "9px 4px",
                    borderRadius: 9,
                    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                    background: active ? "var(--accent-light)" : "var(--bg-sunken)",
                    color: active ? "var(--accent-dark)" : "var(--text-secondary)",
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {PAYMENT_LABELS[method] || method}
                </button>
              );
            })}
            <button
              onClick={() => setCheckout({ ...checkout, split: true, payments: {} })}
              style={{
                padding: "9px 4px",
                borderRadius: 9,
                border: `1px solid ${checkout.split ? "var(--accent)" : "var(--border)"}`,
                background: checkout.split ? "var(--accent-light)" : "var(--bg-sunken)",
                color: checkout.split ? "var(--accent-dark)" : "var(--text-secondary)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Split
            </button>
          </div>
        </FormField>

        {!checkout.split && checkout.method === "cash" && (
          <FormField label="Cash received (optional — to calculate change)">
            <input
              type="number"
              min="0"
              className="input-field"
              value={checkout.tendered}
              onChange={(e) => setCheckout({ ...checkout, tendered: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !submitting) {
                  e.preventDefault();
                  submitBill();
                }
              }}
              placeholder={calc.totalAmount.toFixed(2)}
              inputMode="decimal"
              autoFocus
            />
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {[...new Set([Math.ceil(calc.totalAmount / 10) * 10, Math.ceil(calc.totalAmount / 100) * 100, Math.ceil(calc.totalAmount / 500) * 500, 2000])]
                .filter((amount) => amount >= calc.totalAmount)
                .slice(0, 4)
                .map((amount) => (
                  <button key={amount} className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => setCheckout({ ...checkout, tendered: String(amount) })}>
                    {formatCurrency(amount)}
                  </button>
                ))}
            </div>
          </FormField>
        )}

        {checkout.split && (
          <div className="form-grid" style={{ gap: 10 }}>
            {methods.map((method) => (
              <FormField key={method} label={PAYMENT_LABELS[method] || method}>
                <input
                  type="number"
                  min="0"
                  className="input-field"
                  value={checkout.payments[method] || ""}
                  onChange={(e) => setCheckout({ ...checkout, payments: { ...checkout.payments, [method]: e.target.value } })}
                />
              </FormField>
            ))}
          </div>
        )}

        <div className="card-sunken" style={{ padding: "10px 14px", fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
          <Row label="Paid now" value={formatCurrency(Math.min(tendered, calc.totalAmount))} />
          {change > 0 && <Row label="Change to return" value={formatCurrency(change)} color="var(--success)" bold />}
          {due > 0 && <Row label="Balance due (credit)" value={formatCurrency(due)} color="var(--danger)" bold />}
        </div>

        {due > 0 && !creditChosen && (
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "11px 13px",
              borderRadius: 10,
              cursor: "pointer",
              background: checkout.acceptDue ? "var(--danger-light)" : "var(--bg-sunken)",
              border: `1px solid ${checkout.acceptDue ? "var(--danger)" : "var(--border)"}`,
            }}
          >
            <input type="checkbox" checked={!!checkout.acceptDue} onChange={(e) => setCheckout({ ...checkout, acceptDue: e.target.checked })} style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0, accentColor: "var(--danger)" }} />
            <span style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>
              Put the balance of <b>{formatCurrency(due)}</b> on credit (udhaar)
              <span style={{ display: "block", fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>
                {custName || custPhone
                  ? `Added to ${custName || custPhone}'s account to collect later.`
                  : "Enter the customer's phone above — a due needs an account to collect from."}
              </span>
            </span>
          </label>
        )}

        <div className="form-grid" style={{ gap: 12 }}>
          <FormField label="Note (optional)">
            <input className="input-field" value={checkout.notes} onChange={(e) => setCheckout({ ...checkout, notes: e.target.value })} />
          </FormField>
          <FormField label="Customer GSTIN (optional)" hint="For a B2B tax invoice">
            <input
              className="input-field"
              value={checkout.customerGst}
              onChange={(e) => setCheckout({ ...checkout, customerGst: e.target.value.toUpperCase() })}
              placeholder="33ABCDE1234F1Z5"
              maxLength={15}
              style={{ textTransform: "uppercase", fontFamily: "JetBrains Mono, monospace" }}
            />
          </FormField>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} className="btn-ghost" style={{ flex: 1, justifyContent: "center" }}>Back</button>
          <button onClick={submitBill} disabled={submitting || !online} className="btn-primary" style={{ flex: 2, justifyContent: "center", padding: "11px", opacity: !online ? 0.6 : 1, cursor: !online ? "not-allowed" : "pointer" }}>
            {submitting ? <Spinner size={14} color="var(--bg)" /> : !online ? <><WifiOff size={15} /> Offline — Selling Paused</> : <><CheckCircle size={15} /> Confirm sale (F9)</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value, color, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", color: color || "inherit", fontWeight: bold ? 600 : 400 }}>
      <span>{label}</span>
      <span style={{ fontFamily: "JetBrains Mono, monospace" }}>{value}</span>
    </div>
  );
}
