const LEGACY_KEY = "pos.cart";
const KEY_PREFIX = `${LEGACY_KEY}:`;
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export const cartOwnerKey = (user, shop) => (user?.id && shop?.id ? `${shop.id}:${user.id}` : null);
export const persistedCartKey = (owner) => (owner ? `${KEY_PREFIX}${owner}` : LEGACY_KEY);

export const clearPersistedCart = (owner) => {
  try {
    if (owner) {
      localStorage.removeItem(persistedCartKey(owner));
      localStorage.removeItem(LEGACY_KEY);
      return;
    }
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key === LEGACY_KEY || key?.startsWith(KEY_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
};

export const readPersistedCart = (owner) => {
  if (!owner) return null;
  try {
    localStorage.removeItem(LEGACY_KEY);
    const raw = JSON.parse(localStorage.getItem(persistedCartKey(owner)) || "null");
    if (!raw || raw.owner !== owner || !Array.isArray(raw.cart)) {
      if (raw) clearPersistedCart(owner);
      return null;
    }
    if (raw.savedAt && Date.now() - raw.savedAt > MAX_AGE_MS) {
      clearPersistedCart(owner);
      return null;
    }
    return raw;
  } catch {
    clearPersistedCart(owner);
    return null;
  }
};

export const writePersistedCart = (owner, value) => {
  if (!owner) return;
  try {
    localStorage.setItem(persistedCartKey(owner), JSON.stringify({ ...value, owner, savedAt: Date.now() }));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* quota or blocked storage — billing must keep working regardless */
  }
};
