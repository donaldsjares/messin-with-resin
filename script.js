/* Messin With Resin — front-end interactivity
 * Cart (with localStorage), slide-in cart drawer, smooth-scroll nav,
 * mobile menu, and toast notifications. No dependencies. */
(function () {
  'use strict';

  var STORAGE_KEY = 'mwr-cart-v3';
  var RECENT_KEY = 'mwr-recent-v2';
  var FREE_SHIPPING_THRESHOLD = 50;
  var TOAST_CAP = 3;       // max toasts visible at once
  var RECENT_MAX = 8;      // recently-viewed items kept
  var REC_MAX = 3;         // cart recommendations shown

  /* Embedded seed — keep in sync with data/products.json. Used as a fallback
   * so the storefront renders even with no backend (e.g. opened as a file).
   * When the API is live, /api/products overrides this. */
  var SEED_PRODUCTS = [
    { id: 'holiday-reindeer', name: 'Holiday Reindeer', category: 'Animals', price: 24, emoji: '🦌', description: 'Handcrafted with customizable color fills — perfect for holiday decor or an unforgettable gift.', bg: 'linear-gradient(135deg,#fce7f3,#ede9fe)', badge: { type: 'hot', label: '🔥 Bestseller' } },
    { id: 'resin-animal-figurine', name: 'Resin Animal Figurine', category: 'Figurines', price: 18, emoji: '🐻', description: 'Your animal, your colors, your finish. Poured fresh for every single order — never repeated.', bg: 'linear-gradient(135deg,#fef9c3,#fde68a)', badge: { type: 'new', label: '✨ New' } },
    { id: 'phone-cardholder', name: 'Phone / Cardholder', category: 'Desk & Office', price: 32, emoji: '💳', description: 'Functional and completely eye-catching. Comes in any color combination you can imagine.', bg: 'linear-gradient(135deg,#e0f2fe,#bae6fd)', badge: null },
    { id: 'star-decor-piece', name: 'Star Décor Piece', category: 'Décor', price: 28, emoji: '⭐', description: 'A show-stopping accent for any room. Red, blue, gold, or totally custom — your call.', bg: 'linear-gradient(135deg,#fce7f3,#f5d0fe)', badge: { type: 'fav', label: '💙 Popular' } },
    { id: 'resin-planter', name: 'Resin Planter', category: 'Planters', price: 22, emoji: '🌿', description: 'Beautifully marbled mini planters — each one poured fresh and genuinely one-of-a-kind.', bg: 'linear-gradient(135deg,#d1fae5,#a7f3d0)', badge: null },
    { id: 'custom-keychain', name: 'Custom Keychain', category: 'Accessories', price: 12, emoji: '🗝️', description: 'Carry a little piece of art everywhere. Initials, shapes, florals — you name it, we pour it.', bg: 'linear-gradient(135deg,#fef3c7,#fed7aa)', badge: null }
  ];
  var activeFilter = 'all';
  var requestedFilter = null; // category requested via the URL ?cat= param
  var productOptions = []; // global customization option groups (from /api/options)

  /* ── State ── */
  var cart = loadCart(); // { id: { name, price, emoji, qty } }
  var catalog = [];      // [{ id, name, price, emoji, category, description, bg, badge }]
  var recent = loadRecent(); // array of product ids, most-recent first

  function loadRecent() {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveRecent() {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch (e) { /* storage unavailable */ }
  }

  /* ── Products: data-driven rendering ── */
  function setCatalog(products) {
    catalog = (products || []).map(function (p) {
      return {
        id: String(p.id),
        name: p.name,
        category: p.category || '',
        price: Number(p.price) || 0,
        emoji: p.emoji || '🎨',
        description: p.description || '',
        image: p.image || '',
        bg: p.bg || 'var(--cream-mid)',
        badge: p.badge && p.badge.type ? p.badge : null,
        featured: !!p.featured
      };
    });
    // Apply a URL-requested category once its products are available.
    if (requestedFilter) {
      if (catalog.some(function (p) { return p.category === requestedFilter; })) {
        activeFilter = requestedFilter;
        requestedFilter = null;
      } else {
        activeFilter = 'all';
      }
    }
    renderFilters();
    renderProductGrid();
    renderFeatured();
    bindProductCards();
    applyFilter(activeFilter);
  }

  /* A product's visual is either an uploaded photo (cover background) or its
   * gradient + emoji. These helpers keep that consistent everywhere. */
  function mediaBg(p) {
    if (p && p.image) {
      return "background-image:url('" + String(p.image).replace(/'/g, '%27') +
        "');background-size:cover;background-position:center";
    }
    return 'background:' + (p && p.bg ? p.bg : 'var(--cream-mid)');
  }
  function mediaGlyph(p) {
    return p && p.image ? '' : (p ? p.emoji : '');
  }

  function renderProductGrid() {
    var grid = document.getElementById('mr-prod-grid');
    if (!grid) return;
    grid.innerHTML = catalog.map(productCardHTML).join('');
  }

  /* Homepage "Featured" teaser: products flagged featured (up to 4),
   * falling back to the first few if none are flagged. */
  function renderFeatured() {
    var grid = document.getElementById('mr-featured-grid');
    if (!grid) return;
    var feat = catalog.filter(function (p) { return p.featured; });
    if (!feat.length) feat = catalog.slice();
    grid.innerHTML = feat.slice(0, 4).map(productCardHTML).join('');
  }

  /* ── Editable section images (hero / about / commission) ── */
  function applySiteImages() {
    if (!window.fetch) return;
    fetch('/api/site', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        if (!s) return;
        setSectionImage('mr-hero-frame', s.heroImage);
        setSectionImage('mr-about-frame', s.aboutImage);
        setSectionImage('mr-comm-circle', s.commissionImage);
        setNavLogo(s.logoImage);
      })
      .catch(function () { /* no backend — keep placeholder emoji */ });
  }

  function setSectionImage(id, url) {
    var el = document.getElementById(id);
    if (!el || !url) return;
    el.style.backgroundImage = "url('" + String(url).replace(/'/g, '%27') + "')";
    el.classList.add('mr-has-image');
  }

  /* Swap the top-bar mark + wordmark for the uploaded logo image. */
  function setNavLogo(url) {
    var logo = document.querySelector('.mr-logo');
    if (!logo || !url) return;
    var img = document.createElement('img');
    img.className = 'mr-logo-img';
    img.src = url;
    img.alt = 'Messin With Resin';
    logo.innerHTML = '';
    logo.appendChild(img);
    setFavicon(url);
  }

  /* Use the uploaded logo as the browser-tab icon too. */
  function setFavicon(url) {
    if (!url) return;
    var link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = '';
    link.href = url;
  }

  function productCardHTML(p) {
    var chip = p.badge
      ? '<div class="mr-prod-chip mr-chip-' + escapeAttr(p.badge.type) + '">' + escapeHtml(p.badge.label) + '</div>'
      : '';
    return '' +
      '<div class="mr-prod-card" data-category="' + escapeAttr(p.category) + '">' +
        '<div class="mr-prod-img" style="' + mediaBg(p) + '">' + mediaGlyph(p) + chip + '</div>' +
        '<div class="mr-prod-body">' +
          '<div class="mr-prod-cat">' + escapeHtml(p.category) + '</div>' +
          '<div class="mr-prod-name">' + escapeHtml(p.name) + '</div>' +
          '<div class="mr-prod-desc">' + escapeHtml(p.description) + '</div>' +
          '<div class="mr-prod-row">' +
            '<div class="mr-prod-price">From ' + formatPrice(p.price) + '</div>' +
            '<button class="mr-prod-add" data-id="' + escapeAttr(p.id) + '">Customize</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function bindProductCards() {
    document.querySelectorAll('.mr-prod-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var btn = card.querySelector('.mr-prod-add');
        var p = findProduct(btn.dataset.id);
        if (p) openModalForProduct(p);
      });
      var addBtn = card.querySelector('.mr-prod-add');
      addBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        // Options are mandatory, so the add button opens the chooser modal.
        var p = findProduct(addBtn.dataset.id);
        if (p) openModalForProduct(p);
      });
    });
  }

  function renderFilters() {
    var wrap = document.getElementById('mr-filters');
    if (!wrap) return;
    var cats = [];
    catalog.forEach(function (p) {
      if (p.category && cats.indexOf(p.category) === -1) cats.push(p.category);
    });
    var html = '<button class="mr-filter' + (activeFilter === 'all' ? ' is-active' : '') + '" data-filter="all">All</button>';
    html += cats.map(function (c) {
      return '<button class="mr-filter' + (activeFilter === c ? ' is-active' : '') +
        '" data-filter="' + escapeAttr(c) + '">' + escapeHtml(c) + '</button>';
    }).join('');
    wrap.innerHTML = html;
  }

  function applyFilter(filter) {
    activeFilter = filter;
    var shown = 0;
    document.querySelectorAll('.mr-prod-card').forEach(function (card) {
      var match = filter === 'all' || card.dataset.category === filter;
      card.classList.toggle('is-hidden', !match);
      if (match) shown++;
    });
    var empty = document.getElementById('mr-prod-empty');
    if (empty) empty.hidden = shown > 0;
  }

  function findProduct(id) {
    for (var i = 0; i < catalog.length; i++) {
      if (catalog[i].id === id) return catalog[i];
    }
    return null;
  }

  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (e) { /* storage unavailable — cart stays in memory only */ }
  }

  /* ── Element refs ── */
  var els = {
    overlay: document.getElementById('mr-overlay'),
    drawer: document.getElementById('mr-cart-drawer'),
    cartToggle: document.getElementById('mr-cart-toggle'),
    cartClose: document.getElementById('mr-cart-close'),
    cartItems: document.getElementById('mr-cart-items'),
    cartEmpty: document.getElementById('mr-cart-empty'),
    cartFoot: document.getElementById('mr-cart-foot'),
    cartClear: document.getElementById('mr-cart-clear'),
    checkout: document.getElementById('mr-cart-checkout'),
    shipWrap: document.querySelector('.mr-ship'),
    shipMsg: document.querySelector('[data-ship-msg]'),
    shipFill: document.querySelector('[data-ship-fill]'),
    hamburger: document.getElementById('mr-hamburger'),
    navLinks: document.getElementById('mr-nav-links'),
    toasts: document.getElementById('mr-toasts'),
    nav: document.querySelector('.mr-nav'),
    toTop: document.getElementById('mr-to-top'),
    modal: document.getElementById('mr-modal'),
    modalMedia: document.getElementById('mr-modal-media'),
    modalCat: document.getElementById('mr-modal-cat'),
    modalName: document.getElementById('mr-modal-name'),
    modalPrice: document.getElementById('mr-modal-price'),
    modalDesc: document.getElementById('mr-modal-desc'),
    modalQty: document.getElementById('mr-modal-qty'),
    modalDec: document.getElementById('mr-modal-dec'),
    modalInc: document.getElementById('mr-modal-inc'),
    modalAdd: document.getElementById('mr-modal-add'),
    modalShare: document.getElementById('mr-modal-share'),
    modalOptions: document.getElementById('mr-modal-options'),
    filters: document.getElementById('mr-filters'),
    prodEmpty: document.getElementById('mr-prod-empty'),
    formModal: document.getElementById('mr-form-modal'),
    form: document.getElementById('mr-form'),
    formSuccess: document.getElementById('mr-form-success'),
    lightbox: document.getElementById('mr-lightbox'),
    lbMedia: document.getElementById('mr-lb-media'),
    lbCaption: document.getElementById('mr-lb-caption'),
    lbCount: document.getElementById('mr-lb-count'),
    lbPrev: document.getElementById('mr-lb-prev'),
    lbNext: document.getElementById('mr-lb-next'),
    cartRecs: document.getElementById('mr-cart-recs'),
    cartRecsList: document.getElementById('mr-cart-recs-list'),
    recentSection: document.getElementById('mr-recent'),
    recentStrip: document.getElementById('mr-recent-strip')
  };

  var modalItem = null;
  var modalQty = 1;
  var galleryItems = [];
  var lbIndex = 0;

  /* ── Accessibility: scroll lock + focus trap ──
   * Overlays push onto a stack so focus is trapped in the topmost one and
   * restored to the triggering element on close; body scroll locks while
   * anything is open. */
  var trapStack = [];

  function activateTrap(container) {
    trapStack.push({ container: container, prevFocus: document.activeElement });
    document.body.classList.add('mr-no-scroll');
  }

  function deactivateTrap(container) {
    for (var i = trapStack.length - 1; i >= 0; i--) {
      if (trapStack[i].container === container) {
        var entry = trapStack.splice(i, 1)[0];
        if (entry.prevFocus && typeof entry.prevFocus.focus === 'function') {
          entry.prevFocus.focus();
        }
        break;
      }
    }
    if (trapStack.length === 0) document.body.classList.remove('mr-no-scroll');
  }

  function focusables(container) {
    var sel = 'a[href], button:not([disabled]), input:not([disabled]), ' +
      'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.prototype.filter.call(container.querySelectorAll(sel), function (el) {
      return el.offsetParent !== null; // visible
    });
  }

  function handleTrapTab(e) {
    if (e.key !== 'Tab' || !trapStack.length) return;
    var container = trapStack[trapStack.length - 1].container;
    var items = focusables(container);
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ── Cart operations ── */
  var enterId = null; // id of a just-added item, for the entrance animation

  /* Cart items are keyed by product id + chosen options, so the same product
   * with different customizations are separate lines. */
  function cartKey(id, options) {
    var sig = '';
    try { sig = JSON.stringify(options || {}); } catch (e) { sig = ''; }
    return id + '::' + sig;
  }

  function addToCart(item, qty, options) {
    qty = qty || 1;
    options = options || {};
    var key = cartKey(item.id, options);
    if (cart[key]) {
      cart[key].qty += qty;
    } else {
      cart[key] = { id: item.id, name: item.name, price: item.price, emoji: item.emoji, qty: qty, options: options };
      enterId = key;
    }
    saveCart();
    renderCart();
    enterId = null;
    bumpCartIcon();
  }

  function changeQty(id, delta) {
    if (!cart[id]) return;
    if (cart[id].qty + delta <= 0) { removeItem(id); return; }
    cart[id].qty += delta;
    saveCart();
    renderCart();
  }

  function removeItem(id) {
    var row = rowFor(id);
    if (row && !prefersReducedMotion()) {
      row.classList.add('is-removing');
      setTimeout(function () { commitRemove(id); }, 280);
    } else {
      commitRemove(id);
    }
  }

  function commitRemove(id) {
    delete cart[id];
    saveCart();
    renderCart();
  }

  function rowFor(id) {
    var rows = els.cartItems.children;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].dataset.id === id) return rows[i];
    }
    return null;
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function clearCart() {
    if (cartCount() === 0) return;
    var snapshot = JSON.stringify(cart);
    cart = {};
    saveCart();
    renderCart();
    toast('🧹', 'Cart cleared', { label: 'Undo', fn: function () {
      cart = JSON.parse(snapshot);
      saveCart();
      renderCart();
    } });
  }

  /* Add an item, then return a function that reverses exactly this add. */
  function addWithUndo(item, qty, message, options) {
    options = options || {};
    var key = cartKey(item.id, options);
    var prev = cart[key] ? cart[key].qty : null;
    addToCart(item, qty, options);
    toast(item.emoji, message, { label: 'Undo', fn: function () {
      if (prev === null) delete cart[key];
      else cart[key].qty = prev;
      saveCart();
      renderCart();
    } });
  }

  function cartCount() {
    return Object.keys(cart).reduce(function (n, id) { return n + cart[id].qty; }, 0);
  }

  function cartTotal() {
    return Object.keys(cart).reduce(function (sum, id) {
      return sum + cart[id].price * cart[id].qty;
    }, 0);
  }

  /* ── Rendering ── */
  function renderCart() {
    var count = cartCount();

    document.querySelectorAll('[data-cart-count]').forEach(function (el) {
      el.textContent = count;
    });

    var summary = document.querySelector('[data-cart-summary]');
    if (summary) summary.textContent = count + (count === 1 ? ' item' : ' items');

    var ids = Object.keys(cart);
    var isEmpty = ids.length === 0;

    els.cartEmpty.style.display = isEmpty ? '' : 'none';
    els.cartFoot.hidden = isEmpty;
    els.cartItems.style.display = isEmpty ? 'none' : '';

    els.cartItems.innerHTML = '';
    ids.forEach(function (id) {
      els.cartItems.appendChild(renderItem(id, cart[id]));
    });

    var total = cartTotal();
    var totalEl = document.querySelector('[data-cart-total]');
    if (totalEl) totalEl.textContent = formatPrice(total);
    updateShipping(total);
    renderRecs(isEmpty);
  }

  /* ── Cart recommendations ── */
  function renderRecs(cartEmpty) {
    if (!els.cartRecs) return;
    var inCart = {};
    Object.keys(cart).forEach(function (k) { if (cart[k].id) inCart[cart[k].id] = true; });
    var picks = [];
    for (var i = 0; i < catalog.length && picks.length < REC_MAX; i++) {
      if (!inCart[catalog[i].id]) picks.push(catalog[i]);
    }
    if (cartEmpty || picks.length === 0) {
      els.cartRecs.hidden = true;
      return;
    }
    els.cartRecs.hidden = false;
    els.cartRecsList.innerHTML = '';
    picks.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'mr-rec';
      row.innerHTML =
        '<div class="mr-rec-img" style="' + mediaBg(p) + '">' + mediaGlyph(p) + '</div>' +
        '<div class="mr-rec-mid">' +
          '<div class="mr-rec-name">' + escapeHtml(p.name) + '</div>' +
          '<div class="mr-rec-price">From ' + formatPrice(p.price) + '</div>' +
        '</div>' +
        '<button type="button" class="mr-rec-add" aria-label="Add ' + escapeHtml(p.name) + ' to cart">+</button>';
      row.querySelector('.mr-rec-add').addEventListener('click', function () {
        closeDrawer();
        openModalForProduct(p);
      });
      els.cartRecsList.appendChild(row);
    });
  }

  /* ── Recently viewed ── */
  function recordRecentlyViewed(id) {
    recent = recent.filter(function (x) { return x !== id; });
    recent.unshift(id);
    recent = recent.slice(0, RECENT_MAX);
    saveRecent();
    renderRecentlyViewed();
  }

  function renderRecentlyViewed() {
    if (!els.recentSection) return;
    var items = recent.map(findProduct).filter(Boolean);
    if (items.length === 0) {
      els.recentSection.hidden = true;
      return;
    }
    els.recentSection.hidden = false;
    els.recentStrip.innerHTML = '';
    items.forEach(function (p) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'mr-recent-card';
      card.innerHTML =
        '<div class="mr-recent-thumb" style="' + mediaBg(p) + '">' + mediaGlyph(p) + '</div>' +
        '<div class="mr-recent-name">' + escapeHtml(p.name) + '</div>' +
        '<div class="mr-recent-price">From ' + formatPrice(p.price) + '</div>';
      card.addEventListener('click', function () { openModalForProduct(p); });
      els.recentStrip.appendChild(card);
    });
  }

  function updateShipping(total) {
    if (!els.shipWrap) return;
    var remaining = FREE_SHIPPING_THRESHOLD - total;
    els.shipFill.style.width = Math.min(100, (total / FREE_SHIPPING_THRESHOLD) * 100) + '%';
    if (remaining <= 0) {
      els.shipWrap.classList.add('is-unlocked');
      els.shipMsg.innerHTML = '🎉 You\'ve unlocked <em>free shipping!</em>';
    } else {
      els.shipWrap.classList.remove('is-unlocked');
      els.shipMsg.innerHTML = 'You\'re <em>' + formatPrice(remaining) + '</em> away from free shipping!';
    }
  }

  function cartItemOptionsHTML(options) {
    if (!options) return '';
    var keys = Object.keys(options).filter(function (k) { return options[k] && String(options[k]).trim(); });
    if (!keys.length) return '';
    return '<div class="mr-cart-item-opts">' + keys.map(function (k) {
      return '<span>' + escapeHtml(k) + ': ' + escapeHtml(options[k]) + '</span>';
    }).join('') + '</div>';
  }

  function renderItem(id, item) {
    var row = document.createElement('div');
    row.className = 'mr-cart-item' + (id === enterId ? ' mr-cart-item--enter' : '');
    row.dataset.id = id;
    var prod = findProduct(item.id);
    var thumbStyle = prod && prod.image ? mediaBg(prod) : '';
    var thumbGlyph = prod && prod.image ? '' : item.emoji;
    row.innerHTML =
      '<div class="mr-cart-item-img" style="' + thumbStyle + '">' + thumbGlyph + '</div>' +
      '<div class="mr-cart-item-mid">' +
        '<div class="mr-cart-item-name">' + escapeHtml(item.name) + '</div>' +
        '<div class="mr-cart-item-price">' + formatPrice(item.price) + ' each</div>' +
        cartItemOptionsHTML(item.options) +
        '<div class="mr-cart-item-controls">' +
          '<div class="mr-qty">' +
            '<button type="button" data-dec aria-label="Decrease quantity">−</button>' +
            '<span class="mr-qty-val">' + item.qty + '</span>' +
            '<button type="button" data-inc aria-label="Increase quantity">+</button>' +
          '</div>' +
          '<button type="button" class="mr-cart-item-remove" data-remove>Remove</button>' +
        '</div>' +
      '</div>' +
      '<div class="mr-cart-item-line">' + formatPrice(item.price * item.qty) + '</div>';

    row.querySelector('[data-dec]').addEventListener('click', function () { changeQty(id, -1); });
    row.querySelector('[data-inc]').addEventListener('click', function () { changeQty(id, 1); });
    row.querySelector('[data-remove]').addEventListener('click', function () { removeItem(id); });
    return row;
  }

  function formatPrice(n) {
    return '$' + (Math.round(n * 100) / 100).toLocaleString('en-US');
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  /* ── Drawer + overlay ── */
  function openDrawer() {
    closeMenu();
    showOverlay();
    els.drawer.classList.add('is-open');
    els.drawer.setAttribute('aria-hidden', 'false');
    activateTrap(els.drawer);
    els.cartClose.focus();
  }

  function closeDrawer() {
    if (!els.drawer.classList.contains('is-open')) return;
    els.drawer.classList.remove('is-open');
    els.drawer.setAttribute('aria-hidden', 'true');
    maybeHideOverlay();
    deactivateTrap(els.drawer);
  }

  function showOverlay() {
    els.overlay.hidden = false;
    // next frame so the transition runs
    requestAnimationFrame(function () { els.overlay.classList.add('is-visible'); });
  }

  function maybeHideOverlay() {
    var drawerOpen = els.drawer.classList.contains('is-open');
    var menuOpen = els.navLinks.classList.contains('is-open');
    if (!drawerOpen && !menuOpen) {
      els.overlay.classList.remove('is-visible');
      setTimeout(function () { els.overlay.hidden = true; }, 250);
    }
  }

  /* ── Mobile menu ── */
  function toggleMenu() {
    if (els.navLinks.classList.contains('is-open')) {
      closeMenu();
    } else {
      els.navLinks.classList.add('is-open');
      els.hamburger.classList.add('is-open');
      els.hamburger.setAttribute('aria-expanded', 'true');
      showOverlay();
      activateTrap(els.nav);
    }
  }

  function closeMenu() {
    if (!els.navLinks.classList.contains('is-open')) return;
    els.navLinks.classList.remove('is-open');
    els.hamburger.classList.remove('is-open');
    els.hamburger.setAttribute('aria-expanded', 'false');
    maybeHideOverlay();
    deactivateTrap(els.nav);
  }

  /* ── Smooth scroll ── */
  function scrollToTarget(selector) {
    var target = document.querySelector(selector);
    if (!target) return;
    var navH = 70;
    var y = target.getBoundingClientRect().top + window.pageYOffset - navH;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }

  /* ── Toasts ── */
  function toast(emoji, message, action) {
    var t = document.createElement('div');
    t.className = 'mr-toast';
    t.innerHTML = '<span class="mr-toast-emoji">' + emoji + '</span><span>' + escapeHtml(message) + '</span>';

    var timer;
    function dismiss() {
      clearTimeout(timer);
      t.classList.remove('is-visible');
      setTimeout(function () { t.remove(); }, 280);
    }

    if (action) {
      var btn = document.createElement('button');
      btn.className = 'mr-toast-action';
      btn.type = 'button';
      btn.textContent = action.label;
      btn.addEventListener('click', function () { action.fn(); dismiss(); });
      t.appendChild(btn);
    }

    els.toasts.appendChild(t);
    // Cap the stack: drop the oldest toasts beyond the limit immediately.
    while (els.toasts.children.length > TOAST_CAP) {
      els.toasts.removeChild(els.toasts.firstChild);
    }
    requestAnimationFrame(function () { t.classList.add('is-visible'); });
    timer = setTimeout(dismiss, action ? 5000 : 2400);
  }

  function bumpCartIcon() {
    els.cartToggle.classList.remove('is-bump');
    void els.cartToggle.offsetWidth; // restart animation
    els.cartToggle.classList.add('is-bump');
  }

  /* ── Quick-view modal ── */
  function openModalForProduct(p) {
    modalItem = { id: p.id, name: p.name, price: p.price, emoji: p.emoji };
    modalQty = 1;

    els.modalMedia.textContent = mediaGlyph(p);
    els.modalMedia.style.cssText = p.image ? mediaBg(p) : '';
    els.modalCat.textContent = p.category;
    els.modalName.textContent = p.name;
    els.modalPrice.textContent = 'From ' + formatPrice(p.price);
    els.modalDesc.textContent = p.description;
    els.modalQty.textContent = modalQty;
    renderModalOptions();

    recordRecentlyViewed(p.id);

    els.modal.classList.add('is-open');
    els.modal.setAttribute('aria-hidden', 'false');
    activateTrap(els.modal);
    els.modalAdd.focus();
  }

  /* Render the global customization option controls into the modal. */
  function renderModalOptions() {
    if (!els.modalOptions) return;
    els.modalOptions.innerHTML = productOptions.map(function (g) {
      var req = g.required ? ' data-opt-required="1"' : '';
      var star = g.required ? ' <span class="mr-opt-req">*</span>' : '';
      var control;
      if (g.type === 'text') {
        control = '<textarea data-opt rows="2" placeholder="Optional — tell us more"></textarea>';
      } else {
        control = '<select data-opt><option value="">Choose…</option>' +
          g.choices.map(function (c) { return '<option>' + escapeHtml(c) + '</option>'; }).join('') +
          '</select>';
      }
      return '<div class="mr-opt"' + req + ' data-opt-label="' + escapeAttr(g.label) + '">' +
        '<label>' + escapeHtml(g.label) + star + '</label>' +
        control +
        '<div class="mr-opt-err">Please make a selection.</div>' +
      '</div>';
    }).join('');
    // Clear error state on change
    els.modalOptions.querySelectorAll('[data-opt]').forEach(function (ctrl) {
      ctrl.addEventListener('change', function () {
        ctrl.closest('.mr-opt').classList.remove('has-error');
      });
    });
  }

  /* Validate required options; returns the chosen { label: value } map, or
   * null if a required option is missing (errors are shown inline). */
  function collectModalOptions() {
    if (!els.modalOptions) return {};
    var groups = els.modalOptions.querySelectorAll('.mr-opt');
    var out = {};
    var ok = true;
    var firstBad = null;
    groups.forEach(function (g) {
      var ctrl = g.querySelector('[data-opt]');
      var val = ctrl ? String(ctrl.value).trim() : '';
      var required = g.getAttribute('data-opt-required') === '1';
      if (required && !val) {
        g.classList.add('has-error');
        ok = false;
        if (!firstBad) firstBad = ctrl;
      } else {
        g.classList.remove('has-error');
      }
      if (val) out[g.getAttribute('data-opt-label')] = val;
    });
    if (!ok) {
      if (firstBad) firstBad.focus();
      return null;
    }
    return out;
  }

  /* Load the global option groups (color, effects, etc.). */
  function loadOptions() {
    if (!window.fetch) return;
    fetch('/api/options', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && Array.isArray(data.options)) productOptions = data.options;
      })
      .catch(function () { /* no backend — modal shows no extra options */ });
  }

  function closeModal() {
    if (!els.modal.classList.contains('is-open')) return;
    els.modal.classList.remove('is-open');
    els.modal.setAttribute('aria-hidden', 'true');
    modalItem = null;
    deactivateTrap(els.modal);
  }

  function setModalQty(delta) {
    modalQty = Math.max(1, modalQty + delta);
    els.modalQty.textContent = modalQty;
  }

  function shareProduct() {
    if (!modalItem) return;
    var url = location.origin + location.pathname + '#shop';
    var data = {
      title: modalItem.name + ' · Messin With Resin',
      text: 'Check out the ' + modalItem.name + ' from Messin With Resin!',
      url: url
    };
    if (navigator.share) {
      navigator.share(data).catch(function () { /* user cancelled */ });
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(data.text + ' ' + url).then(
        function () { toast('🔗', 'Link copied to clipboard'); },
        function () { toast('🔗', 'Could not copy the link'); }
      );
    } else {
      toast('🔗', 'Share: ' + url);
    }
  }

  /* ── Scroll reveal ── */
  function setupReveal() {
    var targets = document.querySelectorAll(
      '.mr-prod-card, .mr-review-card, .mr-feat, .mr-step, .mr-how-step, .mr-section-header, ' +
      '.mr-reviews-header, .mr-about-frame, .mr-comm-showcase, .mr-contact-btns'
    );
    targets.forEach(function (el) { el.classList.add('mr-reveal'); });

    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    targets.forEach(function (el) { io.observe(el); });
  }

  /* ── Scrollspy + nav shadow + back-to-top ── */
  function setupScrollWatchers() {
    var sections = ['#shop', '#gallery', '#commissions', '#about', '#contact']
      .map(function (id) {
        var el = document.querySelector(id);
        return el ? { id: id, el: el } : null;
      })
      .filter(Boolean);

    var navAnchors = {};
    els.navLinks.querySelectorAll('a[href^="#"]').forEach(function (a) {
      navAnchors[a.getAttribute('href')] = a;
    });

    function onScroll() {
      var y = window.pageYOffset;

      els.nav.classList.toggle('is-scrolled', y > 8);
      els.toTop.hidden = false;
      els.toTop.classList.toggle('is-visible', y > 600);

      // active section = last one whose top has passed the nav line
      var active = null;
      sections.forEach(function (s) {
        if (s.el.getBoundingClientRect().top <= 90) active = s.id;
      });
      Object.keys(navAnchors).forEach(function (href) {
        navAnchors[href].classList.toggle('is-active', href === active);
      });
    }

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(function () { onScroll(); ticking = false; });
        ticking = true;
      }
    }, { passive: true });
    onScroll();
  }

  /* ── Product filtering ──
   * Delegated so it keeps working after the grid/filters are re-rendered. */
  function setupFilters() {
    if (!els.filters) return;
    els.filters.addEventListener('click', function (e) {
      var btn = e.target.closest('.mr-filter');
      if (!btn) return;
      els.filters.querySelectorAll('.mr-filter').forEach(function (b) {
        b.classList.toggle('is-active', b === btn);
      });
      applyFilter(btn.dataset.filter);
    });
  }

  /* ── Commission form modal ── */
  function openForm() {
    closeMenu();
    resetForm();
    els.formModal.classList.add('is-open');
    els.formModal.setAttribute('aria-hidden', 'false');
    activateTrap(els.formModal);
    setTimeout(function () {
      var first = els.form.querySelector('input');
      if (first) first.focus();
    }, 300);
  }

  function closeForm() {
    if (!els.formModal.classList.contains('is-open')) return;
    els.formModal.classList.remove('is-open');
    els.formModal.setAttribute('aria-hidden', 'true');
    deactivateTrap(els.formModal);
  }

  function resetForm() {
    els.form.reset();
    els.form.hidden = false;
    els.formSuccess.hidden = true;
    els.form.querySelectorAll('.mr-field.has-error').forEach(function (f) {
      f.classList.remove('has-error');
    });
  }

  function setFieldError(name, message) {
    var field = els.form.querySelector('[name="' + name + '"]');
    if (!field) return;
    var wrap = field.closest('.mr-field');
    var errEl = els.form.querySelector('[data-err-for="' + name + '"]');
    if (message) {
      wrap.classList.add('has-error');
      if (errEl) errEl.textContent = message;
    } else {
      wrap.classList.remove('has-error');
      if (errEl) errEl.textContent = '';
    }
  }

  function validateForm(data) {
    var ok = true;
    setFieldError('name', '');
    setFieldError('email', '');
    setFieldError('details', '');

    if (!data.name.trim()) { setFieldError('name', 'Please tell us your name.'); ok = false; }
    if (!data.email.trim()) {
      setFieldError('email', 'We need an email to reach you.'); ok = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
      setFieldError('email', 'That email looks off — mind checking it?'); ok = false;
    }
    if (!data.details.trim()) { setFieldError('details', 'Give us a little detail to work with.'); ok = false; }
    return ok;
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    var f = els.form.elements;
    var data = {
      name: f.namedItem('name').value,
      email: f.namedItem('email').value,
      phone: f.namedItem('phone').value,
      occasion: f.namedItem('occasion').value,
      budget: f.namedItem('budget').value,
      details: f.namedItem('details').value
    };
    if (!validateForm(data)) return;

    // No backend yet — log the payload and show a success state.
    // Wire this up to a real endpoint / form service once available.
    console.log('Commission request:', data);
    els.form.hidden = true;
    els.formSuccess.hidden = false;
    toast('🩷', 'Request sent — we\'ll be in touch!');
  }

  /* ── Gallery lightbox ── */
  function setupLightbox() {
    var tiles = document.querySelectorAll('.mr-gallery-tile');
    if (!tiles.length) return;

    galleryItems = Array.prototype.map.call(tiles, function (t) {
      return { emoji: t.dataset.emoji, caption: t.dataset.caption, bg: t.style.background };
    });

    tiles.forEach(function (t, i) {
      t.addEventListener('click', function () { openLightbox(i); });
    });
    els.lbPrev.addEventListener('click', function () { lbStep(-1); });
    els.lbNext.addEventListener('click', function () { lbStep(1); });
    els.lightbox.querySelectorAll('[data-lb-close]').forEach(function (el) {
      el.addEventListener('click', closeLightbox);
    });
  }

  function openLightbox(i) {
    lbIndex = i;
    renderLightbox();
    els.lightbox.classList.add('is-open');
    els.lightbox.setAttribute('aria-hidden', 'false');
    activateTrap(els.lightbox);
    els.lbNext.focus();
  }

  function closeLightbox() {
    if (!els.lightbox.classList.contains('is-open')) return;
    els.lightbox.classList.remove('is-open');
    els.lightbox.setAttribute('aria-hidden', 'true');
    deactivateTrap(els.lightbox);
  }

  function lbStep(delta) {
    lbIndex = (lbIndex + delta + galleryItems.length) % galleryItems.length;
    renderLightbox();
  }

  function renderLightbox() {
    var item = galleryItems[lbIndex];
    els.lbMedia.textContent = item.emoji;
    els.lbMedia.style.background = item.bg;
    els.lbCaption.textContent = item.caption;
    els.lbCount.textContent = (lbIndex + 1) + ' / ' + galleryItems.length;
  }

  /* ── Products loader ──
   * Render the seed immediately, then override from the API when available. */
  function loadProducts() {
    // Deep link: /gallery?cat=Animals opens with that category tab active.
    try {
      var cat = new URLSearchParams(location.search).get('cat');
      if (cat) requestedFilter = cat;
    } catch (e) { /* very old browser — default to All */ }
    setCatalog(SEED_PRODUCTS);
    if (!window.fetch) return;
    fetch('/api/products', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && Array.isArray(data.products) && data.products.length) {
          setCatalog(data.products);
          renderRecentlyViewed();
          renderCart();
        }
      })
      .catch(function () { /* offline or no backend — seed already rendered */ });
  }

  /* ── Wire up events ── */
  function init() {
    loadProducts();
    loadOptions();

    // Modal controls
    els.modalDec.addEventListener('click', function () { setModalQty(-1); });
    els.modalInc.addEventListener('click', function () { setModalQty(1); });
    els.modalShare.addEventListener('click', shareProduct);
    els.modalAdd.addEventListener('click', function () {
      if (!modalItem) return;
      var options = collectModalOptions();
      if (options === null) return; // a required option is missing — stay open
      var added = modalQty;
      var item = modalItem;
      closeModal();
      addWithUndo(item, added, added + '× ' + item.name + ' added to cart', options);
    });
    els.modal.querySelectorAll('[data-modal-close]').forEach(function (el) {
      el.addEventListener('click', closeModal);
    });

    // Back-to-top
    els.toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Commission form: open triggers, close, submit
    document.querySelectorAll('[data-open-form]').forEach(function (el) {
      el.addEventListener('click', openForm);
    });
    els.formModal.querySelectorAll('[data-form-close]').forEach(function (el) {
      el.addEventListener('click', closeForm);
    });
    els.form.addEventListener('submit', handleFormSubmit);

    // Product category filters
    setupFilters();

    // Gallery lightbox
    setupLightbox();

    // Cart open/close
    els.cartToggle.addEventListener('click', openDrawer);
    els.cartClose.addEventListener('click', closeDrawer);
    els.cartClear.addEventListener('click', clearCart);

    // Overlay click closes whatever is open
    els.overlay.addEventListener('click', function () {
      closeDrawer();
      closeMenu();
    });

    // Keyboard: Escape closes overlays, arrows page the lightbox, Tab traps focus
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeDrawer(); closeMenu(); closeModal(); closeForm(); closeLightbox();
      } else if (els.lightbox.classList.contains('is-open')) {
        if (e.key === 'ArrowLeft') lbStep(-1);
        else if (e.key === 'ArrowRight') lbStep(1);
      }
      handleTrapTab(e);
    });

    // Hamburger
    els.hamburger.addEventListener('click', toggleMenu);

    // Smooth scroll: explicit data-scroll-to triggers
    document.querySelectorAll('[data-scroll-to]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (el.hasAttribute('data-close-cart')) closeDrawer();
        scrollToTarget(el.dataset.scrollTo);
      });
    });

    // Smooth scroll: in-page anchor links (nav, footer)
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var href = a.getAttribute('href');
        if (href.length < 2) return;
        if (document.querySelector(href)) {
          e.preventDefault();
          closeMenu();
          scrollToTarget(href);
        }
      });
    });

    // Checkout (placeholder until a real checkout flow exists)
    els.checkout.addEventListener('click', function () {
      if (cartCount() === 0) return;
      toast('💌', "Checkout isn't wired up yet — but your cart is saved!");
    });

    renderCart();
    renderRecentlyViewed();
    applySiteImages();
    setupReveal();
    setupScrollWatchers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
