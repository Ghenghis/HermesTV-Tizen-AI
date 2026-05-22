import React from 'react';
import { applyShellFilters, posterBg } from './shellHelpers.js';
import * as watchHistoryStore from '../store/watchHistoryStore.js';
import CategorySidebar from '../components/CategorySidebar.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// IptvnatorShell — DaveTV's 13th layout shell, a "Classic 3-pane" surface.
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
//     with `position: fixed`): current-channel chip, working prev / play /
//     next controls, and the active in-app player indicator.
//
// All copy is DaveTV branding — never reference "iptvnator" in user-visible
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

var PLAYER_MODES = [
  { id: 'inapp', icon: '📺', label: 'In-app' },
];

// ─── Sidebar inventory ───────────────────────────────────────────────────────
// Top-level rail items. EPG and Settings link to the same surfaces the rest of
// the app uses.
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

// ─── Current programme — honest empty when no EPG data ─────────────────────
// HANDOFF blocker #10 (2026-05-21): removed `_placeholderNow` synthetic-title
// generator (seeded 5-string array that looked real on every render). Now
// programmes only show when /api/epg/grid returns real data for the channel;
// otherwise the line is empty rather than a fabricated "Now: Headlines".
//
// Channels with no guide data render an empty programme line; the user can
// still see the channel itself + the channel number. Replacing the seeded
// fallback with REAL provider EPG aligns this shell with LiveTVShell's
// honest empty-state contract.
function _currentProgrammeText(channel, nowByChannelId) {
  if (!channel || !nowByChannelId) { return ''; }
  var key = channel.id;
  if (!key) { return ''; }
  return nowByChannelId[key] || nowByChannelId['live.' + key] || '';
}

function IptvnatorShell(props) {
  var catalog = props.catalog;
  var profile = props.profile;
  var tier = props.tier;
  var providers = props.providers;
  var onItemSelect = props.onItemSelect;
  var onOpenEPG = props.onOpenEPG;
  var onOpenSettings = props.onOpenSettings;
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

  // EPG: { channel_id: "Now title" } map populated by /api/epg/grid. Empty
  // string for any channel lookup that isn't in the map.
  var epgState = React.useState({});
  var nowByChannelId = epgState[0];
  var setNowByChannelId = epgState[1];

  // Fetch EPG once per profile + channel set change. Single request for the
  // full window (3h ahead); filter to "now" per row in JS. Honest failure:
  // on error or empty response, leave the map empty so the UI shows empty
  // programme lines rather than synthetic titles.
  React.useEffect(function() {
    if (typeof fetch !== 'function') { return; }
    var aborted = false;
    var profileId = (profile && profile.id) || 'dave_tv';
    var start = new Date();
    start.setSeconds(0, 0);
    var end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    var url = '/api/epg/grid?profile_id=' + encodeURIComponent(profileId)
      + '&start=' + encodeURIComponent(start.toISOString())
      + '&end=' + encodeURIComponent(end.toISOString());
    fetch(url)
      .then(function(r) { if (!r || !r.ok) { throw new Error('epg-unavailable'); } return r.json(); })
      .then(function(body) {
        if (aborted) { return; }
        var progs = (body && body.programs) || [];
        var now = Date.now();
        var map = {};
        for (var i = 0; i < progs.length; i++) {
          var p = progs[i];
          if (!p || !p.channel_id) { continue; }
          var s = Date.parse(p.start_utc);
          var e = Date.parse(p.end_utc);
          if (isNaN(s) || isNaN(e)) { continue; }
          if (s <= now && now < e) {
            // First match wins — programs are sorted by start_utc per
            // /api/epg/grid contract, so "current" is the earliest matching.
            if (!map[p.channel_id]) { map[p.channel_id] = p.title || ''; }
          }
        }
        setNowByChannelId(map);
      })
      .catch(function() {
        if (!aborted) { setNowByChannelId({}); }
      });
    return function() { aborted = true; };
  }, [profile && profile.id, catalog && catalog.length]);

  var playerModeState = React.useState('inapp');
  var playerMode = playerModeState[0];
  var setPlayerMode = playerModeState[1];

  // Category quick-filter — chips render as a horizontal strip above the
  // channel list (existing left rail keeps its Playlists/Favorites/Recent
  // sections). 'all' = no filter; otherwise the slug must match the
  // catalog item's `item.category` (or `metadata.genre` fallback).
  var categoryFilterState = React.useState('all');
  var categoryFilter = categoryFilterState[0];
  var setCategoryFilter = categoryFilterState[1];

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

  function _onPlayerMode(mode) {
    if (mode.id === 'inapp') {
      setPlayerMode('inapp');
    }
  }

  function _selectVisibleChannel(offset) {
    if (!visibleChannels || visibleChannels.length === 0) { return; }
    var currentIndex = 0;
    if (focusedChannel) {
      for (var i = 0; i < visibleChannels.length; i++) {
        if (visibleChannels[i] && visibleChannels[i].id === focusedChannel.id) {
          currentIndex = i;
          break;
        }
      }
    }
    var nextIndex = currentIndex + offset;
    if (nextIndex < 0) { nextIndex = visibleChannels.length - 1; }
    if (nextIndex >= visibleChannels.length) { nextIndex = 0; }
    var next = visibleChannels[nextIndex];
    if (!next) { return; }
    setFocusedChannel(next);
    if (typeof onItemSelect === 'function') { onItemSelect(next); }
  }

  function _handleTransport(action) {
    if (action === 'prev') { _selectVisibleChannel(-1); return; }
    if (action === 'next') { _selectVisibleChannel(1); return; }
    if (action === 'play' && focusedChannel && typeof onItemSelect === 'function') {
      onItemSelect(focusedChannel);
    }
  }

  function _activateRail(sectionId) {
    if (sectionId === 'epg') {
      if (typeof onOpenEPG === 'function') { onOpenEPG(); }
      return;
    }
    if (sectionId === 'settings') {
      if (typeof onOpenSettings === 'function') { onOpenSettings(); }
      return;
    }
    setActiveRail(sectionId);
  }

  function _focusRail(index) {
    var el = document.querySelector('[data-iptvnator-rail-index="' + index + '"]');
    if (el && typeof el.focus === 'function') {
      try { el.focus(); } catch (_) {}
    }
  }

  function _handleRailKey(e, sectionId, index) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (e.stopPropagation) { e.stopPropagation(); }
      _activateRail(sectionId);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'Down') {
      e.preventDefault();
      if (e.stopPropagation) { e.stopPropagation(); }
      _focusRail((index + 1) % rail.length);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'Up') {
      e.preventDefault();
      if (e.stopPropagation) { e.stopPropagation(); }
      _focusRail((index + rail.length - 1) % rail.length);
    }
  }

  var focusedTitle = focusedChannel ? (focusedChannel.title || 'Untitled') : '';
  var chosenName = (profile && (profile.chosen_name || profile.name)) || 'DaveTV viewer';

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
            DaveTV
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

        {rail.map(function(sec, index) {
          var isActive = activeRail === sec.id;
          return (
            <button
              key={sec.id}
              tabIndex={0}
              data-focusable="true"
              data-iptvnator-rail-index={index}
              aria-current={isActive ? 'page' : undefined}
              onClick={function() { _activateRail(sec.id); }}
              onKeyDown={function(e) { _handleRailKey(e, sec.id, index); }}
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

        {activeRail === 'favorites' && (
          <div
            style={{
              padding: '0.4rem 0.85rem 0.85rem',
              borderTop: '1px solid ' + COLOR_BORDER,
              marginTop: '0.3rem',
              fontSize: 'calc(0.7rem * var(--font-scale, 1))',
              color: COLOR_MUTED,
              lineHeight: 1.4,
            }}
          >
            Favorites will appear here after this profile saves channels.
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
                listening. DaveTV will surface stations here once a radio source is
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
                      {_currentProgrammeText(ch, nowByChannelId)}
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
                borderRadius: '8px',
                border: '1px solid ' + COLOR_BORDER,
              }}
            />
            <div style={{ fontSize: 'calc(0.95rem * var(--font-scale, 1))', fontWeight: 700 }}>
              {focusedTitle}
            </div>
            <div style={{ fontSize: 'calc(0.72rem * var(--font-scale, 1))', color: COLOR_MUTED }}>
              {_currentProgrammeText(focusedChannel, nowByChannelId)}
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
          ].map(function(btn) {
            return (
              <button
                key={btn.id}
                tabIndex={0}
                aria-label={btn.label}
                onClick={function() { _handleTransport(btn.id); }}
                onKeyDown={function(e) {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _handleTransport(btn.id); }
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
                    color: COLOR_TEXT,
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default IptvnatorShell;
