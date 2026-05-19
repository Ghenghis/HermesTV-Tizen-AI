// ─────────────────────────────────────────────────────────────────────────────
// shellHelpers — single source of truth for shell-level catalog helpers.
//
// Every layout shell needs to (a) filter the catalog by content/provider/
// quality, and (b) turn a catalog item into a CSS background string. Before
// this module those two helpers were duplicated verbatim across seven shells,
// and the inline `posterBg` only checked `item.poster || item.thumb`. The seed
// catalog (services/hermes-tv-api/src/data/seedCatalog.js, see PR #68) ships
// real artwork under `poster_url` / `logo_url`, so the duplicated helper fell
// straight through to the gradient palette → user-visible "static colored
// rectangles".
//
// Tizen 6.5 / Chrome 76 safe: no arrow funcs, no destructuring, no template
// strings, no optional chaining. Pure ES5-style function declarations.
// ─────────────────────────────────────────────────────────────────────────────

// Eight-color fallback palette. Kept identical to the historical inline copy
// so callers that fell through to a gradient render the same color they did
// before this refactor.
export var GRADIENT_PALETTE = [
  'linear-gradient(135deg,#1a1a2e,#16213e)',
  'linear-gradient(135deg,#0f3460,#e94560)',
  'linear-gradient(135deg,#1b1b2f,#2b2d42)',
  'linear-gradient(135deg,#2c003e,#6a0572)',
  'linear-gradient(135deg,#0d1117,#1f6feb)',
  'linear-gradient(135deg,#1a0a00,#ff7d3a)',
  'linear-gradient(135deg,#001a0d,#00d4aa)',
  'linear-gradient(135deg,#1a0000,#e50914)',
];

// Filter logic shared by every shell. Three independent predicates ANDed
// together: content type, provider id, and a coarse quality tier.
export function applyShellFilters(catalog, contentFilter, providerFilter, qualityFilter) {
  return (catalog || []).filter(function (item) {
    if (contentFilter !== 'all' && item.type !== contentFilter) { return false; }
    if (providerFilter !== 'all' && item.provider_id !== providerFilter) { return false; }
    if (qualityFilter !== 'all') {
      var q = (item.quality || '').toUpperCase();
      if (qualityFilter === '4K' && q.indexOf('4K') === -1 && q.indexOf('2160') === -1) { return false; }
      if (qualityFilter === '1080p+' && q.indexOf('1080') === -1 && q.indexOf('4K') === -1 && q.indexOf('2160') === -1) { return false; }
      if (qualityFilter === '720p+' && q.indexOf('720') === -1 && q.indexOf('1080') === -1 && q.indexOf('4K') === -1) { return false; }
    }
    return true;
  });
}

// Deterministic id → palette index. Sum the char codes of the id string so a
// given item always lands on the same gradient between renders (no flicker on
// re-mount). Falls back to the supplied numeric idx when the item has no id.
function _hashToPaletteIdx(item, idx) {
  if (item && typeof item.id === 'string' && item.id.length > 0) {
    var h = 0;
    for (var i = 0; i < item.id.length; i++) {
      h = (h + item.id.charCodeAt(i)) | 0;
    }
    if (h < 0) { h = -h; }
    return h % GRADIENT_PALETTE.length;
  }
  return (idx || 0) % GRADIENT_PALETTE.length;
}

// Resolve a catalog item to a CSS `background` value. Checks every known
// artwork field in priority order before falling back to a deterministic
// gradient. Priority matches PR #68 seed shape:
//
//   1. item.poster_url         — seed catalog primary field
//   2. item.poster             — legacy field still used by some mocks
//   3. item.logo_url           — channel-style art (live tiles)
//   4. item.thumb              — fallback thumbnail
//   5. item.metadata.poster_url — nested under metadata when surfaced from
//                                an external provider response
//   6. deterministic gradient  — last resort, hashed by item.id
//
// Returns a CSS `background` shorthand string. Callers drop it straight into
// a style object (e.g. `style={{ background: posterBg(item, idx) }}`).
export function posterBg(item, idx) {
  if (item) {
    var url = item.poster_url
      || item.poster
      || item.logo_url
      || item.thumb
      || (item.metadata && item.metadata.poster_url);
    if (url) {
      return 'url(' + url + ') center/cover no-repeat';
    }
  }
  return GRADIENT_PALETTE[_hashToPaletteIdx(item, idx)];
}
