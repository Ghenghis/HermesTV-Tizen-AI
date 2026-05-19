import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import './design/animations.css';
import { installConsoleBuffer } from './utils/consoleBuffer.js';

// Install the console ring buffer before React mounts so it captures
// startup logs (Tizen API availability checks, profile bootstrap,
// catalog load errors). Diagnostics tab in Settings reads from this
// buffer to produce a "Send debug logs" JSON download.
installConsoleBuffer();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
