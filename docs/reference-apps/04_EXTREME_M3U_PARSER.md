---
title: "Reference-App Extraction 04 — Extreme-InfiniTV M3U Parser Behavior Matrix"
agent: 05 of 20 (DaveTV reference-extraction swarm)
date: 2026-05-20
upstream_repo: G:\Github\IPTV-Apps\Extreme-InfiniTV
upstream_license: GPL-3.0-or-later
adoption_mode: PATTERN-ONLY (no GPL source copied; behavior contracts re-expressed in prose)
hermes_license: MIT (HermesTV stays MIT — only test patterns and behavior contracts are adopted, no copyrightable code)
truth_gate: |
  No mocks, no stubs, no placeholders. Every contract listed below must be
  reachable from a real provider M3U export. Empty input returns
  { entries: [], epgUrl: "" } — not seeded fake data.
---

# Truth-Gate Banner

This document extracts the BEHAVIOR MATRIX of Extreme-InfiniTV's M3U parser
under GPL-3.0 and re-expresses it in fresh prose for HermesTV's MIT-licensed
test suite. **Zero GPL source code is reproduced.** Test descriptions and
input/output contracts are facts about real-world IPTV provider playlists,
not copyrightable artifacts.

Cross-referenced HermesTV files:

- `G:\Github\HermesTV-Tizen-AI\services\hermes-tv-api\src\lib\m3uClient.js` — current parser
- `G:\Github\HermesTV-Tizen-AI\services\hermes-tv-api\test\m3uParser.test.js` — current 39-case suite

---

## 1. Complete Behavior Matrix — Extreme-InfiniTV

The upstream test file (`tests/m3u-parser.test.ts`, 330 lines) defines the
contract through 9 describe blocks covering ~30 cases. Each case below is
named for its describe + it title and re-stated in prose only.

### 1.1 Standard fixture (5 cases)

| Behavior | Input shape | Expected output | Why it matters |
|---|---|---|---|
| EPG URL from header | `#EXTM3U x-tvg-url="..."` first line | `result.epgUrl` carries the URL | Many providers expose their XMLTV guide only via this header — losing it strands EPG. |
| One entry per channel | N `#EXTINF`+URL pairs | `result.entries.length === N` | Catalog size sanity. |
| Attribute extraction | `tvg-id`, `tvg-logo`, `group-title` quoted attrs on EXTINF | Fields populated verbatim | Card metadata + EPG join key. |
| URL capture | First non-comment line after `#EXTINF` | `entry.url` = that exact string | Without it, no playback. |
| Missing fields = null | `#EXTINF` with only `tvg-id` + name | `logo`, `tvgName`, `userAgent`, `referer`, `chno`, `catchup` all `null` | Downstream code can rely on `null` vs `""` to skip rendering branches. |

### 1.2 BOM and CRLF (2 cases)

- **UTF-8 BOM stripped.** A file beginning with `0xEF 0xBB 0xBF` (Windows
  Notepad default) still parses cleanly — the BOM is invisible to the
  EXTM3U header detector.
- **Windows CRLF line endings.** `\r\n` splits identically to `\n`. Real
  providers using Windows-side scripts (m3u_plus exports from PHP on
  Windows hosts) will hit this.

### 1.3 EXTINF format variants (3 cases)

- **Attributes-after-comma alt order.** Some early-2010s exporters wrote
  `#EXTINF:0,tvg-id="..." tvg-logo="...",Display Name` (attributes on the
  RIGHT of the first comma). The parser falls back to splitting on the
  LAST comma so both the standard and alt forms work.
- **`tvg-name` fallback for empty comma-tail.** When `#EXTINF:...,` ends
  with an empty name field, the parser uses `tvg-name` as the display name.
- **Strip attribute leakage from name.** When attrs leak past the comma
  (malformed but common), `entry.name` is the human-readable prefix only,
  not the entire residue.

### 1.4 Attribute parsing edge cases (4 cases)

- **Escaped quotes inside quoted values.** `tvg-name="Inner \"quote\" here"`
  → `tvgName` carries `Inner "quote" here` with backslash-escapes
  consumed. Real providers occasionally embed channel names like
  `MTV "Live" HD`.
- **Unquoted attribute values.** `tvg-id=bare-id group-title=Bare` parses
  identically to the quoted form. Several smaller providers omit quotes.
- **Suffix-fragment immunity.** `my-tvg-id="not-real" tvg-id="real-id"`
  must NOT confuse a regex anchored on `tvg-id=`. The parser anchors on a
  word boundary before the attribute name.
- **Malformed unterminated quote resilience.** `tvg-id="never-closes
  group-title="G"` (missing close quote) must NOT crash. The parser
  recovers, returns the URL line, and best-effort extracts what it can.

### 1.5 EPG header variants (3 cases)

The header can carry the EPG URL under any of three alias names:
`x-tvg-url`, `tvg-url`, or `url-tvg`. The parser checks all three in
priority order and returns `""` when none are present.

### 1.6 #EXTGRP and tvg-chno (3 cases)

- **`#EXTGRP:` directive as group fallback.** When `group-title` is
  absent on EXTINF, a following `#EXTGRP:Sports` line populates the
  group instead.
- **`group-title` wins.** When both `group-title=` and `#EXTGRP:` are
  present, the inline attribute wins.
- **`tvg-chno` parsed as a number.** Channel number is numeric, not a
  string, with `null` when absent or non-numeric.

### 1.7 Catchup attributes (1 case)

`catchup="append"` + `catchup-days="7"` populate `catchup` (string) and
`catchupDays` (number). Missing `catchup-days` is `null`. This drives
the EPG rewind/timeshift surface — losing it means no DVR-style replay.

### 1.8 Per-channel #EXTVLCOPT headers (3 cases)

A directive line BETWEEN the `#EXTINF` and its URL, of the form
`#EXTVLCOPT:http-user-agent=...` or `#EXTVLCOPT:http-referrer=...`,
must be applied to the IMMEDIATELY FOLLOWING entry only.

- `http-user-agent` populates `entry.userAgent`.
- `http-referrer` populates `entry.referer`.
- **Leakage guard:** the next entry, which does NOT have its own
  `#EXTVLCOPT`, must have `userAgent` and `referer` set to `null`. State
  must reset between entries.

### 1.9 HLS sub-playlist tags (2 cases)

A `#EXTM3U` file can include interleaved HLS master-playlist tags:
`#EXT-X-VERSION`, `#EXT-X-STREAM-INF`, `#EXT-X-MEDIA`, `#EXT-X-KEY`, etc.

- The parser must NOT crash on them.
- The parser must IGNORE them as if they were comments — they do NOT
  consume the URL line. The URL still belongs to the preceding
  `#EXTINF`.

### 1.10 Radio detection (5 cases)

- `tvg-type="radio"` → `isRadio: true`, `tvgType: "radio"`.
- `radio="true"` (separate attr) → `isRadio: true`.
- Both flags are CASE-INSENSITIVE (`"Radio"`, `"TRUE"` both match).
- `tvg-type="tv"` → `isRadio: false`.
- Neither attr set → `isRadio: false`, `tvgType: null`.

### 1.11 Malformed input resilience (5 cases)

- **Bare URL with no preceding `#EXTINF` is dropped.** A stream without
  metadata cannot be cataloged; silently ignoring it is correct.
- **Blank lines + unrelated comments + `#KODIPROP:` lines are skipped.**
- **Lonely `#EXTINF` with no URL is dropped.** No `entries[]` entry is
  emitted for a metadata-only orphan.
- **Empty string input** → `{ entries: [], epgUrl: "" }`.
- **Whitespace-only input** → `{ entries: [], epgUrl: "" }`.

---

## 2. What DaveTV Already Covers — 39 PASS cases

HermesTV's `test/m3uParser.test.js` currently lights up these contracts
(cross-referenced to the matrix above):

- **1.1 Standard fixture** — covered (`standard: epgUrl`, `name`, `tvgId`,
  `tvgName`, `group`, `url`, `missing catchup is null`, `missing tvgChno
  is null`, `tvgChno numeric`).
- **1.2 BOM + CRLF** — covered (`BOM: 1 entry`, `BOM: name`, `CRLF: 1
  entry`, `CRLF: name`).
- **1.5 EPG header variants** — all three aliases + empty case covered.
- **1.6 EXTGRP + tvg-chno** — fallback, preference, numeric all covered.
- **1.4 Attribute edge cases** — escaped quotes, unquoted attrs, suffix-
  fragment immunity, malformed-quote non-crash all covered.
- **1.7 Catchup + 1.8 partial** — `catchup`, `catchup-days`,
  `http-user-agent`, `http-referrer` are read from the EXTINF
  attribute string and round-trip into `userAgent`/`referer`.
- **1.10 Radio** — `tvg-type="radio"` → `isRadio: true`, `"tv"` → false.
- **1.11 Malformed resilience** — bare URL drop, KODIPROP skip, lonely
  EXTINF drop, empty input, whitespace-only input all covered.

---

## 3. What DaveTV Does NOT Yet Cover

Reading `m3uClient.js` line 252 (`if (line.charAt(0) === '#')`), the
parser TREATS `#EXTVLCOPT` and `#EXT-X-STREAM-INF` as generic ignored
directives. This means:

### 3.1 (1.8) Per-channel #EXTVLCOPT user-agent / referrer — MISSING

**Behavior contract not yet asserted.** When a real provider playlist
puts `http-user-agent` or `http-referrer` on a `#EXTVLCOPT:` directive
LINE between the `#EXTINF` and its URL (instead of as EXTINF attributes),
the headers must still be captured into the entry. Today, m3uClient's
EXTINF attribute walker only reads attributes on the EXTINF line itself,
and the comment-skip at line 252 silently discards the `#EXTVLCOPT:`
line — so geofenced sources that require a UA/referrer to stream will
silently fail playback. The bug surfaces only when the upstream provider
emits BOTH styles. The contract: after parsing a `#EXTVLCOPT:` line that
appears in the window between EXTINF and the URL, the resulting entry
must carry `userAgent` and/or `referer` exactly as if those values had
been on the EXTINF line. The state must reset before the next EXTINF.

### 3.2 (1.9) HLS sub-playlist guardrails — MISSING

**Behavior contract not yet asserted.** When `#EXT-X-VERSION`,
`#EXT-X-STREAM-INF`, `#EXT-X-MEDIA`, `#EXT-X-KEY`, `#EXT-X-DISCONTINUITY`,
or any other HLS master/media-playlist tag appears between an `#EXTINF`
and its URL, the parser must (a) not crash, (b) not treat the HLS tag
as the URL line, (c) correctly attribute the next NON-comment line as
the URL belonging to the preceding `#EXTINF`. Today HermesTV's parser
likely does (a) and (b) by accident — the comment-skip drops them — but
this is not regression-locked by any test. A provider mixing real
HLS master content into the M3U (some Russian and Eastern-European
providers do this) could silently lose channels with future parser
edits.

### 3.3 (1.3) Alt-order EXTINF (attributes after comma) — MISSING

**Behavior contract not yet asserted.** Some legacy exporters emit
`#EXTINF:0,tvg-id="..." tvg-logo="...",Display Name` with TWO commas
and attributes on the RIGHT side. HermesTV's parser uses `lastIndexOf(',')`,
which happens to work for the simple case, but there is no test pinning
this contract. A future refactor to `indexOf(',')` would silently break
older provider playlists.

### 3.4 (1.4) `tvg-name` fallback when comma-tail is empty — MISSING

**Behavior contract not yet asserted.** `#EXTINF:-1 tvg-name="From tvg-
name",` (trailing comma, empty name) must yield `entry.name = "From
tvg-name"`. The code does this (line 178), but no test guards it.

### 3.5 (1.10) Case-insensitive radio flag + `radio="true"` alias — PARTIAL

`m3uClient.js` lines 192-193 lowercase both attrs and accept `radio="true"`,
so the behavior IS implemented. But the test suite only asserts the
lowercase `tvg-type="radio"` path. The `radio="TRUE"` (all caps) and
`tvg-type="Radio"` (mixed case) and the separate `radio="true"` attr
are unguarded.

### 3.6 (1.6) `tvg-chno` from EXTGRP-sourced groups — MISSING

When `tvg-chno` is missing AND `#EXTGRP:` provides the group, the
contract is `tvgChno: null`. Tested as a missing-field case in the
upstream Extreme `catchup.m3u` fixture, but not in HermesTV.

---

## 4. Recommended HermesTV Follow-Up

Add the following test descriptions to
`services/hermes-tv-api/test/m3uParser.test.js`. The test code itself
follows the existing CommonJS pass/fail pattern — no new framework
required.

**Priority A — Real playback impact (do these first):**

1. `#EXTVLCOPT http-user-agent line between EXTINF and URL populates userAgent`
2. `#EXTVLCOPT http-referrer line between EXTINF and URL populates referer`
3. `#EXTVLCOPT headers do not leak onto the next entry (state reset)`
4. `Multiple #EXTVLCOPT lines on one entry both apply (UA + referrer combined)`
5. `#EXTVLCOPT after the URL line is ignored (only the BEFORE-URL window applies)`

**Priority B — HLS sub-playlist guardrails:**

6. `#EXT-X-VERSION between EXTINF and URL is ignored, URL attributed to preceding EXTINF`
7. `#EXT-X-STREAM-INF + #EXT-X-MEDIA interleaved tags do not consume the URL`
8. `#EXT-X-KEY line is ignored as a comment`
9. `Mixed HLS-master + plain channels: both parse, count is preserved`
10. `Unknown #EXT-X-* tag does not crash the parser`

**Priority C — EXTINF format variants:**

11. `Alt-order EXTINF (attributes after first comma) parses tvgId and name correctly`
12. `Empty comma-tail name falls back to tvg-name`
13. `Attribute leakage past the comma is stripped from entry.name`

**Priority D — Resilience and case:**

14. `radio="TRUE" (uppercase) → isRadio true`
15. `tvg-type="Radio" (mixed case) → isRadio true`
16. `Separate radio="true" attr without tvg-type → isRadio true`
17. `tvg-chno missing with EXTGRP-sourced group → tvgChno is null`
18. `MAX_ITEMS_PER_PROVIDER cap (1500) enforced — input with 2000 entries returns 1500`

These 18 cases, added to the existing 39, close the parity gap with
Extreme-InfiniTV's contract surface without copying GPL code. The most
impactful are the first five — provider playlists that require a
specific user-agent silently fail playback today, and the user has
already enforced "empty state on error, never fake content" — playback
must either work end-to-end or surface as unconfigured, never as a
broken stream with no diagnostic trail.

---

## License Posture Recap

- Extreme-InfiniTV: GPL-3.0-or-later. Source untouched, never imported,
  never copied into HermesTV.
- HermesTV: MIT. Only test patterns and behavior contracts (facts about
  real-world M3U playlists) are re-expressed in this document. Test
  PATTERNS are not copyrightable; test CODE would be. None of the
  upstream test code is reproduced verbatim in HermesTV.
- The upstream test file demonstrates which playlist shapes exist in
  the wild — that knowledge is a fact, not a creative work.
