/* Owner admin — login + product CRUD against the /api endpoints. */
(function () {
  'use strict';

  var products = [];

  var el = {
    loading: document.getElementById('ad-loading'),
    notConfigured: document.getElementById('ad-notconfigured'),
    login: document.getElementById('ad-login'),
    loginForm: document.getElementById('ad-login-form'),
    loginErr: document.getElementById('ad-login-err'),
    loginBtn: document.getElementById('ad-login-btn'),
    password: document.getElementById('ad-password'),
    editor: document.getElementById('ad-editor'),
    list: document.getElementById('ad-list'),
    add: document.getElementById('ad-add'),
    save: document.getElementById('ad-save'),
    status: document.getElementById('ad-status'),
    logout: document.getElementById('ad-logout'),
    template: document.getElementById('ad-prod-template')
  };

  function show(section) {
    [el.loading, el.notConfigured, el.login, el.editor].forEach(function (s) { s.hidden = true; });
    section.hidden = false;
    el.logout.hidden = section !== el.editor;
  }

  function setStatus(msg, kind) {
    el.status.textContent = msg || '';
    el.status.className = 'ad-status' + (kind ? ' is-' + kind : '');
  }

  /* ── API helpers ── */
  function api(path, options) {
    return fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } }, options || {}));
  }

  /* ── Boot ── */
  function boot() {
    api('/api/auth').then(function (r) { return r.json(); }).then(function (s) {
      if (!s.configured) { show(el.notConfigured); return; }
      if (s.authed) { loadEditor(); } else { show(el.login); el.password.focus(); }
    }).catch(function () {
      show(el.notConfigured);
    });
  }

  /* ── Login ── */
  el.loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    el.loginErr.textContent = '';
    el.loginBtn.disabled = true;
    api('/api/auth', { method: 'POST', body: JSON.stringify({ password: el.password.value }) })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        el.loginBtn.disabled = false;
        if (res.ok && res.body.authed) { el.password.value = ''; loadEditor(); }
        else { el.loginErr.textContent = res.body.error || 'Login failed.'; }
      })
      .catch(function () { el.loginBtn.disabled = false; el.loginErr.textContent = 'Network error.'; });
  });

  el.logout.addEventListener('click', function () {
    api('/api/auth', { method: 'DELETE' }).then(function () { show(el.login); el.password.focus(); });
  });

  /* ── Editor ── */
  function loadEditor() {
    show(el.editor);
    setStatus('Loading products…', 'info');
    api('/api/products').then(function (r) { return r.json(); }).then(function (data) {
      products = (data.products || []).map(clone);
      render();
      setStatus('');
    }).catch(function () { setStatus('Could not load products.', 'err'); });
  }

  function clone(p) {
    return {
      id: p.id, name: p.name, category: p.category || '', price: p.price,
      emoji: p.emoji || '🎨', description: p.description || '',
      bg: p.bg || 'linear-gradient(135deg,#fce7f3,#ede9fe)',
      badge: p.badge && p.badge.type ? { type: p.badge.type, label: p.badge.label || '' } : null
    };
  }

  function render() {
    el.list.innerHTML = '';
    if (!products.length) {
      var empty = document.createElement('div');
      empty.className = 'ad-empty';
      empty.textContent = 'No products yet — click “Add product” to create one.';
      el.list.appendChild(empty);
      return;
    }
    products.forEach(function (p, i) { el.list.appendChild(buildCard(p, i)); });
  }

  function buildCard(p, index) {
    var node = el.template.content.firstElementChild.cloneNode(true);
    var swatch = node.querySelector('[data-swatch]');

    function field(name) { return node.querySelector('[data-field="' + name + '"]'); }
    field('name').value = p.name || '';
    field('category').value = p.category || '';
    field('price').value = (p.price != null ? p.price : '');
    field('emoji').value = p.emoji || '';
    field('description').value = p.description || '';
    field('bg').value = p.bg || '';
    field('badgeType').value = p.badge ? p.badge.type : '';
    field('badgeLabel').value = p.badge ? p.badge.label : '';

    function paintSwatch() {
      swatch.style.background = field('bg').value || 'var(--cream-mid)';
      swatch.textContent = field('emoji').value || '🎨';
    }
    paintSwatch();
    field('bg').addEventListener('input', paintSwatch);
    field('emoji').addEventListener('input', paintSwatch);

    node.querySelector('[data-up]').addEventListener('click', function () { collect(); move(index, -1); });
    node.querySelector('[data-down]').addEventListener('click', function () { collect(); move(index, 1); });
    node.querySelector('[data-del]').addEventListener('click', function () {
      collect();
      products.splice(index, 1);
      render();
      setStatus('Product removed — remember to Save.', 'info');
    });

    return node;
  }

  /* Read the DOM inputs back into the products array (preserves edits across
   * reorder/add/delete and before save). */
  function collect() {
    var cards = el.list.querySelectorAll('.ad-prod');
    var next = [];
    cards.forEach(function (card, i) {
      function v(name) {
        var f = card.querySelector('[data-field="' + name + '"]');
        return f ? f.value : '';
      }
      var badgeType = v('badgeType');
      next.push({
        id: products[i] ? products[i].id : '',
        name: v('name').trim(),
        category: v('category').trim(),
        price: v('price'),
        emoji: v('emoji').trim(),
        description: v('description').trim(),
        bg: v('bg').trim(),
        badge: badgeType ? { type: badgeType, label: v('badgeLabel').trim() } : null
      });
    });
    products = next;
  }

  function move(index, delta) {
    var target = index + delta;
    if (target < 0 || target >= products.length) return;
    var tmp = products[index];
    products[index] = products[target];
    products[target] = tmp;
    render();
  }

  el.add.addEventListener('click', function () {
    collect();
    products.push({
      id: '', name: '', category: '', price: '', emoji: '🎨', description: '',
      bg: 'linear-gradient(135deg,#fce7f3,#ede9fe)', badge: null
    });
    render();
    var cards = el.list.querySelectorAll('.ad-prod');
    var last = cards[cards.length - 1];
    if (last) last.querySelector('[data-field="name"]').focus();
  });

  el.save.addEventListener('click', function () {
    collect();
    el.save.disabled = true;
    setStatus('Saving…', 'info');
    api('/api/products', { method: 'PUT', body: JSON.stringify({ products: products }) })
      .then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) {
        el.save.disabled = false;
        if (res.status === 200) {
          products = res.body.products.map(clone);
          render();
          setStatus('Saved! Changes are live.', 'ok');
        } else if (res.status === 401) {
          setStatus('Session expired — please log in again.', 'err');
          show(el.login); el.password.focus();
        } else {
          setStatus(res.body.error || 'Save failed.', 'err');
        }
      })
      .catch(function () { el.save.disabled = false; setStatus('Network error while saving.', 'err'); });
  });

  boot();
})();
