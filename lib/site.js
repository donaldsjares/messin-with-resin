'use strict';

/* Editable site-section images (hero, artist/about photo, commission
 * showcase). Stored in Upstash Redis (KV) in production; falls back to
 * data/site.json on disk for local dev. Mirrors lib/store.js. */

var fs = require('fs');
var path = require('path');
var seed = require('../data/site.json');

var KEY = 'mwr:site';
var FIELDS = ['heroImage', 'aboutImage', 'commissionImage'];

function kvUrl() {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
}
function kvToken() {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
}
function hasKV() {
  return !!(kvUrl() && kvToken());
}

function normalize(obj) {
  obj = obj || {};
  var out = {};
  FIELDS.forEach(function (f) {
    out[f] = obj[f] ? String(obj[f]).trim() : '';
  });
  return out;
}

async function kvGet() {
  var res = await fetch(kvUrl() + '/get/' + encodeURIComponent(KEY), {
    headers: { Authorization: 'Bearer ' + kvToken() }
  });
  if (!res.ok) throw new Error('KV get failed: ' + res.status);
  var data = await res.json();
  return data && data.result ? JSON.parse(data.result) : null;
}

async function kvSet(obj) {
  var res = await fetch(kvUrl() + '/set/' + encodeURIComponent(KEY), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + kvToken(), 'Content-Type': 'text/plain' },
    body: JSON.stringify(obj)
  });
  if (!res.ok) throw new Error('KV set failed: ' + res.status);
}

var FILE = path.join(process.cwd(), 'data', 'site.json');

async function getSite() {
  if (hasKV()) {
    var stored = await kvGet();
    return normalize(stored || seed);
  }
  try {
    return normalize(JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } catch (e) {
    return normalize(seed);
  }
}

async function saveSite(obj) {
  var clean = normalize(obj);
  if (hasKV()) {
    await kvSet(clean);
    return clean;
  }
  try {
    fs.writeFileSync(FILE, JSON.stringify(clean, null, 2) + '\n');
    return clean;
  } catch (e) {
    var err = new Error('No writable storage configured. Add the Vercel KV / Upstash integration.');
    err.code = 'NO_STORAGE';
    throw err;
  }
}

module.exports = { getSite: getSite, saveSite: saveSite, FIELDS: FIELDS };
