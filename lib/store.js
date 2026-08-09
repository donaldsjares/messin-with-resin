'use strict';

/* Product storage. In production, uses an Upstash Redis REST endpoint (as
 * provisioned by the Vercel KV / Upstash marketplace integration) via plain
 * fetch — no SDK. Locally (no KV env), falls back to data/products.json on
 * disk so `vercel dev` works. Seed ships in data/products.json. */

var fs = require('fs');
var path = require('path');
var seed = require('../data/products.json');

var KEY = 'mwr:products';

function kvUrl() {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
}
function kvToken() {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
}
function hasKV() {
  return !!(kvUrl() && kvToken());
}

async function kvGet() {
  var res = await fetch(kvUrl() + '/get/' + encodeURIComponent(KEY), {
    headers: { Authorization: 'Bearer ' + kvToken() }
  });
  if (!res.ok) throw new Error('KV get failed: ' + res.status);
  var data = await res.json();
  return data && data.result ? JSON.parse(data.result) : null;
}

async function kvSet(products) {
  var res = await fetch(kvUrl() + '/set/' + encodeURIComponent(KEY), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + kvToken(), 'Content-Type': 'text/plain' },
    body: JSON.stringify(products)
  });
  if (!res.ok) throw new Error('KV set failed: ' + res.status);
}

var FILE = path.join(process.cwd(), 'data', 'products.json');

function fileGet() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8')).products;
  } catch (e) {
    return null;
  }
}

function fileSet(products) {
  fs.writeFileSync(FILE, JSON.stringify({ products: products }, null, 2) + '\n');
}

/* A catalog saved to KV before a seed field existed (e.g. dimensions/weight)
 * shadows the seed forever, since KV wins over data/products.json. Backfill
 * those fields from the seed by product id so they reach the site without an
 * admin re-save. A value edited in the admin still wins once saved. */
function backfillFromSeed(list) {
  var byId = {};
  seed.products.forEach(function (p) { byId[p.id] = p; });
  return list.map(function (p) {
    var s = byId[p.id];
    if (!s) return p;
    var out = Object.assign({}, p);
    if (!out.dimensions && s.dimensions) out.dimensions = s.dimensions;
    if (!(Number(out.weight) > 0) && Number(s.weight) > 0) out.weight = s.weight;
    return out;
  });
}

async function getProducts() {
  if (hasKV()) {
    var stored = await kvGet();
    if (stored && Array.isArray(stored) && stored.length) return backfillFromSeed(stored);
    return seed.products;
  }
  var f = fileGet();
  return f && f.length ? backfillFromSeed(f) : seed.products;
}

async function saveProducts(products) {
  if (hasKV()) {
    await kvSet(products);
    return;
  }
  try {
    fileSet(products);
  } catch (e) {
    var err = new Error('No writable storage configured. Add the Vercel KV / Upstash integration and set KV_REST_API_URL and KV_REST_API_TOKEN.');
    err.code = 'NO_STORAGE';
    throw err;
  }
}

module.exports = { getProducts: getProducts, saveProducts: saveProducts, hasKV: hasKV };
