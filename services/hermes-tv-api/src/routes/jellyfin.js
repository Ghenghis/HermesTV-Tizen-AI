'use strict';

/**
 * routes/jellyfin.js
 *
 * Server-side Jellyfin media helpers. Catalog responses must never expose
 * Jellyfin API keys, so artwork is fetched through this authenticated API
 * route with the X-Emby-Token header added server-side.
 */

var Router = require('express').Router;
var Readable = require('stream').Readable;
var jellyfin = require('../lib/jellyfin');
var sanitizeForLog = require('../lib/sanitizeLog').sanitizeForLog;

var router = Router();

router.get('/api/jellyfin/items/:itemId/image/primary', function(req, res) {
  var request = jellyfin.internal.buildPrimaryImageRequest(req.params.itemId);
  if (!request) {
    return res.status(503).json({
      error: 'jellyfin_not_configured',
      message: 'Jellyfin image proxy is not configured.',
    });
  }

  return fetch(request.url, {
    method: 'GET',
    headers: request.headers,
  }).then(function(upstream) {
    if (upstream.status === 404) {
      return res.status(404).json({ error: 'jellyfin_image_not_found' });
    }
    if (upstream.status < 200 || upstream.status >= 300) {
      return res.status(502).json({
        error: 'jellyfin_image_fetch_failed',
        upstream_status: upstream.status,
      });
    }

    var passHeaders = [
      'content-type',
      'content-length',
      'cache-control',
      'last-modified',
      'etag',
    ];
    for (var i = 0; i < passHeaders.length; i++) {
      var h = passHeaders[i];
      var v = upstream.headers && upstream.headers.get ? upstream.headers.get(h) : null;
      if (v) { res.setHeader(h, v); }
    }
    if (!res.getHeader('Cache-Control')) {
      res.setHeader('Cache-Control', 'private, max-age=300');
    }

    res.status(upstream.status);
    if (!upstream.body) {
      res.end();
      return null;
    }
    return Readable.fromWeb(upstream.body).pipe(res);
  }).catch(function(err) {
    console.warn('[jellyfin] image proxy failed: ' + sanitizeForLog(err && err.message ? err.message : 'unknown'));
    if (!res.headersSent) {
      res.status(502).json({ error: 'jellyfin_image_fetch_failed' });
    }
  });
});

module.exports = router;
