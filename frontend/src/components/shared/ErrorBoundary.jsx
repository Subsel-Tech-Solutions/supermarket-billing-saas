// src/components/shared/ErrorBoundary.jsx
// Without this, one bad render anywhere in the tree blanks the whole till mid-sale and the
// cashier has no way back except closing the browser. Here they get the cart back instead.
import React from "react";
import { cartOwnerKey, persistedCartKey } from "../../utils/persistentCart";

const box = {
  minHeight: "100dvh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: "var(--bg)",
};

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, showDetail: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // Kept in the console so a shop can read it out over the phone to support.
    console.error("[SuperMart] render error:", error, info?.componentStack);
  }

  reset = () => this.setState({ error: null, info: null, showDetail: false });

  render() {
    const { error, info, showDetail } = this.state;
    if (!error) return this.props.children;

    const held = (() => {
      try {
        const user = JSON.parse(localStorage.getItem("user") || "null");
        const shop = JSON.parse(localStorage.getItem("shop") || "null");
        const owner = cartOwnerKey(user, shop);
        const raw = JSON.parse(localStorage.getItem(persistedCartKey(owner)) || "null");
        return raw?.owner === owner && Array.isArray(raw?.cart) ? raw.cart.length : 0;
      } catch {
        return 0;
      }
    })();

    // Read from storage rather than context: this is a class component sitting above the
    // providers, and sending a platform admin "back to billing" would bounce them
    // straight back here — they have no till.
    const isAdmin = (() => {
      try {
        return !!JSON.parse(localStorage.getItem("user") || "null")?.isSuperAdmin;
      } catch {
        return false;
      }
    })();
    const [homePath, homeLabel] = isAdmin ? ["/admin", "Back to admin"] : ["/billing", "Back to billing"];

    return (
      <div style={box}>
        <div className="card" style={{ maxWidth: 560, width: "100%", padding: "28px 26px" }}>
          <p style={{ fontSize: 34, lineHeight: 1 }} aria-hidden="true">
            ⚠️
          </p>
          <h1 style={{ fontSize: 22, marginTop: 10, color: "var(--text-primary)" }}>Something broke on this screen</h1>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.6 }}>
            Nothing was lost on the server — every saved bill is safe.
            {!isAdmin && held > 0 && ` The ${held} item${held === 1 ? "" : "s"} in your cart are still here, so you can carry on billing.`}
          </p>

          <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
            <button className="btn-primary" onClick={this.reset}>
              Try again
            </button>
            <button className="btn-ghost" onClick={() => window.location.assign(homePath)}>
              {homeLabel}
            </button>
            <button className="btn-ghost" onClick={() => window.location.reload()}>
              Reload app
            </button>
          </div>

          <button
            onClick={() => this.setState({ showDetail: !showDetail })}
            style={{
              marginTop: 18,
              background: "none",
              border: "none",
              padding: 0,
              fontSize: 12.5,
              color: "var(--text-muted)",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            {showDetail ? "Hide technical details" : "Show technical details"}
          </button>
          {showDetail && (
            <pre
              style={{
                marginTop: 10,
                maxHeight: 220,
                overflow: "auto",
                fontSize: 11,
                lineHeight: 1.5,
                padding: 12,
                borderRadius: 8,
                background: "var(--bg-sunken)",
                color: "var(--text-secondary)",
                whiteSpace: "pre-wrap",
              }}
            >
              {String(error?.stack || error?.message || error)}
              {info?.componentStack || ""}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
