// ─────────────────────────────────────────────────────────────────────────────
// contentFilters — centralized type-match helpers for shell filtering.
//
// Background: the live catalog tags movie items with `type === 'vod'` (from
// the IPTV ingest pipeline), but most shells were written assuming
// `type === 'movie'` or `type === 'movies'`. The mismatch produced empty
// "Featured Movies" / "Movies" tabs even when the catalog had hundreds of
// VOD items. Series items that arrive as `type === 'vod'` carry the
// `is_series === true` flag (Stremio/Xtream convention) so we route them to
// the series bucket; otherwise a VOD row is treated as a movie.
//
// All predicates are null-safe and ES5-compatible (no arrow functions, no
// default params) so they're drop-in for the var/function shells.
// ─────────────────────────────────────────────────────────────────────────────

export function isMovie(item) {
  if (!item) { return false; }
  if (item.type === 'movie' || item.type === 'movies') { return true; }
  if (item.type === 'vod' && !item.is_series) { return true; }
  return false;
}

export function isSeries(item) {
  if (!item) { return false; }
  if (item.type === 'series' || item.type === 'show') { return true; }
  if (item.type === 'vod' && item.is_series === true) { return true; }
  return false;
}

export function isLive(item) {
  return !!(item && item.type === 'live');
}
