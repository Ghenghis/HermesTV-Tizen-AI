import TiviMateShell from '../shells/TiviMateShell.jsx';
import NetflixShell from '../shells/NetflixShell.jsx';
import PlexShell from '../shells/PlexShell.jsx';
import AppleTVShell from '../shells/AppleTVShell.jsx';
import SamsungShell from '../shells/SamsungShell.jsx';
import MomModeShell from '../shells/MomModeShell.jsx';
import DavePowerShell from '../shells/DavePowerShell.jsx';
import ZeroShell from '../shells/ZeroShell.jsx';
import NuvioShell from '../shells/NuvioShell.jsx';
import ExtremeInfiniTVShell from '../shells/ExtremeInfiniTVShell.jsx';
import StremioShell from '../shells/StremioShell.jsx';
import LiveTVShell from '../shells/LiveTVShell.jsx';
import IptvnatorShell from '../shells/IptvnatorShell.jsx';
import YnotvShell from '../shells/YnotvShell.jsx';

// NOTE: Three parallel agents are landing NuvioShell / StremioShell /
// ExtremeInfiniTVShell at the same time as LiveTVShell. When merging
// branches, keep all four entries — they're independent shells with no
// shared module state, so the registry order is the only conflict point.
var SHELL_REGISTRY = {
  'tivimate': TiviMateShell,
  'netflix': NetflixShell,
  'plex': PlexShell,
  'apple-tv': AppleTVShell,
  'samsung-tizen': SamsungShell,
  'mom-mode': MomModeShell,
  'dave-power': DavePowerShell,
  'zero': ZeroShell,
  'nuvio': NuvioShell,
  'extreme-infinitv': ExtremeInfiniTVShell,
  'stremio': StremioShell,
  'live-tv': LiveTVShell,
  'iptvnator': IptvnatorShell,
  'ynotv': YnotvShell,
};

var LAYOUT_IDS = Object.keys(SHELL_REGISTRY);

function getShell(layoutId) {
  return SHELL_REGISTRY[layoutId] || null;
}

function isValidLayout(layoutId) {
  return LAYOUT_IDS.indexOf(layoutId) !== -1;
}

export { SHELL_REGISTRY, LAYOUT_IDS, getShell, isValidLayout };
