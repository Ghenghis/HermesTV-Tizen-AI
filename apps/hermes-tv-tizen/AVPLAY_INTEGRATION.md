# AVPlay integration — DaveTV on Tizen 6.5

This doc explains how the React shell in `apps/hermes-web-tv/` reaches
into the Samsung-only `window.webapis.avplay` API for native-quality HLS
playback on Tizen TVs, and how it falls back to `hls.js` everywhere else.

> Upstream reference: `docs/IPTV_Player_Zero/SAMSUNG_TIZEN_PORT.md`
> §"player-shim.js" and §"Q7 QLED-Specific Notes". The patterns below
> are adapted from that guide to fit our React 18 + Vite + ES5-friendly
> hooks layer.

---

## Why AVPlay and not hls.js everywhere?

| Path | Pros | Cons |
|---|---|---|
| **AVPlay** (Tizen native) | Hardware-decoded HEVC + AV1, 4K HDR ready, low CPU, panel-native scaler, real "wall-clock-time" live for TimeShift, DRM-ready (PlayReady on Samsung) | Tizen-only; opaque from JS (limited error detail); cannot be inspected with Chrome DevTools network tab |
| **hls.js** (MSE fallback) | Works on every Chromium-class browser; rich DX (Chrome DevTools, event hooks); identical desktop/TV behaviour | Software demux of every TS segment → CPU spike on Q7 above 1080p60; no DRM; can't drive Tizen's TimeShift buffer |

So the rule the hook follows is simple: **on Tizen, use AVPlay if it's
present; everywhere else, use hls.js.** Both code paths back the same
`<video>` element on screen and expose the same React state shape so
`PlayerModal` and `MultiviewPlayer` don't have to know which one is
running.

---

## Where the code lives

```
apps/hermes-tv-tizen/
└── AVPLAY_INTEGRATION.md             ← this doc

apps/hermes-web-tv/src/hooks/
├── useHlsStream.js                   ← hls.js engine (existing)
└── useAvplayStream.js                ← AVPlay + fallback bridge (stub)
```

The bridge file `useAvplayStream.js` is the one new piece. It is
intentionally tiny:

1. On mount, probe for `window.webapis && window.webapis.avplay`.
2. If absent → delegate to the existing `useHlsStream` hook unchanged.
3. If present → drive AVPlay through its state machine, mirror the same
   `{ loading, error, level, levels }` return shape that
   `useHlsStream` exposes so `PlayerModal` can `import` either hook
   transparently. (The stub today wires AVPlay-open → play; richer
   listener wiring lands as the Phase-3 PR series ships.)

`PlayerModal` itself does **not** need to change to consume the bridge —
swap the `import useHlsStream from '../hooks/useHlsStream.js'` line
for `import useAvplayStream from '../hooks/useAvplayStream.js'` once
the AVPlay path is verified on Sherri's TV. Both modules export an
identical default function signature.

---

## Tizen 6.5 AVPlay state machine

```
                ┌──────┐    open(url)    ┌──────┐
                │ NONE │ ──────────────► │ IDLE │
                └──────┘                 └──────┘
                                            │
                                            │ prepareAsync()
                                            ▼
                                         ┌───────┐
                                         │ READY │
                                         └───────┘
                                            │
                                            │ play()
                                            ▼
                ┌────────┐   pause()    ┌─────────┐   close()
                │ PAUSED │ ◄─────────── │ PLAYING │ ───────────► back to NONE
                └────────┘   play()     └─────────┘
                       │   ───────────►
                       │                    ▲
                       └────────────────────┘
```

State transitions matter because AVPlay throws (synchronously, with no
useful message in dlog) if you call a method out-of-state. The bridge
hook tracks the state internally and queues `play()` requests during
`prepareAsync()` instead of firing them too early.

Key methods we use:

- `webapis.avplay.open(url)` — accepts the bare URL string.
- `webapis.avplay.setStreamingProperty(name, value)` — for
  `'USER_AGENT'` (some providers reject the default Tizen UA) and
  `'COOKIE'` for token-bearing playback URLs (see DRM note below).
- `webapis.avplay.setListener({...})` — onbufferingstart,
  onbufferingcomplete, oncurrentplaytime, onstreamcompleted, onerror.
- `webapis.avplay.prepareAsync(onSuccess, onError)` — must be called
  before `play()`; transitions IDLE → READY asynchronously.
- `webapis.avplay.play()` / `.pause()` / `.stop()` / `.close()`.
- `webapis.avplay.seekTo(ms)` — millisecond precision; VOD-only.
- `webapis.avplay.setDisplayRect(x,y,w,h)` — positions the hardware
  surface. For the `<video>`-backed bridge we read the live element's
  `getBoundingClientRect()` and forward it; this is what lets AVPlay
  overlay align with the React-driven controls.

---

## DRM and token-bearing URL caveats

The `/api/play` ticket flow returns short-lived JWT-signed URLs. AVPlay
treats the URL as opaque: it cannot read query-string tokens for the
DRM key-request callback the way hls.js can. Two consequences:

1. **No DRM today.** The Q7 panels would technically support PlayReady,
   but our backend doesn't currently mint PlayReady licenses. Encrypted
   streams therefore fall through to the hls.js path, which can drive
   the JS-side AES-128 decryptor. This is fine for live IPTV (mostly
   unencrypted) and breaks gracefully on paid VOD until we wire
   PlayReady server-side.

2. **Token expiry mid-stream.** When the JWT in the URL hits its
   `exp` timestamp, the next segment fetch 401s and AVPlay raises
   `onerror` with `PLAYER_ERROR_INVALID_URI`. The bridge listens for
   that error code and, when seen, refreshes the ticket via
   `apiBase.fetchHermesAPI('/api/play/refresh')` and re-opens AVPlay
   with the new URL. The refresh is idempotent — same channel id, new
   token — so no UI flicker.

The token itself is stored briefly in `tizen.keymanager` (privilege
declared in `config.xml.example`) instead of `localStorage`. The QR
onboarding flow runs in a worldview where untrusted pages could
otherwise read it.

---

## Fallback path (no AVPlay)

When `window.webapis.avplay` is missing — i.e. desktop browser, dev
Vite server, or a Tizen build where the privilege got rejected at
install time — the bridge delegates verbatim to `useHlsStream.js`.
That hook already handles:

- Native HLS via `video.canPlayType('application/vnd.apple.mpegurl')`
  (Safari + some Tizen WebKit builds).
- MSE-based `hls.js` lazy-loaded via dynamic import (keeps the ~80 KB
  module out of the initial bundle).
- ABR level enumeration and `MANIFEST_PARSED` → `level switched`
  event surfacing.

The fallback is therefore zero-config and zero-extra-cost; no caller
ever has to know which engine is driving the video element.

---

## Build-time check

`tools/tizen-prep.js` does **not** statically validate AVPlay
privilege presence (the Tizen CLI itself does that at package time
when signing), but `tools/wgt-inspect.sh` includes a CSP correctness
check that runs against the final `.wgt`. If you change the privilege
list in `config.xml.example` always re-run:

```bash
./tools/wgt-inspect.sh apps/hermes-tv-tizen/dist-tizen/HermesTV-0.1.0.wgt
```

before sideloading onto Sherri's TV.

---

## Testing AVPlay locally (without a TV)

There is no useful local emulator for `webapis.avplay`. The legacy
scaffold at `apps/hermes-tv-tizen-native/src/ui/player/avplayEngine.js`
includes a console-logging mock — its shape is reused in the bridge
hook's dev fallback so you can at least see the calls and order in
Chrome DevTools when running `npm run dev` inside `hermes-web-tv/`.
Real validation requires sideloading and reading `sdb dlog`.

---

## TL;DR for someone touching this code in a hurry

1. AVPlay is opaque, hardware-fast, Tizen-only.
2. The bridge hook is `apps/hermes-web-tv/src/hooks/useAvplayStream.js`.
3. It mirrors `useHlsStream`'s public shape so it's a drop-in swap.
4. Falls back to hls.js when `window.webapis.avplay` is absent.
5. Required privilege: `http://developer.samsung.com/privilege/avplay`
   (already declared in `config.xml.example`).
6. Tokens go through `tizen.keymanager`, not `localStorage`.
7. Re-run `tools/wgt-inspect.sh` after any config.xml edit.
