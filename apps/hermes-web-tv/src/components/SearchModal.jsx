import React from 'react';
import { searchCatalog } from '../api/searchClient.js';
import * as recentSearchesStore from '../store/recentSearchesStore.js';
import { debounce } from '../utils/debounce.js';
import LoadingSkeleton from './LoadingSkeleton.jsx';
import ErrorState from './ErrorState.jsx';
import EmptyState from './EmptyState.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// SearchModal — global "press / or Ctrl+K" search overlay.
//
// Wired by App.jsx (master-integration agent owns the actual mount). Pings
// the new /api/search endpoint added in PR #96 with a 200ms debounce so
// the API isn't hammered on every keystroke. Caches the last 10 queries in
// localStorage via recentSearchesStore.js so the user sees a useful empty
// state on second open.
//
// Props (all from App.jsx):
//   isOpen        boolean   — show/hide
//   onClose       () => void
//   onItemSelect  (item) => void — Enter on a result; closes after firing
//   profileId     string    — 'dave_tv' | 'mom_tv' — passed to the API so
//                             access-list filtering is honoured
//
// Tizen 6.5 / Chrome 76 safe: function-style component, ES5 idioms, no
// spread, no optional chaining, no nullish coalescing. Keyboard handling
// uses e.key (Tizen 6.5 ships modern KeyboardEvent.key support).
//
// Accessibility:
//   - role="dialog" + aria-modal + aria-labelledby on the panel
//   - Esc closes from any focus
//   - Result cards are <button> elements so screen readers announce them
//   - Search input is auto-focused on open + has aria-label
//   - Tabs are role="tablist" / role="tab" with aria-selected
//
// Honour .motion-reduced via the shared CSS (hermes-modal-overlay /
// hermes-modal-panel both strip animations under that body class). No
// further work needed in this file.
// ─────────────────────────────────────────────────────────────────────────────

var SEARCH_TABS = [
  { id: 'all',    label: 'All'    },
  { id: 'movies', label: 'Movies' },
  { id: 'series', label: 'Series' },
  { id: 'live',   label: 'Live'   },
  { id: 'actor',  label: 'Actor'  },
];

// Hint chips shown in the empty state when the user has never searched
// before (or has cleared their recent list). The strings double as
// suggested queries — click and the input auto-fills.
var EMPTY_STATE_HINTS = ['avatar', 'stranger things', 'al pacino'];

// Provider-id → human-readable label. Mirrors the badge labels rendered by
// ProviderBadge.jsx but kept inline so this modal stays a leaf component
// (no shared header dependency that App.jsx might lazy-load later).
function _providerLabel(item) {
  if (!item) { return ''; }
  if (item.provider && typeof item.provider === 'string') { return item.provider; }
  // The seed catalog projection from /api/search doesn't include provider,
  // but the category is a reasonable proxy ("Action", "Drama", "News").
  if (item.category && typeof item.category === 'string') { return item.category; }
  return '';
}

function _typeChipLabel(type) {
  if (type === 'live') { return 'Live'; }
  if (type === 'vod') { return 'Movie'; }
  if (type === 'series') { return 'Series'; }
  return type || '';
}

function _typeChipColor(type) {
  if (type === 'live') { return '#ef4444'; }   // red — live = airing now
  if (type === 'vod') { return '#22c55e'; }    // green — movie
  if (type === 'series') { return '#a78bfa'; } // purple — series
  return '#8b949e';                            // muted fallback
}

// ── Shared button focus / blur helpers ──
function _focusHalo(e) {
  e.currentTarget.style.boxShadow = 'var(--shadow-focus, 0 0 0 3px #00d4ff, 0 12px 36px rgba(0,212,255,0.35))';
  e.currentTarget.style.outline = 'none';
}
function _clearHalo(e) {
  e.currentTarget.style.boxShadow = 'none';
}

function SearchModal(props) {
  var isOpen = !!props.isOpen;
  var onClose = props.onClose;
  var onItemSelect = props.onItemSelect;
  var profileId = props.profileId;

  // ── State ─────────────────────────────────────────────────────────────
  var queryState = React.useState('');
  var query = queryState[0];
  var setQuery = queryState[1];

  var tabState = React.useState('all');
  var activeTab = tabState[0];
  var setActiveTab = tabState[1];

  var resultsState = React.useState([]);
  var results = resultsState[0];
  var setResults = resultsState[1];

  var loadingState = React.useState(false);
  var loading = loadingState[0];
  var setLoading = loadingState[1];

  var errorState = React.useState(null);
  var error = errorState[0];
  var setError = errorState[1];

  // Recent searches — read on every open so a second instance picks up
  // changes from the first. Kept in component state so the chip row
  // re-renders when addQuery() runs after a search.
  var recentState = React.useState([]);
  var recent = recentState[0];
  var setRecent = recentState[1];

  // ── Refs ──────────────────────────────────────────────────────────────
  // inputRef: drives autoFocus on open + lets hint chips push focus back
  //   to the input after a click.
  // abortRef: holds the AbortController for the most recent in-flight
  //   /api/search call. Each new keystroke aborts the previous one so
  //   the user never sees stale results from a slower earlier query.
  // requestIdRef: monotonic id; only the latest request is allowed to
  //   commit its results to state. Belt + braces alongside abortRef
  //   because AbortController is sometimes flaky on Tizen 6.5.
  var inputRef = React.useRef(null);
  var abortRef = React.useRef(null);
  var requestIdRef = React.useRef(0);

  // ── Helpers ───────────────────────────────────────────────────────────
  function runSearch(qInput, tabInput) {
    var q = (qInput || '').trim();
    var tab = tabInput || activeTab;
    if (q.length < 2) {
      // Empty / too short — clear results without firing a request so the
      // empty state can render the hint chips and the recent rail.
      setResults([]);
      setError(null);
      setLoading(false);
      // Abort any pending request that was queued by an earlier keystroke.
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch (e) { /* ignore */ }
        abortRef.current = null;
      }
      return;
    }
    // Cancel previous in-flight request.
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch (e) { /* ignore */ }
    }
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    abortRef.current = controller;
    var thisId = ++requestIdRef.current;

    setLoading(true);
    setError(null);
    searchCatalog({
      query: q,
      type: tab,
      limit: 24,
      profileId: profileId,
      signal: controller ? controller.signal : undefined,
    }).then(function(body) {
      if (thisId !== requestIdRef.current) { return; } // stale
      var list = (body && Array.isArray(body.results)) ? body.results : [];
      setResults(list);
      setLoading(false);
      // Persist the query AFTER a successful response — we don't pollute
      // recents with typos that never returned anything.
      recentSearchesStore.addQuery(q);
      setRecent(recentSearchesStore.listRecent());
    }).catch(function(err) {
      if (thisId !== requestIdRef.current) { return; } // stale
      // Silently ignore the synthetic 'aborted' from our own cancel — the
      // user kept typing, no need to surface a "request cancelled" error.
      if (err && err.code === 'aborted') { return; }
      setLoading(false);
      setResults([]);
      setError(err);
    });
  }

  // Debounced wrapper — 200ms per spec. Wrapped in useMemo so the same
  // debounced fn instance survives re-renders (otherwise every keystroke
  // would build a fresh timer and the debounce would never trigger).
  var debouncedSearch = React.useMemo(function() {
    return debounce(function(q, tab) {
      runSearch(q, tab);
    }, 200);
    // We intentionally don't list runSearch as a dep — React.useMemo
    // shouldn't churn the debouncer on every render. runSearch reads its
    // arguments and only-current refs/setters, so closing over a stale
    // reference is safe here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Effects ───────────────────────────────────────────────────────────
  // Mount/unmount: load recents, attach Esc handler, focus the input.
  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    setRecent(recentSearchesStore.listRecent());
    // Focus the input on open. React.useRef is null before mount so we
    // queue this in a microtask to give the input a chance to render.
    var raf = (typeof requestAnimationFrame === 'function')
      ? requestAnimationFrame(function() {
          if (inputRef.current) { inputRef.current.focus(); }
        })
      : setTimeout(function() {
          if (inputRef.current) { inputRef.current.focus(); }
        }, 0);

    function handleKeyDown(e) {
      if (e.key === 'Escape' && typeof onClose === 'function') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);

    return function cleanup() {
      document.removeEventListener('keydown', handleKeyDown);
      if (typeof cancelAnimationFrame === 'function' && typeof raf === 'number') {
        cancelAnimationFrame(raf);
      } else {
        clearTimeout(raf);
      }
      // Cancel any in-flight request on unmount so a delayed response
      // can't setState into an unmounted tree.
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch (e) { /* ignore */ }
        abortRef.current = null;
      }
      if (debouncedSearch && typeof debouncedSearch.cancel === 'function') {
        debouncedSearch.cancel();
      }
    };
  }, [isOpen, onClose, debouncedSearch]);

  // Reset transient state every time the modal closes — next open should
  // feel like a fresh session (empty input, no stale results).
  React.useEffect(function() {
    if (isOpen) { return; }
    setQuery('');
    setResults([]);
    setError(null);
    setLoading(false);
    setActiveTab('all');
  }, [isOpen]);

  // ── Handlers ──────────────────────────────────────────────────────────
  function handleQueryChange(e) {
    var v = e.target.value;
    setQuery(v);
    debouncedSearch(v, activeTab);
  }

  function handleTabClick(tabId) {
    setActiveTab(tabId);
    // Re-run the search with the new filter — but bypass the debounce
    // because the user just made an explicit click and expects an
    // immediate refresh, not a 200ms stutter.
    if (debouncedSearch && typeof debouncedSearch.cancel === 'function') {
      debouncedSearch.cancel();
    }
    runSearch(query, tabId);
  }

  function handleHintClick(hint) {
    setQuery(hint);
    if (inputRef.current) { inputRef.current.focus(); }
    // Hints are 1-3 words and the user clicked, so skip the debounce.
    if (debouncedSearch && typeof debouncedSearch.cancel === 'function') {
      debouncedSearch.cancel();
    }
    runSearch(hint, activeTab);
  }

  function handleRecentClick(q) {
    handleHintClick(q);
  }

  function handleResultActivate(item) {
    if (typeof onItemSelect === 'function' && item) { onItemSelect(item); }
    if (typeof onClose === 'function') { onClose(); }
  }

  function handleRetry() {
    runSearch(query, activeTab);
  }

  function handleInputKeyDown(e) {
    if (e.key === 'Enter') {
      // Enter on the input: if there's exactly one result, pick it. Else
      // force-flush the debounce and run the search now so the grid
      // updates immediately.
      if (results && results.length === 1) {
        handleResultActivate(results[0]);
        return;
      }
      if (debouncedSearch && typeof debouncedSearch.cancel === 'function') {
        debouncedSearch.cancel();
      }
      runSearch(query, activeTab);
    }
  }

  function handleClearInput() {
    setQuery('');
    setResults([]);
    setError(null);
    if (inputRef.current) { inputRef.current.focus(); }
    if (debouncedSearch && typeof debouncedSearch.cancel === 'function') {
      debouncedSearch.cancel();
    }
  }

  if (!isOpen) { return null; }

  // ── Render helpers ────────────────────────────────────────────────────
  function renderTabs() {
    return (
      <div
        role="tablist"
        aria-label="Search filter"
        style={{
          display: 'flex',
          gap: '0.4rem',
          padding: '0.75rem 1.25rem 0.4rem',
          flexWrap: 'wrap',
          borderBottom: '1px solid var(--border, #30363d)',
        }}
      >
        {SEARCH_TABS.map(function(t) {
          var isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              className="hermes-focusable hermes-press"
              onClick={function() { handleTabClick(t.id); }}
              onKeyDown={function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleTabClick(t.id);
                }
              }}
              style={{
                padding: '0.4rem 0.95rem',
                background: isActive
                  ? 'linear-gradient(135deg, rgba(0,212,255,0.18), rgba(99,102,241,0.12))'
                  : 'transparent',
                border: '1px solid ' + (isActive ? 'var(--accent, #00d4ff)' : 'var(--border, #30363d)'),
                borderRadius: 'var(--radius-pill, 999px)',
                color: isActive ? 'var(--accent, #00d4ff)' : 'var(--text, #e6edf3)',
                fontSize: 'calc(0.82rem * var(--font-scale, 1))',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              onFocus={_focusHalo}
              onBlur={_clearHalo}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    );
  }

  function renderHints() {
    return (
      <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div>
          <div style={{
            fontSize: 'calc(0.72rem * var(--font-scale, 1))',
            color: 'var(--muted, #8b949e)',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: '0.55rem',
          }}>
            Try
          </div>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            {EMPTY_STATE_HINTS.map(function(hint) {
              return (
                <button
                  key={hint}
                  tabIndex={0}
                  className="hermes-focusable hermes-press"
                  onClick={function() { handleHintClick(hint); }}
                  onKeyDown={function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleHintClick(hint);
                    }
                  }}
                  style={{
                    padding: '0.45rem 0.95rem',
                    background: 'rgba(0,212,255,0.08)',
                    border: '1px solid rgba(0,212,255,0.32)',
                    borderRadius: 'var(--radius-pill, 999px)',
                    color: 'var(--accent, #00d4ff)',
                    fontSize: 'calc(0.85rem * var(--font-scale, 1))',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  onFocus={_focusHalo}
                  onBlur={_clearHalo}
                >
                  {hint}
                </button>
              );
            })}
          </div>
        </div>

        {recent && recent.length > 0 && (
          <div>
            <div style={{
              fontSize: 'calc(0.72rem * var(--font-scale, 1))',
              color: 'var(--muted, #8b949e)',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: '0.55rem',
            }}>
              Recent
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              {recent.map(function(q) {
                return (
                  <button
                    key={q}
                    tabIndex={0}
                    className="hermes-focusable hermes-press"
                    onClick={function() { handleRecentClick(q); }}
                    onKeyDown={function(e) {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleRecentClick(q);
                      }
                    }}
                    style={{
                      padding: '0.4rem 0.9rem',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--border, #30363d)',
                      borderRadius: 'var(--radius-pill, 999px)',
                      color: 'var(--text, #e6edf3)',
                      fontSize: 'calc(0.8rem * var(--font-scale, 1))',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                    onFocus={_focusHalo}
                    onBlur={_clearHalo}
                  >
                    <span aria-hidden="true" style={{ marginRight: '0.35rem', opacity: 0.6 }}>↻</span>
                    {q}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderError() {
    return (
      <div style={{ padding: '1.25rem' }}>
        <ErrorState
          title="Couldn't reach search"
          message="The search service didn't respond. Try again in a moment."
          onRetry={handleRetry}
        />
      </div>
    );
  }

  function renderEmptyResults() {
    return (
      <div style={{ padding: '1.25rem' }}>
        <EmptyState
          icon="⌕"
          title={'No matches for "' + query + '"'}
          message="Try a different spelling or switch the filter tab."
        />
      </div>
    );
  }

  function renderResults() {
    return (
      <div
        role="list"
        aria-label="Search results"
        style={{
          padding: '0.85rem 1.25rem 1.4rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '0.85rem',
        }}
      >
        {results.map(function(item) {
          var poster = item.poster_url || item.logo_url || null;
          var typeChip = _typeChipLabel(item.type);
          var typeColor = _typeChipColor(item.type);
          var prov = _providerLabel(item);
          return (
            <button
              key={item.id}
              role="listitem"
              tabIndex={0}
              className="hermes-focusable hermes-press"
              aria-label={(item.title || 'Untitled') + (typeChip ? ' — ' + typeChip : '')}
              onClick={function() { handleResultActivate(item); }}
              onKeyDown={function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleResultActivate(item);
                }
              }}
              style={{
                display: 'flex', flexDirection: 'column',
                background: 'var(--surface-raised, #1c2128)',
                border: '1px solid var(--border, #30363d)',
                borderRadius: 'var(--radius-lg, 16px)',
                overflow: 'hidden',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--text, #e6edf3)',
                textAlign: 'left',
              }}
              onFocus={_focusHalo}
              onBlur={_clearHalo}
            >
              <div style={{
                position: 'relative',
                aspectRatio: '2 / 3',
                background: poster
                  ? 'linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.55) 100%), url("' + poster + '") center/cover no-repeat'
                  : 'linear-gradient(135deg, #1c2128 0%, #0d1117 100%)',
                width: '100%',
              }}>
                {/* Fallback "no poster" glyph — only when poster is missing. */}
                {!poster && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '32px', opacity: 0.4,
                  }} aria-hidden="true">▦</div>
                )}
                {/* Type chip — pinned to the top-left of the poster. */}
                {typeChip && (
                  <span style={{
                    position: 'absolute', top: '0.45rem', left: '0.45rem',
                    padding: '0.12rem 0.5rem',
                    background: typeColor,
                    color: '#0a1628',
                    borderRadius: 'var(--radius-pill, 999px)',
                    fontSize: 'calc(0.65rem * var(--font-scale, 1))',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}>{typeChip}</span>
                )}
              </div>
              <div style={{
                padding: '0.55rem 0.65rem 0.7rem',
                display: 'flex', flexDirection: 'column', gap: '0.3rem',
              }}>
                <div style={{
                  fontWeight: 700,
                  fontSize: 'calc(0.85rem * var(--font-scale, 1))',
                  lineHeight: 1.25,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  // Tizen 6.5 (Chrome 76) supports -webkit-line-clamp via
                  // the legacy -webkit-box layout. Modern `line-clamp` is
                  // Chromium 110+ so we stick with the vendor-prefixed form.
                }}>{item.title || 'Untitled'}</div>
                {prov && (
                  <span style={{
                    alignSelf: 'flex-start',
                    padding: '0.1rem 0.45rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border, #30363d)',
                    borderRadius: 'var(--radius-pill, 999px)',
                    fontSize: 'calc(0.65rem * var(--font-scale, 1))',
                    color: 'var(--muted, #8b949e)',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                  }}>{prov}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  function renderLoading() {
    // Shared LoadingSkeleton — grid variant gives a 4-up shimmer block that
    // matches the result grid, so the eye stays anchored where results
    // will land.
    return (
      <div style={{ padding: '0.85rem 1.25rem 1.4rem' }}>
        <LoadingSkeleton variant="grid" count={4} />
      </div>
    );
  }

  function renderBody() {
    if (error) { return renderError(); }
    if (loading) { return renderLoading(); }
    if (query.trim().length < 2) { return renderHints(); }
    if (results.length === 0) { return renderEmptyResults(); }
    return renderResults();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hermes-search-title"
      onClick={function(e) {
        if (e.target === e.currentTarget && typeof onClose === 'function') { onClose(); }
      }}
      className="hermes-modal-overlay"
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 60,
        background: 'rgba(5,8,14,0.78)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '6vh 2rem 3vh',
        overflowY: 'auto',
      }}
    >
      <div
        className="hermes-modal-panel"
        style={{
          width: '100%',
          maxWidth: '960px',
          background: 'var(--surface, #161b22)',
          color: 'var(--text, #e6edf3)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: 'var(--radius-xl, 22px)',
          boxShadow: 'var(--shadow-lg, 0 24px 64px rgba(0,0,0,0.6)), 0 0 0 1px rgba(255,255,255,0.02) inset',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header — gradient surface-raised → surface, mirrors SettingsPanelTabbed. */}
        <div
          className="hermes-gradient-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.4rem',
            borderBottom: '1px solid var(--border, #30363d)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            <div
              aria-hidden="true"
              style={{
                width: '38px', height: '38px',
                borderRadius: 'var(--radius-md, 12px)',
                background: 'rgba(0, 212, 255, 0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--accent, #00d4ff)',
                fontSize: '20px',
              }}
            >⌕</div>
            <div>
              <div id="hermes-search-title" style={{ fontWeight: 800, fontSize: 'calc(1.05rem * var(--font-scale, 1))' }}>
                Search
              </div>
              <div style={{ fontSize: 'calc(0.72rem * var(--font-scale, 1))', color: 'var(--muted, #8b949e)' }}>
                Movies, series, live channels, and people.
              </div>
            </div>
          </div>
          <button
            tabIndex={0}
            onClick={onClose}
            aria-label="Close search"
            className="hermes-focusable hermes-press"
            style={{
              width: '38px', height: '38px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border, #30363d)',
              color: 'var(--text, #e6edf3)',
              cursor: 'pointer',
              fontSize: '16px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
            onFocus={_focusHalo}
            onBlur={_clearHalo}
          >&times;</button>
        </div>

        {/* Search input row — 64px tall, monospace input for query, accent
            focus halo from the shared --shadow-focus recipe. */}
        <div style={{ padding: '1rem 1.4rem 0.5rem' }}>
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              height: '64px',
              background: 'var(--surface-raised, #1c2128)',
              border: '1px solid var(--border, #30363d)',
              borderRadius: 'var(--radius-lg, 16px)',
              padding: '0 1rem',
              gap: '0.7rem',
            }}
          >
            <span aria-hidden="true" style={{ color: 'var(--muted, #8b949e)', fontSize: '20px' }}>⌕</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleQueryChange}
              onKeyDown={handleInputKeyDown}
              aria-label="Search the catalog"
              placeholder="Search for a title, channel, or actor…"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              style={{
                flex: 1,
                height: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text, #e6edf3)',
                fontSize: 'calc(1.05rem * var(--font-scale, 1))',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                letterSpacing: '0.01em',
                minWidth: 0,
              }}
            />
            {query && (
              <button
                tabIndex={0}
                onClick={handleClearInput}
                aria-label="Clear search input"
                className="hermes-focusable hermes-press"
                style={{
                  width: '32px', height: '32px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--border, #30363d)',
                  color: 'var(--text, #e6edf3)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                }}
                onFocus={_focusHalo}
                onBlur={_clearHalo}
              >&times;</button>
            )}
          </div>
        </div>

        {renderTabs()}

        <div style={{ flex: 1, minHeight: '200px' }}>
          {renderBody()}
        </div>
      </div>
    </div>
  );
}

export default SearchModal;
