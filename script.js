/* Messin With Resin — front-end interactivity
 * Cart (with localStorage), slide-in cart drawer, smooth-scroll nav,
 * mobile menu, and toast notifications. No dependencies. */
(function () {
  'use strict';

  var STORAGE_KEY = 'mwr-cart-v1';
  var FREE_SHIPPING_THRESHOLD = 50;

  /* ── State ── */
  var cart = loadCart(); // { id: { name, price, emoji, qty } }

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
    checkout: document.getElementById('mr-cart-checkout'),
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
    modalAdd: document.getElementById('mr-modal-add')
  };

  var modalItem = null;
  var modalQty = 1;

  /* ── Cart operations ── */
  function addToCart(item, qty) {
    qty = qty || 1;
    if (cart[item.id]) {
      cart[item.id].qty += qty;
    } else {
      cart[item.id] = { name: item.name, price: item.price, emoji: item.emoji, qty: qty };
    }
    saveCart();
    renderCart();
    bumpCartIcon();
  }

  function changeQty(id, delta) {
    if (!cart[id]) return;
    cart[id].qty += delta;
    if (cart[id].qty <= 0) delete cart[id];
    saveCart();
    renderCart();
  }

  function removeItem(id) {
    delete cart[id];
    saveCart();
    renderCart();
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

    var totalEl = document.querySelector('[data-cart-total]');
    if (totalEl) totalEl.textContent = formatPrice(cartTotal());
  }

  function renderItem(id, item) {
    var row = document.createElement('div');
    row.className = 'mr-cart-item';
    row.innerHTML =
      '<div class="mr-cart-item-img">' + item.emoji + '</div>' +
      '<div class="mr-cart-item-mid">' +
        '<div class="mr-cart-item-name">' + escapeHtml(item.name) + '</div>' +
        '<div class="mr-cart-item-price">' + formatPrice(item.price) + ' each</div>' +
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
    d.textContent = s;
    return d.innerHTML;
  }

  /* ── Drawer + overlay ── */
  function openDrawer() {
    closeMenu();
    showOverlay();
    els.drawer.classList.add('is-open');
    els.drawer.setAttribute('aria-hidden', 'false');
  }

  function closeDrawer() {
    els.drawer.classList.remove('is-open');
    els.drawer.setAttribute('aria-hidden', 'true');
    maybeHideOverlay();
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
    }
  }

  function closeMenu() {
    els.navLinks.classList.remove('is-open');
    els.hamburger.classList.remove('is-open');
    els.hamburger.setAttribute('aria-expanded', 'false');
    maybeHideOverlay();
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
  function toast(emoji, message) {
    var t = document.createElement('div');
    t.className = 'mr-toast';
    t.innerHTML = '<span class="mr-toast-emoji">' + emoji + '</span><span>' + escapeHtml(message) + '</span>';
    els.toasts.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('is-visible'); });
    setTimeout(function () {
      t.classList.remove('is-visible');
      setTimeout(function () { t.remove(); }, 280);
    }, 2400);
  }

  function bumpCartIcon() {
    els.cartToggle.classList.remove('is-bump');
    void els.cartToggle.offsetWidth; // restart animation
    els.cartToggle.classList.add('is-bump');
  }

  /* ── Quick-view modal ── */
  function openModal(card) {
    var btn = card.querySelector('.mr-prod-add');
    modalItem = {
      id: btn.dataset.name,
      name: btn.dataset.name,
      price: parseFloat(btn.dataset.price),
      emoji: btn.dataset.emoji || '🎨'
    };
    modalQty = 1;

    els.modalMedia.textContent = modalItem.emoji;
    els.modalCat.textContent = text(card, '.mr-prod-cat');
    els.modalName.textContent = modalItem.name;
    els.modalPrice.textContent = 'From ' + formatPrice(modalItem.price);
    els.modalDesc.textContent = text(card, '.mr-prod-desc');
    els.modalQty.textContent = modalQty;

    els.modal.classList.add('is-open');
    els.modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    els.modal.classList.remove('is-open');
    els.modal.setAttribute('aria-hidden', 'true');
    modalItem = null;
  }

  function setModalQty(delta) {
    modalQty = Math.max(1, modalQty + delta);
    els.modalQty.textContent = modalQty;
  }

  function text(scope, sel) {
    var el = scope.querySelector(sel);
    return el ? el.textContent.trim() : '';
  }

  /* ── Scroll reveal ── */
  function setupReveal() {
    var targets = document.querySelectorAll(
      '.mr-prod-card, .mr-review-card, .mr-feat, .mr-step, .mr-section-header, ' +
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
    var sections = ['#shop', '#commissions', '#about', '#contact']
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

  /* ── Wire up events ── */
  function init() {
    // Add-to-cart buttons (stop propagation so the card's quick-view doesn't open)
    document.querySelectorAll('.mr-prod-add').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var item = {
          id: btn.dataset.name,
          name: btn.dataset.name,
          price: parseFloat(btn.dataset.price),
          emoji: btn.dataset.emoji || '🎨'
        };
        addToCart(item);
        toast(item.emoji, item.name + ' added to cart');
      });
    });

    // Quick-view: clicking anywhere else on a card opens the modal
    document.querySelectorAll('.mr-prod-card').forEach(function (card) {
      card.addEventListener('click', function () { openModal(card); });
    });

    // Modal controls
    els.modalDec.addEventListener('click', function () { setModalQty(-1); });
    els.modalInc.addEventListener('click', function () { setModalQty(1); });
    els.modalAdd.addEventListener('click', function () {
      if (!modalItem) return;
      var added = modalQty;
      var item = modalItem;
      addToCart(item, added);
      closeModal();
      toast(item.emoji, added + '× ' + item.name + ' added to cart');
    });
    els.modal.querySelectorAll('[data-modal-close]').forEach(function (el) {
      el.addEventListener('click', closeModal);
    });

    // Back-to-top
    els.toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Cart open/close
    els.cartToggle.addEventListener('click', openDrawer);
    els.cartClose.addEventListener('click', closeDrawer);

    // Overlay click closes whatever is open
    els.overlay.addEventListener('click', function () {
      closeDrawer();
      closeMenu();
    });

    // Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeDrawer(); closeMenu(); closeModal(); }
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
    setupReveal();
    setupScrollWatchers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
