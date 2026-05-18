# Upstream: awesome-iptv Resources

Upstream reference folder sourced from https://github.com/iptv-org/awesome-iptv for HermesTV Tizen AI integration planning.

---

## What this folder is

This directory contains curated, hand-selected reference material derived from the [awesome-iptv](https://github.com/iptv-org/awesome-iptv) community list. It is **not** a mirror or clone — it is a structured subset of that knowledge, annotated for HermesTV's specific backend, frontend, and provider context.

All content here is reference only. No provider credentials, subscription tokens, or private stream URLs are included. Real provider configurations (Apollo Group, XtremeHD) live exclusively in `G:\private\` vault and are never committed.

---

## How HermesTV uses these references

| Use case | How it maps |
|---|---|
| Backend tool selection | `tools.md` — npm libraries and self-hosted proxies evaluated for B2 sprint |
| EPG source evaluation | `epg-sources.md` — public XMLTV feeds for seeding Threadfin/Dispatcharr |
| Player and UX pattern reference | `apps-reference.md` — competitive audit informing HermesTV Tizen UI design |
| Channel logo and metadata | `channel-datasets.md` — logo CDN chains and picon packs for EPG grid |
| Free stream testing | `providers-reference.md` — public playlists for pipeline smoke testing only |

---

## Contents

| File | Description |
|---|---|
| [tools.md](tools.md) | IPTV programming libraries and self-hosted tools relevant to HermesTV backend |
| [epg-sources.md](epg-sources.md) | Public EPG/XMLTV sources and HermesTV EPG architecture overview |
| [apps-reference.md](apps-reference.md) | Reference apps categorized by platform and UX pattern relevance |
| [channel-datasets.md](channel-datasets.md) | Channel logo sources, icon packs, and metadata datasets |
| [providers-reference.md](providers-reference.md) | Free/public IPTV providers for testing only — not production sources |

---

## Hard rules

- Never add provider credentials or subscription stream URLs to any file in this directory.
- Never commit `G:\private\` vault contents anywhere in this repo.
- This folder tracks upstream knowledge, not live configuration. Runtime config lives in `docker/`, `services/`, and vault.
