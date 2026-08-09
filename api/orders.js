'use strict';

/* Orders API.
 *   GET  /api/orders                      (owner) -> { orders: [...] } newest first
 *   POST /api/orders { id, fulfillment, tracking }  (owner) -> { order }
 *        fulfillment: 'shipped' | 'unshipped'. Marking shipped stores the
 *        tracking number + timestamp; unshipping clears them. Fulfillment is
 *        tracked separately from payment status (a paid order can be unshipped
 *        or shipped). */

var auth = require('../lib/auth');
var orders = require('../lib/orders');

module.exports = async function handler(req, res) {
  if (!auth.isAuthed(req)) return res.status(401).json({ error: 'Unauthorized.' });

  if (req.method === 'GET') {
    try {
      var list = await orders.listOrders(200);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ orders: list });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to load orders.' });
    }
  }

  if (req.method === 'POST') {
    var body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = null; }
    }
    if (!body || typeof body !== 'object' || !body.id) {
      return res.status(400).json({ error: 'Expected { id, fulfillment }.' });
    }
    if (body.fulfillment !== 'shipped' && body.fulfillment !== 'unshipped') {
      return res.status(400).json({ error: 'fulfillment must be "shipped" or "unshipped".' });
    }

    var patch;
    if (body.fulfillment === 'shipped') {
      patch = {
        fulfillment: 'shipped',
        trackingNumber: body.tracking ? String(body.tracking).trim() : '',
        shippedAt: new Date().toISOString()
      };
    } else {
      patch = { fulfillment: 'unshipped', trackingNumber: '', shippedAt: null };
    }

    try {
      var updated = await orders.updateOrder(String(body.id), patch);
      if (!updated) return res.status(404).json({ error: 'Order not found.' });
      return res.status(200).json({ order: updated });
    } catch (e) {
      if (e.code === 'NO_STORAGE') return res.status(503).json({ error: e.message });
      return res.status(500).json({ error: 'Failed to update order.' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
};
