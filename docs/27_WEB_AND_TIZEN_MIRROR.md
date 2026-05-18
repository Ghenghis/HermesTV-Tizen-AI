# 27 — Web and Tizen Mirror

The HermesTV web app (Dave) and the HermesTV Tizen app (Mom) are mirror images
of the same VPS-served API. This document explains the relationship, what is
identical, what differs, and how to test the pair.

---

## Purpose

- **Mom's QN85 QLED** runs the HermesTV Tizen app (`apps/hermes-tv-tizen/`),
  sideloaded as a `.wgt` package. It defaults to the `mom-mode` layout.
- **Dave's Windows workstation** runs the HermesTV web app
  (`apps/hermes-web-tv/`) in a browser (he also uses the Samsung TV as a PC
  monitor for it). It defaults to the `dave-power` layout.

Both clients render the same content from the same backend. The Tizen package
and the web bundle differ only in their entry point and packaging — every byte
of the data layer is shared.

Per the asymmetric-performance rule, Mom's TV never carries system-imposed
caps. Both apps go through the same API, but client-side rendering policies
apply quality caps only to Dave's TV.

---

## Shared infrastructure

```
                       ┌────────────────────────────────────────┐
                       │   Hostinger Linux VPS                  │
                       │   hermestv.example.com  (Caddy + TLS)  │
                       │                                        │
                       │   ┌──────────────┐  ┌──────────────┐   │
                       │   │ hermes-tv-api│  │  threadfin   │   │
                       │   │   :3001      │  │   :34400     │   │
                       │   └──────┬───────┘  └──────┬───────┘   │
                       │          │                 │           │
                       │          ▼                 │           │
                       │   ┌──────────────┐         │           │
                       │   │  Azure TTS   │         │           │
                       │   │ (api.cognit. │         │           │
                       │   │  microsoft)  │         │           │
                       │   └──────────────┘         │           │
                       │          │                 │           │
                       │   ┌──────┴─────────────────┴───────┐   │
                       │   │ IPTV providers (Apollo, XHD)   │   │
                       │   └────────────────────────────────┘   │
                       │          │                             │
                       │          ▼  (Tailscale)                │
                       └──────────┼─────────────────────────────┘
                                  │
                       ┌──────────▼──────────────┐
                       │  Workstation Jellyfin   │
                       │  (reached over Tailnet) │
                       └─────────────────────────┘

       https://hermestv.example.com/*  (HTTPS, public)
       ┌──────────────┴──────────────┐
       ▼                             ▼
┌─────────────────┐          ┌──────────────────┐
│ Tizen app (Mom) │          │ Web app (Dave)   │
│  QN85 QLED      │          │  Browser / QN85  │
│  mom-mode dflt  │          │  dave-power dflt │
└─────────────────┘          └──────────────────┘
```

The web app is served by an nginx container (`hermes-web-tv:80`) behind the
same Caddy that proxies `/api/*` to `hermes-tv-api:3001`. The Tizen app is
served from inside the TV itself (the `.wgt` is sideloaded) and reaches the
same Caddy across the open internet.

---

## What's identical

Both Mom's and Dave's clients consume **the same JSON shapes** from the same
endpoints on the same VPS:

| Endpoint | Returns |
|---|---|
| `GET /api/catalog` | Channel + media catalog, identical for both clients |
| `GET /api/profiles` | List of profiles (`sherri`, `dave`) with nicknames and chosen agent names |
| `GET /api/layouts` | Layout descriptors (`mom-mode`, `dave-power`, any custom variants) |
| `POST /api/tts/synthesize` | Azure TTS audio stream (or 202 stub in dev) |
| `POST /api/tts/voice` | TTS via Azure voice profile per profile |
| `POST /api/ui-command/validate` | Validates an agent UI-command schema payload |
| `GET /api/upstream-apps` | Available upstream app surfaces (Threadfin etc.) |

Profile resolution, nickname overrides, agent rename ("Hermes" default), and
voice selection (Azure-only — Bixby is forbidden as an AI/TTS path) are all
handled server-side and returned identically to both clients.

---

## What differs

| Aspect | Tizen (Mom) | Web (Dave) |
|---|---|---|
| Entry point | `index.html` sideloaded inside `.wgt` | `index.html` served by nginx |
| Packaging | Tizen Web project (Chrome 76 ES5 build) | Vite + React (modern ES build) |
| Default layout | `mom-mode` (per profile, not hardcoded) | `dave-power` (per profile, not hardcoded) |
| Input | Samsung TV remote + optional mic capture | Keyboard, mouse, optional remote |
| Local-dev override | `localStorage.hermestv.api_base` via Settings panel | `VITE_API_BASE` env at build, or Settings panel |
| Performance policy | Never system-capped (asymmetric rule) | May be capped by client policy on Dave's TV |

The default-layout values come from `/api/profiles`, not from compiled-in
client code. A user can re-assign their default layout at runtime; both
clients pick up the change on next profile load.

---

## Testing parity

Playwright tests live in `tests/playwright/` and run against the web app at a
fixed `1920x1080` viewport. A second Playwright project,
`samsung-qn85-mock`, runs the same test suite under a Tizen user-agent and
Chrome 76 feature emulation. This catches most parity regressions without
requiring real hardware.

```
playwright.config.js
├── project: web-desktop      (1920x1080, latest Chromium)
└── project: samsung-qn85-mock (1920x1080, Tizen UA, Chrome 76 emulation)
```

The Tizen build is then validated on **real hardware** via QN85 mirror
testing — see [`upstream/mirror-testing/README.md`](../upstream/mirror-testing/README.md).
Mirror testing covers:

- Real Tizen Chrome 76 quirks (ES5 strictness, `localStorage` behavior)
- Real Azure TTS playback latency on the TV's audio pipeline
- Real Samsung remote input (no synthetic events)

Both layers (Playwright mock + real-hardware mirror) must pass before a
release is considered shipped to Mom.

---

## Updating the Tizen app

1. Bump version in `apps/hermes-tv-tizen/config.xml`.
2. Run the Tizen build: `npm run build:tizen` (produces `dist/HermesTV.wgt`).
3. Sideload via Tizen Studio: `Device Manager → Permit to install
   applications → Push .wgt`.
4. Restart the HermesTV app on the TV.

The VPS URL (`https://hermestv.example.com`) lives in `config.xml`'s
`<access origin>` and in `src/api/apiBase.js`'s `DEFAULT_API_BASE`. It does
**not** change between rebuilds — the API moves only when the VPS itself
moves, which is a deliberate, rare event.

---

## Switching the API URL on Tizen

For local-dev iteration, override the API base in the Settings panel:

```js
window.localStorage.setItem('hermestv.api_base', 'http://192.168.1.42:3001');
```

The next API call reads the new base. The default
(`https://hermestv.example.com`) is restored by:

```js
window.localStorage.removeItem('hermestv.api_base');
```

The Settings panel surfaces these two operations as buttons so a developer
never has to type into the TV's on-screen keyboard.

---

## Mirror testing flow

The fastest iteration loop short of sideloading a `.wgt`:

1. On the workstation: `npm run dev:web` (Vite dev server on `:5173`).
2. On Mom's QN85, open Samsung Internet browser.
3. Navigate to `http://192.168.1.x:5173` (the workstation's LAN IP).
4. The web app renders inside Samsung Internet on the real QN85 panel.

This catches most TV-specific rendering issues (focus rings, font rendering,
remote input) without rebuilding the `.wgt`. Things mirror testing
**cannot** catch (must still be verified on a real `.wgt` install):

- Tizen `application` lifecycle events
- Tizen-only privileges (`tv.audio`, `network.get`)
- ES5-only behavior under real Chrome 76

See [`upstream/mirror-testing/README.md`](../upstream/mirror-testing/README.md)
for the full mirror-testing checklist and known divergence points between
Samsung Internet and the sideloaded app shell.
