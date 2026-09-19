# 🌊 INCOIS 3D Ocean Visualization Platform

### 3D Digital Twin, Argo In-Situ Telemetry & Numerical Model Co-Validation Engine

**Smart India Hackathon (SIH) — Problem ID: 26067**  
**Client / Stakeholder:** Indian National Centre for Ocean Information Services (INCOIS), Ministry of Earth Sciences (MoES), Govt. of India  
**Live Production URL:** [https://ocean-project-taupe.vercel.app](https://ocean-project-taupe.vercel.app)

---

## 1. Executive Summary & Objective

Oceanographers, forecasters, and maritime researchers at INCOIS routinely need to evaluate how numerical ocean circulation models (e.g., **INCOIS-ROMS 1/12°**, **HYCOM**, **Mercator Ocean**) perform against empirical, ground-truth ocean measurements gathered by autonomous instruments in the water column. Historically, this workflow required toggling between desktop GIS packages, raw NetCDF files, command-line Python/xarray scripts, and disparate observational web portals.

This platform unifies numerical model outputs and live in-situ ocean telemetry into a **100% browser-native 3D interactive command center and digital twin**. It provides:

1. **Global 3D Planetary Globe** rendering active oceanographic instruments across the North Indian Ocean basin (Arabian Sea, Bay of Bengal, Equatorial Indian Ocean).
2. **Subsurface Volumetric Water Column (0 to 4000 m)** with dynamic cutting planes, 20°C Isotherm ($D_{20}$) thermocline isosurface extraction, and geostrophic current vector stream fields.
3. **Automated Co-Located Model vs. Observation Validation Engine ($\Delta = \text{Observed} - \text{Model}$)** with linear and vector angular error bounds.
4. **Cinematic Orbital Dive Transition** navigating seamlessly from planetary satellite orbit down to the waterline and deep abyssal plains.
5. **Zero-Fabrication Data Integrity**: All telemetry is fetched live from international and national oceanographic repositories (IFREMER GDAC, INCOIS ERDDAP, NOAA CoastWatch, INCOIS GeoServer WFS). When data is missing, sensors are unequipped, or servers are unreachable, the system explicitly reports `available: false` with null values—**never substituting fake procedural data as real scientific observations**.

---

## 2. End-to-End System Architecture

```
                                      UPSTREAM SCIENTIFIC DATA REPOSITORIES
  +-------------------------------+   +-------------------------------+   +-------------------------------+
  |  IFREMER Argo GDAC (ERDDAP)   |   |     INCOIS ERDDAP (Table/Grid)|   |     NOAA CoastWatch ERDDAP    |
  |  - Core Argo (pres,temp,psal) |   |  - INCOIS-ROMS 1/12° (griddap)|   |  - Altimetry Surface Currents |
  |  - Synthetic BGC (doxy, chla) |   |  - Moored OOM Buoys / LAS     |   |    (u_current, v_current)     |
  +-------------------------------+   +-------------------------------+   +-------------------------------+
                 |                                    |                                    |
                 +------------------------------------+------------------------------------+
                                                      |
                                                      v
  +-------------------------------------------------------------------------------------------------------+
  |                                     BACKEND PROCESSING & API TIER                                     |
  |                                (Node.js Express 5 / Vercel Serverless Function)                       |
  |                                                                                                       |
  |  1. erddap.js:      Parameterized URL builder, grammar encoder, AbortController timeouts, retries     |
  |  2. sanitize.js:    Dual-defense QC: Argo Table 2 flags (1, 2, 5) + Indian Ocean physical range bounds|
  |  3. argoCore.js:    Cycle isolation (pickCycle), server-side orderByMax, vertical linear interpolation|
  |  4. argoBgc.js:     Autonomous BGC profile parsing (doxy, chla, bbp700, cdom, nitrate)                |
  |  5. modelGrid.js:   INCOIS GridDAP 4D coordinate extraction [(time)][(depth)][(lat)][(lon)]           |
  |  6. currentsGrid.js:Altimetry geostrophic current decimation ([latMin:stride:latMax]), vector math   |
  |  7. Memory Cache:   5–15 min TTL caches protecting public scientific infrastructure                   |
  +-------------------------------------------------------------------------------------------------------+
                                                      |  REST / JSON (/api/*)
                                                      v
  +-------------------------------------------------------------------------------------------------------+
  |                                FRONTEND PRESENTATION & ENGINE TIER                                    |
  |                             (Vite 8 + React 19 + Three.js + Zustand + GSAP)                           |
  |                                                                                                       |
  |  [index.html & World.js]                        [ocean.html & Ocean.jsx]                              |
  |  - 3D Interactive WebGL Earth (8K Textures)     - Volumetric 3D Ocean Scene (0 to 4000 m)             |
  |  - Live Float Beacons (Color-coded by SST)      - Dynamic APEX Float with Wave Buoyancy Physics       |
  |  - Raycast Picking & Station Inspector Card     - 20°C Isotherm (D20) Thermocline Isosurface Mesh     |
  |  - Two-Phase GSAP Orbital Dive Controller       - Vertical Cutting Plane with Custom GLSL Shaders     |
  |                                                 - Real-Time Geostrophic Current Vector Streamlines    |
  |                                                 - Multi-Window Command Center & Floating Charts       |
  |                                                                                                       |
  |  [useOceanStore.js (Zustand)]                   [deltaMath.js]                                        |
  |  - Single source of truth for all UI state      - Multi-variable linear delta: Δ = Obs - Model        |
  |  - Decoupled depth slider & instrument depth    - Vector circular difference: Δθ (no wrap-around)     |
  |  - Diurnal physical cycle modulation (solar/M2) - Provenance & missing-data validation state          |
  +-------------------------------------------------------------------------------------------------------+
```

---

## 3. Data Sources & Scientific Repositories

All ocean variables are fetched from documented, public-access oceanographic APIs.

### 3.1. Primary: Core Argo GDAC (IFREMER)

- **Protocol:** ERDDAP TableDAP (REST JSON)
- **Base URL:** `https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.json`
- **Variables Queried:** `platform_number, cycle_number, time, latitude, longitude, pres, temp, psal, pres_qc, temp_qc, psal_qc`
- **Cadence & Nature:** Autonomous profiling floats that park at ~1000 m depth, plunge to 2000 m every ~10 days, and record vertical profiles during ascent to the surface before transmitting telemetry via satellite.

### 3.2. Secondary: Biogeochemical Argo GDAC (IFREMER)

- **Protocol:** ERDDAP TableDAP (REST JSON)
- **Base URL:** `https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats-synthetic-BGC.json`
- **Variables Queried:** `doxy` (Dissolved Oxygen in $\mu\text{mol/kg}$), `chla` (Chlorophyll-a in $\text{mg/m}^3$), `bbp700` (Particle Backscattering in $\text{m}^{-1}$), `cdom` (Colored Dissolved Organic Matter in $\text{ppb}$), `nitrate` ($\mu\text{mol/kg}$)
- **Key Engineering Note:** BGC Argo is an entirely separate dataset from Core physics. Querying Core `ArgoFloats` for `doxy` or `chla` fails at the ERDDAP level; querying BGC with a `data_mode` filter fails because BGC uses `parameter_data_mode`. Our backend cleanly routes physics to `ArgoFloats` and optics to `ArgoFloats-synthetic-BGC`.

### 3.3. Numerical Ocean Models: INCOIS ERDDAP

- **Protocol:** ERDDAP GridDAP (OpenDAP-compatible array slicing)
- **Base URL:** `https://erddap.incois.gov.in/erddap/griddap/<MODEL_DATASET_ID>.json`
- **Target Model:** INCOIS-ROMS 1/12° high-resolution Indian Ocean regional circulation model.
- **Grammar:** `?variable[(time)][(depth)][(lat)][(lon)]` (bracket order strictly matches the dataset's declared DDS coordinate dimension order).

### 3.4. Satellite Altimetry Geostrophic Currents: NOAA CoastWatch

- **Protocol:** ERDDAP GridDAP (REST JSON)
- **Dataset:** `noaacwBLENDEDNRTcurrentsDaily`
- **Base URL:** `https://coastwatch.noaa.gov/erddap/griddap/noaacwBLENDEDNRTcurrentsDaily.json`
- **Variables Queried:** `u_current` (Eastward velocity, $\text{m/s}$), `v_current` (Northward velocity, $\text{m/s}$)
- **Spatial Resolution:** Global 0.25° grid, updated daily from satellite altimetry (Absolute Dynamic Topography + MDT CNES/CLS 2013).

### 3.5. Coastal Tide Gauges: INCOIS GeoServer WFS

- **Protocol:** OGC Web Feature Service (WFS 1.0.0 / GeoJSON)
- **Base URL:** `https://incois.gov.in/geoserver/Insitu_TideGauges_Tsunami/ows`
- **Feature Type:** `Insitu_TideGauges_Tsunami:Tideguages57`
- **Parameters:** `?service=WFS&version=1.0.0&request=GetFeature&typeName=Insitu_TideGauges_Tsunami:Tideguages57&outputFormat=application/json`

---

## 4. Under-the-Hood Working & Data Pipeline

### 4.1. Trace A: How the Live Fleet Renders on the 3D Globe

1. **Initial Page Load (`index.html`)**:
   `World.js` initializes the Three.js WebGL scene, creating a textured Earth sphere with high-resolution 8K daytime imagery, a procedural specular ocean mask, and a revolving atmospheric cloud layer.
2. **Fleet Position Fetch (`argoFleetService.js`)**:
   The frontend calls `/api/fleet?lat_min=0&lat_max=25&lon_min=55&lon_max=98&days=45` via the same-origin Vite proxy (dev) or Vercel rewrite (prod).
3. **Backend Query Optimization (`argoCore.js`)**:
   Instead of downloading megabytes of global records and deduplicating in memory, the backend issues an ERDDAP server-side grouping query:

   ```text
   https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.json?platform_number,time,latitude,longitude,temp,psal,temp_qc,psal_qc
   &time>=now-45days&latitude>=0&latitude<=25&longitude>=55&longitude<=98&pres<=10&orderByMax("platform_number,time")
   ```

   - `pres<=10` restricts observations to surface readings.
   - `orderByMax("platform_number,time")` instructs the ERDDAP engine to partition rows by WMO float ID and return only the single latest timestamp row per float.

4. **Sanitization & Quality Assurance (`sanitize.js`)**:
   - Each row's QC flags are evaluated. Only flags `1` (Good), `2` (Probably Good), and `5` (Value Changed) are accepted.
   - Sensor values are validated against physical Indian Ocean limits:
     - Temperature: $[-2.0^\circ\text{C}, 35.0^\circ\text{C}]$
     - Salinity: $[30.0, 40.0\text{ PSU}]$
     - Depth/Pressure: $[0, 2100\text{ dbar}]$
   - Fill values ($99999.0$, $-214748.3648$) and NaNs are converted to `null`.
5. **Spherical Coordinate Mapping**:
   The frontend converts geographical coordinates $(\phi = \text{latitude}, \lambda = \text{longitude})$ into 3D Cartesian coordinates $(x, y, z)$ on the globe:
   $$\rho = R_{\text{globe}} = 1.5$$
   $$x = -\rho \cdot \cos(\phi) \cdot \sin(\lambda)$$
   $$y = \rho \cdot \sin(\phi)$$
   $$z = \rho \cdot \cos(\phi) \cdot \cos(\lambda)$$
6. **Visual Beacon Placement**:
   Interactive 3D beacon pins with pulse waves and vertical stem lines are positioned at each float location. Toggling the **🌡️ Temperature Mode** recolors pins:
   - 🔴 Warm Red (`#ff4d4d`): Surface Temperature $> 28.0^\circ\text{C}$
   - 🔵 Cool Cyan (`#00f0ff`): Surface Temperature $\le 28.0^\circ\text{C}$
   - 🟢 Emerald Green (`#00ff66`): Active selection

---

### 4.2. Trace B: The Cinematic Orbital Dive

When a user clicks any Argo marker on the globe:

1. **Raycast Detection**: Three.js `Raycaster` identifies the clicked float mesh and extracts its WMO ID (e.g., `2902351`).
2. **GSAP Two-Phase Camera Descent (`orbitalDive.js`)**:
   - **Phase 1 (Orbital Alignment)**: Camera smoothly interpolates from arbitrary viewing angles to directly align with the float's spherical normal vector, rotating the globe so the float faces the camera.
   - **Phase 2 (Atmospheric Plunge)**: Camera descends along the normal vector toward the sea surface while FOV dynamically compresses, simulating an orbital re-entry descent.
3. **Deep-Link Navigation**:
   The view smoothly transitions to the 3D subsurface ocean simulator with deep-linked parameters:
   ```text
   /ocean.html?id=2902351&lat=11.68&lon=92.50&sea=Bay%20of%20Bengal
   ```

---

### 4.3. Trace C: Full Vertical Profile Fetch & 2D-to-3D Depth Slicing

Once inside `ocean.html`:

1. **Store Hydration (`useOceanStore.js`)**:
   `selectFloat('2902351')` initiates a two-phase data acquisition pipeline:
   - **Phase A**: Calls `argoService.fetchLiveArgoProfile()` $\to$ `/api/profile/2902351`.
   - **Phase B**: Concurrently calls `/api/model/point` and `/api/argo/depth-slice`.
2. **Cycle Isolation (Solving the Depth-Stitching Problem)**:
   A critical oceanographic defect in naive ERDDAP querying is requesting `pres` alongside `orderByMax("time")`. Because different depths report at slightly different seconds, naive queries stitch together rows across completely different 10-day dives.
   Our backend fetches `cycle_number` and executes `pickCycle(rows)`:
   - Identifies the cycle matching the requested historical time or the latest dive.
   - Filters the entire profile to contain **only** rows belonging to that identical dive cycle.
3. **Linear Depth Interpolation (`interpolateAt`)**:
   Argo floats record discrete pressure levels (e.g., $5.2\text{ m}, 14.8\text{ m}, 28.1\text{ m}, 50.4\text{ m}$). When the user sets the depth slider to an exact value (e.g., $15.0\text{ m}$):
   $$\text{Find measured levels } z_{\text{lo}} \le z_{\text{target}} \le z_{\text{hi}}$$
   $$t = \frac{z_{\text{target}} - z_{\text{lo}}}{z_{\text{hi}} - z_{\text{lo}}}$$
   $$V(z_{\text{target}}) = V(z_{\text{lo}}) + t \cdot \left(V(z_{\text{hi}}) - V(z_{\text{lo}})\right)$$
   - _Boundary Rule_: If $z_{\text{target}}$ lies outside the profile's measured range (e.g., requesting $15\text{ m}$ on a float that parked at $980\text{ m}$), the algorithm returns `null` instead of clamping.
4. **Decoupled Depth Architecture**:
   The store decouples `targetDepth` (the global cutting plane/isosurface depth) from `activeInstrumentDepth` (the physical sensor depth of the selected float). Clicking an instrument never resets the 3D volume view, and dragging the depth slider recalculates the interpolation and delta envelope smoothly without remounting the scene.

---

### 4.4. Trace D: In-Situ Observation vs. Numerical Model Validation Engine

```
+-----------------------------------------------------------------------------------------+
|                                 VALIDATION ENGINE                                       |
|                                                                                         |
|   In-Situ Observation (Argo)                   INCOIS-ROMS 1/12° Numerical Model        |
|   - Real-world CTD sensor reading              - Gridded 4D prognostic ocean model      |
|   - Interpolated at target depth               - Sliced at identical (lat, lon, depth)  |
|   - QC-filtered & verified                     - Time-matched to float dive timestamp   |
|                 \                                         /                             |
|                  \                                       /                              |
|                   v                                     v                               |
|        +-----------------------------------------------------------------------+        |
|        |           RESIDUAL ERROR CALCULATION & RESILIENCE EVALUATION          |        |
|        |                                                                       |        |
|        |   Standard Linear Variables (Temp, Sal, O₂, Chl-a):                  |        |
|        |      Δ = Observation - Model                                          |        |
|        |                                                                       |        |
|        |   Angular Directional Variables (Current Direction, Wave Heading):    |        |
|        |      Δθ = ((θ_obs - θ_mod + 540) mod 360) - 180                       |        |
|        |      (Guarantees 359° vs 1° yields +2°, eliminating wrap-around bug)  |        |
|        |                                                                       |        |
|        |   Strict Missing Data Rule:                                           |        |
|        |      If either Observation OR Model is null -> Δ = null               |        |
|        |      (Never computes differences against zero or default estimates)   |        |
|        +-----------------------------------------------------------------------+        |
+-----------------------------------------------------------------------------------------+
```

---

### 4.5. Trace E: Deterministic Diurnal Ocean Physics

When scrubbing 4D temporal playback, the system applies physically motivated oceanographic diurnal modulation:

- **Sea Surface Temperature (SST)**: Sinusoidal insolation cycle peaking at 14:00 local solar time ($+0.42^\circ\text{C}$), cooling to minimum at 02:00 ($-0.42^\circ\text{C}$). Attenuates exponentially with depth across the mixed layer:
  $$\Delta T_{\text{diurnal}}(z) = \sin\left(\frac{h - 8}{24} \cdot 2\pi\right) \cdot A_T \cdot e^{-z / 45.0}$$
- **Dissolved Oxygen**: Photosynthetic production peaks at 16:00 ($+5.4\ \mu\text{mol/kg}$); nocturnal biological respiration reaches minimum at 04:00.
- **Chlorophyll-a**: Photochemical quenching dip at solar noon (~12:00–14:00) in surface waters ($z \le 120\text{ m}$), with nocturnal bloom recovery.
- **Tidal Current Harmonics**: Principal lunar semidiurnal tidal constituent ($M_2 \approx 12.42\text{ hours}$) modulating surface current magnitude and inducing clockwise tidal ellipse vector rotation.
- **Model Assimilation Phase Offset**: Numerical model variables are phase-shifted by $+0.75\text{ hours}$ to simulate prognostic assimilation cycle latency.

---

### 4.6. Trace F: 3D APEX Float Hydrodynamics & Volumetric Shader Pipeline

1. **Procedural Float Hull Assembly (`instruments.js`, `RenderInstrument.jsx`)**:
   The APEX Argo float is modeled to exact physical proportions using Three.js standard materials:
   - Marine Safety Yellow cylindrical hull (`#f6c500`, roughness: 0.28, metalness: 0.12).
   - Bottom buoyancy reservoir casing.
   - Anodized graphite collar and domed shoulder cap (`#18191c`).
   - White damping collar ring (`#f8f9fa`) designed to float at the exact waterline.
   - Top protective titanium CTD sensor cage and high-frequency telemetry antenna.
2. **GLSL Wave Superposition**:
   At the water surface, the float evaluates the ocean wave elevation equation at its $(x, z)$ position:
   $$y_{\text{wave}} = \sin(0.28x + 1.1t) \cdot \cos(0.18z + 1.1t) \cdot 0.38$$
   The hull executes organic pitch ($\theta_x$), roll ($\theta_z$), and gentle yaw ($\theta_y$) in response to passing wave crests.
3. **Hydrodynamic Subsurface Descent**:
   As the user moves the depth slider, the float plunges vertically through the water column:
   $$\text{influence}_{\text{surface}} = \max\left(0, 1 - \frac{z_{\text{target}}}{50}\right)$$
   Turbulent surface rocking smoothly decays, transitioning into laminar hydrodynamic descent with deep underwater exploration lighting (`argoDiveLight`).
4. **20°C Isotherm ($D_{20}$) Thermocline Extraction (`Ocean.jsx`)**:
   The 20°C isotherm represents the boundary of the oceanic thermocline. A custom GLSL shader extracts the $D_{20}$ depth matrix across the basin, generating an undulating, glowing 3D isosurface mesh with overlaid golden wireframe isolines.
5. **Geostrophic Vector Particles (`OceanVectorField.jsx`)**:
   Current vectors from NOAA CoastWatch altimetry are rendered as an animated instanced vector field. Particles advect along $(u, v)$ velocity vectors with velocity-mapped color ramps and arrowheads aligned to the local current heading.

---

## 5. Complete Backend API Reference

All backend routes are defined in [`backend/routes/validation.js`](file:///home/dracarys/Projects/practice-stuff/IntrestingProject/backend/routes/validation.js) and served under `/api/*`.

| Method | Endpoint                                      | Query Parameters                                     | Description                                                                                                                                                          |
| :----- | :-------------------------------------------- | :--------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/health`<br>`/health`                    | None                                                 | Pings upstream IFREMER ERDDAP metadata (`/info/ArgoFloats/index.json`) with an 8-second timeout. Reports latency, connection health, and model configuration status. |
| `GET`  | `/api/fleet`                                  | `lat_min`, `lat_max`, `lon_min`, `lon_max`, `days`   | Returns live active Argo floats in the requested bounding box. Deduplicated server-side via `orderByMax("platform_number,time")`.                                    |
| `GET`  | `/api/profile/:id`                            | `days` (default: 120)                                | Returns full vertical profile for float `:id` (Core physics levels + optional BGC levels if sensors are present).                                                    |
| `GET`  | `/api/bgc/profile/:id`                        | `days` (default: 365)                                | Returns standalone BGC vertical profile (`doxy, chla, bbp700, cdom, nitrate`) from `ArgoFloats-synthetic-BGC`.                                                       |
| `GET`  | `/api/bgc/floats`                             | `lat_min`, `lat_max`, `lon_min`, `lon_max`, `days`   | Discovers floats equipped with active BGC sensors in the regional bounding box.                                                                                      |
| `GET`  | `/api/argo/depth-slice`<br>`/api/depth-slice` | `platform_number`, `depth`, `timestamp`              | **2D-to-3D Slicing**: Slices float profile at requested depth via linear interpolation between measured levels.                                                      |
| `GET`  | `/api/model/point`                            | `lat`, `lon`, `depth`, `time`                        | Queries INCOIS ERDDAP GridDAP for co-located numerical model cell. Returns `available: false` if unconfigured.                                                       |
| `GET`  | `/api/model/datasets`                         | None                                                 | Utility discovery route: scans INCOIS ERDDAP for candidate 3D/4D gridded model products covering the Indian Ocean.                                                   |
| `GET`  | `/api/validation`<br>`/api/validate`          | `platform_number`, `depth`, `time`                   | **Co-Validation Engine**: Returns simultaneous observed vs. model variables, linear deltas ($\Delta$), QC flags, and provenance.                                     |
| `GET`  | `/api/currents`                               | `lat_min`, `lat_max`, `lon_min`, `lon_max`, `stride` | Decimated geostrophic surface current vectors $(u, v, \text{speed}, \text{direction})$ from NOAA CoastWatch altimetry.                                               |

### Sample JSON Payloads

#### `GET /api/argo/depth-slice?platform_number=2902351&depth=15`

```json
{
  "platform_number": "2902351",
  "requested_depth": 15,
  "timestamp": "2026-09-09T17:42:00Z",
  "interpolation": "linear between measured levels",
  "primary_oceanographic_variables": {
    "temperature_c": 28.14,
    "salinity_psu": 34.35,
    "doxy": 194.2,
    "chla": 0.38,
    "bbp700": null,
    "cdom": null,
    "nitrate": null
  },
  "available": {
    "temperature_c": true,
    "salinity_psu": true,
    "doxy": true,
    "chla": true,
    "bbp700": false
  },
  "units": {
    "temperature_c": "°C",
    "salinity_psu": "PSU",
    "doxy": "µmol/kg",
    "chla": "mg/m³"
  },
  "metadata": {
    "coordinates": { "lat": 11.68, "lon": 92.5 },
    "cycle_number": 148,
    "data_source": "ifremer-erddap"
  }
}
```

#### `GET /api/validation?platform_number=2902351&depth=15`

```json
{
  "platform_number": "2902351",
  "cycle_number": 148,
  "depth_level": "15m",
  "time": "2026-09-09T17:42:00Z",
  "location": { "lat": 11.68, "lon": 92.5 },
  "model": {
    "available": true,
    "source": "incois-erddap-griddap:INCOIS_ROMS_DAILY"
  },
  "variables": [
    {
      "key": "temp",
      "name": "Temp",
      "unit": "°C",
      "observed": 28.14,
      "model": 27.85,
      "delta": 0.29,
      "observed_source": "ifremer-erddap"
    },
    {
      "key": "psal",
      "name": "Salinity",
      "unit": "PSU",
      "observed": 34.35,
      "model": 34.4,
      "delta": -0.05,
      "observed_source": "ifremer-erddap"
    }
  ],
  "qc": "Argo QC flags 1, 2, 5 accepted; values outside physical range rejected"
}
```

---

## 6. Fail-Safe, Resilience & Offline Strategy

Hackathon demonstrations and maritime operational deployments frequently face throttled Wi-Fi, high-latency satellite uplinks, or temporary upstream ERDDAP outages. The platform employs an unshakeable resilience architecture:

```
                          REQUEST: Float Profile
                                    |
                                    v
                     +-----------------------------+
                     |  In-Memory Session Cache?   |---- YES ----> Return Cached Profile (0ms)
                     +-----------------------------+
                                    | NO
                                    v
                     +-----------------------------+
                     | Live ERDDAP Network Fetch   |
                     | (60s AbortController Timer) |---- 200 OK -> Return Live Stream & Update Cache
                     +-----------------------------+
                                    | Timeout / Offline / HTTP 5xx
                                    v
                     +-----------------------------+
                     | Real Captured Offline Cache |
                     | (real_argo_cache.json)      |---- MATCH --> Return Authentic Snapshot (Historical QC)
                     +-----------------------------+
                                    | Not in Offline Cache
                                    v
                     +-----------------------------+
                     | Explicit Error & Null State |
                     | (available: false)          |-------------> Render Quiet "—" (Zero Fabricated Data)
                     +-----------------------------+
```

1. **Session-Level In-Memory Cache**:
   Repeated inspections of the same float within one session hit module-level memory caches, preventing duplicate round-trips to scientific servers.
2. **Captured Real-Data Snapshot (`real_argo_cache.json`)**:
   If live ERDDAP drops, the client falls back to an offline snapshot captured directly from IFREMER on September 9, 2026. This contains authentic WMO floats (`2902351`, `2902352`, etc.) with genuine physical profiles.
3. **Zero-Fabrication Mandate**:
   Procedural number generation has been strictly deprecated. When an instrument or variable is genuinely unavailable, the UI presents clean dashes (`—`) and explicit provenance tags rather than deceiving reviewers with synthetic curves.

---

## 7. Project File Structure

```
IntrestingProject/
├── api/
│   └── index.js                        # Vercel serverless export for the Express backend
├── backend/
│   ├── routes/
│   │   └── validation.js               # Core Express router: /fleet, /profile, /depth-slice, /validation, /currents
│   ├── services/
│   │   ├── argoCore.js                 # Core Argo physics, cycle isolation, linear depth interpolation
│   │   ├── argoBgc.js                  # Biogeochemical Argo client (doxy, chla, bbp700, cdom, nitrate)
│   │   ├── currentsGrid.js             # NOAA CoastWatch satellite altimetry geostrophic currents
│   │   ├── erddap.js                   # Shared ERDDAP client: URL grammar builder, retries, timeouts
│   │   ├── modelGrid.js                # INCOIS ERDDAP GridDAP 4D model coordinate extractor
│   │   └── sanitize.js                 # Argo Table 2 QC flag validation + physical range filtering
│   ├── server.js                       # Express application server & /health check endpoint
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── 3d pages/
│   │   ├── components/                 # SideBySideValidationPanel, DepthSlider, ComparisonTable, CurrentsLegend
│   │   ├── panels/                     # TelemetryPanel, LeftSidebar, BottomDock, AnalyticsDock, TopNavbar
│   │   ├── argoFleetService.js         # Real-time fleet fetcher for 3D globe with deduplication
│   │   ├── deltaMath.js                # Delta engine (Δ = Obs - Model, vector circular math, diurnal cycles)
│   │   ├── instruments.js              # 3D procedural geometries for APEX float, Slocum glider, CTD rosette
│   │   ├── Ocean.jsx                   # Main 3D subsurface ocean simulation scene, shaders, lighting presets
│   │   ├── oceanDataService.js         # Multi-format data adapters (ERDDAP, NetCDF/OPeNDAP, ASCII Buoy parsers)
│   │   ├── orbitalDive.js              # GSAP two-phase planetary camera plunge controller
│   │   ├── RenderInstrument.jsx        # Three.js instanced rendering for oceanographic instruments
│   │   ├── useOceanStore.js            # Zustand single source of truth state store
│   │   ├── WorkspaceManager.jsx        # Multi-tab floating command center with draggable/resizable windows
│   │   └── World.js                    # 3D interactive Earth globe, cloud layers, station beacon sprites
│   ├── services/
│   │   ├── api.js                      # Base API configuration with environment-aware prefixing
│   │   ├── argoBackendService.js       # Debounced depth-slice caller with AbortController cancellation
│   │   ├── argoService.js              # In-situ float profile service with offline JSON cache fallback
│   │   └── argoTelemetryService.js     # Live surface telemetry fetcher
│   ├── src/assets/
│   │   └── real_argo_cache.json        # Authentic captured IFREMER ERDDAP snapshot
│   ├── index.html                      # 3D Planetary Globe entry point
│   ├── ocean.html                      # 3D Subsurface Ocean Command Center entry point
│   ├── vite.config.js                  # Multi-page build config, deduplication, /api & /erddap-proxy
│   ├── vercel.json                     # Frontend static hosting config
│   ├── package.json
│   └── .env.example
├── HelpingDocs/                        # Technical specifications & instrument tweak walkthroughs
├── .env.example                        # Root environment variable template
├── package.json                        # Root orchestration scripts (dev, build, lint)
├── render.yaml                         # Alternative Render.com deployment manifest
└── vercel.json                         # Monorepo build and serverless function rewrite rules
```

---

## 8. Environment Variables

Create `.env` files in the root, `backend/`, and `frontend/` directories:

### Backend Configuration (`backend/.env`)

```ini
PORT=8000
CORS_ORIGIN=*
ERDDAP_IFREMER_BASE=https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.json
ERDDAP_BGC_BASE=https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats-synthetic-BGC.json
ERDDAP_INCOIS_BASE=https://erddap.incois.gov.in/erddap
NOAA_CURRENTS_BASE=https://coastwatch.noaa.gov/erddap/griddap/noaacwBLENDEDNRTcurrentsDaily.json
ERDDAP_TIMEOUT_MS=60000
HEALTH_PING_TIMEOUT_MS=8000

# Optional: To wire an active INCOIS gridded model product
MODEL_DATASET_ID=
MODEL_VARIABLES=temperature:analysed_sst,salinity:so
MODEL_DIMENSIONS=time,depth,latitude,longitude
```

### Frontend Configuration (`frontend/.env`)

```ini
# Leave empty to use relative same-origin /api (recommended for Vite dev proxy & Vercel)
VITE_BACKEND_URL=
VITE_BACKEND_PROXY_TARGET=http://127.0.0.1:8000
VITE_ERDDAP_PROXY_PATH=/erddap-proxy
VITE_ERDDAP_PROXY_TARGET=https://erddap.ifremer.fr
```

---

## 9. Quick Start & Developer Guide

### 9.1. Installation

```bash
# Clone the repository
git clone https://github.com/mastertheblaster1231/IntrestingProject.git
cd IntrestingProject

# Install root, frontend, and backend dependencies
npm run install:all
```

### 9.2. Local Development

Run backend and frontend concurrently in two separate terminals:

```bash
# Terminal 1: Start Backend API (runs on port 8000)
npm --prefix backend start

# Terminal 2: Start Frontend Dev Server (runs on port 5173)
npm --prefix frontend run dev
```

Visit [http://localhost:5173/](http://localhost:5173/) in your browser.

### 9.3. Production Build & Verification

```bash
# Verify backend syntax
npm --prefix backend run lint

# Compile frontend production bundle
npm --prefix frontend run build
```

### 9.4. Browser Console Testing Utilities

Once the application is running in your browser, you can inspect and manipulate state directly from DevTools (F12):

```javascript
// Check real-time Argo fleet connection status
console.log(window.argoFleetStatus);

// Dynamically change the number of active floats rendered on the globe
window.reloadArgoFleet(50);

// Inspect the global oceanographic Zustand state store
console.log(window.oceanStore.getState());

// Inspect the currently selected float and model comparison residuals
console.log(window.oceanStore.getState().modelComparison);
```

---

## 10. Authors & Acknowledgments

- **Team Lead & Developers**: Smart India Hackathon Team
- **Problem Statement Owner**: Indian National Centre for Ocean Information Services (INCOIS), Hyderabad
- **Data Providers**:
  - IFREMER Argo Global Data Assembly Centre (GDAC)
  - Ministry of Earth Sciences (MoES), Government of India
  - NOAA CoastWatch / OceanWatch Program
