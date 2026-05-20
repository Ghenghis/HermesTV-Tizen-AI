import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AuthGate from './components/AuthGate.jsx';
import './index.css';
import './design/animations.css';
import { installConsoleBuffer } from './utils/consoleBuffer.js';
import { registerServiceWorker } from './registerSW.js';

// Install the console ring buffer before React mounts so it captures
// startup logs (Tizen API availability checks, profile bootstrap,
// catalog load errors). Diagnostics tab in Settings reads from this
// buffer to produce a "Send debug logs" JSON download.
installConsoleBuffer();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>
);

// Service Worker — wired AFTER the React mount so SW install never blocks
// first paint. Only registers in production (no-op on localhost).
registerServiceWorker();
