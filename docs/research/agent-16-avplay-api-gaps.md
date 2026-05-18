# Lane 03 — AVPlay API Gaps

**Date:** 2026-05-17
**Branch:** feature/b2-usable-local-mock
**File audited:** `apps/tizen-hermes-tv/src/ui/player/avplayEngine.js`

---

## Summary

The AVPlay engine is well-structured with a browser mock fallback, credential guard, tier-aware bitrate ceiling, and error handling. Several gaps exist around error code specificity, the `onerror` callback not calling the user-supplied onError, and lack of specific NETWORK_ERROR/DECODE_ERROR handling.

---

## AVPlay API Correctness Audit

| Check | Result | Notes |
|---|---|---|
| open(url) call | PASS | Correct AVPlay API call. |
| setDisplayRect(x,y,w,h) | PASS | Correct. Uses getBoundingClientRect for positioning. |
| setStreamingProperty('ADAPTIVE_INFO',...) | PASS | Format `'BITRATE_LIMIT=20000|BUFFER_SIZE=30'` matches documented Tizen 6.5 format. |
| setStreamingProperty('HLS_REBUFFER_PERCENTAGE',...) | PASS | Valid Tizen 6.5 property. |
| setListener({...}) | PARTIAL | See gaps below. |
| prepareAsync(ok, err) | PASS | Correct callback pattern. |
| play() | PASS | Called inside prepareAsync success callback. |
| stop() + close() sequence | PASS | Both called in destroy() and before new open(). |
| getCurrentTime() | PASS | Used in seekForward/seekBackward. |
| seekTo(ms, ok, err) | PASS | Correct. Null callbacks used which is fine for Tizen. |
| getStreamInfo() | PASS | Used in getCurrentStats(). Array iteration for VIDEO type. |
| ON_HDR_DETECTED property | NEEDS VERIFICATION | preferHDR() sets this but this property name is not definitively documented in Tizen 6.5 AVPlay SDK. May silently fail. |

---

## Error Handling Audit

### onerror callback — GAP

The `onerror` listener only logs the error code:

```js
onerror: function(errCode) {
  if (typeof console !== 'undefined') {
    console.error('[avplayEngine] Player error:', errCode);
  }
},
```

**Gap:** AVPlay on Tizen 6.5 delivers numeric error codes. The following important codes are not handled:
- `NETWORK_ERROR` (AVPlay network failure)
- `DECODE_ERROR` (stream decode failure)
- `DRM_ERROR` (DRM failure — not applicable for IPTV but should be rejected explicitly)

The `onerror` handler should:
1. Map error codes to human-readable labels
2. Call `_currentConfig.onError(new Error('AVPlay error: ' + errCode))` so the calling UI can show a user-visible error state.

### prepareAsync failure — GAP

The `prepareAsync` error callback logs but does not call `_currentConfig.onError`:

```js
function(err) {
  if (typeof console !== 'undefined') console.error('[avplayEngine] prepareAsync failed:', err);
}
```

**Gap:** If `prepareAsync` fails (e.g., invalid URL, network unreachable), the UI never receives an error signal and will be stuck on a blank player with no user-visible feedback.

---

## Credential Guard Audit

| Check | Result |
|---|---|
| Patterns checked: username=, password=, api_key= | PASS |
| URL guard called before open() | PASS |
| onError callback called on credential rejection | PASS |
| Bearer, token, secret NOT in CRED_PATTERNS | GAP — minor |

**Minor gap:** The credential guard only checks `username=`, `password=`, `api_key=`. It does not check for `token=` or `secret=` in stream URLs. Low risk because IPTV stream URLs typically use username/password or api_key query params. Recommend adding `token=` to CRED_PATTERNS.

---

## HLS Adaptive Bitrate

| Check | Result |
|---|---|
| ADAPTIVE_INFO set for enhanced tier | PASS — 20Mbps ceiling |
| ADAPTIVE_INFO not set for degraded tier | PASS — degraded sets HLS_REBUFFER_PERCENTAGE=0 only |
| setQualityPreference with profile quality_preference | PASS |
| 8Mbps cap for UN-class degraded | PASS |

**Gap:** The 8Mbps cap for UN-class is applied in `setQualityPreference()` but only if a profile with `quality_preference` is passed. If `streamConfig.profile` is null (which is possible), UN-class gets no bitrate cap at all. The degraded baseline in the `play()` method does not set ADAPTIVE_INFO.

---

## Identified Gaps and Suggested Fixes

### GAP-AVPLAY-01: onerror does not propagate to UI
**Priority:** P1
```js
onerror: function(errCode) {
  console.error('[avplayEngine] Player error:', errCode);
  // ADD: call user error handler
  if (_currentConfig && typeof _currentConfig.onError === 'function') {
    _currentConfig.onError(new Error('AVPlay stream error: ' + errCode));
  }
},
```

### GAP-AVPLAY-02: prepareAsync failure not propagated to UI
**Priority:** P1
```js
function(err) {
  console.error('[avplayEngine] prepareAsync failed:', err);
  // ADD:
  if (_currentConfig && typeof _currentConfig.onError === 'function') {
    _currentConfig.onError(new Error('Stream prepare failed: ' + err));
  }
}
```

### GAP-AVPLAY-03: Degraded tier has no default bitrate cap
**Priority:** P2
In the `play()` else-branch (degraded), add:
```js
try {
  av.setStreamingProperty('ADAPTIVE_INFO', 'BITRATE_LIMIT=8000|BUFFER_SIZE=20');
} catch (e) {}
```

### GAP-AVPLAY-04: token= missing from credential guard
**Priority:** P3
Add `'token='` to `CRED_PATTERNS` array.

### GAP-AVPLAY-05: ON_HDR_DETECTED property name needs verification
**Priority:** P2 — on-device test required. If unsupported, the `try/catch` in `preferHDR()` already handles it silently.

---

## What Is Correct

- Mock fallback for browser/dev environment: correct and comprehensive
- Stats polling at 5-second interval: appropriate
- Key event handler for RC remote (Play/Pause/Stop/FF/RW): correct
- Destroy method cleanup: comprehensive
- setListener wrapping in try/catch: correct
