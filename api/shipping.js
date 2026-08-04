'use strict';

/* Shipping estimate endpoint.
 *
 * POST { items: [{ id, qty }], destinationZIP } ->
 *   { ok, source, subtotal, options: [ { service, label, price } ], note }
 *
 * All rating logic lives in lib/shipping.js (shared with /api/checkout).
 */

var shipping = require('../lib/shipping');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  var body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Expected a JSON body.' });
  }

  try {
    var quote = await shipping.computeQuote({ items: body.items, destinationZIP: body.destinationZIP });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      source: quote.source,
      subtotal: quote.subtotal,
      options: quote.options,
      note: quote.note
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'Could not estimate shipping.' });
  }
};
