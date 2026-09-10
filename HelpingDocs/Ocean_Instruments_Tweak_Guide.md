# 🌊 Ocean Dashboard & 3D Instruments: Developer Tweak Guide

A quick-reference cheat sheet for developers on where to tweak variables, customize 3D instrument shapes, adjust the half-screen ocean profile graph, and connect real-world APIs.

---

## 📁 Key File Map

| Purpose                                 | File Path                                                                                                                                      |
| :-------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| **3D Instrument Geometries & Batching** | [`MainProjectFiles/3d pages/instruments.js`](file:///c:/Users/siddh/Desktop/SIHProject/MainProjectFiles/3d%20pages/instruments.js)             |
| **React Three Fiber Component**         | [`MainProjectFiles/3d pages/RenderInstrument.jsx`](file:///c:/Users/siddh/Desktop/SIHProject/MainProjectFiles/3d%20pages/RenderInstrument.jsx) |
| **3D Ocean Scene, Shaders & Camera**    | [`MainProjectFiles/3d pages/Ocean.js`](file:///c:/Users/siddh/Desktop/SIHProject/MainProjectFiles/3d%20pages/Ocean.js)                         |
| **Data Service & Scientific Glossary**  | [`MainProjectFiles/3d pages/oceanDataService.js`](file:///c:/Users/siddh/Desktop/SIHProject/MainProjectFiles/3d%20pages/oceanDataService.js)   |
| **UI Layout, Half-Screen Card & HUD**   | [`MainProjectFiles/ocean.html`](file:///c:/Users/siddh/Desktop/SIHProject/MainProjectFiles/ocean.html)                                         |

---

## 1. 🛠️ Tweaking 3D Instruments (`instruments.js` / `RenderInstrument.jsx`)

### A. How to Add or Move Instruments in the 3D Scene

Locate `DEMO_INSTRUMENTS` in [`instruments.js`](file:///c:/Users/siddh/Desktop/SIHProject/MainProjectFiles/3d%20pages/instruments.js#L17-L115):

```javascript
{
  id: "argo-2902351",
  name: "Argo Float #2902351",
  type: "argo",              // 'argo' | 'glider' | 'ctd'
  position: [0, -15, 0],     // [X (left/right), Y (depth), Z (front/back)]
  headingDeg: 45,            // (Optional) Direction angle for gliders
  telemetry: {
    temperatureC: 28.3,
    salinityPSU: 34.3,
    dissolvedOxygen: 198,
    batteryPct: 82,
    cycle: 147
  }
}
```

- **Move left/right**: Adjust `position[0]` (negative is West/Left, positive is East/Right).
- **Change depth**: Adjust `position[1]` (depth is negative in 3D units; e.g., `-200` is 200m deep).
- **Move closer/further**: Adjust `position[2]` (positive is closer to the starting camera).

---

### B. Tweaking Shapes, Colors, and Sizes

All sizes and colors are centralized in `sharedGeometries` and `sharedMaterials`:

#### 1. Argo Float (Slim Vertical Cylinder)

- **Cylinder Dimensions**:
  ```javascript
  // CylinderGeometry(radiusTop, radiusBottom, height, radialSegments)
  argoCylinder: new THREE.CylinderGeometry(0.35, 0.35, 3.8, 24);
  ```
- **Hull Color**: Change `color: 0xff7a00` in `argoHull` (default: Safety Orange `#ff7a00`).
- **Antenna Height**: `new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8)`.

#### 2. Underwater Glider (Horizontal Capsule with Wings)

- **Fuselage Dimensions**:
  ```javascript
  // CapsuleGeometry(radius, length, capSubdivisions, radialSegments)
  gliderFuselage: new THREE.CapsuleGeometry(0.55, 3.2, 12, 24);
  ```
- **Fuselage Color**: Change `color: 0xffd000` in `gliderHull` (default: Submarine Yellow `#ffd000`).
- **Wing Span & Sweep**: Edit `createSweptWingGeometry()`:
  - `shape.lineTo(2.8, -1.8)`: Change `2.8` to increase/decrease wingspan.

#### 3. CTD Rosette (Wireframe Box Cage)

- **Box Cage Dimensions**:
  ```javascript
  // BoxGeometry(width, height, depth)
  ctdBoxGeometry: new THREE.BoxGeometry(2.4, 3.2, 2.4);
  ```
- **Wireframe Glow Color**: Change `color: 0x00e5ff` in `ctdWireframe` (default: Cyan `#00e5ff`).

---

### C. Scaling to Thousands of Instruments (Instanced Rendering)

To render hundreds to 10,000+ floats without dropping FPS:

```javascript
// Pure Three.js:
import {
  InstancedInstrumentCollection,
  DEMO_INSTRUMENTS,
} from "./instruments.js";

const fleet = new InstancedInstrumentCollection(scene);
fleet.loadInstruments(DEMO_INSTRUMENTS); // Uses 1 draw call per type!
```

```jsx
// React Three Fiber:
import { InstancedInstruments } from "./RenderInstrument";

<InstancedInstruments instruments={instrumentsList} />;
```

---

## 2. 📊 Tweaking the Vertical Ocean Profile Graph

### A. Half-Screen Window Dimensions

To adjust the size or position of the expanded profile window, edit `.argo-subtab-card.enlarged` in [`ocean.html`](file:///c:/Users/siddh/Desktop/SIHProject/MainProjectFiles/ocean.html#L744-L770):

```css
.argo-subtab-card.enlarged {
  width: 52vw !important; /* Fraction of screen width (e.g., 50vw - 60vw) */
  min-width: 640px !important; /* Minimum width on smaller displays */
  max-width: 980px !important; /* Maximum width on 4K displays */
  height: calc(100vh - 32px) !important;
  right: 20px !important; /* Distance from right window edge */
  top: 16px !important;
}
```

---

### B. Graph SVG Resolution & Scales

In [`Ocean.js`](file:///c:/Users/siddh/Desktop/SIHProject/MainProjectFiles/3d%20pages/Ocean.js#L640-L668), locate `renderProfileChart`:

```javascript
const w = 700; // SVG coordinate width
const h = 300; // SVG coordinate height
const padLeft = 65; // Space for depth labels (0m, 500m...)
const padRight = 30; // Space for right zone labels
const padTop = 25;
const padBottom = 30;
```

#### Changing Axis Ranges:

| Variable        | Code Location             | Default Range        | How to Tweak                                                |
| :-------------- | :------------------------ | :------------------- | :---------------------------------------------------------- |
| **Max Depth**   | `maxDepth = 2000`         | `0` to `2000 m`      | Change to `4000` for full abyssal depth profiles.           |
| **Temperature** | `Math.min(30, temp) / 30` | `0` to `30 °C`       | Change `30` if working with warmer/colder regions.          |
| **Salinity**    | `(sal - 33.5) / 2.5`      | `33.5` to `36.0 PSU` | Adjust min `33.5` and span `2.5` for brackish/polar waters. |
| **Oxygen**      | `Math.min(220, o2) / 220` | `0` to `220 μmol/kg` | Change `220` for high-latitude oxygen-rich water.           |

---

### C. Bathymetric Layer Depths (Epipelagic / Mesopelagic / Bathypelagic)

The colored bands and labels on the graph background are controlled by depth markers:

```javascript
const y0 = getY(0);
const y200 = getY(200); // Epipelagic boundary: 200m
const y1000 = getY(1000); // Mesopelagic / OMZ boundary: 1000m
const y2000 = getY(2000); // Bathypelagic boundary: 2000m
```

To change where the Oxygen Minimum Zone (OMZ) or Twilight zone starts, change the depth numbers (`200`, `1000`).

---

### D. Underwater Water Color & Deep Abyss Blue

When diving deep underground/underwater into the abyss, the water colors, atmospheric fog, and ambient lighting are controlled inside `window.setOceanDepth` in [`Ocean.js`](file:///c:/Users/siddh/Desktop/SIHProject/MainProjectFiles/3d%20pages/Ocean.js#L1705-L1750):

```javascript
// Luminous deep oceanic blue palette (keeps water richly blue instead of pitch black):
const deepAbyssZenith = new THREE.Color(0x0a325c); // Deep sapphire oceanic blue
const deepAbyssHorizon = new THREE.Color(0x062244); // Rich oceanic navy
const deepAbyssBottom = new THREE.Color(0x041933); // Deep abyssal dark blue (NOT black!)
const deepBlueFog = new THREE.Color(0x062040); // Underwater atmospheric fog
const deepOceanAmbient = new THREE.Color(0x1e4b7a); // Deep water ambient light
```

- **To make water even more vibrant blue**: Increase the cyan/blue channels (e.g., `0x0e4475` or `0x105590`).
- **To adjust underwater fog visibility**: Edit `scene.fog.density = 0.012 + fogRatio * 0.008` in `setOceanDepth`.

---

Hovering over the `ⓘ` button next to any parameter shows the scientific explanation card. To add or modify definitions, edit `PARAMETER_GLOSSARY` in [`oceanDataService.js`](file:///c:/Users/siddh/Desktop/SIHProject/MainProjectFiles/3d%20pages/oceanDataService.js#L14-L85):

```javascript
salinity: {
  name: "Practical Salinity",
  unit: "PSU",
  symbol: "💧",
  sensor: "Sea-Bird SBE 41CP Inductive Conductivity Cell",
  whatItMeans: "Concentration of dissolved inorganic mineral salts...",
  significance: "Coupled with temperature, salinity dictates seawater density...",
  normalRange: "32.0 – 36.5 PSU (Open Ocean Baseline)"
}
```

---

## 4. 🚀 Future API Integration (Hooking Up Live Data)

To feed live data from an external REST API, WebSocket, or NetCDF/GeoJSON backend:

1. Use the pre-built adapter `fetchInstrumentsFromAPI(url)` in [`instruments.js`](file:///c:/Users/siddh/Desktop/SIHProject/MainProjectFiles/3d%20pages/instruments.js#L360):

   ```javascript
   import {
     fetchInstrumentsFromAPI,
     InstancedInstrumentCollection,
   } from "./instruments.js";

   const liveData = await fetchInstrumentsFromAPI(
     "https://api.your-ocean-service.gov/floats",
   );
   fleet.loadInstruments(liveData);
   ```

2. The API schema only needs to map:
   - `type`: `'argo'` | `'glider'` | `'ctd'`
   - `position`: `[x, -depthMeters, z]`
   - `telemetry`: `{ temperatureC, salinityPSU, dissolvedOxygen, batteryPct }`

---

---

## 5. 🌊 Deep Underwater & Abyss Color Palette (Underground Shading)

When the device dives deep underground/underwater into the scene (e.g. 1000m to 4000m Hadal abyss), the colors are calibrated to keep the water a **rich, dark blueish oceanic color instead of pitch black**:

All variables are located in [`MainProjectFiles/3d pages/Ocean.js`](file:///c:/Users/siddh/Desktop/SIHProject/MainProjectFiles/3d%20pages/Ocean.js#L1765-L1825):

| Parameter          | Default Color | Description & Tweak Advice                                       |
| ------------------ | ------------- | ---------------------------------------------------------------- |
| `deepAbyssZenith`  | `0x185890`    | Looking straight up towards the water surface; downwelling light |
| `deepAbyssHorizon` | `0x0f4270`    | Looking horizontally through deep marine water column            |
| `deepAbyssBottom`  | `0x0a2f54`    | Looking down into the seabed / abyss; dark blueish (NEVER black) |
| `deepBlueFog`      | `0x0c3a66`    | Volumetric oceanic haze color in deep water                      |
| `deepOceanAmbient` | `0x22669e`    | Ambient illumination color keeping instruments visible           |
| `argoDiveLight`    | `0x38bdf8`    | Cyan-blue exploration spotlight on the diving float              |
| `abyssalSeabed`    | `0x092b4c`    | 3D ocean floor mesh at `y = -102.0` with glowing sonar grid      |

---

## 6. 🪂 Glider Sawtooth Trajectory Trail (3D Ribbon)

Underwater gliders (Slocum & Spray) utilize variable buoyancy engines to glide through the water column in an authentic undulating **sawtooth (V/W) dive profile**.

### Helper Function Usage (Three.js):

Imported from [`instruments.js`](file:///c:/Users/siddh/Desktop/SIHProject/MainProjectFiles/3d%20pages/instruments.js#L650):

```javascript
import { createGliderSawtoothTrail } from "./instruments.js";

const slocumTrail = createGliderSawtoothTrail({
  color: 0x00f0ff, // Glowing ribbon & line color (Hex or THREE.Color)
  cycles: 4, // Number of historical V/W dive cycles
  wavelength: 5.5, // Horizontal length per cycle
  diveAmplitude: 2.2, // Peak-to-trough vertical depth travel
  ribbonWidth: 0.28, // Width of the triangle strip ribbon
  heading: [0.85, 0.4], // Normalized [dx, dz] travel heading
});
scene.add(slocumTrail);

// In animate loop:
slocumTrail.userData.update(elapsedTime, gliderMesh.position);
```

### React Three Fiber Usage:

Imported from [`RenderInstrument.jsx`](file:///c:/Users/siddh/Desktop/SIHProject/MainProjectFiles/3d%20pages/RenderInstrument.jsx#L380):

```jsx
import { GliderSawtoothTrail } from "./RenderInstrument";

<GliderSawtoothTrail
  color="#00f0ff"
  cycles={4}
  wavelength={6.0}
  diveAmplitude={2.4}
  ribbonWidth={0.28}
  heading={[0.85, 0.4]}
/>;
```

---

## 7. 🌊 Current Vector Particle Stream (GPU Streamlines)

Visualizes real-time ocean current velocity and direction (e.g. $0.42\text{ m/s} \rightarrow \text{NE}$) around floats and instruments using a single high-performance `THREE.InstancedMesh`.

### Configuration Parameters ([`Ocean.js`](file:///c:/Users/siddh/Desktop/SIHProject/MainProjectFiles/3d%20pages/Ocean.js#L1425)):

```javascript
const currentVectorStream = createCurrentVectorStream({
  count: 260, // Number of streamline vectors (1 GPU draw call)
  speed: 0.42, // Live current speed in m/s (controls drift rate)
  headingDeg: 45, // Direction in degrees (45° = North-East, 0° = North, 90° = East)
});
```

- **Vertical Current Shear**: Streamlines in the upper 50m (Epipelagic) drift at full speed, while intermediate and deep streamlines naturally drift slower, matching physical ocean hydrodynamics.
- **Boundary Wrap-Around**: When streamlines cross the bounding box ($x \in [-36, 36]$, $z \in [-36, 36]$), they wrap around seamlessly with zero heap allocations.

---

## 8. 🤖 Model vs. Observation Delta Badge (Telemetry Sidebar)

Compares in-situ observations from Argo floats, gliders, and CTDs with numerical ocean circulation forecasts (e.g. **INCOIS-ROMS 1/12°**, **HYCOM**, **MERCATOR**):

$$\Delta T = T_{\text{obs}} - T_{\text{model}} \qquad \Delta S = S_{\text{obs}} - S_{\text{model}}$$

### Data Schema ([`instruments.js`](file:///c:/Users/siddh/Desktop/SIHProject/MainProjectFiles/3d%20pages/instruments.js#L35)):

```javascript
modelValidation: {
  modelName: "INCOIS-ROMS 1/12°",
  deltaTempC: 0.3,                 // Difference in °C (+ is warmer than model, - is cooler)
  deltaSalPSU: -0.10,              // Difference in PSU
  obsTemp: 28.3,
  modelTemp: 28.0,
  obsSal: 34.30,
  modelSal: 34.40,
  status: "OPTIMAL AGREEMENT",     // Operational assimilation flag
  confidenceScore: "98.4%",
  biasRating: "LOW BIAS"
}
```

### Color Coding:

- **$\Delta T$**: Green (`#10b981`) for warm/low bias, blue (`#38bdf8`) for cool.
- **$\Delta S$**: Green for positive, cyan/blue for freshening.
- **Pulsing Dot**: Visualizes active numerical data assimilation into the operational forecast pipeline.

---

## 9. 💡 Quick Tips for Developers

- **Test Depth Jump in Console**: Open browser DevTools on `http://localhost:5173/ocean.html` and run:
  ```javascript
  window.jumpToDepth(850); // Plunges camera to 850m
  window.jumpToDepth(3800); // Plunges camera to 3800m deep blue abyss & seabed
  ```
- **Cycle Sun Direction**: Run `window.cycleSolarTime()` in the console or click the sun button to test dawn, sunset, and night lighting.
- **Inspect Selected Instrument**: Meshes created via `createInstrumentObject(inst)` have `mesh.userData.instrumentData` attached, ready for Three.js raycasting on click.
- **Adjust Seabed Elevation**: In [`Ocean.js`](file:///c:/Users/siddh/Desktop/SIHProject/MainProjectFiles/3d%20pages/Ocean.js#L1460), tweak `seabedGroup.position.y = -102.0` to raise or lower the abyssal floor.

---

## 10. 🌍 8K Earth UV Wrap & Dynamic Atmospheric Fog (World.js)

The orbital view now features the **NASA Blue Marble 8K Day Texture** (`8k_earth_daymap.jpg`, 8192 × 4096 resolution) with GPU-accelerated anisotropic filtering and a dual-layer atmospheric simulation.

### Key Architecture:

1. **Earth Surface Mesh** (`GLOBE_RADIUS = 1.5`, `SphereGeometry(1.5, 128, 96)`):
   - High polygon tessellation prevents geometric facetting around the silhouette when zooming in.
   - `worldTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 16)`: Preserves sharp coastlines and topography at grazing viewing angles.
   - Standard equirectangular projection maps directly to geographic coordinates via:
     $$\phi = \frac{\text{lon} + 180}{360} \times 2\pi, \quad \theta = (90 - \text{lat}) \times \frac{\pi}{180}$$
     $$x = -r \cos(\phi)\sin(\theta), \quad y = r \cos(\theta), \quad z = r \sin(\phi)\sin(\theta)$$

2. **Dynamic Volumetric Fog & Clouds Shell** (`GLOBE_RADIUS * 1.008`):
   - **Procedural 3D Simplex FBM Noise**: Multi-octave GPU noise creates realistic drifting marine fog and cloud formations over oceans and continents without any image downsampling.
   - **Differential Atmospheric Rotation**: In `animate()`, `dynamicFogMesh.rotation.y += 0.0001` simulates trade winds and planetary parallax relative to the ground.
   - **Tuning Uniforms**:
     ```javascript
     dynamicFogMaterial.uniforms.uFogDensity.value = 0.42; // Fog thickness (0.1 to 0.7)
     dynamicFogMaterial.uniforms.uFogColor.value.set(0xa0e6ff); // Marine mist tint
     dynamicFogMaterial.uniforms.uSunColor.value.set(0xffffff); // Sunlit cloud highlight
     ```

3. **Atmospheric Rayleigh Rim Glow Halo** (`GLOBE_RADIUS * 1.022`):
   - **Inverted Fresnel Glow**: $\text{intensity} = \text{pow}(1.0 - \vec{N} \cdot \vec{V}, 3.2) \times 1.85$.
   - **Terminator Transition**: Automatically shifts from azure blue (`#0099ff`) on the sunward side to warm twilight amber (`#ff6b35`) along the day/night terminator.
   - **Tuning Uniforms**:
     ```javascript
     atmosphereMaterial.uniforms.uAtmospherePower.value = 3.2; // Edge sharpness
     atmosphereMaterial.uniforms.uAtmosphereIntensity.value = 1.85; // Brightness
     atmosphereMaterial.uniforms.uDayAtmosphereColor.value.set(0x0099ff);
     atmosphereMaterial.uniforms.uTwilightColor.value.set(0xff6b35);
     ```

4. **Performance & Raycasting**:
   - Both atmospheric shells have `mesh.raycast = () => {}`, ensuring clicks pass cleanly to buoy anchors (A1–A8) and the Earth's surface without raycast occlusion.
   - Shaders execute 100% on the GPU with zero CPU overhead, guaranteeing a smooth 60 FPS.

---

## 11. 📅 Temporal Ocean Data Query System (Date, Year & Time)

The dashboard allows users to select any **Date, Year, and Time (UTC)** or click seasonal presets to inspect oceanographic physical data variations across historical cycles and seasonal regimes.

### A. Important Variables & Schema Reference

When querying or extending the data service, the following variables are used:

| Variable Name           | Type     | Description & Typical Units                                  | Example Value                                   |
| :---------------------- | :------- | :----------------------------------------------------------- | :---------------------------------------------- |
| `date`                  | `string` | ISO Date format `YYYY-MM-DD`                                 | `"2024-07-22"`                                  |
| `time`                  | `string` | 24-hour UTC time `HH:mm`                                     | `"08:30"`                                       |
| `year`                  | `number` | Full Gregorian calendar year                                 | `2024`                                          |
| `month`                 | `number` | Month of year (1 to 12)                                      | `7` (July)                                      |
| `day`                   | `number` | Day of month (1 to 31)                                       | `22`                                            |
| `cycleNumber`           | `number` | Estimated Argo profiling cycle (~10 days/cycle)              | `142`                                           |
| `regime`                | `string` | Oceanographic seasonal regime identifier                     | `"SW Monsoon Upwelling & Rain Freshening"`      |
| `surfaceTempC`          | `number` | Sea Surface Temperature (SST) in °C                          | `27.3`                                          |
| `surfaceSalinityPSU`    | `number` | Practical Salinity at surface in PSU                         | `32.8`                                          |
| `dissolvedOxygenUmolKg` | `number` | Dissolved oxygen concentration in μmol/kg                    | `205`                                           |
| `chlorophyllMgM3`       | `number` | Photic zone Chlorophyll-a biomass in mg/m³                   | `1.01`                                          |
| `currentSpeedMs`        | `number` | Surface horizontal current drift velocity in m/s             | `0.64`                                          |
| `currentDirection`      | `string` | Compass heading of current drift                             | `"ENE"`                                         |
| `verticalProfile`       | `Array`  | Array of 12 depth levels (0m to 2000m) with CTD measurements | `[{ depthMeters: 0, temperatureC: 27.3, ... }]` |
| `trajectoryHistory`     | `Array`  | Past 5 surfacing cycle GPS fixes leading to queried date     | `[{ cycle: 142, date: "22 Jul 2024...", ... }]` |

---

### B. Seasonal Oceanographic Physics Implemented

1. **Southwest Monsoon (Jun–Sep, Months 6–9)**:
   - **Rain Freshening**: Monsoonal rainfall and river runoff drop surface salinity by ~1.5 PSU (fresh surface lens).
   - **Coastal Upwelling**: Wind-driven Ekman pumping brings cooler subsurface water to the surface (SST drops ~1.2°C).
   - **Phytoplankton Bloom**: Nutrient upwelling triggers high Chlorophyll blooms (~1.0–1.2 mg/m³).
   - **Current Acceleration**: Flows East/Northeast at high velocity (~0.65 m/s).

2. **Pre-Monsoon Thermal Peak (Mar–May, Months 3–5)**:
   - **Solar Heating**: Clear skies and peak insolation drive SST to annual highs (29.5°C–31.0°C).
   - **Oligotrophic**: Chlorophyll remains low (0.22–0.35 mg/m³).
   - **Stable Halocline**: Salinity baseline reaches 34.4–34.9 PSU.

3. **Northeast Monsoon / Winter (Nov–Feb, Months 11–2)**:
   - **Northern Convective Cooling**: SST cools by 1.8°C (down to 25.8°C–27.0°C).
   - **Reversed Currents**: Drift shifts to West/Southwest (WSW).

4. **Diurnal Cycle (Hour of day)**:
   - Midday solar skin layer warming (+0.35°C peak at 12:00–14:00 UTC) and nighttime radiative cooling.

---

### C. How to Use in JavaScript / DevTools Console

Developers can programmatically query ocean data by date and time in the browser console:

```javascript
// 1. Query by date and time
await window.queryOceanDataByDateTime("2024-07-22", "08:30");

// 2. Trigger a built-in seasonal preset
window.applyPresetTemporal("monsoon"); // SW Monsoon (Jul 2024)
window.applyPresetTemporal("premonsoon"); // Pre-Monsoon (May 2024)
window.applyPresetTemporal("winter"); // Winter Cooling (Jan 2024)
window.applyPresetTemporal("historical"); // Historical (Oct 2021)
window.applyPresetTemporal("latest"); // Reset to Real-Time Today

// 3. Directly access the service singleton
import {
  oceanDataService,
  getStationById,
} from "./3d pages/oceanDataService.js";
const station = getStationById("A7");
const data = await oceanDataService.getFloatDetails(station, {
  date: "2023-11-15",
  time: "14:00",
});
console.log(data.scientificData, data.verticalProfile);
```

---

### D. Connecting a Real Backend API in the Future

The architecture in [`oceanDataService.js`](file:///c:/Users/siddh/Desktop/SIHProject/MainProjectFiles/3d%20pages/oceanDataService.js) has been designed so you can switch from procedural mock data to a live API with a single configuration line:

```javascript
import { oceanDataService } from "./3d pages/oceanDataService.js";

// Switch provider to 'api' mode:
oceanDataService.setProvider("api", {
  baseUrl: "https://your-domain.gov.in/api/v1/argo", // e.g. INCOIS ERDDAP or GDAC
  apiKey: "your_optional_api_key_here",
});
```

When activated, `ApiArgoProvider` automatically sends standard temporal query parameters:

```http
GET /api/v1/argo/floats/2902351?date=2024-07-22&time=08:30
```

If the backend is offline or returns an HTTP error, the system **automatically falls back** to the procedural generator so the UI never crashes!
