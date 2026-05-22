# DaveTV Web E2E Proof

Playwright writes publishable proof screenshots here. These are real browser
captures against the DaveTV UI, not design mockups or mocked layouts.

Run:

```bash
cd tests/playwright
npm run proof
```

## Website Picks

Use these first on the GitHub website/project page. They are current
Playwright captures from the Samsung QN85 mock viewport and cover the surfaces
Dave keeps checking: main app, View picker, settings, voice, side panels, and
playback.

| Surface | Screenshot |
| --- | --- |
| Main DaveTV interface | ![Main DaveTV interface](samsung-qn85-mock-01-home-main-interface.png) |
| Search overlay | ![Search overlay](samsung-qn85-mock-02-search-modal.png) |
| TV guide | ![TV guide](samsung-qn85-mock-03-tv-guide.png) |
| Settings - Providers | ![Settings Providers](samsung-qn85-mock-07-settings-providers.png) |
| Settings - Voice | ![Settings Voice](samsung-qn85-mock-07-settings-voice.png) |
| Choose Your View | ![Choose Your View](samsung-qn85-mock-08-layout-picker-viewport-gallery.png) |
| Zero style side panel | ![Zero style side panel](samsung-qn85-mock-10-zero-sidebar-live.png) |
| TiviMate style bottom nav | ![TiviMate bottom navigation](samsung-qn85-mock-11-tivimate-bottom-nav.png) |
| Classic three-pane rail | ![Classic three-pane rail](samsung-qn85-mock-12-iptvnator-rail-overlays.png) |
| Mom Mode tabs | ![Mom Mode tabs](samsung-qn85-mock-15-mom-mode-tabs.png) |
| Playback proof/recovery state | ![Playback proof](samsung-qn85-mock-16-player-playing-or-recovery.png) |

## Legacy Captures

These older images remain for comparison until the website is updated:

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
