# BLOCKER — Azure TTS Subscription Key Required

**Created:** 2026-05-17
**Lane:** 15 — Azure/Assure TTS Gaps

---

## What Is Blocked

- Real speech synthesis from text (audio output on the TV)
- Mom Mode audio feedback when commands complete
- Chatbot voice responses

---

## What Is Required

1. **Azure Subscription** — sign up at https://azure.microsoft.com/free/
2. **Cognitive Services — Speech resource** — create a Speech resource in the Azure Portal
3. **Subscription Key** — one of two keys shown on the Keys and Endpoint page
4. **Region** — the deployment region (e.g., `eastus`, `westus2`)

---

## Where Credentials Must Be Stored

```
G:\private\.env.hermestv
```

Add:
```
AZURE_TTS_KEY=<your_subscription_key>
AZURE_TTS_REGION=eastus
```

**NEVER:**
- Commit these values to git
- Log them in any application output
- Return them from any API endpoint
- Forward them to the TV client

---

## Cost Note

Azure TTS free tier provides 500,000 characters/month for Neural voices. For home use at 16-18 hours/day TV viewing with occasional chatbot commands, this is unlikely to be exceeded. Standard Neural pricing is $16/1M characters if the free tier is exceeded.

---

## Non-Blocking for B2

The 202 stub correctly returns the selected voice name and profile for testing. No audio is needed for the B2 mock demo. This blocker only applies to B3+ TTS implementation.

---

## Resolution

When credentials are available:
1. Add to G:\private\.env.hermestv
2. Install SDK: `npm install microsoft-cognitiveservices-speech-sdk` in services/hermes-tv-api/
3. Uncomment the B2 implementation notes in `services/hermes-tv-api/src/routes/tts.js`
4. Test with: `curl -X POST http://localhost:3001/api/tts -H "Content-Type: application/json" -d '{"text":"Hello Sherri","profile_id":"mom_tv"}'`
