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
lib/auth.js       Signed-cookie session helpers (crypto, no deps)
lib/store.js      Product storage: Upstash Redis REST in prod, file locally
lib/products.js   Product validation / normalization
data/products.json  Seed catalog (single source of truth for the seed)
vercel.json       Clean URLs
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
- **Storage** — products live in Vercel KV / Upstash Redis (via its REST API).
  Without KV configured, saves fall back to `data/products.json` on disk, which
  works under `vercel dev` but is read-only in deployed serverless.

### Deploying to Vercel

1. Import the repo into Vercel (framework preset: **Other**).
2. Add the **Vercel KV / Upstash** storage integration to the project. It sets
   `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
3. Add environment variables (see `.env.example`):
   - `ADMIN_PASSWORD` — your login password.
   - `SESSION_SECRET` — a long random string
     (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
4. Deploy, then visit `/admin` to log in.

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

- **Imagery** — product cards, gallery tiles, the artist photo, and showcase
  pieces are emoji / placeholder frames; swap in real photography when ready.
  (The admin product editor takes an emoji/icon and a CSS background today;
  real image uploads would be a natural follow-up via Vercel Blob.)
- **Checkout** — the cart works and persists, but the checkout button is a
  placeholder; no payment/order backend yet.
- **Commission form** — validates and shows a success state, but the payload
  is only logged to the console; needs a real endpoint or form service.
- **Contact & social links** — Instagram, email, and phone need real
  destinations.
