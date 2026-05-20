import React from 'react';

function LayoutShell(props) {
  var profile = props.profile;
  var children = props.children;

  var activeLayout = (profile && profile.active_layout) ? profile.active_layout : 'grid-standard';
  var layoutClass = 'layout-shell layout-' + activeLayout;

  // All layout differences are driven by CSS classes and custom properties.
  // grid-standard: flex-col single column flow, 3-col card grid
  // rail-hero: header rail + scrollable content rows
  // jumbo-rail: 2-col large-card layout
  //
  // height (not minHeight) is required so children with `height: 100%` —
  // notably every shell in src/shells/ — resolve to the viewport instead of
  // collapsing to their content height. Without this, shells like Netflix
  // and Plex render cut off, and grid-style shells (TiviMate, Plex,
  // Dave Power) collapse to a thin strip. overflow:hidden keeps the page
  // from scrolling at the LayoutShell level; each shell's internal panel
  // handles its own overflowY: 'auto'.
  return (
    <div
      className={layoutClass}
      data-hermes-app-root="true"
      style={{
        height: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--bg)',
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}
    </div>
  );
}

export default LayoutShell;
