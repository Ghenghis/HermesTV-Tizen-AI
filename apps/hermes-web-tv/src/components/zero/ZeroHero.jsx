import React from 'react';
import { posterBg } from '../../shells/shellHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// ZeroHero — cinematic hero panel that reflects the currently-focused item.
//
// Design lineage: IPTV Player Zero's loading-card aesthetic (radial blue/cyan
// gradient glow, blurred backdrop, 28 px rounded glass card) extended into a
// hero banner that sits above the catalog grid. When the user moves focus
// over a poster, this panel updates to show that item's artwork + metadata.
// When no item is focused, falls back to a "Welcome back, {nickname}" card
// so the empty state still feels intentional.
//
// Inputs:
//   focusedItem — item object from the catalog; null when nothing is hovered
//                 (cold-load or sidebar focus). Drives the background art,
//                 title, year, type chip, and rating.
//   profile     — Sherri/Dave profile. Drives nickname and font_scale.
//   tier        — 'enhanced' / 'limited' / 'degraded'. Mom's TV always gets
//                 'enhanced' per the MEMORY.md asymmetric performance rule.
//   onPlay      — fires when the user clicks the primary Watch CTA. The
//                 parent shell typically routes to onItemSelect(focusedItem).
//   onMoreInfo  — fires for the secondary More Info CTA. Parent should open
//                 the detail drawer (same handler the poster click uses).
//
// Tizen 6.5 / Chrome 76 safe: no template literals, no arrow funcs, no
// destructuring, no optional chaining. Inline styles match the Zero
// preboot card recipe from frontend_src_clean/index.html line 68–80.
// ─────────────────────────────────────────────────────────────────────────────

function _ratingFor(item) {
  if (!item) { return null; }
  if (typeof item.user_rating === 'number') { return item.user_rating; }
  if (item.metadata && typeof item.metadata.imdb_rating === 'number') {
    return item.metadata.imdb_rating;
  }
  return null;
}

function _typeLabel(item) {
  if (!item) { return ''; }
  if (item.type === 'live') { return 'LIVE'; }
  if (item.type === 'series') { return 'SERIES'; }
  return 'MOVIE';
}

function _nickname(profile) {
  if (!profile) { return 'there'; }
  return profile.nickname || profile.display_name || profile.profile_id || 'there';
}

function ZeroHero(props) {
  var focusedItem = props.focusedItem;
  var profile = props.profile;
  var tier = props.tier;
  var onPlay = props.onPlay;
  var onMoreInfo = props.onMoreInfo;

  var fontScale = (profile && profile.font_scale) || 1.0;
  var allowMotion = tier === 'enhanced' && !(profile && profile.reduced_motion);

  // Background art: focused item poster, or a deterministic gradient that
  // matches the Zero preboot card aesthetic when nothing is focused.
  var bg = focusedItem
    ? posterBg(focusedItem, 0)
    : 'radial-gradient(circle at 20% 30%, rgba(90,130,255,0.22), transparent 38%),'
      + ' radial-gradient(circle at 80% 80%, rgba(65,190,220,0.18), transparent 44%),'
      + ' linear-gradient(180deg, #171b23 0%, #0f1218 100%)';

  var title = focusedItem ? (focusedItem.title || 'Untitled') : ('Welcome back, ' + _nickname(profile));
  var subtitle = focusedItem
    ? (focusedItem.metadata && focusedItem.metadata.description)
      || ((focusedItem.year || '') + (focusedItem.genre ? ' · ' + focusedItem.genre : ''))
      || 'Tap OK on the remote to watch.'
    : 'Move the remote over a poster to preview it here. Press OK to watch, or use Info for more.';
  var rating = _ratingFor(focusedItem);
  var typeLabel = _typeLabel(focusedItem);

  return (
    <div
      role="region"
      aria-label="Featured preview"
      style={{
        position: 'relative',
        margin: '12px 16px 16px',
        // Match the Zero preboot card: 28 px rounded, blurred backdrop,
        // dark glass body with subtle stroke.
        borderRadius: '28px',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
        background: bg,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        boxShadow: '0 24px 80px rgba(0,0,0,0.38)',
        minHeight: '220px',
        transition: allowMotion ? 'background-image 250ms ease' : 'none',
      }}
    >
      {/* Glass darkening scrim — keeps the title readable over any artwork. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg, rgba(15,18,24,0.92) 0%, rgba(15,18,24,0.55) 55%, rgba(15,18,24,0.05) 100%)',
        }}
      />

      <div
        style={{
          position: 'relative',
          padding: '22px 28px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxWidth: '62%',
        }}
      >
        {/* Type chip + rating chip row */}
        {focusedItem && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 'calc(0.62rem * ' + fontScale + ')',
                fontWeight: 800,
                letterSpacing: '0.12em',
                color: '#0a0e1a',
                background: 'linear-gradient(90deg, #77a7ff 0%, #56d2f1 100%)',
                padding: '3px 10px',
                borderRadius: '999px',
              }}
            >
              {typeLabel}
            </span>
            {rating !== null && (
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  fontSize: 'calc(0.65rem * ' + fontScale + ')',
                  fontWeight: 700,
                  color: '#0a0e1a',
                  background: 'rgba(250,204,21,0.95)',
                  padding: '2px 8px',
                  borderRadius: '999px',
                }}
              >
                <span aria-hidden="true">★</span>
                {Number(rating).toFixed(1)}
              </span>
            )}
            {focusedItem.quality && (
              <span
                style={{
                  fontSize: 'calc(0.6rem * ' + fontScale + ')',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: '#56d2f1',
                  border: '1px solid #56d2f1',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: 'transparent',
                }}
              >
                {focusedItem.quality}
              </span>
            )}
          </div>
        )}

        <h1
          style={{
            margin: 0,
            fontSize: 'calc(2.1rem * ' + fontScale + ')',
            fontWeight: 800,
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
            color: '#f5f7fb',
            textShadow: '0 2px 8px rgba(0,0,0,0.6)',
            // Limit to 2 lines so long Apollo titles never push the CTAs off
            // the visible card. clamp is supported on Chrome 76+.
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {title}
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: 'calc(0.85rem * ' + fontScale + ')',
            lineHeight: 1.45,
            color: 'rgba(225,231,240,0.78)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {subtitle}
        </p>

        {/* CTAs — only shown when an item is focused. The empty state is a
            pure greeting, no clickable surface, so the user's first instinct
            is still to move the remote over a poster. */}
        {focusedItem && (
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              type="button"
              tabIndex={0}
              data-zero-hero-cta="play"
              data-focusable="true"
              data-focus-group="zero-hero"
              aria-label={'Watch ' + (focusedItem.title || 'now')}
              onClick={function() { if (typeof onPlay === 'function') { onPlay(focusedItem); } }}
              onKeyDown={function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (typeof onPlay === 'function') { onPlay(focusedItem); }
                }
              }}
              style={{
                padding: '10px 22px',
                background: 'linear-gradient(90deg, #77a7ff 0%, #56d2f1 100%)',
                color: '#0a0e1a',
                fontWeight: 800,
                fontSize: 'calc(0.85rem * ' + fontScale + ')',
                letterSpacing: '0.02em',
                border: 'none',
                borderRadius: '999px',
                cursor: 'pointer',
                outline: 'none',
                boxShadow: '0 6px 18px rgba(86,210,241,0.35)',
                transition: allowMotion ? 'transform 150ms ease, box-shadow 150ms ease' : 'none',
              }}
              onFocus={function(e) {
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(86,210,241,0.5), 0 6px 18px rgba(86,210,241,0.35)';
                if (allowMotion) { e.currentTarget.style.transform = 'translateY(-1px)'; }
              }}
              onBlur={function(e) {
                e.currentTarget.style.boxShadow = '0 6px 18px rgba(86,210,241,0.35)';
                if (allowMotion) { e.currentTarget.style.transform = 'translateY(0)'; }
              }}
            >
              <span aria-hidden="true" style={{ marginRight: '6px' }}>▶</span>
              Watch
            </button>
            <button
              type="button"
              tabIndex={0}
              data-zero-hero-cta="info"
              data-focusable="true"
              data-focus-group="zero-hero"
              aria-label={'More info about ' + (focusedItem.title || 'this title')}
              onClick={function() { if (typeof onMoreInfo === 'function') { onMoreInfo(focusedItem); } }}
              onKeyDown={function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (typeof onMoreInfo === 'function') { onMoreInfo(focusedItem); }
                }
              }}
              style={{
                padding: '10px 22px',
                background: 'rgba(15,18,24,0.65)',
                color: '#eef2f7',
                fontWeight: 700,
                fontSize: 'calc(0.85rem * ' + fontScale + ')',
                letterSpacing: '0.02em',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: '999px',
                cursor: 'pointer',
                outline: 'none',
                backdropFilter: 'blur(8px)',
                transition: allowMotion ? 'background 150ms ease, border-color 150ms ease' : 'none',
              }}
              onFocus={function(e) {
                e.currentTarget.style.borderColor = '#56d2f1';
                e.currentTarget.style.background = 'rgba(86,210,241,0.12)';
              }}
              onBlur={function(e) {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
                e.currentTarget.style.background = 'rgba(15,18,24,0.65)';
              }}
            >
              <span aria-hidden="true" style={{ marginRight: '6px' }}>ⓘ</span>
              Info
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ZeroHero;
