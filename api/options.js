'use strict';

var options = require('../lib/options');
var auth = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      var list = await options.getOptions();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ options: list });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to load options.' });
    }
  }

  if (req.method === 'PUT') {
    if (!auth.isAuthed(req)) return res.status(401).json({ error: 'Unauthorized.' });

    var body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = null; }
    }
    if (!body || !Array.isArray(body.options)) {
      return res.status(400).json({ error: 'Expected a JSON body of { "options": [ ... ] }.' });
    }

    try {
      var saved = await options.saveOptions(body.options);
      return res.status(200).json({ options: saved });
    } catch (e) {
      if (e.code === 'NO_STORAGE') return res.status(503).json({ error: e.message });
      return res.status(400).json({ error: e.message || 'Failed to save options.' });
    }
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed.' });
};
