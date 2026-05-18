'use strict';

const express = require('express');
const cors = require('cors');
const requestLogger = require('./middleware/requestLogger');
const credentialGuard = require('./middleware/credentialGuard');

// Route modules
const healthRouter = require('./routes/health');
const profilesRouter = require('./routes/profiles');
const providersRouter = require('./routes/providers');
const catalogRouter = require('./routes/catalog');
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

const app = express();
const PORT = process.env.PORT || 3001;

// --- CORS ---
// Allows localhost, hermestv.local (mDNS), and any LAN 192.168.x.x origin for QN85 mirror testing.
// Never expose credentials via CORS.
const LAN_ORIGIN = /^http:\/\/(localhost|hermestv\.local|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/;
app.use(
  cors({
    origin: function(origin, cb) {
      if (!origin || LAN_ORIGIN.test(origin)) return cb(null, true);
      cb(new Error('CORS: origin not allowed: ' + origin));
    },
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    credentials: false,
  })
);

// --- Body parsing ---
app.use(express.json({ limit: '64kb' }));

// --- Request logging ---
// Logs method + path + status + ms. Never logs body (may contain credentials).
app.use(requestLogger);

// --- Credential guard (wraps res.json to block any accidental leaks) ---
app.use(credentialGuard);

// --- Routes ---
app.use('/', healthRouter);
app.use('/', profilesRouter);
app.use('/', providersRouter);
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
app.use('/', playRouter);

// --- 404 fallback ---
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

// --- Error handler ---
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[HermesAPI] Unhandled error on ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred.' });
});

// --- Start server ---
const server = app.listen(PORT, () => {
  console.log(`[HermesAPI] hermes-tv-api v0.1.0 listening on port ${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
});

// --- Graceful shutdown ---
process.on('SIGTERM', () => {
  console.log('[HermesAPI] SIGTERM received — shutting down gracefully');
  server.close(() => {
    console.log('[HermesAPI] Server closed');
    process.exit(0);
  });
});

module.exports = app;
