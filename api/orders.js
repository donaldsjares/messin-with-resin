'use strict';

/* Owner-only order list. GET /api/orders -> { orders: [...] } (newest first). */

var auth = require('../lib/auth');
var orders = require('../lib/orders');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!auth.isAuthed(req)) return res.status(401).json({ error: 'Unauthorized.' });

  try {
    var list = await orders.listOrders(200);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ orders: list });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load orders.' });
  }
};
