# DaveTV Playback And Catalog Proof - 2026-05-21

## Scope

This proof covers the local failure Dave saw on `http://127.0.0.1:5174/`: blank/black catalog cards, dead iptv-org feeds hanging without usable recovery controls, and provider-save flow claiming success before the saved provider's catalog was visible.

## Findings

- Missing channel art was being represented as a transparent 1x1 PNG. The card thought it had real art and painted a black/empty tile.
- Some public iptv-org entries are dead or too slow upstream. DaveTV was not failing them fast enough and could still show "Streamed for 0s".
- The visible dead-feed "Next channel" button was blocked by the center playback control overlay.
- Provider save UI refreshed `/api/providers` but did not require a fresh `/api/catalog` proof before closing the modal.
- HLS tickets expired on a fixed 5-minute clock even during active segment use.
- Nested HLS playlist requests could inherit Range headers and return `206`, which can stall browser HLS playback.

## Corrections

- Missing/unsafe logo URLs now stay `null`; the UI rejects old transparent-pixel cached values and renders gradient initials.
- iptv-org health is now `unknown/unverified` until playback proves a stream.
- HLS ticket lifetime is sliding while playback actively fetches playlists/segments.
- Playlist proxy responses normalize playlist-shaped `206` responses to `200`.
- Dead live feeds fail after no first frame, keep controls active, and show working Previous/Next recovery actions.
- Center playback controls are disabled over dead-feed recovery actions so the visible buttons can be clicked.
- Provider save now forces fresh `/api/providers` and `/api/catalog?wait_for_cold_ms=15000` before the UI claims success.

## Screenshots

- `01-catalog-art-fallback.png` - catalog cards render gradient initials where real art is absent; zero transparent logo images found.
- `02-dead-feed-recovery.png` - dead feed fails honestly with Previous/Next controls and no "Streamed for 0s".
- `04-next-channel-clicks.png` - Next channel recovery moves from a dead feed to a working live stream.

## Verification

- `npm test --prefix services/hermes-tv-api` - PASS
- `npm run build:web` - PASS
- `npm run audit:secrets` - PASS
- Browser proof on `http://127.0.0.1:5174/` - PASS

Secrets exposed: NO.
