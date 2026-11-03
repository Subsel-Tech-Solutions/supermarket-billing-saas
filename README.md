# SuperMart POS — Multi-business Supermarket Billing SaaS

Sell one app to many supermarkets. **Every business gets its own private MySQL database** —
products, bills, customers and settings of one shop never share tables with another.

```
                 ┌──────────────────────────┐
  login ───────► │  supermart_master (DB)   │  shops, user logins, plans, platform settings
                 └────────────┬─────────────┘
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   sm_shop_1 (DB)       sm_shop_2 (DB)      sm_shop_3 (DB)   ← created automatically on signup
   products, bills,     products, bills,    products, bills,
   customers, settings  customers, settings customers, settings
```

## Features

**Billing (POS)** — barcode scan (USB scanner / camera) or search · keyboard shortcuts (F2 search, F4 hold, F9 checkout) ·
loose items by kg/litre · item & bill discounts · GST per product (inclusive or exclusive, CGST/SGST **or IGST** for
inter-state supply, customer GSTIN on the invoice) · round-off ·
cash / UPI / card / split payment with change calculation · credit (udhaar) sales with credit limit ·
loyalty points earn & redeem · hold / resume bills · thermal 58mm / 80mm / A4 receipt printing + PDF invoice ·
reprint the last bill when the printer jams.

**Built for a real counter** — the cart survives a refresh, a crash or an expired session (nothing is re-scanned);
every checkout carries an idempotency key so a double click or a retry on a bad connection cannot create two bills
or sell the stock twice; a short payment is rejected rather than quietly becoming udhaar; an offline banner appears
the moment the server stops answering; one broken screen never blanks the whole app. Installable as a PWA on the
counter tablet.

**Sales** — history with filters, returns (partial, restock or not, refund / adjust due / store credit), cancellation with reason.

**Inventory** — products with MRP, selling & cost price, GST, HSN, unit, brand, reorder level, expiry, batch, rack ·
low stock & expiry alerts · stock adjustments with reason · full stock movement history · bulk import (CSV/Excel) ·
barcode label printing · purchases (GRN) from suppliers that update stock & cost price · supplier payables & payments.

**Customers** — auto-saved from bills · dues collection (oldest bill first) · WhatsApp due reminder · loyalty adjustment.

**Business** — expenses · staff logins with roles (Owner / Manager / Cashier) · day closing with cash count ·
reports: sales, busy hours, payment methods, top products, categories, GST (rate-wise split into CGST/SGST and IGST,
plus HSN summary and input vs output tax), profit & loss, staff performance, stock movement, expiry — all exportable to CSV.

**Settings (per business, owner only)** — business name, logo, address, GSTIN, FSSAI · **theme light / dark / system** ·
**brand colour for the whole site** · sidebar style · text size · compact mode · tax rules · bill prefixes ·
payment methods · receipt layout & text · categories / units / expense categories · loyalty rules · cashier permissions.

**Platform Admin (super admin)** — overview of all businesses · create business (with its own DB) · change plan / extend
validity / deactivate · reset owner password · open any shop for support · verify or delete a shop database ·
**Settings tab**: platform name, tagline, support contact, default theme & colour for new shops, signup on/off,
trial days, plan limits (users / products) and prices.

## Quick start (local)

Requirements: Node 18+, MySQL 8 (or MariaDB 10.5+). The DB user needs permission to **CREATE DATABASE**.

```bash
# 1. Backend
cd backend
cp .env.example .env        # set DB_PASSWORD and JWT_SECRET
# JWT_SECRET must be at least 32 characters — the server refuses to start otherwise:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
npm install
npm start                   # creates supermart_master + sm_shop_1 automatically

# 2. Frontend (new terminal)
cd frontend
npm install
npm start                   # http://localhost:3000  (proxies /api to :5000)
```

Login: `admin@supermarket.com` / password set via `ADMIN_PASSWORD` in `.env`
(defaults to `admin123` for **local development only** — the server **refuses to start**
in production unless you set a strong, unique `ADMIN_PASSWORD` of at least 8 characters).
New businesses can sign up at `/signup` (turn off in Admin → Settings).

## Moving data from the old version

The old app stored every shop in one database (`supermarket_db`). Keep it as it is and run:

```bash
cd backend
# .env:  DB_NAME=supermart_master   LEGACY_DB_NAME=supermarket_db
npm run migrate:legacy
```

Each old shop becomes a business with its own database; users keep their passwords;
products, bills and bill items keep their IDs; customers are created from bill phone numbers.
Re-running is safe (shops that already have products are skipped; `--force` to override).

## Deployment

* **Single server (Railway / Render / VPS):** `npm run build` at the repo root builds the React app,
  `npm start` runs the API and serves the build when `NODE_ENV=production`.
* **Docker:** `docker compose up --build` → app on http://localhost:3000.
* Frontend on a different domain: build with `REACT_APP_API_URL=https://api.yourdomain.com/api`
  and set `CORS_ORIGIN` on the backend.

After upgrading the code later (new columns), start once with `DB_SYNC_ALTER=true`, then set it back to `false`.

> **Upgrading an existing install to this version:** you must do that `DB_SYNC_ALTER=true` start once.
> The `bills` table gains `client_ref` (the duplicate-sale guard) and `igst` / `inter_state` /
> `place_of_supply` / `customer_gst_number` (inter-state GST invoices). Existing bills are untouched.

### Behind a reverse proxy

Set `TRUST_PROXY=true` (the default) and make sure the proxy forwards `X-Forwarded-For`. Without it the
server sees every request as coming from the proxy, so the login rate limiter counts the whole shop as one
client — the bundled `frontend/nginx.conf` already sets the header correctly.

### Security

* `JWT_SECRET` is checked at startup: at least 32 characters, and not the example value in production.
* Login, sign-up and password-change are rate limited per IP **and** per email (`LOGIN_RATE_LIMIT`,
  `SIGNUP_RATE_LIMIT`, `API_RATE_LIMIT`). The counters are per process, so set them per instance.
* The platform-admin account cannot be edited by a shop owner, even when it lives in their shop.
* `POST /api/admin/shops/:id/login-as` (support access) writes an `[AUDIT]` line to the server log.

## Roles

| Area | Owner | Manager | Cashier |
|---|:-:|:-:|:-:|
| Billing, sales history, customers, day closing | ✓ | ✓ | ✓ |
| Stock, purchases, suppliers, barcodes, expenses, reports | ✓ | ✓ | |
| Profit & loss report, staff, shop settings | ✓ | | |
| Discounts / cancel bill for cashiers | configurable in Settings → Billing & Tax |||

## Tests

```bash
cd backend && npm test      # 26 cases: GST (incl./excl., CGST+SGST vs IGST), item & bill discounts,
                            # discount allocation across lines, round-off, split payments, change,
                            # short-payment rejection, rounding drift across many lines
```

## Project structure

```
backend/
  config/database.js        master connection + CREATE DATABASE helpers
  tenant/tenantManager.js   one cached connection per business, auto-create DB/tables, idle cleanup
  models/master/            Shop, User, PlatformSetting
  models/tenant/            Product, Supplier, StockMovement, Customer, Bill, BillItem, HeldBill,
                            SaleReturn(+Item), CustomerPayment, Purchase(+Item), SupplierPayment, Setting, Expense
  middleware/security.js    response headers + per-IP rate limiting (no extra dependencies)
  controllers/ routes/      REST API (/api/…)
  utils/billMath.js         bill calculation (shared with the frontend)
  scripts/migrate-legacy.js old single-DB → database-per-business
frontend/src/
  context/                  Auth + Settings (theme engine applies colours/dark mode everywhere)
  hooks/usePersistentCart   the cart mirrors itself to localStorage so a sale survives a refresh
  hooks/useOnline           connection state — polls /api/health only while the server is unreachable
  components/shared/        Layout, Sidebar, Modal, ErrorBoundary, table + form primitives
  components/               billing, dashboard, stock, inventory, customers, business, settings, admin
  index.css                 design tokens + the responsive layout system
```

## Responsive layout

Layout lives in classes, not in inline styles, so one change in `index.css` moves every page:

| Class | Use | Collapses |
|---|---|---|
| `.page-content` | page shell with gutters + room for the mobile top bar | padding shrinks at 860 / 560px |
| `.grid-stats`, `.grid-stats-sm` | stat strips | auto-fit, never below a readable width |
| `.grid-main-side`, `.grid-side-main` | chart/form beside a panel | stacks at 1100px |
| `.grid-2/3/4`, `.form-grid`, `.form-grid-3` | fixed column counts | step down at 1100 / 860 / 560px |
| `.table-stack` (on by default via `<Table>`) | data tables | each row becomes a labelled card below 760px |
| `.billing-*` | the POS screen | cart docks on desktop, becomes a bottom sheet + summary bar on mobile |

Tables pass the column caption through `<Td label="…">`; `primary` marks the cell that becomes the card
heading and `actions` the trailing button cell. Pass `<Table stack={false}>` for analytical tables (GST
slabs, P&L) where comparing rows matters more — those scroll sideways instead.

Viewport heights use `dvh`, so the mobile browser's address bar cannot clip the checkout button off screen.
