# Commands — Codex Continuation 2026-05-21 02:10 MST

```powershell
cd G:\Github\HermesTV-Tizen-AI\services\hermes-tv-api
node test\jellyfinPlayback.test.js
```

Result: **25 PASS / 0 FAIL**

```powershell
cd G:\Github\HermesTV-Tizen-AI\services\hermes-tv-api
node test\credentialGuardSync.test.js
```

Result: **36 PASS / 0 FAIL**

```powershell
cd G:\Github\HermesTV-Tizen-AI\services\hermes-tv-api
node test\viewShellNoFakeRows.test.js
```

Result: **6 PASS / 0 FAIL**

Later continuation result after the series/category-row no-fakes pass:
**15 PASS / 0 FAIL**

```powershell
cd G:\Github\HermesTV-Tizen-AI\services\hermes-tv-api
node test\xtreamSeriesPlayback.test.js
```

Result: **11 PASS / 0 FAIL**

```powershell
cd G:\Github\HermesTV-Tizen-AI\services\hermes-tv-api
node test\noMockContracts.test.js
```

Result: **3 PASS / 0 FAIL**

```powershell
cd G:\Github\HermesTV-Tizen-AI
npm test --prefix services/hermes-tv-api
```

Result: **PASS**. The chain includes `jellyfinPlayback.test.js` and
`viewShellNoFakeRows.test.js`.

```powershell
cd G:\Github\HermesTV-Tizen-AI
npm run audit:secrets
```

Result: **2 PASS / 0 FAIL**

```powershell
cd G:\Github\HermesTV-Tizen-AI
npm run build:web
```

Result: **PASS**

```powershell
cd G:\Github\HermesTV-Tizen-AI
git diff --check
```

Result: **PASS** with Git line-ending warnings only.
