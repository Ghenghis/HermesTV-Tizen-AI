# 37 — Mom-Mode Punch List (actionable fixes)

**Source audit:** `docs/36_MOM_MODE_ACCESSIBILITY_AUDIT.md`
**Status:** read-only diagnostic. **No code changes in this PR** — the fixes
listed below will land in a separate follow-up PR after review.
**Sort:** rows sorted by impact ÷ effort (highest first).

## Legend

- **Impact:** HIGH = blocks Sherri (or any senior) from completing a task /
  reaching a control. MED = degrades comfort but task can complete. LOW =
  polish.
- **Effort:** S = single change in one file, ~10 min. M = touches multiple
  files or requires small refactor, ~30-60 min. L = architectural.
- **Phase:** B2.5 = fix in the follow-up PR. B3 = defer until after first
  real-TV smoke test on QN85.

## Top 5 — immediate action (B2.5 follow-up PR)

1. **Make content cards keyboard-focusable in all 6 affected shells.** Add
   `tabIndex={0}`, `role="button"`, `onKeyDown` for Enter / Space.
2. **Refactor LayoutSwitcher and VoicePickerModal to honor `--font-scale`**.
3. **Add visible focus rings to VoicePickerModal buttons.**
4. **Fix AppleTV footer color** from `#48484a` to a passing-AA value.
5. **Gate inline `transform: scale()` on `!profile.reduced_motion`** in the
   three shells that animate cards on hover.

## Punch list — full table

| # | File / Line | What's wrong | Recommended change | Impact | Effort | Phase |
|--:|-------------|--------------|---------------------|:------:|:------:|:-----:|
| 1 | `apps/hermes-web-tv/src/shells/MomModeShell.jsx:147-159` (card `<div>`) | Card has `onClick` but no `tabIndex`, no `role`, no `onKeyDown` → unreachable with Tizen remote. | Add `tabIndex={0}`, `role="button"`, `onKeyDown={function(e){ if(e.key==='Enter'||e.key===' '){e.preventDefault(); onItemSelect && onItemSelect(item); }}}`, and copy SamsungShell's `onFocus`/`onBlur` border + box-shadow pattern (`SamsungShell.jsx:75-77`). | HIGH | M | B2.5 |
| 2 | `apps/hermes-web-tv/src/shells/TiviMateShell.jsx:74-95, 138-156` (channel rows + EPG cells) | Same `<div>` + `onClick` issue × dozens of EPG cells. | Same fix as #1. Promote channel rows to `<button>` since they're list items; keep EPG cells as `<div role="button" tabIndex={0}>`. | HIGH | M | B2.5 |
| 3 | `apps/hermes-web-tv/src/shells/NetflixShell.jsx:50-72` (CardRow card) | `<div>` + onClick, no focus. | Same fix as #1. | HIGH | M | B2.5 |
| 4 | `apps/hermes-web-tv/src/shells/PlexShell.jsx:55-80, 117-140` (grid cards + sidebar items) | `<div>` + onClick, no focus, in two places. | Same fix as #1; sidebar items should be `<button>`. | HIGH | M | B2.5 |
| 5 | `apps/hermes-web-tv/src/shells/AppleTVShell.jsx:50-63` (HScrollRow card) | `<div>` + onClick, no focus. | Same fix as #1. | HIGH | M | B2.5 |
| 6 | `apps/hermes-web-tv/src/shells/DavePowerShell.jsx:142-156` (catalog tile) | `<div>` + onClick, no focus. | Same fix as #1. (DavePower also benefits because Dave uses a keyboard.) | HIGH | M | B2.5 |
| 7 | `apps/hermes-web-tv/src/components/LayoutSwitcher.jsx:74, 75, 80, 95, 144, 148, 153, 158, 169, 184, 187, 194` (12 hardcoded rem values) | Modal ignores `font_scale`. Sherri at 1.35 sees the same 9.6 – 19.2 px text as a scale-1 user. | Wrap every `'1.2rem'` style in `'calc(1.2rem * var(--font-scale, 1))'`. 12 mechanical replacements. | HIGH | S | B2.5 |
| 8 | `apps/hermes-web-tv/src/components/VoicePickerModal.jsx:104, 105, 110, 126, 129, 146, 147, 148, 150, 158, 162, 171, 184` (13 hardcoded rem values) | Same as #7. | Same fix as #7. 13 replacements. | HIGH | S | B2.5 |
| 9 | `apps/hermes-web-tv/src/components/VoicePickerModal.jsx:110, 160, 173` (close, Preview, Use buttons) | All set `outline: 'none'` inline with no `onFocus` replacement. Tabbing through the modal shows no focus indicator at all. | Add `onFocus={function(e){ e.currentTarget.style.outline = '2px solid var(--accent, #ff7eb3)'; e.currentTarget.style.outlineOffset='2px'; }}` and matching `onBlur` to each of the three buttons. | HIGH | S | B2.5 |
| 10 | `apps/hermes-web-tv/src/shells/AppleTVShell.jsx:178` (footer text) | `color: '#48484a'` on `#1c1c1e` = 1.86:1. Fails AA, AAA, eyeball. | Change to `#9fa0a6` (~7:1) — keeps the muted-grey feel but readable. If brand-tone is critical, `#737376` is 4.6:1 (just-pass AA). | HIGH | S | B2.5 |
| 11 | `apps/hermes-web-tv/src/shells/MomModeShell.jsx:158-159` (card hover scale) | Inline `transform: scale(1.02)` on `onMouseEnter` runs even when `profile.reduced_motion === true` (Sherri's default). CSS rule kills the *transition* but not the *value*. | Wrap the assignment: `onMouseEnter={function(e){ e.currentTarget.style.borderColor='#ff7eb3'; if (!profile.reduced_motion) e.currentTarget.style.transform='scale(1.02)'; }}` and matching `onMouseLeave`. | MED | S | B2.5 |
| 12 | `apps/hermes-web-tv/src/shells/NetflixShell.jsx:61-72` (CardRow hover) | Same — `transform: scale(1.05)` is gated only on `tier === 'enhanced'`, not on `reduced_motion`. | Gate on `tier === 'enhanced' && !profile.reduced_motion`. Pass `profile` down to `CardRow` as a prop (currently only `tier` and `fontScale` are passed). | MED | S | B2.5 |
| 13 | `apps/hermes-web-tv/src/shells/PlexShell.jsx:59-60` (GridSection hover) | Same — inline `transform: translateY(-2px)`. | Same fix as #12 — accept `profile` prop, gate the translateY. | MED | S | B2.5 |
| 14 | `apps/hermes-web-tv/src/components/LayoutSwitcher.jsx:80, 84` (close `&times;` button) | 1.4-rem font + 4-8 px padding ≈ 32 × 24 px hit target. Below 44 × 44. Also no outline-on-focus, only color change. | Bump padding to `'10px 14px'`, set `minWidth: '44px'`, `minHeight: '44px'`, and add `onFocus` that paints `outline: 2px solid var(--accent)`. | MED | S | B2.5 |
| 15 | `apps/hermes-web-tv/src/components/VoicePickerModal.jsx:152-175` (Preview / Use buttons) | Padding `8px 12-14px` + 0.8-rem text ≈ 32 × 80 px. Height fails 44. | Bump padding to `'12px 16px'` and `minHeight: '44px'`. | MED | S | B2.5 |
| 16 | `apps/hermes-web-tv/src/shells/MomModeShell.jsx:164, 167` (quality / LIVE badges) | `calc(11px * fontScale)` — at scale 1, 11 px. With Sherri's enforced 1.4 → 15.4 px (OK). Below floor only if a guest profile somehow lands here at scale 1. | Lift base from 11 → 13: `calc(13px * fontScale)`. At Sherri's 1.4 = 18.2 px, comfortable. Guest at scale 1 = 13 px, on floor. | MED | S | B2.5 |
| 17 | `apps/hermes-web-tv/src/shells/TiviMateShell.jsx:115, 131, 160` (EPG time-slot header + small meta) | `calc(10px * fontScale)` and `calc(11px * fontScale)` — collapse to 10 / 11 px at scale 1. Below 12-px floor. | Lift bases: 10 → 13, 11 → 13. Will require re-tuning row heights from 64 to ~80 px (line 129). | MED | M | B2.5 |
| 18 | `apps/hermes-web-tv/src/shells/PlexShell.jsx:64, 69, 76, 115, 144` (quality / LIVE badges + sidebar headings + card year) | Hardcoded `9px` (lines 64, 69) and `calc(10px * fontScale)` (lines 76, 115, 144). | Replace `9px` with `calc(11px * fontScale)`. Lift 10 → 12 bases. | MED | M | B2.5 |
| 19 | `apps/hermes-web-tv/src/shells/AppleTVShell.jsx:57, 178` (LIVE badge + footer) | `fontSize: '9px'` hardcoded. | Replace with `calc(11px * fontScale)`. (Footer color is also #10 above.) | MED | S | B2.5 |
| 20 | `apps/hermes-web-tv/src/shells/SamsungShell.jsx:81, 84` (LIVE / quality badges) | `fontSize: '9px'` hardcoded. | Replace with `calc(11px * fontScale)`. | MED | S | B2.5 |
| 21 | `apps/hermes-web-tv/src/shells/DavePowerShell.jsx:158-159` (LIVE / quality micro-badges) | `fontSize: '8px'` hardcoded. | Replace with `calc(10px * fontScale)`. Acceptable for Dave; ensures Sherri (if she lands here) at scale 1.35 sees 13.5 px. | MED | S | B2.5 |
| 22 | `apps/hermes-web-tv/src/shells/TiviMateShell.jsx:104` (bottom-nav rows) | 9-px padding + 12-px text = ~30 px tall. Below 44. | Bump padding to `'12px 18px'`; row will be ~46 px. | MED | S | B2.5 |
| 23 | `apps/hermes-web-tv/src/shells/NetflixShell.jsx:118` (nav tab `<button>`) | 4-px vertical padding → ~26 px hit area. | Bump to `'12px 0'` and ensure tab content vertical centering. | MED | S | B2.5 |
| 24 | `apps/hermes-web-tv/src/shells/AppleTVShell.jsx:126` (nav tab `<button>`) | `padding: '7px 14px'` → ~30 px. | Bump to `'12px 18px'`. | MED | S | B2.5 |
| 25 | `apps/hermes-web-tv/src/shells/PlexShell.jsx:125` (sidebar item) | `padding: '9px 22px'` → ~31 px. | Bump to `'14px 22px'`. | MED | S | B2.5 |
| 26 | `apps/hermes-web-tv/src/shells/DavePowerShell.jsx:120-135` (search input) | 5-px padding + 12-px font = ~24 px tall. | Bump padding to `'10px 12px'` and font base to `calc(13px * fontScale)`. | MED | S | B2.5 |
| 27 | `apps/hermes-web-tv/src/components/FloatingChatbot.jsx:421-456` (expanded-view header buttons) | `padding: '0.2rem 0.4rem'` × ~1-rem font = ~22 × 26 px. 4 of these in a row. | Bump padding to `'0.6rem 0.7rem'` so each is ≥ 44 × 44. | MED | S | B2.5 |
| 28 | `apps/hermes-web-tv/src/components/FloatingChatbot.jsx:570-595` (Send button) | 0.5-rem padding × 0.875-rem text = ~32 px tall. | Bump padding to `'0.75rem 1.25rem'` → ~44 px. | MED | S | B2.5 |
| 29 | `apps/hermes-web-tv/src/shells/TiviMateShell.jsx:115, 131` (`#6b7484` time-slot label & sidebar number) | `#6b7484` on `#13171f` = 3.81:1; on `#0a0d12` = 4.13:1. Fails AA. | Bump muted to `#8c95a5` (~5.5:1 on both bgs). | MED | S | B3 |
| 30 | `apps/hermes-web-tv/src/shells/PlexShell.jsx:115, 144, 76, 187` (`#6c7177`) | 3.22 – 3.51:1 across surfaces. Fails AA. | Bump to `#8b8f95` (~5:1). | MED | S | B3 |
| 31 | `apps/hermes-web-tv/src/shells/DavePowerShell.jsx:97, 119, 136, 158, 163, 172, 185, 190, 206, 210, 218, 220` (muted `#6b7a8d`) | `#6b7a8d` on `#0d1120` = 4.29:1 — passes AA at large only; the labels are 9-11 px so they need AA-normal. | Bump muted to `#8a98ab` (~5.5:1). | MED | S | B3 |
| 32 | `apps/hermes-web-tv/src/components/LayoutSwitcher.jsx:74, 95, 158, 169, 187, 194` (`#5b6373`, `#6b7384`) | 3.01:1 / 3.62:1. Fails AA. | Bump to `#8a8f9b` (~5:1). | MED | S | B3 |
| 33 | `apps/hermes-web-tv/src/components/VoicePickerModal.jsx:105, 110, 147, 162, 175, 184` (`#6b7384`) | 3.62 – 3.81:1. Fails AA. | Same as #32. | MED | S | B3 |
| 34 | `apps/hermes-web-tv/src/components/FloatingChatbot.jsx:198-220` (FAB on `var(--accent)`) | "H" white on `#e07b39` (mom-calm theme) = 2.97:1. Just-fails large-text AA (3:1). | Either: darken the accent for mom-calm (`#c06a30`, 3.5:1), or force FAB foreground to `#1a1410` (theme `--bg`) instead of `#fff` — gives 7+:1 on the orange. Recommended: foreground swap. | LOW | S | B3 |
| 35 | `apps/hermes-web-tv/src/App.jsx:843` (default-layout fallback) | When `profile.mom_mode === true` and no `activeLayout`, falls through to the default grid instead of Mom Mode. | Add: `var resolvedLayout = state.activeLayout || (profile.mom_mode ? 'mom-mode' : '');` and use that in the shell renderer check. | MED | S | B3 |
| 36 | `apps/hermes-web-tv/src/shells/DavePowerShell.jsx:51` (font scale default) | Default fontScale = 0.9. If Sherri ever lands here her enforced 1.25 floor applies (App.jsx clamp), but the shell-local default of 0.9 also means a passed `profile.font_scale = undefined` gives her 0.9. | Change line 51 to: `var fontScale = (profile && profile.font_scale) || 1.0;`. Mom-mode clamp in App.jsx still wins for her. | LOW | S | B3 |
| 37 | All 7 shells, mount effect | No `tabIndex` or `autoFocus` on first interactive element; remote-first users start on a non-existent focus position. | Add a `useEffect` that calls `document.querySelector('[data-focusable], [tabindex="0"]')?.focus()` on mount. **Note:** `?.` not allowed (Tizen), use `if (el) el.focus()`. | LOW | M | B3 |
| 38 | `apps/hermes-web-tv/src/components/LayoutSwitcher.jsx:38-86` (modal a11y) | Modal has no `role="dialog"`, no `aria-modal`, no `aria-labelledby`. Screen-reader users get no context. | Add `role="dialog" aria-modal="true" aria-labelledby="look-modal-title"` and tag the heading with `id="look-modal-title"`. | LOW | S | B3 |
| 39 | `apps/hermes-web-tv/src/components/VoicePickerModal.jsx:85-188` (modal a11y) | Same — no dialog role / labelling. | Same fix as #38 with `id="voice-modal-title"`. | LOW | S | B3 |
| 40 | `apps/hermes-web-tv/src/shells/MomModeShell.jsx:96-103` (greeting banner) | Greeting is in a `<div>`, not a heading. Screen readers skip it during landmark nav. | Wrap the "Good morning, Sherri!" text in `<h1>` and "What would you like to watch today?" in `<h2>`. Keep inline styles. | LOW | S | B3 |

## Summary

- **40 distinct fixes identified** across 7 shells + 3 modals.
- **28 are B2.5 priority** (immediate follow-up PR, no real-TV needed).
- **12 are B3 priority** (defer until after the real-TV smoke test on QN85).
- **Estimated total effort:** ~6-8 hours engineering time for B2.5 set; ~3-4
  hours for B3 polish.
- **No fix in this list requires changing any provider config, secret, .env
  file, VPS service, or deployment artifact.** All changes are local to
  `apps/hermes-web-tv/src/shells/*.jsx` and
  `apps/hermes-web-tv/src/components/{LayoutSwitcher,VoicePickerModal,FloatingChatbot}.jsx`,
  plus optionally `apps/hermes-web-tv/src/App.jsx` for #35.

## Reading this list against the user-memory contract

- **Mom's TV is never system-limited.** Confirmed: `mom_tv` profile defaults to
  `tier: enhanced`, `font_scale: 1.35`, and App.jsx clamps font_scale up to
  ≥ 1.25 when `mom_mode = true`. The clamp does NOT cap her — it floors her.
  The audit preserves that asymmetric contract.
- **QN85 QLED is the primary target.** Confirmed: SamsungShell's focusable
  cards are the gold-standard pattern; all fixes promote that pattern across
  the other 6 shells.
- **Azure-only TTS, no Bixby AI.** Confirmed via
  `apps/hermes-web-tv/src/api/azureVoiceClient.js` references in
  FloatingChatbot and VoicePickerModal. No audit finding pushes any other
  voice path.
- **User profiles support nickname override.** Confirmed: MomModeShell line
  67 reads `profile.display_name` and the greeting reads as the user typed
  it. No audit finding overrides the user's name preference.
