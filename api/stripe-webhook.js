'use strict';

/* Stripe webhook. Confirms payment out-of-band so an order is only marked paid
 * by Stripe itself (not by a client hitting the success URL).
 *
 * Body parsing is disabled so the raw bytes are available for signature
 * verification — Stripe signs the exact payload it sent.
 *
 * Set STRIPE_WEBHOOK_SECRET and point a Stripe webhook endpoint at
 * /api/stripe-webhook for events: checkout.session.completed,
 * checkout.session.expired.
 */

var stripe = require('../lib/stripe');
var orders = require('../lib/orders');

module.exports.config = { api: { bodyParser: false } };

function readRaw(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () { resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

function customerFrom(session) {
  var cd = session.customer_details || {};
  var ship = session.shipping_details || session.shipping || {};
  return {
    name: cd.name || ship.name || '',
    email: cd.email || '',
    phone: cd.phone || '',
    address: ship.address || cd.address || null
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  var event;
  try {
    var raw = await readRaw(req);
    event = stripe.constructEvent(raw, req.headers['stripe-signature']);
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('Webhook verify failed:', e.message);
    return res.status(400).json({ error: 'Invalid signature.' });
  }

  try {
    var session = event.data && event.data.object;
    var orderId = session && (session.client_reference_id || (session.metadata && session.metadata.order_id));

    if (event.type === 'checkout.session.completed' && orderId) {
      var patch = {
        status: 'paid',
        paidAt: new Date().toISOString(),
        stripeSessionId: session.id,
        stripePaymentIntent: session.payment_intent || null,
        amountTotal: typeof session.amount_total === 'number' ? session.amount_total / 100 : null,
        customer: customerFrom(session)
      };
      var updated = await orders.updateOrder(orderId, patch);
      if (!updated) {
        // Order record was lost before payment — reconstruct a minimal one.
        await orders.createOrder(Object.assign({
          id: orderId,
          createdAt: new Date().toISOString(),
          currency: session.currency || 'usd',
          items: [],
          total: patch.amountTotal
        }, patch));
      }
    } else if (event.type === 'checkout.session.expired' && orderId) {
      await orders.updateOrder(orderId, { status: 'expired' });
    }
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('Webhook handling failed:', e.message);
    // Still 200 so Stripe doesn't retry forever on a persistent bug.
  }

  return res.status(200).json({ received: true });
};
