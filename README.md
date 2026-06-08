# Messin With Resin

Marketing site for **Messin With Resin** — handcrafted, made-to-order resin art
from Central Texas. Custom figurines, home décor, cardholders, keychains,
planters and commissions. No two pieces alike.

## Structure

```
index.html    Full landing page (announcement bar, nav, hero, products,
              gallery, reviews, commissions, contact, footer)
styles.css    Stylesheet, including responsive breakpoints for tablet/mobile
script.js     Front-end interactivity (no dependencies)
```

It's a plain static site — no build step, no dependencies. Fonts load from
Google Fonts.

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

## Running locally

Just open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Notes / next steps

These are intentionally stubbed pending real details:

- **Imagery** — product cards, gallery tiles, the artist photo, and showcase
  pieces are emoji / placeholder frames; swap in real photography when ready.
- **Checkout** — the cart works and persists, but the checkout button is a
  placeholder; no payment/order backend yet.
- **Commission form** — validates and shows a success state, but the payload
  is only logged to the console; needs a real endpoint or form service.
- **Contact & social links** — Instagram, email, and phone need real
  destinations.
