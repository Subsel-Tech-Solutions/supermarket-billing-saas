import {
  cartOwnerKey,
  clearPersistedCart,
  readPersistedCart,
  writePersistedCart,
} from "./persistentCart";

beforeEach(() => {
  localStorage.clear();
});

test("cart owner keys isolate users within and across shops", () => {
  expect(cartOwnerKey({ id: 2 }, { id: 1 })).toBe("1:2");
  expect(cartOwnerKey({ id: 3 }, { id: 1 })).toBe("1:3");
  expect(cartOwnerKey({ id: 2 }, { id: 4 })).toBe("4:2");

  expect(cartOwnerKey({ id: 2 }, { id: 1 })).not.toBe(cartOwnerKey({ id: 3 }, { id: 1 }));
  expect(cartOwnerKey({ id: 2 }, { id: 1 })).not.toBe(cartOwnerKey({ id: 2 }, { id: 4 }));
});

test("carts are not shared between owners", () => {
  const ownerA = cartOwnerKey({ id: 2 }, { id: 1 });
  const ownerB = cartOwnerKey({ id: 3 }, { id: 1 });

  writePersistedCart(ownerA, { cart: [{ productId: 10 }], meta: {} });
  expect(readPersistedCart(ownerA)?.cart).toHaveLength(1);
  expect(readPersistedCart(ownerB)).toBeNull();

  clearPersistedCart(ownerA);
  expect(readPersistedCart(ownerA)).toBeNull();
  expect(localStorage.getItem("pos.cart")).toBeNull();
});
