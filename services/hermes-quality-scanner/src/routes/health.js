'use strict';

const { Router } = require('express');
const router = Router();

/**
 * GET /health
 * Liveness probe — always returns 200 if the process is running.
 */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'hermes-quality-scanner' });
});

module.exports = router;
