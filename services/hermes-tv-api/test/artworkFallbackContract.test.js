'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

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

const iptvOrg = read('services/hermes-tv-api/src/lib/iptvOrg.js');
const m3uClient = read('services/hermes-tv-api/src/lib/m3uClient.js');
const channelArt = read('apps/hermes-web-tv/src/utils/channelArt.js');
const catalogCard = read('apps/hermes-web-tv/src/components/CatalogCard.jsx');
const shellHelpers = read('apps/hermes-web-tv/src/shells/shellHelpers.js');

console.log('\n--- Artwork fallback contract ---');
ok('iptv-org missing logo stays null instead of transparent fake art',
  /function _bestLogo[\s\S]*return null;[\s\S]*\}/.test(iptvOrg)
    && iptvOrg.indexOf("return 'data:image/png;base64") === -1,
  'iptvOrg.js must not emit transparent logo placeholders');
ok('M3U missing or unsafe logo stays null',
  /function _safeLogo\(url\)[\s\S]*return null;[\s\S]*CRED_BEARING_LOGO\[i\]\.test\(url\)[\s\S]*return null;/.test(m3uClient)
    && m3uClient.indexOf('DEFAULT_LOGO_DATA_URI') === -1,
  'm3uClient.js must not emit transparent logo placeholders');
ok('Channel art utility rejects old transparent-pixel cached values',
  /function _isTransparentPixel\(u\)/.test(channelArt)
    && /_isTransparentPixel\(u\)/.test(channelArt)
    && /type: url \? 'logo' : 'placeholder'/.test(channelArt));
ok('CatalogCard rejects old transparent-pixel cached values',
  /function _transparentPixel\(u\)/.test(catalogCard)
    && /!_transparentPixel\(u\)/.test(catalogCard)
    && /art\.initials/.test(catalogCard));
ok('Shell background helper rejects old transparent-pixel cached values',
  /function _isTransparentPixel\(url\)/.test(shellHelpers)
    && /!_isTransparentPixel\(url\)/.test(shellHelpers)
    && /getChannelArt\(item\)/.test(shellHelpers));

console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');
if (fail) { process.exit(1); }
