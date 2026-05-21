# DaveTV Web E2E Proof

Playwright writes publishable proof screenshots here. These are real
authenticated browser captures, not design mockups.

Run:

```bash
cd tests/playwright
npm run proof
```

## Gallery

| Surface | Screenshot |
| --- | --- |
| Authenticated DaveTV shell | ![Authenticated DaveTV shell](00-authenticated-davetv-entry.png) |
| Home interface | ![Home interface](home-main-interface.png) |
| Settings - General | ![Settings General](settings-general.png) |
| Settings - Playlists | ![Settings Playlists](settings-playlists.png) |
| Settings - Providers | ![Settings Providers](settings-providers.png) |
| Settings - Voice | ![Settings Voice](settings-voice.png) |
| Azure voice picker | ![Azure voice picker](voice-picker-audition-list.png) |
| View picker thumbnails | ![View picker thumbnails](layout-picker-views.png) |

For local auth-required testing, start the API with a local-only Dave admin and
set:

```bash
DAVETV_E2E_ALLOW_ACCOUNT_SETUP=true
DAVETV_E2E_ADMIN_EMAIL=<local admin email>
DAVETV_E2E_ADMIN_PASSWORD=<local admin password>
DAVETV_E2E_EMAIL=playwright-dave@example.test
DAVETV_E2E_PASSWORD=<local test password>
```

Do not commit `tests/playwright/.auth/`; it contains the browser session cookie.
