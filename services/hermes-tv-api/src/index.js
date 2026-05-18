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

const app = express();
const PORT = process.env.PORT || 3001;

// --- CORS ---
// Restricted to TV origin and local dev. Never expose credentials via CORS.
app.use(
  cors({
    origin: ['http://hermestv.local', 'http://localhost:5173'],
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
app.use('/', channelsRouter);
app.use('/', epgRouter);
app.use('/', epgGridRouter);
app.use('/', commandsRouter);
app.use('/', ttsRouter);
app.use('/', setupRouter);
app.use('/', versionsRouter);

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
