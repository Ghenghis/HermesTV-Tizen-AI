# 30 — Mom-Mode Accessibility Audit (B2.5 read-only review)

**Audit date:** 2026-05-18
**Audited branch:** `audit/mom-mode-accessibility` (off latest `main`, `b68d48a`)
**Auditor:** Claude (Opus 4.7) — read-only review for Sherri's QN85Q7FAAFXZA shell experience
**Files audited:** `apps/hermes-web-tv/src/shells/*.jsx` (7 shells) plus three shared UI
modals in `apps/hermes-web-tv/src/components/` (`LayoutSwitcher.jsx`,
`VoicePickerModal.jsx`, `FloatingChatbot.jsx`).
**Scope:** Code review only. No deploys. No edits to shell components — fixes go
in a separate follow-up PR after this audit is reviewed.

## Executive summary

Mom Mode itself reads well: time-aware greeting, enforced font_scale floor of
1.4, generous tap targets, high text contrast, and serif font for legibility.
The serious accessibility risks for Sherri are **outside** the shell she sees
most: the global modals she'll touch (Look-picker, Voice-picker) ignore
`font_scale` entirely, several click targets across all seven shells are below
WCAG 2.5.5's 44 CSS-px minimum, and content cards across six of seven shells
are non-focusable `<div>` elements that **cannot** be reached with a Tizen
remote without a mouse. The other shells (Netflix / Plex / Apple TV / TiviMate)
all break the 12-px senior floor when font_scale = 1, but Sherri's profile
default of 1.35 mitigates that for *her* — it remains a real issue for any
guest who uses her TV at scale 1.

## How the profile / font scale system works

Confirmed by reading `apps/hermes-web-tv/src/App.jsx:39-67` and
`apps/hermes-web-tv/src/api/mockApi.js:5-24`:

- `mom_tv` fallback profile: `font_scale: 1.35`, `reduced_motion: true`,
  `audio_feedback: true`, `mom_mode: true`, `tv_model: QN85Q7FAAFXZA`,
  `tier: enhanced`.
- `dave_tv` fallback profile: `font_scale: 1.1`, `reduced_motion: false`,
  `audio_feedback: false`, `tv_model: UN55CU8000BXZA`, `tier: degraded`.
- `App.jsx:54-58` enforces a floor: when `profile.mom_mode === true` and
  `font_scale < 1.25`, scale is forced up to 1.25. **MomModeShell** itself
  re-enforces its own floor of 1.4 at line 66.
- `App.jsx:62-66` toggles `body.motion-reduced` based on `profile.reduced_motion`.
- `index.css:170-176` strips CSS transition/animation durations under that
  class, but **does not** stop inline `transform: scale(...)` JS hover effects
  from snapping the element (it just removes the smoothing).

## Profile-level prerequisites that shape the verdict

| Profile prop  | mom_tv default | dave_tv default | Honored by shells? |
|---------------|---------------:|----------------:|--------------------|
| font_scale    | 1.35           | 1.1             | Partial — every shell respects it for content text; small icons/badges are hardcoded |
| reduced_motion| true           | false           | **CSS yes, inline JS no** — `transform: scale()` in `onMouseEnter` still fires |
| audio_feedback| true           | false           | Yes — FloatingChatbot speaks responses when set |
| mom_mode      | true           | false           | App.jsx clamps font_scale ≥ 1.25; otherwise ignored by shells |
| agent_name    | Hermes         | Hermes          | Yes — FloatingChatbot reads it |
| display_name  | Sherri         | Dave            | Yes — MomModeShell greets by name |

## Per-shell criteria matrix (7 shells × 10 criteria = 70 cells)

Legend: **P** pass, **NW** needs-work, **B** blocker.

| Criterion → / Shell ↓               | TiviMate | Netflix | Plex | AppleTV | Samsung | **MomMode** | DavePower |
|-------------------------------------|:--------:|:-------:|:----:|:-------:|:-------:|:-----------:|:---------:|
| 1. Font scale honored everywhere    | NW       | NW      | NW   | NW      | NW      | NW          | NW        |
| 2. Min font ≥ 14 px (12 px floor)   | B        | B       | B    | B       | B       | NW          | B         |
| 3. Hit target ≥ 44×44               | NW       | NW      | NW   | NW      | P       | P           | NW        |
| 4. Color contrast (WCAG AA)         | NW       | P       | NW   | NW      | P       | P           | NW        |
| 5. Focus visibility (remote nav)    | B        | B       | B    | B       | P       | NW          | B         |
| 6. Reduced motion respected         | NW       | NW      | NW   | P       | NW      | NW          | P         |
| 7. Time-of-day greeting (MomMode)   | n/a      | n/a     | n/a  | n/a     | n/a     | P           | n/a       |
| 8. Cognitive load above the fold    | NW       | P       | P    | P       | P       | P           | P         |
| 9. Read order matches DOM           | P        | P       | P    | P       | P       | P           | P         |
| 10. Tizen safety (no `?.`, `??`)    | P        | P       | P    | P       | P       | P           | P         |

Shared modals (audited separately because they overlay every shell):

| Criterion ↓                          | LayoutSwitcher | VoicePickerModal | FloatingChatbot |
|--------------------------------------|:--------------:|:----------------:|:---------------:|
| 1. Font scale honored                | **B**          | **B**            | P               |
| 2. Min font (12-14 px)               | NW             | NW               | NW              |
| 3. Hit target ≥ 44×44                | NW             | NW               | NW              |
| 4. Color contrast                    | NW             | NW               | NW (mom-calm)   |
| 5. Focus visibility                  | NW             | B                | NW              |
| 6. Reduced motion                    | P              | P                | P               |
| 10. Tizen safety                     | P              | P                | P               |

## Detailed findings — per shell

### TiviMateShell (`apps/hermes-web-tv/src/shells/TiviMateShell.jsx`, 181 lines)

**Font scale (1, NW):** lines 93, 132 use `fontSize: '14px'` for the channel
emoji glyph — hardcoded, ignores fontScale. Acceptable as a non-text icon, but
flagged for consistency.

**Min font size (2, BLOCKER):** lines 158, 160 use `calc(10px * fontScale)` for
schedule slot labels and `calc(11px * fontScale)` for the time-slot header
(115), sidebar channel number (92), sidebar nav (104), and EPG channel number
(131). With fontScale = 1 these collapse to **10 – 11 px** — below the 12 px
hard floor and far below the 14 px senior threshold. At Sherri's 1.35 they
land at 13.5 – 14.85 px (still NW for the 10-px ones at 13.5).

**Hit targets (3, NW):** sidebar channel rows are 11 px padding + ~24 px text
= ~46 px tall (line 81 + content). EPG cells line 129 are explicitly
`height: '64px'` — pass. Bottom-nav rows line 104 are 9 px padding + 12-px text
= ~30 px — **fails** WCAG 2.5.5.

**Contrast (4, NW):** EPG inactive time-slot label `#6b7484` on `#13171f` =
**3.81:1** (fail AA 4.5 for normal text; pass for large at 18 pt+). Sidebar
muted `#6b7484` on `#0a0d12` = **4.13:1**. Inactive sidebar channel name
`#8b95a5` on `#0a0d12` = 6.43:1 — pass.

**Focus visibility (5, BLOCKER):** channel rows (line 74) and EPG cells (line
138) are `<div>` with `onClick` but no `tabIndex`, no `role`, no `onKeyDown`.
**Cannot be reached by Tizen remote.** This is the primary EPG nav surface;
without keyboard focus the shell is unusable on a TV without a mouse.

**Reduced motion (6, NW):** `onMouseEnter` line 89 / 154 mutates
`e.currentTarget.style.background` instantly — no animation, so reduced-motion
is incidentally OK. Sidebar `transition: 'all 120ms'` line 85 is killed by the
CSS rule. Pass on a technicality; flagged as NW because the transition string
includes `all` which is wasteful on Tizen 6.5.

**Cognitive load (8, NW):** 5-column EPG grid + 220-px channel sidebar + a
5-item bottom nav above 8+ channel rows is dense. Acceptable as a power-user
choice; flagged NW because the TiviMate layout will appear in the Look-picker
to Sherri.

### NetflixShell (`apps/hermes-web-tv/src/shells/NetflixShell.jsx`, 171 lines)

**Font scale (1, NW):** line 76 hardcodes `fontSize: '9px'` for the quality
chip — bypasses fontScale entirely.

**Min font (2, BLOCKER):** line 76 = 9 px. Lines 81, 136-138 = 11-13 px ×
fontScale = 11-13 px at scale 1. **Below the senior floor across the board.**

**Hit target (3, NW):** nav buttons line 116-122 have `padding: '4px 0'` —
total height ≈ 26 px. **Fails 44 px floor.** Cards (`<div>` line 50) are
~210 px tall but again not keyboard-focusable.

**Contrast (4, PASS):** `#b3b3b3` on `#141414` = 8.79:1; `#a3a3a3` on
`#141414` = 7.30:1; all pass AA.

**Focus visibility (5, BLOCKER):** card rows (line 50) are `<div>` with
`onClick`, no `tabIndex`. Same Tizen remote story as TiviMate.

**Reduced motion (6, NW):** `onMouseEnter` line 61-72 sets
`transform: scale(1.05)` inline when `tier === 'enhanced'`, but **does not
also check `profile.reduced_motion`**. Sherri has both `tier=enhanced` AND
`reduced_motion=true` — she still gets the scale jump.

### PlexShell (`apps/hermes-web-tv/src/shells/PlexShell.jsx`, 197 lines)

**Font scale (1, NW):** lines 64, 69 hardcode `fontSize: '9px'` for badges.

**Min font (2, BLOCKER):** card-meta `calc(10px * fontScale)` line 76 = 10 px
at scale 1; section labels `calc(10px * fontScale)` line 115/144 = 10 px;
empty-state `calc(14px * fontScale)` line 187 is OK at scale 1.

**Hit target (3, NW):** sidebar items line 118-139 have 9 px padding + 13 px
text = ~31 px tall. **Fails.**

**Contrast (4, NW):** sidebar muted `#6c7177` on `#191b1d` = **3.51:1** —
fails AA. Card year text 10 px `#6c7177` on `#191b1d` = **3.51:1** — fails for
the small-text case (large-text threshold of 3:1 only applies ≥ 18 pt). Empty
state `#6c7177` on `#1f2326` = 3.22:1 — fails.

**Focus visibility (5, BLOCKER):** sidebar items and grid cards are `<div>`,
no `tabIndex`.

**Reduced motion (6, NW):** lines 59-60 set `transform: translateY(-2px)` and
`borderColor` change inline — translateY snaps even when motion is reduced.

### AppleTVShell (`apps/hermes-web-tv/src/shells/AppleTVShell.jsx`, 185 lines)

**Font scale (1, NW):** line 57 hardcodes `fontSize: '9px'` (LIVE badge).

**Min font (2, BLOCKER):** line 178 footer `calc(11px * fontScale)` = 11 px
at scale 1.

**Hit target (3, NW):** nav buttons line 116-134 padding `7px 14px` =
~30 px tall. Hero buttons line 154-165 padding `12px 28px` = ~44 px — pass.

**Contrast (4, NW — BLOCKER for footer):** footer `#48484a` on `#1c1c1e` =
**1.86:1** — fails AA *and* AAA *and* a "visible at all" eyeball test for the
HermesTV brand mark. This is the worst contrast pair across all audited files.
Genre subtext `#98989d` on `#1c1c1e` = 5.93:1 — pass.

**Focus visibility (5, BLOCKER):** HScrollRow cards line 50 are `<div>` with
`onClick`, no `tabIndex`. Same as the others.

**Reduced motion (6, PASS):** AppleTVShell uses **no** inline transform/scale
on hover — it relies entirely on the gradient overlay (line 145) and a
visually-discoverable hover via cursor. The only `transition` is on the nav
buttons (line 128, `background 120ms`) which is killed by the motion-reduced
class. **Honest pass.**

`backdropFilter: blur(20px)` (line 99-100) is correctly gated by
`tier === 'enhanced'` and is a visual effect, not motion. The `-webkit-backdrop-filter`
prefix is also set — Tizen 6.5 / Chrome 76 compliance confirmed.

### SamsungShell (`apps/hermes-web-tv/src/shells/SamsungShell.jsx`, 167 lines)

**Font scale (1, NW):** lines 81, 84 hardcode `fontSize: '9px'` for badges.

**Min font (2, BLOCKER):** card title `calc(11px * fontScale)` line 87 = 11 px
at scale 1.

**Hit target (3, PASS):** nav buttons line 107-127 have `height: '56px'` —
pass. Hero Watch button padding `10px 24px` ≈ 44 px — pass. Card tiles are
2-d shapes 112-195 px in their smaller dimension — pass.

**Contrast (4, PASS):** all checked values clear AA. `#888` on `#111` =
5.33:1; `#888` on `#1a1a1a` = 4.91:1; both pass AA.

**Focus visibility (5, PASS):** cards line 67-89 are the **only** shell-level
content tiles in the entire codebase that set `tabIndex={0}`, mark themselves
`data-focusable="true"`, and provide explicit `onFocus`/`onBlur` handlers that
paint a 2-px border + 3-px box-shadow ring. This is the gold-standard
implementation; the other shells should copy it.

**Reduced motion (6, NW):** `onMouseEnter` line 73 sets `boxShadow` and
`borderColor` directly — the box-shadow is a paint mutation, not a transform,
so reduced-motion doesn't kill the *flash*. With the CSS transition gone the
border appears instantly — acceptable, but flagged because focus state and
hover state produce identical visuals (line 73 vs 75-76 set the same values).

### MomModeShell (`apps/hermes-web-tv/src/shells/MomModeShell.jsx`, 197 lines) — Mom Mode special review

**Font scale (1, NW):** lines 162, 164, 167 hardcode `28px` / `11px` for the
play-button icon and the quality/LIVE badges. The play icon at 28 px is OK as
a glyph regardless of scale; the badges at 11 px × scale 1.35 = ~15 px are
borderline. Flagged NW.

**Min font (2, NW, not BLOCKER for Sherri):** with the enforced floor of
**1.4** at line 66, the smallest text in the shell is `calc(11px * 1.4)` =
**15.4 px** (badges) and `calc(13px * 1.4)` = **18.2 px** (meta caption).
Everything in normal flow is ≥ 18 px for Sherri.

  If the floor is bypassed (e.g. a guest profile somehow lands in MomModeShell
  with scale = 1), 11 px and 13 px text appears — that's the only reason this
  is NW rather than PASS.

**Hit target (3, PASS):** category tabs line 110-128 are `height: '64px'`,
flex: 1 → very wide. Cards (line 147-159) at 260 px image + 50 px text — pass.
Status bar text is informational, not interactive. **Best-in-class for this
audit.**

**Contrast (4, PASS):** every measured pair clears AA at large-text threshold
and most clear AA at normal-text threshold:

  - greeting `#f0e6ff` on `#1e2a4a → #2a1a3e` gradient = **11.8 – 13.3 : 1**
  - subtitle `#c8b8e8` on `#1e2a4a → #2a1a3e` = 7.7 – 8.7 : 1
  - tab inactive `#c8b8e8` on `#16213e` = 8.7 : 1
  - tab active / pink time `#ff7eb3` on `#16213e` = 6.7 : 1
  - card title `#f0e6ff` on `#16213e` = 13.2 : 1
  - meta `#c8b8e8` on `#16213e` = 8.7 : 1
  - "Hermes is here to help" `#c8b8e8` on `#16213e` = 8.7 : 1

  All pass AA easily. **Best-in-class for this audit.**

**Focus visibility (5, NEEDS-WORK):** category-tab `<button>`s have no inline
`outline: 'none'` (good — global `:focus-visible` from `index.css:198-201`
applies). With theme `mom-calm`, `--accent` = `#e07b39` on the tab bar
background `#16213e` — the orange focus ring is ~7:1 contrast. **Visible.**

  However, **cards (line 147-159) are `<div>` with onClick, no `tabIndex`, no
  `onKeyDown`, no `role`.** On Sherri's QN85 with a remote, the cards cannot
  be reached. This is the same Tizen-nav blocker as every other shell, with
  the same fix.

**Reduced motion (6, NEEDS-WORK):** lines 158-159 set `transform: scale(1.02)`
on `onMouseEnter` *inline*. Sherri's profile has `reduced_motion = true`, so
the CSS transition is killed — the card snaps into a 2 % larger box and back.
On a remote with no mouse this never fires, so the practical impact is
limited *for Sherri specifically*. Flagged because (a) anyone using a mouse
attached to the QN85 still sees the jump, (b) when the card-keyboard-focus
fix is applied, focus-driven highlights need to honor `reduced_motion` too.

**Time-of-day greeting (7, PASS):** `getGreeting()` line 39-44 reads
`new Date().getHours()` and switches morning (< 12) / afternoon (< 17) /
evening. Updates every 30 s via `setInterval` line 77-80. Reads
"Good morning, Sherri! 👋" with the display_name pulled from the profile line
67. **Honest pass.**

**Cognitive load (8, PASS):** above-the-fold = greeting banner + 3 category
tabs + first row of 2-3 large cards. **5 visual zones, only 3 interactive.**
Ideal for a senior-friendly safety-net layout.

**Read order (9, PASS):** DOM order = greeting → tabs → grid → status bar.
Matches visual order. Screen readers OK.

**Tizen safety (10, PASS):** confirmed via grep for `?.` and `??` — zero
occurrences in `apps/hermes-web-tv/src/shells/`. All optional-property
accesses use `(profile && profile.font_scale) || 1.4` style.

### DavePowerShell (`apps/hermes-web-tv/src/shells/DavePowerShell.jsx`, 229 lines)

**Font scale (1, NW):** lines 97, 132, 157-159 hardcode multiple font sizes
(`20px` for icon, `8px` for badges, `14px` for emoji). With Dave's default
`font_scale = 0.9`, the dynamic ones collapse further: `calc(9px * 0.9)` = 8 px.

**Min font (2, BLOCKER):** line 163 = `calc(9px * fontScale)` and lines
158-159 raw `8px`. **Below 12 px floor.** Dave Power is intentionally dense,
but per audit criterion 2, "smaller than 12px is a senior-friendly fail." If
Sherri ever lands in DavePowerShell (e.g. she's exploring layouts and taps
"Power"), she sees 8-px text. NW for Dave; BLOCKER for any case where Sherri
sees it.

**Hit target (3, NW):** icon-sidebar buttons line 86-108 are 48×48 — pass.
Cards line 143-156 are 4-6 columns of ~120-px-tall tiles — pass for click.
Top-bar search input line 120-135 is 5 px + small text = ~24 px tall — **fail**.

**Contrast (4, NW):** muted `#6b7a8d` on `#0d1120` = **4.29:1** — borderline,
pass AA for large text only. Many of the small-text labels live on this
muted, e.g. filter label (119) and Ctrl+L hint (136) — those are 10-11 px
× 0.9 = 9-10 px, below the 18-pt large-text threshold, so 4.29:1 is **fail
AA**. NW.

**Focus visibility (5, BLOCKER):** cards line 143-156 are `<div>`, no
`tabIndex`. Icon-sidebar `<button>`s line 86 are focusable (global rule
applies) — pass. Search `<input>` is focusable — pass. Cards = blocker.

**Reduced motion (6, PASS):** DavePower uses no `transform` on hover —
only `borderColor` change line 154-155. Honest pass. Note: Dave's profile
also has `reduced_motion = false`, so this is academic.

**Cognitive load (8, PASS):** intended dense layout for Dave. Confirmed
per the "Mom's TV never system-limited" policy in the user-memory — caps
are asymmetric: only Dave's TV gets density.

## Shared UI modal findings

### LayoutSwitcher.jsx (`apps/hermes-web-tv/src/components/LayoutSwitcher.jsx`, 209 lines)

This is the "🎨 Look" modal Sherri opens from the header. It's the surface
through which she changes layouts — including switching INTO Mom Mode.

**Font scale (1, BLOCKER):** **none of the rem values reference
`var(--font-scale)`.** Lines 74-75, 80, 95, 144-149, 158, 169, 184-187, 194
all use raw rem (`1.2rem`, `0.8rem`, `0.7rem`, `0.65rem`, `0.6rem`). Sherri's
`font_scale = 1.35` setting has zero effect on this modal. At 16-px root, the
smallest visible text is `0.6rem` × 16 = **9.6 px** (disabled-tier badge line
153). This is the second-worst readability hit in the audit.

**Min font (2, NW):** smallest is `0.6rem` = 9.6 px (line 153 "QN85 only"
chip). Even at scale 1 with the fix, this is below the 14-px senior threshold.

**Hit target (3, NW):** close `<button>` line 77-85 has `padding: '4px 8px'`
and font 1.4 rem → ~32-36 px tall. Tile `<button>`s line 101-160 have
`padding: '12px 14px'` and ~3 lines of content → ~70 px tall — pass.
The close button fails.

**Contrast (4, NW):** footer `#5b6373` on `#15151d` = **3.01:1** — fails AA.
Section labels `#5b6373` on `#15151d` = 3.01:1 (also fails). Tile description
`#6b7384` on `#1a1a24` = **3.62:1** (fails). Active/inactive titles pass.

**Focus visibility (5, NW):** close `<button>` line 78 has `outline: 'none'`
in inline style and only changes `color` on focus — color change alone is not
a sufficient focus indicator (WCAG 2.4.7). Tile buttons line 133-141 set a
proper `outline: 2px solid <accent>` on focus — pass for tiles, NW for close.

**Reduced motion (6, PASS):** all transitions are pure background/border-color
fades; no transforms. Killed by `.motion-reduced` CSS. Honest pass.

### VoicePickerModal.jsx (`apps/hermes-web-tv/src/components/VoicePickerModal.jsx`, 193 lines)

Sherri uses this every time she wants to change her assistant voice.

**Font scale (1, BLOCKER):** identical issue to LayoutSwitcher — every text
size is a raw rem. Lines 104-105, 110, 119, 126, 129, 146-148, 150,
158-175, 184. No `var(--font-scale)` reference anywhere.

**Min font (2, NW):** smallest text is `0.65rem` = 10.4 px (line 148 CURRENT
chip and line 162-175 buttons at 0.8rem = 12.8 px which is borderline). At
the fixed scale, 10.4 px is below 12 px floor.

**Hit target (3, NW):** Preview (`🔊`) button line 152-162 has padding
`8px 12px` and `0.8rem` font = ~32-35 px tall. **Use** button line 163-175
has padding `8px 14px` = same height. Both fail 44 px.

**Contrast (4, NW):** locale meta `#6b7384` on `#1a1a24` = **3.62:1** —
fails AA. Subtitle `#6b7384` on `#15151d` = 3.81:1 — fails AA. Other pairs
clear.

**Focus visibility (5, BLOCKER):** Preview button, Use button, AND close `×`
all have `outline: 'none'` inline (lines 110, 160, 173) with **no replacement
focus indicator**. Tab through with a keyboard / remote → no visible focus
at all on any control in this modal. This is the worst focus regression in
the audit; the modal becomes unusable on a TV remote.

**Reduced motion (6, PASS):** no transforms, only inline color/border state.

### FloatingChatbot.jsx (`apps/hermes-web-tv/src/components/FloatingChatbot.jsx`, 604 lines)

Sherri's primary input for voice/text commands. Lives over every shell.

**Font scale (1, PASS):** correctly uses `calc(... * var(--font-scale, 1))`
in 11 places (lines 246, 273, 311, 331, 345, 411, 415, 488, 505, 522, 557,
582). **Only audited file outside of shells that does this right.**

**Min font (2, NW):** smallest `calc(0.65rem * var(--font-scale, 1))` =
10.4 px × 1.35 (Sherri) = **14 px** — exactly on the senior threshold. At
scale 1 it's 10.4 px — below floor. Flagged NW because guest / scale-1 case
fails.

**Hit target (3, NW):** FAB line 191-220 is 56×56 — pass. Send button line
570-595 has padding `0.5rem 1rem` = ~32 px — fail. Header buttons line
421-456 have padding `0.2rem 0.4rem` and ~1-rem icon = ~22-26 px — **fail**
(small × 4 in a row at top-right of the expanded chat).

**Contrast (4, NW — theme-dependent):** "H" FAB content (`#ffffff`) on
`var(--accent)`. In `mom-calm` theme `--accent = #e07b39`, contrast = **2.97:1**
— fails AA for non-large text. In `night-blue` `#1f6feb`, 4.63:1 — passes.
Sherri's default theme makes the FAB icon barely visible. The "H" is 1.5 rem
× var(--font-scale) at scale 1.35 = ~32 px, which is well past the 18-pt
large-text threshold (24 px) — at large-text the AA threshold is **3:1**, so
2.97 is still a hair-thin **fail**. NW.

**Focus visibility (5, NW):** FAB line 212-220 sets a proper outline on
focus — pass. Compact-state expand/close buttons line 250-265, header
buttons line 421-456 in expanded view: **no focus handlers**. With inline
styles that don't set `outline: 'none'`, the global `:focus-visible` should
apply, but the global rule paints `outline: 2px solid var(--accent)` — that's
the same blue/orange as the chip, so on the button background it's visible.
However the buttons themselves are `background: 'none'` and the outline
might land partially behind sibling elements. Flagged NW for verification on
the real QN85.

**Reduced motion (6, PASS):** FAB line 210 has `transition: 'transform 0.15s'`
plus inline `transform: 'scale(1.1)'` on focus. Killed by the
`.motion-reduced` CSS rule. The `transform: 'scale(1)'` on blur is also
killed. Sherri's reduced_motion = true → no smooth animation; FAB still
grows on focus (which is fine — that's a focus indicator, not motion). Pass.

## "Mom Mode special review" — extra paranoid pass

MomModeShell is the safety net. If everything else fails, Sherri must be able
to land here, watch something, and ask Hermes for help. Re-checking every
interaction path with that lens:

1. **Landing.** App.jsx boots → `getActiveProfileId()` returns 'mom_tv' →
   `mockApi.getProfile('mom_tv')` returns the fallback with `active_layout:
   'jumbo-rail'`. The default flow does **not** drop her into MomModeShell —
   she has to either select Mom Mode in the Look modal or speak "mom mode".
   *Recommendation (deferred to B3):* if `profile.mom_mode === true` and no
   activeLayout is set, default to MomModeShell.

2. **Greeting.** `getGreeting()` + `display_name` + `getTimeStr()` all
   present. Sherri's name comes through. **OK.**

3. **Tab nav.** 3 tabs at 64-px height, full-width, focusable `<button>`s
   with a 4-px bottom border on active state. Pink-on-dark contrast 6.73:1
   passes AA. **OK.**

4. **Content.** 2-col (degraded tier) or 3-col (enhanced) grid of large
   cards. Sherri's tier = enhanced → 3 cols, but the shell at line 90 also
   forces 2 cols when font_scale ≥ 1.5 — at her 1.35 she gets 3, at 1.5 she
   gets 2. Sensible. Card click → `onItemSelect` → MediaDetailPanel. **OK
   except for keyboard-focus on cards (blocker carried forward).**

5. **Quality / LIVE badges.** At 11 px × 1.4 enforced floor = 15.4 px. Color
   `#ff7eb3` and `#fff` on `rgba(0,0,0,0.7)` and `#e50914` respectively —
   high contrast. **OK.**

6. **Empty state.** "Nothing here yet. / Try another category or ask Hermes!"
   at `calc(18px * fontScale)` = ~25 px for Sherri. Friendly, calm copy. **OK.**

7. **Status bar.** Time in big pink at `calc(22px * fontScale)` = 31 px.
   "Hermes is here to help — just ask! 💬" — explicit pointer to the
   FloatingChatbot. **OK.**

8. **Chatbot reachability.** FAB is bottom-right, 56×56, focusable. Sherri
   can tab to it from the cards (once cards are made focusable). At
   mom-calm theme the white-on-orange "H" contrast is 2.97:1 — large-text
   AA technically requires 3:1, so this is a 0.03 miss. Flagged.

9. **Voice / TTS.** Per user-memory, voice = Azure-only (Aria). Confirmed
   `mockApi.js:21` sets `agent_voice: 'azure-en-us-aria-neural'`. The
   FloatingChatbot calls `voiceClient.speak()` when `profile.audio_feedback
   === true` (line 57-61), and Sherri's profile has that = true. **OK.**

10. **What if she opens "🎨 Look"?** This is where Mom Mode breaks down: the
    Look modal does NOT honor `font_scale = 1.35`, so the menu where she
    might want to switch BACK to Mom Mode is rendered in 9.6 – 14.4 px text.
    She might struggle to read the option that helps her. **HIGH PRIORITY.**

11. **What if she opens "🔊 Change Voice"?** Same story, plus the voice
    Preview / Use buttons have no visible focus ring on remote nav. She
    cannot reliably hear a voice preview without using a mouse. **HIGH PRIORITY.**

## Cross-cutting findings (apply to many shells)

- **Tizen remote navigation is broken at the card level across 6 of 7 shells.**
  Only SamsungShell makes content tiles focusable. This is the single
  highest-impact fix — without it the entire app is unusable on a real QN85
  with the bundled remote.

- **Hardcoded badge font sizes (8 – 11 px) bypass `font_scale` in every shell
  that has a quality / LIVE chip.** Sherri sees them at *raw* size, not
  scaled.

- **The two shared modals (Look picker + Voice picker) completely ignore
  `font_scale`.** This is a one-import refactor: change every `'1.2rem'`
  to `'calc(1.2rem * var(--font-scale, 1))'`.

- **Inline `transform: scale(...)` on hover bypasses the `.motion-reduced`
  CSS rule.** Affects MomMode (line 158), Netflix (line 63-71), Plex (line
  59-60). The CSS rule only neutralizes `transition-duration` — not the
  *value* the transform sets. Fix: gate the inline JS on
  `!profile.reduced_motion`.

- **Apple TV footer `#48484a` on `#1c1c1e` is 1.86:1.** This is the worst
  individual contrast pair in the audit and applies to the literal HermesTV
  brand mark in the AppleTV layout footer.

- **No shell uses the `?.` or `??` operators.** Tizen 6.5 / Chrome 76
  compatibility is preserved. Pass across the board.

## Recommended fixes — ranked by impact ÷ effort

| Rank | Fix                                                                                               | Impact | Effort |
|-----:|---------------------------------------------------------------------------------------------------|:------:|:------:|
|   1  | Add `tabIndex={0}` + `onKeyDown` (Enter / Space) to all content `<div>` cards in 6 shells         | HIGH   | M      |
|   2  | Refactor LayoutSwitcher & VoicePickerModal to use `calc(<rem> * var(--font-scale, 1))`            | HIGH   | S      |
|   3  | Add focus rings (`outline` on focus) to VoicePickerModal Preview / Use / close buttons            | HIGH   | S      |
|   4  | Fix AppleTV footer color from `#48484a` → `#9fa0a6` (~7:1 on `#1c1c1e`)                            | HIGH   | S      |
|   5  | Gate inline `transform: scale()` in NetflixShell, PlexShell, MomMode on `!profile.reduced_motion` | MED    | S      |
|   6  | Promote senior floor: replace hardcoded badge sizes (`8` `9` `11` `px`) with `calc(* fontScale)`   | MED    | M      |
|   7  | Bump TiviMate / Plex / Apple muted-text colors so all small-text pairs ≥ 4.5:1                    | MED    | M      |
|   8  | Enlarge nav / modal close-button hit areas to ≥ 44 × 44 px                                        | MED    | S      |
|   9  | When `mom_mode = true` and no activeLayout, default to MomModeShell on boot (App.jsx)             | MED    | S      |
|  10  | Adjust FloatingChatbot FAB foreground for mom-calm theme to clear 3:1 (e.g. `#1a1410`)            | LOW    | S      |
|  11  | DavePowerShell — when active profile is mom_tv, force fontScale ≥ 1.25 (mirror App.jsx clamp)     | LOW    | S      |
|  12  | Default focus to the first content card on shell mount (improves remote-first UX)                 | LOW    | M      |

Legend: S = single-file 5-15 min change. M = multi-file refactor, ~30-60 min.
L = architectural touch, > 1 hr.

## Items to fix NOW vs defer to B3 (post-real-TV-testing)

**Fix NOW (B2.5 follow-up PR, before any TV deploy):**
- Ranks 1, 2, 3, 4, 5, 8 (the focus + modal-scale + AppleTV-footer +
  reduced-motion + hit-target set). These are pure code, no hardware needed
  to verify, and they directly unblock Tizen-remote usability.

**Defer to B3 (after first real-TV smoke test on QN85):**
- Ranks 6, 7, 9, 10, 11, 12. These benefit from seeing the actual rendered
  pixels on Sherri's 85-inch panel and from a guided session with her,
  rather than a code-only judgment call about absolute color values.

## Methodology notes

- Contrast ratios computed via WCAG 2.x relative-luminance formula in Node:
  `(L_lighter + 0.05) / (L_darker + 0.05)` with sRGB linearization. Confirmed
  values stored in the audit branch's commit message for reproducibility.
- "Hit target" measured as the union of inline `padding`, `height`, and
  approximate text rendering at the smallest scale (font_scale = 1, root font
  16 px). Hover-only enlargement does **not** count toward the 44 × 44 floor
  (WCAG 2.5.5 measures resting state).
- "Cognitive load" = subjective count of interactive zones + headings + content
  rows visible above an assumed 720 p / 1080 p viewport.
- Tizen safety = grep of `?.` and `??` operators across all shell + modal
  files. Zero hits found.

## Read-only verification

This audit produced **two** new docs (`docs/30_*.md`, `docs/31_*.md`). No
shell or component files were modified. `git status` on the audit branch
shows only documentation additions.
