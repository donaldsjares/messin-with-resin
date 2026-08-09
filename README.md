# Messin With Resin

Marketing site for **Messin With Resin** — handcrafted, made-to-order resin art
from Central Texas. Custom figurines, home décor, cardholders, keychains,
planters and commissions. No two pieces alike.

## Structure

```
index.html        Storefront landing page
styles.css        Storefront stylesheet (responsive)
script.js         Storefront interactivity (no dependencies)

admin.html        Owner admin (login + product editor)
admin.css         Admin styling
admin.js          Admin logic

api/products.js   GET (public) / PUT (owner) products
api/auth.js       Owner login / logout / session
api/shipping.js   POST cart + ZIP → USPS (or flat-rate) shipping estimate
api/checkout.js   POST cart → Stripe Checkout Session (redirect URL)
api/stripe-webhook.js  Stripe webhook → mark orders paid (raw-body sig verify)
api/orders.js     GET (owner) order list
api/upload.mjs    Owner image upload → Vercel Blob (ESM, uses @vercel/blob)
lib/auth.js       Signed-cookie session helpers (crypto, no deps)
lib/store.js      Product storage: Upstash Redis REST in prod, file locally
lib/products.js   Product validation / normalization
lib/site.js       Site settings (section images + shipping) storage
lib/usps.js       USPS APIs client (OAuth2 token + Domestic Prices lookup)
lib/shipping.js   Shared shipping-quote logic (estimate + checkout charge)
lib/stripe.js     Stripe client (Checkout Session + webhook sig verify, no SDK)
lib/orders.js     Order storage: Upstash Redis REST in prod, file locally
data/products.json  Seed catalog (single source of truth for the seed)
vercel.json       Clean URLs
package.json      Single dependency: @vercel/blob (for image uploads)
```

The storefront is static and renders products from data: it shows the embedded
seed instantly, then overrides from `/api/products` when the backend is live.
The API functions are zero-dependency Node functions. Fonts load from Google
Fonts.

## Interactive features

- **Cart** — add/remove items, quantity steppers, subtotal, a free-shipping
  progress bar, clear-cart, and add/clear actions with one-tap **Undo**.
  Persists in `localStorage`.
- **Quick-view modal** — click a product card for a larger view + quantity.
- **Product filters** — filter the grid by category.
- **Gallery lightbox** — click a tile for a full view with prev/next and
  arrow-key navigation.
- **Commission request form** — modal with client-side validation.
- **Navigation** — smooth-scroll, scrollspy active-link highlighting, sticky
  nav shadow, back-to-top, and a mobile hamburger menu.
- **Accessibility** — overlays lock body scroll, trap focus, and restore focus
  to their trigger on close; animations honor `prefers-reduced-motion`.

## Owner admin

The owner can manage products at **`/admin`**: log in with the admin password,
then add / edit / reorder / delete products and **Save changes** to publish to
the live storefront for all visitors.

- **Auth** — a single shared password (`ADMIN_PASSWORD`) exchanged for an
  HMAC-signed, HttpOnly session cookie (signed with `SESSION_SECRET`). There is
  no user database; there's exactly one owner.
- **Brute-force protection** — failed logins are counted per IP in KV; after 5
  failures the IP is locked out for 30 minutes (`lib/login-guard.js`). Fails
  open if KV is unavailable so the owner can't be permanently locked out.
- **Storage** — products live in Vercel KV / Upstash Redis (via its REST API).
  Without KV configured, saves fall back to `data/products.json` on disk, which
  works under `vercel dev` but is read-only in deployed serverless.
- **Photos** — each product can have a real image. The admin downscales/
  compresses it in-browser, then uploads to **Vercel Blob** via `/api/upload`;
  the returned URL is stored on the product. The storefront shows the photo
  when present and falls back to the emoji + gradient otherwise.
- **Shipping settings** — the admin has a *Shipping settings* panel (ship-from
  ZIP, handling fee, free-shipping threshold, flat-rate fallback) plus a
  per-product **Weight (oz)**. These feed the cart's shipping estimator.
- **Orders** — a *Recent orders* section lists checkout orders (status, items,
  shipping address, totals), backed by the owner-only `/api/orders`. Paid
  orders can be marked **shipped** with a tracking number (POST `/api/orders`),
  which records a USPS tracking link for fulfillment.

## Shipping estimates

The cart drawer includes a **shipping estimator**: a shopper enters a
destination ZIP and gets rate options, which update the order total. It calls
`POST /api/shipping` with the cart's item ids + quantities; the server looks up
each product's price and weight from the catalog (so a tampered cart can't
change the rate), then:

1. Returns **free shipping** if the subtotal clears the admin's threshold.
2. Otherwise asks **USPS** for live rates (Ground Advantage + Priority Mail)
   via `lib/usps.js` — OAuth2 client-credentials token, then the Domestic
   Prices 3.0 `base-rates` endpoint — when `USPS_CLIENT_ID`/`USPS_CLIENT_SECRET`
   and a ship-from ZIP are set.
3. Falls back to the admin's **flat rate** whenever USPS is unconfigured or a
   lookup fails, so checkout never hard-fails. The handling fee is added to
   each option.

To validate live rates before going to production, point `USPS_API_BASE` at the
USPS TEM sandbox (`https://apis-tem.usps.com`) with your credentials.

## Checkout & payments

Checkout uses **Stripe Checkout** (the hosted, PCI-compliant payment page) via
Stripe's REST API — no SDK, matching the rest of the backend.

1. The shopper estimates shipping in the cart, then clicks **Checkout**.
2. `POST /api/checkout` **recomputes** merchandise prices and the shipping
   charge server-side via `lib/shipping.js` (the client's chosen service only
   selects among the server's own options — a tampered cart or price can't get
   through), records a **pending order**, creates a Stripe Checkout Session,
   and returns its URL. The browser redirects to Stripe, which collects the
   shipping address and payment.
3. On success Stripe redirects back to `/?checkout=success`; the storefront
   clears the cart and shows a confirmation. `?checkout=cancel` keeps the cart.
4. `POST /api/stripe-webhook` (signature-verified against the raw body) marks
   the order **paid** and saves the shipping address on
   `checkout.session.completed`. This is the source of truth for payment — the
   success redirect alone never marks an order paid.

Orders are stored in KV (`lib/orders.js`), readable by the owner at
`GET /api/orders`, and shown in the admin's **Recent orders** section (status,
line items, shipping address, and totals). Without `STRIPE_SECRET_KEY`, the
Checkout button falls back to a "not set up yet" message, so the site stays
usable pre-configuration. Use Stripe **test keys** (`sk_test_…`) until you're
ready to go live.

### Deploying to Vercel

1. Import the repo into Vercel (framework preset: **Other**).
2. Add the **Vercel KV / Upstash** storage integration to the project. It sets
   `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
3. Create a **Vercel Blob** store (project → Storage → Create → Blob) for
   product photo uploads. It sets `BLOB_READ_WRITE_TOKEN` automatically.
4. Add environment variables (see `.env.example`):
   - `ADMIN_PASSWORD` — your login password.
   - `SESSION_SECRET` — a long random string
     (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
   - *(optional)* `USPS_CLIENT_ID` / `USPS_CLIENT_SECRET` for live USPS rates
     (register an app at developer.usps.com). Without them, the cart uses the
     flat-rate fallback from the admin's Shipping settings.
   - *(optional)* `STRIPE_SECRET_KEY` for real checkout. Then add a Stripe
     webhook pointing at `https://<your-domain>/api/stripe-webhook` for
     `checkout.session.completed` + `checkout.session.expired`, and set its
     signing secret as `STRIPE_WEBHOOK_SECRET`.
5. Deploy, then visit `/admin` to log in. Set your ship-from ZIP and shipping
   fees under **Shipping settings**.

## Running locally

Storefront only (static), no backend:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

Full stack with the API + admin (needs the Vercel CLI):

```sh
npm i -g vercel
cp .env.example .env.local    # fill in ADMIN_PASSWORD + SESSION_SECRET
vercel dev                    # storefront at /, admin at /admin
```

Under `vercel dev` without KV, product edits persist to `data/products.json`.

## Notes / next steps

These are intentionally stubbed pending real details:

- **Imagery** — product photos can now be uploaded in the admin (stored in
  Vercel Blob). The gallery tiles, artist photo, and commission showcase are
  still emoji / placeholder frames; swap in real photography when ready.
- **Checkout** — the cart estimates USPS shipping and checks out through
  Stripe, capturing paid orders in KV and listing them in the admin's Recent
  orders section, where they can be marked shipped with a tracking number.
  Still to come: optional order-notification email and automated USPS **label
  purchasing** (needs a USPS EPS business account; today you buy labels
  yourself and paste the tracking number). Sales tax isn't collected yet —
  enable Stripe Tax or add a Texas rate if required.
- **Commission form** — validates and shows a success state, but the payload
  is only logged to the console; needs a real endpoint or form service.
- **Contact & social links** — Instagram, email, and phone need real
  destinations.
