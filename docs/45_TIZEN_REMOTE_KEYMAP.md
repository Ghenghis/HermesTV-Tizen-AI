# 45 — Tizen Remote Keymap (Developer Reference)

Comprehensive reference for the Samsung Tizen 6.5 remote (QN85/QN95 design
target). Covers every keyCode HermesTV listens for, what route it dispatches
to, which handlers expect it, and how to test the binding on the emulator
or sideloaded on the real TV.

> Sources of truth (read these alongside this doc):
> - `apps/hermes-web-tv/src/utils/tizenKeyMap.js` — base map +
>   `registerTizenKeys()` + `dispatchToRoute()`.
> - `apps/hermes-web-tv/src/utils/tizenSpatialNav.js` — arrow-key spatial
>   nav helpers (pure functions + the `installSpatialNav` wiring helper).
> - `apps/hermes-web-tv/src/utils/zeroTizenKeyMap.js` — Zero-shell overlay
>   (favorites / tab-switch / search hooks).
> - Samsung docs: <https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html>
> - Samsung tvinputdevice API:
>   <https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/tvinputdevice-api.html>

---

## 1. The full keyCode table

All codes confirmed against the Samsung Smart TV remote spec for Tizen 6.5.
"Reg?" = must be passed to `tizen.tvinputdevice.registerKey(name)` before
the app receives `keydown` events. Codes without "Reg?" fire automatically
in the webview.

| Category | Code(s) | Name (TIZEN_KEYS) | Reg? | Tizen registerKey name | Route |
|---|---|---|:---:|---|---|
| **D-pad** | 37 | `left` | no | — | `nav` |
| | 38 | `up` | no | — | `nav` |
| | 39 | `right` | no | — | `nav` |
| | 40 | `down` | no | — | `nav` |
| | 4 | `left` (alt) | no | — | `nav` |
| | 5 | `up` (alt) | no | — | `nav` |
| | 6 | `right` (alt) | no | — | `nav` |
| | 7 | `down` (alt) | no | — | `nav` |
| **Selection** | 13 | `enter` (OK) | no | — | `select` |
| **System nav** | 10009 | `back` | no | — | `back` |
| | 10182 | `exit` | yes | `Exit` | `exit` |
| | 10071 | `smart_hub` | no | — | `smart_hub` |
| | 10072 | `source` | yes | `Source` | `source` |
| | 10135 | `tools` | yes | `Tools` | `tools` |
| | 10073 | `channel_list` | yes | `ChannelList` | `channel_list` |
| | 10190 | `previous_channel` | yes | `PreviousChannel` | `previous_channel` |
| **Color buttons** | 403 | `red` | yes | `ColorF0Red` | `color` |
| | 404 | `green` | yes | `ColorF1Green` | `color` |
| | 405 | `yellow` | yes | `ColorF2Yellow` | `color` |
| | 406 | `blue` | yes | `ColorF3Blue` | `color` |
| **Transport** | 415 | `play` | yes | `MediaPlay` | `transport` |
| | 19 | `pause` | yes | `MediaPause` | `transport` |
| | 10252 | `play_pause` | yes | `MediaPlayPause` | `transport` |
| | 413 | `stop` | yes | `MediaStop` | `transport` |
| | 417 | `fast_forward` | yes | `MediaFastForward` | `transport` |
| | 412 | `rewind` | yes | `MediaRewind` | `transport` |
| **EPG / info** | 457 | `info` | yes | `Info` | `info` |
| | 10232 | `guide` | yes | `Guide` | `guide` |
| **Channel** | 427 | `channel_up` | yes | `ChannelUp` | `channel` |
| | 428 | `channel_down` | yes | `ChannelDown` | `channel` |
| **Volume** | 447 | `volume_up` | yes | `VolumeUp` | `volume` |
| | 448 | `volume_down` | yes | `VolumeDown` | `volume` |
| | 449 | `mute` | yes | `VolumeMute` | `volume` |
| **Numpad** | 48-57 | `num_0` .. `num_9` | yes | `0` .. `9` | `numeric` |

### What's NOT in this map (and why)

| Key on remote | Why we don't bind it |
|---|---|
| Power | Samsung firmware intercepts before the app sees it. |
| Bixby mic button | Memory rule: voice input is Azure-only; Bixby forbidden for AI/TTS. We never register the Bixby key — accidental press should NOT wake Bixby in our app context. |
| Settings / Menu (10133 on 2018+ remotes) | The Tools key (10135) is our menu entrypoint; binding both creates ambiguity. |
| Netflix / Prime / Disney hotkeys | Vendor-licensed; Samsung forbids re-binding. Pressing one exits HermesTV by design. |
| Magic Remote pointer events | Out of scope — QN85 ships with a standard remote; pointer hovering is opt-in via a separate listener (future work). |

---

## 2. Public API

### `TIZEN_KEYS` — canonical map

```js
import { TIZEN_KEYS } from './utils/tizenKeyMap';
TIZEN_KEYS[415];   // 'play'
TIZEN_KEYS[10009]; // 'back'
```

Identical object to the existing `TIZEN_KEY_CODES`; both names export the
same reference so legacy consumers (`zeroTizenKeyMap.js`) keep working.

### `registerTizenKeys()` — boot-time registration

```js
import { registerTizenKeys } from './utils/tizenKeyMap';
const registered = registerTizenKeys(); // number registered, 0 in dev
```

Calls `tizen.tvinputdevice.registerKey(...)` for every name in
`TIZEN_REGISTERED_KEYS`. Prefers `registerKeyBatch` when available (single
SDB round-trip), falls back to per-key registration with per-failure
warnings. **Safe to call from any browser** — silently returns 0 in dev.
Idempotent on-TV. Call once at app boot (e.g. in `App.jsx`'s effect).

Alias for the older `registerTizenRemoteKeys()`; both names point at the
same fn.

### `dispatchToRoute(keyEvent, routes)` — generic route dispatcher

```js
import { dispatchToRoute } from './utils/tizenKeyMap';

document.addEventListener('keydown', function (e) {
  dispatchToRoute(e, {
    back:        function (p) { return closeTopModal(); },
    transport:   function (p) { return player.handleKey(p.name); },
    color:       function (p) { return colorShortcut(p.name); },
    channel:     function (p) { return p.name === 'channel_up' ? nextCh() : prevCh(); },
    volume:      function (p) { /* HW handled — sync UI only */ },
    numeric:     function (p) { numpad.push(p.name.slice(4)); }
  });
});
```

Handler payload: `{ keyCode, name, route, event }`. Truthy return signals
"I handled this" — most callers then `e.preventDefault()` to keep the key
from bubbling to the Tizen platform.

`dispatchToRoute` is **pure** — it never adds listeners or mutates state.
The route table is `TIZEN_KEY_ROUTES` and is exported for tests/inspection.

### `installTizenKeyHandler(onCommand, onBack)` — chatbot-style binding

The original two-callback helper still ships unchanged. Use this when the
caller only cares about chatbot-command shortcuts (color buttons + Smart
Hub + Guide) and the Back/Exit suppression. For richer hooks (player keys,
favorites, tab switching), prefer `installZeroShellTizenHandler` from
`zeroTizenKeyMap.js`.

---

## 3. Spatial navigation (`tizenSpatialNav.js`)

The Tizen webview does not ship the WHATWG `nav-up`/`nav-down`/etc CSS
properties. Samsung's own `webapis.tv` spatial-nav polyfill is unreliable on
the QN85 firmware. So we ship our own — small, pure, testable.

### `findFocusable(root)`

Returns every focus-eligible element under `root` (or `document`), in DOM
order, filtering out hidden / disabled / aria-hidden nodes. Selector
includes `[data-focusable]` so cards can opt in without a tabindex
attribute. Returns a fresh array on each call.

### `nextInDirection(current, candidates, direction)`

Given the focused element, the candidate set, and `'up' | 'down' | 'left' |
'right'`, returns the element that should receive focus next, or `null` if
there's nothing in that direction. **Pure** — does not call `.focus()`.

Algorithm:
1. Reject candidates that don't sit in the requested direction (with a
   perpendicular slack of half the smaller dimension, so a near-aligned row
   still works).
2. Score remaining candidates by weighted centroid distance — the primary
   axis costs 1×, the perpendicular axis costs 2×, so movement is "sticky"
   to the user's intent.
3. Return the lowest-scoring candidate.

### `installSpatialNav(options)`

Wires arrow-key spatial nav. Options:

| Option | Default | Purpose |
|---|---|---|
| `rootSelector` | `document` | Limit the nav scope (e.g. `'.shell-zero'`). |
| `onMove(next, dir)` | — | Fires after focus moves. Use for sounds / haptics / scrolling. |
| `onEdge(dir)` | — | Fires when no candidate in `dir`. Return truthy to swallow the event (e.g. for wrap-around). |
| `preventScroll` | `true` | Pass `{ preventScroll: true }` to `.focus()` so spatial nav doesn't yank scroll position. |
| `keyFilter(e)` | skip INPUT/TEXTAREA/SELECT/contentEditable | Return false to ignore arrow when typing. |

Returns an unmount fn. Wire into a React `useEffect` cleanup.

```jsx
useEffect(function () {
  return installSpatialNav({
    rootSelector: '#shell-root',
    onEdge: function (dir) {
      if (dir === 'left' && drawerCanOpen()) { openDrawer(); return true; }
      return false;
    }
  });
}, []);
```

---

## 4. Which handlers expect which routes

| Route | Owner | Where to wire it |
|---|---|---|
| `nav` | spatial nav | `installSpatialNav` is the canonical handler. Shells normally don't bind `nav` directly in `dispatchToRoute`. |
| `select` | active shell | Shell handles OK on its focused element. ZeroShell already does this through React click handlers (browser turns `keydown 13` into a `click` on a focused button). |
| `back` | App.jsx + active modal | Highest priority binding — Tizen hard-exits if Back bubbles. Each modal pushes a Back handler when it opens. |
| `exit` | App.jsx | Treated same as Back when a modal is open; otherwise default platform exit. |
| `smart_hub` / `tools` | layout switcher | `KEY_TO_COMMAND` maps both to `'toggle layout switcher'`. |
| `source` | future Sources panel | Currently a no-op; wired through `dispatchToRoute` once Sources lands. |
| `channel_list` | LiveTVShell | Opens the channel list overlay. |
| `previous_channel` | LiveTVShell | Jumps to the last-watched channel. |
| `color` | per-shell overlay | Default: chatbot command. Zero-shell overrides Red → favorites, Green/Yellow/Blue → tab switch. See `zeroTizenKeyMap.js`. |
| `transport` | PlayerModal | `play`/`pause`/`play_pause`/`stop`/`fast_forward`/`rewind`. PlayerModal subscribes via the player-key hook on `installZeroShellTizenHandler`. |
| `info` | PlayerModal + EPG | Shows info overlay on the focused channel/program. |
| `guide` | LiveTVShell | Opens the EPG grid. Also mapped to `'show live'` chatbot command as a fallback. |
| `channel` | LiveTVShell | `channel_up` / `channel_down`. |
| `volume` | UI-only sync | HW handles volume; we listen so we can show a slider. |
| `numeric` | Numpad component | Pushes digits to the channel-entry buffer. |

---

## 5. Testing on the Tizen emulator

```text
1. Boot the Tizen emulator (Tizen Studio → Emulator Manager → QN85_650).
2. Connect SDB:                    sdb connect 127.0.0.1:26101
3. Sideload the .wgt:              sdb install dist/HermesTV.wgt
4. Open the app from the launcher.
5. Open the remote-control window in the emulator (Ctrl+M on macOS / Linux,
   View → Remote on Windows). The emulator surfaces every physical button
   on a QN85 remote, including the four color buttons and Tools.
6. Tail logs:                      sdb dlog -s HermesTV ConsoleMessage
```

To verify the keyCode mapping in dev Chromium (no Tizen runtime), open
DevTools and run:

```js
window.addEventListener('keydown', function (e) {
  console.log('keydown', e.keyCode, e.key);
});
```

…then press each arrow / Enter / Back. The emulator surfaces the Tizen-only
codes (10009 / 10182 / 415 / etc.) once `registerTizenKeys()` has been
called at boot. On dev Chromium the Tizen-only codes will never fire — use
the emulator or the real TV for those.

### Sample assertions

| Key on emulator | Expected behavior on Zero-shell |
|---|---|
| Arrow keys | Focus moves between channel cards (spatial nav). |
| OK (13) | Activates focused card (opens player or expands hero). |
| Back (10009) | Closes the topmost modal; if none open, returns to layout switcher. |
| Red (403) | Toggles favorites rail. |
| Green (404) | Switches to Live tab. |
| Yellow (405) | Switches to Movies tab. |
| Blue (406) | Switches to Catch-up tab. |
| Tools (10135) | Opens layout switcher. |
| Play/Pause (10252) | Toggles playback in active PlayerModal. |
| Channel ↑/↓ (427/428) | Steps to next/prev channel. |
| Numpad 0-9 (48-57) | Pushes digit to channel-entry buffer. |
| Volume keys (447/448/449) | TV HW handles; app shows volume slider. |
| Info (457) | Opens info overlay on focused content. |
| Guide (10232) | Opens EPG. |

### Common gotchas

- **Forgot to call `registerTizenKeys()` at boot.** Symptom: color / transport
  keys do nothing on-TV (but work in the emulator after a hot-reload because
  the previous registration is sticky). Fix: ensure `registerTizenKeys()`
  runs in `App.jsx`'s first `useEffect`.
- **Back bubbled to OS, app exited.** Symptom: pressing Back closes HermesTV
  entirely instead of dismissing a modal. Fix: the modal's `onBack` handler
  must return truthy; the installed handler then calls `preventDefault()`.
- **Spatial nav skipped a card.** Likely cause: the card has zero rect at
  the moment of measurement (lazy-mounted under a transition). Fix: give it
  a min-size in CSS or wait one tick after the transition before fetching
  the candidate list.
- **Arrow keys move focus AND scroll the page.** Fix: pass
  `preventScroll: true` to `installSpatialNav` (it's the default — only set
  to false if you want native scroll behavior on edges).

---

## 6. Cross-references

- [27_WEB_AND_TIZEN_MIRROR.md](27_WEB_AND_TIZEN_MIRROR.md) — mirror
  architecture; same UI in browser + Tizen.
- [34_TIZEN_BUILD_AND_SIDELOAD.md](34_TIZEN_BUILD_AND_SIDELOAD.md) — full
  build + sideload runbook.
- [36_MOM_MODE_ACCESSIBILITY_AUDIT.md](36_MOM_MODE_ACCESSIBILITY_AUDIT.md)
  — focus-ring + dwell rules that interact with spatial nav.
- [09_TIZEN_BUILD_SIDELOAD_CONTRACT.md](09_TIZEN_BUILD_SIDELOAD_CONTRACT.md)
  — Tizen build contract.
