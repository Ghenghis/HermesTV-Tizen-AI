# 24 — Dynamic Layout Engine Contract

**HermesTV Tizen AI — Architecture Contract**
**Revision:** B2
**Status:** Authoritative

---

## 1. Purpose

The Dynamic UX Shell allows Sherri (Mom) and Dave to switch between 7 visual layouts while sharing the same underlying catalog data model. No content is re-fetched when the layout changes — only the shell component and theme token set swap out. Mom loves changing the look of her TV app; this system is designed to make that effortless and reversible at any time.

---

## 2. Architecture Overview

### 2.1 Component Map

```
App.jsx
 └── ShellRenderer.jsx          ← looks up active layout, renders matching shell
      └── layoutRegistry.js     ← static map: layout ID → React shell component
      └── useLayoutEngine.js    ← hook: activeLayout state + tier-aware filtering
           └── shells/          ← 7 shell components
           └── layouts/manifests/  ← 7 JSON manifest files
           └── themes/tokens/   ← 7 theme token files
```

### 2.2 `ShellRenderer.jsx`

- Receives `{ layoutId, ...shellProps }` from `App.jsx`.
- Looks up `layoutId` in `layoutRegistry.js`.
- If the layout ID is recognized, renders the matching shell component and forwards all props.
- If the layout ID is **unknown or missing**, returns `null`. `App.jsx` catches this and falls back to the default grid (Netflix layout).
- Does **not** own state. Pure render delegation.

**Path:** `apps/hermes-web-tv/src/shells/ShellRenderer.jsx`

### 2.3 `layoutRegistry.js`

Static map of layout ID strings to React shell component imports. Seven entries — one per supported layout. Adding a new layout requires an entry here before it becomes reachable.

**Path:** `apps/hermes-web-tv/src/layouts/layoutRegistry.js`

### 2.4 `useLayoutEngine.js`

React hook responsible for:

- Holding `activeLayout` in state (initialized from profile API or `localStorage`).
- Exposing `setActiveLayout(id)` — validates ID against registry before committing.
- Filtering the layout manifest list by the current device `tier` (enhanced vs. degraded) to determine which layouts are rendered as selectable in the switcher UI.
- Returning `{ activeLayout, availableLayouts, setActiveLayout }`.

**Path:** `apps/hermes-web-tv/src/engine/useLayoutEngine.js`

### 2.5 Shell Components

Seven shell components, each implementing the same prop interface (see Section 4):

| Component | File |
|---|---|
| `TiviMateShell` | `shells/TiviMateShell.jsx` |
| `NetflixShell` | `shells/NetflixShell.jsx` |
| `PlexShell` | `shells/PlexShell.jsx` |
| `AppleTVShell` | `shells/AppleTVShell.jsx` |
| `SamsungShell` | `shells/SamsungShell.jsx` |
| `MomModeShell` | `shells/MomModeShell.jsx` |
| `DavePowerShell` | `shells/DavePowerShell.jsx` |

**Directory:** `apps/hermes-web-tv/src/shells/`

### 2.6 Layout Manifests

Seven JSON files, one per layout, describing metadata, tier requirements, and default token overrides. Served by `GET /api/layouts`.

**Directory:** `apps/hermes-web-tv/src/layouts/manifests/`

### 2.7 Theme Token Files

Seven JSON files containing CSS custom property values. Applied to `<html>` when the matching layout is activated.

**Directory:** `apps/hermes-web-tv/src/themes/tokens/`

---

## 3. Layout Registry

| ID | Display Name | Category | Accent Color | Tizen Safe | Mom-Friendly | Dave Power |
|---|---|---|---|:---:|:---:|:---:|
| `tivimate` | TiviMate | IPTV Players | `#ff7d3a` | ✓ | | |
| `netflix` | Netflix | Streaming Services | `#e50914` | ✓ | | |
| `plex` | Plex | Streaming Services | `#e5a00d` | ✓ | | |
| `apple-tv` | Apple TV | Streaming Services | `#0071e3` | ✓ | | |
| `samsung-tizen` | Samsung Tizen | Smart TV Shells | `#1428a0` | ✓ | | |
| `mom-mode` | Mom Mode | Special Modes | `#ff7eb3` | ✓ | ✓ | |
| `dave-power` | Dave Power | Special Modes | `#00d4aa` | | | ✓ |

**Tizen Safe:** Layout has been validated against Tizen 5.5 DOM constraints and passes the visual regression gate defined in `docs/10_ACCEPTANCE_GATES_VISUAL_RUNTIME_SECURITY.md`.

**Mom-Friendly:** Enforces minimum `font_scale` of 1.4, simplified navigation chrome, and warm palette. Recommended default for Sherri.

**Dave Power:** Enables the stats sidebar and advanced filter panel. Restricted to enhanced tier rendering path.

---

## 4. Shell Component Interface

All seven shell components accept an identical prop signature. No shell may introduce required props outside this contract.

```js
{
  catalog:        Array,    // Full content catalog from provider API
  profile:        Object,   // Active user profile { id, name, tier, preferences }
  tier:           String,   // 'enhanced' | 'degraded'
  providers:      Array,    // Active provider configs
  onItemSelect:   Function, // (item) => void — triggered on content selection
  contentFilter:  Object,   // { genre, year, rating } — active filter state
  providerFilter: Array,    // Provider IDs to include; empty = all
  qualityFilter:  String,   // 'sd' | 'hd' | 'uhd' | null
}
```

Shells are permitted to ignore props they do not use. Shells must not crash if optional props are `null` or `undefined`.

---

## 5. Layout Switcher — Trigger Mechanisms

The layout switcher can be opened or driven by five distinct paths:

### 5.1 "Change Look" Button

- Rendered in `App.jsx` header when a profile is loaded.
- Styled with the active layout's accent color.
- Opens the `LayoutSwitcherModal` component.

### 5.2 Keyboard Shortcut (Web)

- `Ctrl+L` opens the layout switcher.
- Intended for Dave when using HermesTV in a desktop browser.
- Registered in `App.jsx` via `useEffect` on mount.

### 5.3 Settings Panel

- Settings panel (`components/SettingsPanel.jsx`) contains a "Change Layout" button.
- Opens the same `LayoutSwitcherModal`.

### 5.4 Chatbot Command

- Hermes chatbot processes natural language layout commands.
- Recognized phrases: `"change layout to netflix"`, `"switch to TiviMate"`, `"mom mode"`, `"dave power"`, and equivalents.
- Resolved to an `update_layout` action in the agent command schema (`docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md`).
- Action payload: `{ "action": "update_layout", "layout_id": "<id>" }`.

### 5.5 Tizen Remote — Smart Hub Button

- Key code `10135` (Smart Hub) is mapped in `utils/tizenKeyMap.js` to the command `"toggle layout switcher"`.
- The Tizen key handler (`installTizenKeyHandler`) forwards this command to `App.jsx` via the `onCommand` callback.
- `App.jsx` toggles the `LayoutSwitcherModal` on receipt of `"toggle layout switcher"`.

---

## 6. Tier Policy

### 6.1 QN85 / QN95 — Enhanced Tier

- All 7 layouts available and selectable.
- Enhanced animations enabled (CSS transitions, backdrop blur, fade-in sequences).
- `DavePowerShell` stats panel (right sidebar) rendered.
- No performance caps applied to Mom's TV (Sherri's QN85/QN95 always receives enhanced path regardless of any other setting).

### 6.2 UN-class / Degraded Tier

- All 7 layouts remain available for selection (no layouts are hidden from UN-class users).
- Enhanced-only animations are disabled (`prefers-reduced-motion` equivalent behavior enforced at the shell level).
- `DavePowerShell` stats sidebar is hidden (sidebar DOM node is not rendered on degraded tier).
- Dave's TV may carry performance caps; Mom's TV never does (see `docs/02_TV_MODEL_RESEARCH_LOCK_QN85Q7F_UN55CU8000.md`).

### 6.3 MomModeShell Enforcement

`MomModeShell` enforces `font_scale >= 1.4` regardless of tier or any profile preference that specifies a lower value. This floor is non-negotiable and applied via inline style on the shell root element.

### 6.4 DavePowerShell Stats Panel

The right-sidebar stats panel (`components/StatsSidebar.jsx`) is conditionally rendered:

```jsx
{tier === 'enhanced' && <StatsSidebar streams={catalog} />}
```

On degraded tier the sidebar is not mounted — it is not merely hidden.

---

## 7. Theme Token Application

### 7.1 Token File Structure

Each layout has a corresponding token file at `apps/hermes-web-tv/src/themes/tokens/{layoutId}.json`. Token files define CSS custom properties:

| Token | Purpose |
|---|---|
| `--bg` | Page background color |
| `--surface` | Card / panel background |
| `--surface-raised` | Elevated card / modal background |
| `--text` | Primary text color |
| `--muted` | Secondary / muted text color |
| `--accent` | Accent / interactive color |
| `--border` | Border / divider color |
| `--font-scale` | Base font scale multiplier |

### 7.2 Application Mechanism

When the active layout changes, the theme engine calls:

```js
applyThemeByName(layoutId)
```

This function:

1. Removes all existing `theme-*` classes from `<html>`.
2. Adds `theme-{layoutId}` class to `<html>`.
3. CSS in `themes/global.css` defines `:root.theme-{layoutId}` blocks that map token names to values.

**B3 Note:** CSS custom property injection via `:root` blocks is the target state. In B2, shells apply tokens via inline styles on the shell root element. Wiring `:root` injection is a B3 task.

---

## 8. API Endpoints

Both endpoints live in `services/hermes-tv-api/src/routes/`.

### 8.1 `GET /api/layouts`

Returns the array of all layout manifest objects.

**Response shape:**

```json
[
  {
    "id": "mom-mode",
    "name": "Mom Mode",
    "category": "Special Modes",
    "accent": "#ff7eb3",
    "tizen_safe": true,
    "mom_friendly": true,
    "dave_power": false
  }
]
```

No authentication required. Layout list is not user-scoped.

### 8.2 `PATCH /api/settings`

Accepts a partial settings update.

**Request body:**

```json
{
  "active_layout": "netflix",
  "active_theme": "netflix"
}
```

- Both fields are optional. Unknown layout or theme IDs are rejected with `400`.
- Valid request returns the full merged settings object with `200`.
- Profile persistence of layout preference is planned for B3 (currently written to `localStorage` only).

---

## 9. VPS Deployment

`hermes-tv-api` and `hermes-web-tv` both have `Dockerfile`s and are declared as services in `upstream/docker-vps/VPS_COMPOSE.yml`.

**Routing:**

- `hermes-web-tv` nginx configuration proxies `/api/*` requests upstream to `hermes-tv-api`.
- Caddy terminates TLS and routes traffic by domain name.
- No API keys or secrets are embedded in Docker images; all secrets are injected at runtime via environment variables.

**BLOCKER:** VPS SSH access is not yet configured. No deployment to the VPS has been performed. Full deployment procedure and current blocker details are documented in `docs/research/BLOCKER_VPS_SSH.md`.

---

## 10. B3 Roadmap

The following items are deferred to the B3 milestone and are not present in B2:

| Item | Detail |
|---|---|
| `:root` CSS var injection | Shells currently use inline styles for tokens. B3 wires `applyThemeByName` to true `:root` custom property injection per layout. |
| Source health overlays | Live stream quality indicators (bitrate, buffer health, signal) inside shell content cards. Spec in `docs/15_CINEMATIC_METADATA_AND_SOURCE_HEALTH_CONTRACT.md`. |
| Mom's layout preference persistence | Sherri's chosen layout is saved to her profile via `PATCH /api/settings` and restored on next session. B2 uses `localStorage` only. |

---

*End of contract — `docs/24_DYNAMIC_LAYOUT_ENGINE_CONTRACT.md`*
