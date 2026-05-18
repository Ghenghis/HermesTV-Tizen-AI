'use strict';

const { Router } = require('express');
const router = Router();

// GET /api/versions/manifest
router.get('/api/versions/manifest', (req, res) => {
  res.json({
    api: '0.1.0',
    schema: 'hermestv.ui.v1',
    tizen_min_required: '6.5',
    build_ts: new Date().toISOString(),
  });
});

module.exports = router;
