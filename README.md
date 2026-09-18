# INCOIS Ocean Visualization — 3D Argo + Tide-Gauge Platform (SIH)

Real-time 3D ocean visualization using live **INCOIS/IFREMER ERDDAP** data, **GeoServer WFS** tide-gauge stations, and **Three.js** volumetric rendering. No mock/procedural data is used as primary source — all telemetry is fetched from documented live APIs with captured `real_argo_cache.json` as the only offline fallback.

## Live Deployment
- Production URL: `https://ocean-project-taupe.vercel.app` (Vercel, `frontend/dist`)
- Health: `GET /api/health` and `GET /health` (Node backend)

## Project Structure
```
IntrestingProject/
├── frontend/                 # Vite + React + Three.js + Zustand
│   ├── 3d pages/             # World.js, Ocean.jsx, useOceanStore.js, argoFleetService.js
│   ├── services/             # argoService.js (ERDDAP live + real cache), argoBackendService.js
│   ├── src/assets/real_argo_cache.json  # Captured real ERDDAP snapshot (2026-09-09)
│   ├── vite.config.js        # /api → backend, /erddap-proxy → IFREMER
│   ├── vercel.json
│   └── .env.example
├── backend/                  # Express + node-fetch (single backend)
│   ├── server.js             # CORS, health, dotenv
│   ├── routes/validation.js  # /api/fleet, /api/profile/:id, /api/argo/depth-slice, /api/model/point, /api/validation
│   ├── package.json
│   └── .env.example
├── HelpingDocs/              # API walkthroughs
├── .env.example              # Root template (backend + frontend keys)
├── package.json              # Root scripts: dev/build -> frontend
└── vercel.json               # Build: cd frontend && npm run build
```

## Data Sources & Documentation (Real APIs Only)

### Primary — ERDDAP (TableDAP) — Real-time
- **IFREMER Argo GDAC**: `https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.html`
  - Info: `https://erddap.ifremer.fr/erddap/info/ArgoFloats/index.html`
  - Docs: `https://erddap.ifremer.fr/erddap/tabledap/documentation.html`
  - Dataset ID: `ArgoFloats` — variables: `platform_number, time, latitude, longitude, pres, temp, psal, data_mode`
  - Example: `https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.json?platform_number,time,latitude,longitude,temp,psal&time>=now-2days&data_mode="R"`
- **INCOIS ERDDAP**: `https://erddap.incois.gov.in/erddap/`
  - TableDAP index: `https://erddap.incois.gov.in/erddap/tabledap/index.html`
  - Docs: `https://erddap.incois.gov.in/erddap/tabledap/documentation.html` / `griddap/documentation.html`

### Secondary — INCOIS GeoServer WFS (TideGauges57 — Metadata + Latest Observation)
- Base: `https://incois.gov.in/geoserver/Insitu_TideGauges_Tsunami/ows`
- Capabilities: `?service=WFS&version=1.0.0&request=GetCapabilities`
- Schema: `?service=WFS&version=1.0.0&request=DescribeFeatureType&typeName=Insitu_TideGauges_Tsunami:Tideguages57`
- Data: `?service=WFS&version=1.0.0&request=GetFeature&typeName=Insitu_TideGauges_Tsunami:Tideguages57&outputFormat=application/json`

### Portal
- OON: `https://incois.gov.in/site/datainfo/OON.jsp` (portal, not API)
- LAS: `https://las.incois.gov.in`
- Holdings: `https://incois.gov.in/site/dataholdings.jsp`

> All ocean variables are fetched with retry + timeout + `columnNames.indexOf` parsing. Synthetic/procedural generation is **deprecated** and only triggers offline with explicit `CLIENT-ANALYTICAL-FALLBACK` provenance — primary path is always live ERDDAP.

## Environment Variables
Copy `.env.example` at root, `frontend/.env.example` and `backend/.env.example` to `.env`:

**Backend (`backend/.env`)**
```
PORT=8000
CORS_ORIGIN=*
ERDDAP_IFREMER_BASE=https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.json
ERDDAP_IFREMER_INDEX=https://erddap.ifremer.fr/erddap/index.json
ERDDAP_INCOIS_BASE=https://erddap.incois.gov.in/erddap
INCOIS_WFS_TIDE_URL=https://incois.gov.in/geoserver/Insitu_TideGauges_Tsunami/ows
ERDDAP_TIMEOUT_MS=12000
HEALTH_PING_TIMEOUT_MS=3000
```

**Frontend (`frontend/.env`)**
```
VITE_BACKEND_URL=
VITE_ERDDAP_IFREMER_BASE=https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.json
VITE_ERDDAP_PROXY_PATH=/erddap-proxy
VITE_ERDDAP_INCOIS_BASE=https://erddap.incois.gov.in/erddap
VITE_INCOIS_WFS_URL=https://incois.gov.in/geoserver/Insitu_TideGauges_Tsunami/ows
VITE_BACKEND_PROXY_TARGET=http://127.0.0.1:8000
```

`VITE_BACKEND_URL=""` uses same-origin `/api` (Vite proxy in dev, Vercel rewrite in prod).

## Quick Start
```bash
# Install
npm install                 # root
npm --prefix frontend install
npm --prefix backend install

# Configure env
cp .env.example .env
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env

# Dev (two terminals)
npm --prefix backend start          # http://127.0.0.1:8000/api/health
npm --prefix frontend run dev       # http://localhost:5173 (proxies /api + /erddap-proxy)

# Build
npm run build   # -> frontend/dist
```

## Backend API (Express, `backend/routes/validation.js`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` / `/health` | ERDDAP ping (3s timeout via `ERDDAP_IFREMER_INDEX`) |
| `GET` | `/api/fleet?lat_min=&lat_max=&lon_min=&lon_max=&days=` | Live fleet deduplicated by `platform_number` (IFREMER `ArgoFloats`) |
| `GET` | `/api/profile/:platform_number` | Vertical `pres,temp,psal` profile sorted shallow→deep |
| `GET` | `/api/argo/depth-slice?platform_number=&depth=&timestamp=` | **2D→3D** — interpolates table rows at depth + BGC optics/hydraulics (primary fix) |
| `GET` | `/api/model/point?lat=&lon=&depth=` | INCOIS-ROMS 1/12° model point (for `useOceanStore._fetchModelPoint`) |
| `GET` | `/api/validate?platform_number=&depth=&time=` | Legacy validation (delta) |
| `GET` | `/api/validation` | Unified validation (variables + delta) |

All routes use `columnNames.indexOf` and `ERDDAP_TIMEOUT_MS`, falling back to captured real cache only.

## 2D → 3D Pipeline (Fixed)
1. Frontend slider sets `depth` → `fetchArgoDepthSlice` calls `/api/argo/depth-slice` (relative URL, debounced AbortController).
2. Backend fetches IFREMER `ArgoFloats.json?platform_number="id"&time>=now-90d&orderByMax("time")`, parses via `columnNames`, interpolates linearly at `depth`.
3. Backend derives UNESCO density, sound speed, PAR, BBP, CDOM, O₂ sat, hydraulics — returns normalized slice.
4. Frontend updates Zustand `modelComparison` + Three.js shaders (volumetric slice + isotherm).

## Frontend Data Layer
- `services/argoService.js` — ERDDAP live via `/erddap-proxy`, `columnNames` lookup, cache `real_argo_cache.json` (real snapshot) on failure; synthetic fallback **deprecated/throws**.
- `3d pages/argoFleetService.js` — Live fleet with Vite proxy + CORS proxy fallback + authentic WMO fallback.
- `3d pages/oceanDataService.js` — Default `activeSource="erddap"` (ErddapOceanService), procedural deprecated.

## Verification
```bash
node --check backend/routes/validation.js && node --check backend/server.js
bash frontend/node_modules/.bin/vite build  # expect 454 modules, frontend/dist
```
