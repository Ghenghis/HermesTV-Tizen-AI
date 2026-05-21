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

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function buttonBlockBefore(source, marker) {
  const idx = source.indexOf(marker);
  if (idx === -1) return '';
  const start = source.lastIndexOf('<button', idx);
  return start === -1 ? '' : source.slice(start, idx + marker.length);
}

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const app = read('apps/hermes-web-tv/src/App.jsx');
const shellRenderer = read('apps/hermes-web-tv/src/engine/ShellRenderer.jsx');
const zeroShell = read('apps/hermes-web-tv/src/shells/ZeroShell.jsx');
const netflixShell = read('apps/hermes-web-tv/src/shells/NetflixShell.jsx');
const nuvioShell = read('apps/hermes-web-tv/src/shells/NuvioShell.jsx');
const playerModal = read('apps/hermes-web-tv/src/components/PlayerModal.jsx');
const hlsHook = read('apps/hermes-web-tv/src/hooks/useHlsStream.js');
const apiIndex = read('services/hermes-tv-api/src/index.js');

const handleItemClick = app.slice(app.indexOf('function handleItemClick'), app.indexOf('// Explicit "Info" gesture'));
const netflixWatchButton = buttonBlockBefore(netflixShell, '▶ Watch');
const netflixInfoButton = buttonBlockBefore(netflixShell, 'ⓘ More Info');
const nuvioPlayButton = buttonBlockBefore(nuvioShell, '▶ Play');
const nuvioInfoButton = buttonBlockBefore(nuvioShell, 'ⓘ More Info');

console.log('\n--- Playback UX contract ---');
ok('Playable card OK/click routes directly to handlePlay',
  /if \(isInstantPlayableItem\(item\)\) \{[\s\S]*handlePlay\(item, defaultProvider\);[\s\S]*return;[\s\S]*\}/.test(handleItemClick),
  handleItemClick.slice(0, 400));
ok('Playable card OK/click does not open selectedItem detail before playback',
  handleItemClick.indexOf('handlePlay(item, defaultProvider);') !== -1
    && handleItemClick.indexOf('patchState({ selectedItem: item') > handleItemClick.indexOf('return;'));
ok('App passes explicit details handler to shell layouts',
  /onOpenDetail=\{handleOpenDetail\}/.test(app));
ok('ShellRenderer forwards explicit details handler',
  /var onOpenDetail = props\.onOpenDetail;/.test(shellRenderer)
    && /onOpenDetail=\{onOpenDetail\}/.test(shellRenderer));
ok('Zero hero Watch plays and Info opens details',
  /onPlay=\{function\(item\)[\s\S]*onItemSelect\(item\)/.test(zeroShell)
    && /onMoreInfo=\{function\(item\)[\s\S]*onOpenDetail\(item\)/.test(zeroShell));
ok('Netflix hero Watch plays instantly',
  netflixWatchButton.indexOf('onItemSelect(featured)') !== -1
    && netflixWatchButton.indexOf('onOpenDetail(featured)') === -1,
  netflixWatchButton);
ok('Netflix More Info opens details, not playback',
  netflixInfoButton.indexOf('onOpenDetail(featured)') !== -1
    && netflixInfoButton.indexOf('onItemSelect(featured)') === -1,
  netflixInfoButton);
ok('Nuvio hero Play plays instantly',
  nuvioPlayButton.indexOf('onItemSelect(hero)') !== -1
    && nuvioPlayButton.indexOf('onOpenDetail(hero)') === -1,
  nuvioPlayButton);
ok('Nuvio More Info opens details, not playback',
  nuvioInfoButton.indexOf('onOpenDetail(hero)') !== -1
    && nuvioInfoButton.indexOf('onItemSelect(hero)') === -1,
  nuvioInfoButton);
ok('PlayerModal converts ticket stream endpoints through API base resolver',
  /import \{ buildApiUrl \} from '\.\.\/api\/hermesApi\.js';/.test(playerModal)
    && /function resolveTicketEndpoint\(endpoint\)[\s\S]*return buildApiUrl\(endpoint\);/.test(playerModal)
    && /var endpoint = resolveTicketEndpoint\(ticket\.stream_endpoint\);/.test(playerModal));
ok('PlayerModal stream probes include DaveTV session credentials',
  /fetch\(endpoint, \{ method: 'HEAD', credentials: 'include' \}\)/.test(playerModal)
    && /fetch\(endpoint, \{ credentials: 'include' \}\)/.test(playerModal));
ok('hls.js requests include session credentials for local API playback',
  /xhrSetup: function\(xhr\)[\s\S]*xhr\.withCredentials = true;/.test(hlsHook));
ok('API CORS allows HEAD probes for playback tickets',
  /methods: \['GET', 'HEAD', 'POST', 'PATCH', 'OPTIONS'\]/.test(apiIndex));

console.log(`Results: ${pass} PASS, ${fail} FAIL`);
if (fail) process.exit(1);
