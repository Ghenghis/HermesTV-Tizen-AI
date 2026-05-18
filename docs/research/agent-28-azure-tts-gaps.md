# Lane 15 — Azure/Assure TTS Future Endpoint Gaps

**Date:** 2026-05-17
**Branch:** feature/b2-usable-local-mock
**File:** services/hermes-tv-api/src/routes/tts.js

---

## Summary

The TTS route is a well-designed stub with correct voice mapping, allowlisted voice overrides, credential pattern blocking, and a clear B2 implementation notes section. The stub returns 202 with the selected voice name. No Azure credentials are needed or present. The Azure REST API endpoint format is documented for B3 implementation.

---

## B2 TTS Stub Response Shape

| Check | Result |
|---|---|
| Returns 202 Accepted | PASS |
| Response includes status: "pending" | PASS |
| Response includes voice used | PASS — `voice: selectedVoice` |
| Response includes profile_id | PASS |
| Response includes text_length | PASS |
| Response includes actionable message | PASS — tells developer what SDK and env vars to install |
| No audio returned | CORRECT for B2 |

Full B2 response:
```json
{
  "status": "pending",
  "message": "Azure TTS integration pending B2. Install azure-cognitiveservices-speech package and set AZURE_TTS_KEY + AZURE_TTS_REGION env vars.",
  "profile_id": "mom_tv",
  "voice": "en-US-AriaNeural",
  "text_length": 42
}
```

---

## Voice Mapping

| Profile | Voice | Azure Voice ID Format |
|---|---|---|
| dave_tv | en-US-GuyNeural | CORRECT — Azure TTS Neural voice ID format is `{locale}-{Name}Neural` |
| mom_tv | en-US-AriaNeural | CORRECT |

The voice ID format `en-US-AriaNeural` is the correct Azure Cognitive Services Speech SDK format. This matches the Azure REST API and SDK `speechSynthesisVoiceName` property.

---

## Voice Override Allowlist

8 voices are allowlisted:
- en-US-GuyNeural
- en-US-AriaNeural
- en-US-JennyNeural
- en-US-DavisNeural
- en-GB-RyanNeural
- en-GB-SoniaNeural
- en-AU-NatashaNeural
- en-AU-WilliamNeural

PASS — allowlist prevents SSML injection via arbitrary voice_override values.

---

## Credential Pattern Guard

```js
const CREDENTIAL_PATTERN = /api[_\s\-]?key|password|secret|token/i;
```

| Pattern | Blocked |
|---|---|
| "api_key" | YES |
| "password" | YES |
| "secret" | YES |
| "token" | YES |
| "api-key" | YES |
| "api key" | YES |
| Case insensitive | YES — `/i` flag |

PASS — TTS text cannot contain credential-pattern strings.

**Minor gap:** The pattern does not block `username=` or `bearer `. Low risk for TTS use case.

---

## Azure TTS REST API Endpoint Format (Research — No Credentials Needed)

The correct Azure Cognitive Services Speech REST API endpoint:

```
POST https://<region>.tts.speech.microsoft.com/cognitiveservices/v1
```

Where `<region>` matches the AZURE_TTS_REGION environment variable (e.g., `eastus`, `westus2`).

**Required headers:**
- `Ocp-Apim-Subscription-Key: <AZURE_TTS_KEY>` — server-side only, never forwarded to TV
- `Content-Type: application/ssml+xml`
- `X-Microsoft-OutputFormat: audio-24khz-96kbitrate-mono-mp3`

**Request body (SSML):**
```xml
<speak version='1.0' xml:lang='en-US'>
  <voice xml:lang='en-US' xml:gender='Female' name='en-US-AriaNeural'>
    Your text here
  </voice>
</speak>
```

**Alternative: Microsoft Cognitive Services Speech SDK (recommended):**
```js
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const config = sdk.SpeechConfig.fromSubscription(
  process.env.AZURE_TTS_KEY,
  process.env.AZURE_TTS_REGION
);
```

The tts.js file's B2 IMPLEMENTATION NOTES section already contains exactly this code — it is correct and complete for B3 implementation.

---

## Real Implementation Assessment

The B3 implementation plan in tts.js NOTES is correct:
1. npm install microsoft-cognitiveservices-speech-sdk
2. Set AZURE_TTS_KEY and AZURE_TTS_REGION env vars in G:\private\.env.hermestv
3. Stream MP3 audio buffer back to client
4. Client (TV app) receives audio/mpeg and plays via Web Audio API or `<audio>` element

**One gap in the notes:** The B3 implementation should add a maximum text length guard (already present at 500 chars) and should also add a Content-Security-Policy header on the audio response to prevent MIME-type sniffing.

---

## BLOCKER File

See: `docs/research/BLOCKER_AZURE_TTS.md`

---

## Priority Gap List

| Gap | Priority | Description |
|---|---|---|
| TTS not connected to chatbot response | P2 | Mom mode needs audio feedback in B3 |
| TTS not connected to any UI event | P2 | B3 feature |
| username= and bearer not in TTS credential guard | P3 | Low risk for TTS text use case |
| GET /api/tts/voices format consistency | P3 | Returns flat object, should return array with metadata |
