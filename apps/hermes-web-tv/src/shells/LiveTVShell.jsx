import React from 'react';
import { applyShellFilters, posterBg, useGridVirtualizer } from './shellHelpers.js';
import { debounce } from '../utils/debounce.js';
import ContinueWatchingRail from '../components/ContinueWatchingRail.jsx';
import CategorySidebar from '../components/CategorySidebar.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// LiveTVShell — HermesTV's live-first layout shell.
//
// The existing shells treat live TV as a side-tab. This one inverts the
// hierarchy: live channels are the entire page. The design takes the
// "now-playing big tile" rhythm from Zero, the "channel rail with category
// chips" navigation from Stremio, and the "channel-number quick-jump pad"
// affordance from TiviMate — but it is its own composition, not a clone of
// any single app.
//
// Five zones, top-to-bottom-left-to-right:
//   1. TOP       — Now Playing strip: a 16:9 preview of the focused channel.
//                  On `enhanced` tier this auto-plays a poster_url hero image;
//                  on `baseline`/`degraded` it shows a static thumbnail so we
//                  never blow the frame budget on a TV that can't take it.
//   2. LEFT      — Category/group filter rail. Groups are derived from the
//                  catalog (`item.category` ?? `metadata.genre`) — we never
//                  hard-code "Sports / News / Movies" because Mom's playlist
//                  might be all Hallmark and Dave's might be all sports.
//   3. CENTER    — 6-column grid of live channels. Each card carries the
//                  channel logo, the display name, and the current "Now"
//                  programme title.
//   4. RIGHT     — Mini EPG for the focused channel: 4–6 upcoming programmes
//                  with start time, title, duration. Uses `/api/epg/grid` when
//                  it answers; falls back to a deterministic placeholder list
//                  so an empty EPG never blanks the right rail.
//   5. BOTTOM    — 3×4 channel-number quick-jump pad. Typing digits also
//                  works from the keyboard; the buffer settles after 1.5 s and
//                  tunes to the channel whose `channel_number` matches.
//
// Tizen 6.5 / Chrome 76 compatibility:
//   - No `:has()`, no `@container`, no arrow functions in callbacks, no
//     optional chaining, no template strings, no spread.
//   - ES5-style function declarations + `var`.
//   - Same shellHelpers contract as every other shell.
// ─────────────────────────────────────────────────────────────────────────────

// Buffer-flush latency. 1.5 s mirrors the Tizen channel-number pad behaviour:
// long enough that "501" doesn't tune to 5 then 50 then 501, short enough
// that a single mis-press doesn't strand focus on the wrong card.
var JUMP_BUFFER_FLUSH_MS = 1500;

// How many upcoming programmes the mini EPG paints. Stremio shows 4, TiviMate
// shows 6 — we land at 5 so the right rail is balanced against the channel
// grid height at the 6-column layout.
var EPG_ENTRIES = 5;

// Empty-state copy lives in one place so layouts.json description, the empty
// view, and any future onboarding QR all use the same wording.
var EMPTY_LIVE_HEADLINE = 'No live channels yet';
var EMPTY_LIVE_BODY =
  'Import an M3U or Xtream playlist to start browsing live TV.';

// ─── Channel number resolver ─────────────────────────────────────────────────
// Live items in seedCatalog don't carry `channel_number`; the API's
// /api/channels endpoint stringifies the 1-based index. Mirror that here so a
// catalog with explicit numbers (real Xtream playlist) wins, and a catalog
// without falls back to the derived index — same value the channel-number pad
// would have shown anyway.
function _channelNumberOf(item, idx) {
  if (item && item.channel_number != null) {
    return String(item.channel_number);
  }
  if (item && item.metadata && item.metadata.channel_number != null) {
    return String(item.metadata.channel_number);
  }
  return String(idx + 1);
}

// ─── Category derivation moved to components/CategorySidebar.jsx ────────────
// The shared CategorySidebar component now derives the rail's chip list from
// the live items the shell passes in, so this file no longer needs its own
// helper. The accent / variant / mom-mode whitelisting all live in one place.

// ─── Mini EPG fallback ──────────────────────────────────────────────────────
// When /api/epg/grid is unreachable or returns nothing for this channel we
// still want the right rail populated — a blank rail makes the shell look
// broken on a freshly-deployed VPS. Generate a deterministic sequence keyed
// by the channel id so the same channel always shows the same placeholder
// schedule (no flicker between focus restores).
function _placeholderEPG(channel) {
  if (!channel) { return []; }
  var seed = 0;
  var key = channel.id || channel.title || 'x';
  for (var i = 0; i < key.length; i++) { seed = (seed + key.charCodeAt(i)) | 0; }
  if (seed < 0) { seed = -seed; }
  var titles = [
    'Top of the Hour',
    'Headlines',
    'Feature Programme',
    'Local Update',
    'Behind the Scenes',
    'Late Edition',
    'Special Report',
  ];
  var now = new Date();
  // Round to the next half-hour so the schedule looks plausible.
  var slot = new Date(now.getTime());
  slot.setSeconds(0, 0);
  var mins = slot.getMinutes();
  slot.setMinutes(mins < 30 ? 30 : 60);
  var out = [];
  for (var k = 0; k < EPG_ENTRIES; k++) {
    var dur = 30 + ((seed + k * 7) % 4) * 15; // 30 / 45 / 60 / 75 min
    var start = new Date(slot.getTime() + k * 30 * 60 * 1000);
    var end = new Date(start.getTime() + dur * 60 * 1000);
    out.push({
      title: titles[(seed + k) % titles.length],
      start: start,
      end: end,
      duration_min: dur,
    });
  }
  return out;
}

function _formatClock(date) {
  if (!date || typeof date.getHours !== 'function') { return ''; }
  var h = date.getHours();
  var m = date.getMinutes();
  var hh = h < 10 ? '0' + h : String(h);
  var mm = m < 10 ? '0' + m : String(m);
  return hh + ':' + mm;
}

function _formatDuration(min) {
  if (!min || min < 1) { return ''; }
  if (min < 60) { return min + ' min'; }
  var h = Math.floor(min / 60);
  var rem = min - h * 60;
  if (rem === 0) { return h + 'h'; }
  return h + 'h ' + rem + 'm';
}

function LiveTVShell(props) {
  var catalog = props.catalog;
  var profile = props.profile;
  var tier = props.tier;
  var providers = props.providers;
  var onItemSelect = props.onItemSelect;
  var contentFilter = props.contentFilter;
  var providerFilter = props.providerFilter;
  var qualityFilter = props.qualityFilter;

  var fontScale = (profile && profile.font_scale) || 1.0;

  // Apply the global filter chain then narrow to live items only — this shell
  // is a live-TV surface; non-live items have no home here.
  var filtered = applyShellFilters(catalog, contentFilter, providerFilter, qualityFilter);
  var liveItems = filtered.filter(function(i) { return i.type === 'live'; });

  // ─── State ────────────────────────────────────────────────────────────────
  // Category id matches the slug CategorySidebar emits ('all', 'sports', …).
  var categoryState = React.useState('all');
  var activeCategory = categoryState[0];
  var setActiveCategory = categoryState[1];

  var focusedState = React.useState(null);
  var focusedChannel = focusedState[0];
  var setFocusedChannel = focusedState[1];

  // The Now Playing preview renders LATE — the grid paints first, then on the
  // next frame we promote the focused channel to the hero. This keeps a slow
  // network image from blocking the first useful frame.
  var heroState = React.useState(null);
  var heroChannel = heroState[0];
  var setHeroChannel = heroState[1];

  var bufferState = React.useState('');
  var jumpBuffer = bufferState[0];
  var setJumpBuffer = bufferState[1];

  var epgState = React.useState([]);
  var miniEPG = epgState[0];
  var setMiniEPG = epgState[1];

  // ─── Derived ──────────────────────────────────────────────────────────────
  // CategorySidebar derives its own count list from liveItems — the helper
  // below (`_deriveCategoryGroups`) is kept only for the header-row count
  // and is no longer rendered as a chip strip.
  var displayChannels = liveItems;
  if (activeCategory !== 'all') {
    displayChannels = liveItems.filter(function(it) {
      var slug = (it && it.category) || (it && it.metadata && it.metadata.genre) || 'other';
      return String(slug).toLowerCase() === activeCategory;
    });
  }

  // Cards are 16:9 channel tiles, NOT 2:3 posters — wider columns work better.
  // 6 columns at QN85 enhanced; degrade to 4 on degraded tier so labels stay
  // readable on lower-end panels.
  var cols = tier === 'degraded' ? 4 : 6;

  var gridScrollRef = React.useRef(null);
  var virt = useGridVirtualizer({
    scrollRef: gridScrollRef,
    itemCount: displayChannels.length,
    columns: cols,
    rowHeight: 168, // 16:9 card + label + gap
    overscan: 1,
  });

  // ─── Focus restore: keep a stable focused channel as the user scrolls ─────
  React.useEffect(function() {
    // If the active category change orphaned the focused channel, retarget.
    if (!focusedChannel && displayChannels.length > 0) {
      setFocusedChannel(displayChannels[0]);
      return;
    }
    if (focusedChannel) {
      var stillVisible = false;
      for (var i = 0; i < displayChannels.length; i++) {
        if (displayChannels[i] === focusedChannel || displayChannels[i].id === focusedChannel.id) {
          stillVisible = true;
          break;
        }
      }
      if (!stillVisible) {
        setFocusedChannel(displayChannels[0] || null);
      }
    }
  }, [activeCategory, displayChannels, focusedChannel]);

  // ─── Hero promotion (lazy) ────────────────────────────────────────────────
  // Render the grid first. On a microtask after mount, promote the focused
  // channel into the hero slot. This guarantees the first paint contains the
  // grid and the right rail even if the hero is a slow remote image — Tizen's
  // image decoder can stall a frame on cold cache.
  React.useEffect(function() {
    if (!focusedChannel) { return; }
    var raf = null;
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      raf = window.requestAnimationFrame(function() {
        setHeroChannel(focusedChannel);
      });
    } else {
      setHeroChannel(focusedChannel);
    }
    return function() {
      if (raf !== null && typeof window !== 'undefined' && window.cancelAnimationFrame) {
        window.cancelAnimationFrame(raf);
      }
    };
  }, [focusedChannel]);

  // ─── Mini EPG fetch ───────────────────────────────────────────────────────
  // Try /api/epg/grid for the focused channel; on any failure (no profile_id,
  // 503, network), fall back to the deterministic placeholder schedule. We
  // never let an EPG error blank the right rail.
  React.useEffect(function() {
    if (!focusedChannel) { setMiniEPG([]); return; }
    var aborted = false;
    var profileId = (profile && profile.id) || 'dave_tv';
    var start = new Date();
    start.setSeconds(0, 0);
    var end = new Date(start.getTime() + 3 * 60 * 60 * 1000); // +3h window
    var url = '/api/epg/grid?profile_id=' + encodeURIComponent(profileId)
      + '&start=' + encodeURIComponent(start.toISOString())
      + '&end=' + encodeURIComponent(end.toISOString());
    if (typeof fetch !== 'function') {
      setMiniEPG(_placeholderEPG(focusedChannel));
      return;
    }
    fetch(url)
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(body) {
        if (aborted) { return; }
        var progs = body && body.programs;
        if (!progs || progs.length === 0) {
          setMiniEPG(_placeholderEPG(focusedChannel));
          return;
        }
        // Filter to this channel and normalise.
        var channelMatchId = 'live.' + (focusedChannel.id || '');
        var mine = progs.filter(function(p) {
          return p.channel_id === channelMatchId || p.channel_id === focusedChannel.id;
        });
        if (mine.length === 0) {
          setMiniEPG(_placeholderEPG(focusedChannel));
          return;
        }
        var slice = mine.slice(0, EPG_ENTRIES).map(function(p) {
          var s = new Date(p.start_utc);
          var e = new Date(p.end_utc);
          var dur = Math.round((e.getTime() - s.getTime()) / 60000);
          return { title: p.title, start: s, end: e, duration_min: dur };
        });
        setMiniEPG(slice);
      })
      .catch(function() {
        if (aborted) { return; }
        setMiniEPG(_placeholderEPG(focusedChannel));
      });
    return function() { aborted = true; };
  }, [focusedChannel, profile]);

  // ─── Channel-number quick-jump buffer ────────────────────────────────────
  // The buffer settles after 1.5 s of inactivity. When it settles, tune to
  // the channel whose `channel_number` matches the buffer. If no match,
  // discard silently — better than wrenching focus to "1" when the user
  // mis-typed.
  var debouncedFlush = React.useMemo(function() {
    return debounce(function() {
      // Read from the latest setJumpBuffer instead of stale closure — we
      // pass the latest value through setState's functional form below.
      setJumpBuffer(function(buf) {
        if (!buf) { return ''; }
        var target = null;
        for (var i = 0; i < liveItems.length; i++) {
          var num = _channelNumberOf(liveItems[i], i);
          if (num === buf) { target = liveItems[i]; break; }
        }
        if (target) {
          setFocusedChannel(target);
          if (typeof onItemSelect === 'function') { onItemSelect(target); }
        }
        return ''; // always clear the buffer after settle
      });
    }, JUMP_BUFFER_FLUSH_MS);
  }, [liveItems, onItemSelect]);

  React.useEffect(function() {
    return function() { debouncedFlush.cancel(); };
  }, [debouncedFlush]);

  function _pushDigit(digit) {
    setJumpBuffer(function(buf) { return (buf + digit).slice(0, 4); });
    debouncedFlush();
  }
  function _clearBuffer() {
    debouncedFlush.cancel();
    setJumpBuffer('');
  }

  // ─── Keyboard wiring ─────────────────────────────────────────────────────
  // Arrow keys move the focused channel through the grid; digits push to the
  // buffer; Enter tunes the focused channel; Esc clears the buffer.
  // Implemented at the shell root so a single listener captures everything,
  // and individual cards don't need their own arrow handlers.
  function _handleKeyDown(e) {
    var key = e.key;
    if (key === 'Escape') {
      e.preventDefault();
      _clearBuffer();
      return;
    }
    if (key === 'Enter') {
      // Don't preventDefault here — buttons inside still want native click
      // through the Enter key for screen readers.
      if (focusedChannel && typeof onItemSelect === 'function') {
        onItemSelect(focusedChannel);
      }
      return;
    }
    if (key && key.length === 1 && key >= '0' && key <= '9') {
      // Don't intercept if the user is typing in an <input> — Mom would hate
      // having search keystrokes eaten by the channel-number buffer.
      var t = e.target;
      var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) {
        return;
      }
      e.preventDefault();
      _pushDigit(key);
      return;
    }
    if (key === 'ArrowRight' || key === 'ArrowLeft' || key === 'ArrowUp' || key === 'ArrowDown') {
      if (!focusedChannel || displayChannels.length === 0) { return; }
      e.preventDefault();
      var idx = -1;
      for (var i = 0; i < displayChannels.length; i++) {
        if (displayChannels[i] === focusedChannel || displayChannels[i].id === focusedChannel.id) {
          idx = i; break;
        }
      }
      if (idx < 0) { idx = 0; }
      var next = idx;
      if (key === 'ArrowRight') { next = Math.min(displayChannels.length - 1, idx + 1); }
      else if (key === 'ArrowLeft') { next = Math.max(0, idx - 1); }
      else if (key === 'ArrowDown') { next = Math.min(displayChannels.length - 1, idx + cols); }
      else if (key === 'ArrowUp') { next = Math.max(0, idx - cols); }
      if (next !== idx) {
        setFocusedChannel(displayChannels[next]);
      }
    }
  }

  // Open the playlist-import modal when present (parallel-agent component).
  // We dispatch a custom event the shell host listens for — same pattern
  // other shells use to hand off cross-shell modals.
  function _openImportModal() {
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        var ev;
        if (typeof window.CustomEvent === 'function') {
          ev = new window.CustomEvent('hermes:open-playlist-import', { bubbles: true });
        } else {
          // CustomEvent polyfill for Tizen 6.5 just in case.
          ev = document.createEvent('Event');
          ev.initEvent('hermes:open-playlist-import', true, true);
        }
        window.dispatchEvent(ev);
      }
    } catch (_) { /* no-op: opening the modal is best-effort */ }
  }

  // ─── Initial focus ───────────────────────────────────────────────────────
  // Drop Tizen remote focus onto the first channel card so arrow-key
  // traversal works out of the box, matching the other shells.
  React.useEffect(function() {
    var el = document.querySelector('[data-live-channel="true"]');
    if (el && typeof el.focus === 'function') {
      try { el.focus(); } catch (_) {}
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Empty state ─────────────────────────────────────────────────────────
  if (liveItems.length === 0) {
    return (
      <div
        className="live-tv-shell live-tv-shell--empty"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '2rem',
          background: 'var(--bg, #0a0e1a)',
          color: 'var(--text, #e6edf3)',
          fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
          textAlign: 'center',
        }}
      >
        <div aria-hidden="true" style={{ fontSize: '4rem', marginBottom: '1rem', color: 'var(--accent, #00d4ff)' }}>
          📡
        </div>
        <div style={{ fontSize: 'calc(1.5rem * ' + fontScale + ')', fontWeight: 800, marginBottom: '0.5rem' }}>
          {EMPTY_LIVE_HEADLINE}
        </div>
        <div style={{ fontSize: 'calc(0.9rem * ' + fontScale + ')', color: 'var(--muted, #8b949e)', maxWidth: '480px', marginBottom: '1.5rem' }}>
          {EMPTY_LIVE_BODY}
        </div>
        <button
          tabIndex={0}
          onClick={_openImportModal}
          onKeyDown={function(e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _openImportModal(); }
          }}
          style={{
            padding: '0.65rem 1.4rem',
            background: 'linear-gradient(135deg, var(--accent, #00d4ff), #6366f1)',
            color: '#0a0e1a',
            border: 'none',
            borderRadius: '8px',
            fontSize: 'calc(0.85rem * ' + fontScale + ')',
            fontWeight: 700,
            cursor: 'pointer',
            outline: 'none',
          }}
          onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent, #00d4ff)'; }}
          onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
        >
          Import a playlist
        </button>
      </div>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────
  return (
    <div
      className="live-tv-shell"
      tabIndex={-1}
      onKeyDown={_handleKeyDown}
      style={{
        display: 'grid',
        gridTemplateColumns: '180px 1fr 280px',
        gridTemplateRows: '220px 1fr auto',
        gap: '12px',
        height: '100%',
        padding: '12px',
        background: 'var(--bg, #0a0e1a)',
        color: 'var(--text, #e6edf3)',
        fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* ─── ZONE 1: NOW PLAYING STRIP (top, spans all 3 cols) ─────────── */}
      <section
        aria-label="Now playing"
        style={{
          gridColumn: '1 / -1',
          gridRow: '1',
          position: 'relative',
          background: heroChannel ? posterBg(heroChannel, 0) : 'var(--surface, #161b22)',
          borderRadius: '14px',
          overflow: 'hidden',
          border: '1px solid var(--border, #1a2030)',
          display: 'flex',
          alignItems: 'flex-end',
          padding: '20px 24px',
        }}
      >
        {/* Gradient veil so the title is legible over any artwork. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(0deg, rgba(10,14,26,0.85) 0%, rgba(10,14,26,0.2) 60%, rgba(10,14,26,0) 100%)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '70%' }}>
          <div style={{ fontSize: 'calc(0.7rem * ' + fontScale + ')', color: 'var(--accent, #00d4ff)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {tier === 'enhanced' ? 'LIVE · Now Playing' : 'Now Playing'}
          </div>
          <div style={{ fontSize: 'calc(1.6rem * ' + fontScale + ')', fontWeight: 800, lineHeight: 1.1 }}>
            {heroChannel ? (heroChannel.title || 'Untitled channel') : 'Select a channel'}
          </div>
          <div style={{ fontSize: 'calc(0.85rem * ' + fontScale + ')', color: 'var(--muted, #c9d1d9)' }}>
            {heroChannel ? (
              (heroChannel.category || (heroChannel.metadata && heroChannel.metadata.genre) || 'Live broadcast')
              + ' · '
              + ((heroChannel.metadata && heroChannel.metadata.resolution) || heroChannel.quality || 'SD')
            ) : 'Use arrow keys or the channel number pad to tune.'}
          </div>
        </div>
        {/* Tier badge — operator can tell at a glance whether auto-play is on. */}
        <div
          style={{
            position: 'absolute', top: '12px', right: '12px',
            zIndex: 1,
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 10px',
            background: 'rgba(10,14,26,0.7)',
            borderRadius: '999px',
            border: '1px solid var(--border, #1a2030)',
            fontSize: 'calc(0.62rem * ' + fontScale + ')',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: tier === 'enhanced' ? 'var(--accent, #00d4ff)' : 'var(--muted, #8b949e)',
          }}
        >
          <span aria-hidden="true">{tier === 'enhanced' ? '●' : '○'}</span>
          <span>{tier === 'enhanced' ? 'Auto-preview' : (tier === 'degraded' ? 'Static thumb' : 'Standard')}</span>
        </div>
      </section>

      {/* ─── ZONE 2: LEFT CATEGORY RAIL ────────────────────────────────── */}
      {/* Now powered by the shared CategorySidebar so every live-focused
          shell (TiviMate / LiveTV / Iptvnator / DavePower / Mom / Extreme)
          renders the same chip set with consistent keyboard navigation. */}
      <aside
        aria-label="Channel categories"
        style={{
          gridColumn: '1',
          gridRow: '2',
          background: 'var(--surface, #161b22)',
          border: '1px solid var(--border, #1a2030)',
          borderRadius: '12px',
          padding: '4px',
          overflow: 'hidden',
        }}
      >
        <CategorySidebar
          items={liveItems}
          activeId={activeCategory}
          onSelect={setActiveCategory}
          fontScale={fontScale}
          title="Categories"
        />
      </aside>

      {/* ─── ZONE 3: CENTER CHANNEL GRID ───────────────────────────────── */}
      <main
        ref={gridScrollRef}
        style={{
          gridColumn: '2',
          gridRow: '2',
          background: 'var(--surface, #161b22)',
          border: '1px solid var(--border, #1a2030)',
          borderRadius: '12px',
          padding: '12px',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {/* Continue Watching rail — sits just below the Now Playing strip
            (the strip spans this column above) and before the channel grid. */}
        <ContinueWatchingRail profileId={profile && (profile.profile_id || profile.id)} onItemSelect={onItemSelect} profile={profile} fontScale={fontScale} max={8} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontSize: 'calc(0.85rem * ' + fontScale + ')', fontWeight: 700 }}>
            {activeCategory === 'all' ? 'All channels' : activeCategory}
            <span style={{ marginLeft: '8px', color: 'var(--muted, #8b949e)', fontWeight: 400, fontSize: 'calc(0.7rem * ' + fontScale + ')' }}>
              {displayChannels.length} {displayChannels.length === 1 ? 'channel' : 'channels'}
            </span>
          </div>
          {(providers && providers.length > 0) && (
            <div style={{ fontSize: 'calc(0.62rem * ' + fontScale + ')', color: 'var(--muted, #8b949e)' }}>
              {providers.length} {providers.length === 1 ? 'playlist' : 'playlists'}
            </div>
          )}
        </div>

        {displayChannels.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted, #8b949e)' }}>
            No channels in this category.
          </div>
        ) : (
          <React.Fragment>
            {virt.topSpacer > 0 && (
              <div aria-hidden="true" style={{ height: virt.topSpacer + 'px' }} />
            )}
            {/* auto-fill minmax(200 px) keeps 16:9 channel tiles dense
                inside the centre column (≈1460 px after the 180 px category
                rail + 280 px EPG pane) — 5-7 cols × 3 rows visible at once. */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '10px',
              }}
            >
              {displayChannels.slice(virt.startIndex, virt.endIndex).map(function(item, sliceIdx) {
                var idx = virt.startIndex + sliceIdx;
                var isFocused = focusedChannel && (focusedChannel === item || focusedChannel.id === item.id);
                var bg = posterBg(item, idx);
                var num = _channelNumberOf(item, idx);
                var nowProgTitle = (item.metadata && item.metadata.now_title)
                  || (item.metadata && item.metadata.genre)
                  || 'Live';
                return (
                  <button
                    key={item.id || idx}
                    tabIndex={0}
                    data-live-channel="true"
                    data-focused={isFocused ? 'true' : 'false'}
                    aria-label={'Channel ' + num + ': ' + (item.title || 'Untitled')}
                    onClick={function() {
                      setFocusedChannel(item);
                      if (typeof onItemSelect === 'function') { onItemSelect(item); }
                    }}
                    onFocus={function() { setFocusedChannel(item); }}
                    style={{
                      position: 'relative',
                      padding: 0,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      outline: 'none',
                    }}
                  >
                    <div
                      style={{
                        position: 'relative',
                        aspectRatio: '16 / 9',
                        background: bg,
                        borderRadius: '8px',
                        overflow: 'hidden',
                        boxShadow: isFocused ? '0 0 0 3px var(--accent, #00d4ff), 0 6px 20px rgba(0,212,255,0.35)' : '0 4px 14px rgba(0,0,0,0.35)',
                        transform: isFocused ? 'scale(1.03)' : 'scale(1)',
                        transition: 'transform 120ms ease, box-shadow 120ms ease',
                      }}
                    >
                      {/* Channel number chip — top-left */}
                      <span
                        style={{
                          position: 'absolute', top: '6px', left: '6px',
                          padding: '2px 6px',
                          fontSize: 'calc(0.6rem * ' + fontScale + ')',
                          fontWeight: 800,
                          color: '#0a0e1a',
                          background: 'rgba(255,255,255,0.95)',
                          borderRadius: '4px',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {num}
                      </span>
                      {/* LIVE dot — top-right */}
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute', top: '6px', right: '6px',
                          display: 'flex', alignItems: 'center', gap: '4px',
                          padding: '2px 7px',
                          fontSize: 'calc(0.55rem * ' + fontScale + ')',
                          fontWeight: 800,
                          color: '#fff',
                          background: 'rgba(229,9,20,0.92)',
                          borderRadius: '999px',
                          letterSpacing: '0.08em',
                        }}
                      >
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
                        LIVE
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: '6px',
                        display: 'flex', flexDirection: 'column', gap: '1px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 'calc(0.72rem * ' + fontScale + ')',
                          fontWeight: 700,
                          color: 'var(--text, #e6edf3)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.title || 'Untitled'}
                      </div>
                      <div
                        style={{
                          fontSize: 'calc(0.62rem * ' + fontScale + ')',
                          color: 'var(--muted, #8b949e)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {nowProgTitle}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {virt.bottomSpacer > 0 && (
              <div aria-hidden="true" style={{ height: virt.bottomSpacer + 'px' }} />
            )}
          </React.Fragment>
        )}
      </main>

      {/* ─── ZONE 4: RIGHT MINI EPG ─────────────────────────────────────── */}
      <aside
        aria-label={'Upcoming on ' + (focusedChannel ? (focusedChannel.title || 'channel') : 'channel')}
        style={{
          gridColumn: '3',
          gridRow: '2',
          background: 'var(--surface, #161b22)',
          border: '1px solid var(--border, #1a2030)',
          borderRadius: '12px',
          padding: '12px',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        <div style={{ fontSize: 'calc(0.62rem * ' + fontScale + ')', color: 'var(--muted, #8b949e)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
          Coming up
        </div>
        <div style={{ fontSize: 'calc(0.85rem * ' + fontScale + ')', fontWeight: 700, marginBottom: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {focusedChannel ? (focusedChannel.title || 'Untitled') : '—'}
        </div>
        {miniEPG.length === 0 ? (
          <div style={{ color: 'var(--muted, #8b949e)', fontSize: 'calc(0.72rem * ' + fontScale + ')' }}>
            No schedule available.
          </div>
        ) : (
          miniEPG.map(function(p, i) {
            var isNow = i === 0;
            return (
              <div
                key={i}
                style={{
                  display: 'flex', flexDirection: 'column', gap: '2px',
                  padding: '8px 10px',
                  borderLeft: isNow ? '3px solid var(--accent, #00d4ff)' : '3px solid transparent',
                  background: isNow ? 'var(--surface-raised, #1c2128)' : 'transparent',
                  borderRadius: '6px',
                  marginBottom: '4px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: 'calc(0.68rem * ' + fontScale + ')', fontWeight: 700, color: isNow ? 'var(--accent, #00d4ff)' : 'var(--muted, #c9d1d9)' }}>
                    {_formatClock(p.start)}
                  </span>
                  <span style={{ fontSize: 'calc(0.6rem * ' + fontScale + ')', color: 'var(--muted, #8b949e)' }}>
                    {_formatDuration(p.duration_min)}
                  </span>
                </div>
                <div style={{ fontSize: 'calc(0.75rem * ' + fontScale + ')', fontWeight: isNow ? 700 : 500, color: 'var(--text, #e6edf3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.title}
                </div>
              </div>
            );
          })
        )}
      </aside>

      {/* ─── ZONE 5: BOTTOM CHANNEL-NUMBER QUICK-JUMP PAD ────────────────── */}
      <section
        aria-label="Channel number quick-jump"
        style={{
          gridColumn: '1 / -1',
          gridRow: '3',
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          gap: '12px',
          alignItems: 'center',
          background: 'var(--surface, #161b22)',
          border: '1px solid var(--border, #1a2030)',
          borderRadius: '12px',
          padding: '10px 14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span aria-hidden="true" style={{ color: 'var(--accent, #00d4ff)', fontSize: '14px' }}>#</span>
          <span style={{ fontSize: 'calc(0.7rem * ' + fontScale + ')', color: 'var(--muted, #8b949e)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Quick jump
          </span>
          <span
            aria-live="polite"
            style={{
              padding: '4px 10px',
              minWidth: '60px',
              textAlign: 'center',
              background: 'var(--bg, #0a0e1a)',
              border: '1px solid var(--border, #1a2030)',
              borderRadius: '6px',
              fontFamily: '"Roboto Mono", "Consolas", monospace',
              fontSize: 'calc(0.95rem * ' + fontScale + ')',
              fontWeight: 700,
              color: jumpBuffer ? 'var(--accent, #00d4ff)' : 'var(--muted, #8b949e)',
              letterSpacing: '0.12em',
            }}
          >
            {jumpBuffer || '— —'}
          </span>
        </div>

        {/* 3 × 4 numpad: 1-9, then 0 centred between Clear and Tune. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 40px)',
            gridAutoRows: '32px',
            gap: '4px',
            justifyContent: 'center',
          }}
        >
          {['1','2','3','4','5','6','7','8','9'].map(function(d) {
            return (
              <button
                key={d}
                tabIndex={0}
                aria-label={'Digit ' + d}
                onClick={function() { _pushDigit(d); }}
                onKeyDown={function(e) {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _pushDigit(d); }
                }}
                style={{
                  background: 'var(--bg, #0a0e1a)',
                  border: '1px solid var(--border, #1a2030)',
                  color: 'var(--text, #e6edf3)',
                  borderRadius: '6px',
                  fontFamily: '"Roboto Mono", "Consolas", monospace',
                  fontWeight: 700,
                  fontSize: 'calc(0.85rem * ' + fontScale + ')',
                  cursor: 'pointer',
                  outline: 'none',
                }}
                onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
                onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
              >
                {d}
              </button>
            );
          })}
          <button
            tabIndex={0}
            aria-label="Clear"
            onClick={_clearBuffer}
            onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _clearBuffer(); } }}
            style={{
              background: 'transparent',
              border: '1px solid var(--border, #1a2030)',
              color: 'var(--muted, #8b949e)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 'calc(0.7rem * ' + fontScale + ')',
              outline: 'none',
            }}
            onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
            onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
          >
            CLR
          </button>
          <button
            tabIndex={0}
            aria-label="Digit 0"
            onClick={function() { _pushDigit('0'); }}
            onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _pushDigit('0'); } }}
            style={{
              background: 'var(--bg, #0a0e1a)',
              border: '1px solid var(--border, #1a2030)',
              color: 'var(--text, #e6edf3)',
              borderRadius: '6px',
              fontFamily: '"Roboto Mono", "Consolas", monospace',
              fontWeight: 700,
              fontSize: 'calc(0.85rem * ' + fontScale + ')',
              cursor: 'pointer',
              outline: 'none',
            }}
            onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
            onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
          >
            0
          </button>
          <button
            tabIndex={0}
            aria-label="Tune"
            onClick={function() {
              // Manual flush — useful for the user who hits "Tune" instead of
              // waiting out the 1.5 s debounce.
              debouncedFlush.cancel();
              setJumpBuffer(function(buf) {
                if (!buf) { return ''; }
                var target = null;
                for (var i = 0; i < liveItems.length; i++) {
                  var n = _channelNumberOf(liveItems[i], i);
                  if (n === buf) { target = liveItems[i]; break; }
                }
                if (target) {
                  setFocusedChannel(target);
                  if (typeof onItemSelect === 'function') { onItemSelect(target); }
                }
                return '';
              });
            }}
            onKeyDown={function(e) {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.currentTarget.click();
              }
            }}
            style={{
              background: 'linear-gradient(135deg, var(--accent, #00d4ff), #6366f1)',
              border: 'none',
              color: '#0a0e1a',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: 'calc(0.7rem * ' + fontScale + ')',
              outline: 'none',
            }}
            onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px #fff'; }}
            onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
          >
            TUNE
          </button>
        </div>

        <div style={{ fontSize: 'calc(0.62rem * ' + fontScale + ')', color: 'var(--muted, #8b949e)', textAlign: 'right' }}>
          <div>Arrow keys: move focus</div>
          <div>0-9: channel number · Esc: clear</div>
        </div>
      </section>
    </div>
  );
}

export default LiveTVShell;
