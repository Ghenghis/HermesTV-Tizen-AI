// main-remote.jsx — Vite bootstrap for the secondary /remote.html entry.
//
// Mounts the RemoteApp into the #root div from apps/hermes-web-tv/remote.html.
// Does NOT pull in the main App.jsx, design system, shells, or any of the
// TV-side bundle — this is a deliberately tiny phone-only entry so the
// operator's mobile data plan never pays for shell code it can't render.
//
// ES5-target React (Chrome 76 / Samsung Internet compat) — see vite.config.js
// build.target. No JSX-only-in-prod tricks, no top-level await.

import React from 'react';
import ReactDOM from 'react-dom/client';
import RemoteApp from './RemoteApp.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RemoteApp />
  </React.StrictMode>
);
