'use strict';

/* Checkout endpoint. Creates a Stripe hosted Checkout Session for the cart.
 *
 * POST { items: [{ id, qty }], destinationZIP, service } -> { url }
 *
 * Merchandise prices and the shipping charge are recomputed server-side via
 * lib/shipping.js — the client's chosen `service` only selects among the
 * server's own options, so a tampered cart or price can't get through. A
 * pending order is recorded before the session so the webhook has something
 * to mark paid.
 */

var crypto = require('crypto');
var shipping = require('../lib/shipping');
var stripe = require('../lib/stripe');
var orders = require('../lib/orders');

function cents(n) { return Math.round(Number(n) * 100); }

function baseUrl(req) {
  var proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  var host = req.headers['x-forwarded-host'] || req.headers.host;
  return proto + '://' + host;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!stripe.isConfigured()) {
    return res.status(503).json({ error: 'Checkout is not set up yet.' });
  }

  var body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Expected a JSON body.' });
  }

  // Authoritative quote (validates ZIP/items, recomputes prices + shipping).
  var quote;
  try {
    quote = await shipping.computeQuote({ items: body.items, destinationZIP: body.destinationZIP });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'Could not price this order.' });
  }

  if (!quote.options.length) {
    return res.status(409).json({ error: 'Shipping is unavailable for this order — please contact us.' });
  }

  // Pick the requested service among the server's options; default to cheapest.
  var chosen = null;
  if (body.service) {
    quote.options.forEach(function (o) { if (o.service === body.service) chosen = o; });
  }
  if (!chosen) chosen = quote.options[0];

  var id = 'ord_' + crypto.randomBytes(9).toString('hex');
  var total = Math.round((quote.subtotal + chosen.price) * 100) / 100;

  var order = {
    id: id,
    createdAt: new Date().toISOString(),
    status: 'pending',
    currency: 'usd',
    items: quote.lineItems,
    subtotal: quote.subtotal,
    shipping: { service: chosen.service, label: chosen.label, price: chosen.price },
    total: total,
    destinationZIP: String(body.destinationZIP).trim()
  };

  try {
    await orders.createOrder(order);
  } catch (e) {
    // Non-fatal: proceed to payment even if the pending record didn't persist.
    if (typeof console !== 'undefined') console.warn('Order pre-save failed:', e.message);
  }

  var lineItems = quote.lineItems.map(function (li) {
    return {
      quantity: li.qty,
      price_data: {
        currency: 'usd',
        unit_amount: cents(li.price),
        product_data: { name: li.name }
      }
    };
  });

  var base = baseUrl(req);
  var params = {
    mode: 'payment',
    line_items: lineItems,
    shipping_address_collection: { allowed_countries: ['US'] },
    phone_number_collection: { enabled: true },
    shipping_options: [{
      shipping_rate_data: {
        type: 'fixed_amount',
        display_name: chosen.label,
        fixed_amount: { amount: cents(chosen.price), currency: 'usd' }
      }
    }],
    client_reference_id: id,
    metadata: { order_id: id },
    success_url: base + '/?checkout=success&order=' + id + '&session_id={CHECKOUT_SESSION_ID}',
    cancel_url: base + '/?checkout=cancel'
  };

  try {
    var session = await stripe.createCheckoutSession(params);
    await orders.updateOrder(id, { stripeSessionId: session.id }).catch(function () {});
    return res.status(200).json({ url: session.url });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('Stripe session failed:', e.message);
    await orders.updateOrder(id, { status: 'failed' }).catch(function () {});
    return res.status(502).json({ error: 'Could not start checkout. Please try again.' });
  }
};
