'use strict';

var auth = require('../lib/auth');
var guard = require('../lib/login-guard');

function lockMessage(seconds) {
  var mins = Math.max(1, Math.ceil(seconds / 60));
  return 'Too many failed attempts. Try again in ' + mins + ' minute' + (mins === 1 ? '' : 's') + '.';
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ authed: auth.isAuthed(req), configured: auth.configured() });
  }

  if (req.method === 'POST') {
    if (!auth.configured()) {
      return res.status(503).json({ error: 'Admin is not configured. Set ADMIN_PASSWORD and SESSION_SECRET.' });
    }

    var ip = guard.ipFrom(req);

    var locked = await guard.lockRemaining(ip);
    if (locked > 0) {
      return res.status(429).json({ error: lockMessage(locked) });
    }

    var body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    if (!auth.checkPassword(body && body.password)) {
      var nowLocked = await guard.registerFailure(ip);
      if (nowLocked) {
        return res.status(429).json({ error: lockMessage(guard.LOCK_SECONDS) });
      }
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    await guard.clearFailures(ip);
    res.setHeader('Set-Cookie', auth.sessionCookie(auth.createToken()));
    return res.status(200).json({ authed: true });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', auth.clearCookie());
    return res.status(200).json({ authed: false });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
};

