// src/services/api.js — Secure API client with HTTP-only cookies, automatic token refresh queue, and CSRF protection
import axios from "axios";

export const BASE_URL = (process.env.REACT_APP_API_URL || "/api").replace(/\/$/, "");

// Helper to read XSRF-TOKEN cookie
const getCsrfCookie = () => {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  withCredentials: true,
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
});

// Explicitly ensure XSRF-TOKEN is attached on mutation requests for defense-in-depth
api.interceptors.request.use((config) => {
  const xsrf = getCsrfCookie();
  if (xsrf && !config.headers["X-XSRF-TOKEN"]) {
    config.headers["X-XSRF-TOKEN"] = xsrf;
  }
  return config;
});

// ── Refresh Token Concurrency Queue ──────────────────────────────────────────
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve();
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (res) => {
    // Any successful response proves the server is reachable again.
    window.dispatchEvent(new CustomEvent("api-reachable"));
    return res;
  },
  async (err) => {
    const status = err.response?.status;
    const originalRequest = err.config || {};
    const url = originalRequest.url || "";

    // Network dropped / server unreachable
    if (!err.response) {
      window.dispatchEvent(new CustomEvent("api-unreachable"));
    }

    // ── 401 Unauthorized Handling ──────────────────────────────────────────────
    if (status === 401) {
      const isAuthRoute = url.includes("/auth/login") || url.includes("/auth/refresh");

      if (!isAuthRoute && !originalRequest._retry) {
        if (isRefreshing) {
          // If another request is already refreshing, buffer this one until done
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then(() => api(originalRequest))
            .catch((queueErr) => Promise.reject(queueErr));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          await api.post("/auth/refresh");
          processQueue(null);
          return api(originalRequest);
        } catch (refreshErr) {
          processQueue(refreshErr);
          // Purge session cache while preserving counter cart & local theme
          ["user", "shop", "isImpersonating", "token", "adminToken"].forEach((k) => localStorage.removeItem(k));
          window.dispatchEvent(new CustomEvent("auth-unauthorized"));
          if (!window.location.pathname.startsWith("/login")) {
            window.location.href = "/login";
          }
          return Promise.reject(refreshErr);
        } finally {
          isRefreshing = false;
        }
      } else if (isAuthRoute) {
        if (url.includes("/auth/refresh")) {
          ["user", "shop", "isImpersonating", "token", "adminToken"].forEach((k) => localStorage.removeItem(k));
          window.dispatchEvent(new CustomEvent("auth-unauthorized"));
          if (!window.location.pathname.startsWith("/login")) {
            window.location.href = "/login";
          }
        }
      }
    }

    if (status === 402) window.dispatchEvent(new CustomEvent("subscription-expired"));
    if (status === 429) window.dispatchEvent(new CustomEvent("rate-limited", { detail: err.response?.data }));

    return Promise.reject(err);
  },
);

/** Key for one checkout attempt, so a retry of the same sale cannot create a second bill. */
export const newClientRef = () => {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

// ── Platform (public) ────────────────────────────────────────────────────────
export const platformAPI = {
  getPublic: () => api.get("/platform/public"),
};

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authAPI = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
  refresh: () => api.post("/auth/refresh"),
  logout: () => api.post("/auth/logout"),
  getCsrf: () => api.get("/auth/csrf"),
  getMe: () => api.get("/auth/me"),
  updateProfile: (data) => api.put("/auth/profile", data),
  changePassword: (data) => api.put("/auth/change-password", data),
};

// ── Shop settings ────────────────────────────────────────────────────────────
export const settingsAPI = {
  get: () => api.get("/settings"),
  update: (data) => api.put("/settings", data),
  resetAppearance: () => api.post("/settings/reset-appearance"),
};

// ── Products ─────────────────────────────────────────────────────────────────
export const productAPI = {
  getAll: (params) => api.get("/products", { params }),
  getSummary: () => api.get("/products/summary"),
  getById: (id) => api.get(`/products/${id}`),
  getByBarcode: (barcode) => api.get(`/products/barcode/${encodeURIComponent(barcode)}`),
  getCategories: () => api.get("/products/categories"),
  create: (data) => api.post("/products", data),
  update: (id, data) => api.put(`/products/${id}`, data),
  delete: (id) => api.delete(`/products/${id}`),
  restore: (id) => api.patch(`/products/${id}/restore`),
  updateStock: (id, data) => api.patch(`/products/${id}/stock`, data),
  getMovements: (id, params) => api.get(`/products/${id}/movements`, { params }),
  scan: (data) => api.post("/products/scan", data),
  bulkImport: (products) => api.post("/products/bulk-import", { products }),
  getSales: (params) => api.get("/reports/sales", { params }),
  getTopProducts: (params) => api.get("/reports/top-products", { params }),
  getDashboard: () => api.get("/reports/dashboard"),
};

// ── Bills ────────────────────────────────────────────────────────────────────
export const billAPI = {
  getAll: (params) => api.get("/bills", { params }),
  getById: (id) => api.get(`/bills/${id}`),
  create: (data) => api.post("/bills", data),
  preview: (data) => api.post("/bills/preview", data),
  cancel: (id, reason) => api.patch(`/bills/${id}/cancel`, { reason }),
  returnItems: (id, data) => api.post(`/bills/${id}/return`, data),
  getReturns: (params) => api.get("/bills/returns", { params }),
  getHeld: () => api.get("/bills/held"),
  hold: (data) => api.post("/bills/held", data),
  deleteHeld: (id) => api.delete(`/bills/held/${id}`),
  getInvoiceUrl: (id) => `${BASE_URL}/bills/${id}/invoice`,
};

const INVOICE_LOADING_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Preparing invoice…</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
       font-family:Outfit,-apple-system,Segoe UI,sans-serif;background:#fffdf8;color:#1b1813}
  @media (prefers-color-scheme:dark){body{background:#1e1b16;color:#f4f0e7}}
  .ring{width:34px;height:34px;border:3px solid rgba(128,128,128,.25);border-top-color:#bf9c5a;border-radius:50%;
        animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  p{margin:0;font-size:14px} small{opacity:.6;font-size:12px;max-width:300px;text-align:center;line-height:1.5}
</style></head><body>
  <div class="ring"></div>
  <p>Preparing your invoice…</p>
  <small>The first one after a quiet spell can take a little longer while the server wakes up.</small>
</body></html>`;

export const openInvoice = async (billId, format) => {
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(INVOICE_LOADING_HTML);
    win.document.close();
  }
  try {
    const res = await api.get(`/bills/${billId}/invoice`, { params: format ? { format } : {}, responseType: "blob" });
    const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
    if (win) win.location.href = url;
    else window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    if (win) win.close();
    throw err;
  }
};

export const invoiceAPI = {
  download: (id) => api.get(`/bills/${id}/invoice`, { responseType: "blob" }),
};

// ── Customers ────────────────────────────────────────────────────────────────
export const customerAPI = {
  getAll: (params) => api.get("/customers", { params }),
  lookup: (phone) => api.get("/customers/lookup", { params: { phone } }),
  getById: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post("/customers", data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
  receivePayment: (id, data) => api.post(`/customers/${id}/payments`, data),
  adjustPoints: (id, data) => api.post(`/customers/${id}/points`, data),
};

// ── Suppliers / purchases / expenses / staff ────────────────────────────────
export const supplierAPI = {
  getAll: (params) => api.get("/suppliers", { params }),
  getById: (id) => api.get(`/suppliers/${id}`),
  create: (data) => api.post("/suppliers", data),
  update: (id, data) => api.put(`/suppliers/${id}`, data),
  delete: (id) => api.delete(`/suppliers/${id}`),
  pay: (id, data) => api.post(`/suppliers/${id}/payments`, data),
};

export const purchaseAPI = {
  getAll: (params) => api.get("/purchases", { params }),
  getById: (id) => api.get(`/purchases/${id}`),
  create: (data) => api.post("/purchases", data),
  cancel: (id) => api.patch(`/purchases/${id}/cancel`),
};

export const expenseAPI = {
  getAll: (params) => api.get("/expenses", { params }),
  create: (data) => api.post("/expenses", data),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
};

export const staffAPI = {
  getAll: () => api.get("/staff"),
  create: (data) => api.post("/staff", data),
  update: (id, data) => api.put(`/staff/${id}`, data),
  delete: (id) => api.delete(`/staff/${id}`),
};

// ── Reports ──────────────────────────────────────────────────────────────────
export const reportAPI = {
  getDashboard: () => api.get("/reports/dashboard"),
  getSales: (params) => api.get("/reports/sales", { params }),
  getTopProducts: (params) => api.get("/reports/top-products", { params }),
  getCategories: (params) => api.get("/reports/categories", { params }),
  getGst: (params) => api.get("/reports/gst", { params }),
  getProfit: (params) => api.get("/reports/profit", { params }),
  getStaff: (params) => api.get("/reports/staff", { params }),
  getDayEnd: (params) => api.get("/reports/day-end", { params }),
  getStockReport: (params) => api.get("/reports/stock", { params }),
  getExpiry: (params) => api.get("/reports/expiry", { params }),
};

// ── Platform admin ───────────────────────────────────────────────────────────
export const adminAPI = {
  getStats: (params) => api.get("/admin/stats", { params }),
  getUsers: (params) => api.get("/admin/users", { params }),
  getShops: (params) => api.get("/admin/shops", { params }),
  getShop: (id) => api.get(`/admin/shops/${id}`),
  createShop: (data) => api.post("/admin/shops", data),
  updateShop: (id, data) => api.put(`/admin/shops/${id}`, data),
  deleteShop: (id, confirm) => api.delete(`/admin/shops/${id}`, { data: { confirm } }),
  toggleShop: (id) => api.patch(`/admin/shops/${id}/toggle`),
  resetPassword: (id, data) => api.post(`/admin/shops/${id}/reset-password`, data),
  loginAs: (id) => api.post(`/admin/shops/${id}/login-as`),
  returnToAdmin: () => api.post("/admin/return-to-admin"),
  repairDb: (id) => api.post(`/admin/shops/${id}/repair-db`),
  getSettings: () => api.get("/admin/settings"),
  updateSettings: (data) => api.put("/admin/settings", data),
};

export default api;
