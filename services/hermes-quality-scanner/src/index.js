'use strict';

const express    = require('express');
const healthRouter = require('./routes/health');
const scanRouter   = require('./routes/scan');

const PORT = parseInt(process.env.PORT, 10) || 3002;

const app = express();

// Parse JSON request bodies
app.use(express.json());

// Routes
app.use('/', healthRouter);
app.use('/', scanRouter);

// 404 catch-all
app.use((_req, res) => {
  res.status(404).json({ error: true, message: 'Not found' });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[server] Unhandled error:', err.message);
  res.status(500).json({ error: true, message: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[hermes-quality-scanner] Listening on port ${PORT}`);
});

module.exports = app; // export for testing
