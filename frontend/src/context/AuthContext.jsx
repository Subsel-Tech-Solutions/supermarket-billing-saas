// src/context/AuthContext.jsx — Secure authentication state using HTTP-only cookies
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authAPI, adminAPI } from "../services/api";

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
  const [loading, setLoading] = useState(true);
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(() => !!read("isImpersonating"));

  const persistSession = useCallback((u, s, impersonating = false) => {
    setUser(u);
    if (s) setShop(s);
    setIsImpersonating(impersonating);
    if (u) localStorage.setItem("user", JSON.stringify(u));
    else localStorage.removeItem("user");
    if (s) localStorage.setItem("shop", JSON.stringify(s));
    else localStorage.removeItem("shop");
    if (impersonating) localStorage.setItem("isImpersonating", "true");
    else localStorage.removeItem("isImpersonating");
    setSubscriptionExpired(s ? !s.subscriptionActive : false);
  }, []);

  const login = useCallback(
    async (email, password) => {
      const res = await authAPI.login({ email, password });
      const { user: u, shop: s } = res.data.data;
      persistSession(u, s, false);
      return u;
    },
    [persistSession],
  );

  const register = useCallback(
    async (payload) => {
      const res = await authAPI.register(payload);
      const { user: u, shop: s } = res.data.data;
      persistSession(u, s, false);
      return u;
    },
    [persistSession],
  );

  // Used by platform admin "Open shop" (support access)
  const loginWithSession = useCallback(
    ({ user: u, shop: s }) => {
      persistSession(u, s, true);
      window.location.href = "/dashboard";
    },
    [persistSession],
  );

  const returnToAdmin = useCallback(async () => {
    try {
      const res = await adminAPI.returnToAdmin();
      const { user: u, shop: s } = res.data.data;
      persistSession(u, s, false);
      window.location.href = "/admin";
    } catch {
      window.location.href = "/login";
    }
  }, [persistSession]);

  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } catch {
      /* ignore */
    }
    ["user", "shop", "isImpersonating", "token", "adminToken", "theme"].forEach((k) => localStorage.removeItem(k));
    setUser(null);
    setShop(null);
    setIsImpersonating(false);
    window.location.href = "/login";
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

  // Initialize session on mount via getMe() or refresh()
  useEffect(() => {
    let mounted = true;
    authAPI
      .getMe()
      .then((res) => {
        if (!mounted) return;
        const { user: u, shop: s } = res.data.data;
        setUser(u);
        setShop(s);
        localStorage.setItem("user", JSON.stringify(u));
        localStorage.setItem("shop", JSON.stringify(s));
        setSubscriptionExpired(s ? !s.subscriptionActive : false);
      })
      .catch((err) => {
        if (err?.response?.status === 401) {
          return authAPI
            .refresh()
            .then((r) => {
              if (!mounted) return;
              const { user: u, shop: s } = r.data.data;
              setUser(u);
              setShop(s);
              localStorage.setItem("user", JSON.stringify(u));
              localStorage.setItem("shop", JSON.stringify(s));
              setSubscriptionExpired(s ? !s.subscriptionActive : false);
            })
            .catch(() => {
              if (!mounted) return;
              setUser(null);
              setShop(null);
              setIsImpersonating(false);
              localStorage.removeItem("user");
              localStorage.removeItem("shop");
              localStorage.removeItem("isImpersonating");
            });
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      setShop(null);
      setIsImpersonating(false);
    };
    const onExpired = () => setSubscriptionExpired(true);
    window.addEventListener("auth-unauthorized", onUnauthorized);
    window.addEventListener("subscription-expired", onExpired);
    return () => {
      window.removeEventListener("auth-unauthorized", onUnauthorized);
      window.removeEventListener("subscription-expired", onExpired);
    };
  }, []);

  const role = user?.role || "cashier";
  const isSuperAdmin = !!user?.isSuperAdmin;
  const can = useCallback((...roles) => isSuperAdmin || roles.includes(role), [isSuperAdmin, role]);

  const isPlatformOnly = isSuperAdmin && !isImpersonating;

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        shop,
        loading,
        login,
        register,
        logout,
        refresh,
        loginWithSession,
        returnToAdmin,
        isImpersonating,
        isSuperAdmin,
        isPlatformOnly,
        role,
        can,
        subscriptionExpired,
        isAuthenticated: !!user,
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
