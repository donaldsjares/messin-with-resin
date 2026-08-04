'use strict';

/* Minimal Stripe client — plain fetch against the Stripe REST API, no SDK
 * (matching lib/usps.js / lib/store.js). Handles the two things this shop
 * needs: creating a hosted Checkout Session and verifying webhook signatures.
 *
 * Configure via env:
 *   STRIPE_SECRET_KEY      — sk_test_… or sk_live_…  (required to charge)
 *   STRIPE_WEBHOOK_SECRET  — whsec_…                 (required for webhooks)
 */

var crypto = require('crypto');

var API = 'https://api.stripe.com/v1';

function secretKey() { return process.env.STRIPE_SECRET_KEY || ''; }
function webhookSecret() { return process.env.STRIPE_WEBHOOK_SECRET || ''; }

function isConfigured() { return !!secretKey(); }

/* Flatten a nested object/array into Stripe's bracketed form-encoding, e.g.
 * { line_items: [ { quantity: 2 } ] } -> line_items[0][quantity]=2 */
function encode(params) {
  var out = new URLSearchParams();
  function walk(prefix, value) {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach(function (v, i) { walk(prefix + '[' + i + ']', v); });
    } else if (typeof value === 'object') {
      Object.keys(value).forEach(function (k) {
        walk(prefix ? prefix + '[' + k + ']' : k, value[k]);
      });
    } else {
      out.append(prefix, String(value));
    }
  }
  walk('', params);
  return out.toString();
}

async function stripePost(path, params) {
  var res = await fetch(API + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + secretKey(),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: encode(params)
  });
  var data = await res.json().catch(function () { return null; });
  if (!res.ok) {
    var msg = data && data.error && data.error.message ? data.error.message : ('Stripe error ' + res.status);
    var err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

function createCheckoutSession(params) {
  return stripePost('/checkout/sessions', params);
}

function retrieveSession(id) {
  return fetch(API + '/checkout/sessions/' + encodeURIComponent(id), {
    headers: { Authorization: 'Bearer ' + secretKey() }
  }).then(function (r) { return r.json(); });
}

/* Verify a Stripe webhook signature (the "v1" scheme from the Stripe-Signature
 * header). rawBody must be the exact bytes Stripe sent — not a re-serialized
 * object. Returns the parsed event, or throws. */
function constructEvent(rawBody, sigHeader, toleranceSec) {
  var secret = webhookSecret();
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set.');
  if (!sigHeader) throw new Error('Missing Stripe-Signature header.');

  var parts = {};
  String(sigHeader).split(',').forEach(function (kv) {
    var i = kv.indexOf('=');
    if (i !== -1) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  });
  var timestamp = parts.t;
  var expected = parts.v1;
  if (!timestamp || !expected) throw new Error('Malformed Stripe-Signature header.');

  var payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  var signed = timestamp + '.' + payload;
  var digest = crypto.createHmac('sha256', secret).update(signed, 'utf8').digest('hex');

  var a = Buffer.from(digest);
  var b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('Signature verification failed.');
  }

  var tol = toleranceSec || 300;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > tol) {
    throw new Error('Timestamp outside tolerance.');
  }

  return JSON.parse(payload);
}

module.exports = {
  isConfigured: isConfigured,
  createCheckoutSession: createCheckoutSession,
  retrieveSession: retrieveSession,
  constructEvent: constructEvent,
  // exported for tests
  _encode: encode
};
