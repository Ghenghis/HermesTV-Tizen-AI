'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;
function ok(name, condition, detail) {
  if (condition) {
    pass += 1;
    console.log('PASS: ' + name);
  } else {
    fail += 1;
    console.error('FAIL: ' + name + (detail ? ' - ' + detail : ''));
  }
}

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const modal = fs.readFileSync(path.join(repoRoot, 'apps/hermes-web-tv/src/components/PlaylistImportModal.jsx'), 'utf8');
const app = fs.readFileSync(path.join(repoRoot, 'apps/hermes-web-tv/src/App.jsx'), 'utf8');
const api = fs.readFileSync(path.join(repoRoot, 'apps/hermes-web-tv/src/api/hermesApi.js'), 'utf8');
const catalogRoute = fs.readFileSync(path.join(repoRoot, 'services/hermes-tv-api/src/routes/catalog.js'), 'utf8');
const m3uClient = fs.readFileSync(path.join(repoRoot, 'services/hermes-tv-api/src/lib/m3uClient.js'), 'utf8');

console.log('\n--- Provider save UI contract ---');
ok('Playlist import requires a durable provider id before success',
  /persisted_provider_id/.test(modal)
    && /Provider save did not return a durable provider id/.test(modal));
ok('Playlist import waits for parent provider-refresh proof before closing',
  /Promise\.resolve\(result\)\.then/.test(modal)
    && /if \(typeof onClose === 'function'\) \{ onClose\(\); \}/.test(modal));
ok('Playlist import keeps modal open and shows error when provider proof fails',
  /saved:\s*null/.test(modal)
    && /provider_refresh_failed/.test(modal)
    && /could not confirm it from \/api\/providers/.test(modal));
ok('App verifies saved provider appears in /api/providers before closing import',
  /expectedProviderId/.test(app)
    && /row\.id === expectedProviderId/.test(app)
    && /provider_refresh_missing/.test(app));
ok('App refreshes providers and catalog before closing import',
  /function refreshProvidersAndCatalog\(options\)/.test(app)
    && /hermesApi\.getProviders\(\{ refresh: true \}\)/.test(app)
    && /hermesApi\.getCatalog\(\{ refresh: true, waitForColdMs: 15000 \}\)/.test(app)
    && /patch\.catalog/.test(app));
ok('App leaves playlist import open when provider/catalog proof fails',
  /showPlaylistImport:\s*true,\s*showSettings:\s*false/.test(app)
    && /could not refresh \/api\/providers and \/api\/catalog to prove it/.test(app));
ok('Web API supports cache-busted provider refresh',
  /function getProviders\(options\)/.test(api)
    && /options\.refresh === true/.test(api)
    && /cache: 'no-store'/.test(api));
ok('Web API supports cold catalog wait on provider save',
  /function getCatalog\(options\)/.test(api)
    && /wait_for_cold_ms/.test(api)
    && /waitForColdMs/.test(api));
ok('Catalog route does not cache provider-save proof responses',
  /wait_for_cold_ms/.test(catalogRoute)
    && /resolveCatalog\(\{ waitForColdMs: waitForColdMs \}\)/.test(catalogRoute)
    && /Cache-Control', 'private, no-store'/.test(catalogRoute));
ok('M3U catalog honors caller cold-wait budget',
  /var waitForColdMs = \(typeof opts\.waitForColdMs === 'number'/.test(m3uClient)
    && /setTimeout\(function\(\) \{ resolve\(null\); \}, waitForColdMs\)/.test(m3uClient));

console.log(`Results: ${pass} PASS, ${fail} FAIL`);
if (fail) process.exit(1);
