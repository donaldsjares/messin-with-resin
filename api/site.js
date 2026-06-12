'use strict';

var site = require('../lib/site');
var auth = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      var data = await site.getSite();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to load site settings.' });
    }
  }

  if (req.method === 'PUT') {
    if (!auth.isAuthed(req)) return res.status(401).json({ error: 'Unauthorized.' });

    var body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = null; }
    }
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Expected a JSON object of site settings.' });
    }

    try {
      var saved = await site.saveSite(body);
      return res.status(200).json(saved);
    } catch (e) {
      if (e.code === 'NO_STORAGE') return res.status(503).json({ error: e.message });
      return res.status(500).json({ error: 'Failed to save site settings.' });
    }
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed.' });
};
