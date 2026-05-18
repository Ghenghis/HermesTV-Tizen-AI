# Lane 04 — Web App UX Gaps

**Date:** 2026-05-17
**Branch:** feature/b2-usable-local-mock
**Scope:** apps/hermes-web-tv/src/

---

## Summary

The web app has solid core UX patterns: a real loading state, an offline banner, an error state, empty grid messaging, and keyboard accessibility. Several gaps exist in profile switching, theme picker integration, and the chatbot's command feedback loop.

---

## Loading State

| Check | Result | Notes |
|---|---|---|
| Loading spinner while API fetches | PASS | App.jsx shows animated spinner ring with "Loading your profile..." text during boot |
| Spinner accessible | PARTIAL | No aria-live or role="status" on the loading div. Screen readers won't announce loading state. |
| Loading resolves on error | PASS | bootWithProfileId falls back to mockApi if hermesApi fails |

---

## Error State

| Check | Result | Notes |
|---|---|---|
| Error state when hermestv.local unreachable | PASS | App shows offline banner AND falls back to mockApi automatically. If both fail, shows fatal error UI with "Switch Profile" button. |
| Offline banner | PASS | Yellow banner: "Offline mode — showing cached content. Backend at hermestv.local is unreachable." Has role="status" aria-live="polite". |
| Fatal error dismissal | PASS | "Switch Profile" button clears profile and returns to ProfilePicker |

---

## Catalog Grid — Empty Results

| Check | Result | Notes |
|---|---|---|
| Empty state when no content matches filter | PASS | CatalogGrid.jsx returns "No content available for this filter." centered message |
| Empty state accessibility | PASS | Visible text in muted color, readable. No role needed for non-interactive text. |

---

## Accessibility

| Check | Result | Notes |
|---|---|---|
| Alt text on images | PARTIAL | CatalogCard uses logo_url in img tags — alt text needs audit |
| ActorCard photo alt | PASS | ActorCard uses actor name as alt text |
| Keyboard navigation — all buttons | PASS | All buttons have tabIndex={0}, onFocus/onBlur for outline rings |
| Focus ring visible | PASS | All interactive elements show 2px accent outline on focus |
| Dialog elements | PASS | MediaDetailPanel and QROnboarding have role="dialog" aria-modal="true" |
| ESC key closes dialogs | PASS | Both MediaDetailPanel and QROnboarding handle Escape key |
| Contrast | PARTIAL | Theme tokens exist for multiple themes but no automated contrast audit has been run against WCAG AA 4.5:1 for text |
| ARIA for offline status | PASS | role="status" aria-live="polite" on offline banner |
| Loading state aria | GAP | Loading div has no role="status" — screen readers won't announce loading |

---

## Keyboard Navigation for Non-TV Browsers

| Check | Result | Notes |
|---|---|---|
| Tab navigation through catalog | PARTIAL | CatalogCard renders as div, not button. Tab focus relies on tabIndex={0} but the focus outline relies on CSS :focus selector rather than the app's onFocus/onBlur handlers. On TV this is handled by focusEngine.js. In browser, :focus should show outline. |
| Enter key to select catalog item | GAP | CatalogCard has onClick but no onKeyDown handler for Enter/Space. Keyboard users on browsers (not Tizen) cannot select catalog items. |
| Filter dropdowns keyboard | PASS | Native select elements are fully keyboard accessible. |
| Settings panel keyboard | PASS | autoFocus on close button, all buttons tabbable. |
| QR onboarding keyboard | PASS | autoFocus on Close button. |
| Chatbot keyboard | PASS | Input field, Send button, Expand/Minimize all keyboard accessible. |

---

## Profile Picker

| Check | Result | Notes |
|---|---|---|
| Profile picker renders | PASS | ProfilePicker.jsx shows on first load if no profile in localStorage |
| Can switch profiles | PARTIAL | There is no "switch profile" button in the main UI header — only in the fatal error screen. The settings panel shows profile info but no profile switch button. A user cannot switch from Dave to Mom without resetting to error state. |
| Profile picker after boot | GAP | Once a profile is selected and saved, there is no surface in the normal UX flow to switch profiles without clearing the error state. The Settings gear panel should include a "Switch Profile" button. |

---

## Theme — Does mom-calm Actually Look Calmer?

| Check | Result |
|---|---|
| mom-calm theme defined | PASS — warm dark brown background (#1A1410), amber accent (#E07B39), warm cream text (#F5EDE6) |
| night-blue is cooler | PASS — dark navy (#0d1117), blue accent (#1f6feb) |
| mom-calm font scale | PASS — --font-scale: 1.35 applied via ThemeProvider |
| mom-calm visually distinct | PASS — warmer tones, lower saturation than night-blue. Calmer appearance confirmed by token inspection. |
| reduced_motion applied | PASS — App.jsx adds 'motion-reduced' class to body when profile.reduced_motion=true |

---

## Priority Gap List

| Gap | Priority | Description |
|---|---|---|
| CatalogCard missing onKeyDown Enter/Space | P1 | Keyboard users can't select content |
| No profile switch button in normal UX | P1 | Must show "Switch Profile" in Settings panel |
| Loading state missing role="status" | P2 | Accessibility improvement |
| Contrast audit not run | P2 | WCAG AA not verified for all theme combinations |
| CatalogCard img alt text audit | P2 | Logo images may have null alt |
| alt="" on decorative elements | P3 | Some placeholder elements could use aria-hidden |
