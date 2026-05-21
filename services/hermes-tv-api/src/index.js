'use strict';

const express = require('express');
const cors = require('cors');
const requestLogger = require('./middleware/requestLogger');
const credentialGuard = require('./middleware/credentialGuard');
const { sanitizeForLog } = require('./lib/sanitizeLog');

// Route modules
const healthRouter = require('./routes/health');
const profilesRouter = require('./routes/profiles');
const providersRouter = require('./routes/providers');
const catalogRouter = require('./routes/catalog');
const jellyfinRouter = require('./routes/jellyfin');
const channelsRouter = require('./routes/channels');
const epgRouter = require('./routes/epg');
const epgGridRouter = require('./routes/epgGrid');
const commandsRouter = require('./routes/commands');
const ttsRouter = require('./routes/tts');
const setupRouter = require('./routes/setup');
const versionsRouter = require('./routes/versions');
const settingsRouter = require('./routes/settings');
const uiCommandRouter = require('./routes/uiCommand');
const upstreamAppsRouter = require('./routes/upstreamApps');
const layoutsRouter = require('./routes/layouts');
const sourceHealthRouter = require('./routes/sourceHealth');
const playRouter = require('./routes/play');
const downloadsRouter = require('./routes/downloads');
const pairingRouter = require('./routes/pairing');
const playlistsRouter = require('./routes/playlists');
const dvrRouter = require('./routes/dvr');
const catchupRouter = require('./routes/catchup');
const seriesRouter = require('./routes/series');
const parentalRouter = require('./routes/parental');
const searchRouter = require('./routes/search');
const backupRouter = require('./routes/backup');
const remoteRouter = require('./routes/remote');
const authRouter = require('./routes/auth');
const agentRouter = require('./routes/agent');

const app = express();
const PORT = process.env.PORT || 3001;

// --- CORS ---
// Allows localhost/127.0.0.1, hermestv.local (mDNS), any LAN 192.168.x.x origin for
// QN85 mirror testing, AND the production Cloudflare-fronted daveai.tech
// origins (tv.daveai.tech canonical + hermestv.daveai.tech alias). In
// production the browser is same-origin with the API (host nginx fronts
// both), but Chrome still attaches an Origin header on POST/PATCH with
// application/json — so without the HTTPS daveai.tech entries the cors
// callback errored and Express's global handler returned 500 for every
// POST (e.g. /api/play, /api/tts/speak). GET requests on the same origin
// send no Origin header and so were unaffected — which is why curl (no
// Origin) and same-origin GETs always worked while the browser POSTs
// silently 500'd. See route audit W5-CORS-1.
// Auth cookies are HttpOnly and sent only for the allowlisted DaveTV origins.
const LAN_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|hermestv\.local|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/;
const PROD_ORIGIN = /^https:\/\/(tv|hermestv)\.daveai\.tech$/;
app.use(
  cors({
    origin: function(origin, cb) {
      if (!origin || LAN_ORIGIN.test(origin) || PROD_ORIGIN.test(origin)) return cb(null, true);
      // Soft-deny: log and respond without CORS headers rather than handing
      // the disallowed request straight to the Express error handler (which
      // would 500). The browser will block the JS from reading the response
      // anyway because Access-Control-Allow-Origin is absent.
      console.warn('[HermesAPI] CORS: origin not allowed: ' + origin);
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    credentials: true,
  })
);

// --- Body parsing ---
// Default 64kb is intentionally tight for the chatty endpoints. Playlist
// imports (POST /api/playlists/preview, /save) carry up to a 10MB m3u file
// inline in the JSON body, so the playlists router mounts its own parser
// below with the 10MB cap that matches MAX_UPLOAD_BYTES in routes/playlists.js.
app.use(express.json({ limit: '64kb' }));

// --- Request logging ---
// Logs method + path + status + ms. Never logs body (may contain credentials).
app.use(requestLogger);

// --- Credential guard (wraps res.json to block any accidental leaks) ---
app.use(credentialGuard);

// --- Auth routes + optional API gate ---
// /api/auth/* and /api/admin/* are always mounted. DAVETV_AUTH_ENFORCE_API=true
// additionally protects non-auth API routes on the VPS after Dave's admin
// account exists.
app.use('/', authRouter);
app.use(authRouter.authMiddleware);

// --- Routes ---
app.use('/', healthRouter);
app.use('/', profilesRouter);
app.use('/', providersRouter);
app.use('/', jellyfinRouter);
app.use('/', catalogRouter);
app.use('/api/channels', channelsRouter);
app.use('/', epgRouter);
app.use('/', epgGridRouter);
app.use('/', commandsRouter);
app.use('/', ttsRouter);
app.use('/', setupRouter);
app.use('/', versionsRouter);
app.use('/', settingsRouter);
app.use('/', uiCommandRouter);
app.use('/', upstreamAppsRouter);
app.use('/', layoutsRouter);
app.use('/', sourceHealthRouter);
app.use('/', require('./routes/version'));
app.use('/', playRouter);
app.use('/', downloadsRouter);
app.use('/', pairingRouter);
// Playlist import uses a 10MB JSON parser scoped to just its own paths so
// the rest of the API keeps the tight 64kb default. The route handlers also
// enforce the same cap in code (MAX_UPLOAD_BYTES) for defense-in-depth.
app.use(/^\/api\/playlists(\/|$)/, express.json({ limit: '10mb' }));
app.use('/', playlistsRouter);
// New Tauri-equivalent surfaces (see services/hermes-tv-api/src/routes/{dvr,catchup,series,parental,search,backup}.js)
app.use('/', dvrRouter);
app.use('/', catchupRouter);
app.use('/', seriesRouter);
app.use('/', parentalRouter);
app.use('/', searchRouter);
app.use('/', backupRouter);
// Phone-as-remote relay: POST /api/remote/event + GET /api/remote/events (SSE).
app.use('/', remoteRouter);
// DaveTV natural voice agent surface. Routes are honest-blocked until the
// provider-search/orchestrator lane is implemented; config is durable.
app.use('/', agentRouter);

// --- 404 fallback ---
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

// --- Error handler ---
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Run err.message through sanitizeForLog so any embedded credential in the
  // raw error string (TTS subscription keys, IPTV provider URLs, OAuth tokens)
  // never reaches the operator's log pipeline. Audit W3-X1 P1.
  console.error('[HermesAPI] Unhandled error on ' + req.method + ' ' + req.path + ':', sanitizeForLog(err && err.message));
  res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred.' });
});

// --- Start server ---
const server = app.listen(PORT, () => {
  console.log(`[HermesAPI] hermes-tv-api v0.1.0 listening on port ${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
  // Start the iptv-org refresh cron AFTER the server is listening so it
  // never runs inside supertest fixtures (which require() this module
  // but don't call app.listen). Dormant unless IPTV_ORG_ENABLED === 'true'.
  if (process.env.NODE_ENV !== 'test') {
    try { require('./lib/iptvOrgRefresh').start(); }
    catch (e) { console.warn('[HermesAPI] iptv-org refresh start failed: ' + e.message); }

    // Pre-warm operator-pasted M3U caches (Apollo / xTremeHD) at startup.
    // Without this, the first /api/catalog request triggers a fresh M3U
    // fetch which can take 15-30 seconds on a multi-MB master playlist,
    // and the web client's 20-second timeout fires before the response
    // arrives → Mom sees "Profile load failed: Request timed out: /api/catalog"
    // on cold boot. Fire-and-forget — never blocks app.listen, never throws.
    // 5-min cache TTL means subsequent requests are ~200ms.
    try {
      var m3uClient = require('./lib/m3uClient');
      if (m3uClient.isEnabled()) {
        console.log('[HermesAPI] pre-warming m3uClient catalog cache (fire-and-forget)...');
        m3uClient.fetchCatalog({ limit: 600 }).then(function(items) {
          console.log('[HermesAPI] m3uClient pre-warm complete: ' + (Array.isArray(items) ? items.length : 0) + ' items cached');
        }).catch(function(err) {
          console.warn('[HermesAPI] m3uClient pre-warm failed: ' + (err && err.message ? err.message : 'unknown') + ' (catalog still serves seed)');
        });
      }
    } catch (e) {
      console.warn('[HermesAPI] m3uClient pre-warm hook failed to start: ' + e.message);
    }
  }
});

// Test harnesses that require this module in-process need a way to close the
// auto-started listener cleanly before process exit, especially on Windows.
app.closeHermesServer = function closeHermesServer(callback) {
  server.close(function(err) {
    if (typeof callback === 'function') { callback(err || null); }
  });
};

// --- Graceful shutdown ---
process.on('SIGTERM', () => {
  console.log('[HermesAPI] SIGTERM received — shutting down gracefully');
  server.close(() => {
    console.log('[HermesAPI] Server closed');
    process.exit(0);
  });
});

module.exports = app;
