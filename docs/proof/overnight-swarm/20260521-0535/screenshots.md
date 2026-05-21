# Screenshots — 2026-05-21 05:35 UTC (Wave 2 deep continuation)

## Frames produced by this walk

The Playwright provider-reload UI spec (`swarm-20260521-provider-reload-ui.spec.ts`)
generated five PNGs into `./screenshots/` as the spec ran. All five are
**boundary/login-surface frames**, not authed catalog frames — see
"What these frames actually show" below for why.

```
docs/proof/overnight-swarm/20260521-0535/screenshots/
  reload-01-after-boot.png        — cold boot, no provider, no cookie → login surface
  provui-01-after-boot.png        — sidecar API booted, page.route() proxy live, before any reload
  provui-02-after-reload-1.png    — first reload via sidecar proxy
  provui-03-after-reload-2.png    — second reload via sidecar proxy
  provui-04-final.png             — final state after all interactions
```

File size: all five frames are **595,229 bytes** identically. This is the
boundary surface — the React tree never advanced past `AuthGate` because
of BUG-SWARM-009 (see `bug-ledger.md`). The frames are kept honest:
they prove the surface that *did* render, not a surface that didn't.

## What these frames actually show

`AuthGate` did not trust the proxied `/api/auth/me` response even though
the HTTP layer returned `hasUser: true` with a valid cookie. The React
state stayed on `auth.configured: false`, which renders the login surface.
That's why every frame is identical and why the size matches the cold-boot
boundary frame.

The deep authed UI proof at the *protocol* layer is in
`swarm-20260521-sidecar-api.spec.ts` (6/0 PASS, no browser context).
The deep authed UI proof at the *browser* layer is BLOCKED on
BUG-SWARM-009, which is owned by Lane A.

## Frames carried over from 0423 (still the authoritative boundary proof)

```
docs/proof/overnight-swarm/20260521-0423/
  login-initial.png           — login surface on cold load (canonical)
  login-after-tab.png         — Tab traversal lands on email
  login-after-tab2.png        — second Tab lands on password
  login-after-tab3.png        — third Tab lands on submit
  login-after-tab4.png        — fourth Tab wraps to email
  login-after-enter.png       — Enter submit triggers 401 (no fake pass)
  login-after-escape.png      — Escape recovers focus
  login-after-pagedown.png    — PageDown scroll is no-op on this surface
```

These remain the canonical UI-keyboard proof. The 0535 frames don't
replace them; they document the next-level honesty (proxied auth surface
that the React tree won't trust yet).

## Per the Codex postmortem rule

> "Browser screenshots after a redirect to a login surface are not deep
>  proof. They prove the boundary, not the authed surface. Prefer
>  API-protocol proof when cookies can't cross the origin boundary."

This walk followed that rule:
- **Protocol-layer deep authed proof:** `swarm-20260521-sidecar-api.spec.ts`
  6/0 PASS — auth boundary, session lifecycle, empty-state honesty.
- **Browser-layer authed proof:** BLOCKED by BUG-SWARM-009. Frames in this
  folder honestly document the boundary that *did* render, not a fake
  catalog surface.

## What a Wave 3 walk should add (UI proof gap)

- Authed catalog screenshot with a real provider seeded (blocked by
  BUG-SWARM-003 — credentials owner=Dave).
- Authed playback frame with HEAD 200 stream URL (blocked by same).
- DVR/Downloads/Catch-up empty-state vs feature-flag screenshots
  (Wave 3 — HANDOFF #2 still open; tracked as task 49).

EXIT=0 (nothing failed; honest gap notes, not regressions).
