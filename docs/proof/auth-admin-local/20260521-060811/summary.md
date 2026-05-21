# Auth Admin Local Proof — 2026-05-21 06:08

Scope: local no-login development mode at `http://127.0.0.1:5174`.

Result: PASS

- DaveTV loaded with the real iptv-org catalog visible.
- Settings opened from the header gear.
- The Settings > General > Profile actions surface exposed `Manage family access`.
- Clicking `Manage family access` routed to `/?admin=1`.
- Because local auth is disabled for development, the admin route rendered an honest blocked state instead of pretending account management is available.
- Screenshot: `screenshots/01-local-admin-disabled.png`.

Secrets exposed: NO
