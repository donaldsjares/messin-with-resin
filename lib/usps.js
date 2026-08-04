'use strict';

/* Minimal USPS APIs client (developer.usps.com platform).
 *
 * Uses OAuth2 client-credentials to fetch a bearer token, then the Domestic
 * Prices 3.0 "base-rates/search" endpoint to price a parcel. No SDK — plain
 * fetch, matching the rest of this project.
 *
 * Configure via env:
 *   USPS_CLIENT_ID / USPS_CLIENT_SECRET  — your app's consumer key/secret.
 *   USPS_API_BASE (optional)             — defaults to https://apis.usps.com;
 *                                          set to https://apis-tem.usps.com to
 *                                          test against USPS's TEM sandbox.
 *
 * Everything degrades gracefully: isConfigured() lets callers fall back to a
 * flat rate when credentials are absent, and getRates() throws on any API
 * error so the caller can fall back too.
 */

function base() {
  return (process.env.USPS_API_BASE || 'https://apis.usps.com').replace(/\/+$/, '');
}
function clientId() { return process.env.USPS_CLIENT_ID || ''; }
function clientSecret() { return process.env.USPS_CLIENT_SECRET || ''; }

function isConfigured() {
  return !!(clientId() && clientSecret());
}

/* Cached token (survives across invocations on a warm serverless instance). */
var tokenCache = { value: '', expiresAt: 0 };

async function getToken() {
  var now = Date.now();
  if (tokenCache.value && now < tokenCache.expiresAt) return tokenCache.value;

  var res = await fetch(base() + '/oauth2/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId(),
      client_secret: clientSecret()
    })
  });
  if (!res.ok) {
    var text = await res.text().catch(function () { return ''; });
    throw new Error('USPS OAuth failed: ' + res.status + ' ' + text.slice(0, 200));
  }
  var data = await res.json();
  if (!data || !data.access_token) throw new Error('USPS OAuth returned no access_token.');

  var ttl = Number(data.expires_in) || 3600;
  // Refresh a minute early to avoid using a token mid-expiry.
  tokenCache = { value: data.access_token, expiresAt: now + (ttl - 60) * 1000 };
  return tokenCache.value;
}

/* Price a single parcel for one mail class. Returns { mailClass, price } or
 * throws. weightLbs is in pounds; dims in inches. */
async function priceOne(token, params, mailClass) {
  var body = {
    originZIPCode: params.originZIP,
    destinationZIPCode: params.destinationZIP,
    weight: params.weightLbs,
    length: params.length,
    width: params.width,
    height: params.height,
    mailClass: mailClass,
    processingCategory: 'MACHINABLE',
    rateIndicator: 'SP',            // Single Piece
    destinationEntryFacilityType: 'NONE',
    priceType: 'RETAIL',
    mailingDate: params.mailingDate
  };

  var res = await fetch(base() + '/prices/v3/base-rates/search', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    var text = await res.text().catch(function () { return ''; });
    throw new Error('USPS rate ' + mailClass + ' failed: ' + res.status + ' ' + text.slice(0, 200));
  }
  var data = await res.json();
  // v3 returns totalBasePrice; rates[] carries per-line prices as a fallback.
  var price = Number(data && data.totalBasePrice);
  if (!isFinite(price) && data && Array.isArray(data.rates) && data.rates.length) {
    price = Number(data.rates[0].price);
  }
  if (!isFinite(price)) throw new Error('USPS rate ' + mailClass + ' returned no price.');
  return { mailClass: mailClass, price: price };
}

var SERVICE_LABELS = {
  USPS_GROUND_ADVANTAGE: 'USPS Ground Advantage',
  PRIORITY_MAIL: 'USPS Priority Mail',
  PRIORITY_MAIL_EXPRESS: 'USPS Priority Mail Express'
};

/* Fetch rates for the given mail classes. Rejects if OAuth fails; individual
 * mail classes that error are skipped. Resolves to a sorted array of
 * { service, label, price }. */
async function getRates(params) {
  var classes = params.mailClasses && params.mailClasses.length
    ? params.mailClasses
    : ['USPS_GROUND_ADVANTAGE', 'PRIORITY_MAIL'];

  var token = await getToken();

  var results = [];
  for (var i = 0; i < classes.length; i++) {
    try {
      var r = await priceOne(token, params, classes[i]);
      results.push({
        service: r.mailClass,
        label: SERVICE_LABELS[r.mailClass] || r.mailClass,
        price: r.price
      });
    } catch (e) {
      // Skip this class; a partial result is still useful.
      if (typeof console !== 'undefined') console.warn(e.message);
    }
  }

  if (!results.length) throw new Error('USPS returned no rates for any mail class.');
  results.sort(function (a, b) { return a.price - b.price; });
  return results;
}

module.exports = { isConfigured: isConfigured, getRates: getRates };
