'use strict';

const express = require('express');
const router = express.Router();

const CODE_PATTERN = /^HRM-[A-Z0-9]{4}$/;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wantsJson(req) {
  var accept = String(req.get('accept') || '').toLowerCase();
  return req.is('application/json') || accept.indexOf('application/json') !== -1;
}

function renderSetupPage(args) {
  var code = args && args.code ? String(args.code).trim().toUpperCase() : '';
  var codeIsValid = CODE_PATTERN.test(code);
  var invalidCode = code && !codeIsValid;
  var codeInput = codeIsValid
    ? '<input type="hidden" name="pairing_code" value="' + escapeHtml(code) + '" />'
    : '';
  var subtitle = codeIsValid
    ? 'Pairing code ' + escapeHtml(code) + ' is ready. Save a real provider here to finish setup on the TV.'
    : 'Connect an IPTV provider to start watching.';
  var codeNotice = invalidCode
    ? '<div class="notice warning"><strong>Invalid pairing code.</strong> Scan a fresh TV code before submitting.</div>'
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Add a Provider - DaveTV</title>
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
    .help {
      color: #8c8c8c;
      font-size: 0.78rem;
      line-height: 1.4;
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
    .notice.warning {
      background: #2e1f11;
      border-color: #7a4c15;
      color: #ffc46b;
      margin-top: 0;
      margin-bottom: 1.25rem;
    }
    .notice strong { color: #a8c8ff; }
    .notice.warning strong { color: #ffd79a; }
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
    <h1>Add a Provider to DaveTV</h1>
    <p class="subtitle">${subtitle}</p>
    ${codeNotice}

    <form method="POST" action="/setup/provider/submit">
      ${codeInput}
      <div class="form-grid">
        <div class="field full">
          <label for="type">Provider Type</label>
          <select id="type" name="type" required>
            <option value="" disabled selected>Select a provider…</option>
            <option value="m3u">M3U playlist URL</option>
            <option value="xtream">Xtream Codes panel</option>
          </select>
        </div>

        <div class="field full">
          <label for="label">Provider Name</label>
          <input
            id="label"
            name="label"
            type="text"
            autocomplete="organization"
            required
          />
        </div>

        <div class="field full">
          <label for="url">Provider URL</label>
          <input
            id="url"
            name="url"
            type="url"
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
          />
          <span class="help">Required for Xtream Codes.</span>
        </div>

        <div class="field">
          <label for="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autocomplete="current-password"
          />
          <span class="help">Required for Xtream Codes.</span>
        </div>

        <div class="field full">
          <label for="epg_url">EPG URL</label>
          <input
            id="epg_url"
            name="epg_url"
            type="url"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
      </div>

      <div class="notice">
        <strong>Your credentials are saved on the DaveTV backend.</strong>
        Only a masked provider record is returned to the TV.
      </div>

      <button type="submit">Save Provider</button>
    </form>
  </div>
</body>
</html>`;
}

function renderSuccessPage(masked) {
  var label = masked && masked.label ? masked.label : 'Provider';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Provider Saved - DaveTV</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0d0d0d;
      color: #e8e8e8;
      font-family: system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .card {
      background: #1a1a1a;
      border: 1px solid #2e2e2e;
      border-radius: 12px;
      padding: 2.25rem;
      width: 100%;
      max-width: 520px;
      text-align: center;
    }
    h1 { color: #fff; font-size: 1.5rem; margin-bottom: 0.75rem; }
    p { color: #aaa; line-height: 1.5; }
    strong { color: #fff; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Provider Saved</h1>
    <p><strong>${escapeHtml(label)}</strong> was saved. Return to DaveTV; the pairing screen should close automatically.</p>
  </div>
</body>
</html>`;
}

// GET /setup/provider — QR-based provider onboarding page
router.get('/setup/provider', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderSetupPage({ code: req.query && req.query.code }));
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
router.post('/setup/provider/submit', express.urlencoded({ extended: false, limit: '32kb' }), (req, res) => {
  var providerStore = require('../lib/providerStore');
  var pairingRouter = require('./pairing');
  var SANITIZE = require('../lib/sanitizeLog').sanitizeForLog;
  var body = req.body || {};
  var code = String(body.pairing_code || '').trim().toUpperCase();
  if (code) {
    var ready = pairingRouter._validateCompletable(code);
    if (ready.status !== 200) {
      return res.status(ready.status).json(ready.body);
    }
  }
  providerStore.add({
    type: body.type,
    label: body.label,
    url: body.url,
    username: body.username,
    password: body.password,
    epg_url: body.epg_url,
  }).then((masked) => {
    var completed = null;
    if (code) {
      completed = pairingRouter._completeWithProvider(code, masked.id, masked);
      if (completed.status !== 200) {
        return res.status(completed.status).json(completed.body);
      }
    }
    if (wantsJson(req)) {
      return res.status(201).json({
        provider: masked,
        pairing: completed ? completed.body : undefined,
        message: 'Provider saved. It will appear in /api/providers and feed catalog/playback on the next refresh.',
      });
    }
    res.status(201).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderSuccessPage(masked));
  }).catch((err) => {
    if (err && err.code === 'VALIDATION_FAILED') {
      if (wantsJson(req)) {
        return res.status(400).json({ error: 'validation_failed', errors: err.errors || [err.message] });
      }
      return res.status(400).send('Provider validation failed: ' + escapeHtml((err.errors || [err.message]).join('; ')));
    }
    console.warn('[setup] provider submit failed: ' + SANITIZE(err && err.message ? err.message : 'unknown'));
    res.status(500).json({ error: 'save_failed', message: 'Could not save provider config.' });
  });
});

module.exports = router;
