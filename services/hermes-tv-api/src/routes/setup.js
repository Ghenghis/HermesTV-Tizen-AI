'use strict';

const { Router } = require('express');
const router = Router();

const SETUP_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Add a Provider — HermesTV</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0d0d0d;
      color: #e8e8e8;
      font-family: system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .card {
      background: #1a1a1a;
      border: 1px solid #2e2e2e;
      border-radius: 12px;
      padding: 2.5rem;
      width: 100%;
      max-width: 560px;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      color: #ffffff;
      margin-bottom: 0.5rem;
    }
    .subtitle {
      color: #888;
      font-size: 0.9rem;
      margin-bottom: 2rem;
    }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.25rem;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .field.full { grid-column: 1 / -1; }
    label {
      font-size: 0.85rem;
      color: #aaa;
      font-weight: 500;
    }
    select, input[type="text"], input[type="password"], input[type="url"] {
      background: #111;
      border: 1px solid #333;
      border-radius: 6px;
      color: #e8e8e8;
      font-size: 0.95rem;
      padding: 0.55rem 0.75rem;
      width: 100%;
      outline: none;
      transition: border-color 0.15s;
    }
    select:focus, input:focus {
      border-color: #4a7fff;
    }
    select option { background: #1a1a1a; }
    .notice {
      background: #111c2e;
      border: 1px solid #1e3a6e;
      border-radius: 6px;
      color: #7aaeff;
      font-size: 0.82rem;
      padding: 0.65rem 0.9rem;
      margin-top: 1.5rem;
      line-height: 1.5;
    }
    .notice strong { color: #a8c8ff; }
    button[type="submit"] {
      background: #2563eb;
      border: none;
      border-radius: 6px;
      color: #fff;
      cursor: pointer;
      font-size: 1rem;
      font-weight: 600;
      margin-top: 1.75rem;
      padding: 0.75rem 1.5rem;
      width: 100%;
      transition: background 0.15s;
    }
    button[type="submit"]:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Add a Provider to HermesTV</h1>
    <p class="subtitle">Connect an IPTV provider to start watching.</p>

    <form method="POST" action="/setup/provider/submit">
      <div class="form-grid">
        <div class="field full">
          <label for="provider_type">Provider Type</label>
          <select id="provider_type" name="provider_type" required>
            <option value="" disabled selected>Select a provider…</option>
            <option value="apollo">Apollo Group</option>
            <option value="xtremehd">XtremeHD</option>
          </select>
        </div>

        <div class="field full">
          <label for="host_url">Host URL</label>
          <input
            id="host_url"
            name="host_url"
            type="url"
            placeholder="http://..."
            autocomplete="off"
            spellcheck="false"
            required
          />
        </div>

        <div class="field">
          <label for="username">Username</label>
          <input
            id="username"
            name="username"
            type="text"
            autocomplete="username"
            required
          />
        </div>

        <div class="field">
          <label for="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
          />
        </div>
      </div>

      <div class="notice">
        <strong>Your credentials are stored encrypted on this device.</strong>
        They are never sent to your TV.
      </div>

      <button type="submit">Save Provider</button>
    </form>
  </div>
</body>
</html>`;

// GET /setup/provider — QR-based provider onboarding page
router.get('/setup/provider', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(SETUP_PAGE_HTML);
});

// POST /setup/provider/submit — persists a provider config into providerStore.
// Body: { type, label, url, username?, password?, epg_url? }
// Response: 201 with masked row.
//
// Per docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md P0#2 ("Provider setup does not
// store usable config"): this endpoint is now durable. The persisted record
// survives process restart via providerStore (data/providers.json on the API
// container's writable volume) and is the SAME store that /api/providers
// surfaces.
router.post('/setup/provider/submit', (req, res) => {
  var providerStore = require('../lib/providerStore');
  var SANITIZE = require('../lib/sanitizeLog').sanitizeForLog;
  var body = req.body || {};
  providerStore.add({
    type: body.type,
    label: body.label,
    url: body.url,
    username: body.username,
    password: body.password,
    epg_url: body.epg_url,
  }).then((masked) => {
    res.status(201).json({
      provider: masked,
      message: 'Provider saved. It will appear in /api/providers and feed catalog/playback on the next refresh.',
    });
  }).catch((err) => {
    if (err && err.code === 'VALIDATION_FAILED') {
      return res.status(400).json({ error: 'validation_failed', errors: err.errors || [err.message] });
    }
    console.warn('[setup] provider submit failed: ' + SANITIZE(err && err.message ? err.message : 'unknown'));
    res.status(500).json({ error: 'save_failed', message: 'Could not save provider config.' });
  });
});

module.exports = router;
