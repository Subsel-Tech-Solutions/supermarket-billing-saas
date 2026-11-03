// src/App.jsx
import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SettingsProvider } from "./context/SettingsContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import Layout from "./components/shared/Layout";
import ErrorBoundary from "./components/shared/ErrorBoundary";
import { PageLoader } from "./components/shared/UI";

const Login = lazy(() => import("./components/auth/Login"));
const ForgotPassword = lazy(() => import("./components/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./components/auth/ResetPassword"));
const Signup = lazy(() => import("./components/auth/Signup"));
const Dashboard = lazy(() => import("./components/dashboard/Dashboard"));
const Reports = lazy(() => import("./components/dashboard/Reports"));
const DayEnd = lazy(() => import("./components/dashboard/DayEnd"));
const Billing = lazy(() => import("./components/billing/Billing"));
const Transactions = lazy(() => import("./components/billing/Transactions"));
const Stock = lazy(() => import("./components/stock/Stock"));
const BarcodeGenerator = lazy(() => import("./components/stock/BarcodeGenerator"));
const Purchases = lazy(() => import("./components/inventory/Purchases"));
const Suppliers = lazy(() => import("./components/inventory/Suppliers"));
const Customers = lazy(() => import("./components/customers/Customers"));
const CustomerDetails = lazy(() => import("./components/customers/CustomerDetails"));
const Expenses = lazy(() => import("./components/business/Expenses"));
const Staff = lazy(() => import("./components/business/Staff"));
const Settings = lazy(() => import("./components/settings/Settings"));
const Admin = lazy(() => import("./components/admin/Admin"));

const Fallback = () => (
  <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
    <PageLoader />
  </div>
);

function Home() {
  const { can, isPlatformOnly } = useAuth();
  if (isPlatformOnly) return <Navigate to="/admin" replace />;
  return <Navigate to={can("owner", "manager") ? "/dashboard" : "/billing"} replace />;
}

/**
 * Wraps the shop (till) side of the app. The platform admin runs the SaaS and has no
 * counter of their own, so every shop route sends them back to the admin panel. They
 * reach a shop's data only through "open shop", which swaps in the owner's token and
 * clears isPlatformOnly.
 */
function ShopOnly({ children }) {
  const { isPlatformOnly } = useAuth();
  return isPlatformOnly ? <Navigate to="/admin" replace /> : children;
}

const OWNER_MANAGER = ["owner", "manager"];

export default function App() {
  return (
    // Outermost boundary: catches a failure in the providers themselves, which would
    // otherwise leave a blank page with no way to recover.
    <ErrorBoundary>
      <AuthProvider>
        <SettingsProvider>
          <BrowserRouter>
          <Toaster
            position="top-right"
            // Modals sit at z-index 9999 and are portalled in after this, so at the
            // toaster's default 9999 a toast raised from inside a modal was painted
            // behind its backdrop. Keep toasts above any dialog.
            containerStyle={{ zIndex: 20000 }}
            toastOptions={{
              duration: 3000,
              style: {
                background: "var(--bg-card)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 13.5,
                fontFamily: "Outfit, sans-serif",
                boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
                padding: "10px 16px",
              },
              success: { iconTheme: { primary: "#5f8f6f", secondary: "#fff" } },
              error: { iconTheme: { primary: "#c0564a", secondary: "#fff" } },
            }}
          />
          <Suspense fallback={<Fallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/signup" element={<Signup />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Home />} />

                {/* ── Shop (till) ── hidden from the platform admin ── */}
                <Route path="dashboard" element={<ShopOnly><Dashboard /></ShopOnly>} />
                <Route path="billing" element={<ShopOnly><Billing /></ShopOnly>} />
                <Route path="transactions" element={<ShopOnly><Transactions /></ShopOnly>} />
                <Route path="customers" element={<ShopOnly><Customers /></ShopOnly>} />
                <Route path="customers/:id" element={<ShopOnly><CustomerDetails /></ShopOnly>} />
                <Route path="day-end" element={<ShopOnly><DayEnd /></ShopOnly>} />
                <Route path="stock" element={<ShopOnly><ProtectedRoute roles={OWNER_MANAGER}><Stock /></ProtectedRoute></ShopOnly>} />
                <Route path="barcode" element={<ShopOnly><ProtectedRoute roles={OWNER_MANAGER}><BarcodeGenerator /></ProtectedRoute></ShopOnly>} />
                <Route path="purchases" element={<ShopOnly><ProtectedRoute roles={OWNER_MANAGER}><Purchases /></ProtectedRoute></ShopOnly>} />
                <Route path="suppliers" element={<ShopOnly><ProtectedRoute roles={OWNER_MANAGER}><Suppliers /></ProtectedRoute></ShopOnly>} />
                <Route path="reports" element={<ShopOnly><ProtectedRoute roles={OWNER_MANAGER}><Reports /></ProtectedRoute></ShopOnly>} />
                <Route path="expenses" element={<ShopOnly><ProtectedRoute roles={OWNER_MANAGER}><Expenses /></ProtectedRoute></ShopOnly>} />
                <Route path="staff" element={<ShopOnly><ProtectedRoute roles={["owner"]}><Staff /></ProtectedRoute></ShopOnly>} />
                {/* Open to every shop role: the page itself shows only "My Account" to
                    staff, which is where they change their own password. */}
                <Route path="settings" element={<ShopOnly><Settings /></ShopOnly>} />

                {/* ── Platform admin ── the trailing segment picks the section, so the
                    sidebar links are real URLs the admin can bookmark and refresh ── */}
                <Route path="admin/*" element={<ProtectedRoute superAdmin><Admin /></ProtectedRoute>} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          </BrowserRouter>
        </SettingsProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
