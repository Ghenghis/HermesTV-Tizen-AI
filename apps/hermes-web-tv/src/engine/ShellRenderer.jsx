import React from 'react';
import { getShell } from './layoutRegistry.js';
import EmptyState from '../components/EmptyState.jsx';

// ShellRenderer is intentionally a thin pass-through. New shells (TiviMate,
// Netflix, Plex, AppleTV, Samsung, MomMode, DavePower, Zero, LiveTV, plus the
// in-flight NuvioShell / StremioShell / ExtremeInfiniTVShell parallel-agent
// additions) are registered in `layoutRegistry.js` — this component never
// needs to know about specific shell IDs. If you find yourself adding a
// `switch` statement here, register the shell in the registry instead.

function ShellRenderer(props) {
  var layout = props.layout;
  var catalog = props.catalog;
  var profile = props.profile;
  var tier = props.tier;
  var providers = props.providers;
  var onItemSelect = props.onItemSelect;
  var contentFilter = props.contentFilter;
  var providerFilter = props.providerFilter;
  var qualityFilter = props.qualityFilter;
  // Optional: shells that surface a Settings tab/button dispatch through here.
  // Currently only StremioShell wires this up; other shells ignore it.
  var onOpenSettings = props.onOpenSettings;
  // Hero-focus channel — shells with a hero/preview panel (Netflix, Plex,
  // AppleTV, Nuvio, ExtremeInfiniTV, Ynotv) read focusedItem to drive the
  // hero background + title + CTAs, and call onItemFocus on card hover /
  // remote-focus / single-click. Shells without a hero ignore both.
  var onItemFocus = props.onItemFocus;
  // Explicit details path. Normal card/OK activation stays wired to
  // onItemSelect so it plays instantly; shells route Info / More Info here.
  var onOpenDetail = props.onOpenDetail;
  var focusedItem = props.focusedItem;

  var ShellComponent = getShell(layout);

  if (!ShellComponent) {
    return null;
  }

  // W17-PURGE: when the catalog is empty (every provider returned zero items,
  // or no provider has been configured) every shell — regardless of which
  // one is active — renders an honest empty state with a "Open Settings"
  // CTA. We DO NOT silently fill in fake content from a seed catalog.
  // Individual shells therefore never have to handle the items.length === 0
  // case; they just see the catalog they were handed.
  var catalogLength = Array.isArray(catalog) ? catalog.length : 0;
  if (catalogLength === 0) {
    return (
      <div
        data-layout={layout}
        data-empty="true"
        style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <EmptyState
          icon="📭"
          title="No channels yet"
          message="None of your providers returned content. Open Settings → Providers and verify your iptv-org / xTremeHD / Apollo Group credentials are valid and reachable."
          cta={onOpenSettings ? { label: 'Open Settings', onClick: onOpenSettings } : null}
        />
      </div>
    );
  }

  // Shells are React.lazy chunks (see layoutRegistry.js — boot bundle no
  // longer carries all 14 shells eagerly). Suspense holds a thin skeleton
  // for the ~50-200 ms it takes to fetch the chunk on first use. Vite
  // caches it so subsequent re-renders of the same shell are instant, and
  // switching between two already-visited shells is also instant.
  return (
    <div
      data-layout={layout}
      style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <React.Suspense
        fallback={
          <div
            role="status"
            aria-live="polite"
            aria-label={'Loading ' + layout + ' layout'}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--muted, #8b95a3)',
              fontSize: 'calc(0.95rem * var(--font-scale, 1))',
            }}
          >
            <span aria-hidden="true" style={{ marginRight: '0.5rem' }}>◌</span>
            Loading layout…
          </div>
        }
      >
        <ShellComponent
          catalog={catalog}
          profile={profile}
          tier={tier}
          providers={providers}
          onItemSelect={onItemSelect}
          onItemFocus={onItemFocus}
          onOpenDetail={onOpenDetail}
          focusedItem={focusedItem}
          contentFilter={contentFilter}
          providerFilter={providerFilter}
          qualityFilter={qualityFilter}
          onOpenSettings={onOpenSettings}
        />
      </React.Suspense>
    </div>
  );
}

export default ShellRenderer;
