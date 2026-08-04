'use strict';

/* Shared shipping-quote logic used by both /api/shipping (estimate) and
 * /api/checkout (authoritative charge). Prices and weights are always looked
 * up from the catalog server-side, so a tampered cart can't change the rate.
 *
 * computeQuote({ items, destinationZIP }) resolves to:
 *   { subtotal, lineItems:[{id,name,price,qty}], options:[{service,label,price}],
 *     source: 'usps'|'flat'|'free'|'none', note }
 * or rejects with an Error carrying .status (400/500) for the caller to map. */

var store = require('./store');
var site = require('./site');
var usps = require('./usps');

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

function fail(status, message) {
  var e = new Error(message);
  e.status = status;
  return e;
}

async function computeQuote(input) {
  input = input || {};
  var destinationZIP = String(input.destinationZIP || '').trim();
  if (!isZip(destinationZIP)) throw fail(400, 'Please enter a valid 5-digit ZIP code.');

  var items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) throw fail(400, 'Cart is empty.');

  var products, settings;
  try {
    products = await store.getProducts();
    settings = await site.getSite();
  } catch (e) {
    throw fail(500, 'Could not load shipping data.');
  }

  var byId = {};
  products.forEach(function (p) { byId[p.id] = p; });

  var subtotal = 0;
  var weightOz = PACKAGING_OZ;
  var lineItems = [];
  items.forEach(function (it) {
    var p = byId[it && it.id];
    if (!p) return;
    var qty = Math.max(1, Math.floor(num(it.qty)) || 1);
    subtotal += num(p.price) * qty;
    weightOz += (num(p.weight) > 0 ? num(p.weight) : DEFAULT_ITEM_OZ) * qty;
    lineItems.push({ id: p.id, name: p.name, price: num(p.price), qty: qty });
  });

  if (!lineItems.length) throw fail(400, 'None of the cart items were found.');

  var handling = Math.max(0, num(settings.handlingFee));
  var threshold = num(settings.freeShipThreshold);
  var flat = num(settings.flatRate);
  var originZIP = String(settings.shipFromZIP || '').trim();

  var base = { subtotal: subtotal, lineItems: lineItems };

  // Free shipping wins outright when the subtotal clears the threshold.
  if (threshold > 0 && subtotal >= threshold) {
    return Object.assign(base, {
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
      return Object.assign(base, {
        source: 'flat',
        options: withHandling([{ service: 'FLAT', label: 'Standard shipping', price: flat }]),
        note: note || 'Estimated flat-rate shipping.'
      });
    }
    return Object.assign(base, {
      source: 'none',
      options: [],
      note: 'Shipping will be calculated after you place your order.'
    });
  }

  if (!usps.isConfigured() || !isZip(originZIP)) {
    return flatFallback(!isZip(originZIP) ? 'Estimated shipping (ship-from ZIP not set).' : 'Estimated shipping.');
  }

  try {
    var rates = await usps.getRates({
      originZIP: originZIP,
      destinationZIP: destinationZIP,
      weightLbs: Math.max(0.0625, weightOz / 16),
      length: BOX.length,
      width: BOX.width,
      height: BOX.height,
      mailingDate: new Date().toISOString().slice(0, 10)
    });
    return Object.assign(base, {
      source: 'usps',
      options: withHandling(rates),
      note: 'Live USPS rates.'
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('USPS rating failed:', e.message);
    return flatFallback('Estimated shipping (live rates unavailable).');
  }
}

module.exports = { computeQuote: computeQuote };
