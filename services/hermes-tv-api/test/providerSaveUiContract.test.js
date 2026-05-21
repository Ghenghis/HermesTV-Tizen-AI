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
  /persistedProviderId/.test(app)
    && /row\.id === persistedProviderId/.test(app)
    && /provider_refresh_missing/.test(app));
ok('App leaves playlist import open when refresh proof fails',
  /showPlaylistImport:\s*true,\s*showSettings:\s*false/.test(app)
    && /could not refresh \/api\/providers to prove it/.test(app));

console.log(`Results: ${pass} PASS, ${fail} FAIL`);
if (fail) process.exit(1);
