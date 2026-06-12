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
    importBtn: document.getElementById('ad-import'),
    status: document.getElementById('ad-status'),
    logout: document.getElementById('ad-logout'),
    template: document.getElementById('ad-prod-template'),
    siteSave: document.getElementById('ad-site-save'),
    siteStatus: document.getElementById('ad-site-status')
  };

  function setSiteStatus(msg, kind) {
    el.siteStatus.textContent = msg || '';
    el.siteStatus.className = 'ad-status' + (kind ? ' is-' + kind : '');
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
    loadSite();
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
      emoji: p.emoji || '🎨', description: p.description || '', image: p.image || '',
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
        swatch.style.background = "#fff url('" + img.replace(/'/g, '%27') + "') center/cover no-repeat";
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

  function loadSite() {
    api('/api/site').then(function (r) { return r.json(); }).then(function (data) {
      siteItems().forEach(function (item) {
        var key = item.dataset.site;
        item.querySelector('[data-site-field]').value = (data && data[key]) || '';
        paintSiteItem(item);
      });
    }).catch(function () { /* ignore */ });
  }

  el.siteSave.addEventListener('click', function () {
    var payload = {};
    siteItems().forEach(function (item) {
      payload[item.dataset.site] = item.querySelector('[data-site-field]').value.trim();
    });
    el.siteSave.disabled = true;
    setSiteStatus('Saving…', 'info');
    api('/api/site', { method: 'PUT', body: JSON.stringify(payload) })
      .then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) {
        el.siteSave.disabled = false;
        if (res.status === 200) setSiteStatus('Saved! Section images are live.', 'ok');
        else if (res.status === 401) { setSiteStatus('Session expired — please log in again.', 'err'); show(el.login); el.password.focus(); }
        else setSiteStatus(res.body.error || 'Save failed.', 'err');
      })
      .catch(function () { el.siteSave.disabled = false; setSiteStatus('Network error while saving.', 'err'); });
  });

  setupSite();

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
