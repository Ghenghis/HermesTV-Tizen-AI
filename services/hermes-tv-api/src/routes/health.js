'use strict';

const { Router } = require('express');
const router = Router();

function health(req, res) {
  res.json({
    status: 'ok',
    service: 'hermes-tv-api',
    version: '0.1.0',
    ts: new Date().toISOString(),
  });
}

router.get('/health', health);
router.get('/api/health', health);

module.exports = router;
