# Fork Setup — Ghenghis GitHub Account

Instructions for forking the repos marked "Fork Needed?" in `README.md` to the **Ghenghis** GitHub account. Run these commands yourself from your workstation — they are not automated by CI.

---

## Why fork?

- **Track upstream changes**: forked repos let you `git fetch upstream` and see what changed in the original project.
- **Customization**: HermesTV may need patches to Jellyfin Web (e.g., custom theme, Tizen-specific workarounds). A fork is the right place for those.
- **Contribute back**: well-isolated fixes can be submitted as PRs to upstream projects.

Forks live under `upstream/forks/` as git submodules. They are optional — the main compose stack uses upstream Docker images, not built-from-source. The forks are for code reference and potential patching only.

---

## Fork commands (run once)

Run these from any terminal where you are authenticated with `gh` as `Ghenghis`:

```bash
# Verify you are logged in as the right account
gh auth status

# Fork Jellyfin Web (web client for Jellyfin media server)
gh repo fork jellyfin/jellyfin-web --org Ghenghis --clone=false

# Fork iptv-checker (M3U playlist validation tool)
gh repo fork iptv-org/iptv-checker --org Ghenghis --clone=false
```

---

## Add forks as submodules (optional)

After forking, add the forks as submodules inside this repo so you can reference the source locally. Run from the repo root:

```bash
# Add Jellyfin Web fork as submodule
git submodule add https://github.com/Ghenghis/jellyfin-web upstream/forks/jellyfin-web

# Add iptv-checker fork as submodule
git submodule add https://github.com/Ghenghis/iptv-checker upstream/forks/iptv-checker

# Initialize and pull submodule contents
git submodule update --init --recursive
```

The `upstream/forks/` folder is gitignored for actual submodule content — only the `.gitmodules` pointer is tracked.

---

## Keeping forks up to date

When upstream releases a new version, update your local submodule to the latest upstream commit:

```bash
# Update all submodules to their latest upstream remote HEAD
git submodule update --remote

# Or update a specific submodule
git submodule update --remote upstream/forks/jellyfin-web
```

To pull upstream changes into your fork on GitHub (so Ghenghis/jellyfin-web stays current):

```bash
cd upstream/forks/jellyfin-web
git fetch https://github.com/jellyfin/jellyfin-web main
git merge FETCH_HEAD
git push origin main
```

---

## WARNING

> **Never put IPTV provider credentials, M3U URLs, Xtream codes, or Apollo Group tokens in any forked repo — public or private.**
>
> Forked repos on GitHub are public by default. Any credentials committed there are immediately exposed. All provider configuration stays in `G:\private\` vault and is loaded at runtime via the Jellyfin admin UI or environment variable injection — never via source code or config files tracked in git.

---

## Fork status tracker

| Repo | Upstream | Ghenghis Fork | Submodule Added? |
|---|---|---|---|
| jellyfin-web | https://github.com/jellyfin/jellyfin-web | https://github.com/Ghenghis/jellyfin-web | No (run commands above) |
| iptv-checker | https://github.com/iptv-org/iptv-checker | https://github.com/Ghenghis/iptv-checker | No (run commands above) |
