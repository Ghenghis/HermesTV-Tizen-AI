'use strict';

/**
 * lib/streamResolver.js — server-only play-time stream URL resolver.
 *
 * The /api/play/:ticket/stream route calls this module to translate a
 * HermesTV-shape channel/item ID into the actual upstream stream URL.
 * The result is used either to:
 *   - HTTP 302 the client at the upstream URL (only safe when the URL
 *     does NOT contain embedded credentials — i.e. iptv-org public
 *     streams), OR
 *   - signal "needs Threadfin proxy" (credential-bearing URLs from
 *     Apollo Group / xTremeHD which embed user/pass in the path),
 *     deferring to the in-API HLS proxy or returning 503.
 *
 * This module is the ONLY audited consumer of:
 *   lib/iptvOrg.js     → internal.resolveStreamUrl(channelId)
 *   lib/m3uClient.js   → internal.resolveStreamUrl(channelId)
 *   lib/xtreamClient.js → internal.resolveStreamUrl(channelId)
 *
 * It is NOT mounted as a route and never appears in module.exports of
 * any router. The single test that this module never leaks a URL into
 * an HTTP response body is middleware/credentialGuard.js, which inspects
 * every res.json() payload for credential-shaped strings.
 *
 * W17-PURGE: the legacy `live-demo-*` branch (which looked stream_url up
 * inside SEED_CATALOG) has been removed along with seedCatalog.js. The
 * resolver now only dispatches against real provider caches.
 *
 * Channel/item ID dispatch table:
 *   "m3u-<provider>-<localId>"         → m3uClient
 *   "iptv-<iptvOrgChannelId>"          → iptvOrg
 *   "xtream-<type>-<stream_id>"        → xtreamClient (Xtream Codes panels)
 *   anything else                      → null (handled upstream as 503)
 */

var iptvOrg = require('./iptvOrg');
var m3uClient = require('./m3uClient');
var xtreamClient = require('./xtreamClient');

// Credential-bearing URL patterns — mirror lib/sanitizeLog.js FORBIDDEN_PATTERNS.
// If a resolved URL matches any of these we MUST NOT 302 the client at it,
// because the Location header would expose the operator's upstream
// credentials. Such URLs need a server-side proxy (in-API HLS proxy /
// Threadfin) to be playable. Until that proxy is wired we surface a clear 503.
var CRED_BEARING = [
  /\/get\.php\?username=/i,
  /\/player_api\.php/i,
  /m3u_plus/i,
];

function isCredentialBearing(url) {
  if (typeof url !== 'string' || url.length === 0) { return false; }
  for (var i = 0; i < CRED_BEARING.length; i++) {
    if (CRED_BEARING[i].test(url)) { return true; }
  }
  return false;
}

/**
 * Resolve a HermesTV channel/item ID to its upstream stream URL.
 *
 * Returns:
 *   { url: string, credential_bearing: boolean }   — successful resolve
 *   null                                            — could not resolve
 *
 * NEVER throws — broken upstream cache returns null, caller must
 * surface that to the user as a 503.
 *
 * Credential-bearing classification:
 *   - "m3u-*" → ALWAYS treated as credential-bearing. Operator-pasted
 *     M3U URLs (Apollo, xTremeHD) point at paid providers whose stream
 *     URLs embed user/pass in the path (`/live/<u>/<p>/<id>.m3u8`).
 *     Even when the URL pattern doesn't match a known Xtream signature
 *     we err conservative — assume operator-paid → never 302 the
 *     client at it, route through the HLS proxy or return 503.
 *   - "iptv-*" → public iptv-org CDN streams; classification falls back
 *     to a URL-pattern check (defensive, in case a future entry sneaks
 *     a creds-bearing URL through).
 */
function resolveStreamUrl(channelId) {
  if (typeof channelId !== 'string' || channelId.length === 0) { return null; }

  var url = null;
  var alwaysCredBearing = false;

  if (channelId.indexOf('m3u-') === 0) {
    try { url = m3uClient.internal.resolveStreamUrl(channelId); }
    catch (_) { url = null; }
    alwaysCredBearing = true; // paid operator providers — never 302
  } else if (channelId.indexOf('xtream-') === 0) {
    // Xtream Codes panel — operator-paid IPTV. Stream URLs ALWAYS embed
    // user/pass in the path (`/live/<u>/<p>/<id>.m3u8`), so treated as
    // credential-bearing and routed through the HLS proxy.
    try { url = xtreamClient.internal.resolveStreamUrl(channelId); }
    catch (_) { url = null; }
    alwaysCredBearing = true;
  } else if (channelId.indexOf('iptv-') === 0) {
    // iptvOrg uses bare channel.id (no "iptv-" prefix) internally.
    var iptvId = channelId.slice('iptv-'.length);
    try { url = iptvOrg.internal.resolveStreamUrl(iptvId); }
    catch (_) { url = null; }
  }

  if (!url) { return null; }
  return {
    url: url,
    credential_bearing: alwaysCredBearing || isCredentialBearing(url),
  };
}

module.exports = {
  resolveStreamUrl: resolveStreamUrl,
  isCredentialBearing: isCredentialBearing,
};
