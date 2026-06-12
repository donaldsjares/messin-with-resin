'use strict';

/* Global product customization options (color, effects, etc.) shown in the
 * quick-view modal. Stored in Upstash Redis (KV) in production; falls back to
 * data/options.json on disk for local dev. Mirrors lib/store.js / lib/site.js. */

var fs = require('fs');
var path = require('path');
var seed = require('../data/options.json');

var KEY = 'mwr:options';

function kvUrl() {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
}
function kvToken() {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
}
function hasKV() {
  return !!(kvUrl() && kvToken());
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'opt';
}

function normalize(list) {
  if (!Array.isArray(list)) throw new Error('Expected an array of option groups.');
  return list.map(function (g, i) {
    if (!g || !g.label || !String(g.label).trim()) {
      throw new Error('Every option needs a label (group ' + (i + 1) + ').');
    }
    var type = g.type === 'text' ? 'text' : 'select';
    var choices = [];
    if (type === 'select') {
      choices = (Array.isArray(g.choices) ? g.choices : [])
        .map(function (c) { return String(c).trim(); })
        .filter(function (c) { return c.length; });
      if (!choices.length) {
        throw new Error('“' + String(g.label).trim() + '” needs at least one choice.');
      }
    }
    return {
      id: slug(g.label) + '-' + i,
      label: String(g.label).trim(),
      type: type,
      required: !!g.required,
      choices: choices
    };
  });
}

async function kvGet() {
  var res = await fetch(kvUrl() + '/get/' + encodeURIComponent(KEY), {
    headers: { Authorization: 'Bearer ' + kvToken() }
  });
  if (!res.ok) throw new Error('KV get failed: ' + res.status);
  var data = await res.json();
  return data && data.result ? JSON.parse(data.result) : null;
}

async function kvSet(list) {
  var res = await fetch(kvUrl() + '/set/' + encodeURIComponent(KEY), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + kvToken(), 'Content-Type': 'text/plain' },
    body: JSON.stringify(list)
  });
  if (!res.ok) throw new Error('KV set failed: ' + res.status);
}

var FILE = path.join(process.cwd(), 'data', 'options.json');

async function getOptions() {
  if (hasKV()) {
    var stored = await kvGet();
    if (stored && Array.isArray(stored)) return normalize(stored);
    return normalize(seed.options);
  }
  try {
    return normalize(JSON.parse(fs.readFileSync(FILE, 'utf8')).options);
  } catch (e) {
    return normalize(seed.options);
  }
}

async function saveOptions(list) {
  var clean = normalize(list);
  if (hasKV()) {
    await kvSet(clean);
    return clean;
  }
  try {
    fs.writeFileSync(FILE, JSON.stringify({ options: clean }, null, 2) + '\n');
    return clean;
  } catch (e) {
    var err = new Error('No writable storage configured. Add the Vercel KV / Upstash integration.');
    err.code = 'NO_STORAGE';
    throw err;
  }
}

module.exports = { getOptions: getOptions, saveOptions: saveOptions };
