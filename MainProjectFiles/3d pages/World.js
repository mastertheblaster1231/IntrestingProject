import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import earth8kMapUrl from "../Images/8k_earth_daymap.jpg";
import { oceanDataService } from "./oceanDataService.js";

// ============================================================================
// ⚙️ ANCHOR & BADGE SIZE CONFIGURATION
// ============================================================================
export const ANCHOR_SIZE_CONFIG = {
  maxScale: 0.8,
  minScale: 0.09,
  zoomOutDistance: 4.5,
  zoomInDistance: 1.85,
  zoomCurvePower: 2.0,
};
// ============================================================================

// 1. Scene setup with deep ocean space background
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020713);

const GLOBE_RADIUS = 1.5;

// 2. Camera setup - pre-oriented towards India & the Indian Ocean
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(0.9, 0.8, -4.0);

// 3. Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

// 4. Orbit Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1.8;
controls.maxDistance = 8.0;

// 5. Axes Helper (subtle)
const axesHelper = new THREE.AxesHelper(3);
axesHelper.visible = false; // Keep globe clean and cinematic
scene.add(axesHelper);

// 6. Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 1.15);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.85);
sunLight.position.set(5, 4, -4);
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x4080ff, 0.85);
fillLight.position.set(-5, -2, 4);
scene.add(fillLight);

// 7. World Globe with 8K texture
const textureLoader = new THREE.TextureLoader();
const worldTexture = textureLoader.load(earth8kMapUrl, (tex) => {
  tex.needsUpdate = true;
});
worldTexture.colorSpace = THREE.SRGBColorSpace;
worldTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 16);
worldTexture.minFilter = THREE.LinearMipmapLinearFilter;
worldTexture.magFilter = THREE.LinearFilter;
worldTexture.generateMipmaps = true;

// Pristine tessellation for 8K resolution: 128 x 96 segments
const globeGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 128, 96);
const globeMaterial = new THREE.MeshStandardMaterial({
  map: worldTexture,
  roughness: 0.65,
  metalness: 0.05,
});
export const globeMesh = new THREE.Mesh(globeGeometry, globeMaterial);
scene.add(globeMesh);

// ----------------------------------------------------------------------------
// 7a. Dynamic Procedural Volumetric Fog & Clouds Shell
// ----------------------------------------------------------------------------
const fogVertexShader = `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fogFragmentShader = `
  uniform float uTime;
  uniform vec3 uSunDirection;
  uniform float uFogDensity;
  uniform vec3 uFogColor;
  uniform vec3 uSunColor;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  // Optimized GPU 3D Simplex noise
  vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.52;
    vec3 shift = vec3(100.0);
    for (int i = 0; i < 4; ++i) {
      v += a * snoise(p);
      p = p * 2.05 + shift;
      a *= 0.48;
    }
    return v;
  }

  void main() {
    vec3 norm = normalize(vNormal);
    vec3 worldNorm = normalize(vWorldPosition);

    // Coordinate for planetary fog & clouds
    vec3 coord = worldNorm * 2.7;

    // Atmospheric circulation drift vectors
    vec3 drift1 = vec3(uTime * 0.011, uTime * 0.005, uTime * 0.008);
    vec3 drift2 = vec3(-uTime * 0.007, uTime * 0.012, -uTime * 0.006);

    float n1 = fbm(coord + drift1);
    float n2 = fbm(coord * 2.15 + drift2);

    float compositeNoise = n1 * 0.65 + n2 * 0.35;
    // Smooth threshold creates realistic ocean mist and swirling cloud formations
    float density = smoothstep(0.06, 0.54, compositeNoise + 0.12);

    // Sun directional diffuse lighting
    float sunDot = dot(norm, normalize(uSunDirection));
    float sunDiffuse = clamp(sunDot * 0.75 + 0.25, 0.0, 1.0);

    // Cloud color: soft luminous white illuminated by sun, with cool cyan-azure ambient tint
    vec3 finalColor = mix(uFogColor, uSunColor, sunDiffuse * 0.88);

    // Soft feathered alpha: leaves the underlying 8K Earth terrain razor-sharp while providing realistic fog
    float finalAlpha = clamp(density * uFogDensity * (0.35 + 0.65 * sunDiffuse), 0.0, 0.48);

    gl_FragColor = vec4(finalColor, finalAlpha);
  }
`;

const dynamicFogMaterial = new THREE.ShaderMaterial({
  vertexShader: fogVertexShader,
  fragmentShader: fogFragmentShader,
  uniforms: {
    uTime: { value: 0.0 },
    uSunDirection: { value: sunLight.position.clone().normalize() },
    uFogDensity: { value: 0.42 },
    uFogColor: { value: new THREE.Color(0xa0e6ff) },
    uSunColor: { value: new THREE.Color(0xffffff) },
  },
  transparent: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
});

const dynamicFogGeometry = new THREE.SphereGeometry(GLOBE_RADIUS * 1.008, 96, 64);
export const dynamicFogMesh = new THREE.Mesh(dynamicFogGeometry, dynamicFogMaterial);
dynamicFogMesh.raycast = () => {}; // Never block raycasting or buoy selection
scene.add(dynamicFogMesh);

// ----------------------------------------------------------------------------
// 7b. Realistic Atmospheric Rayleigh Rim Glow Layer (Orbital Halo)
// ----------------------------------------------------------------------------
const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const atmosphereFragmentShader = `
  uniform vec3 uSunDirection;
  uniform vec3 uDayAtmosphereColor;
  uniform vec3 uTwilightColor;
  uniform float uAtmospherePower;
  uniform float uAtmosphereIntensity;
  uniform float uTime;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    vec3 norm = normalize(vNormal);

    // Inverted Fresnel: highest at the grazing edge of the globe
    float rim = 1.0 - max(0.0, dot(viewDir, norm));
    float halo = pow(rim, uAtmospherePower) * uAtmosphereIntensity;

    // Sun directional alignment
    vec3 worldNorm = normalize(vWorldPosition);
    float sunDot = dot(worldNorm, normalize(uSunDirection));
    float sunFactor = smoothstep(-0.25, 0.45, sunDot);

    // Color transition from warm twilight amber at dusk line to brilliant azure in sunlight
    vec3 haloColor = mix(uTwilightColor, uDayAtmosphereColor, smoothstep(-0.1, 0.3, sunDot));

    // Subtle atmospheric shimmer
    float shimmer = 1.0 + 0.03 * sin(uTime * 1.8 + vWorldPosition.y * 3.5);

    float alpha = clamp(halo * (sunFactor * 0.85 + 0.15) * shimmer, 0.0, 0.92);

    gl_FragColor = vec4(haloColor, alpha);
  }
`;

const atmosphereMaterial = new THREE.ShaderMaterial({
  vertexShader: atmosphereVertexShader,
  fragmentShader: atmosphereFragmentShader,
  uniforms: {
    uTime: { value: 0.0 },
    uSunDirection: { value: sunLight.position.clone().normalize() },
    uDayAtmosphereColor: { value: new THREE.Color(0x0099ff) },
    uTwilightColor: { value: new THREE.Color(0xff6b35) },
    uAtmospherePower: { value: 3.2 },
    uAtmosphereIntensity: { value: 1.85 },
  },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const atmosphereGeometry = new THREE.SphereGeometry(GLOBE_RADIUS * 1.022, 96, 64);
const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
atmosphere.raycast = () => {}; // Never block raycasting
scene.add(atmosphere);

// 8. Argo / OON Observation Points Data
export const argoPoints = [
  {
    id: "A1",
    wmoId: 2902345, // Exact reference ID from user screenshot
    code: "AD07",
    lat: 12.35,
    lon: 78.62,
    sea: "Indian Ocean (Equatorial Basin)",
    type: "APEX Profiling Float",
  },
  {
    id: "A2",
    wmoId: 2902346,
    code: "AD08",
    lat: 12.0,
    lon: 68.5,
    sea: "Arabian Sea (Central Basin)",
    type: "Omni Meteorological Buoy",
  },
  {
    id: "A3",
    wmoId: 2902347,
    code: "CB02",
    altCode: "CALVAL / AD10",
    lat: 10.3,
    lon: 72.5,
    sea: "Lakshadweep (Agatti / Kavaratti)",
    type: "Coastal & CalVal Buoy",
  },
  {
    id: "A4",
    wmoId: 2902348,
    code: "AD09",
    lat: 8.2,
    lon: 73.3,
    sea: "South Lakshadweep / Minicoy Channel",
    type: "Deep Ocean Buoy",
  },
  {
    id: "A5",
    wmoId: 2902349,
    code: "CB06",
    lat: 13.1,
    lon: 80.3,
    sea: "Bay of Bengal (Chennai Offshore)",
    type: "Coastal Moored Buoy",
  },
  {
    id: "A6",
    wmoId: 2902350,
    code: "BD13",
    lat: 14.0,
    lon: 87.0,
    sea: "Bay of Bengal (Central Basin)",
    type: "Deep Sea Meteorological Buoy",
  },
  {
    id: "A7",
    wmoId: 2902351,
    code: "CB01",
    lat: 11.6,
    lon: 92.5,
    sea: "Andaman Sea (Port Blair)",
    type: "Coastal Observation Buoy",
  },
  {
    id: "A8",
    wmoId: 2902352,
    code: "BD12",
    lat: 10.5,
    lon: 94.0,
    sea: "South Andaman Sea",
    type: "Deep Sea Moored Buoy",
  },
];

// Helper: Convert Lat/Lon to 3D Cartesian Vector on Three.js Sphere
export function latLonToVector3(lat, lon, radius) {
  const phi = ((lon + 180) / 360) * 2 * Math.PI;
  const theta = (90 - lat) * (Math.PI / 180);

  const x = -radius * Math.cos(phi) * Math.sin(theta);
  const y = radius * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);

  return new THREE.Vector3(x, y, z);
}

// Convert 3D Cartesian Vector back to Lat/Lon
export function vector3ToLatLon(vec, radius = GLOBE_RADIUS) {
  const norm = vec.clone().normalize();
  const lat = 90 - Math.acos(Math.max(-1, Math.min(1, norm.y))) * (180 / Math.PI);
  let lon = Math.atan2(norm.z, -norm.x) * (180 / Math.PI) - 180;
  while (lon < -180) lon += 360;
  while (lon > 180) lon -= 360;
  return { lat, lon };
}

// Function to generate billboard Sprite with ⚓ emoji and A1, A2... badge
function createAnchorSprite(id, code) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Anchor ⚓ Emoji
  ctx.font = '76px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 240, 255, 0.85)";
  ctx.shadowBlur = 14;
  ctx.fillText("⚓", 128, 76);

  // 2. Compact Name badge under the anchor
  ctx.shadowBlur = 6;
  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
  ctx.fillStyle = "rgba(6, 18, 38, 0.92)";
  const badgeWidth = 116;
  const badgeHeight = 44;
  const badgeX = 128 - badgeWidth / 2;
  const badgeY = 138;

  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 10);
  ctx.fill();

  ctx.strokeStyle = "#00e5ff";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Primary Name: A1, A2...
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.font = 'bold 22px "Segoe UI", Inter, sans-serif';
  ctx.fillText(id, 128, badgeY + 17);

  // Secondary buoy code: AD07, BD13...
  ctx.fillStyle = "#64d2ff";
  ctx.font = 'bold 12px "Segoe UI", Inter, sans-serif';
  ctx.fillText(code, 128, badgeY + 33);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });

  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(ANCHOR_SIZE_CONFIG.maxScale, ANCHOR_SIZE_CONFIG.maxScale, 1);
  return sprite;
}

// Group to hold all interactive markers
const markersGroup = new THREE.Group();
scene.add(markersGroup);

const clickableSprites = [];
const beaconMeshes = [];
let selectedStationId = null;
let currentLoadedData = null;

argoPoints.forEach((point) => {
  const surfacePos = latLonToVector3(point.lat, point.lon, GLOBE_RADIUS);
  const markerPos = latLonToVector3(point.lat, point.lon, GLOBE_RADIUS + 0.14);

  // 1. Surface beacon dot
  const defaultColor = point.id === "A3" ? 0xff7b00 : 0x00f0ff;
  const beaconGeo = new THREE.SphereGeometry(0.022, 16, 16);
  const beaconMat = new THREE.MeshBasicMaterial({ color: defaultColor });
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.position.copy(surfacePos);
  beacon.userData = { id: point.id, defaultColor: defaultColor };
  markersGroup.add(beacon);
  beaconMeshes.push(beacon);

  // 2. Connecting stem line
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    surfacePos,
    markerPos,
  ]);
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.75,
    linewidth: 2,
  });
  const stem = new THREE.Line(lineGeo, lineMat);
  markersGroup.add(stem);

  // 3. Floating billboard anchor sprite
  const sprite = createAnchorSprite(point.id, point.code);
  sprite.position.copy(markerPos);
  sprite.userData = point;
  markersGroup.add(sprite);
  clickableSprites.push(sprite);
});

// Smooth Camera Transition State
let cameraTransition = null;

function animateCameraTo(targetCamPos, targetLookAt = new THREE.Vector3(0, 0, 0), duration = 900) {
  cameraTransition = {
    startPos: camera.position.clone(),
    endPos: targetCamPos.clone(),
    startLookAt: controls.target.clone(),
    endLookAt: targetLookAt.clone(),
    startTime: performance.now(),
    duration: duration,
  };
}

// Renders the Vertical Profile Chart in SVG
function renderVerticalProfileChart(profileData) {
  const svg = document.getElementById("profileChartSvg");
  if (!svg) return;

  const width = 310;
  const height = 180;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 15;
  const padBottom = 35;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Ranges:
  // Depth: 0 to 2000m
  // Temperature: 0 to 40°C (ticks at 0, 10, 20, 30)
  // Salinity: 32 to 36 PSU (ticks at 32, 34, 36)
  const maxDepth = 2000;
  const minTemp = 0;
  const maxTemp = 36;
  const minSal = 32.0;
  const maxSal = 36.5;

  const depthToY = (d) => padTop + (d / maxDepth) * chartH;
  const tempToX = (t) => padLeft + ((t - minTemp) / (maxTemp - minTemp)) * chartW;
  const salToX = (s) => padLeft + ((s - minSal) / (maxSal - minSal)) * chartW;

  let gridSvg = "";
  // Depth horizontal grid lines (0, 500, 1000, 1500, 2000)
  const depthTicks = [0, 500, 1000, 1500, 2000];
  depthTicks.forEach((d) => {
    const y = depthToY(d);
    gridSvg += `<line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="rgba(255,255,255,0.07)" stroke-dasharray="2,2"/>`;
    gridSvg += `<text x="${padLeft - 6}" y="${y + 3}" fill="#6b7c93" font-size="9" text-anchor="end" font-family="'Space Mono', monospace">${d}</text>`;
  });

  // Vertical axis lines
  gridSvg += `<line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + chartH}" stroke="rgba(255,255,255,0.15)"/>`;
  gridSvg += `<line x1="${padLeft}" y1="${padTop + chartH}" x2="${width - padRight}" y2="${padTop + chartH}" stroke="rgba(255,255,255,0.15)"/>`;

  // Bottom Ticks for Temperature (orange)
  const tempTicks = [0, 10, 20, 30];
  tempTicks.forEach((t) => {
    const x = tempToX(t);
    gridSvg += `<line x1="${x}" y1="${padTop + chartH}" x2="${x}" y2="${padTop + chartH + 4}" stroke="#ff7a00" stroke-width="1.2"/>`;
    gridSvg += `<text x="${x}" y="${padTop + chartH + 14}" fill="#ff9436" font-size="8.5" text-anchor="middle" font-family="'Space Mono', monospace">${t}</text>`;
  });

  // Bottom Ticks for Salinity (cyan/blue)
  const salTicks = [32, 34, 36];
  salTicks.forEach((s) => {
    const x = salToX(s);
    gridSvg += `<text x="${x}" y="${padTop + chartH + 26}" fill="#38bdf8" font-size="8.5" text-anchor="middle" font-family="'Space Mono', monospace">${s}</text>`;
  });

  // Build SVG Paths
  let tempPathD = "";
  let salPathD = "";
  let pointsSvg = "";

  profileData.forEach((pt, idx) => {
    const y = depthToY(pt.depthMeters);
    const xTemp = tempToX(pt.temperatureC);
    const xSal = salToX(pt.salinityPSU);

    if (idx === 0) {
      tempPathD += `M ${xTemp} ${y}`;
      salPathD += `M ${xSal} ${y}`;
    } else {
      tempPathD += ` L ${xTemp} ${y}`;
      salPathD += ` L ${xSal} ${y}`;
    }

    // Interactive point circles
    pointsSvg += `
      <circle cx="${xTemp}" cy="${y}" r="3.2" fill="#ff7a00" stroke="#020713" stroke-width="1.5" class="chart-point" data-type="Temp" data-val="${pt.temperatureC}°C" data-depth="${pt.depthMeters}m" />
      <circle cx="${xSal}" cy="${y}" r="3.2" fill="#38bdf8" stroke="#020713" stroke-width="1.5" class="chart-point" data-type="Salinity" data-val="${pt.salinityPSU} PSU" data-depth="${pt.depthMeters}m" />
    `;
  });

  svg.innerHTML = `
    ${gridSvg}
    <path d="${tempPathD}" fill="none" stroke="#ff7a00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    <path d="${salPathD}" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    ${pointsSvg}
  `;

  // Attach hover tooltips on chart points
  svg.querySelectorAll(".chart-point").forEach((pt) => {
    pt.addEventListener("mouseenter", (e) => {
      const type = pt.getAttribute("data-type");
      const val = pt.getAttribute("data-val");
      const depth = pt.getAttribute("data-depth");
      pt.setAttribute("r", "5.5");

      const tip = document.getElementById("chartMiniTip");
      if (tip) {
        tip.textContent = `${type}: ${val} @ ${depth}`;
        tip.style.opacity = "1";
      }
    });
    pt.addEventListener("mouseleave", () => {
      pt.setAttribute("r", "3.2");
      const tip = document.getElementById("chartMiniTip");
      if (tip) tip.style.opacity = "0";
    });
  });
}

// Populates all tabs inside the Argo Float Data Panel
function updateArgoFloatUI(data) {
  currentLoadedData = data;

  // 1. Header & ID
  const elFloatId = document.getElementById("argoFloatId");
  const elStatusPill = document.getElementById("argoStatusPill");
  if (elFloatId) elFloatId.textContent = data.floatId;
  if (elStatusPill) elStatusPill.textContent = data.status;

  // 2. Overview tab properties
  const elLocation = document.getElementById("argoValLocation");
  const elLastObs = document.getElementById("argoValLastObs");
  const elMaxDepth = document.getElementById("argoValMaxDepth");
  const elMeasurements = document.getElementById("argoValMeasurements");
  if (elLocation) elLocation.textContent = data.locationFormatted;
  if (elLastObs) elLastObs.textContent = data.lastObservation;
  if (elMaxDepth) elMaxDepth.textContent = `${data.maxDepthMeters} m`;
  if (elMeasurements) elMeasurements.textContent = data.measurements;

  // 3. Latest Observation cards (Surface Temp & Salinity)
  const elSurfaceTemp = document.getElementById("argoSurfaceTemp");
  const elSurfaceSal = document.getElementById("argoSurfaceSalinity");
  if (elSurfaceTemp) elSurfaceTemp.textContent = `${data.latestObservation.temperatureC} °C`;
  if (elSurfaceSal) elSurfaceSal.textContent = `${data.latestObservation.salinityPSU} PSU`;

  // 4. Vertical Profile Chart
  renderVerticalProfileChart(data.verticalProfile);

  // 5. Profile Tab (Table & CTD details)
  const elProfileTable = document.getElementById("argoProfileTableBody");
  if (elProfileTable) {
    elProfileTable.innerHTML = data.verticalProfile
      .map(
        (row) => `
        <tr>
          <td>${row.depthMeters} m</td>
          <td style="color:#ff9436;">${row.temperatureC.toFixed(2)} °C</td>
          <td style="color:#38bdf8;">${row.salinityPSU.toFixed(2)}</td>
          <td>${row.pressureDbar} dbar</td>
          <td>${row.densitySigmaTheta}</td>
        </tr>
      `,
      )
      .join("");
  }
  const elCycleNum = document.getElementById("argoCycleNum");
  const elBattery = document.getElementById("argoBattery");
  const elTrans = document.getElementById("argoTransmission");
  if (elCycleNum) elCycleNum.textContent = `Cycle #${data.cycleNumber}`;
  if (elBattery) elBattery.textContent = data.batteryVoltage;
  if (elTrans) elTrans.textContent = data.transmissionStatus;

  // 6. Location Tab
  const elBasin = document.getElementById("argoSeaBasin");
  const elCoords = document.getElementById("argoExactCoords");
  const elDrift = document.getElementById("argoDriftSpeed");
  const elDistance = document.getElementById("argoDistance24h");
  if (elBasin) elBasin.textContent = data.coordinates.seaBasin;
  if (elCoords) elCoords.textContent = `${data.coordinates.lat.toFixed(4)}°N, ${data.coordinates.lon.toFixed(4)}°E`;
  if (elDrift) elDrift.textContent = `${data.drift.speedKnots} kts @ ${data.drift.bearingDegrees}°`;
  if (elDistance) elDistance.textContent = `${data.drift.estimatedDistance24hKm} km / 24h`;

  // 7. Raw Data Tab (JSON View & API Info)
  const elRawJson = document.getElementById("argoRawJsonView");
  const elApiEndpoint = document.getElementById("argoApiEndpoint");
  if (elRawJson) {
    elRawJson.textContent = JSON.stringify(data, null, 2);
  }
  if (elApiEndpoint) {
    elApiEndpoint.textContent = data.apiMetadata.apiEndpointTemplate;
  }

  // Ensure panel is visible
  const panel = document.getElementById("argoFloatPanel");
  if (panel) {
    panel.classList.add("visible");
  }
}

// Selection function: Turns clicked station's dot to GREEN (#00ff66) & fetches data
export async function selectStation(id) {
  selectedStationId = id;
  window.selectedStationId = id;

  // Turn selected station's dot GREEN, reset others to default
  beaconMeshes.forEach((b) => {
    if (b.userData.id === id) {
      b.material.color.setHex(0x00ff66);
    } else {
      b.material.color.setHex(b.userData.defaultColor);
    }
  });

  // Highlight active card in sidebar
  document.querySelectorAll(".station-card").forEach((card) => {
    if (card.getAttribute("data-id") === id) {
      card.classList.add("active");
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      card.classList.remove("active");
    }
  });

  // Fetch procedural (or API) data asynchronously
  const point = argoPoints.find((p) => p.id === id) || { id };
  const floatData = await oceanDataService.getFloatDetails(point);
  updateArgoFloatUI(floatData);
}

// Transition from 3D Earth Globe to 3D Ocean view for a selected float
export function transitionToOcean(id) {
  const overlay = document.getElementById("transitionOverlay");
  if (overlay) overlay.classList.add("active");
  setTimeout(() => {
    window.location.href = `/ocean.html?id=${encodeURIComponent(id || selectedStationId || 'A1')}`;
  }, 380);
}
window.transitionToOcean = transitionToOcean;

// 9. Interactive Raycasting & Mouse Events
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tooltip = document.getElementById("tooltip");

function onPointerMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(clickableSprites);

  if (intersects.length > 0) {
    document.body.style.cursor = "pointer";
    const target = intersects[0].object;
    const data = target.userData;

    if (tooltip) {
      tooltip.style.display = "block";
      tooltip.style.left = `${event.clientX + 16}px`;
      tooltip.style.top = `${event.clientY - 24}px`;
      tooltip.innerHTML = `
        <div class="tooltip-header">⚓ ${data.id} - ${data.code}</div>
        <div class="tooltip-body">
          <div><strong>Basin:</strong> ${data.sea}</div>
          <div><strong>Lat/Lon:</strong> ${data.lat.toFixed(2)}°N, ${data.lon.toFixed(2)}°E</div>
          <div><strong>Type:</strong> ${data.type}</div>
          <div style="margin-top:4px; color:#00ff66;">✦ Click to inspect Argo Float vertical profile</div>
        </div>
      `;
    }
  } else {
    document.body.style.cursor = "default";
    if (tooltip) tooltip.style.display = "none";
  }
}

function onPointerClick(event) {
  // Ignore clicks on HUD UI panels and buttons
  if (
    event.target.closest &&
    event.target.closest(".hud-sidebar, .hud-header, .sidebar-toggle-btn, .argo-float-panel, .globe-nav-controls")
  ) {
    return;
  }

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  
  // 1. Check if user clicked an anchor sprite
  const intersects = raycaster.intersectObjects(clickableSprites);
  if (intersects.length > 0) {
    const target = intersects[0].object;
    const data = target.userData;
    selectStation(data.id);
    // Transition to 3D Ocean view for this Argo float
    transitionToOcean(data.id);
    return;
  }

  // 2. Check if user clicked the 3D globe sphere itself
  const globeHits = raycaster.intersectObject(globeMesh);
  if (globeHits.length > 0) {
    const hitPoint = globeHits[0].point;
    const coords = vector3ToLatLon(hitPoint, GLOBE_RADIUS);

    // Find nearest argo point
    let nearest = null;
    let minDist = Infinity;
    argoPoints.forEach((pt) => {
      const d = Math.hypot(pt.lat - coords.lat, pt.lon - coords.lon);
      if (d < minDist) {
        minDist = d;
        nearest = pt;
      }
    });

    if (nearest && minDist < 18) {
      selectStation(nearest.id);
    } else {
      // Procedurally generate data for this clicked oceanic spot!
      const dynamicPoint = {
        id: "SURF",
        wmoId: 2900000 + Math.floor(Math.abs(coords.lat * 100) + Math.abs(coords.lon * 100)),
        code: "LOC",
        lat: coords.lat,
        lon: coords.lon,
        sea: coords.lat > 0 ? (coords.lon < 77 ? "Arabian Sea" : "Bay of Bengal") : "Equatorial Indian Ocean",
        type: "Ocean Profile Probe"
      };
      oceanDataService.getFloatDetails(dynamicPoint).then(updateArgoFloatUI);
    }
  }
}

window.addEventListener("pointermove", onPointerMove);
window.addEventListener("click", onPointerClick);

// Focus function when clicking a point in the list
window.focusOnPoint = function (id) {
  selectStation(id);

  const pt = argoPoints.find((p) => p.id === id);
  if (!pt) return;

  // Preserve the user's current zoom distance - NEVER zoom the Earth out!
  const currentDist = camera.position.distanceTo(controls.target);
  // Keep the current zoom level, or gently pull in closer if currently very far out
  const targetDist = Math.min(currentDist, 2.6);

  const dirVec = latLonToVector3(pt.lat, pt.lon, 1.0).normalize();
  const targetCam = dirVec.multiplyScalar(targetDist);

  animateCameraTo(
    targetCam,
    new THREE.Vector3(0, 0, 0),
    600,
  );
};

// ============================================================================
// 🧭 GLOBE NAVIGATION CONTROLS (Left Dock)
// ============================================================================
window.navResetNorth = function () {
  cameraTransition = null;
  const currentDist = camera.position.distanceTo(controls.target);
  const targetCam = new THREE.Vector3(0, currentDist * 0.25, -currentDist * 0.968);
  animateCameraTo(targetCam, new THREE.Vector3(0, 0, 0), 600);
};

// [+] ZOOM IN: Decreases distance to target (Earth gets BIGGER / closer)
window.navZoomIn = function () {
  cameraTransition = null;
  const offset = camera.position.clone().sub(controls.target);
  const currentDist = offset.length();
  const newDist = Math.max(controls.minDistance, currentDist * 0.76);
  offset.setLength(newDist);
  camera.position.copy(controls.target).add(offset);
  controls.update();
};

// [-] ZOOM OUT: Increases distance to target (Earth gets SMALLER / farther)
window.navZoomOut = function () {
  cameraTransition = null;
  const offset = camera.position.clone().sub(controls.target);
  const currentDist = offset.length();
  const newDist = Math.min(controls.maxDistance, currentDist * 1.30);
  offset.setLength(newDist);
  camera.position.copy(controls.target).add(offset);
  controls.update();
};

window.navCenterView = function () {
  cameraTransition = null;
  const currentDist = camera.position.distanceTo(controls.target);
  const defaultDir = new THREE.Vector3(0.9, 0.8, -4.0).normalize();
  animateCameraTo(defaultDir.multiplyScalar(currentDist), new THREE.Vector3(0, 0, 0), 600);
};

// ============================================================================
// 📊 ARGO FLOAT PANEL CONTROLS
// ============================================================================
window.closeArgoFloatPanel = function () {
  const panel = document.getElementById("argoFloatPanel");
  if (panel) panel.classList.remove("visible");
};

window.switchArgoTab = function (tabName) {
  document.querySelectorAll(".argo-tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
  });
  document.querySelectorAll(".argo-tab-pane").forEach((pane) => {
    pane.classList.toggle("active", pane.id === `tab-${tabName}`);
  });
};

window.copyRawDataJson = function () {
  if (!currentLoadedData) return;
  navigator.clipboard.writeText(JSON.stringify(currentLoadedData, null, 2)).then(() => {
    const copyBtn = document.getElementById("copyJsonBtn");
    if (copyBtn) {
      const orig = copyBtn.textContent;
      copyBtn.textContent = "Copied! ✓";
      setTimeout(() => (copyBtn.textContent = orig), 2000);
    }
  });
};

// 10. Responsive resize handling
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// 11. Animation loop
let clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const elapsedTime = clock.getElapsedTime();

  // Handle smooth camera lerping if transition is active
  if (cameraTransition) {
    const elapsedMs = performance.now() - cameraTransition.startTime;
    const progress = Math.min(1.0, elapsedMs / cameraTransition.duration);
    // Smooth easeInOutCubic
    const ease = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    camera.position.lerpVectors(cameraTransition.startPos, cameraTransition.endPos, ease);
    controls.target.lerpVectors(cameraTransition.startLookAt, cameraTransition.endLookAt, ease);

    if (progress >= 1.0) {
      cameraTransition = null;
    }
  }

  // DYNAMIC ZOOM SCALING
  const camDist = camera.position.distanceTo(controls.target);
  const cfg = ANCHOR_SIZE_CONFIG;

  const normDist = Math.max(
    0,
    Math.min(
      1,
      (camDist - cfg.zoomInDistance) /
        (cfg.zoomOutDistance - cfg.zoomInDistance),
    ),
  );

  const dynamicScale =
    cfg.minScale +
    Math.pow(normDist, cfg.zoomCurvePower) * (cfg.maxScale - cfg.minScale);

  clickableSprites.forEach((sprite) => {
    sprite.scale.set(dynamicScale, dynamicScale, 1);
  });

  // Pulse beacons
  const pulseBase = 1.0 + 0.28 * Math.sin(elapsedTime * 4);
  const zoomFactor = Math.max(0.45, Math.min(1.0, camDist / 3.8));
  beaconMeshes.forEach((b) => {
    const isSelected = b.userData.id === selectedStationId;
    const extraScale = isSelected ? 1.5 : 1.0;
    const s = pulseBase * zoomFactor * extraScale;
    b.scale.set(s, s, s);
  });

  // Dynamic atmospheric fog & limb glow updates
  if (dynamicFogMaterial && dynamicFogMaterial.uniforms) {
    dynamicFogMaterial.uniforms.uTime.value = elapsedTime;
  }
  if (atmosphereMaterial && atmosphereMaterial.uniforms) {
    atmosphereMaterial.uniforms.uTime.value = elapsedTime;
  }
  if (dynamicFogMesh) {
    // Subtle differential planetary atmospheric drift
    dynamicFogMesh.rotation.y += 0.0001;
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();

// Initialize with Station A1 selected by default after a brief load delay
setTimeout(() => {
  selectStation("A1");
}, 400);
