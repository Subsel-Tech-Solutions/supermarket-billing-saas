const { test, expect } = require("@playwright/test");
const { createMockState, installMockApi, signIn } = require("./helpers/mockBackend");

const VIEWPORTS = [
  { width: 320, height: 760 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 900, height: 768 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

const OWNER_PAGES = [
  ["/dashboard", "Dashboard"],
  ["/billing", "Billing"],
  ["/transactions", "Sales History"],
  ["/customers", "Customers"],
  ["/customers/1", "Customer details"],
  ["/day-end", "Day Closing"],
  ["/stock", "Stock"],
  ["/barcode", "Barcodes"],
  ["/purchases", "Purchases"],
  ["/suppliers", "Suppliers"],
  ["/reports", "Reports"],
  ["/expenses", "Expenses"],
  ["/staff", "Staff"],
  ["/settings", "Settings"],
];

const ADMIN_PAGES = [
  ["/admin", "Dashboard"],
  ["/admin/businesses", "Businesses"],
  ["/admin/subscriptions", "Subscriptions"],
  ["/admin/users", "Users"],
  ["/admin/branding", "Themes & Branding"],
  ["/admin/reports", "Reports"],
  ["/admin/settings", "Settings"],
  ["/admin/account", "My Account"],
];

async function checkViewport(page, path, width, height) {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    mobileNav: document.querySelector(".mobile-nav-bar")
      ? getComputedStyle(document.querySelector(".mobile-nav-bar")).display
      : null,
    layoutIssues: (() => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        let current = element;
        while (current) {
          const style = getComputedStyle(current);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
          current = current.parentElement;
        }
        return true;
      };
      const intersectsViewport = (rect) =>
        rect.right > 0 && rect.left < window.innerWidth && rect.bottom > 0 && rect.top < window.innerHeight;
      const describe = (element) =>
        `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.className && typeof element.className === "string" ? `.${element.className.trim().replace(/\s+/g, ".")}` : ""}`;
      const controlDescription = (element) => {
        const label = element.getAttribute("aria-label") || element.innerText || element.getAttribute("href") || "";
        const rect = element.getBoundingClientRect();
        return `${describe(element)} "${label.trim().replace(/\s+/g, " ").slice(0, 40)}" at ${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}`;
      };
      const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible);
      const scope = dialogs.length ? dialogs[dialogs.length - 1] : document.body;
      const cards = [...scope.querySelectorAll(".card")];
      if (scope.matches(".card")) cards.unshift(scope);
      const clippedContent = cards.flatMap((card) =>
        [card, ...card.querySelectorAll("*")]
          .filter(visible)
          .filter((element) => {
            const style = getComputedStyle(element);
            return (
              ["hidden", "clip"].includes(style.overflowX) &&
              style.textOverflow !== "ellipsis" &&
              !element.closest(".sr-only") &&
              !(element.tagName === "THEAD" && element.closest(".table-stack")) &&
              !element.matches("input, select, textarea") &&
              element.scrollWidth > element.clientWidth + 1
            );
          })
          .map(describe),
      );
      const controls = [...scope.querySelectorAll('button, input, select, textarea, a[href], [role="button"], [role="link"]')]
        .filter(visible)
        .filter((element) => !element.disabled)
        .filter((element) => intersectsViewport(element.getBoundingClientRect()));
      const inaccessibleControls = controls
        .map((element) => {
          const rect = element.getBoundingClientRect();
          let canScrollIntoView = false;
          let ancestor = element.parentElement;
          while (ancestor && ancestor !== scope.parentElement) {
            const style = getComputedStyle(ancestor);
            const bounds = ancestor.getBoundingClientRect();
            const left = bounds.left + ancestor.clientLeft;
            const right = left + ancestor.clientWidth;
            const top = bounds.top + ancestor.clientTop;
            const bottom = top + ancestor.clientHeight;
            const outsideX = rect.left < left - 1 || rect.right > right + 1;
            const outsideY = rect.top < top - 1 || rect.bottom > bottom + 1;
            if (["hidden", "clip"].includes(style.overflowX) && outsideX) {
              return `${controlDescription(element)} is clipped by ${describe(ancestor)}`;
            }
            if (["hidden", "clip"].includes(style.overflowY) && outsideY) {
              return `${controlDescription(element)} is clipped by ${describe(ancestor)}`;
            }
            if (
              (["auto", "scroll"].includes(style.overflowX) && outsideX) ||
              (["auto", "scroll"].includes(style.overflowY) && outsideY)
            ) {
              canScrollIntoView = true;
              break;
            }
            ancestor = ancestor.parentElement;
          }
          if ((rect.left < -1 || rect.right > window.innerWidth + 1) && !canScrollIntoView) {
            return `${controlDescription(element)} is outside the viewport`;
          }
          if (canScrollIntoView) return null;
          const left = Math.max(0, rect.left);
          const right = Math.min(window.innerWidth, rect.right);
          const top = Math.max(0, rect.top);
          const bottom = Math.min(window.innerHeight, rect.bottom);
          const points = [0.25, 0.5, 0.75].flatMap((x) =>
            [0.25, 0.5, 0.75].map((y) => [left + (right - left) * x, top + (bottom - top) * y]),
          );
          const reachable = points.some(([x, y]) => {
            const hit = document.elementFromPoint(x, y);
            return hit === element || element.contains(hit);
          });
          const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
          return reachable ? null : `${controlDescription(element)} is covered by ${hit ? describe(hit) : "nothing"}`;
        })
        .filter(Boolean);
      const buttons = controls.filter((element) => element.tagName === "BUTTON");
      const overlappingButtons = [];
      for (let i = 0; i < buttons.length; i++) {
        const first = buttons[i];
        const a = first.getBoundingClientRect();
        for (let j = i + 1; j < buttons.length; j++) {
          const second = buttons[j];
          if (first.contains(second) || second.contains(first)) continue;
          const b = second.getBoundingClientRect();
          const overlapWidth = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const overlapHeight = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (overlapWidth > 1 && overlapHeight > 1) overlappingButtons.push(`${describe(first)} overlaps ${describe(second)}`);
        }
      }
      return {
        clippedContent: [...new Set(clippedContent)].slice(0, 10),
        overlappingButtons: overlappingButtons.slice(0, 10),
        inaccessibleControls: [...new Set(inaccessibleControls)].slice(0, 10),
      };
    })(),
  }));
  expect(dimensions.document, `${path} document overflow at ${width}px: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(width);
  expect(dimensions.body, `${path} body overflow at ${width}px: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(width);
  expect(dimensions.layoutIssues.clippedContent, `${path} has clipped card content at ${width}px: ${JSON.stringify(dimensions.layoutIssues)}`).toEqual([]);
  expect(dimensions.layoutIssues.overlappingButtons, `${path} has overlapping buttons at ${width}px: ${JSON.stringify(dimensions.layoutIssues)}`).toEqual([]);
  expect(dimensions.layoutIssues.inaccessibleControls, `${path} has inaccessible visible controls at ${width}px: ${JSON.stringify(dimensions.layoutIssues)}`).toEqual([]);
  if (dimensions.mobileNav !== null) {
    expect(dimensions.mobileNav).toBe(width <= 860 ? "flex" : "none");
  }
}

async function checkPages(page, routes) {
  for (const [path, label] of routes) {
    await page.goto(path);
    await expect(page.locator('.breadcrumbs [aria-current="page"]')).toHaveText(label, { timeout: 15_000 });
    for (const { width, height } of VIEWPORTS) {
      await checkViewport(page, path, width, height);
    }
  }
}

test("owner and authentication pages fit mobile, tablet, and desktop viewports", async ({ page }) => {
  test.setTimeout(180_000);
  await installMockApi(page, createMockState());
  await signIn(page, "owner@freshmart.com", "owner-password");
  await expect(page).toHaveURL(/\/dashboard$/);

  await checkPages(page, OWNER_PAGES);
  for (const path of ["/login", "/forgot-password", "/reset-password", "/signup"]) {
    await page.goto(path);
    for (const { width, height } of VIEWPORTS) {
      await checkViewport(page, path, width, height);
    }
  }
});

test("platform admin pages fit mobile, tablet, and desktop viewports", async ({ page }) => {
  test.setTimeout(120_000);
  await installMockApi(page, createMockState());
  await signIn(page, "admin@supermarket.com", "admin-password");
  await expect(page).toHaveURL(/\/admin$/);
  await checkPages(page, ADMIN_PAGES);
});

test("mobile checkout controls fit a narrow viewport", async ({ page }) => {
  await installMockApi(page, createMockState());
  await signIn(page, "owner@freshmart.com", "owner-password");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/billing");

  const search = page.getByPlaceholder("Search product name / scan or type barcode, then Enter…");
  await search.fill("8901001001001");
  await search.press("Enter");
  await expect(page.locator(".billing-cart").getByText("Basmati Rice")).toBeVisible();
  await page.getByRole("button", { name: "Pay" }).click();

  const checkout = page.getByRole("dialog", { name: "Complete sale" });
  await expect(checkout).toBeVisible();
  await expect(checkout.locator(".checkout-actions")).toHaveCSS("flex-direction", "column");
  const paymentColumns = await checkout.locator(".checkout-payment-grid").evaluate((grid) =>
    getComputedStyle(grid).gridTemplateColumns.split(" ").length,
  );
  expect(paymentColumns).toBeGreaterThan(1);
  await checkViewport(page, "/billing checkout", 320, 760);
});

test("tablet cart sheet and checkout controls remain reachable with the keyboard open", async ({ page }) => {
  await installMockApi(page, createMockState());
  await signIn(page, "owner@freshmart.com", "owner-password");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/billing");

  const search = page.getByPlaceholder("Search product name / scan or type barcode, then Enter…");
  await search.fill("8901001001001");
  await search.press("Enter");

  const cart = page.locator(".billing-cart");
  await expect(cart.getByText("Basmati Rice")).toBeVisible();
  await page.getByRole("button", { name: "View", exact: true }).click();
  await expect(cart).toHaveClass(/open/);

  await cart.getByLabel("Quantity").focus();
  // Shrinking the visual viewport simulates the space taken by a tablet software keyboard.
  await page.setViewportSize({ width: 1024, height: 420 });
  const checkoutFromCart = cart.getByRole("button", { name: /Checkout/ });
  await expect(checkoutFromCart).toBeVisible();
  await checkoutFromCart.scrollIntoViewIfNeeded();
  await expect(checkoutFromCart).toBeInViewport();
  await checkoutFromCart.click();

  const checkout = page.getByRole("dialog", { name: "Complete sale" });
  await expect(checkout).toBeVisible();
  const cashReceived = checkout.locator('input[inputmode="decimal"]');
  await expect(cashReceived).toBeFocused();
  await page.setViewportSize({ width: 1024, height: 420 });
  await expect
    .poll(() => checkout.evaluate((dialog) => dialog.scrollHeight > dialog.clientHeight))
    .toBe(true);

  const confirmSale = checkout.getByRole("button", { name: /Confirm sale/ });
  await expect(confirmSale).toBeEnabled();
  await confirmSale.scrollIntoViewIfNeeded();
  await expect(confirmSale).toBeInViewport();
  await checkout.getByRole("button", { name: "Back" }).click();
  await expect(checkout).toBeHidden();
});
