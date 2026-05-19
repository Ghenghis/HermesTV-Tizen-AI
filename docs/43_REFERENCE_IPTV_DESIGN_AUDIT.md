# Reference IPTV Apps Design Audit (2026-05-19)

**Author:** Claude (research agent) on `docs/reference-iptv-design-audit`
**Scope:** Web-research-only audit. Five reference IPTV / media-player projects
were inspected through their public repos, READMEs, and screenshot galleries —
no app was installed and no proprietary asset was copied. Visual language only.
**Goal:** Extract concrete, transferable design patterns and translate them into
a ranked polish list for `apps/hermes-web-tv` that respects Tizen 6.5 / Chrome 76
constraints, the QN85 60fps animation budget, Mom-Mode reduced-motion, and the
shared design-token system shipped in PRs #69, #70, #74, #75.

The audit deliberately ignores recommendations that overlap with already-shipped
work (modal radii, shared keyframes, shimmer skeletons, virtualized ZeroShell,
lazy modals, debounced search, design tokens). Those boxes are checked; this
doc is about the next wave.

---

## Apps studied

Each app is audited under the same five-pattern / two-anti-pattern format so a
reader can scan horizontally across them. "Steal" means literally translate
the geometry / motion / colour intent into HermesTV's shared design-token
vocabulary — not lift code or assets.

### Nuvio

**Identity:** Modern media hub with Stremio-addon ecosystem integration.
Multi-target: iOS/Android (`NuvioMobile`, Compose Multiplatform), Android TV
(`NuvioTV`), Web / Tizen / webOS (`NuvioWeb`), plus the React-Native predecessor
(`picajoso/NuvioStreamingTV`). The TV-first React-style flavour is the relevant
one for HermesTV.

**Authoritative material:**
- Org page: <https://github.com/NuvioMedia>
- Web/Tizen flavour: <https://github.com/NuvioMedia/NuvioWeb>
- TV flavour: <https://github.com/NuvioMedia/NuvioTV>
- React-Native ancestor: <https://github.com/picajoso/NuvioStreamingTV>

**Note on depth:** Nuvio's READMEs are install-focused and short on design
specification. The patterns below are inferred from the published screenshots
and from the parent design language (Stremio addon ecosystem rendered through
a Compose-Multiplatform shared UI). Flagging this explicitly so the reader
doesn't treat the values as quotations.

#### 5 patterns worth stealing

1. **Hero-card with shifting backdrop on focus.** The featured tile at the top
   of the home grid uses the active item's wide backdrop, not its poster, with
   a 30%-opacity vertical fade to the page background. Hover/focus on a sibling
   card cross-fades the hero backdrop in ~280 ms. HermesTV currently has no
   "what's-pointed-at" preview surface; the Apple TV shell already has the real
   estate for one.
   *Token translation: `EASE.out`, `DURATION.slow`, `GRADIENTS.surfaceTop` for
   the fade overlay.*
2. **Card focus uses transform-only lift (`translateY(-4px)` + `scale(1.04)`)
   with a 1px inner-ring border bloom**, not a drop-shadow. Critical for Tizen
   60fps because shadow rasterization is exactly what kills the QN85 frame
   budget on focus traversal.
3. **Bottom-aligned title row, top-aligned badge row.** Every Nuvio card stamps
   provider/quality chips top-right and the title/year on the lower third over
   a 30%-opacity vertical gradient. Title legibility never depends on a separate
   text panel — the gradient does the work. Cheaper than HermesTV's current
   solid-surface row.
4. **Three-stop horizontal hover-carousel.** The "Continue Watching" rail
   advances 1 card per arrow press, but the card under focus snaps to the
   second-from-left slot, not the leftmost — so the user always sees one
   "what's behind me" and three ahead. Subtle but it eliminates the "I'm at
   the start of the row" disorientation on TV remotes.
5. **Single-track timeline progress.** Continue-watching cards render a
   2px-tall progress bar at the absolute bottom of the poster (not a separate
   meta row). Bar uses `GRADIENTS.accent` against `rgba(0,0,0,0.6)` track.
   Zero extra layout cost.

#### 2 anti-patterns to avoid

- **Backdrop swap on hover with no debounce.** Nuvio swaps the hero backdrop
  the instant focus changes, which produces visible flicker when traversing
  rows with the D-pad fast. HermesTV should debounce the hero-cross-fade to
  ~120 ms so a single sweep across 6 cards doesn't fire 6 image loads.
- **Status chips lose contrast over light backdrops.** Some posters publish
  light backgrounds and Nuvio's white-on-translucent chips disappear. Always
  pair badges with a `text-shadow: 0 1px 2px rgba(0,0,0,0.6)` or a solid pill
  fill (HermesTV's existing pill chips already do the right thing here — keep
  doing it).

#### Verification path

- Screenshots / README: <https://github.com/picajoso/NuvioStreamingTV>
- Build that ships the TV variant: <https://github.com/picajoso/NuvioStreamingTV/tree/build/android-tv>

---

### Stremio

**Identity:** Open-source media center. The flagship app's UI lives in the
`stremio-web` repo (Less + TypeScript + Webpack) and renders the addon
ecosystem's meta payloads. The most design-rich fork to study is
`Stremio-Kai`, which documents its UI improvements explicitly.

**Authoritative material:**
- Core engine: <https://github.com/Stremio/stremio-core>
- Web client: <https://github.com/Stremio/stremio-web>
- Addon SDK / meta payload shape:
  <https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/meta.md>
- Polished fork (rich UI doc): <https://github.com/allecsc/Stremio-Kai>
- Addon guide: <https://stremio.github.io/stremio-addon-guide/sdk-guide/step3>

#### 5 patterns worth stealing

1. **Meta-details hover preview panel.** Hovering a poster anywhere in the app
   pops a side panel with rich metadata (cast thumbnails, multi-source ratings,
   network badges, studio logos, episode descriptions). This is exactly the
   `MediaDetailPanel` content, but lighter-weight and triggered on hover-dwell
   instead of click. HermesTV could repurpose `MediaDetailPanel` as a
   "lite preview" mode that opens on focus-dwell ≥ 600 ms without forcing the
   user to click in.
2. **Horizontal cast carousel with character names.** Cast thumbnails are 80px
   round headshots with the actor name on line 1 and *character name* on line 2.
   HermesTV's `ActorCard` already does the avatar — the character-name line is
   the cheap win. Stremio's meta API surfaces `character` per cast entry.
3. **Multi-rating row.** IMDb / TMDB / Trakt / MAL / AniList / Kitsu rendered
   as small monogrammed pills in a single row instead of one prominent rating.
   Lets the user trust whichever source they prefer. HermesTV currently shows
   only `imdb_rating`; the pattern is to display whatever ratings exist and
   omit silently when missing.
4. **Reorderable detail-page blocks.** Stremio-Kai exposes a "Build your own
   detail page" feature where the user can drag the Cast / Ratings / Streams /
   Similar / Comments blocks into a preferred order. We don't need drag-and-drop
   on a TV remote, but the *concept* — letting Sherri pick "Plot first, then
   Watch button" vs Dave's "Watch button at top" — is worth a Settings toggle.
5. **Configurable poster aspect ratios.** Stremio formally supports three
   aspect ratios: `1:0.675` (IMDb portrait), `1:1` (square live-TV logos),
   `1:1.77` (landscape). HermesTV currently forces 2:3 everywhere; live channels
   look pinched. Letting `posterBg` cooperate with a per-item `aspect_ratio`
   field would let the catalog grid mix portrait movies and square logos.

#### 2 anti-patterns to avoid

- **Addon-driven inconsistency.** Because addons can return arbitrary
  poster URLs and aspect ratios, Stremio's grid often shows a mix of clean
  posters and JPEG-artifacted thumbnails next to each other, ruining
  perceived quality. HermesTV's deterministic gradient fallback is the right
  guard — never let a low-quality remote thumbnail render at full size.
  Cap remote thumbs to 480px wide and scale up.
- **Detail-page scroll-jacking.** Stremio's hero hijacks scroll for parallax,
  which fights the TV remote. Never animate `background-position-y` on scroll
  on a TV — pin the backdrop and crossfade on focus change instead.

#### Verification path

- Meta payload schema (raw, copy-pasteable):
  <https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/meta.md>
- UI feature list: <https://github.com/allecsc/Stremio-Kai/blob/main/README.md>

---

### iptvnator

**Identity:** Cross-platform Electron + Angular IPTV player by `4gray`.
Strongest reference for *settings UX* in the IPTV space.

**Authoritative material:**
- Repo: <https://github.com/4gray/iptvnator>
- Hosted product page (screenshots): <https://4gray.github.io/iptvnator/>
- v0.21 release notes (recent UI refresh):
  <https://github.com/4gray/iptvnator/releases>

#### 5 patterns worth stealing

1. **Content-first dashboard with "Recently Watched" as the entry surface.**
   v0.20 reworked the landing screen so the first row is always
   "what you were last watching", not "channel #1 of 4 000". HermesTV's
   shells default to "all live channels" which is overwhelming. Surface a
   `continue_watching` row above the first content tab on every shell that
   has horizontal space (Apple TV, Netflix, Plex, Zero already have the rail).
2. **Toggleable sidebars.** v0.21 lets the user collapse the left rail to a
   ~56px icon strip and the right pane to nothing. Critical for Dave's
   power-density use case while still letting Sherri have wide labels.
   HermesTV's ZeroShell sidebar is fixed-width; a one-click compact-toggle
   would buy real estate without forking the layout.
3. **Command palette (Cmd-K / Ctrl-K) for global search + nav.** v0.21
   shipped a "smarter command palette" — type a few letters of *any* channel,
   movie, setting, or playlist and jump there. For HermesTV this is the
   missing pairing for the FloatingChatbot: voice on the remote, type-to-jump
   on the keyboard. Reuses the existing fuzzy matcher in `commandMatchers.js`.
4. **Unified import flow for M3U / Xtream / Stalker.** Instead of three
   separate "Add playlist" dialogs, iptvnator detects the URL shape and
   shows the right field set under one modal. HermesTV's Settings →
   Playlists tab currently has separate buttons; merging them into a single
   smart-paste flow would drop two clicks off the operator runbook.
5. **EPG multi-channel grid view.** A horizontal time axis with a vertical
   channel list, each cell painted with the program's runtime band. Provides
   the "what's on at 8pm across 12 channels" view that single-channel EPG
   never gives. We don't ship a live-EPG view today; when we do, this is the
   layout to follow (not the per-channel list).

#### 2 anti-patterns to avoid

- **Settings depth explosion.** iptvnator's Settings has ~30 individually
  toggleable preferences across 6 tabs. SettingsPanelTabbed already has 7 tabs;
  resist adding more. Defer per-feature toggles to a single "Advanced" tab so
  the user-facing surface stays under ~12 options.
- **Modal-inside-modal stacking.** Some flows (e.g. external player setup
  inside Settings → Player) open a modal *over* the Settings modal. Visually
  confusing on a TV. HermesTV's lazy-modal pattern should keep one modal at
  a time — push the secondary surface into a tab/panel within the same modal
  instead.

#### Verification path

- Product page screenshots: <https://4gray.github.io/iptvnator/>
- v0.21 dashboard rewrite: <https://github.com/4gray/iptvnator/releases>

---

### Extreme-InfiniTV

**Identity:** Astro + Svelte + Tauri cross-platform IPTV player. Strongest
reference for *10-foot-UI focus engineering* and *info density without
overwhelming the eye*.

**Authoritative material:**
- Repo: <https://github.com/infinitel8p/Extreme-InfiniTV>
- README: <https://github.com/infinitel8p/Extreme-InfiniTV/blob/main/readme.md>

#### 5 patterns worth stealing

1. **Spatial-navigation-polyfill across the entire app.** Every focusable
   element opts into a single global focus engine that handles D-pad / arrow
   keys with predictable lateral / vertical traversal. HermesTV currently
   relies on browser tab-order + per-shell focus management, which means some
   shells (`NetflixShell`, `PlexShell`) feel different from others under the
   remote. A unified focus engine — even just adopting `spatial-navigation-polyfill`
   behind the existing `tizenKeyMap` shim — would normalize remote behaviour.
2. **Four-tier font scale: Default / Medium / Large / X-Large.** Tied to a
   single CSS custom property on `<html>`. HermesTV already has `--font-scale`
   for Mom-Mode but only exposes two effective values (1.0 and 1.35); a
   four-stop slider in Settings → Appearance would let Sherri tune down and
   Dave tune up without re-typing into a number field.
3. **Dynamic root sizing for 4K/8K displays.** Adjusts `font-size` on `<html>`
   from 16px (1080p) → 20px (4K) → 28px (8K) so all rem-based sizing scales
   uniformly. HermesTV currently has a hard 16px root; QN85 4K users see a
   pinched UI. Reading `window.screen.width` once at boot and setting the root
   size accordingly is ~5 lines.
4. **Inline EPG on every live tile (now / next / today).** Three text rows
   under the channel logo: current program (bold), next program (muted),
   "later today" count (e.g. "+ 12 more"). HermesTV's live cards currently
   show only "Up next" — pairing the *now-playing* program with the next one
   gives the at-a-glance "is this worth tuning in?" signal Sherri keeps
   asking for.
5. **Picture-in-picture button as a card-overlay action.** A small PiP icon
   in the bottom-right corner of every live tile, focusable as an alternative
   to the main card. Lets the user keep the current channel running while
   browsing. HermesTV has `MiniPlayer` but no entry-point from the catalog —
   wiring a per-tile PiP affordance would surface the feature.

#### 2 anti-patterns to avoid

- **Virtualized list jump-on-focus.** When the user scrolls the EPG grid and
  the virtualizer recycles a row out of view, focus jumps to the nearest
  remaining element. Disorienting. HermesTV's `useGridVirtualizer` overscan
  of 1 row helps but should grow to 2 rows of overscan when a focusable
  child is in the recycled set — keep focus continuity across virtualization.
- **Reduced-motion treated as "no motion at all".** Extreme-InfiniTV's
  reduced-motion mode kills *transitions*, not just animations, so even
  the focus ring disappears instantly. HermesTV's `.motion-reduced` rule
  in `animations.css` already does the right thing (kills animations and
  transitions) — but verify focus rings still flash so keyboard/D-pad users
  know where they are.

#### Verification path

- README (UI feature list): <https://github.com/infinitel8p/Extreme-InfiniTV/blob/main/readme.md>
- Spatial nav polyfill (the dependency they use):
  <https://github.com/luke-chang/js-spatial-navigation>

---

### ynotv

**Identity:** Tauri + mpv-backed Windows IPTV player. Strongest reference for
*theme breadth* and *layout-switching as a first-class feature*.

**Authoritative material:**
- Repo: <https://github.com/tbeezy/ynotv>
- Docs site: <https://tbeezy.github.io/ynotvdoc/>

#### 5 patterns worth stealing

1. **40+ built-in themes accessible from a single picker.** HermesTV ships
   with 12 themes (6 legacy + 6 Zero-style). The pattern to steal is not "ship
   40 themes" — it's "make the theme picker a single grid of colour-swatch
   tiles, not a dropdown". Each swatch is a 64×40 rounded-rect previewing
   `--bg / --surface / --accent`. SettingsPanelTabbed's Appearance tab already
   has the swatch list — promote it from a row into a 4×N grid with hover
   preview.
2. **Four layout modes mapped to keyboard shortcuts (1/2/3/4).** Main view,
   PiP, Big+Bottom-Bar, 2×2 Grid. HermesTV has 8 shells but no keyboard-
   accelerated switcher — the user opens the LayoutSwitcher modal each time.
   Adding `Ctrl+1`..`Ctrl+8` to swap shells (or even just 1..4 for the most-used)
   would let Dave hot-switch between Netflix and Zero without two clicks.
3. **EPG with integrated preview window.** While hovering an EPG cell, a
   small video preview plays the currently-broadcasting channel in a corner.
   For HermesTV this would be a server-side thumbnail-snapshot ping rather
   than a live HLS source (Tizen can't run two videos at once cheaply); a
   poster + program-name preview achieves 80% of the value at 0% of the cost.
4. **Per-channel "rename / hide / sort" gestures.** A long-press / right-click
   on any channel tile offers Rename / Hide / Move-to-top inline. HermesTV's
   provider-driven catalog doesn't allow renames, but a per-user `hidden_ids`
   list and a `favorites` list (already in `profileStore`?) would let Sherri
   prune her 4 000-channel list to the 30 she actually watches.
5. **Subtitle / audio-track modal as a quick-pick chip strip.** Instead of a
   full settings modal, ynotv pops a 1-row chip strip at the bottom of the
   player showing the available subtitle tracks. Tap the chip, dismiss.
   HermesTV's PlayerModal currently has no subtitle UX; this is the
   minimum-viable surface to add.

#### 2 anti-patterns to avoid

- **Genre carousel removal (slowdown).** ynotv's changelog explicitly notes
  they removed the genre carousel from VOD because it was slowing the page.
  Lesson: don't ship a horizontal rail of rails if the inner rails fetch on
  scroll. HermesTV's current pattern of "render the whole catalog and let
  CSS handle the rest" is right; resist the Netflix-style nested-rail trap.
- **Skeleton states that don't match final layout.** Some ynotv screens show
  a single-line skeleton then pop into a 3-line tile, causing the user's eye
  to re-target. HermesTV's `Skeleton.jsx` already uses correct 2:3 placeholders
  for cards — keep auditing that every async surface uses the same final-shape
  skeleton.

#### Verification path

- Docs site: <https://tbeezy.github.io/ynotvdoc/>
- Repo README (themes / layouts list):
  <https://github.com/tbeezy/ynotv/blob/main/README.md>

---

## Common patterns worth stealing

Distilled across the five apps. These are the patterns *more than one* app
converged on independently — usually a signal they're load-bearing for the
domain.

1. **Continue-watching as the home row.** All 5 apps put it above everything
   else when data exists. HermesTV currently treats it as a sidebar section
   in ZeroShell only. Promote it to a top-row rail on every shell that has
   horizontal space.
2. **Card focus = transform-only lift + 1px border bloom.** Universal. No
   `box-shadow` animations. Already aligned with the HermesTV 60fps budget.
3. **Multi-source ratings as small monogrammed pills.** Stremio-Kai shows
   six, Nuvio shows two, ynotv shows IMDb-only. The pattern is to render
   what exists and silently omit the rest — never a "—" placeholder.
4. **Backdrop + vertical gradient for title legibility.** Beats a separate
   text panel under the poster. Lower DOM cost, lower paint cost.
5. **Settings panel with horizontal tab strip.** All five use it.
   HermesTV's `SettingsPanelTabbed` is already on this pattern (PR #75
   confirms). The follow-on is to keep tab count ≤ 7.
6. **Keyboard / D-pad parity.** Every app that ships on TV (Nuvio, Extreme,
   ynotv) treats keyboard shortcuts and D-pad navigation as the same code
   path. HermesTV's `tizenKeyMap` already does this; the gap is that not every
   shell uses spatial-nav consistently.
7. **Skeleton placeholders that match final shape.** Universal — and HermesTV
   already does it correctly (PR #71). Keep auditing new async surfaces
   against this rule.

## Common anti-patterns to avoid

1. **Backdrop hover-swap without debounce.** Causes flicker on remote sweep.
2. **Stacked modals.** Always confusing on TV; use tabs/panels within one
   modal instead.
3. **Reduced-motion mode that hides the focus ring.** Reduced-motion should
   pin transitions to 0ms, not remove the focus signal entirely.
4. **Scroll-jacked detail pages.** Parallax fights remote scrolling.
5. **Settings depth explosion.** Past ~12 toggles, users stop reading and
   start guessing.
6. **Mixing remote-thumbnail quality.** A clean poster next to a JPEG-blurry
   thumbnail makes the whole grid feel cheap. Cap remote thumbs and scale up.

---

## HermesTV: 10 polish moves ranked by ROI

ROI = impact-per-effort. Each move is tagged S (≤30 min), M (1–2 hr), L
(half-day). Each names the files it would touch. Each respects:

- Tizen 6.5 / Chrome 76 (no `:has()`, no `@container`, no `subgrid`, no
  optional chaining beyond what's already opted into).
- 60fps QN85 budget: transform + opacity only at runtime. `box-shadow` and
  `filter` may appear in *focus states* (one frame transition) but never in
  per-tick animations.
- Mom-Mode reduced-motion (`.motion-reduced *` already kills animations
  and transitions globally — new moves just need to opt into the existing
  classes, not reinvent the gate).
- Single-VPS deployment — no edge workers, no CDN beyond Cloudflare proxy.
- Shared design tokens (`var(--radius-*)`, `var(--gradient-*)`,
  `var(--shadow-*)`, `var(--ease-*)`) — no per-component re-declaration.

### 1. [S] Continue-watching rail above every shell's first row

**Why first:** Universal pattern across all 5 reference apps, one source
of truth (`profileStore.continue_watching` if it doesn't exist, add it),
zero new components — reuses existing `CatalogCard`.

**Touches:**
- `apps/hermes-web-tv/src/shells/AppleTVShell.jsx`
- `apps/hermes-web-tv/src/shells/NetflixShell.jsx`
- `apps/hermes-web-tv/src/shells/PlexShell.jsx`
- `apps/hermes-web-tv/src/shells/TiviMateShell.jsx`
- `apps/hermes-web-tv/src/shells/DavePowerShell.jsx`
- `apps/hermes-web-tv/src/shells/SamsungShell.jsx`
- `apps/hermes-web-tv/src/shells/MomModeShell.jsx`
- `apps/hermes-web-tv/src/shells/ZeroShell.jsx` (ZeroShell already exposes it
  in the sidebar — promote to a top row when active)
- `apps/hermes-web-tv/src/store/profileStore.js` (read `continue_watching`)

**Conflicts:** None — `Skeleton.jsx` covers the empty state. PR #69's
gradients handle the visual treatment.

### 2. [S] 2px progress bar on every Continue-Watching card

**Why high:** Nuvio + Stremio both ship this. Universal "where am I" signal.
Implementation cost is one `<div>` with `width: ${pct}%` per card. Renders
against `GRADIENTS.accent` over a `rgba(0,0,0,0.6)` track. Pure transform-free
paint — no animation budget impact.

**Touches:**
- `apps/hermes-web-tv/src/components/CatalogCard.jsx`

**Conflicts:** None. Reuses existing tokens.

### 3. [M] Multi-source rating pill row in MediaDetailPanel

**Why high:** Stremio is explicit about this; HermesTV currently shows only
one rating. The pattern is **render what exists, silently omit the rest** —
no "—" placeholders. Add an array of `{ source, value }` pills under the
title row. Each pill: 22px tall, `var(--radius-pill)`, monogrammed
("IMDb 8.4", "TMDB 87%", "Trakt 91%"), with `var(--gradient-warm)` for the
best-rated source.

**Touches:**
- `apps/hermes-web-tv/src/components/MediaDetailPanel.jsx` (add ratings row
  between the title block and the plot block, lines ~221–322)
- `apps/hermes-web-tv/src/api/mockApi.js` (extend seed catalog with
  `ratings: { imdb, tmdb, trakt }` so the row has data to render in dev)

**Conflicts:** None.

### 4. [M] Hover-dwell preview opens MediaDetailPanel in "lite mode"

**Why high:** Stremio's signature pattern. On focus-dwell ≥ 600 ms (configurable
per profile — Sherri gets 900 ms because of reduced-motion expectations), pop
the existing `MediaDetailPanel` with `previewMode={true}` — same component, no
Watch/Download buttons, no cast carousel, just the plot + ratings + quality.
The user can press Enter to "promote" the preview to a full open. **600 ms is
above the motor-to-visual threshold so it doesn't fire on simple sweeps.**

**Touches:**
- `apps/hermes-web-tv/src/components/CatalogCard.jsx` (add
  `onFocus`-with-dwell-timer logic; cancel on blur)
- `apps/hermes-web-tv/src/components/MediaDetailPanel.jsx` (accept and
  honour a `previewMode` prop — guard the heavy children)
- `apps/hermes-web-tv/src/App.jsx` (route the preview event into the same
  state slot as click-open, with a `preview: true` flag)

**Conflicts:** None directly — the lazy chunk already exists (PR #74).
**Caveat:** Mom Mode profile must short-circuit this to off (set the dwell to
Infinity) so Sherri never gets surprise panels on every focus.

### 5. [M] Compact-sidebar toggle in ZeroShell (icon-strip ↔ full rail)

**Why mid-high:** iptvnator pattern. ZeroShell's left rail is the densest UI
surface and Dave wants more catalog room. One button at the top of the rail
that swaps a CSS class (`zero-rail--compact`) and shrinks the rail from
its current width to 56px. Labels hide; icons stay; tooltips appear on
hover. Persisted in `profileStore` as `zero_rail_compact` so each user keeps
their pref.

**Touches:**
- `apps/hermes-web-tv/src/shells/ZeroShell.jsx`
- `apps/hermes-web-tv/src/store/profileStore.js`
- `apps/hermes-web-tv/src/index.css` (one new rule, no new theme entries)

**Conflicts:** None. PR #74 was a perf pass — this is layout polish.

### 6. [L] Global command palette (Cmd-K / Ctrl-K) — fuzzy search over
       channels + movies + series + settings + shells

**Why mid:** iptvnator + Stremio both ship it; it's the keyboard-native pair
to the FloatingChatbot. Reuses `commandMatchers.js` fuzzy matcher. New surface
is a centered modal (1 hour) with a single input + ranked result list (2 hours).
Each result has a type icon (📺 channel / 🎬 movie / 📺 series / ⚙ setting /
🪟 shell) and Enter navigates.

**Touches:**
- `apps/hermes-web-tv/src/components/CommandPalette.jsx` *(new file)*
- `apps/hermes-web-tv/src/App.jsx` (mount + Ctrl-K listener)
- `apps/hermes-web-tv/src/utils/commandMatchers.js` (reuse existing fuzzy)
- `apps/hermes-web-tv/src/store/profileStore.js` (read recent_searches for
  the empty state)

**Conflicts:** Avoid the Ctrl-K shortcut if it conflicts with Tizen TV
hotkeys — check `tizenKeyMap.js`. If it does, fall back to a Settings →
Hotkeys binding (the tab already exists per SettingsPanelTabbed).

### 7. [S] Four-stop font-scale slider in Settings → Appearance

**Why mid:** Extreme-InfiniTV pattern. HermesTV has `--font-scale` but
exposes only Mom Mode's 1.35 and the default 1.0. A four-stop slider
(0.9 / 1.0 / 1.2 / 1.4) in Appearance tab covers Dave's "denser, please"
and Sherri's "even bigger, please". Persisted per profile.

**Touches:**
- `apps/hermes-web-tv/src/components/SettingsPanelTabbed.jsx` (Appearance
  tab — add slider next to the theme swatches)
- `apps/hermes-web-tv/src/store/profileStore.js` (already has `font_scale`;
  ensure write-back wired)

**Conflicts:** Mom Mode enforcement in `App.jsx` (lines ~78-82) requires
font_scale ≥ 1.25 — clamp the slider's minimum to 1.25 when mom_mode is true.
Don't break that invariant.

### 8. [S] Dynamic root font-size from screen width (1080p / 4K / 8K)

**Why mid:** Extreme-InfiniTV pattern. HermesTV's CSS is rem-based but the
root is hardcoded to 16px. On a QN85 running at 4K, the UI looks small.
~5 lines in `main.jsx`:

```js
var w = (window.screen && window.screen.width) || 1920;
document.documentElement.style.fontSize =
  w >= 7680 ? '28px' : w >= 3840 ? '20px' : '16px';
```

**Touches:**
- `apps/hermes-web-tv/src/main.jsx`

**Conflicts:** Combines multiplicatively with `--font-scale` — verify Mom Mode
at 4K + scale 1.35 doesn't blow past viewport bounds. Test on `CatalogGrid`.

### 9. [M] Now-playing inline EPG on every live `CatalogCard`

**Why mid:** Extreme-InfiniTV pattern. CatalogCard already shows "Up next" —
add a bold "Now: <program>" row directly above it, plus a progress bar
showing how far into the current program the user would tune in. The
existing `epg` object already supports it; mock data needs a `now_program`
and `now_progress_pct` field.

**Touches:**
- `apps/hermes-web-tv/src/components/CatalogCard.jsx` (add `epg.now_program`
  row above the existing `epg.next_program` row, lines ~216-229)
- `apps/hermes-web-tv/src/api/mockApi.js` (extend live channel seed data
  with the two new fields)

**Conflicts:** None — only affects live tiles (the existing `epg.next_program`
guard naturally restricts to live).

### 10. [L] Per-user `hidden_ids` + `favorite_ids` filter applied in `applyShellFilters`

**Why later:** ynotv pattern. Reduces Sherri's effective catalog from 4 000+
channels to her ~30 picks. Requires (a) a per-card "Hide / Favorite" affordance
behind a long-press / context-menu, (b) `profileStore` writes, (c) wiring into
`applyShellFilters` so every shell respects the filter.

**Touches:**
- `apps/hermes-web-tv/src/shells/shellHelpers.js` (extend `applyShellFilters`
  signature to accept `hidden_ids` and `favorites_only`)
- `apps/hermes-web-tv/src/components/CatalogCard.jsx` (add per-card overflow
  menu; reuse existing focus handlers)
- `apps/hermes-web-tv/src/store/profileStore.js`
- All 8 shells (one-line pass-through)

**Conflicts:** Shell-helper signature change is a 1-line update per shell;
schedule the rollout in one PR to avoid mid-flight inconsistency.

---

## Out of scope / already done

Recommendations the reference apps *suggest* but HermesTV already ships, so
this audit deliberately does not propose them again:

- **Shared design tokens (radii / shadows / gradients / easings / durations).**
  Shipped PR #69 (`src/design/tokens.js`, `src/design/animations.css`).
- **Shared keyframes (`hermes-fade-in`, `hermes-scale-in`, `hermes-slide-up`,
  `hermes-shimmer`) + reduced-motion gate.** Shipped PR #69
  (`src/design/animations.css` with `.motion-reduced *` rule).
- **Shimmer skeletons matching final shape.** Shipped PR #71
  (`src/components/Skeleton.jsx`: SkeletonBlock / SkeletonCard / SkeletonRow /
  SkeletonText).
- **Lazy modal loading.** Shipped PR #74 (App.jsx uses `React.lazy` for 7
  modals, ~35% main-bundle size reduction).
- **ZeroShell virtualized grid.** Shipped PR #74 (`useGridVirtualizer` hook
  in `src/shells/shellHelpers.js`).
- **Debounced search.** Shipped PR #74 (`src/utils/debounce.js`, applied to
  ZeroShell search).
- **`shellHelpers.posterBg` single source of truth for poster backgrounds.**
  Shipped PR #72.
- **Rounded modal radii (16–22 px), gradient header bands, glass backdrops,
  pill primary CTAs.** Shipped PR #75 across every modal.
- **VoicePickerModal Azure TTS playback.** Shipped PR #65.

References that are technically interesting but **inapplicable** to HermesTV
under the constraint set:

- **Stremio's drag-and-drop detail-page block reorder.** Drag interactions
  don't translate to a TV remote. The lighter variant — a Settings toggle
  for plot-first vs button-first — is captured as a future enhancement,
  not a recommended polish move.
- **ynotv's live HLS preview inside an EPG cell.** Tizen 6.5 cannot run two
  HLS pipelines simultaneously on QN85 without dropping the parent video to
  software decode. Use snapshot thumbnails when the live-EPG view ships.
- **Extreme-InfiniTV's full `spatial-navigation-polyfill` adoption.** Adding
  the polyfill is M effort, but normalizing every shell's focus-management
  pattern to use it is L+ and touches every interactive component. Worth
  doing eventually; not a polish move, an architecture move.
- **Backdrop-blur in catalog grid.** Tizen 6.5 supports `backdrop-filter`
  with the `-webkit-` prefix but at a high paint cost on QN85 when applied
  to a scrolling element. Already paired correctly in modals (PR #75) where
  the surface is static; do not extend to the grid itself.

---

## Appendix — research method + confidence notes

- **Tooling:** WebSearch + WebFetch only. No `gh api` against the reference
  repos beyond inspecting public READMEs through the standard HTML view.
- **Confidence — high:** iptvnator, Extreme-InfiniTV, ynotv (READMEs are
  feature-rich and explicit about UI surfaces).
- **Confidence — medium:** Stremio (patterns inferred from a mix of the addon
  SDK meta payload schema and the `Stremio-Kai` fork's README, since the
  flagship `stremio-web` repo's README is install-focused).
- **Confidence — lower:** Nuvio (READMEs are install-focused; patterns
  inferred from screenshots and from the React-Native ancestor's structure).
  Where Nuvio is the only source for a pattern, the pattern is also
  cross-validated against the other four apps before becoming a HermesTV
  recommendation. No Nuvio-only pattern made the top 10 list.
- **Gaps:** The audit did not run any of the reference apps locally — only
  surface analysis. Pixel-level values quoted in the per-app sections are
  paraphrased intents, not measured.
- **Search round budget:** ≤ 3 search rounds per app; all five apps yielded
  authoritative material within budget. No skips.
