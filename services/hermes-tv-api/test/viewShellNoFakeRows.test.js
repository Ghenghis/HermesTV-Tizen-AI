'use strict';

/**
 * test/viewShellNoFakeRows.test.js
 *
 * Static contract for the IPTV reference-app inspired Views. These shells may
 * borrow layout patterns, but they must not invent user history, calendar
 * releases, next-up labels, or legacy branding.
 */

var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..', '..', '..');
var stremioPath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'shells', 'StremioShell.jsx');
var ynotvPath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'shells', 'YnotvShell.jsx');
var seriesBlockPath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'components', 'SeriesEpisodesBlock.jsx');
var seriesNextPath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'components', 'SeriesNextUp.jsx');
var netflixPath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'shells', 'NetflixShell.jsx');
var samsungPath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'shells', 'SamsungShell.jsx');
var plexPath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'shells', 'PlexShell.jsx');
var applePath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'shells', 'AppleTVShell.jsx');
var nuvioPath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'shells', 'NuvioShell.jsx');
var iptvnatorPath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'shells', 'IptvnatorShell.jsx');
var extremePath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'shells', 'ExtremeInfiniTVShell.jsx');
var catalogCardPath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'components', 'CatalogCard.jsx');

var pass = 0;
var fail = 0;

function ok(label, cond, detail) {
  if (cond) {
    console.log('PASS:', label);
    pass += 1;
  } else {
    console.log('FAIL:', label, detail || '');
    fail += 1;
  }
}

var stremio = fs.readFileSync(stremioPath, 'utf8');
var ynotv = fs.readFileSync(ynotvPath, 'utf8');
var seriesBlock = fs.readFileSync(seriesBlockPath, 'utf8');
var seriesNext = fs.readFileSync(seriesNextPath, 'utf8');
var netflix = fs.readFileSync(netflixPath, 'utf8');
var samsung = fs.readFileSync(samsungPath, 'utf8');
var plex = fs.readFileSync(plexPath, 'utf8');
var apple = fs.readFileSync(applePath, 'utf8');
var nuvio = fs.readFileSync(nuvioPath, 'utf8');
var iptvnator = fs.readFileSync(iptvnatorPath, 'utf8');
var extreme = fs.readFileSync(extremePath, 'utf8');
var catalogCard = fs.readFileSync(catalogCardPath, 'utf8');

ok('StremioShell does not synthesize Continue Watching from catalog slice',
  stremio.indexOf('filtered.slice(0, capForProfile(profile, 8))') === -1);
ok('StremioShell no longer documents a legacy placeholder row',
  stremio.indexOf('legacy placeholder row') === -1);
ok('StremioShell user-facing wordmark is DaveTV, not Hermes',
  stremio.indexOf('<span>HERMES</span>') === -1 && stremio.indexOf('<span>DaveTV</span>') !== -1);

ok('YnotvShell does not bucket missing release_date into fake calendar dots',
  ynotv.indexOf('Deterministic bucket') === -1 && ynotv.indexOf('id hash') === -1);
ok('YnotvShell does not ship deterministic fake Up Next labels',
  ynotv.indexOf('Late Edition') === -1 &&
  ynotv.indexOf('Behind the Scenes') === -1 &&
  ynotv.indexOf('Encore') === -1);
ok('YnotvShell does not render a fake autoplay countdown',
  ynotv.indexOf('Auto-play in') === -1);

ok('SeriesEpisodesBlock reads provider episode metadata instead of synthesizing rows',
  seriesBlock.indexOf('SYNTH_') === -1 &&
  seriesBlock.indexOf('_episodesForSeason') === -1 &&
  seriesBlock.indexOf('getSeriesDetails') !== -1);
ok('SeriesNextUp does not invent Pilot/Heartbeat-style titles',
  seriesNext.indexOf('SYNTH_') === -1 &&
  seriesNext.indexOf('Metamorphosis') === -1 &&
  seriesNext.indexOf('Heartbeat') === -1);
ok('NetflixShell does not backfill Live/Movies rows with unrelated catalog slices',
  netflix.indexOf('liveItems.length > 0 ? liveItems : filtered.slice') === -1 &&
  netflix.indexOf('movies.length > 0 ? movies : filtered.slice') === -1);
ok('SamsungShell does not backfill category rows with unrelated catalog slices',
  samsung.indexOf('liveItems.length > 0 ? liveItems : filtered.slice') === -1 &&
  samsung.indexOf('movies.length > 0 ? movies : filtered.slice') === -1 &&
  samsung.indexOf('series.length > 0 ? series : filtered.slice') === -1);
ok('PlexShell does not backfill category grids with unrelated catalog slices',
  plex.indexOf('liveItems.length > 0 ? liveItems : filtered.slice') === -1 &&
  plex.indexOf('movies.length > 0 ? movies : filtered.slice') === -1 &&
  plex.indexOf('series.length > 0 ? series : filtered.slice') === -1);
ok('AppleTVShell does not backfill Movies/Live rows with unrelated catalog slices',
  apple.indexOf('movies.length > 0 ? movies : filtered.slice') === -1 &&
  apple.indexOf('liveItems.length > 0 ? liveItems : filtered.slice') === -1);
ok('NuvioShell does not backfill Movies/Series rows with all visible items',
  nuvio.indexOf('movies.length > 0 ? movies : visible') === -1 &&
  nuvio.indexOf('series.length > 0 ? series : visible.slice') === -1);
ok('IptvnatorShell has working transport controls instead of console stub buttons',
  iptvnator.indexOf('_logTransport') === -1 &&
  iptvnator.indexOf('console.log') === -1 &&
  iptvnator.indexOf('mpv') === -1 &&
  iptvnator.indexOf('VLC') === -1);
ok('ExtremeInfiniTVShell does not invent live programme labels without EPG',
  extreme.indexOf('Live programming') === -1 &&
  extreme.indexOf('synthesise a placeholder') === -1);
ok('CatalogCard falls back when provider artwork 404s',
  catalogCard.indexOf('onError={function() { setFailedPosterSrc(activePosterUrl); }}') !== -1 &&
  catalogCard.indexOf('activePosterUrl') !== -1 &&
  catalogCard.indexOf('{art.initials}') !== -1);

console.log('\n=== Results: ' + pass + ' PASS, ' + fail + ' FAIL ===');
process.exit(fail === 0 ? 0 : 1);
