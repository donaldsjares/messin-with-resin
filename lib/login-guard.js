'use strict';

/* Brute-force protection for the owner login. Counts failed attempts per
 * client IP in KV (Upstash Redis REST); after MAX_ATTEMPTS within the window,
 * the IP is locked out for LOCK_SECONDS. Fails open if KV is unavailable so a
 * storage hiccup can never permanently lock out the real owner. */

var MAX_ATTEMPTS = 5;
var LOCK_SECONDS = 30 * 60;   // 30 minute lockout
var WINDOW_SECONDS = 30 * 60; // window over which failures accumulate

function kvUrl() {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
}
function kvToken() {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
}

async function redis(args) {
  var url = kvUrl();
  var token = kvToken();
  if (!url || !token) return null; // KV not configured → rate limiting disabled
  var res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error('redis command failed: ' + res.status);
  var data = await res.json();
  return data.result;
}

function ipFrom(req) {
  var xff = (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '';
  var ip = String(xff).split(',')[0].trim();
  return ip || 'unknown';
}

function failKey(ip) { return 'mwr:login:fail:' + ip; }
function lockKey(ip) { return 'mwr:login:lock:' + ip; }

// Returns remaining lock time in seconds (0 if not locked).
async function lockRemaining(ip) {
  try {
    var ttl = await redis(['TTL', lockKey(ip)]);
    return typeof ttl === 'number' && ttl > 0 ? ttl : 0;
  } catch (e) {
    return 0; // fail open
  }
}

// Record a failed attempt. Returns true if this failure triggered a lockout.
async function registerFailure(ip) {
  try {
    var count = await redis(['INCR', failKey(ip)]);
    if (count === null) return false; // KV disabled
    if (count === 1) await redis(['EXPIRE', failKey(ip), WINDOW_SECONDS]);
    if (count >= MAX_ATTEMPTS) {
      await redis(['SET', lockKey(ip), '1', 'EX', LOCK_SECONDS]);
      await redis(['DEL', failKey(ip)]);
      return true;
    }
    return false;
  } catch (e) {
    return false; // fail open
  }
}

// Clear counters on a successful login.
async function clearFailures(ip) {
  try {
    await redis(['DEL', failKey(ip), lockKey(ip)]);
  } catch (e) { /* ignore */ }
}

module.exports = {
  ipFrom: ipFrom,
  lockRemaining: lockRemaining,
  registerFailure: registerFailure,
  clearFailures: clearFailures,
  MAX_ATTEMPTS: MAX_ATTEMPTS,
  LOCK_SECONDS: LOCK_SECONDS
};
