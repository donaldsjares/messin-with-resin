'use strict';

/* Shipping estimate endpoint.
 *
 * POST { items: [{ id, qty }], destinationZIP } ->
 *   {
 *     ok: true,
 *     source: 'usps' | 'flat' | 'free' | 'none',
 *     subtotal: <number>,          // merchandise subtotal (server-computed)
 *     options: [ { service, label, price } ],  // price includes handling fee
 *     note: <string>
 *   }
 *
 * Item prices/weights are looked up server-side from the catalog (the client
 * only sends ids + quantities), so a tampered cart can't change the rate.
 * Live USPS rates are used when configured; any failure falls back to the
 * owner's flat rate so checkout never hard-fails.
 */

var store = require('../lib/store');
var site = require('../lib/site');
var usps = require('../lib/usps');

// Assumptions used until per-product weights are filled in / for packaging.
var DEFAULT_ITEM_OZ = 6;   // stand-in weight for a product with no weight set
var PACKAGING_OZ = 2;      // box + padding added to every shipment
var BOX = { length: 8, width: 6, height: 4 }; // default parcel size (inches)

function num(v) {
  var n = Number(v);
  return isFinite(n) ? n : 0;
}

function isZip(z) {
  return typeof z === 'string' && /^\d{5}$/.test(z.trim());
}

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

  var destinationZIP = String(body.destinationZIP || '').trim();
  if (!isZip(destinationZIP)) {
    return res.status(400).json({ error: 'Please enter a valid 5-digit ZIP code.' });
  }

  var items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) {
    return res.status(400).json({ error: 'Cart is empty.' });
  }

  var products, settings;
  try {
    products = await store.getProducts();
    settings = await site.getSite();
  } catch (e) {
    return res.status(500).json({ error: 'Could not load shipping data.' });
  }

  var byId = {};
  products.forEach(function (p) { byId[p.id] = p; });

  // Tally merchandise subtotal and total weight from the catalog.
  var subtotal = 0;
  var weightOz = PACKAGING_OZ;
  var matched = 0;
  items.forEach(function (it) {
    var p = byId[it && it.id];
    if (!p) return;
    var qty = Math.max(1, Math.floor(num(it.qty)) || 1);
    matched += qty;
    subtotal += num(p.price) * qty;
    var w = num(p.weight);
    weightOz += (w > 0 ? w : DEFAULT_ITEM_OZ) * qty;
  });

  if (!matched) {
    return res.status(400).json({ error: 'None of the cart items were found.' });
  }

  var handling = Math.max(0, num(settings.handlingFee));
  var threshold = num(settings.freeShipThreshold);
  var flat = num(settings.flatRate);
  var originZIP = String(settings.shipFromZIP || '').trim();

  function respond(payload) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(Object.assign({ ok: true, subtotal: subtotal }, payload));
  }

  // Free shipping wins outright when the subtotal clears the threshold.
  if (threshold > 0 && subtotal >= threshold) {
    return respond({
      source: 'free',
      options: [{ service: 'FREE', label: 'Free shipping', price: 0 }],
      note: 'Your order qualifies for free shipping.'
    });
  }

  function withHandling(options) {
    return options.map(function (o) {
      return { service: o.service, label: o.label, price: Math.round((o.price + handling) * 100) / 100 };
    });
  }

  function flatFallback(note) {
    if (flat > 0) {
      return respond({
        source: 'flat',
        options: withHandling([{ service: 'FLAT', label: 'Standard shipping', price: flat }]),
        note: note || 'Estimated flat-rate shipping.'
      });
    }
    return respond({
      source: 'none',
      options: [],
      note: 'Shipping will be calculated after you place your order.'
    });
  }

  // Live USPS rates require both credentials and a ship-from ZIP.
  if (!usps.isConfigured() || !isZip(originZIP)) {
    return flatFallback(
      !isZip(originZIP)
        ? 'Estimated shipping (ship-from ZIP not set).'
        : 'Estimated shipping.'
    );
  }

  try {
    var rates = await usps.getRates({
      originZIP: originZIP,
      destinationZIP: destinationZIP,
      weightLbs: Math.max(0.0625, weightOz / 16), // USPS wants pounds; floor at 1 oz
      length: BOX.length,
      width: BOX.width,
      height: BOX.height,
      mailingDate: new Date().toISOString().slice(0, 10)
    });
    return respond({
      source: 'usps',
      options: withHandling(rates),
      note: 'Live USPS rates.'
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('USPS rating failed:', e.message);
    return flatFallback('Estimated shipping (live rates unavailable).');
  }
};
