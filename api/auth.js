'use strict';

var auth = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ authed: auth.isAuthed(req), configured: auth.configured() });
  }

  if (req.method === 'POST') {
    if (!auth.configured()) {
      return res.status(503).json({ error: 'Admin is not configured. Set ADMIN_PASSWORD and SESSION_SECRET.' });
    }
    var body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    if (!auth.checkPassword(body && body.password)) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }
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
