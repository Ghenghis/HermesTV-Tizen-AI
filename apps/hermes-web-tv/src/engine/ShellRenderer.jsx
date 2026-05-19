import React from 'react';
import { getShell } from './layoutRegistry.js';

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

  var ShellComponent = getShell(layout);

  if (!ShellComponent) {
    return null;
  }

  return (
    <div
      data-layout={layout}
      style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <ShellComponent
        catalog={catalog}
        profile={profile}
        tier={tier}
        providers={providers}
        onItemSelect={onItemSelect}
        contentFilter={contentFilter}
        providerFilter={providerFilter}
        qualityFilter={qualityFilter}
        onOpenSettings={onOpenSettings}
      />
    </div>
  );
}

export default ShellRenderer;
