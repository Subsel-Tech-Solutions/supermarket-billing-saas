// src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authAPI } from "../services/api";

const AuthContext = createContext(null);

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => read("user"));
  const [shop, setShop] = useState(() => read("shop"));
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [loading, setLoading] = useState(!!localStorage.getItem("token"));
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);

  const persist = useCallback((t, u, s) => {
    localStorage.setItem("token", t);
    localStorage.setItem("user", JSON.stringify(u));
    if (s) localStorage.setItem("shop", JSON.stringify(s));
    setToken(t);
    setUser(u);
    if (s) setShop(s);
    setSubscriptionExpired(s ? !s.subscriptionActive : false);
  }, []);

  const login = useCallback(
    async (email, password) => {
      const res = await authAPI.login({ email, password });
      const { token: t, user: u, shop: s } = res.data.data;
      persist(t, u, s);
      return u;
    },
    [persist],
  );

  const register = useCallback(
    async (payload) => {
      const res = await authAPI.register(payload);
      const { token: t, user: u, shop: s } = res.data.data;
      persist(t, u, s);
      return u;
    },
    [persist],
  );

  // Used by platform admin "Open shop" (support access). Keeps admin token to come back.
  const loginWithSession = useCallback(
    ({ token: t, user: u, shop: s }) => {
      const current = localStorage.getItem("token");
      if (current && !localStorage.getItem("adminToken")) localStorage.setItem("adminToken", current);
      persist(t, u, s);
      window.location.href = "/dashboard";
    },
    [persist],
  );

  const returnToAdmin = useCallback(() => {
    const adminToken = localStorage.getItem("adminToken");
    localStorage.removeItem("adminToken");
    if (adminToken) {
      localStorage.setItem("token", adminToken);
      localStorage.removeItem("user");
      localStorage.removeItem("shop");
      window.location.href = "/admin";
    }
  }, []);

  const logout = useCallback(() => {
    // "theme" too: it caches the shop's colours, and leaving it behind meant the login
    // page kept showing the last shop's brand instead of the platform's.
    ["token", "user", "shop", "adminToken", "theme"].forEach((k) => localStorage.removeItem(k));
    setToken(null);
    setUser(null);
    setShop(null);
  }, []);

  const refresh = useCallback(async () => {
    const res = await authAPI.getMe();
    const { user: u, shop: s } = res.data.data;
    setUser(u);
    setShop(s);
    localStorage.setItem("user", JSON.stringify(u));
    localStorage.setItem("shop", JSON.stringify(s));
    setSubscriptionExpired(s ? !s.subscriptionActive : false);
    return res.data.data;
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    refresh()
      .catch((err) => {
        if (err?.response?.status === 401 || err?.response?.status === 403) logout();
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onExpired = () => setSubscriptionExpired(true);
    window.addEventListener("subscription-expired", onExpired);
    return () => window.removeEventListener("subscription-expired", onExpired);
  }, []);

  const role = user?.role || "cashier";
  const isSuperAdmin = !!user?.isSuperAdmin;
  const can = useCallback((...roles) => isSuperAdmin || roles.includes(role), [isSuperAdmin, role]);

  // The platform admin runs the SaaS, not a shop: they create and manage businesses and
  // never bill at a counter. While impersonating ("open shop" for support) the token is
  // the owner's, isSuperAdmin is false, and the full shop app comes back as normal.
  const isPlatformOnly = isSuperAdmin;

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        shop,
        token,
        loading,
        login,
        register,
        logout,
        refresh,
        loginWithSession,
        returnToAdmin,
        isImpersonating: !!localStorage.getItem("adminToken"),
        isSuperAdmin,
        isPlatformOnly,
        role,
        can,
        subscriptionExpired,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
};
