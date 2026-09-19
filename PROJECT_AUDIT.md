# 🔍 PROJECT AUDIT REPORT
**INCOIS 3D Ocean Visualization Platform — Full-Stack Audit**
Date: 2026-09-19 · Method: 5 parallel review passes (Mock Data, Dataflow, API Layer, Bugs/Logic, Config/Build)

Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium · 🔵 Low/Info

---

## Executive Summary

The project's **backend** is in strong shape: it follows a strict "real-data or explicit null" contract, has good cycle-isolation logic, proper QC sanitization, caching, and timeout/retry handling. The **frontend** is where the "Zero-Fabrication" mandate breaks down badly: multiple stores, panels, and 3D components still generate synthetic values, call dead endpoints, or silently mask failures as plausible-looking numbers. The biggest risks are (1) fabricated model/observation values shown to users as real validation deltas, (2) a ReferenceError-level dead constant (`MODEL_API_BASE`), and (3) duplicated, divergent data pipelines across two stores and multiple services.

---

## SUB-AGENT 1 — Mock / Fabricated Data Audit

### 🔴 F-01. `useOceanStore._recalculateModelComparison` falls back to a fully synthetic model
`frontend/3d pages/useOceanStore.js` (~line 1201)
When `/api/model/point` fails (which is *always*, since `MODEL_DATASET_ID` is unconfigured), the code calls `_simulateModelPointFallback()` and labels it `modelSource: "synthetic-fallback"` — but **continues to compute deltas against it** and populates `modelComparison.model` used by the validation panels. This directly violates the README's "Zero-Fabrication Mandate" and the backend's own documented contract ("never return a computed number").
**Fix:** If the model is unavailable, set `model: null` for every variable and `delta: null`, and surface `reason` in the UI — exactly what the backend's `/api/validation` already does correctly.

### 🔴 F-02. `OceanVectorField.jsx` renders 100% random `Math.random()` currents
`frontend/3d pages/OceanVectorField.jsx` (line 15): `// Mocking a backend API call as requested` — generates 10,000 random (u, v) vectors and renders them as a live "geostrophic current vector field." README claims these come from NOAA CoastWatch.
**Fix:** Wire to the already-existing backend `/api/currents` endpoint (`backend/routes/validation.js` route 6 exists and works) or display "data unavailable."

### 🔴 F-03. `deltaMath.calculateRealisticObservedProfile` fabricates in-situ observations
`frontend/3d pages/deltaMath.js` (line 309): a hardcoded depth-curve generator (temp = `28.35 − d/50·0.45`, etc.) is used as "observed" data throughout `useOceanStore` (`_extractObservationVariables`, `getInstrumentComparisonData`, `selectInstrument`). Only temp/salinity get overridden when a real Argo profile loads; **current speed, current direction, dissolved oxygen, chlorophyll are always fabricated** — even for real floats. Argo floats do not measure currents at all (the backend even documents this at `validation.js` `notes`).
**Fix:** Return `null` for variables not backed by a live profile; delete the procedural curve path.

### 🟠 F-04. `oceanDataService.js` — entire `ProceduralArgoProvider` still live
`frontend/3d pages/oceanDataService.js`: 1,445 lines of deterministic pseudo-random profile/seasonal/MHW generation ("Switch from procedural fake data... by activating `ApiArgoProvider`"). Used as fallback by the data adapter layer. Contradicts the deprecated-mandate comments in `argoService.js`.
**Fix:** Remove or gate behind an explicit dev-only flag.

### 🟠 F-05. `argoTelemetryService.js` fabricates telemetry on failure
`frontend/services/argoTelemetryService.js` (line 117): on any fetch failure it returns hardcoded `{ temperature: 28.3, salinity: 34.32, lat: 11.68, lon: 92.5, depth: 5.0 }` with `status: "ACTIVE (OFFLINE FALLBACK)"`. Also calls **IFREMER directly from the browser** (line 9) — this will fail via CORS in most environments, making the fake fallback the *normal* code path, not the exception.
**Fix:** Route through the backend `/api/fleet` or `/api/profile/:id`; return `isLive: false` with nulls instead of plausible numbers.

### 🟠 F-06. `_syntheticFallback` in `argoService.js` is NOT deprecated in practice
`frontend/services/argoService.js` (line 286): marked `@deprecated`, yet `_fetchFromLocalCache` still calls it both on cache miss **and** on cache load failure. Any float outside the ~handful in `real_argo_cache.json` silently gets a fake 14-point profile labeled `synthetic-fallback` — which `useOceanStore` then maps to `"Synthetic Profile"` source text (a good tell, but data is still fake).
**Fix:** Delete the function; throw and render the proper "data unavailable" state (the code even documents this intent and doesn't follow it).

### 🟠 F-07. `getIndianOceanFallback()` — 30 seed floats presented as fleet
`frontend/3d pages/argoFleetService.js` (line 272): on fleet fetch failure, 30 hardcoded floats with plausible-but-invented lat/lon/temp/psal appear on the globe with `dataSource: "Authentic Indian Ocean Fallback"`. These coordinates are guesses, not a captured snapshot, despite the "authentic" label.
**Fix:** Show an empty globe + offline banner, or use only genuinely captured data (as `real_argo_cache.json` does).

### 🟠 F-08. `DEMO_INSTRUMENTS` leak into live selection paths
`frontend/3d pages/useOceanStore.js` (lines 447, 493, 996, 1059, 1512): `DEMO_INSTRUMENTS` is used to enrich real floats — cycle number defaults to `148`, battery to `80`, current direction to `"ENE (55°)"`. A real float gets a fake battery % and fake cycle number when metadata is missing.
**Fix:** Set unknown fields to `null`, not demo defaults.

### 🟡 F-09. Diurnal modulation applied to *observed* data
`useOceanStore.calculateDiurnalModulation` is applied to real Argo sensor readings (`_extractObservationVariables` adds diurnal offsets to real temp/sal). Physically-motivated, but it modifies **measured** values before display/delta math — scientifically indefensible to an INCOIS reviewer.
**Fix:** Apply diurnal modulation only to visualization (3D scene), never to reported observations or deltas.

### 🟡 F-10. TelemetryPanel / BottomDock / WorkspaceManager read from procedural generators
`TelemetryPanel.jsx` (imports `calculateRealisticObservedProfile`/`ModelProfile`), `BottomDock.jsx` ("Physical oceanographic model estimator for simulated profiles"), `WorkspaceManager.jsx` (line 832: `calculateRealisticModelProfile(depth)`). Multiple UI surfaces show synthetic numbers without live data.
**Fix:** Feed all panels from `modelComparison` / API results only.

---

## SUB-AGENT 2 — Dataflow Audit

### 🔴 D-01. `MODEL_API_BASE` is undefined → guaranteed ReferenceError
`frontend/3d pages/useOceanStore.js` (line 1391): `_fetchModelPoint` builds a URL from `MODEL_API_BASE`, which is **never defined or imported anywhere** in the codebase. Every call throws `ReferenceError`, is caught by the generic catch, and silently triggers `_simulateModelPointFallback` (F-01). This means the "live model path" can *never* succeed — and the error masks the real issue.
**Fix:** `const MODEL_API_BASE = apiBase || ""` (import from `services/api.js`). Better: call `apiUrl("/api/model/point")` like every other service.

### 🔴 D-02. Two competing global stores with divergent data paths
`useOceanStore.js` (1,783 lines) vs `useComparisonStore.js` (373 lines). The comparison store calls the *correct* backend endpoints (`/api/argo/depth-slice`, `/api/validation` with `time` param). The main store calls `/api/model/point` directly (broken, D-01) and synthesizes results. Same float can show different "model" values in different panels.
**Fix:** Consolidate; make `useOceanStore` consume `/api/validation` for comparison data.

### 🟠 D-03. Response shape mismatches between backend and frontend
- Backend `/api/profile/:id` returns levels as `{ depth, temp, salinity }`; `argoService._fetchFromERDDAP` maps `level.temp`→`temperature` with `level.psal`→`salinity` fallback — but the backend key is **`salinity`**, not `psal`. The fallback chain `level.psal !== undefined ? level.psal : level.salinity` happens to save it, but is fragile and undocumented.
- Backend `/api/model/point` returns `model: result.variables` with model-grid keys (e.g. `temperature`), but `_fetchModelPoint` consumers expect `current_speed`/`currentSpeed` dual keys — the backend model has no current variables at all (IMPOSSIBLE for ROMS temp/sal-only config), so `modelComparison.currentSpeed/Direction` will always be null or synthetic.
**Fix:** Define one TypeScript/JSdoc schema for profile + model responses and validate in one place.

### 🟠 D-04. Dead / orphaned parsing code
`argoService._parseErddapRows` references `columnNames` which is **not in scope** (line ~220: `rawColumnNames: columnNames`) — a latent ReferenceError if ever re-enabled. The function is currently unused but exported-adjacent and confusing.
**Fix:** Delete it (the backend now does this work).

### 🟠 D-05. `CACHE_URL = "/src/assets/real_argo_cache.json"` breaks in production
`argoService.js` line 37: hardcodes the *dev-server* path. After `vite build`, assets are hashed and served from `/assets/`, so the offline fail-safe fetch 404s in production → triggers `_syntheticFallback` (F-06). The headline resilience feature is broken in the deployed app.
**Fix:** `import cacheJson from '../src/assets/real_argo_cache.json'` (Vite bundles it) or place in `public/`.

### 🟠 D-06. Stale-window state in `useComparisonStore` error paths
On depth-slice/validation fetch failure, only `isLoadingSlice: false` is set — previous successful data remains displayed with no `error` field, indistinguishable from fresh data. Also the `time` query param is sent as `time` for depth-slice but the backend accepts `timestamp || time` (OK, but undocumented).
**Fix:** Track `error` and `fetchedAt` per region; render stale markers.

### 🟡 D-07. Store ↔ vanilla-DOM ↔ window globals triple-sync
`useOceanStore` writes to `window.OCEAN_STATE`, `window.oceanStore`, direct `document.getElementById` mutations (`_updateDepthZoneUI`), and the Zustand store simultaneously. Three sources of truth, no reconciliation; re-entrancy hacks (`window.__syncingInstrument`) confirm the design strain.
**Fix:** Pick Zustand as the single source; bridge outward one-way.

### 🟡 D-08. `fetchRealTimeGlobeFloat` mutates DOM directly with inline HTML
`useOceanStore.js` (line ~70): writes animated `<span>` HTML into `#argoSurfaceTemp` — bypasses React/Zustand, causes double-render flicker with panels that subscribe to the same values.

---

## SUB-AGENT 3 — API Layer Audit

### Backend (strong overall)
✅ `erddap.js` client: proper encoding, AbortController timeouts, 429 retry, "no matching results" → empty table. Good.
✅ `validation.js`: correct null-contract, `EMPTY_RESULT` handled as 200-with-nulls for history scrubbing, cycle-time (not request-time) used for model matching.
✅ Caching: fleet 5-min, profiles 5-min, model 15-min TTL.

### 🔴 A-01. Backend logging of every response is a production hazard
`validation.js` router middleware: every JSON response is `JSON.stringify`-ed (pretty-printed!) to console on **every request**. On Vercel serverless this bloats logs, slows responses, and can print large fleet/profile payloads thousands of lines long.
**Fix:** Log only method/URL/status + byte count; gate verbose mode behind `NODE_ENV=development`.

### 🟠 A-02. `/api/fleet` mutates every float with invented fields
`validation.js` route 1: stamps `status: 'Active'`, `mode: 'LIVE'` on all rows — even rows where temp/salinity are null (QC-failed). Downstream UI reads `status` as truth. `maxDepth: 2000` is documented as nominal, but flows into UI as if measured.

### 🟠 A-03. No rate limiting / request-size validation anywhere
Express app has no `express-rate-limit`, no payload caps on query params (`days`, bounding boxes unbounded). A malicious `days=100000` query hits IFREMER with a huge window. On serverless this burns your function time and hammering public scientific infrastructure could get the deployment IP blocked.

### 🟠 A-04. Frontend duplicate timeout/retry logic — inconsistent
- `argoService`: 60s timeout, no retry
- `argoTelemetryService`: 5s timeout (will fail constantly for IFREMER from India/EU; feeds fake data, F-05)
- `argoFleetService`: 60s config, but only one URL candidate now (comment says proxies removed)
- `argoBackendService`: serial endpoint fallback chain with shared AbortController — a new call aborts the previous one mid-chain (fine for debounce, but if two components call concurrently they cancel each other).
**Fix:** One shared `apiFetch(path, { timeoutMs })` utility.

### 🟠 A-05. Vercel rewrite `/erddap-proxy/:path*` is a wide-open proxy
`vercel.json` rewrites any `/erddap-proxy/*` path to `erddap.ifremer.fr/*` from *your* deployment — an open relay for anyone who finds it (abuse of your function quota; can also be pointed at arbitrary paths on the upstream host).
**Fix:** Restrict to `/erddap-proxy/erddap/...` prefix patterns you actually use, or drop the rewrite (the frontend no longer uses it per `argoFleetService` comments).

### 🟡 A-06. `CORS: *` + `Access-Control-Allow-Origin: *` header duplication
`backend/server.js` defaults `CORS_ORIGIN=*`; vercel.json *also* sets the header manually on `/api/*` — potential duplicate-header responses. `render.yaml` pins a placeholder origin (`your-vercel-app-url.vercel.app`) that's clearly stale.

### 🟡 A-07. `.env.example` drift vs README and code
Root `.env.example` lists `VITE_BACKEND_URL=http://localhost:8000`, but README says "leave empty for same-origin" — following the example file in dev causes CORS failures through the Vite proxy path. `MODEL_DATASET_ID`, `MODEL_VARIABLES`, `MODEL_DIMENSIONS` are missing from the root example (only in README/backend example). `ERDDAP_BGC_BASE` also missing at root.

### 🟡 A-08. `GET /api/model/datasets` is an unprotected discovery tool
Scans INCOIS's catalogue on demand with a 20s fetch; trivially spammable.

### 🔵 A-09. Health endpoint does double duty
`/health` and `/api/health` both registered — fine, but the 8s upstream ping means a slow ERDDAP makes the health check the slowest route; Vercel's platform health may time out first. Consider caching the health result for 30s.

---

## SUB-AGENT 4 — Bugs & Logic Issues

### 🔴 B-01. Local-time diurnal math uses browser timezone
`calculateDiurnalModulation` uses `date.getHours()` — **local browser time**, not UTC or local solar time. The README's physics claims "peaks at 14:00 local solar time," but code yields peak at 14:00 in the *viewer's* timezone. Same float shows different "physics" in Hyderabad vs California. Also, timestamps from ERDDAP are UTC; `new Date(iso).getHours()` converts — silently shifting the whole diurnal cycle per viewer.
**Fix:** Use `getUTCHours()` or compute solar hour from lon.

### 🔴 B-02. Delta math on contaminated values
Since observations are diurnal-modulated (F-09) and model values add a *different* diurnal offset (`isModel=true`, 0.75h phase), the reported `Δ = Obs − Model` contains two artificial sinusoids that partially cancel/shift — the delta is not a model-skill residual, it's partially an artifact of the modulation code. The backend `/api/validation` computes deltas correctly (pure obs − model); the frontend path diverges from it.

### 🟠 B-03. `getProfileAtDepth` clamps instead of returning null
`argoService.js`: "Falls back to nearest-neighbour if depth is outside the profiled range" — clamping to the shallowest/deepest measured value. The backend deliberately returns `null` outside range ("asking for 15 m should not be answered with a 980 m parking measurement"). Frontend contradicts the contract → wrong deltas near range boundaries.

### 🟠 B-04. `selectInstrument` enrichment spread order bug
`useOceanStore` `selectInstrument`: `{ x, y, z, depth, temp: realisticObs..., battery: ..., ...inst }` — the demo `inst` spread comes **last**, overriding the computed values with demo values when present, and overriding `depth` with the demo instrument's stale depth. Then `_recalculateModelComparison(null, enriched, targetDepth)` is called with `profile = null`, forcing fully synthetic observation extraction (F-03).

### 🟠 B-05. `_fetchFromLocalCache` spreads cache entry without `rawColumnNames` guard
`{ ...cacheData[id], source: "offline-cache" }` — if cache format drifts from the ArgoProfile shape (it already differs — includes `_readme` key), no validation occurs before use. `profile` array presence isn't checked; a bad entry crashes `.profile` consumers downstream (`getProfileAtDepth` guards, others don't).

### 🟠 B-06. `argoBackendService` fetchController race
Two rapid calls: call B aborts call A's controller *after* A already set `fetchController = null` on success → B's abort is a no-op on a stale controller, and B and A both write `fetchController = null`. Minor, but the singleton pattern is wrong for concurrent components; `useComparisonStore` already does per-region controllers correctly.

### 🟠 B-07. Telemetry JSON column assumptions
`argoTelemetryService`: `json.table.rows[0]` with `orderByMax("time")` — with **no `pres<=10` server enforcement guarantee** it takes the latest row at *any* pressure (may be 2000 dbar) and reports it as "surface telemetry." The URL does include `PRES<=10`, but if AOML's dataset differs in constraint syntax the failure falls into the fabricated fallback silently.

### 🟡 B-08. Interpolation bracket search is O(n) but mis-handles duplicate depths
`getProfileAtDepth` breaks on the first bracketing pair; Argo profiles can contain duplicate pressure levels (surface drift records). If `pts[i].depth === pts[i+1].depth` both bracket, t = 0/0 → NaN. Guarded only by the `lower.depth === upper.depth` equality check *after* selection — which returns `lower` values (OK), but the earlier `t` computation path can still yield NaN for interior duplicates.
**Fix:** Dedupe depths when parsing (backend `pickCycle` helps; frontend cache path doesn't).

### 🟡 B-09. `interpolateAt` / depth clamp mismatch across layers
Backend clamps depth to `[0, 2100]`; frontend clamps to `[0, 4000]`; deltaMath clamps to `[0, 4000]`. Requesting 3000 m hits the frontend fine but the backend silently clamps to 2100 — depth provenance (`requested_depth` vs returned) can disagree with no error.

### 🟡 B-10. Dead code / unreachable branches
- `argoService._parseErddapRows` — unreachable + broken (D-04)
- `_syntheticFallback` — "deprecated" but live (F-06)
- `api/index.js` exports the Express app directly — Vercel expects a handler; works on Vercel's Node runtime via automatic wrapping, but `export default app` relies on framework detection; document or wrap explicitly.
- `HelpingDocs` references `DEMO_INSTRUMENTS`, Python backends, and proxies that no longer exist — docs are stale relative to code.

### 🔵 B-11. `window.reloadArgoFleet` / console globals
Debug hooks exposed in production bundles (`window.oceanStore`, `argoFleetStatus`, `OCEAN_STATE`) — handy for demos, but also trivially scriptable by anyone; fine for SIH, flag for production.

---

## SUB-AGENT 5 — Config, Build & Deployment Audit

### 🟠 C-01. Vercel function maxDuration 60s vs frontend 60s timeouts
`vercel.json` sets `maxDuration: 60`; frontend fetches also wait up to 60s with ERDDAP timeouts of 60s *plus* retries — the outer fetch will hit Vercel's hard limit first, returning a platform 504 that the frontend misinterprets. Budget: upstream timeout (60) + retry sleep (1.5s) + overhead must be **less than** function max duration. Set `ERDDAP_TIMEOUT_MS=25000` for serverless or raise maxDuration (note: 60s is already Hobby max).

### 🟠 C-02. Environment variables not wired in vercel.json / render.yaml
Neither deployment manifest defines `ERDDAP_*`, `MODEL_DATASET_ID`, `MODEL_VARIABLES`, `MODEL_DIMENSIONS`. Serverless cold starts read `process.env` — `dotenv.config()` won't find `.env` in serverless. The model endpoint will *always* return `available:false` in production until these are added as Vercel env vars.

### 🟠 C-03. `render.yaml` placeholder + wrong health expectations
`CORS_ORIGIN=https://your-vercel-app-url.vercel.app` placeholder; `healthCheckPath: /api/health` pings IFREMER with 8s timeout every health check — Render may flap the service when ERDDAP is slow (A-09 interaction).

### 🟡 C-04. Vite proxy only exists in dev; no prod equivalent for `/api` on frontend-only deploys
Fine today (Vercel rewrite handles it), but the root `vercel.json` + `frontend/vercel.json` (per README structure) can conflict if both are deployed — README lists `frontend/vercel.json` but repo root also has one; confirm which is authoritative (only root `vercel.json` exists in repo — README is stale).

### 🟡 C-05. No tests detected
Zero test files in the repository (0 detected by tooling). For a validation engine whose core value is numeric correctness (interpolation, delta math, QC), there is no unit coverage of: `interpolateAt`, `pickCycle`, `sanitize`, `calculateDelta`, `alignDepthProvenance`. The synthetic-vs-real bug class (this audit's biggest findings) is exactly what tests would catch.
**Fix:** Add vitest + tests for backend services and `deltaMath`.

### 🟡 C-06. Lint/type infrastructure
Backend has eslint config; frontend has none visible. No TypeScript anywhere despite heavy response-shape coupling (D-03) — the shape-mismatch bugs are classic TS-catchable errors.

### 🔵 C-07. `.vercelignore` present — verify it excludes `HelpingDocs/` and `node_modules` from function bundling; `api/index.js` importing the whole Express app means every route file ships in the serverless bundle (fine, but keep `real_argo_cache.json` (frontend asset) out of it).

### 🔵 C-08. README claims `/api/bgc/profile/:id`, `/api/bgc/floats`, `INCOIS GeoServer WFS` integrations — WFS tide-gauge integration does **not exist in the backend code** (no route references it). README overstates capabilities; remove or implement.

---

## Priority Fix Order (recommended)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1 | D-01 `MODEL_API_BASE` ReferenceError | 5 min | Un-breaks the entire model path |
| 2 | F-01/B-02 Kill synthetic model fallback; propagate nulls | 1–2 h | Scientific credibility |
| 3 | F-02 Wire `OceanVectorField` to `/api/currents` | 1 h | Removes 10k random vectors |
| 4 | D-05 Fix `CACHE_URL` for production bundle | 15 min | Restores offline fail-safe |
| 5 | F-05/F-06/F-07 Remove fake fallbacks; null + banner instead | 2–3 h | Consistent zero-fabrication |
| 6 | B-01 Use UTC/solar time in diurnal math | 1 h | Viewer-independent physics |
| 7 | C-02 Add env vars to Vercel config | 30 min | Model endpoint works in prod |
| 8 | A-01 Tame response logging | 15 min | Prod log hygiene |
| 9 | D-03/B-03 Align response schemas + null-on-out-of-range | 3–4 h | Correct deltas at boundaries |
| 10 | C-05 Add unit tests for interpolation/delta/QC | 1 day | Regression protection |

## What's Already Good ✅
- Backend null-contract design (`available`, `source`, `reason`) is genuinely well thought out
- Cycle isolation (`pickCycle`) solves the depth-stitching bug correctly and is well documented
- ERDDAP client encoding/timeout/retry handling is solid
- Per-region AbortControllers in `useComparisonStore` are the right pattern
- Comments in `validation.js` honestly explain *what was removed and why* — keep that culture
