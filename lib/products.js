'use strict';

/* Shared product validation/normalization used by the API on save. */

var BADGE_TYPES = ['hot', 'new', 'fav'];

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

function normalize(list) {
  if (!Array.isArray(list)) throw new Error('Expected an array of products.');
  var seen = {};
  return list.map(function (p, i) {
    if (!p || !p.name || !String(p.name).trim()) {
      throw new Error('Every product needs a name (item ' + (i + 1) + ').');
    }
    var id = slug(p.id && String(p.id).trim() ? p.id : p.name);
    while (seen[id]) id = id + '-' + (i + 1);
    seen[id] = true;

    var price = Number(p.price);
    var badge = p.badge && p.badge.type ? { type: String(p.badge.type), label: String(p.badge.label || '') } : null;
    if (badge && BADGE_TYPES.indexOf(badge.type) === -1) badge = null;

    return {
      id: id,
      name: String(p.name).trim(),
      category: p.category ? String(p.category).trim() : '',
      price: isFinite(price) && price >= 0 ? price : 0,
      emoji: p.emoji ? String(p.emoji).trim() : '🎨',
      description: p.description ? String(p.description).trim() : '',
      bg: p.bg ? String(p.bg).trim() : 'linear-gradient(135deg,#fce7f3,#ede9fe)',
      badge: badge
    };
  });
}

module.exports = { normalize: normalize, slug: slug };
