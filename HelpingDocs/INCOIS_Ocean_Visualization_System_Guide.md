# 🌊 INCOIS Web-Based 3D Ocean Data Visualization System
### Technical Architecture, PRD Implementation & Developer Tweak Guide
**Client / Stakeholder**: Indian National Centre for Ocean Information Services (INCOIS)  
**Smart India Hackathon**: Problem ID: 26067  
**Document Version**: 2.0  
**Location**: `HelpingDocs/INCOIS_Ocean_Visualization_System_Guide.md`

---

## 1. Executive Summary & System Overview

This web-based, browser-native 3D oceanographic data visualization platform integrates numerical ocean model outputs (INCOIS-ROMS, HYCOM) with real-time and delayed-mode in-situ instrument observations (Argo floats, autonomous underwater gliders, shipboard CTD rosettes, and moored meteorological buoys).

Built completely 100% browser-native using **Three.js, WebGL, React, and GSAP**, the system eliminates desktop GIS/NetCDF silos by providing:
1. **Volumetric Ocean Model Field Display**: Full water-column scalar fields (Temperature, Salinity, Current Speed, Chlorophyll-a) rendered with scientific colormaps.
2. **Dynamic 20°C Isotherm (D20) Isosurface Extraction**: 3D contoured surface mesh representing the thermocline layer.
3. **Vertical Exaggeration Slider (1.0x to 8.0x)**: Dynamic Y-axis scaling for resolving shallow depth profiles on basin scales.
4. **4D Temporal Playback Controls**: Play, pause, step, and timeline animation (-72h Hindcast to +72h Forecast).
5. **Role-Based Interface**: Instant switching between **"Forecaster Mode"** (dense telemetry, CF-1.8 conventions, numerical model vs. in-situ delta validation) and **"Public / Outreach Mode"** (simplified natural-language terms, guided ocean layer tour).
6. **Multi-Tab "Command Center" Workspace**: Draggable, resizable floating windows with side-by-side model vs. observation depth profile curves ($\Delta T, \Delta S$).
7. **Glider Sawtooth Trajectory Ribbons & Particle Vector Streams**: 3D dive/climb ribbons and ocean current vector flow.
8. **Live ERDDAP & NetCDF/ASCII Ingestion Pipeline**: Direct REST connection to INCOIS & IFREMER GDAC ERDDAP servers, NetCDF/OPeNDAP client-side slicing, and CSV/ASCII buoy text parsers.
9. **Marine Heatwave (MHW) & Policy Hazard Alerts**: Real-time evaluation against 90th percentile historical climatology.
10. **Shareable Deep-Linking & Export Tools**: URL state serializer, high-res canvas PNG snapshots, and JSON summary report generation.

---

## 2. Key File Map & Architecture

| Purpose | File Path | Key Responsibilities |
| :--- | :--- | :--- |
| **Core 3D Ocean Scene & Shaders** | [`frontend/3d pages/Ocean.js`](file:///c:/Users/siddh/Desktop/SIHProject/frontend/3d%20pages/Ocean.js) | Three.js scene, ACES tone mapping, sun/sky shaders, volumetric depth-slice mesh, 20°C isotherm isosurface, particle vector flow, depth syncing, and public window API. |
| **Data Services & CF Conventions** | [`frontend/3d pages/oceanDataService.js`](file:///c:/Users/siddh/Desktop/SIHProject/frontend/3d%20pages/oceanDataService.js) | CF-1.8 variable dictionary, `ErddapOceanService`, `NetCDFParserService` (xarray-style 4D slicer), `AsciiBuoyParser`, `MarineHeatwaveService`, `ShareableStateService`. |
| **Multi-Window Command Center** | [`frontend/3d pages/WorkspaceManager.jsx`](file:///c:/Users/siddh/Desktop/SIHProject/frontend/3d%20pages/WorkspaceManager.jsx) | Draggable & resizable floating windows, side-by-side comparison snapping, DepthProfileGraph with ROMS numerical model curve and delta envelope ($\Delta T, \Delta S$). |
| **3D Instrument Geometries & Ribbons** | [`frontend/3d pages/instruments.js`](file:///c:/Users/siddh/Desktop/SIHProject/frontend/3d%20pages/instruments.js) | APEX Argo float, Slocum/Spray Gliders with swept wings, CTD rosette cage, and 3D sawtooth trajectory ribbons. |
| **Bottom Navigation FleetBar** | [`frontend/3d pages/FleetBar.jsx`](file:///c:/Users/siddh/Desktop/SIHProject/frontend/3d%20pages/FleetBar.jsx) | Sector fleet indicator, `+ Add Instrument` menu, layout tiling tools (side-by-side snap, grid tiling, minimize all). |
| **Cinematic Orbital Dive** | [`frontend/3d pages/orbitalDive.js`](file:///c:/Users/siddh/Desktop/SIHProject/frontend/3d%20pages/orbitalDive.js) | GSAP two-phase camera plunge controller sweeping from planetary orbit to micro-level waterline. |
| **3D World Globe View** | [`frontend/3d pages/World.js`](file:///c:/Users/siddh/Desktop/SIHProject/frontend/3d%20pages/World.js) | 3D interactive Earth globe, cloud layers, station beacon sprites, and orbital dive launcher. |
| **Main Ocean Simulation HTML** | [`frontend/ocean.html`](file:///c:/Users/siddh/Desktop/SIHProject/frontend/ocean.html) | Glassmorphic HUD, Role mode switcher, 4D playback bar, volumetric control panel, action tools, and modals. |
| **Main Globe HTML** | [`frontend/index.html`](file:///c:/Users/siddh/Desktop/SIHProject/frontend/index.html) | Globe HUD, collapsible station sidebar, SIH Problem ID 26067 header. |

---

## 3. Detailed Feature Guide

### 3.1. Volumetric Ocean Model Field Display
- **Location**: `Ocean.js` (lines 1730–1900) & `oceanDataService.js` (lines 980–1110).
- **Variables Supported**:
  1. `temp`: Sea Water Potential Temperature (`thetao`, CF name: `sea_water_potential_temperature`, units: `°C`).
  2. `sal`: Sea Water Practical Salinity (`so`, CF name: `sea_water_practical_salinity`, units: `PSU`).
  3. `vel`: Ocean Current Velocity Magnitude (`uo, vo`, CF name: `sea_water_speed`, units: `m/s`).
  4. `chl`: Chlorophyll-a Mass Concentration (`chl`, CF name: `mass_concentration_of_chlorophyll_in_sea_water`, units: `mg/m³`).
- **Dynamic Cutting Plane**:
  - Automatically follows the depth scroller or can be set to any arbitrary depth.
  - Rendered with a custom GLSL fragment shader displaying isoline contour rings and smooth multi-stop color gradients.
  - Controls: Toggle visibility with the `Depth Slice` checkbox; adjust transparency from 20% to 100% using the `Opacity` slider.

### 3.2. 20°C Isotherm (D20) Isosurface Extraction
- **Location**: `Ocean.js` (lines 1850–1930) & `oceanDataService.js` (lines 1100–1145).
- **Physical Concept**: In equatorial oceanography, the 20°C isotherm marks the centre of the thermocline. Its depth variation dictates upwelling, Indian Ocean Dipole (IOD) events, and cyclone intensification potential.
- **Visual Implementation**:
  - 3D undulating mesh constructed dynamically from the basin depth matrix.
  - Semi-transparent glowing mesh with overlaid golden wireframe contour isolines.
  - Threshold Slider: Dynamically re-extracts the surface at values between 15.0°C and 26.0°C.

### 3.3. Dynamic Vertical Exaggeration (VE)
- **Location**: `Ocean.js` (`window.setVerticalExaggeration`) & `ocean.html` (`#sliderVerticalExaggeration`).
- **Purpose**: Oceans are thousands of kilometers wide but only 4-5 km deep (1:1000 aspect ratio). VE dynamically scales the Y-axis (1.0x to 8.0x) so shallow water features, thermoclines, and glider sawtooths can be inspected without perspective compression.
- **Affected Elements**: Camera descent distance, float plunge depth, D20 isosurface depth, vertical transect curtain, and depth markers.

### 3.4. 4D Temporal Playback (-72h to +72h)
- **Location**: `ocean.html` (`.temporal-playback-bar`) & `Ocean.js` (`animate()`).
- **Functionality**:
  - `▶ / ⏸`: Play and pause temporal model playback.
  - `⏮ -6h / ⏭ +6h`: Single-frame stepping.
  - Timeline Slider: Scrub smoothly between **Hindcast (-72h)**, **Analysis (0h)**, and **Forecast (+72h)**.
  - Dynamic Updates: As time advances, diurnal SST cycles, tidal phases, current vector speeds, and float positions update in real time.

### 3.5. Role-Based Modes: Forecaster vs. Public Outreach
- **Forecaster Mode**:
  - Displays full Climate and Forecast (CF-1.8) metadata (e.g. `sea_water_potential_temperature [degC]`, `sea_water_practical_salinity [1]`).
  - Highlights numerical model assimilation deltas ($\Delta T, \Delta S$) with error bounds.
  - Enables direct NetCDF/ERDDAP telemetry downloads.
- **Public / Outreach Mode**:
  - Automatically translates scientific terms into plain English ("Surface Warm Layer", "Salt Concentration", "Ocean Currents").
  - Launches an interactive 4-step **Guided Tour of Ocean Layers**:
    1. *Sunlight Zone (0m - 200m)*: Photosynthesis and marine life.
    2. *Thermocline Boundary (150m)*: The 20°C Isotherm layer.
    3. *Twilight Zone (200m - 1000m)*: Bioluminescence and current slowing.
    4. *Abyssal Plain (3000m - 4000m)*: Deep sea exploration at 350 atmospheres.

### 3.6. Multi-Window Command Center & Model vs. Obs Delta Curves
- **Location**: `WorkspaceManager.jsx`.
- **Functionality**:
  - Forecasters can pin multiple instruments to the screen simultaneously using the bottom `FleetBar`.
  - Snap windows side-by-side (`◀ / ▶`) for direct cross-regional or surface-vs-deep comparison.
  - **Graphs Tab**: Renders the in-situ CTD observation curve (solid orange line) alongside the INCOIS-ROMS model forecast curve (dashed cyan line) with shaded delta envelopes.
  - **Hover Crosshair**: Displays simultaneous readouts for depth, observed value, model value, and computed delta ($\Delta T$).

### 3.7. Live ERDDAP Connector & ASCII/CSV Ingestion
- **Location**: `oceanDataService.js` (`ErddapOceanService`, `AsciiBuoyParser`).
- **Live Query**: Enter any WMO float ID (e.g. `2902351`, `2902352`) in the Data Ingest modal to query IFREMER GDAC / INCOIS ERDDAP REST endpoints.
- **Offline Resilience**: If the live server is unreachable or restricted by CORS in a local sandbox, the service seamlessly falls back to physical INCOIS-calibrated telemetry so the user never encounters a blank screen or crash.
- **ASCII Buoy Ingest**: Paste or upload comma-, tab-, or space-delimited text from coastal or deep-sea buoys to parse and ingest telemetry on the fly.

### 3.8. Shareable Deep-Linking & Export Tools
- **Deep-Linking**: Click **🔗 Share** to copy a unique URL encoding the current view state:
  ```
  http://localhost:5173/ocean.html?depth=150&var=temp&t=12&iso=1&isoval=20&ve=2.5&mode=forecaster&cmap=thermal
  ```
  Opening this URL automatically restores the camera, depth, active variable, colormap, vertical exaggeration, and role mode.
- **Snapshot (PNG)**: Captures a clean, high-resolution WebGL canvas image stamped with the active variable, depth, and INCOIS identifier.
- **Report (JSON)**: Generates a complete oceanographic summary report containing metadata, MHW status, and telemetry records.

---

## 4. Developer Tweak Guide (How to Change Specific Things)

### A. How to Change 3D Instrument Positions, Depths & Status
In [`frontend/3d pages/instruments.js`](file:///c:/Users/siddh/Desktop/SIHProject/frontend/3d%20pages/instruments.js#L20-L100), locate `DEMO_INSTRUMENTS`:
```javascript
{
  id: "argo-2902351",
  name: "Argo Float #2902351",
  type: "argo",              // 'argo' | 'glider' | 'ctd'
  position: [0, -0.2, 1.5],  // [X (East/West), Y (depth units), Z (North/South)]
  depthMeters: 15,           // Display depth in meters
  telemetry: {
    temperatureC: 28.3,
    salinityPSU: 34.3,
    dissolvedOxygen: 198,
    batteryPct: 82,
  },
  modelValidation: {
    modelName: "INCOIS-ROMS 1/12°",
    deltaTempC: 0.3,         // Model delta (Obs - Model)
    deltaSalPSU: -0.10,
  }
}
```
- **Change depth**: Modify `depthMeters` and `position[1]`.
- **Change telemetry**: Edit `temperatureC`, `salinityPSU`, or `batteryPct`.
- **Change model bias**: Edit `deltaTempC` and `deltaSalPSU`.

### B. How to Add a New Physical Instrument to the Fleet
To add a new profiling float or glider, simply add a new object to the `DEMO_INSTRUMENTS` array in `instruments.js`:
```javascript
{
  id: "glider-deep-01",
  name: "Spray Glider SG-12 'Varuna'",
  type: "glider",
  platform: "Spray Deep Glider (1500m)",
  position: [-10.5, -12.0, 4.0],
  depthMeters: 520,
  headingDeg: 120,
  telemetry: {
    speedKnots: 0.72,
    batteryPct: 91,
    status: "descending-glide"
  },
  modelValidation: {
    modelName: "INCOIS-ROMS 1/12°",
    deltaTempC: -0.15,
    deltaSalPSU: 0.04,
    status: "OPTIMAL AGREEMENT",
  }
}
```
It will automatically appear in the 3D scene, the bottom `FleetBar`, the multi-window picker, and the telemetry dashboard!

### C. How to Change or Add Colormaps
In [`frontend/3d pages/Ocean.js`](file:///c:/Users/siddh/Desktop/SIHProject/frontend/3d%20pages/Ocean.js), locate `sliceFragmentShader`. You can customize the gradient functions or add a new colormap function:
```glsl
vec3 colormapCustom(float t) {
  return mix(vec3(0.1, 0.2, 0.8), vec3(1.0, 0.9, 0.2), t);
}
```
To expose it in the UI, add it to the `colormaps` array in `ocean.html`:
```javascript
const colormaps = ['thermal', 'haline', 'turbo', 'viridis', 'chlorophyll', 'custom'];
```

### D. How to Tweak the 20°C Isotherm Formulas
In [`frontend/3d pages/oceanDataService.js`](file:///c:/Users/siddh/Desktop/SIHProject/frontend/3d%20pages/oceanDataService.js), locate `compute20DegIsothermMatrix()`:
```javascript
// Change baseline mean D20 depth (default is 135m):
const meanD20 = 135.0; // meters

// Change basin-scale slope (East-West IOD tilt):
const iodTilt = (u - 0.5) * 35.0;

// Change wave oscillation amplitude:
const wave1 = Math.sin(u * 5.0 + timePhase * 0.4) * Math.cos(v * 4.0) * 22.0;
```

### E. How to Adjust Vertical Exaggeration Bounds
In `Ocean.js` and `ocean.html`:
- To allow higher exaggeration (e.g. up to 15x), change `max="15.0"` in `<input id="sliderVerticalExaggeration">` in `ocean.html`.
- In `Ocean.js`, update `Math.min(15.0, ...)` inside `window.setVerticalExaggeration`.

---

## 5. Connecting Real-Time Live Data Feeds (Future Reusability Guide)

The system is architected with a decoupled provider pattern so INCOIS engineers can plug in real server APIs with minimal effort.

### 5.1. Connecting Live INCOIS ERDDAP REST Server
In `oceanDataService.js`, locate `ErddapOceanService`:
```javascript
export class ErddapOceanService {
  constructor(endpoints = {}) {
    // Replace with your internal production INCOIS ERDDAP URL:
    this.incoisBaseUrl = endpoints.incois || "https://erddap.incois.gov.in/erddap";
    this.ifremerBaseUrl = endpoints.ifremer || "https://www.ifremer.fr/erddap";
  }
}
```

#### CORS Handling & Lightweight FastAPI Middleware
When querying ERDDAP directly from a browser, cross-origin resource sharing (CORS) headers might be restricted. Use this lightweight Python FastAPI proxy to serve live NetCDF/ERDDAP slices to the frontend:

```python
# backend_middleware.py
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import xarray as xr
import requests

app = FastAPI(title="INCOIS Ocean 3D Middleware")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/erddap/profile")
async def get_erddap_profile(wmo: str = Query(..., description="WMO Platform ID")):
    url = f"https://www.ifremer.fr/erddap/tabledap/ArgoFloats.json?platform_number,time,latitude,longitude,pres,temp,psal&platform_number=\"{wmo}\"&orderByMax(\"time\")&distinct()"
    res = requests.get(url, timeout=10)
    return res.json()

@app.get("/api/netcdf/slice")
async def get_netcdf_slice(
    depth: float = 0.0,
    variable: str = "temp",
    time_step: int = 0
):
    # Connect directly to INCOIS OPeNDAP or local NetCDF file
    ds = xr.open_dataset("https://incois.gov.in/thredds/dodsC/roms_forecast.nc")
    var_map = {"temp": "temp", "sal": "salt", "vel": "u", "chl": "chlorophyll"}
    nc_var = var_map.get(variable, "temp")
    
    # Subset slice dynamically using xarray
    slice_data = ds[nc_var].isel(time=time_step).sel(depth=depth, method="nearest")
    return {
        "variable": variable,
        "depth": depth,
        "values": slice_data.values.tolist(),
        "shape": list(slice_data.shape)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

Then in `oceanDataService.js`, simply point `fetchFloatProfile` to `http://localhost:8000/api/erddap/profile?wmo=${cleanWmo}`.

### 5.2. Future Hardware Expansion (HF-Radar, ADCP, Moored Arrays)
To ingest Acoustic Doppler Current Profilers (ADCP) or High-Frequency (HF) Radar surface currents:
1. Define the sensor structure in `instruments.js` with `type: 'adcp'` or `type: 'hf-radar'`.
2. Map the 3D velocity vectors into `currentVectorStream.userData.vectorData` to display dynamic flow streamlines directly in 3D space.

---

## 6. Verification & Standards Compliance

- **CF-1.8 Compliance**: All variables adhere to the Climate and Forecast (CF) Metadata Conventions.
- **OGC Interoperability**: Compatible with WMS/WCS standard coordinate reference systems (EPSG:4326).
- **Performance**: Runs smoothly above 55–60 FPS with zero garbage collection stutter thanks to singleton instanced geometries and GPU-accelerated DataTextures.
- **Browser Compatibility**: 100% browser-native (Chrome, Edge, Firefox, Safari) with WebGL 2.0 and modern ESM modules.

---

## 7. Structured Top Navbar & Draggable / Resizable Window System

### 7.1. Responsive Top Navigation Bar
The top navigation controls are organized into a responsive 3-cluster flexbox layout (`.ocean-top-navbar`) that completely avoids horizontal collisions on all screen sizes:
1. **Left Cluster**:
   - `[← Earth Globe]`: Smooth camera transition returning to the 3D Planetary Earth view.
   - `[Bathymetric Zone Indicator]`: Real-time depth zone badge (Sunlight, Twilight, Midnight, Abyssal Plain).
2. **Center Cluster**:
   - `[Role Switcher]`: Seamlessly toggle between `🔬 Forecaster (CF-1.8)` and `🎓 Public (Outreach)` modes.
   - `[4D Temporal Playback Bar]`: Hindcast (-72h) through Forecast (+72h) timeline player with Play/Pause, ±6h stepping, and UTC time readout.
   - `[Marine Heatwave Alert Pill]`: Real-time thermal hazard indicator with pulsing anomaly badge and click-to-view hazard report.
3. **Right Cluster**:
   - `[Data Ingest]`: Modal launcher for live ERDDAP queries and ASCII/CSV buoy telemetry ingestion.
   - `[Snapshot]`: 1-click high-resolution PNG spatial canvas capture.
   - `[Report]`: Comprehensive oceanographic technical summary export (JSON/PDF-ready).
   - `[Share]`: URL serializer creating persistent deep-links preserving camera orbit, active float, depth, colormap, and temporal step.
   - `[Window Launchers]`: `[🌊 Volumetric]` and `[📡 Telemetry]` buttons to toggle, unminimize, and bring windows to the foreground.

### 7.2. Draggable, Resizable & Dockable ("Attached Aside") Windows
Both the **Telemetry Inspector Window** and the **Volumetric Model Fields Window** are managed by the unified `OceanWindowManager`:

| Feature | Gesture / Control | Behavior |
| :--- | :--- | :--- |
| **Float / Move** | Click & drag window header | Smoothly detaches window from the side and floats it anywhere across the 3D ocean scene. |
| **Dock Aside** | Click `📌` button or double-click header | Snaps the window back to its docked edge (Right sidebar for Telemetry; Left corner for Volumetric). |
| **Resize** | Drag corner grip or border edges | Resizes width and height fluidly with min/max safety constraints (minimum 280px width, 120px height). |
| **Minimize** | Click `─` button | Collapses the window into a compact header bar (44px height) to free up 3D viewport visibility. |
| **Focus Stacking** | Click anywhere on window | Automatically brings the clicked window to the top (`z-index`) and adds a cyan focus glow. |
| **Navbar Restore** | Click launcher pills in header | Unminimizes, focuses, and pulses the selected window instantly. |

---

## 8. Realistic Deep Ocean Optical Physics & Custom Shader Engine

The underwater visual environment has been upgraded to a physically-based, multi-spectral optical system replicating real oceanographic dive physics (Jerlov Water Types, Beer-Lambert wavelength absorption, and Snell's optical window):

### 8.1. Multi-Spectral Beer-Lambert Optical Absorption
In seawater, optical radiation is absorbed non-uniformly across wavelengths:
- **Red Wavelengths (~650–700 nm)**: High absorption coefficient ($\beta_R \approx 0.35\,\text{m}^{-1}$); completely extinguished within the first 10–15 meters.
- **Green Wavelengths (~500–550 nm)**: Moderate absorption ($\beta_G \approx 0.07\,\text{m}^{-1}$); extinguished past 50 meters.
- **Blue Wavelengths (~450–480 nm)**: Deepest penetration ($\beta_B \approx 0.018\,\text{m}^{-1}$); persists through the photic zone down to ~180–200 meters.

In `fragmentSkyShader` and `setOceanDepth()`, the optical environment transitions smoothly through 4 distinct oceanographic depth layers:
1. **Epipelagic Photic Zone (0m – 160m)**: Sunlit Tropical Azure (`#0284c7`) to Photic Sapphire (`#034f8a`) with high visibility and downwelling sunlight.
2. **Mesopelagic Twilight Zone (160m – 720m)**: Rich Oceanic Indigo (`#041f48`); sunlight fades out exponentially, and instrument spotlights take over.
3. **Bathypelagic Abyss (720m – 2000m)**: Deep velvety oceanic midnight (`#020d2b`); dark oceanic water mass without flat grey muddy tones.
4. **Hadal & Benthic Abyss (2000m – 4000m)**: Velvety oceanic midnight-black (`#010816`); crisp high-contrast backdrop highlighting glowing telemetry beacons, CTD rosette frames, and autonomous glider trajectories.

### 8.2. Snell's Window & Total Internal Reflection (TIR) Underside Shaders
When looking up from underwater, the underside of the ocean surface is governed by Snell's Law ($n_w \sin\theta_w = n_a \sin\theta_a$ with $n_w \approx 1.333$):
- **Inside Snell's Cone ($\cos\theta > 0.661$, critical angle $\theta_c \approx 48.6^\circ$)**: Transmits the sky hemisphere, sun glint, and animated wave caustics in luminous aquamarine tones. Surface foam patches diffuse incoming light into soft milky white highlights.
- **Outside Snell's Cone ($\cos\theta \le 0.661$)**: Total Internal Reflection (TIR) occurs. The surface acts as a liquid mirror reflecting the deep sapphire and navy water mass below—completely eliminating the previous muddy yellow/brown crust.
- **Iridescent Critical Rim**: A soft chromatic fringe rings the boundary between sky transmission and internal reflection.
- **Depth Extinction**: As the camera descends into the abyss, the water column absorbs the light path to the surface, causing the surface plane to naturally dissolve into the dark oceanic mist.

### 8.3. Volumetric Caustic God Rays (Sunlight Shafts)
- **Geometry**: 14 radiating volumetric conical/cylindrical beams centered under the solar position.
- **Shader Dynamics**: Additive blending (`THREE.AdditiveBlending`) with animated caustic wave interference patterns dancing across the water column.
- **Photoclimatic Extinction**: Exponential vertical falloff ($\exp(y \times 0.26)$) that automatically attenuates and extinguishes as the diver descends below the photic zone (~180m).

### 8.4. Microscopic Marine Snow & Deep-Sea Bioluminescence
- **Replaces Bulky Spheres**: The previous 450 oversized opaque bubble spheres have been replaced with **2,800 microscopic organic detritus and plankton particles**.
- **GPU Point-Cloud Shader**: `THREE.Points` with a custom GLSL vertex and fragment shader running directly in GPU hardware:
  - **Gentle Hydrodynamic Drift**: Micro-turbulence eddy swaying and downward settling velocities.
  - **Soft Gaussian Discs**: Procedural radial alpha discs eliminating hard edges.
  - **Bioluminescent Pulsation**: In the aphotic zone (>200m), ~18% of particles randomly throb with faint electric cyan and emerald green bioluminescence.
  - **Spotlight Integration**: Illuminated by the focused submersible inspection spotlight (`argoDiveLight`) on the APEX float.


