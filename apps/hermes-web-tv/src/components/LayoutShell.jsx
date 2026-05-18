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
  return (
    <div
      className={layoutClass}
      style={{
        minHeight: '100vh',
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
