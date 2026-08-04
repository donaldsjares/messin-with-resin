'use strict';

/* Order storage. Each order is a JSON document; in production it lives in
 * Upstash Redis (KV) under mwr:order:<id>, with mwr:orders holding a list of
 * ids newest-first (atomic LPUSH avoids the clobber a shared array would risk).
 * Locally (no KV) it falls back to data/orders.json so `vercel dev` works.
 * Mirrors lib/store.js. */

var fs = require('fs');
var path = require('path');

var INDEX = 'mwr:orders';
var DOC = 'mwr:order:';

function kvUrl() {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
}
function kvToken() {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
}
function hasKV() {
  return !!(kvUrl() && kvToken());
}

function authHeaders() {
  return { Authorization: 'Bearer ' + kvToken() };
}

async function kvCmd(pathParts, body) {
  var url = kvUrl() + '/' + pathParts.map(encodeURIComponent).join('/');
  var opts = { headers: authHeaders() };
  if (body !== undefined) {
    opts.method = 'POST';
    opts.headers['Content-Type'] = 'text/plain';
    opts.body = body;
  }
  var res = await fetch(url, opts);
  if (!res.ok) throw new Error('KV ' + pathParts[0] + ' failed: ' + res.status);
  return res.json();
}

var FILE = path.join(process.cwd(), 'data', 'orders.json');

function fileAll() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8')).orders || [];
  } catch (e) {
    return [];
  }
}
function fileWrite(orders) {
  fs.writeFileSync(FILE, JSON.stringify({ orders: orders }, null, 2) + '\n');
}

async function createOrder(order) {
  if (hasKV()) {
    await kvCmd(['set', DOC + order.id], JSON.stringify(order));
    await kvCmd(['lpush', INDEX, order.id]);
    return order;
  }
  var all = fileAll();
  all.unshift(order);
  fileWrite(all);
  return order;
}

async function getOrder(id) {
  if (hasKV()) {
    var data = await kvCmd(['get', DOC + id]);
    return data && data.result ? JSON.parse(data.result) : null;
  }
  var found = null;
  fileAll().forEach(function (o) { if (o.id === id) found = o; });
  return found;
}

async function updateOrder(id, patch) {
  var existing = await getOrder(id);
  if (!existing) return null;
  var merged = Object.assign({}, existing, patch);
  if (hasKV()) {
    await kvCmd(['set', DOC + id], JSON.stringify(merged));
    return merged;
  }
  var all = fileAll().map(function (o) { return o.id === id ? merged : o; });
  fileWrite(all);
  return merged;
}

async function listOrders(limit) {
  var max = limit || 100;
  if (hasKV()) {
    var idx = await kvCmd(['lrange', INDEX, '0', String(max - 1)]);
    var ids = (idx && idx.result) || [];
    var docs = await Promise.all(ids.map(function (id) { return getOrder(id); }));
    return docs.filter(Boolean);
  }
  return fileAll().slice(0, max);
}

module.exports = {
  createOrder: createOrder,
  getOrder: getOrder,
  updateOrder: updateOrder,
  listOrders: listOrders,
  hasKV: hasKV
};
