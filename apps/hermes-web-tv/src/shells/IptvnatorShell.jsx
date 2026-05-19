import React from 'react';
import { applyShellFilters, posterBg } from './shellHelpers.js';
import * as watchHistoryStore from '../store/watchHistoryStore.js';

// ─────────────────────────────────────────────────────────────────────────────
// IptvnatorShell — HermesTV's 13th layout shell, a "Classic 3-pane" surface.
//
// Cloned design language (NOT cloned assets):
//   - Three-column CSS grid: 220px navigation rail | flexible channel list
//     centre | 320px preview pane right.
//   - Material-ish dense feel — rectangular surfaces, 1px borders, list rows
//     not cards. Compact font scale so a Tizen 1080p screen shows lots of
//     channels at once.
//   - Left rail sections: Playlists, Favorites, Recently Viewed, EPG,
//     Settings. The Recently Viewed section is populated from
//     watchHistoryStore.listRecent — same source as the rest of the app's
//     continue-watching surfaces.
//   - Centre column: TV / Radio filter pill at the top, then a virtual-feel
//     list of channels with a logo, channel name, current programme and the
//     channel number on the right. Radio playlists aren't part of the seed
//     yet — selecting the Radio pill shows an empty state with import
//     instructions instead of a misleading channel list.
//   - Right pane: preview card for the focused channel — backdrop, title,
//     current "Now" programme, and a play button. Falls back to a calm
//     gradient and the chosen-name greeting copy when nothing is focused.
//   - Bottom strip (50 px, `position: relative` — Tizen webview is unreliable
//     with `position: fixed`): current-channel chip, transport controls
//     (prev / pause / next / volume) and the external-player chooser:
//     "🎬 mpv", "🔵 VLC", "📺 In-app". Only In-app is active; mpv/VLC show a
//     tooltip explaining external player support is a v2 follow-up. Transport
//     buttons console.log for now — wiring into the player surface is a
//     follow-up task because it touches the playback layer outside the shell.
//
// All copy is HermesTV branding — never reference "iptvnator" in user-visible
// strings.
//
// Tizen 6.5 / Chrome 76 safe: ES5-style declarations, no arrow funcs in body,
// no destructuring, no template strings, no optional chaining, no `:has()`,
// no `@container`, no `subgrid`, no `position: fixed` (fixed positioning
// is unreliable inside the Tizen webview viewport).
// ─────────────────────────────────────────────────────────────────────────────

// ─── Theme tokens (kept inline so the shell remains self-contained) ──────────
var COLOR_BG = '#0d1117';
var COLOR_SURFACE = '#161b22';
var COLOR_SURFACE_RAISED = '#1c2128';
var COLOR_BORDER = '#1a2030';
var COLOR_TEXT = '#e6edf3';
var COLOR_MUTED = '#8b949e';
var COLOR_ACCENT = '#26a69a';
var COLOR_ACCENT_DIM = 'rgba(38, 166, 154, 0.18)';

// External player chooser modes. We keep all three visible because IPTV
// power-users (Dave) recognise the affordance from desktop players. Only
// in-app is functional today; mpv/VLC are a v2 follow-up. The labels carry
// no third-party copy that would imply a partnership.
var PLAYER_MODES = [
  { id: 'mpv', icon: '🎬', label: 'mpv', external: true },
  { id: 'vlc', icon: '🔵', label: 'VLC', external: true },
  { id: 'inapp', icon: '📺', label: 'In-app', external: false },
];

// ─── Sidebar inventory ───────────────────────────────────────────────────────
// Top-level rail items. EPG and Settings link to the same surfaces the rest of
// the app uses (today they're stubs the wider shell engine swaps in).
function _buildRailSections(counts) {
  return [
    { id: 'playlists', icon: '☰', label: 'Playlists', count: counts.playlists },
    { id: 'favorites', icon: '★', label: 'Favorites', count: counts.favorites },
    { id: 'recent', icon: '⟲', label: 'Recently Viewed', count: counts.recent },
    { id: 'epg', icon: '◷', label: 'EPG', count: 0 },
    { id: 'settings', icon: '⚙', label: 'Settings', count: 0 },
  ];
}

// ─── Radio detection ─────────────────────────────────────────────────────────
// Radio playlists are flagged in seedCatalog as `item.type === 'radio'`. The
// seed doesn't carry any today; we still expose the TV / Radio pill so the
// affordance is consistent with how iptvnator-class players surface it.
function _isRadio(item) {
  if (!item) { return false; }
  if (item.type === 'radio') { return true; }
  if (item.metadata && item.metadata.is_radio === true) { return true; }
  return false;
}

// ─── Current programme — placeholder ─────────────────────────────────────────
// /api/epg/grid integration lives in LiveTVShell. For this shell we keep the
// "now" line deterministic so two renders show the same value (no flicker on
// focus restore). When EPG is plumbed in we'll switch this to the real feed.
function _placeholderNow(channel) {
  if (!channel) { return ''; }
  var seed = 0;
  var key = channel.id || channel.title || 'x';
  for (var i = 0; i < key.length; i++) { seed = (seed + key.charCodeAt(i)) | 0; }
  if (seed < 0) { seed = -seed; }
  var titles = [
    'Now: Top of the Hour',
    'Now: Headlines',
    'Now: Feature Programme',
    'Now: Local Update',
    'Now: Late Edition',
  ];
  return titles[seed % titles.length];
}

function IptvnatorShell(props) {
  var catalog = props.catalog;
  var profile = props.profile;
  var tier = props.tier;
  var providers = props.providers;
  var onItemSelect = props.onItemSelect;
  var contentFilter = props.contentFilter;
  var providerFilter = props.providerFilter;
  var qualityFilter = props.qualityFilter;

  var filtered = applyShellFilters(catalog, contentFilter, providerFilter, qualityFilter);

  // ─── State ─────────────────────────────────────────────────────────────────
  var mediaState = React.useState('tv'); // 'tv' | 'radio'
  var mediaTab = mediaState[0];
  var setMediaTab = mediaState[1];

  var searchState = React.useState('');
  var search = searchState[0];
  var setSearch = searchState[1];

  var focusedState = React.useState(null);
  var focusedChannel = focusedState[0];
  var setFocusedChannel = focusedState[1];

  var railState = React.useState('playlists');
  var activeRail = railState[0];
  var setActiveRail = railState[1];

  var recentState = React.useState([]);
  var recentItems = recentState[0];
  var setRecentItems = recentState[1];

  var playerModeState = React.useState('inapp');
  var playerMode = playerModeState[0];
  var setPlayerMode = playerModeState[1];

  var tooltipState = React.useState(null);
  var tooltipPlayer = tooltipState[0];
  var setTooltipPlayer = tooltipState[1];

  // ─── Recently Viewed — pulled from watchHistoryStore ──────────────────────
  // Mirrors the contract used by SeriesNextUp / useWatchProgress. We always
  // request the per-profile slice so Sherri and Dave don't bleed into each
  // other. listRecent already returns [] on error, so no defensive shell here.
  React.useEffect(function() {
    var cancelled = false;
    var profileId = profile && profile.id;
    if (!profileId) {
      setRecentItems([]);
      return undefined;
    }
    watchHistoryStore.listRecent(profileId, 10).then(function(rows) {
      if (!cancelled) {
        setRecentItems(rows || []);
      }
    });
    return function() { cancelled = true; };
  }, [profile && profile.id]);

  // ─── Channel list derivation ───────────────────────────────────────────────
  // Centre column shows live channels by default — that's the iptvnator
  // mental model. We still respect the global content filter so the "Live"
  // chip in the wider shell engine narrows what shows up.
  var liveChannels = filtered.filter(function(i) { return i.type === 'live' && !_isRadio(i); });
  var radioChannels = filtered.filter(function(i) { return _isRadio(i); });
  var visibleChannels = mediaTab === 'radio' ? radioChannels : liveChannels;
  if (search) {
    var q = search.toLowerCase();
    visibleChannels = visibleChannels.filter(function(ch) {
      return (ch.title || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  // Auto-focus the first channel once the list is non-empty. Without this the
  // right pane stays blank on first paint which makes the shell look broken.
  React.useEffect(function() {
    if (focusedChannel) { return; }
    if (visibleChannels.length > 0) {
      setFocusedChannel(visibleChannels[0]);
    }
  }, [visibleChannels.length, focusedChannel]);

  // ─── Initial keyboard / remote focus ───────────────────────────────────────
  React.useEffect(function() {
    var el = document.querySelector('[data-iptvnator-channel="true"]');
    if (el && typeof el.focus === 'function') {
      try { el.focus(); } catch (_) {}
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Counts for the rail ───────────────────────────────────────────────────
  var railCounts = {
    playlists: (providers && providers.length) || 0,
    favorites: 0, // favorites store not wired into this shell yet
    recent: recentItems.length,
  };
  var rail = _buildRailSections(railCounts);

  // ─── Player-mode click handler ─────────────────────────────────────────────
  // Only "inapp" actually flips the mode. The other two surface a tooltip we
  // auto-dismiss after 2.5s so the explanation doesn't linger.
  function _onPlayerMode(mode) {
    if (mode.id === 'inapp') {
      setPlayerMode('inapp');
      setTooltipPlayer(null);
      return;
    }
    setTooltipPlayer(mode.id);
    // Auto-dismiss
    setTimeout(function() {
      setTooltipPlayer(function(curr) { return curr === mode.id ? null : curr; });
    }, 2500);
  }

  // ─── Transport — stubs ─────────────────────────────────────────────────────
  // Real wiring touches the playback surface (outside this shell). We log so
  // future agents can grep for the integration point.
  function _logTransport(action) {
    try {
      console.log('[IptvnatorShell] transport: ' + action + ' (stub — wire into player surface in follow-up)');
    } catch (e) { /* ignore */ }
  }

  var focusedTitle = focusedChannel ? (focusedChannel.title || 'Untitled') : '';
  var chosenName = (profile && (profile.chosen_name || profile.name)) || 'Hermes viewer';

  return (
    <div
      className="iptvnator-shell"
      style={{
        display: 'grid',
        gridTemplateColumns: '220px 1fr 320px',
        gridTemplateRows: '1fr 50px',
        height: '100%',
        background: COLOR_BG,
        color: COLOR_TEXT,
        overflow: 'hidden',
        fontFamily: '"Roboto", "Segoe UI", "Inter", system-ui, -apple-system, sans-serif',
      }}
    >
      {/* ─── Left rail (Playlists / Favorites / Recently Viewed / EPG / Settings) ── */}
      <aside
        style={{
          gridColumn: '1',
          gridRow: '1',
          background: COLOR_SURFACE,
          borderRight: '1px solid ' + COLOR_BORDER,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '0.85rem 0.85rem 0.5rem',
            borderBottom: '1px solid ' + COLOR_BORDER,
          }}
        >
          <div
            style={{
              fontSize: 'calc(1rem * var(--font-scale, 1))',
              fontWeight: 800,
              letterSpacing: '0.02em',
              color: COLOR_ACCENT,
            }}
          >
            HermesTV
          </div>
          <div
            style={{
              fontSize: 'calc(0.6rem * var(--font-scale, 1))',
              color: COLOR_MUTED,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginTop: '0.15rem',
            }}
          >
            Classic 3-pane
          </div>
        </div>

        {rail.map(function(sec) {
          var isActive = activeRail === sec.id;
          return (
            <button
              key={sec.id}
              tabIndex={0}
              data-focusable="true"
              onClick={function() { setActiveRail(sec.id); }}
              onKeyDown={function(e) {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveRail(sec.id); }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '0.55rem 0.85rem',
                background: isActive ? COLOR_ACCENT_DIM : 'transparent',
                border: 'none',
                borderLeft: '3px solid ' + (isActive ? COLOR_ACCENT : 'transparent'),
                color: COLOR_TEXT,
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 'calc(0.78rem * var(--font-scale, 1))',
                outline: 'none',
              }}
              onFocus={function(e) { e.currentTarget.style.background = COLOR_ACCENT_DIM; e.currentTarget.style.borderLeftColor = COLOR_ACCENT; }}
              onBlur={function(e) { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderLeftColor = 'transparent'; } }}
              onMouseEnter={function(e) { if (!isActive) { e.currentTarget.style.background = COLOR_SURFACE_RAISED; } }}
              onMouseLeave={function(e) { if (!isActive) { e.currentTarget.style.background = 'transparent'; } }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <span aria-hidden="true" style={{ color: COLOR_ACCENT, fontSize: '14px', width: '16px', textAlign: 'center' }}>{sec.icon}</span>
                <span>{sec.label}</span>
              </span>
              {sec.count > 0 && (
                <span style={{ color: COLOR_MUTED, fontSize: 'calc(0.68rem * var(--font-scale, 1))' }}>{sec.count}</span>
              )}
            </button>
          );
        })}

        {/* Recently Viewed sub-list — only shown when that rail item is active.
            Mirrors the desktop iptvnator "expandable section" feel without
            requiring a tree-control widget. */}
        {activeRail === 'recent' && (
          <div
            style={{
              padding: '0.4rem 0.85rem 0.85rem',
              borderTop: '1px solid ' + COLOR_BORDER,
              marginTop: '0.3rem',
            }}
          >
            <div
              style={{
                fontSize: 'calc(0.6rem * var(--font-scale, 1))',
                color: COLOR_MUTED,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: '0.4rem',
              }}
            >
              Last 10 watched
            </div>
            {recentItems.length === 0 ? (
              <div style={{ fontSize: 'calc(0.7rem * var(--font-scale, 1))', color: COLOR_MUTED }}>
                Nothing watched yet on this profile.
              </div>
            ) : (
              recentItems.map(function(row) {
                return (
                  <div
                    key={row.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '0.3rem 0',
                      fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                      borderBottom: '1px solid ' + COLOR_BORDER,
                    }}
                  >
                    <span
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: COLOR_TEXT,
                      }}
                    >
                      {row.title || 'Untitled'}
                    </span>
                    <span style={{ color: COLOR_MUTED, fontSize: 'calc(0.6rem * var(--font-scale, 1))' }}>
                      {row.item_type} · {Math.round(row.percent_complete || 0)}%
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Playlists sub-list under the rail — mirrors ZeroShell's pattern of
            surfacing operator-configured providers so the user can see what
            sources are wired without leaving the layout. */}
        {activeRail === 'playlists' && providers && providers.length > 0 && (
          <div
            style={{
              padding: '0.4rem 0.85rem 0.85rem',
              borderTop: '1px solid ' + COLOR_BORDER,
              marginTop: '0.3rem',
            }}
          >
            <div
              style={{
                fontSize: 'calc(0.6rem * var(--font-scale, 1))',
                color: COLOR_MUTED,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: '0.4rem',
              }}
            >
              Sources
            </div>
            {providers.map(function(p) {
              var label = p.provider_id || p.id || 'provider';
              return (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.25rem 0',
                    fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span aria-hidden="true" style={{ color: COLOR_ACCENT }}>◉</span>
                    <span>{label}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </aside>

      {/* ─── Centre column (TV / Radio pill + channel list) ─────────────────── */}
      <main
        style={{
          gridColumn: '2',
          gridRow: '1',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: COLOR_BG,
        }}
      >
        {/* TV / Radio pill + search */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1rem',
            background: COLOR_SURFACE,
            borderBottom: '1px solid ' + COLOR_BORDER,
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <div
            role="group"
            aria-label="Media type"
            style={{
              display: 'inline-flex',
              borderRadius: '999px',
              border: '1px solid ' + COLOR_BORDER,
              padding: '2px',
              background: COLOR_BG,
            }}
          >
            {[{ id: 'tv', icon: '📺', label: 'TV' }, { id: 'radio', icon: '📻', label: 'Radio' }].map(function(opt) {
              var isActive = mediaTab === opt.id;
              return (
                <button
                  key={opt.id}
                  tabIndex={0}
                  aria-pressed={isActive}
                  onClick={function() { setMediaTab(opt.id); }}
                  onKeyDown={function(e) {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMediaTab(opt.id); }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.3rem 0.85rem',
                    background: isActive ? COLOR_ACCENT : 'transparent',
                    color: isActive ? '#0a0e1a' : COLOR_TEXT,
                    border: 'none',
                    borderRadius: '999px',
                    cursor: 'pointer',
                    fontSize: 'calc(0.72rem * var(--font-scale, 1))',
                    fontWeight: 700,
                    outline: 'none',
                    transition: 'background 100ms ease, color 100ms ease',
                  }}
                  onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px ' + COLOR_ACCENT; }}
                  onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <span aria-hidden="true">{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          <input
            type="search"
            value={search}
            onChange={function(e) { setSearch(e.target.value); }}
            placeholder={mediaTab === 'radio' ? 'Search stations' : 'Search channels'}
            aria-label="Search current playlist"
            style={{
              flex: '0 0 240px',
              background: COLOR_BG,
              color: COLOR_TEXT,
              border: '1px solid ' + COLOR_BORDER,
              borderRadius: '6px',
              padding: '0.35rem 0.7rem',
              fontSize: 'calc(0.75rem * var(--font-scale, 1))',
              outline: 'none',
            }}
            onFocus={function(e) { e.currentTarget.style.borderColor = COLOR_ACCENT; }}
            onBlur={function(e) { e.currentTarget.style.borderColor = COLOR_BORDER; }}
          />
        </div>

        {/* Channel list */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
          }}
        >
          {mediaTab === 'radio' && radioChannels.length === 0 ? (
            <div
              style={{
                padding: '3rem 2rem',
                textAlign: 'center',
                color: COLOR_MUTED,
              }}
            >
              <div style={{ fontSize: '2.2rem', marginBottom: '0.6rem' }} aria-hidden="true">📻</div>
              <div style={{ fontSize: 'calc(1rem * var(--font-scale, 1))', fontWeight: 700, color: COLOR_TEXT, marginBottom: '0.4rem' }}>
                No radio stations yet
              </div>
              <div style={{ fontSize: 'calc(0.78rem * var(--font-scale, 1))', maxWidth: '420px', margin: '0 auto', lineHeight: 1.5 }}>
                Import a radio M3U playlist from Playlists in the left rail to start
                listening. HermesTV will surface stations here once a radio source is
                added.
              </div>
            </div>
          ) : visibleChannels.length === 0 ? (
            <div
              style={{
                padding: '3rem 2rem',
                textAlign: 'center',
                color: COLOR_MUTED,
              }}
            >
              <div style={{ fontSize: '2.2rem', marginBottom: '0.6rem' }} aria-hidden="true">∅</div>
              <div>No channels match the current filters.</div>
            </div>
          ) : (
            visibleChannels.map(function(ch, idx) {
              var isFocused = focusedChannel && focusedChannel.id === ch.id;
              var chNumber = idx + 1;
              return (
                <button
                  key={ch.id || idx}
                  tabIndex={0}
                  data-iptvnator-channel="true"
                  aria-label={(ch.title || 'Untitled') + ', channel ' + chNumber}
                  onClick={function() {
                    setFocusedChannel(ch);
                    if (typeof onItemSelect === 'function') { onItemSelect(ch); }
                  }}
                  onKeyDown={function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setFocusedChannel(ch);
                      if (typeof onItemSelect === 'function') { onItemSelect(ch); }
                    }
                  }}
                  onFocus={function() { setFocusedChannel(ch); }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '40px 1fr auto',
                    alignItems: 'center',
                    gap: '0.75rem',
                    width: '100%',
                    padding: '0.55rem 1rem',
                    background: isFocused ? COLOR_ACCENT_DIM : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid ' + COLOR_BORDER,
                    borderLeft: '3px solid ' + (isFocused ? COLOR_ACCENT : 'transparent'),
                    color: COLOR_TEXT,
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 'calc(0.78rem * var(--font-scale, 1))',
                    outline: 'none',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '4px',
                      background: posterBg(ch, idx),
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span
                      style={{
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {ch.title || 'Untitled'}
                    </span>
                    <span
                      style={{
                        fontSize: 'calc(0.65rem * var(--font-scale, 1))',
                        color: COLOR_MUTED,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {_placeholderNow(ch)}
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: 'calc(0.68rem * var(--font-scale, 1))',
                      color: COLOR_MUTED,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    #{chNumber}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </main>

      {/* ─── Right preview pane ────────────────────────────────────────────── */}
      <aside
        style={{
          gridColumn: '3',
          gridRow: '1',
          background: COLOR_SURFACE,
          borderLeft: '1px solid ' + COLOR_BORDER,
          overflowY: 'auto',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
        }}
      >
        <div
          style={{
            fontSize: 'calc(0.62rem * var(--font-scale, 1))',
            color: COLOR_MUTED,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
          }}
        >
          Preview
        </div>
        {focusedChannel ? (
          <React.Fragment>
            <div
              style={{
                aspectRatio: '16 / 9',
                background: posterBg(focusedChannel, 0),
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                borderRadius: '8px',
                border: '1px solid ' + COLOR_BORDER,
              }}
            />
            <div style={{ fontSize: 'calc(0.95rem * var(--font-scale, 1))', fontWeight: 700 }}>
              {focusedTitle}
            </div>
            <div style={{ fontSize: 'calc(0.72rem * var(--font-scale, 1))', color: COLOR_MUTED }}>
              {_placeholderNow(focusedChannel)}
            </div>
            <button
              tabIndex={0}
              aria-label={'Play ' + focusedTitle}
              onClick={function() {
                if (typeof onItemSelect === 'function') { onItemSelect(focusedChannel); }
              }}
              onKeyDown={function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (typeof onItemSelect === 'function') { onItemSelect(focusedChannel); }
                }
              }}
              style={{
                marginTop: '0.4rem',
                padding: '0.55rem 0.85rem',
                background: COLOR_ACCENT,
                color: '#0a0e1a',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: 'calc(0.78rem * var(--font-scale, 1))',
                fontWeight: 700,
                outline: 'none',
              }}
              onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px ' + COLOR_ACCENT; }}
              onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
            >
              ▶ Play
            </button>
          </React.Fragment>
        ) : (
          <div
            style={{
              padding: '2rem 0.5rem',
              textAlign: 'center',
              color: COLOR_MUTED,
              fontSize: 'calc(0.78rem * var(--font-scale, 1))',
            }}
          >
            <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }} aria-hidden="true">📺</div>
            <div>Welcome, {chosenName}.</div>
            <div style={{ marginTop: '0.3rem' }}>Highlight a channel to preview it here.</div>
          </div>
        )}
      </aside>

      {/* ─── Bottom strip (50px, position: relative — Tizen-safe) ───────────── */}
      {/* Spans all three columns. Position relative because Tizen 6.5 webview
          is unreliable with position: fixed inside a CSS-grid parent. */}
      <div
        style={{
          gridColumn: '1 / -1',
          gridRow: '2',
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          padding: '0 1rem',
          background: COLOR_SURFACE_RAISED,
          borderTop: '1px solid ' + COLOR_BORDER,
          gap: '0.75rem',
          height: '50px',
        }}
      >
        {/* Left cluster: current-channel chip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            minWidth: 0,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '4px',
              background: focusedChannel ? posterBg(focusedChannel, 0) : COLOR_BG,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              border: '1px solid ' + COLOR_BORDER,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 'calc(0.72rem * var(--font-scale, 1))',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}
          >
            {focusedChannel ? focusedTitle : 'No channel selected'}
          </span>
        </div>

        {/* Centre: transport controls */}
        <div
          role="group"
          aria-label="Transport controls"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
          }}
        >
          {[
            { id: 'prev', label: 'Previous channel', glyph: '⏮' },
            { id: 'play', label: 'Play / pause', glyph: '⏯' },
            { id: 'next', label: 'Next channel', glyph: '⏭' },
            { id: 'vol', label: 'Volume', glyph: '🔊' },
          ].map(function(btn) {
            return (
              <button
                key={btn.id}
                tabIndex={0}
                aria-label={btn.label}
                onClick={function() { _logTransport(btn.id); }}
                onKeyDown={function(e) {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _logTransport(btn.id); }
                }}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '6px',
                  background: 'transparent',
                  color: COLOR_TEXT,
                  border: '1px solid ' + COLOR_BORDER,
                  cursor: 'pointer',
                  fontSize: '14px',
                  outline: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onFocus={function(e) { e.currentTarget.style.borderColor = COLOR_ACCENT; e.currentTarget.style.boxShadow = '0 0 0 2px ' + COLOR_ACCENT; }}
                onBlur={function(e) { e.currentTarget.style.borderColor = COLOR_BORDER; e.currentTarget.style.boxShadow = 'none'; }}
              >
                {btn.glyph}
              </button>
            );
          })}
        </div>

        {/* Right cluster: external-player chooser */}
        <div
          role="group"
          aria-label="External player"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.3rem',
            position: 'relative',
          }}
        >
          {PLAYER_MODES.map(function(mode) {
            var isActive = playerMode === mode.id;
            var isTooltipped = tooltipPlayer === mode.id;
            return (
              <div key={mode.id} style={{ position: 'relative' }}>
                <button
                  tabIndex={0}
                  aria-pressed={isActive}
                  aria-label={'Open in ' + mode.label}
                  onClick={function() { _onPlayerMode(mode); }}
                  onKeyDown={function(e) {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _onPlayerMode(mode); }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.3rem 0.55rem',
                    background: isActive ? COLOR_ACCENT_DIM : 'transparent',
                    border: '1px solid ' + (isActive ? COLOR_ACCENT : COLOR_BORDER),
                    borderRadius: '6px',
                    color: mode.external ? COLOR_MUTED : COLOR_TEXT,
                    cursor: 'pointer',
                    fontSize: 'calc(0.68rem * var(--font-scale, 1))',
                    fontWeight: 600,
                    outline: 'none',
                  }}
                  onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px ' + COLOR_ACCENT; }}
                  onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <span aria-hidden="true">{mode.icon}</span>
                  <span>{mode.label}</span>
                </button>
                {isTooltipped && (
                  <div
                    role="tooltip"
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 6px)',
                      right: 0,
                      width: '220px',
                      padding: '0.5rem 0.6rem',
                      background: COLOR_BG,
                      border: '1px solid ' + COLOR_ACCENT,
                      borderRadius: '6px',
                      color: COLOR_TEXT,
                      fontSize: 'calc(0.65rem * var(--font-scale, 1))',
                      lineHeight: 1.4,
                      boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
                      zIndex: 10,
                    }}
                  >
                    External player support coming in v2.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default IptvnatorShell;
