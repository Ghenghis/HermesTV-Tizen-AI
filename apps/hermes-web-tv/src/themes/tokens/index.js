import tivimate from './tivimate.json';
import netflix from './netflix.json';
import plex from './plex.json';
import appleTv from './apple-tv.json';
import samsungTizen from './samsung-tizen.json';
import momMode from './mom-mode.json';
import davePower from './dave-power.json';

export const ALL_TOKENS = [tivimate, netflix, plex, appleTv, samsungTizen, momMode, davePower];

export function getTokens(layoutId) {
  for (var i = 0; i < ALL_TOKENS.length; i++) {
    if (ALL_TOKENS[i].layout_id === layoutId) {
      return ALL_TOKENS[i];
    }
  }
  return null;
}

export default ALL_TOKENS;
