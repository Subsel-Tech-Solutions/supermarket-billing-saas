// src/hooks/usePersistentCart.js
// A half-built bill must survive a refresh, an accidental tab close, a crash, or an
// access-token refresh. A fully ended session clears the cart.
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { cartOwnerKey, clearPersistedCart, persistedCartKey, readPersistedCart, writePersistedCart } from "../utils/persistentCart";

/**
 * Cart state that mirrors itself into localStorage.
 *
 * @returns {{
 *   cart: any[], setCart: Function,
 *   meta: object, setMeta: Function,
 *   restored: boolean, clearCart: Function, dismissRestored: Function
 * }}
 */
export default function usePersistentCart() {
  const { user, shop } = useAuth();
  const owner = cartOwnerKey(user, shop);
  const [initial] = useState(() => readPersistedCart(owner));
  const [cart, setCart] = useState(() => initial?.cart || []);
  const [meta, setMeta] = useState(() => initial?.meta || {});
  // True only on the first mount after an interrupted sale, so the UI can say so once.
  const [restored, setRestored] = useState(() => (initial?.cart?.length || 0) > 0);
  const [stateOwner, setStateOwner] = useState(owner);
  const ownerRef = useRef(owner);

  useEffect(() => {
    if (ownerRef.current === owner) return;
    clearPersistedCart(ownerRef.current);
    const next = readPersistedCart(owner);
    ownerRef.current = owner;
    setStateOwner(owner);
    setCart(next?.cart || []);
    setMeta(next?.meta || {});
    setRestored((next?.cart?.length || 0) > 0);
  }, [owner]);

  useEffect(() => {
    if (stateOwner !== owner) return;
    if (cart.length === 0 && !Object.keys(meta).length) {
      if (owner) clearPersistedCart(owner);
    }
    else writePersistedCart(owner, { cart, meta });
  }, [cart, meta, owner, stateOwner]);

  // Another tab on the same till finishing a sale should empty this one too, so two
  // windows cannot sell the same trolley twice.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== persistedCartKey(owner) && e.key !== "pos.cart") return;
      if (e.newValue === null) {
        setCart([]);
        setMeta({});
        return;
      }
      try {
        const next = JSON.parse(e.newValue);
        if (next?.owner === owner && Array.isArray(next?.cart)) {
          setCart(next.cart);
          setMeta(next.meta || {});
        } else {
          setCart([]);
          setMeta({});
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [owner]);

  // Warn before closing the tab with items in the cart.
  useEffect(() => {
    if (!cart.length) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [cart.length]);

  const clearCart = useCallback(() => {
    setCart([]);
    setMeta({});
    setRestored(false);
    if (owner) clearPersistedCart(owner);
  }, [owner]);

  const dismissRestored = useCallback(() => setRestored(false), []);

  return { cart, setCart, meta, setMeta, restored, clearCart, dismissRestored };
}
