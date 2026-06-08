'use strict';

/* Owner authentication: a single shared password (ADMIN_PASSWORD) exchanged for
 * an HMAC-signed, HttpOnly session cookie (signed with SESSION_SECRET).
 * No database of users — there is exactly one owner. Zero dependencies. */

var crypto = require('crypto');

var COOKIE = 'mwr_session';
var MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds

function secret() {
  return process.env.SESSION_SECRET || '';
}

function sign(data) {
  return crypto.createHmac('sha256', secret()).update(data).digest('base64url');
}

function createToken() {
  var payload = { exp: Date.now() + MAX_AGE * 1000 };
  var b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return b64 + '.' + sign(b64);
}

function safeEqual(a, b) {
  var ab = Buffer.from(String(a));
  var bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function verifyToken(token) {
  if (!token || token.indexOf('.') === -1 || !secret()) return false;
  var parts = token.split('.');
  if (!safeEqual(parts[1], sign(parts[0]))) return false;
  try {
    var payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    return !!payload.exp && payload.exp > Date.now();
  } catch (e) {
    return false;
  }
}

function checkPassword(input) {
  var pw = process.env.ADMIN_PASSWORD || '';
  if (!pw || !input) return false;
  return safeEqual(input, pw);
}

function getCookie(req, name) {
  if (req.cookies && req.cookies[name]) return req.cookies[name];
  var header = req.headers && req.headers.cookie;
  if (!header) return null;
  var found = null;
  header.split(';').forEach(function (pair) {
    var idx = pair.indexOf('=');
    if (idx === -1) return;
    if (pair.slice(0, idx).trim() === name) found = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return found;
}

// Secure flag only when deployed (https); omitted locally so http://localhost works.
function secureFlag() {
  return process.env.VERCEL ? '; Secure' : '';
}

function sessionCookie(token) {
  return COOKIE + '=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + MAX_AGE + secureFlag();
}

function clearCookie() {
  return COOKIE + '=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + secureFlag();
}

function isAuthed(req) {
  return verifyToken(getCookie(req, COOKIE));
}

function configured() {
  return !!(process.env.ADMIN_PASSWORD && process.env.SESSION_SECRET);
}

module.exports = {
  createToken: createToken,
  verifyToken: verifyToken,
  checkPassword: checkPassword,
  sessionCookie: sessionCookie,
  clearCookie: clearCookie,
  isAuthed: isAuthed,
  configured: configured
};
