# Messin With Resin

Marketing site for **Messin With Resin** — handcrafted, made-to-order resin art
from Central Texas. Custom figurines, home décor, cardholders, keychains,
planters and commissions. No two pieces alike.

## Structure

```
index.html    Full landing page (announcement bar, nav, hero, products,
              reviews, commissions, contact, footer)
styles.css    Stylesheet, including responsive breakpoints for tablet/mobile
```

It's a plain static site — no build step, no dependencies. Fonts load from
Google Fonts.

## Running locally

Just open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Notes / next steps

- Product images, the artist photo, and showcase pieces are currently emoji /
  placeholder frames — swap in real photography when available.
- Buttons and nav links are not yet wired to real pages or a cart/checkout
  flow.
- Contact and social links (Instagram, email, phone) need real destinations.
