'use strict';

const { Router } = require('express');
const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/epg?provider=<provider_id>&hours=<n>
//
// Grid endpoint consumed by apps/hermes-web-tv/src/components/EPGGrid.jsx.
// Returns { channels, programs, _meta: { source } } so the TV-side React
// component can render the time-grid without further normalisation.
//
// Current implementation is an honest STUB — we return empty arrays and a
// _meta.source = 'stub' marker so the UI shows its "EPG not configured yet"
// empty state. No invented data, no silent mock fallback.
//
// To wire a real XMLTV source, an operator should:
//   1. Set XMLTV_URL=<https-or-file-url> in services/hermes-tv-api/.env
//      (or the equivalent compose env entry). The URL is server-side only
//      and never leaves the backend.
//   2. (Future) Implement an xmltv → channels/programs parser in
//      services/hermes-tv-api/src/lib/xmltvClient.js and have it back
//      this endpoint. Cache parsed output in-memory (or Redis) with a
//      TTL of ~5 minutes so concurrent TVs don't re-parse the XML.
//   3. Optional: per-provider mapping so each ?provider= query targets a
//      different XMLTV feed (e.g. apollo_group → ipzdata.com,
//      xtremehd → operator-specific URL).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/api/epg', (req, res) => {
  // We accept the query params today but only echo them back via _meta so
  // the operator can confirm the request shape during integration tests.
  // Clamp hours to a sane range (1..12) so a future implementation never
  // has to deal with absurd windows.
  let hours = parseInt(req.query.hours, 10);
  if (isNaN(hours) || hours < 1) { hours = 4; }
  if (hours > 12) { hours = 12; }

  const provider = typeof req.query.provider === 'string'
    ? req.query.provider
    : '';

  res.json({
    channels: [],
    programs: [],
    _meta: {
      source: 'stub',
      message: 'EPG source not configured — wire an XMLTV URL in settings',
      requested_provider: provider,
      requested_hours: hours,
      server_time: new Date().toISOString(),
    },
  });
});

// GET /api/epg/:channelId
// Legacy single-channel stub kept for backward compat with anything that
// still calls hermesApi.getEpg(channelId). EPG integration is pending B4.
router.get('/api/epg/:channelId', (req, res) => {
  res.json({
    channel_id: req.params.channelId,
    status: 'not_implemented',
    programs: [],
    message: 'EPG integration pending B4 phase',
  });
});

module.exports = router;
