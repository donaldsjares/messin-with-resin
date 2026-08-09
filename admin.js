/* Owner admin — login + product CRUD against the /api endpoints. */
(function () {
  'use strict';

  var products = [];
  var optionGroups = [];

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
    importBtn: document.getElementById('ad-import'),
    status: document.getElementById('ad-status'),
    logout: document.getElementById('ad-logout'),
    template: document.getElementById('ad-prod-template'),
    siteSave: document.getElementById('ad-site-save'),
    siteStatus: document.getElementById('ad-site-status'),
    orders: document.getElementById('ad-orders'),
    ordersRefresh: document.getElementById('ad-orders-refresh'),
    ordersStatus: document.getElementById('ad-orders-status'),
    shipSave: document.getElementById('ad-ship-save'),
    shipStatus: document.getElementById('ad-ship-status'),
    optList: document.getElementById('ad-opt-list'),
    optAdd: document.getElementById('ad-opt-add'),
    optSave: document.getElementById('ad-opt-save'),
    optStatus: document.getElementById('ad-opt-status'),
    optTemplate: document.getElementById('ad-opt-template')
  };

  function setOptStatus(msg, kind) {
    el.optStatus.textContent = msg || '';
    el.optStatus.className = 'ad-status' + (kind ? ' is-' + kind : '');
  }

  function setSiteStatus(msg, kind) {
    el.siteStatus.textContent = msg || '';
    el.siteStatus.className = 'ad-status' + (kind ? ' is-' + kind : '');
  }

  function setShipStatus(msg, kind) {
    el.shipStatus.textContent = msg || '';
    el.shipStatus.className = 'ad-status' + (kind ? ' is-' + kind : '');
  }

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

  /* ── Orders ── */
  function setOrdersStatus(msg, kind) {
    el.ordersStatus.textContent = msg || '';
    el.ordersStatus.className = 'ad-status' + (kind ? ' is-' + kind : '');
  }

  function money(n) {
    return '$' + (Number(n) || 0).toFixed(2);
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  // Small DOM helper: create an element with an optional class and text.
  function elm(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var STATUS_LABELS = { paid: 'Paid', pending: 'Awaiting payment', failed: 'Failed', expired: 'Expired' };

  function buildOrderCard(o) {
    var card = elm('div', 'ad-order');
    card.setAttribute('data-status', o.status || 'pending');

    var head = elm('div', 'ad-order-head');
    var idWrap = elm('div', 'ad-order-id');
    idWrap.appendChild(elm('span', null, '#' + String(o.id || '').replace(/^ord_/, '').slice(0, 10)));
    var badge = elm('span', 'ad-order-badge ad-badge-' + (o.status || 'pending'), STATUS_LABELS[o.status] || o.status || '—');
    idWrap.appendChild(badge);
    if (o.fulfillment === 'shipped') idWrap.appendChild(elm('span', 'ad-order-badge ad-badge-shipped', 'Shipped'));
    head.appendChild(idWrap);
    head.appendChild(elm('div', 'ad-order-date', fmtDate(o.paidAt || o.createdAt)));
    card.appendChild(head);

    var body = elm('div', 'ad-order-body');

    // Items column
    var itemsCol = elm('div', 'ad-order-col');
    itemsCol.appendChild(elm('div', 'ad-order-h', 'Items'));
    var ul = elm('ul', 'ad-order-items');
    (o.items || []).forEach(function (it) {
      ul.appendChild(elm('li', null, (it.qty || 1) + ' × ' + (it.name || it.id) + ' — ' + money((it.price || 0) * (it.qty || 1))));
    });
    if (!(o.items || []).length) ul.appendChild(elm('li', 'ad-order-muted', 'No line items recorded'));
    itemsCol.appendChild(ul);
    body.appendChild(itemsCol);

    // Ship-to column
    var shipCol = elm('div', 'ad-order-col');
    shipCol.appendChild(elm('div', 'ad-order-h', 'Ship to'));
    var cust = o.customer || {};
    var addr = cust.address || {};
    var lines = [];
    if (cust.name) lines.push(cust.name);
    if (cust.email) lines.push(cust.email);
    if (cust.phone) lines.push(cust.phone);
    if (addr.line1) lines.push(addr.line1);
    if (addr.line2) lines.push(addr.line2);
    var cityLine = [addr.city, addr.state].filter(Boolean).join(', ');
    if (addr.postal_code) cityLine = (cityLine ? cityLine + ' ' : '') + addr.postal_code;
    if (cityLine) lines.push(cityLine);
    if (!lines.length) lines.push(o.destinationZIP ? 'ZIP ' + o.destinationZIP + ' — address pending' : 'No address yet');
    var custBox = elm('div', 'ad-order-cust');
    lines.forEach(function (ln, i) {
      if (i) custBox.appendChild(document.createElement('br'));
      custBox.appendChild(document.createTextNode(ln));
    });
    shipCol.appendChild(custBox);
    body.appendChild(shipCol);

    // Totals column
    var totalsCol = elm('div', 'ad-order-col ad-order-totals');
    function totalRow(label, value, cls) {
      var row = elm('div', cls || null);
      row.appendChild(elm('span', 'ad-order-tl', label));
      row.appendChild(elm('span', 'ad-order-tv', value));
      return row;
    }
    totalsCol.appendChild(totalRow('Subtotal', money(o.subtotal)));
    var shipLabel = 'Shipping' + (o.shipping && o.shipping.label ? ' (' + o.shipping.label + ')' : '');
    totalsCol.appendChild(totalRow(shipLabel, money(o.shipping && o.shipping.price)));
    totalsCol.appendChild(totalRow('Total', money(o.total), 'ad-order-total'));
    body.appendChild(totalsCol);

    card.appendChild(body);

    // Fulfillment controls (paid orders only).
    if (o.status === 'paid') card.appendChild(buildFulfillment(o));
    return card;
  }

  function buildFulfillment(o) {
    var foot = elm('div', 'ad-order-foot');
    if (o.fulfillment === 'shipped') {
      var info = elm('div', 'ad-order-shipped');
      info.appendChild(elm('span', 'ad-order-shipmark', '✓ Shipped'));
      if (o.shippedAt) info.appendChild(elm('span', 'ad-order-shipdate', fmtDate(o.shippedAt)));
      if (o.trackingNumber) {
        var a = elm('a', 'ad-order-track', o.trackingNumber);
        a.href = 'https://tools.usps.com/go/TrackConfirmAction?tLabels=' + encodeURIComponent(o.trackingNumber);
        a.target = '_blank';
        a.rel = 'noopener';
        info.appendChild(a);
      }
      foot.appendChild(info);
      var undo = elm('button', 'ad-btn-ghost', 'Mark unshipped');
      undo.type = 'button';
      undo.addEventListener('click', function () { setFulfillment(o.id, 'unshipped', ''); });
      foot.appendChild(undo);
    } else {
      var input = elm('input', 'ad-order-trackinput');
      input.type = 'text';
      input.placeholder = 'Tracking # (optional)';
      var btn = elm('button', 'ad-btn-soft', 'Mark shipped');
      btn.type = 'button';
      btn.addEventListener('click', function () { setFulfillment(o.id, 'shipped', input.value); });
      foot.appendChild(input);
      foot.appendChild(btn);
    }
    return foot;
  }

  function setFulfillment(id, fulfillment, tracking) {
    setOrdersStatus(fulfillment === 'shipped' ? 'Marking shipped…' : 'Updating…', 'info');
    api('/api/orders', { method: 'POST', body: JSON.stringify({ id: id, fulfillment: fulfillment, tracking: tracking }) })
      .then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) {
        if (res.status === 200) { loadOrders(); }
        else if (res.status === 401) { setOrdersStatus('Session expired — please log in again.', 'err'); show(el.login); el.password.focus(); }
        else setOrdersStatus((res.body && res.body.error) || 'Update failed.', 'err');
      })
      .catch(function () { setOrdersStatus('Network error updating order.', 'err'); });
  }

  function renderOrders(list) {
    el.orders.innerHTML = '';
    if (!list.length) {
      el.orders.appendChild(elm('div', 'ad-empty', 'No orders yet.'));
      return;
    }
    list.forEach(function (o) { el.orders.appendChild(buildOrderCard(o)); });
  }

  function loadOrders() {
    setOrdersStatus('Loading…', 'info');
    api('/api/orders').then(function (r) {
      return r.json().then(function (b) { return { status: r.status, body: b }; });
    }).then(function (res) {
      if (res.status === 401) { setOrdersStatus('Session expired — please log in again.', 'err'); show(el.login); el.password.focus(); return; }
      if (res.status !== 200) { setOrdersStatus((res.body && res.body.error) || 'Could not load orders.', 'err'); return; }
      renderOrders(res.body.orders || []);
      var count = (res.body.orders || []).length;
      setOrdersStatus(count ? count + (count === 1 ? ' order' : ' orders') : '');
    }).catch(function () { setOrdersStatus('Could not load orders.', 'err'); });
  }

  el.ordersRefresh.addEventListener('click', loadOrders);

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
    loadOrders();
    loadSite();
    loadOptions();
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
      emoji: p.emoji || '🎨', description: p.description || '', dimensions: p.dimensions || '', weight: (p.weight != null ? p.weight : ''), image: p.image || '',
      bg: p.bg || 'linear-gradient(135deg,#fce7f3,#ede9fe)',
      badge: p.badge && p.badge.type ? { type: p.badge.type, label: p.badge.label || '' } : null,
      featured: !!p.featured
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
    field('dimensions').value = p.dimensions || '';
    field('weight').value = (p.weight != null ? p.weight : '');
    field('bg').value = p.bg || '';
    field('badgeType').value = p.badge ? p.badge.type : '';
    field('badgeLabel').value = p.badge ? p.badge.label : '';
    field('image').value = p.image || '';
    field('featured').checked = !!p.featured;

    var fileInput = node.querySelector('[data-file]');
    var uploadWrap = node.querySelector('.ad-upload');
    var uploadLabel = node.querySelector('[data-upload-label]');
    var removeBtn = node.querySelector('[data-img-remove]');

    function paintSwatch() {
      var img = field('image').value;
      if (img) {
        swatch.style.background = "#fff url('" + img.replace(/'/g, '%27') + "') center/contain no-repeat";
        swatch.textContent = '';
        removeBtn.hidden = false;
        uploadLabel.textContent = 'Replace photo';
      } else {
        swatch.style.background = field('bg').value || 'var(--cream-mid)';
        swatch.textContent = field('emoji').value || '🎨';
        removeBtn.hidden = true;
        uploadLabel.textContent = 'Upload photo';
      }
    }
    paintSwatch();
    field('bg').addEventListener('input', paintSwatch);
    field('emoji').addEventListener('input', paintSwatch);

    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (file) uploadPhoto(file, field('image'), uploadWrap, uploadLabel, paintSwatch);
    });
    removeBtn.addEventListener('click', function () {
      field('image').value = '';
      paintSwatch();
    });

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
      var featuredEl = card.querySelector('[data-field="featured"]');
      next.push({
        id: products[i] ? products[i].id : '',
        name: v('name').trim(),
        category: v('category').trim(),
        price: v('price'),
        emoji: v('emoji').trim(),
        description: v('description').trim(),
        dimensions: v('dimensions').trim(),
        weight: v('weight').trim(),
        image: v('image').trim(),
        bg: v('bg').trim(),
        badge: badgeType ? { type: badgeType, label: v('badgeLabel').trim() } : null,
        featured: !!(featuredEl && featuredEl.checked)
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
      id: '', name: '', category: '', price: '', emoji: '🎨', description: '', image: '',
      bg: 'linear-gradient(135deg,#fce7f3,#ede9fe)', badge: null, featured: false
    });
    render();
    var cards = el.list.querySelectorAll('.ad-prod');
    var last = cards[cards.length - 1];
    if (last) last.querySelector('[data-field="name"]').focus();
  });

  function publish(successMsg) {
    el.save.disabled = true;
    setStatus('Saving…', 'info');
    return api('/api/products', { method: 'PUT', body: JSON.stringify({ products: products }) })
      .then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) {
        el.save.disabled = false;
        if (res.status === 200) {
          products = res.body.products.map(clone);
          render();
          setStatus(successMsg || 'Saved! Changes are live.', 'ok');
        } else if (res.status === 401) {
          setStatus('Session expired — please log in again.', 'err');
          show(el.login); el.password.focus();
        } else {
          setStatus(res.body.error || 'Save failed.', 'err');
        }
        return res;
      })
      .catch(function () { el.save.disabled = false; setStatus('Network error while saving.', 'err'); });
  }

  el.save.addEventListener('click', function () {
    collect();
    publish();
  });

  // One-click bulk import of the full catalog file, then publish it live.
  el.importBtn.addEventListener('click', function () {
    var ok = window.confirm('Replace the current product list with the full catalog (119 products) and publish it to the live site?\n\nPhotos on the current products will be removed — you can upload new ones afterward.');
    if (!ok) return;
    setStatus('Loading catalog…', 'info');
    fetch('/data/products.json', { headers: { 'Accept': 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then(function (data) {
        products = (data.products || []).map(clone);
        render();
        return publish('Imported ' + products.length + ' products — they’re live!');
      })
      .catch(function () { setStatus('Could not load the catalog file.', 'err'); });
  });

  /* ── Image upload ──
   * Downscale/compress in-browser, then POST to /api/upload (Vercel Blob).
   * Returns a Promise that resolves to the stored image URL. */
  function uploadImageFile(file) {
    if (file.size > 25 * 1024 * 1024) return Promise.reject(new Error('That image is very large — try one under 25MB.'));
    return resizeImage(file, 1280, 0.82).then(function (blob) {
      var form = new FormData();
      form.append('file', blob, 'photo.jpg');
      return fetch('/api/upload', { method: 'POST', body: form, credentials: 'same-origin' });
    }).then(function (r) {
      return r.json().then(function (b) { return { status: r.status, body: b }; });
    }).then(function (res) {
      if (res.status === 200 && res.body.url) return res.body.url;
      if (res.status === 401) { var e = new Error('Session expired — please log in again.'); e.code = 401; throw e; }
      throw new Error(res.body.error || 'Upload failed.');
    });
  }

  function uploadPhoto(file, imageInput, wrap, label, repaint) {
    wrap.classList.add('is-busy');
    var originalLabel = label.textContent;
    label.textContent = 'Uploading…';
    uploadImageFile(file).then(function (url) {
      imageInput.value = url;
      repaint();
      setStatus('Photo added — remember to Save.', 'info');
    }).catch(function (e) {
      if (e.code === 401) { setStatus(e.message, 'err'); show(el.login); el.password.focus(); }
      else { setStatus(e.message || 'Could not upload that image.', 'err'); }
    }).then(function () {
      wrap.classList.remove('is-busy');
      label.textContent = originalLabel;
    });
  }

  /* ── Site-section images (hero / about / commission) ── */
  function siteItems() {
    return Array.prototype.slice.call(document.querySelectorAll('.ad-site-item'));
  }

  function paintSiteItem(item) {
    var url = item.querySelector('[data-site-field]').value;
    var preview = item.querySelector('[data-site-preview]');
    var label = item.querySelector('[data-site-upload-label]');
    var removeBtn = item.querySelector('[data-site-remove]');
    if (url) {
      preview.style.backgroundImage = "url('" + url.replace(/'/g, '%27') + "')";
      preview.classList.add('has-image');
      label.textContent = 'Replace';
      removeBtn.hidden = false;
    } else {
      preview.style.backgroundImage = '';
      preview.classList.remove('has-image');
      label.textContent = 'Upload';
      removeBtn.hidden = true;
    }
  }

  function setupSite() {
    siteItems().forEach(function (item) {
      var field = item.querySelector('[data-site-field]');
      var fileInput = item.querySelector('[data-site-file]');
      var wrap = item.querySelector('.ad-upload');
      var label = item.querySelector('[data-site-upload-label]');
      var removeBtn = item.querySelector('[data-site-remove]');

      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!file) return;
        wrap.classList.add('is-busy');
        var orig = label.textContent;
        label.textContent = 'Uploading…';
        uploadImageFile(file).then(function (url) {
          field.value = url;
          paintSiteItem(item);
          setSiteStatus('Image added — click Save site images.', 'info');
        }).catch(function (e) {
          if (e.code === 401) { setSiteStatus(e.message, 'err'); show(el.login); el.password.focus(); }
          else { setSiteStatus(e.message || 'Could not upload that image.', 'err'); }
        }).then(function () {
          wrap.classList.remove('is-busy');
          label.textContent = field.value ? 'Replace' : orig;
        });
      });

      removeBtn.addEventListener('click', function () {
        field.value = '';
        paintSiteItem(item);
        setSiteStatus('Image cleared — click Save site images.', 'info');
      });
    });
  }

  function shipFields() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-ship-field]'));
  }

  function loadSite() {
    api('/api/site').then(function (r) { return r.json(); }).then(function (data) {
      siteItems().forEach(function (item) {
        var key = item.dataset.site;
        item.querySelector('[data-site-field]').value = (data && data[key]) || '';
        paintSiteItem(item);
      });
      shipFields().forEach(function (input) {
        input.value = (data && data[input.dataset.shipField]) || '';
      });
    }).catch(function () { /* ignore */ });
  }

  /* Site images and shipping settings share one /api/site object, and a save
   * replaces the whole thing — so every save sends both sets of fields to
   * avoid one section wiping the other. */
  function collectSitePayload() {
    var payload = {};
    siteItems().forEach(function (item) {
      payload[item.dataset.site] = item.querySelector('[data-site-field]').value.trim();
    });
    shipFields().forEach(function (input) {
      payload[input.dataset.shipField] = input.value.trim();
    });
    return payload;
  }

  function saveSite(btn, setStat, okMsg) {
    btn.disabled = true;
    setStat('Saving…', 'info');
    api('/api/site', { method: 'PUT', body: JSON.stringify(collectSitePayload()) })
      .then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (res.status === 200) setStat(okMsg, 'ok');
        else if (res.status === 401) { setStat('Session expired — please log in again.', 'err'); show(el.login); el.password.focus(); }
        else setStat(res.body.error || 'Save failed.', 'err');
      })
      .catch(function () { btn.disabled = false; setStat('Network error while saving.', 'err'); });
  }

  el.siteSave.addEventListener('click', function () {
    saveSite(el.siteSave, setSiteStatus, 'Saved! Section images are live.');
  });

  el.shipSave.addEventListener('click', function () {
    saveSite(el.shipSave, setShipStatus, 'Saved! Shipping settings updated.');
  });

  setupSite();

  /* ── Product customization options ── */
  function loadOptions() {
    setOptStatus('Loading…', 'info');
    api('/api/options').then(function (r) { return r.json(); }).then(function (data) {
      optionGroups = (data.options || []).map(cloneOption);
      renderOptions();
      setOptStatus('');
    }).catch(function () { setOptStatus('Could not load options.', 'err'); });
  }

  function cloneOption(g) {
    return {
      label: g.label || '',
      type: g.type === 'text' ? 'text' : 'select',
      required: !!g.required,
      choices: Array.isArray(g.choices) ? g.choices.slice() : []
    };
  }

  function renderOptions() {
    el.optList.innerHTML = '';
    if (!optionGroups.length) {
      var empty = document.createElement('div');
      empty.className = 'ad-empty';
      empty.textContent = 'No options yet — click “Add option” to create one.';
      el.optList.appendChild(empty);
      return;
    }
    optionGroups.forEach(function (g, i) { el.optList.appendChild(buildOptionCard(g, i)); });
  }

  function buildOptionCard(g, index) {
    var node = el.optTemplate.content.firstElementChild.cloneNode(true);
    function f(name) { return node.querySelector('[data-opt="' + name + '"]'); }

    f('label').value = g.label || '';
    f('type').value = g.type || 'select';
    f('required').checked = !!g.required;
    f('choices').value = (g.choices || []).join('\n');

    function paintType() { node.classList.toggle('is-text', f('type').value === 'text'); }
    paintType();
    f('type').addEventListener('change', paintType);

    node.querySelector('[data-opt-up]').addEventListener('click', function () { collectOptions(); moveOption(index, -1); });
    node.querySelector('[data-opt-down]').addEventListener('click', function () { collectOptions(); moveOption(index, 1); });
    node.querySelector('[data-opt-del]').addEventListener('click', function () {
      collectOptions();
      optionGroups.splice(index, 1);
      renderOptions();
      setOptStatus('Option removed — remember to Save.', 'info');
    });

    return node;
  }

  function collectOptions() {
    var cards = el.optList.querySelectorAll('.ad-opt');
    var next = [];
    cards.forEach(function (card) {
      function f(name) { return card.querySelector('[data-opt="' + name + '"]'); }
      var type = f('type').value === 'text' ? 'text' : 'select';
      var choices = f('choices').value.split('\n')
        .map(function (c) { return c.trim(); })
        .filter(function (c) { return c.length; });
      next.push({
        label: f('label').value.trim(),
        type: type,
        required: f('required').checked,
        choices: choices
      });
    });
    optionGroups = next;
  }

  function moveOption(index, delta) {
    var target = index + delta;
    if (target < 0 || target >= optionGroups.length) return;
    var tmp = optionGroups[index];
    optionGroups[index] = optionGroups[target];
    optionGroups[target] = tmp;
    renderOptions();
  }

  el.optAdd.addEventListener('click', function () {
    collectOptions();
    optionGroups.push({ label: '', type: 'select', required: true, choices: [] });
    renderOptions();
    var cards = el.optList.querySelectorAll('.ad-opt');
    var last = cards[cards.length - 1];
    if (last) last.querySelector('[data-opt="label"]').focus();
  });

  el.optSave.addEventListener('click', function () {
    collectOptions();
    el.optSave.disabled = true;
    setOptStatus('Saving…', 'info');
    api('/api/options', { method: 'PUT', body: JSON.stringify({ options: optionGroups }) })
      .then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) {
        el.optSave.disabled = false;
        if (res.status === 200) {
          optionGroups = (res.body.options || []).map(cloneOption);
          renderOptions();
          setOptStatus('Saved! Options are live.', 'ok');
        } else if (res.status === 401) {
          setOptStatus('Session expired — please log in again.', 'err');
          show(el.login); el.password.focus();
        } else {
          setOptStatus(res.body.error || 'Save failed.', 'err');
        }
      })
      .catch(function () { el.optSave.disabled = false; setOptStatus('Network error while saving.', 'err'); });
  });

  function resizeImage(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.width, h = img.height;
        if (w > h && w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
        else if (h >= w && h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(function (blob) {
          blob ? resolve(blob) : reject(new Error('encode failed'));
        }, 'image/jpeg', quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('load failed')); };
      img.src = url;
    });
  }

  boot();
})();
