# 3D APEX Argo Float & Ocean Scene: Complete Walkthrough Guide

This documentation provides a comprehensive guide to the **3D APEX Argo Profiling Float**, its ocean surface floating physics, depth-synchronized diving mechanism, and how to customize its position in the project.

---

## 1. File Locations

- **3D Ocean & Argo Float Logic**: [`frontend/3d pages/Ocean.js`](file:///c:/Users/siddh/Desktop/SIHProject/frontend/3d%20pages/Ocean.js)
- **Ocean Web View Page**: [`frontend/ocean.html`](file:///c:/Users/siddh/Desktop/SIHProject/frontend/ocean.html) and [`frontend/html viewer/ocean.html`](file:///c:/Users/siddh/Desktop/SIHProject/frontend/html%20viewer/ocean.html)
- **Local Dev Server**: `http://localhost:5173/ocean.html`

---

## 2. Where to Change the 3D Argo Float Position & Size

In [`Ocean.js`](file:///c:/Users/siddh/Desktop/SIHProject/frontend/3d%20pages/Ocean.js#L464-L472), locate the configuration block:

```javascript
// ----------------------------------------------------------------------------
// [USER CONFIGURATION] ARGO FLOAT POSITION & SCALE:
// You can change where the Argo float is located in the 3D scene here:
//   x: Horizontal axis (- is left, + is right)
//   y: Vertical waterline offset (0 is resting on the water surface)
//   z: Depth distance (lower number moves it further back away from camera)
// ----------------------------------------------------------------------------
export const ARGO_FLOAT_CONFIG = {
  x: 0.0,
  y: 0.0,
  z: 1.5,        // <--- [CHANGE POSITION HERE] Moved back to 1.5 (was 7.5). Set to 0.0 or -2.0 to move further back!
  scale: 1.0     // Overall scale of the float model
};
```

### Coordinate Reference:
| Property | Description | Example Values | Effect |
| :--- | :--- | :--- | :--- |
| **`z`** | Distance from camera / Depth | `1.5` *(Current)*<br>`0.0` or `-3.0`<br>`5.0` | Lower numbers push the float further back into the ocean view; higher numbers bring it closer to the camera. |
| **`x`** | Horizontal alignment | `0.0` *(Centered)*<br>`-2.5`<br>`+2.5` | Negative values move float left; positive values move float right. |
| **`y`** | Vertical base offset | `0.0` *(Waterline)* | Offsets default height relative to ocean water surface. |
| **`scale`** | Model scale | `1.0` *(Default)*<br>`0.75` / `1.3` | Shrinks or enlarges the entire 3D Argo float model proportionally. |

> [!TIP]
> You can also test changes live from your browser console by modifying `window.ARGO_FLOAT_CONFIG.z = 0.0;` or `window.ARGO_FLOAT_CONFIG.scale = 0.8;`.

---

## 3. 3D APEX Argo Model Structure & Materials

The float is procedurally modeled using Three.js standard materials (`MeshStandardMaterial`) to mirror the physical APEX Argo float without text/logos:

| Component | Three.js Geometry | Material & Finish | Color |
| :--- | :--- | :--- | :--- |
| **Lower & Upper Hull** | `CylinderGeometry(0.24, 0.24, ...)` | Marine yellow gloss (`roughness: 0.28`, `metalness: 0.12`) | Safety Yellow (`#f6c500`) |
| **Bottom Reservoir Base** | Flared `CylinderGeometry(0.32, 0.38, 0.30)` + chamfer | Heavy-duty yellow base casing | Gold Yellow (`#efbd00`) |
| **Hardware Collar & Seams** | `CylinderGeometry(...)` | Anodized aluminum / graphite (`metalness: 0.4`) | Black Graphite (`#18191c`) |
| **Damping Collar Ring** | `CylinderGeometry(0.46, 0.46, 0.038)` | Nautical white flange collar | Marine White (`#f8f9fa`) |
| **Domed Shoulder Cap** | Tapered cylinder + `SphereGeometry` dome | Dark graphite anodized aluminum | Graphite Black (`#18191c`) |
| **CTD Sensor Guard Cage** | Cylindrical tower + 4 outer protective ribs | Protective probe cage | Graphite Black (`#18191c`) |
| **CTD Intake Tube** | Cylindrical probe with top white cap | Polished metal / chrome (`metalness: 0.9`) | Chrome Silver (`#dde3ea`) |
| **Satellite Antenna** | Tapered rod ~2.5m tall with tip bead | High-frequency telemetry antenna | Deep Black (`#121214`) |

---

## 4. Ocean Surface Floating & Wave Physics

In `animate()` inside [`Ocean.js`](file:///c:/Users/siddh/Desktop/SIHProject/frontend/3d%20pages/Ocean.js):

1. **Wave Elevation Calculation**:
   The float evaluates the exact GLSL wave equation at its current `(x, z)` position:
   $$\text{waveElev} = \sin(x \cdot 0.28 + t \cdot 1.1) \cdot \cos(z \cdot 0.18 + t \cdot 1.1) \cdot 0.38$$
2. **Buoyant Waterline Placement**:
   The white stabilizing damping collar sits precisely at the waterline, with the lower pressure hull (~2.2 units) submerged and the antenna reaching upward into the air.
3. **Organic Swell Reaction**:
   Passing wave crests tilt the float dynamically along the roll ($Z$) and pitch ($X$) axes:
   - Roll: `rotation.z = sin(t * 1.4) * 0.065`
   - Pitch: `rotation.x = cos(t * 1.6) * 0.05`
   - Yaw: continuous gentle drifting rotation `rotation.y = t * 0.035`

---

## 5. Depth Scroller & Straight Diving Mechanism

When scrolling or typing a depth using the left-hand glassmorphism UI card (0m to 4000m):

1. **Synchronized Vertical Descent**:
   - The Argo float plunges straight down through the ocean water column:
     $$\text{argoDiveY} = -\text{ratio} \times \text{maxUnderwaterDepth}$$
     $$\text{argoFloat.position.y} = \text{ARGO\_FLOAT\_CONFIG.y} + \text{argoDiveY} + \text{waveMotion} + \text{underwaterCurrent}$$
   - **0m (Top level)**: Float is at the surface, bobbing actively with waves.
   - **100m – 4000m (Abyss)**: Float descends alongside the camera into the deep ocean.
2. **Hydrodynamic Wave-to-Current Transition**:
   - As the float submerges past the surface layer (`surfaceInfluence = max(0, 1 - ratio * 20)`), turbulent surface rocking smoothly decays, giving way to stable hydrodynamic descent with gentle deep currents.
3. **Camera Tracking**:
   - Orbit controls target tracks along the descent:
     $$\text{controls.target.y} = \text{targetCamY} - 1.2$$
     $$\text{controls.target.z} = \text{ARGO\_FLOAT\_CONFIG.z}$$
   - Allows full 360° orbital inspection around the diving float at any depth.
4. **Abyss Exploration Illumination**:
   - An underwater exploration point light (`argoDiveLight`) automatically activates in deep waters, casting realistic oceanic illumination across the float's yellow hull and CTD sensors.
5. **Procedural Rising Bubbles**:
   - Bubbles ascend from below the camera up toward the surface, shifting in color from crystalline blue to bioluminescent cyan in the deep abyss.
