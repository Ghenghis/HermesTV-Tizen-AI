# Fork Setup — Ghenghis GitHub Account

Instructions for forking all upstream repos that HermesTV tracks, patches, or customizes. Run these commands from your workstation — they are **not automated by CI**.

---

## Why fork?

- **Customization**: HermesTV may need patches to upstream projects (e.g., Jellyfin Web Tizen theme tweaks, IPTVnator branding). A fork is the right place for those changes.
- **Track upstream changes**: forked repos let you `git fetch upstream` and see what changed in the original project before you merge.
- **Contribute back**: well-isolated fixes can be submitted as PRs to upstream projects from the fork.
- **Reference source**: forks added as submodules let you read and search upstream source locally without cloning separately.

Recommended forks live under `upstream/forks/` as git submodules. They are **optional** — the main compose stack uses upstream Docker images or release binaries, not built-from-source. The forks are for code reference and potential patching.

---

## Step 0 — Verify GitHub auth

Run this before anything else. Confirm you are authenticated as **Ghenghis**.

```bash
gh auth status
# Expected output should include:
#   Logged in to github.com account Ghenghis
```

If not logged in:

```bash
gh auth login
# Choose: GitHub.com → HTTPS → Yes (authenticate Git) → Login with a web browser
```

---

## Category 1 — Media Players & Web Clients

### 1.1 Jellyfin Web
**Upstream:** `jellyfin/jellyfin-web`
**Why fork:** May need Tizen-specific patches (custom CSS theme, TV remote key handling, HbbTV quirks). This is the primary web client used on QN85/QN95.
**Platform:** Web / Tizen
**Submodule:** Yes — recommended for patching

```bash
# Fork Jellyfin Web — Tizen patches and custom theme
gh repo fork jellyfin/jellyfin-web --org Ghenghis --clone=false
```

### 1.2 IPTVnator
**Upstream:** `4gray/iptvnator`
**Why fork:** Primary IPTV player for Dave. Fork for UI customization, channel-list branding, and potential Xtream Codes tweaks. Web version runs in browser; Electron version runs on Windows.
**Platform:** Web + Windows (Electron)
**Submodule:** Yes — customization target

```bash
# Fork IPTVnator — primary IPTV player for Dave (Windows + Web)
gh repo fork 4gray/iptvnator --org Ghenghis --clone=false
```

---

## Category 2 — Proxy / EPG Tools

### 2.1 Threadfin
**Upstream:** `Threadfin-Org/Threadfin`
**Why fork:** M3U proxy and EPG server for Jellyfin (successor to xTeVe). Fork to track releases and apply any HermesTV-specific config patches.
**Platform:** VPS Docker
**Submodule:** Yes — track releases

```bash
# Fork Threadfin — M3U proxy / EPG server for Jellyfin
gh repo fork Threadfin-Org/Threadfin --org Ghenghis --clone=false
```

### 2.2 m3u-editor
**Upstream:** `sparkison/m3u-editor`
**Why fork:** Web-based M3U playlist editor (Docker). Fork to track updates and apply any HermesTV-specific Docker Compose config patches.
**Platform:** VPS Docker
**Submodule:** Yes — track releases

```bash
# Fork m3u-editor — web-based M3U playlist editor (Docker)
gh repo fork sparkison/m3u-editor --org Ghenghis --clone=false
```

### 2.3 xtreamfilter
**Upstream:** `SpanishST/xtreamfilter`
**Why fork:** Xtream Codes stream filter (Docker). Fork for customization of filter rules and potential UI tweaks.
**Platform:** VPS Docker
**Submodule:** Yes — customization target

```bash
# Fork xtreamfilter — Xtream stream filter Docker
gh repo fork SpanishST/xtreamfilter --org Ghenghis --clone=false
```

---

## Category 3 — M3U Validation Tools

### 3.1 iptv-checker
**Upstream:** `iptv-org/iptv-checker`
**Why fork:** M3U/stream URL validation CLI tool. Track upstream bug fixes; may add HermesTV-specific output formats or Apollo Group stream validation scripts.
**Platform:** All (Node CLI)
**Submodule:** Yes — track fixes

```bash
# Fork iptv-checker — M3U validation tool
gh repo fork iptv-org/iptv-checker --org Ghenghis --clone=false
```

---

## Category 4 — Reference Lists (fork to curate)

### 4.1 awesome-iptv
**Upstream:** `iptv-org/awesome-iptv`
**Why fork:** The canonical awesome IPTV list. Fork to maintain a curated HermesTV version — remove dead links, annotate entries with HermesTV compatibility notes.
**Platform:** All (Markdown reference)
**Submodule:** Optional — reference only

```bash
# Fork awesome-iptv — curate a HermesTV-annotated version
gh repo fork iptv-org/awesome-iptv --org Ghenghis --clone=false
```

---

## Category 5 — Reference Only (do NOT fork)

These repos are very large and are tracked for reference only. Do not fork — just bookmark the upstream.

### 5.1 VLC
**Upstream:** `videolan/vlc`
**Reason:** Extremely large C++ codebase. No HermesTV customization planned. Reference for codec/stream behavior only.
**Action:** Reference upstream directly. Do not fork.

### 5.2 Kodi (XBMC)
**Upstream:** `xbmc/xbmc`
**Reason:** Very large C++ codebase. Kodi is used as a reference fallback player, not a customization target. Dave uses PotPlayer/IPTVnator as primary players.
**Action:** Reference upstream directly. Do not fork.

---

## Add recommended forks as submodules

After running the fork commands above, add the recommended forks as git submodules inside this repo. Run from the **repo root**:

```bash
# Media Players
git submodule add https://github.com/Ghenghis/jellyfin-web upstream/forks/jellyfin-web
git submodule add https://github.com/Ghenghis/iptvnator upstream/forks/iptvnator

# Proxy / EPG Tools
git submodule add https://github.com/Ghenghis/Threadfin upstream/forks/Threadfin
git submodule add https://github.com/Ghenghis/m3u-editor upstream/forks/m3u-editor
git submodule add https://github.com/Ghenghis/xtreamfilter upstream/forks/xtreamfilter

# M3U Tools
git submodule add https://github.com/Ghenghis/iptv-checker upstream/forks/iptv-checker

# Reference Lists (optional)
git submodule add https://github.com/Ghenghis/awesome-iptv upstream/forks/awesome-iptv

# Initialize and pull all submodule contents
git submodule update --init --recursive
```

The `upstream/forks/` folder is gitignored for actual submodule content — only the `.gitmodules` pointer file is tracked.

---

## Keeping forks up to date

### Update all submodules to their latest upstream remote HEAD

```bash
git submodule update --remote
```

### Update a specific submodule

```bash
git submodule update --remote upstream/forks/jellyfin-web
```

### Pull upstream changes into your fork on GitHub

Use this pattern for each repo. Replace the upstream slug and branch name as needed:

```bash
# Example: sync Ghenghis/jellyfin-web with upstream jellyfin/jellyfin-web
cd upstream/forks/jellyfin-web
git remote add upstream https://github.com/jellyfin/jellyfin-web   # only needed once
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
cd ../../..
```

```bash
# Example: sync Ghenghis/iptvnator with upstream 4gray/iptvnator
cd upstream/forks/iptvnator
git remote add upstream https://github.com/4gray/iptvnator          # only needed once
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
cd ../../..
```

```bash
# Example: sync Ghenghis/Threadfin with upstream Threadfin-Org/Threadfin
cd upstream/forks/Threadfin
git remote add upstream https://github.com/Threadfin-Org/Threadfin # only needed once
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
cd ../../..
```

Apply the same pattern to `m3u-editor`, `xtreamfilter`, `iptv-checker`, and `awesome-iptv` by substituting the upstream URL.

---

## WARNING

> **Never put IPTV provider credentials, M3U URLs, Xtream Codes, or Apollo Group tokens in any forked repo — public or private.**
>
> Forked repos on GitHub are public by default. Any credentials committed there are immediately exposed to the internet.
>
> All provider configuration stays in `G:\private\` vault and is loaded at runtime via the Jellyfin admin UI or environment variable injection — **never** via source code or config files tracked in git.
>
> If a fork must ship a config file template, use placeholder values like `YOUR_M3U_URL_HERE` — never real URLs or tokens.

---

## Fork status tracker

| Repo | Upstream URL | Ghenghis Fork URL | Submodule Added? | Platform | Purpose |
|---|---|---|---|---|---|
| jellyfin-web | https://github.com/jellyfin/jellyfin-web | https://github.com/Ghenghis/jellyfin-web | No (run commands above) | Web / Tizen | Patching / custom theme |
| iptvnator | https://github.com/4gray/iptvnator | https://github.com/Ghenghis/iptvnator | No (run commands above) | Web + Windows | Customization — Dave's primary player |
| Threadfin | https://github.com/Threadfin-Org/Threadfin | https://github.com/Ghenghis/Threadfin | No (run commands above) | VPS Docker | M3U proxy / EPG — track releases |
| m3u-editor | https://github.com/sparkison/m3u-editor | https://github.com/Ghenghis/m3u-editor | No (run commands above) | VPS Docker | Playlist editor — track releases |
| xtreamfilter | https://github.com/SpanishST/xtreamfilter | https://github.com/Ghenghis/xtreamfilter | No (run commands above) | VPS Docker | Xtream filter — customization |
| iptv-checker | https://github.com/iptv-org/iptv-checker | https://github.com/Ghenghis/iptv-checker | No (run commands above) | All (Node CLI) | M3U validation — track upstream fixes |
| awesome-iptv | https://github.com/iptv-org/awesome-iptv | https://github.com/Ghenghis/awesome-iptv | No (optional) | All (Markdown) | Curated HermesTV reference list |
| vlc | https://github.com/videolan/vlc | — (do not fork) | No | All | Reference only — too large |
| xbmc (Kodi) | https://github.com/xbmc/xbmc | — (do not fork) | No | All | Reference only — too large |
