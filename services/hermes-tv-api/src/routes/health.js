'use strict';

const { Router } = require('express');
const router = Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'hermes-tv-api',
    version: '0.1.0',
    ts: new Date().toISOString(),
  });
});

module.exports = router;
