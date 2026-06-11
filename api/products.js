'use strict';

var store = require('../lib/store');
var auth = require('../lib/auth');
var products = require('../lib/products');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      var list = await store.getProducts();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ products: list });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to load products.' });
    }
  }

  if (req.method === 'PUT') {
    if (!auth.isAuthed(req)) return res.status(401).json({ error: 'Unauthorized.' });

    var body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = null; }
    }
    if (!body || !Array.isArray(body.products)) {
      return res.status(400).json({ error: 'Expected a JSON body of { "products": [ ... ] }.' });
    }

    var clean;
    try {
      clean = products.normalize(body.products);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    try {
      await store.saveProducts(clean);
      return res.status(200).json({ products: clean });
    } catch (e) {
      if (e.code === 'NO_STORAGE') return res.status(503).json({ error: e.message });
      return res.status(500).json({ error: 'Failed to save products.' });
    }
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed.' });
};
