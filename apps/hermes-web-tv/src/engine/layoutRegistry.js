import TiviMateShell from '../shells/TiviMateShell.jsx';
import NetflixShell from '../shells/NetflixShell.jsx';
import PlexShell from '../shells/PlexShell.jsx';
import AppleTVShell from '../shells/AppleTVShell.jsx';
import SamsungShell from '../shells/SamsungShell.jsx';
import MomModeShell from '../shells/MomModeShell.jsx';
import DavePowerShell from '../shells/DavePowerShell.jsx';

var SHELL_REGISTRY = {
  'tivimate': TiviMateShell,
  'netflix': NetflixShell,
  'plex': PlexShell,
  'apple-tv': AppleTVShell,
  'samsung-tizen': SamsungShell,
  'mom-mode': MomModeShell,
  'dave-power': DavePowerShell,
};

var LAYOUT_IDS = Object.keys(SHELL_REGISTRY);

function getShell(layoutId) {
  return SHELL_REGISTRY[layoutId] || null;
}

function isValidLayout(layoutId) {
  return LAYOUT_IDS.indexOf(layoutId) !== -1;
}

export { SHELL_REGISTRY, LAYOUT_IDS, getShell, isValidLayout };
