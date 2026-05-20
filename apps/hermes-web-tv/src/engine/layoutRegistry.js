import React from 'react';

// Each shell is a sizable JSX tree (Mom Mode alone is ~30 KB minified). Boot
// only ever renders ONE shell — so eager-importing all 14 used to bloat the
// initial bundle by ~150-200 KB of unused code. Switched to React.lazy +
// dynamic import so the boot bundle only includes the shell the user picked
// (or the persisted default). Switching layouts via LayoutSwitcher fetches
// the next chunk on demand; Vite caches it so subsequent switches are
// instant.
//
// ShellRenderer wraps the chosen shell in <React.Suspense> with a thin
// skeleton fallback. The boot useEffect can safely call isValidLayout()
// before any lazy chunks resolve — it only inspects the registry keys.
//
// NOTE: Three parallel agents originally landed NuvioShell / StremioShell /
// ExtremeInfiniTVShell at the same time as LiveTVShell. When merging
// branches, keep all four entries — they're independent shells with no
// shared module state, so the registry order is the only conflict point.

var TiviMateShell        = React.lazy(function() { return import('../shells/TiviMateShell.jsx'); });
var NetflixShell         = React.lazy(function() { return import('../shells/NetflixShell.jsx'); });
var PlexShell            = React.lazy(function() { return import('../shells/PlexShell.jsx'); });
var AppleTVShell         = React.lazy(function() { return import('../shells/AppleTVShell.jsx'); });
var SamsungShell         = React.lazy(function() { return import('../shells/SamsungShell.jsx'); });
var MomModeShell         = React.lazy(function() { return import('../shells/MomModeShell.jsx'); });
var DavePowerShell       = React.lazy(function() { return import('../shells/DavePowerShell.jsx'); });
var ZeroShell            = React.lazy(function() { return import('../shells/ZeroShell.jsx'); });
var NuvioShell           = React.lazy(function() { return import('../shells/NuvioShell.jsx'); });
var ExtremeInfiniTVShell = React.lazy(function() { return import('../shells/ExtremeInfiniTVShell.jsx'); });
var StremioShell         = React.lazy(function() { return import('../shells/StremioShell.jsx'); });
var LiveTVShell          = React.lazy(function() { return import('../shells/LiveTVShell.jsx'); });
var IptvnatorShell       = React.lazy(function() { return import('../shells/IptvnatorShell.jsx'); });
var YnotvShell           = React.lazy(function() { return import('../shells/YnotvShell.jsx'); });

var SHELL_REGISTRY = {
  'tivimate': TiviMateShell,
  'netflix': NetflixShell,
  'plex': PlexShell,
  'apple-tv': AppleTVShell,
  'samsung-tizen': SamsungShell,
  'mom-mode': MomModeShell,
  'dave-power': DavePowerShell,
  'zero': ZeroShell,
  'nuvio': NuvioShell,
  'extreme-infinitv': ExtremeInfiniTVShell,
  'stremio': StremioShell,
  'live-tv': LiveTVShell,
  'iptvnator': IptvnatorShell,
  'ynotv': YnotvShell,
};

var LAYOUT_IDS = Object.keys(SHELL_REGISTRY);

function getShell(layoutId) {
  return SHELL_REGISTRY[layoutId] || null;
}

function isValidLayout(layoutId) {
  return LAYOUT_IDS.indexOf(layoutId) !== -1;
}

export { SHELL_REGISTRY, LAYOUT_IDS, getShell, isValidLayout };
