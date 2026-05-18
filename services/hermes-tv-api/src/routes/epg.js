'use strict';

const { Router } = require('express');
const router = Router();

// GET /api/epg/:channelId
// EPG integration is pending B4 phase — stub response only.
router.get('/api/epg/:channelId', (req, res) => {
  res.json({
    channel_id: req.params.channelId,
    status: 'not_implemented',
    programs: [],
    message: 'EPG integration pending B4 phase',
  });
});

module.exports = router;
