# DaveTV Engineering Constitution

This constitution is binding for human and AI contributors.

## 1. Truth Over Appearance

DaveTV must not present fake functionality as real. Empty states, clear errors,
and blocked statuses are acceptable. Fake success is not.
Template fields are allowed only inside templates; resolved specs, docs, and
production code must not keep unfinished placeholders.

## 2. Real Providers Or Honest Empty State

Provider features are complete only when they work through the registry/store
and pass provider truth proof. If no real provider is configured, the app must
say so honestly.

## 3. Private Family Access

DaveTV is invite-only. Protected APIs require a DaveTV session in production.
OAuth providers are visible only when real server-side credentials exist.

## 4. Secrets Stay Server-Side

Credentials, provider URLs, stream tokens, cookies, API keys, and passwords
must never reach client responses, logs, screenshots, committed files, or proof
artifacts.

## 5. TV-First UX

Playback is instant by default. Remote navigation must be smooth, focusable,
scrollable, and usable without mouse-like precision. Extra options belong in
settings, not blocking watch popups.

## 6. Voice Is Natural And DaveTV-Branded

The user-facing assistant is DaveTV. Family users should be able to speak
natural language through the remote voice path. Hard-coded exact command tables
are allowed only as fast paths; they are not the product experience.

## 7. Contracts Before Code

For non-trivial work, define API/data/UI contracts before implementation. Use
OpenAPI, schemas, test fixtures, or Markdown contracts as appropriate.

## 8. Proof Is Required

Every completed task needs evidence. The proof must match the claim: unit tests
for helpers, integration tests for routes, browser screenshots for UI, live
provider proof for provider readiness, and VPS checks for deployment.

## 9. Minimal, Reversible Changes

Keep edits scoped. Avoid unrelated refactors. Preserve existing user work. Do
not deploy without rollback and env preflight.

## 10. License-Safe Reference Use

Reference IPTV apps may inform behavior, UX, and test contracts. Dave accepts
upstream license obligations for private DaveTV work, but agents must follow the
actual license in each source tree. Source adoption requires a manifest entry,
license attribution, and proof. If a license forbids modification or no license
is present, use Pattern Only or Sandbox App mode instead of pasting source.

## 11. Release Definition

Release-ready means:

- Auth gate configured and bots blocked.
- Real QR pairing works.
- At least one real provider passes truth proof.
- Catalog, provider filters, and playback work end to end.
- No credential leaks.
- TV remote navigation is proven on target devices or explicitly blocked.
