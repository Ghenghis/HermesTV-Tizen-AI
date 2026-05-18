# 19 — Adding Providers Without Exposing Credentials

Repo: `https://github.com/Ghenghis/HermesTV-Tizen-AI`
Local: `G:\Github\HermesTV-Tizen-AI`
Target TVs: Mom `QN85Q7FAAFXZA`; Dave `UN55CU8000BXZA`.

This document describes how to onboard Apollo Group and XtremeHD (or any IPTV provider) into HermesTV in a way that keeps credentials completely off the TV, off the internet, and out of Git.

---

## The core principle

**Credentials never leave your local network.**

The architecture is:

```
Your phone or browser  →  Local backend (PC port 3001)  →  credentials stored at G:\private\hermestv.env
                                 ↑
                          Samsung TV talks only to this
```

The TV app talks exclusively to `hermestv.local` (your local backend). It never contacts Apollo Group or XtremeHD directly. It never sees your username or password. It only receives the processed stream URLs that the backend generates after authenticating with the provider on your behalf.

---

## Where credentials are stored

Provider credentials are stored in one place only:

```
G:\private\hermestv.env
```

This file is outside the Git repository. It is never committed. It is never uploaded to any server. If the file is deleted, all stored credentials are removed.

The `.gitignore` at the repo root includes:

```
G:/private/
/private/
*.env.hermestv
hermestv.env
```

Never move credentials inside the repo folder.

---

## Method 1 — Web-based setup page (recommended)

The backend includes a setup page that lets you enter credentials through a form in your browser. No command line required.

### Step 1 — Make sure the backend is running

```bash
npm run start:api
```

Confirm it prints: `[HermesAPI] hermes-tv-api v0.1.0 listening on port 3001`

### Step 2 — Open the setup page

Open Chrome or Edge and go to:

```
http://localhost:3001/setup/provider
```

You will see a form with fields for:
- Provider name (select Apollo Group or XtremeHD from a dropdown, or enter custom)
- Username
- Password
- Server URL (the M3U or Xtream Codes API URL your provider gave you)
- Port (if applicable)

### Step 3 — Submit the form

Click **Save Provider**. The form submits to:

```
POST http://localhost:3001/setup/provider/submit
```

The backend:
1. Validates the credentials by making a test connection to the provider (requires internet).
2. If valid, saves the credentials to `G:\private\hermestv.env` in an encrypted format.
3. Returns a success confirmation to your browser.
4. The credentials are now available to the TV app through the local backend.

If validation fails, the credentials are not saved and the error message is shown on the setup page.

### What the TV app receives

After onboarding, when the TV app requests channel data, the backend:
1. Reads credentials from `G:\private\hermestv.env`.
2. Authenticates with the provider API.
3. Returns a processed channel list and stream URLs to the TV app.

The TV app never sees the raw credentials. It only sees processed data.

---

## Method 2 — QR code onboarding from your phone

If you prefer to enter credentials on your phone rather than at the PC keyboard:

### Step 1 — Generate the QR code

In the chatbot (floating circle on the web app or TV app), type:

```
setup provider
```

A QR code appears on screen. The code encodes a local URL: `http://<your-pc-ip>:3001/setup/provider`

### Step 2 — Scan with your phone

Scan the QR code with your phone's camera. Your phone's browser opens the setup form.

Your phone must be on the same Wi-Fi network as your PC. The setup form is only accessible on the local network — it is not exposed to the internet.

### Step 3 — Fill in the form on your phone

Enter your provider credentials on the phone. Tap **Save Provider**.

The form submits to your PC's local backend over your home network. Credentials are saved to `G:\private\hermestv.env` on your PC. Your phone never stores the credentials.

In mock mode, the QR code shows a placeholder code `HRM-M0K` and the form does not make a real provider connection. This is the expected behavior in B2.

---

## Method 3 — Manual .env editing (advanced)

If you prefer to edit the file directly:

1. Open `G:\private\hermestv.env` in a text editor (create it if it does not exist).
2. Add provider credentials in this format:

```env
PROVIDER_1_NAME=Apollo Group
PROVIDER_1_URL=http://apollogroup.example.com:80
PROVIDER_1_USERNAME=your_username
PROVIDER_1_PASSWORD=your_password

PROVIDER_2_NAME=XtremeHD
PROVIDER_2_URL=http://xtremehd.example.com:8080
PROVIDER_2_USERNAME=your_xtremehd_user
PROVIDER_2_PASSWORD=your_xtremehd_pass
```

3. Restart the backend API (`Ctrl+C` then `npm run start:api`).

The backend reloads credentials from the file at startup.

---

## Removing all stored credentials (rollback)

To remove all provider credentials instantly:

```bash
del G:\private\hermestv.env
```

Or in PowerShell:

```powershell
Remove-Item G:\private\hermestv.env
```

After deleting the file:
- Restart the backend (`npm run start:api`).
- The TV app will show only mock content (no real provider connections).
- No credentials remain anywhere in the system.

---

## Security rules (hard)

| Rule | Detail |
|---|---|
| No credentials in Git | `G:\private\` is excluded from Git by design. Never override this. |
| No credentials in the TV app | The Tizen `.wgt` package must never contain provider URLs, usernames, or passwords. The package is readable by anyone with sideload access. |
| No credentials in browser storage | The web app never stores provider credentials in `localStorage`, `sessionStorage`, or cookies. |
| No credentials in logs | The backend must not log raw credentials to console or log files. The `hermestv.env` path is logged but not its contents. |
| No credentials in agent commands | The safe JSON schema (`docs/06`) explicitly blocks any field containing a URL, IP, hostname, credential, token, or secret from being emitted by any agent. |
| Encrypted at rest | The backend stores credentials encrypted in `hermestv.env` using a key derived from the machine's hardware ID. Copying the file to another machine renders the credentials unreadable. |

---

## Verifying provider onboarding worked

After saving credentials, open the web app and look for the provider filter in the catalog header. If onboarding succeeded:
- The provider name appears in the filter dropdown.
- Switching to that provider shows channels from the real M3U/Xtream Codes list (not mock data).

In the chatbot, you can also type:

```
show provider status
```

This displays each configured provider with a green (connected), amber (degraded), or red (failed) status indicator.

---

## What happens if credentials expire or are wrong

If a provider rejects the credentials at connection time:
- The backend marks the provider as `degraded` in the provider status.
- The TV app shows the provider with a red status badge.
- Mock content is shown as a fallback — the app does not crash.
- The chatbot shows an error message when asked about the provider.

To fix: return to the setup page (`http://localhost:3001/setup/provider`) and update the credentials.

---

## Next steps

- `docs/18_REAL_TV_DEPLOYMENT_CHECKLIST.md` — deploy the app to the physical TV.
- `docs/proof/B2_USABLE_LOCAL_MOCK_RUNBOOK.md` — verify the full B2 mock mode stack is working before adding real credentials.
