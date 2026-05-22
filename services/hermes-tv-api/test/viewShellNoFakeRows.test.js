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
var zeroPath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'shells', 'ZeroShell.jsx');
var tiviMatePath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'shells', 'TiviMateShell.jsx');
var davePowerPath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'shells', 'DavePowerShell.jsx');
var ynotvPath2 = path.join(root, 'apps', 'hermes-web-tv', 'src', 'shells', 'YnotvShell.jsx');
var momModePath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'shells', 'MomModeShell.jsx');
var layoutSwitcherPath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'components', 'LayoutSwitcher.jsx');
var catalogCardPath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'components', 'CatalogCard.jsx');
var continueWatchingHelpersPath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'components', 'ContinueWatchingRail.helpers.js');
var watchHistoryStorePath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'store', 'watchHistoryStore.js');
var sleepTimerPath = path.join(root, 'apps', 'hermes-web-tv', 'src', 'components', 'SleepTimer.jsx');

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
var zero = fs.readFileSync(zeroPath, 'utf8');
var tiviMate = fs.readFileSync(tiviMatePath, 'utf8');
var davePower = fs.readFileSync(davePowerPath, 'utf8');
var ynotv2 = fs.readFileSync(ynotvPath2, 'utf8');
var momMode = fs.readFileSync(momModePath, 'utf8');
var layoutSwitcher = fs.readFileSync(layoutSwitcherPath, 'utf8');
var catalogCard = fs.readFileSync(catalogCardPath, 'utf8');
var continueWatchingHelpers = fs.readFileSync(continueWatchingHelpersPath, 'utf8');
var watchHistoryStore = fs.readFileSync(watchHistoryStorePath, 'utf8');
var sleepTimer = fs.readFileSync(sleepTimerPath, 'utf8');

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
ok('PlexShell sidebar sections drive rendered content, not just highlight state',
  plex.indexOf("{ id: 'live', icon: '📡', label: 'Live TV' }") !== -1 &&
  plex.indexOf("var allContent = applyShellFilters(catalog, 'all', providerFilter, qualityFilter);") !== -1 &&
  plex.indexOf("var activeSectionResult = React.useState('home');") !== -1 &&
  plex.indexOf("activeSection === 'live' ? liveItems") !== -1 &&
  plex.indexOf("activeSection === 'movies' ? movies") !== -1 &&
  plex.indexOf("activeSection === 'series' ? series") !== -1 &&
  plex.indexOf("activeSection === 'live'") !== -1 &&
  plex.indexOf("activeSection === 'movies'") !== -1 &&
  plex.indexOf("activeSection === 'series'") !== -1);
ok('PlexShell sidebar supports remote arrow navigation and Enter activation',
  plex.indexOf('data-plex-nav-index={i}') !== -1 &&
  plex.indexOf("handleSidebarKeyDown(e, s.id, i)") !== -1 &&
  plex.indexOf("e.key === 'ArrowDown'") !== -1 &&
  plex.indexOf("e.key === 'ArrowUp'") !== -1 &&
  plex.indexOf('activateSection(sectionId)') !== -1 &&
  plex.indexOf('aria-current={isActive ?') !== -1);
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
ok('ZeroShell side rail activates real Live/Movies/Series tabs',
  zero.indexOf('_activateSidebarSection(sectionId)') !== -1 &&
  zero.indexOf("setActiveTab(nextTab)") !== -1 &&
  zero.indexOf("data-zero-sidebar-index={index}") !== -1 &&
  zero.indexOf("'downloads'") === -1 &&
  zero.indexOf("'trakt'") === -1);
ok('DavePowerShell icon rail filters the grid instead of only highlighting',
  davePower.indexOf("var activeIconId = (POWER_ICONS[activeIcon]") !== -1 &&
  davePower.indexOf("displayItems = displayItems.filter(function(i) { return isLive(i); });") !== -1 &&
  davePower.indexOf("displayItems = displayItems.filter(function(i) { return isMovie(i); });") !== -1 &&
  davePower.indexOf("data-power-nav-index={i}") !== -1);
ok('TiviMateShell bottom rail switches content and opens search',
  tiviMate.indexOf("var activeNavResult = React.useState('live');") !== -1 &&
  tiviMate.indexOf("activeNav === 'movies' ? movieItems") !== -1 &&
  tiviMate.indexOf("activeNav === 'series' ? seriesItems") !== -1 &&
  tiviMate.indexOf("if (typeof onOpenSearch === 'function') { onOpenSearch(); }") !== -1 &&
  tiviMate.indexOf("data-tivimate-nav-index={index}") !== -1);
ok('Classic 3-pane rail EPG/Settings entries dispatch real app overlays',
  iptvnator.indexOf("if (typeof onOpenEPG === 'function') { onOpenEPG(); }") !== -1 &&
  iptvnator.indexOf("if (typeof onOpenSettings === 'function') { onOpenSettings(); }") !== -1 &&
  iptvnator.indexOf("data-iptvnator-rail-index={index}") !== -1 &&
  iptvnator.indexOf("Favorites will appear here") !== -1);
ok('ExtremeInfiniTV side groups and tabs support remote arrow navigation',
  extreme.indexOf("data-extreme-group-index={index + 1}") !== -1 &&
  extreme.indexOf("data-extreme-tab-index={index}") !== -1 &&
  extreme.indexOf("_handleExtremeGroupKey(e, g.id, index + 1)") !== -1 &&
  extreme.indexOf("_handleExtremeTabKey(e, t.id, index)") !== -1);
ok('Lean TV and Mom Mode rails support remote arrow navigation',
  ynotv2.indexOf("data-ynotv-rail-index={index}") !== -1 &&
  ynotv2.indexOf("_handleRailKey(e, it.id, index)") !== -1 &&
  momMode.indexOf("data-mom-tab-index={i}") !== -1 &&
  momMode.indexOf("_handleMomTabKey(e, i)") !== -1);
ok('Choose Your View uses the wide TV viewport instead of a narrow one-column list',
  layoutSwitcher.indexOf("width: 'calc(100vw - 64px)'") !== -1 &&
  layoutSwitcher.indexOf("maxWidth: '1500px'") !== -1 &&
  layoutSwitcher.indexOf("var categoryColumns = isMomMode ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))';") !== -1 &&
  layoutSwitcher.indexOf('data-layout-id={layout.id}') !== -1 &&
  layoutSwitcher.indexOf('data-layout-id="grid-standard"') !== -1);
ok('Continue Watching never renders Infinity/NaN time labels',
  continueWatchingHelpers.indexOf('isFinite(positionSec)') !== -1 &&
  continueWatchingHelpers.indexOf('isFinite(durationSec)') !== -1 &&
  continueWatchingHelpers.indexOf('!isFinite(pos) || !isFinite(dur)') !== -1 &&
  continueWatchingHelpers.indexOf('!isFinite(v)') !== -1 &&
  watchHistoryStore.indexOf('isFinite(positionSec)') !== -1 &&
  watchHistoryStore.indexOf('isFinite(durationSec)') !== -1);
ok('Sleep timer is remote-closeable and exposes a named close button',
  sleepTimer.indexOf("e.key === 'Escape'") !== -1 &&
  sleepTimer.indexOf("aria-label=\"Close sleep timer\"") !== -1);
ok('Custom side-rail D-pad handlers stop propagation so global spatial nav cannot double-move focus',
  plex.indexOf('function handleSidebarKeyDown') !== -1 && plex.indexOf('e.stopPropagation') !== -1 &&
  zero.indexOf('function _handleZeroSidebarKey') !== -1 && zero.indexOf('e.stopPropagation') !== -1 &&
  tiviMate.indexOf('function _handleBottomNavKey') !== -1 && tiviMate.indexOf('e.stopPropagation') !== -1 &&
  iptvnator.indexOf('function _handleRailKey') !== -1 && iptvnator.indexOf('e.stopPropagation') !== -1 &&
  davePower.indexOf('function _handlePowerIconKey') !== -1 && davePower.indexOf('e.stopPropagation') !== -1 &&
  extreme.indexOf('function _handleExtremeGroupKey') !== -1 && extreme.indexOf('e.stopPropagation') !== -1 &&
  ynotv2.indexOf('function _handleRailKey') !== -1 && ynotv2.indexOf('e.stopPropagation') !== -1 &&
  momMode.indexOf('function _handleMomTabKey') !== -1 && momMode.indexOf('e.stopPropagation') !== -1);

console.log('\n=== Results: ' + pass + ' PASS, ' + fail + ' FAIL ===');
process.exit(fail === 0 ? 0 : 1);
