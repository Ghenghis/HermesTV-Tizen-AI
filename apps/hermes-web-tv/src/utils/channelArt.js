// channelArt — deterministic gradient + 2-letter initials placeholder for
// channel/poster tiles when no real artwork URL is available. This replaces
// the picsum.photos random-nature-photo seed that was being labelled with
// channel names like "ESPN" / "Bloomberg" (and looking visibly broken to
// the user). Every tile rendered through this path is purely client-side
// CSS — no network request, no flicker, deterministic across reloads.
//
// Three entry points:
//   getChannelArt(channel)     → { type, url, initials, gradient: [a,b] }
//   channelArtCss(channel)     → CSS `background` shorthand string
//   channelArtInitials(channel)→ uppercase 2-letter abbreviation
//
// Tizen 6.5 / Chrome 76 safe: no arrow funcs, no destructuring, no template
// strings, no optional chaining, no Array.includes, no Object.values. Plain
// ES5 only.

// 12 dark-mode-friendly two-color gradients. Picked for contrast against
// white initials text and visual variety so the catalog doesn't read as
// monochrome when many channels fall through to the placeholder. The
// hash is stable per channel id so the same channel always lands on the
// same gradient between reloads.
export var PALETTE = [
  ['#1f6feb', '#0d1117'], // blue-black     → sports
  ['#e94560', '#16213e'], // crimson-navy   → news
  ['#a78bfa', '#1a1a2e'], // purple-ink     → entertainment
  ['#10b981', '#022c22'], // emerald-forest → lifestyle
  ['#f59e0b', '#1a0a00'], // amber-rust     → music
  ['#06b6d4', '#0c2a3a'], // cyan-deepsea   → kids
  ['#ec4899', '#2a0a1a'], // pink-wine      → drama
  ['#84cc16', '#0a1a02'], // lime-moss      → family
  ['#ef4444', '#1a0000'], // red-blood      → premium
  ['#6366f1', '#0a0a2e'], // indigo-night   → classic
  ['#14b8a6', '#0a2a26'], // teal-jade      → international
  ['#f97316', '#2a1000'], // orange-burnt   → broadcast
];

// Hash a string to a non-negative integer. Sum-of-char-codes is good enough
// for ~80 channels — collisions are visually harmless (two distinct
// channels just share a gradient).
function _hash(str) {
  if (!str || typeof str !== 'string') { return 0; }
  var h = 0;
  for (var i = 0; i < str.length; i++) {
    h = (h + str.charCodeAt(i)) | 0;
  }
  if (h < 0) { h = -h; }
  return h;
}

// Pick a stable palette entry for a channel. Falls back to entry 0 when no
// hashable input is available.
function _gradientFor(seed) {
  return PALETTE[_hash(seed) % PALETTE.length];
}

// Extract 2-letter initials from a channel title. Single-word titles
// return the first two letters (e.g. "ESPN" → "ES"); multi-word titles
// return the initial of the first two words ("Al Jazeera" → "AJ").
// Strips a leading article and ignores empty words from double-spaces.
export function channelArtInitials(channel) {
  if (!channel) { return '?'; }
  var raw = channel.title || channel.name || channel.id || '';
  if (typeof raw !== 'string' || raw.length === 0) { return '?'; }

  // Strip a leading article ("The CW" → "CW", "A&E" → "A&").
  var t = raw.replace(/^(the|a|an)\s+/i, '');
  // Drop punctuation that would otherwise become an "initial".
  t = t.replace(/[^A-Za-z0-9 ]/g, ' ');
  var words = t.split(/\s+/);
  var filtered = [];
  for (var i = 0; i < words.length; i++) {
    if (words[i] && words[i].length > 0) { filtered.push(words[i]); }
  }

  if (filtered.length === 0) { return '?'; }
  if (filtered.length === 1) {
    // Single word — take first two letters.
    var w = filtered[0];
    if (w.length === 1) { return w.toUpperCase(); }
    return (w.charAt(0) + w.charAt(1)).toUpperCase();
  }
  // Multi-word — first letter of first two words.
  return (filtered[0].charAt(0) + filtered[1].charAt(0)).toUpperCase();
}

// Main entry: resolve a catalog item to an artwork descriptor.
//
// Returns an object with:
//   type     — 'logo' when a real CDN URL exists (Wikipedia / TMDB / channel
//              CDN), 'placeholder' when we have to render a gradient tile.
//   url      — the resolved logo URL when type === 'logo', else null.
//   initials — uppercase 2-letter string for placeholder rendering.
//   gradient — [colorA, colorB] tuple for placeholder rendering.
//
// Callers can either render `<img src={art.url}>` when type === 'logo' or
// drop a gradient div with the initials centered when type === 'placeholder'.
// channelArtCss() below is the shortcut for callers that just want a CSS
// background string.
export function getChannelArt(channel) {
  var safe = channel || {};
  var seed = safe.id || safe.slug || safe.title || safe.name || 'unknown';
  var grad = _gradientFor(seed);
  var initials = channelArtInitials(safe);

  // For live channels prefer logo_url; for VOD/series prefer poster_url
  // then thumb. We deliberately skip picsum-style placeholder URLs so the
  // shell falls through to the gradient tile instead of showing a random
  // nature photo. The seed catalog now stores null for unknown artwork
  // (see services/.../seedCatalog.js), but we double-check here in case
  // a third-party provider still ships a picsum URL.
  var url = null;
  var isLive = (safe.type === 'live');

  function _ok(u) {
    return typeof u === 'string'
      && u.length > 0
      && u.indexOf('picsum.photos') === -1;
  }

  if (isLive) {
    if (_ok(safe.logo_url))    { url = safe.logo_url; }
    else if (_ok(safe.thumb))  { url = safe.thumb; }
  } else {
    if (_ok(safe.poster_url))      { url = safe.poster_url; }
    else if (_ok(safe.poster))     { url = safe.poster; }
    else if (_ok(safe.thumb))      { url = safe.thumb; }
    else if (_ok(safe.logo_url))   { url = safe.logo_url; }
  }

  return {
    type: url ? 'logo' : 'placeholder',
    url: url,
    initials: initials,
    gradient: grad,
  };
}

// Return a CSS `background` shorthand. When a real artwork URL exists the
// returned string is `url(...) center/cover no-repeat`. When no artwork
// exists the string is a `linear-gradient(135deg, a, b)` so the tile is
// never empty.
export function channelArtCss(channel) {
  var art = getChannelArt(channel);
  if (art.type === 'logo' && art.url) {
    return 'url(' + art.url + ') center/cover no-repeat';
  }
  return 'linear-gradient(135deg,' + art.gradient[0] + ',' + art.gradient[1] + ')';
}

export default getChannelArt;
