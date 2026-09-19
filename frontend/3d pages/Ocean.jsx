import "../services/logger.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import React from "react";
import ReactDOM from "react-dom/client";
import { OceanDashboard } from "./OceanDashboard.jsx";
import "./workspace.css";
import {
  oceanDataService,
  getStationById,
  CF_CONVENTIONS,
  erddapOceanService,
  netCDFParserService,
  AsciiBuoyParser,
  MarineHeatwaveService,
  ShareableStateService,
} from "./oceanDataService.js";
import {
  createInstrumentObject,
  DEMO_INSTRUMENTS,
  createGliderSawtoothTrail,
} from "./instruments.js";
import { fetchArgoDepthSlice } from "../services/argoBackendService.js";
import { useOceanStore } from "./useOceanStore.js";

// ─── BOOT SAFETY: guarantee the 3D render loop starts even if data init fails ───
// Any top-level data error before animate() would leave a black canvas, so we
// (a) bind the zustand store explicitly instead of relying on transitive import
// side-effects, and (b) surface errors on a DOM overlay instead of black screen.
if (typeof window !== "undefined" && !window.oceanStore) {
  window.oceanStore = useOceanStore;
}
if (typeof window !== "undefined") {
  window.__oceanBooted = false;
  window.addEventListener("error", (e) => {
    try {
      const overlay = document.getElementById("ocean-error-overlay");
      if (overlay && e && e.message) {
        const title = overlay.querySelector("[data-err-title]");
        const hint = overlay.querySelector("[data-err-hint]");
        if (window.__oceanBooted) {
          // Main 3D scene is alive — a panel/widget failed. Dismissible.
          if (title) title.textContent = "⚠️ A panel failed to load";
          if (hint) hint.innerHTML = "The 3D ocean scene is still running. Click anywhere to dismiss and continue, or <a href=\"/index.html\" style=\"color:#00e5ff;\">return to the globe</a>.";
          overlay.style.display = "flex";
          overlay.onclick = () => { overlay.style.display = "none"; };
        } else {
          overlay.style.display = "flex";
        }
        const msg = overlay.querySelector("[data-err-msg]");
        if (msg) msg.textContent = String(e.message).slice(0, 300);
      }
    } catch (_err) { /* never break render loop for overlay errors */ }
  });
}


// ============================================================================
// ☀️ DYNAMIC SOLAR TIME & SUN DIRECTION PRESETS
// Every time the ocean view is opened, a different time of day is loaded!
// ============================================================================
export const SOLAR_PRESETS = [
  {
    id: "golden-hour",
    name: "Golden Hour Sunset",
    timeStr: "18:15 Solar Time",
    sunPos: new THREE.Vector3(45, 20, -180),
    sunColor: new THREE.Color(0xff7a00),
    horizonColor: new THREE.Color(0xffb03a),
    topColor: new THREE.Color(0x1a3366),
    sunLightColor: new THREE.Color(0xff8a1a),
    sunLightIntensity: 2.6,
    ambientColor: new THREE.Color(0xffd5b3),
    ambientIntensity: 0.85,
    waterSurfaceColor: new THREE.Color(0x38bdf8),
    waterDepthColor: new THREE.Color(0x0c2d52),
    badgeEmoji: "🌅",
  },
  {
    id: "midday",
    name: "Midday Solar Zenith",
    timeStr: "12:30 Solar Time",
    sunPos: new THREE.Vector3(-25, 110, -140),
    sunColor: new THREE.Color(0xfff5c0),
    horizonColor: new THREE.Color(0xd0f2ff),
    topColor: new THREE.Color(0x1565c0),
    sunLightColor: new THREE.Color(0xffffff),
    sunLightIntensity: 3.0,
    ambientColor: new THREE.Color(0xe0f2fe),
    ambientIntensity: 1.1,
    waterSurfaceColor: new THREE.Color(0x00f0ff),
    waterDepthColor: new THREE.Color(0x092d54),
    badgeEmoji: "☀️",
  },
  {
    id: "dawn",
    name: "Early Tropical Dawn",
    timeStr: "06:10 Solar Time",
    sunPos: new THREE.Vector3(-150, 16, -130),
    sunColor: new THREE.Color(0xffa153),
    horizonColor: new THREE.Color(0xff8866),
    topColor: new THREE.Color(0x1e2749),
    sunLightColor: new THREE.Color(0xffb077),
    sunLightIntensity: 2.2,
    ambientColor: new THREE.Color(0xffd7c4),
    ambientIntensity: 0.75,
    waterSurfaceColor: new THREE.Color(0x2dd4bf),
    waterDepthColor: new THREE.Color(0x0b2d4f),
    badgeEmoji: "🌄",
  },
  {
    id: "twilight",
    name: "Dusk Twilight / Blue Hour",
    timeStr: "19:05 Solar Time",
    sunPos: new THREE.Vector3(70, 6, -195),
    sunColor: new THREE.Color(0xff3300),
    horizonColor: new THREE.Color(0x7c3aed),
    topColor: new THREE.Color(0x0c152e),
    sunLightColor: new THREE.Color(0xec4899),
    sunLightIntensity: 1.5,
    ambientColor: new THREE.Color(0x818cf8),
    ambientIntensity: 0.65,
    waterSurfaceColor: new THREE.Color(0x38bdf8),
    waterDepthColor: new THREE.Color(0x0a2647),
    badgeEmoji: "🌆",
  },
  {
    id: "night",
    name: "Oceanic Night & Moon",
    timeStr: "23:45 Solar Time",
    sunPos: new THREE.Vector3(-60, 95, -120),
    sunColor: new THREE.Color(0xbae6fd),
    horizonColor: new THREE.Color(0x071536),
    topColor: new THREE.Color(0x020713),
    sunLightColor: new THREE.Color(0x7dd3fc),
    sunLightIntensity: 1.2,
    ambientColor: new THREE.Color(0x1e3a8a),
    ambientIntensity: 0.45,
    waterSurfaceColor: new THREE.Color(0x06b6d4),
    waterDepthColor: new THREE.Color(0x081e3a),
    badgeEmoji: "🌙",
  },
];

// Automatically select next solar time preset on every load
let currentPresetIndex = 0;
const storedSolarIdx = parseInt(sessionStorage.getItem("ocean_solar_idx"), 10);
if (!isNaN(storedSolarIdx)) {
  currentPresetIndex = (storedSolarIdx + 1) % SOLAR_PRESETS.length;
} else {
  currentPresetIndex = Math.floor(Math.random() * SOLAR_PRESETS.length);
}
sessionStorage.setItem("ocean_solar_idx", String(currentPresetIndex));
const initialPreset = SOLAR_PRESETS[currentPresetIndex];

// ============================================================================
// 1. SCENE & CAMERA SETUP (Framed for 60% Sky & Sun / 40% Ocean)
// ============================================================================
const scene = new THREE.Scene();

// Camera setup
const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);

// Camera placed near water level, angled so horizon is at 40% from bottom with Argo float in view
camera.position.set(0, 3.2, 14);
camera.lookAt(0, 2.0, 1.5);

// WebGL Renderer with HDR Tone Mapping
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
// Canvas is appended to body initially; OceanDashboard will move it into the panel container
document.body.appendChild(renderer.domElement);
// Store renderer globally so OceanDashboard can access it
window.__oceanRenderer = renderer;
window.__oceanCamera = camera;

// Orbit Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 2.0, 1.5);
controls.maxPolarAngle = Math.PI / 2 - 0.02; // Prevents camera going underwater
controls.minDistance = 5;
controls.maxDistance = 35;

// ============================================================================
// 2. SUN & SKY SETUP
// ============================================================================
export const vertexSkyShader = `
  varying vec3 vLocalPosition;
  void main() {
    vLocalPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentSkyShader = `
  varying vec3 vLocalPosition;
  uniform vec3 uTopColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uBottomColor;
  uniform vec3 uSunPosition;
  uniform vec3 uSunColor;
  uniform float uUnderwaterRatio;
  uniform float uCameraDepth;

  void main() {
    vec3 dir = normalize(vLocalPosition);
    
    // --- 1. ABOVE WATER ATMOSPHERIC SKY ---
    if (uUnderwaterRatio <= 0.005) {
      vec3 col;
      if (dir.y >= 0.0) {
        col = mix(uHorizonColor, uTopColor, pow(dir.y, 0.65));
      } else {
        col = mix(uHorizonColor, uBottomColor, pow(-dir.y, 0.72));
      }
      vec3 sunDir = normalize(uSunPosition);
      float sunDot = max(dot(dir, sunDir), 0.0);
      float sunGlow = pow(sunDot, 8.0) * 0.55 + pow(sunDot, 64.0) * 0.9;
      col += uSunColor * sunGlow;
      gl_FragColor = vec4(col, 1.0);
      return;
    }

    // --- 2. UNDERWATER OPTICAL ABYSS (Beer-Lambert Multi-Spectral Extinction) ---
    // In real seawater, Red (680nm) absorbs in 10-15m, Green (530nm) in 50m, Blue (470nm) penetrates past 150m.
    float effectiveDepth = uUnderwaterRatio * 2200.0;
    
    // Wavelength transmission coefficients:
    float tRed = exp(-effectiveDepth * 0.0095);
    float tGreen = exp(-effectiveDepth * 0.0032);
    float tBlue = exp(-effectiveDepth * 0.0012);
    vec3 spectralTransmission = vec3(tRed, tGreen, tBlue);

    // Directional Gradient in Water Column:
    // Looking up (Zenith dir.y > 0): Downwelling sunlight / surface glow
    // Looking horizontal (dir.y ~ 0): Water mass horizontal backscatter
    // Looking down (Nadir dir.y < 0): Oceanic midnight abyss
    vec3 shallowZenith = vec3(0.06, 0.48, 0.82);
    vec3 deepZenith = vec3(0.012, 0.038, 0.095);
    vec3 zenithColor = mix(shallowZenith, deepZenith, clamp(uUnderwaterRatio * 1.5, 0.0, 1.0));

    vec3 shallowHorizon = vec3(0.035, 0.28, 0.55);
    vec3 deepHorizon = vec3(0.008, 0.022, 0.058);
    vec3 horizonColor = mix(shallowHorizon, deepHorizon, clamp(uUnderwaterRatio * 1.5, 0.0, 1.0));

    vec3 nadirColor = mix(vec3(0.012, 0.075, 0.20), vec3(0.002, 0.007, 0.020), clamp(uUnderwaterRatio * 1.3, 0.0, 1.0));

    vec3 ambientWater;
    if (dir.y >= 0.0) {
      ambientWater = mix(horizonColor, zenithColor, pow(dir.y, 0.75));
    } else {
      ambientWater = mix(horizonColor, nadirColor, pow(-dir.y, 0.82));
    }

    // Downwelling Solar Cone (visible when looking upwards toward surface sun)
    vec3 sunDir = normalize(vec3(uSunPosition.x, abs(uSunPosition.y), uSunPosition.z));
    float sunUpDot = max(dot(dir, sunDir), 0.0);
    float sunShaftCone = pow(sunUpDot, 4.5) * 0.55 + pow(sunUpDot, 26.0) * 1.1;
    // Fades completely as user goes past photic zone (~200m / ratio 0.05)
    float sunPenetration = max(0.0, 1.0 - uUnderwaterRatio * 18.0);
    vec3 sunUnderwaterGlow = mix(vec3(0.18, 0.72, 0.95), vec3(0.08, 0.40, 0.75), clamp(uUnderwaterRatio * 8.0, 0.0, 1.0));
    ambientWater += sunUnderwaterGlow * sunShaftCone * sunPenetration;

    // Apply spectral wavelength extinction while keeping clean oceanic dark blue floor
    ambientWater = ambientWater * spectralTransmission * 1.55 + vec3(0.0025, 0.0075, 0.020);

    gl_FragColor = vec4(ambientWater, 1.0);
  }
`;

const skyGeo = new THREE.SphereGeometry(600, 32, 32);
const skyMat = new THREE.ShaderMaterial({
  vertexShader: vertexSkyShader,
  fragmentShader: fragmentSkyShader,
  uniforms: {
    uTopColor: { value: initialPreset.topColor.clone() },
    uHorizonColor: { value: initialPreset.horizonColor.clone() },
    uBottomColor: { value: new THREE.Color(0x0a2f54) }, // Rich abyssal dark blue (NOT black)
    uSunPosition: { value: initialPreset.sunPos.clone() },
    uSunColor: { value: initialPreset.sunColor.clone() },
    uUnderwaterRatio: { value: 0.0 },
    uCameraDepth: { value: 0.0 },
  },
  side: THREE.BackSide,
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

// 3D Sun Mesh Group
const sunGroup = new THREE.Group();
sunGroup.position.copy(initialPreset.sunPos);

// Core Sun Sphere
const sunGeo = new THREE.SphereGeometry(12, 32, 32);
const sunMat = new THREE.MeshBasicMaterial({
  color: initialPreset.sunColor.clone(),
  fog: false,
  transparent: true,
});
const sunMesh = new THREE.Mesh(sunGeo, sunMat);
sunGroup.add(sunMesh);

// Soft Outer Sun Corona (shaders exported so panel scenes reuse the same sun)
export const sunGlowVertexShader = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
export const sunGlowFragmentShader = `
  varying vec3 vNormal;
  void main() {
    float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
    gl_FragColor = vec4(1.0, 0.9, 0.4, intensity * 0.7);
  }
`;
const sunGlowMat = new THREE.ShaderMaterial({
  vertexShader: sunGlowVertexShader,
  fragmentShader: sunGlowFragmentShader,
  transparent: true,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide,
});
const sunGlowMesh = new THREE.Mesh(
  new THREE.SphereGeometry(17, 32, 32),
  sunGlowMat,
);
sunGroup.add(sunGlowMesh);
scene.add(sunGroup);

// Sun Directional Light & Ambient Light
const sunLight = new THREE.DirectionalLight(
  initialPreset.sunLightColor.clone(),
  initialPreset.sunLightIntensity,
);
sunLight.position.copy(initialPreset.sunPos);
scene.add(sunLight);

const ambientLight = new THREE.AmbientLight(
  initialPreset.ambientColor.clone(),
  initialPreset.ambientIntensity,
);
scene.add(ambientLight);

// ============================================================================
// 3. LIGHTISH WHITE-YELLOW CLOUDS
// ============================================================================
// Clouds with soft warm white-yellow lighting
const cloudsGroup = new THREE.Group();
scene.add(cloudsGroup);

export function createFluffyCloud(x, y, z, scale, targetGroup) {
  const cloud = new THREE.Group();
  const puffMat = new THREE.MeshStandardMaterial({
    color: 0xfffae6, // Lightish warm white-yellow
    roughness: 0.8,
    metalness: 0.05,
    transparent: true,
    opacity: 0.88,
    flatShading: true,
  });

  // Multiple randomized overlapping puffs forming a natural cumulus cloud
  const puffCount = 7 + Math.floor(Math.random() * 4);
  for (let i = 0; i < puffCount; i++) {
    const puffRadius = 2.5 + Math.random() * 2.5;
    const puffGeo = new THREE.DodecahedronGeometry(puffRadius, 1);
    const puff = new THREE.Mesh(puffGeo, puffMat);
    puff.position.set(
      (Math.random() - 0.5) * 8 * scale,
      (Math.random() - 0.2) * 2.5 * scale,
      (Math.random() - 0.5) * 4 * scale,
    );
    puff.scale.set(
      1 + Math.random() * 0.3,
      0.8 + Math.random() * 0.4,
      1 + Math.random() * 0.3,
    );
    cloud.add(puff);
  }

  cloud.position.set(x, y, z);
  cloud.userData = { speed: 0.02 + Math.random() * 0.025, initialX: x };
  (targetGroup || cloudsGroup).add(cloud);
  return cloud;
}

// Generate scattered cloud banks in the upper 60% sky
export const cloudConfigs = [
  { x: -50, y: 28, z: -140, scale: 1.8 },
  { x: 35, y: 34, z: -130, scale: 1.5 },
  { x: -80, y: 22, z: -110, scale: 2.0 },
  { x: 75, y: 26, z: -120, scale: 2.2 },
  { x: -15, y: 38, z: -160, scale: 1.4 },
  { x: 95, y: 30, z: -150, scale: 1.9 },
  { x: -120, y: 25, z: -130, scale: 2.4 },
  { x: 0, y: 44, z: -120, scale: 1.6 },
  { x: -40, y: 18, z: -90, scale: 1.3 },
  { x: 50, y: 20, z: -95, scale: 1.4 },
];

cloudConfigs.forEach((c) => createFluffyCloud(c.x, c.y, c.z, c.scale));

// ============================================================================
// 4. CUSTOM WATER SHADERS (GLSL Ocean Waves with Specular Sun Glint)
// ============================================================================
export const waterVertexShader = `
  uniform float uTime;
  uniform float uBigWavesElevation;
  uniform vec2 uBigWavesFrequency;
  uniform float uBigWavesSpeed;
  uniform float uSmallWavesElevation;
  uniform float uSmallWavesFrequency;
  uniform float uSmallWavesSpeed;

  varying float vElevation;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  // Simplex noise algorithm for organic micro-ripples
  vec4 permute(vec4 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  vec3 fade(vec3 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

  float cnoise(vec3 P) {
    vec3 Pi0 = floor(P);
    vec3 Pi1 = Pi0 + vec3(1.0);
    Pi0 = mod(Pi0, 289.0);
    Pi1 = mod(Pi1, 289.0);
    vec3 Pf0 = fract(P);
    vec3 Pf1 = Pf0 - vec3(1.0);
    vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
    vec4 iy = vec4(Pi0.yy, Pi1.yy);
    vec4 iz0 = Pi0.zzzz;
    vec4 iz1 = Pi1.zzzz;

    vec4 ixy = permute(permute(ix) + iy);
    vec4 ixy0 = permute(ixy + iz0);
    vec4 ixy1 = permute(ixy + iz1);

    vec4 gx0 = ixy0 / 7.0;
    vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
    gx0 = fract(gx0);
    vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
    vec4 sz0 = step(gz0, vec4(0.0));
    gx0 -= sz0 * (step(0.0, gx0) - 0.5);
    gy0 -= sz0 * (step(0.0, gy0) - 0.5);

    vec4 gx1 = ixy1 / 7.0;
    vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
    gx1 = fract(gx1);
    vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
    vec4 sz1 = step(gz1, vec4(0.0));
    gx1 -= sz1 * (step(0.0, gx1) - 0.5);
    gy1 -= sz1 * (step(0.0, gy1) - 0.5);

    vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
    vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
    vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
    vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
    vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
    vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
    vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
    vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

    vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
    g000 *= norm0.x;
    g010 *= norm0.y;
    g100 *= norm0.z;
    g110 *= norm0.w;
    vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
    g001 *= norm1.x;
    g011 *= norm1.y;
    g101 *= norm1.z;
    g111 *= norm1.w;

    float n000 = dot(g000, Pf0);
    float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
    float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
    float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
    float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
    float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
    float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
    float n111 = dot(g111, Pf1);

    vec3 fade_xyz = fade(Pf0);
    vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
    vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
    float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
    return 2.2 * n_xyz;
  }

  // Wave elevation function with large swells and multi-layer micro-ripples
  float calculateElevation(vec3 pos) {
    float elevation = sin(pos.x * uBigWavesFrequency.x + uTime * uBigWavesSpeed) *
                      cos(pos.z * uBigWavesFrequency.y + uTime * uBigWavesSpeed) *
                      uBigWavesElevation;

    // Secondary rolling cross-wave
    elevation += sin((pos.x * 0.7 - pos.z * 0.6) * uBigWavesFrequency.x * 0.8 + uTime * uBigWavesSpeed * 0.85) * (uBigWavesElevation * 0.45);

    // Micro wave turbulence
    for (float i = 1.0; i <= 3.0; i++) {
      elevation -= abs(cnoise(vec3(pos.xz * uSmallWavesFrequency * i, uTime * uSmallWavesSpeed)) * (uSmallWavesElevation / i));
    }
    return elevation;
  }

  void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);

    float elevation = calculateElevation(modelPosition.xyz);
    modelPosition.y += elevation;

    // Finite differences to calculate smooth water surface normal
    float delta = 0.08;
    float elevX = calculateElevation(modelPosition.xyz + vec3(delta, 0.0, 0.0));
    float elevZ = calculateElevation(modelPosition.xyz + vec3(0.0, 0.0, delta));

    vec3 normalCalculated = normalize(vec3((elevX - elevation) / delta, 1.0, (elevZ - elevation) / delta));

    vNormal = normalize(mat3(modelMatrix) * normalCalculated);
    vWorldPosition = modelPosition.xyz;
    vElevation = elevation;
    vUv = uv;

    vec4 viewPosition = viewMatrix * modelPosition;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

export const waterFragmentShader = `
  uniform vec3 uDepthColor;
  uniform vec3 uSurfaceColor;
  uniform vec3 uFoamColor;
  uniform float uColorOffset;
  uniform float uColorMultiplier;
  uniform vec3 uSunPosition;
  uniform vec3 uSunColor;
  uniform vec3 uSkyHorizonColor;
  uniform float uUnderwaterRatio;
  uniform float uTime;

  varying float vElevation;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  void main() {
    bool isUnderwater = (cameraPosition.y < vWorldPosition.y);

    // ========================================================================
    // CASE A: VIEWED FROM UNDERWATER LOOKING UP (Snell's Window & TIR)
    // ========================================================================
    if (isUnderwater) {
      vec3 toSurface = normalize(vWorldPosition - cameraPosition);
      vec3 normalDown = -normalize(vNormal); // normal facing downward into water
      vec3 worldUp = vec3(0.0, 1.0, 0.0);

      // Angle of incidence relative to ocean surface vertical
      float cosIncidence = dot(toSurface, worldUp);
      
      // Perturb Snell's window boundary organically with wave surface motion
      float wavePerturb = normalDown.x * 0.12 + normalDown.z * 0.12;
      float effectiveCos = cosIncidence + wavePerturb;

      // Snell critical angle (for seawater n=1.333 -> cos ~ 0.661)
      // Inside Snell's cone (effectiveCos > 0.66): Sky transmission
      // Outside Snell's cone (effectiveCos <= 0.66): Total Internal Reflection (TIR)
      float snellWindow = smoothstep(0.63, 0.70, effectiveCos);

      // 1. SKY TRANSMISSION (Inside Snell's Window)
      // Diver sees the sky dome, sun glint, and waving caustic refraction
      vec3 skyTransmission = mix(vec3(0.18, 0.65, 0.92), vec3(0.35, 0.85, 1.0), vElevation * 2.0 + 0.5);
      
      // Animated wave caustics dancing on the window
      float caustic1 = sin(vWorldPosition.x * 2.8 + uTime * 2.2) * cos(vWorldPosition.z * 2.8 + uTime * 1.8);
      float caustic2 = sin((vWorldPosition.x + vWorldPosition.z) * 3.5 - uTime * 2.6);
      float causticPattern = (caustic1 + caustic2) * 0.5;
      skyTransmission += vec3(0.22, 0.50, 0.65) * causticPattern;

      // Specular sun core refracted through the window
      vec3 sunDir = normalize(uSunPosition);
      float sunGlint = pow(max(dot(toSurface, sunDir), 0.0), 32.0) * 3.2;
      sunGlint += pow(max(dot(toSurface, sunDir), 0.0), 8.0) * 0.6;
      skyTransmission += uSunColor * sunGlint;

      // Surface foam patches seen from below as bright diffuse milky scatter
      float foam = smoothstep(0.18, 0.45, vElevation);
      skyTransmission = mix(skyTransmission, vec3(0.92, 0.98, 1.0), foam * 0.65);

      // 2. TOTAL INTERNAL REFLECTION (Outside Snell's Window)
      // Acts as an oceanic liquid mirror reflecting the deep sapphire & navy water below
      vec3 tirReflection = mix(vec3(0.03, 0.15, 0.32), vec3(0.008, 0.035, 0.095), clamp(uUnderwaterRatio * 1.4, 0.0, 1.0));
      // Subtle wave facet highlights on the mirror
      float facetShimmer = pow(max(dot(normalDown, vec3(0.0, -1.0, 0.0)), 0.0), 12.0) * 0.18;
      tirReflection += vec3(0.05, 0.25, 0.55) * facetShimmer;

      // 3. Iridescent Snell Boundary Rim (chromatic fringe at critical angle)
      float snellRim = smoothstep(0.0, 0.5, snellWindow) * smoothstep(1.0, 0.5, snellWindow) * 3.8;
      vec3 rimColor = vec3(0.25, 0.88, 0.98) * snellRim * 0.5;

      vec3 compositeSurface = mix(tirReflection, skyTransmission, snellWindow) + rimColor;

      // 4. Physical Beer-Lambert optical absorption between camera and surface:
      // Water absorbs the light as camera descends
      float distToSurface = length(vWorldPosition - cameraPosition);
      float depthMeters = -cameraPosition.y;
      
      // Absorption coefficient (Red absorbs rapidly, green medium, blue persists)
      vec3 waterExtinction = vec3(0.045, 0.016, 0.007);
      vec3 absorption = exp(-waterExtinction * distToSurface * 0.38);

      // Oceanic deep mist fog
      vec3 waterMist = mix(vec3(0.02, 0.14, 0.30), vec3(0.003, 0.012, 0.035), clamp(uUnderwaterRatio * 1.5, 0.0, 1.0));
      vec3 finalUnderwater = mix(waterMist, compositeSurface * absorption, absorption);

      // Alpha attenuation: As camera goes deeper than ~250m (depthMeters > 6), surface dissolves into the dark abyss
      float surfaceOpacity = clamp(exp(-depthMeters * 0.065), 0.0, 0.94);

      gl_FragColor = vec4(finalUnderwater, surfaceOpacity);
      return;
    }

    // ========================================================================
    // CASE B: VIEWED FROM ABOVE WATER (Realistic Sea Surface)
    // ========================================================================
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 normal = normalize(vNormal);

    // 1. Water color based on wave elevation (deep indigo blue to vibrant turquoise)
    float mixStrength = (vElevation + uColorOffset) * uColorMultiplier;
    mixStrength = clamp(mixStrength, 0.0, 1.0);
    vec3 waterColor = mix(uDepthColor, uSurfaceColor, mixStrength);

    // 2. Foam on Wave Crests
    float foamStrength = smoothstep(0.18, 0.48, vElevation);
    waterColor = mix(waterColor, uFoamColor, foamStrength * 0.85);

    // 3. Fresnel reflection (reflects bright horizon when viewed at grazing angle)
    float fresnel = pow(1.0 - max(dot(viewDirection, normal), 0.0), 3.5);
    waterColor = mix(waterColor, uSkyHorizonColor, fresnel * 0.65);

    // 4. Specular Golden Sun Reflection on Waves
    vec3 sunDirection = normalize(uSunPosition - vWorldPosition);
    vec3 halfVector = normalize(sunDirection + viewDirection);

    // Sharp sun shimmer
    float specSharp = pow(max(dot(normal, halfVector), 0.0), 130.0);
    vec3 sunGlint = uSunColor * specSharp * 2.6;

    // Soft surrounding wave sheen
    float specSoft = pow(max(dot(normal, halfVector), 0.0), 22.0);
    sunGlint += uSunColor * specSoft * 0.45;

    vec3 finalColor = waterColor + sunGlint;

    // Distance fog towards horizon to blend ocean seamlessly with sky
    float dist = length(cameraPosition - vWorldPosition);
    float fog = smoothstep(60.0, 240.0, dist);
    finalColor = mix(finalColor, uSkyHorizonColor, fog * 0.9);

    gl_FragColor = vec4(finalColor, 0.75);
  }
`;

// Ocean Geometry: High-resolution mesh plane
const waterGeometry = new THREE.PlaneGeometry(350, 350, 512, 512);
waterGeometry.rotateX(-Math.PI / 2);

const waterMaterial = new THREE.ShaderMaterial({
  vertexShader: waterVertexShader,
  fragmentShader: waterFragmentShader,
  uniforms: {
    uTime: { value: 0 },
    uUnderwaterRatio: { value: 0.0 },
    // Wave dynamics
    uBigWavesElevation: { value: 0.38 },
    uBigWavesFrequency: { value: new THREE.Vector2(0.28, 0.18) },
    uBigWavesSpeed: { value: 1.1 },
    uSmallWavesElevation: { value: 0.14 },
    uSmallWavesFrequency: { value: 1.6 },
    uSmallWavesSpeed: { value: 0.35 },
    // Color parameters
    uDepthColor: { value: initialPreset.waterDepthColor.clone() },
    uSurfaceColor: { value: initialPreset.waterSurfaceColor.clone() },
    uFoamColor: { value: new THREE.Color(0xf6ffff) }, // White foam crests
    uColorOffset: { value: 0.15 },
    uColorMultiplier: { value: 2.2 },
    // Sun & Reflection
    uSunPosition: { value: initialPreset.sunPos.clone() },
    uSunColor: { value: initialPreset.sunColor.clone() },
    uSkyHorizonColor: { value: initialPreset.horizonColor.clone() },
  },
  side: THREE.DoubleSide,
  transparent: true,
  depthWrite: false, // Prevents water surface from blocking underwater objects
  wireframe: false,
});

const water = new THREE.Mesh(waterGeometry, waterMaterial);
water.position.y = 0;
scene.add(water);

// ============================================================================
// ☀️ APPLY SOLAR PRESET & DYNAMIC LIGHTING
// ============================================================================
export function applySolarPreset(preset) {
  // Update sky uniforms
  if (skyMat && skyMat.uniforms) {
    skyMat.uniforms.uSunPosition.value.copy(preset.sunPos);
    skyMat.uniforms.uSunColor.value.copy(preset.sunColor);
    skyMat.uniforms.uHorizonColor.value.copy(preset.horizonColor);
    skyMat.uniforms.uTopColor.value.copy(preset.topColor);
  }

  // Update 3D Sun Mesh position & color
  if (sunGroup) {
    sunGroup.position.copy(preset.sunPos);
  }
  if (sunMat) {
    sunMat.color.copy(preset.sunColor);
  }

  // Update Directional Sun Light
  if (sunLight) {
    sunLight.position.copy(preset.sunPos);
    sunLight.color.copy(preset.sunLightColor);
    sunLight.intensity = preset.sunLightIntensity;
  }

  // Update Ambient Light
  if (ambientLight) {
    ambientLight.color.copy(preset.ambientColor);
    ambientLight.intensity = preset.ambientIntensity;
  }

  // Update Water Shader uniforms
  if (waterMaterial && waterMaterial.uniforms) {
    waterMaterial.uniforms.uSunPosition.value.copy(preset.sunPos);
    waterMaterial.uniforms.uSunColor.value.copy(preset.sunColor);
    waterMaterial.uniforms.uSkyHorizonColor.value.copy(preset.horizonColor);
    waterMaterial.uniforms.uSurfaceColor.value.copy(preset.waterSurfaceColor);
    waterMaterial.uniforms.uDepthColor.value.copy(preset.waterDepthColor);
  }

  // Update God Ray sun beam color
  if (typeof godRayMat !== "undefined" && godRayMat && godRayMat.uniforms) {
    godRayMat.uniforms.uRayColor.value.copy(preset.sunColor).lerp(new THREE.Color(0x5eead4), 0.45);
  }

  // Update UI description pill
  const solarTimeEl = document.getElementById("descSolarTime");
  const sunEmojiEl = document.getElementById("sunBadgeEmoji");
  if (solarTimeEl)
    solarTimeEl.textContent = `${preset.name} (${preset.timeStr})`;
  if (sunEmojiEl) sunEmojiEl.textContent = preset.badgeEmoji;
}

window.cycleSolarTime = function () {
  currentPresetIndex = (currentPresetIndex + 1) % SOLAR_PRESETS.length;
  sessionStorage.setItem("ocean_solar_idx", String(currentPresetIndex));
  applySolarPreset(SOLAR_PRESETS[currentPresetIndex]);
};

// Live dynamic float state
let currentFloatData = null;
window.oceanDataService = oceanDataService;
window.getCurrentFloatData = () => currentFloatData;

window.updateVolumeVariable = function (activeVariable) {
  if (!currentFloatData || !waterMaterial) return;
  const depth = window.OCEAN_STATE?.currentDepth || 15;
  const interp = oceanDataService.interpolateAtDepth(currentFloatData, depth);
  
  let val = null;
  let color = null;
  
  if (activeVariable === 'temperature') {
    val = interp.temperatureC;
    if (val != null) {
      // 26 to 31+: cyan -> green -> yellow -> orange -> red -> dark red
      if (val < 26) color = new THREE.Color(0x00ffff);
      else if (val < 27) color = new THREE.Color(0x00ff00).lerp(new THREE.Color(0x00ffff), 1 - (val-26));
      else if (val < 28) color = new THREE.Color(0xadff2f).lerp(new THREE.Color(0x00ff00), 1 - (val-27));
      else if (val < 29) color = new THREE.Color(0xffa500).lerp(new THREE.Color(0xadff2f), 1 - (val-28));
      else if (val < 30) color = new THREE.Color(0xff0000).lerp(new THREE.Color(0xffa500), 1 - (val-29));
      else color = new THREE.Color(0x8b0000).lerp(new THREE.Color(0xff0000), Math.max(0, 1 - (val-30)));
    }
  } else if (activeVariable === 'salinity') {
    val = interp.salinityPSU;
    if (val != null) {
      // 31 to 39: pink -> purple -> blue -> cyan -> green -> yellow -> orange -> red -> light red
      if (val < 32) color = new THREE.Color(0x800080).lerp(new THREE.Color(0xffc0cb), 1 - (val-31));
      else if (val < 33) color = new THREE.Color(0x0000ff).lerp(new THREE.Color(0x800080), 1 - (val-32));
      else if (val < 34) color = new THREE.Color(0x00ffff).lerp(new THREE.Color(0x0000ff), 1 - (val-33));
      else if (val < 35) color = new THREE.Color(0x00ff00).lerp(new THREE.Color(0x00ffff), 1 - (val-34));
      else if (val < 36) color = new THREE.Color(0xffff00).lerp(new THREE.Color(0x00ff00), 1 - (val-35));
      else if (val < 37) color = new THREE.Color(0xffa500).lerp(new THREE.Color(0xffff00), 1 - (val-36));
      else if (val < 38) color = new THREE.Color(0xff0000).lerp(new THREE.Color(0xffa500), 1 - (val-37));
      else color = new THREE.Color(0xffb6c1).lerp(new THREE.Color(0xff0000), Math.max(0, 1 - (val-38)));
    }
  } else if (activeVariable === 'chlorophyll') {
    val = interp.chlorophyllMgM3;
    if (val != null) {
      // 0.04 to 5: purple -> blue -> cyan -> green -> yellow -> orange -> red
      if (val < 0.1) color = new THREE.Color(0x0000ff).lerp(new THREE.Color(0x800080), 1 - (val-0.04)/0.06);
      else if (val < 0.3) color = new THREE.Color(0x00ffff).lerp(new THREE.Color(0x0000ff), 1 - (val-0.1)/0.2);
      else if (val < 1.0) color = new THREE.Color(0x00ff00).lerp(new THREE.Color(0x00ffff), 1 - (val-0.3)/0.7);
      else if (val < 2.0) color = new THREE.Color(0xffff00).lerp(new THREE.Color(0x00ff00), 1 - (val-1.0)/1.0);
      else if (val < 3.0) color = new THREE.Color(0xffa500).lerp(new THREE.Color(0xffff00), 1 - (val-2.0)/1.0);
      else if (val < 4.0) color = new THREE.Color(0xff0000).lerp(new THREE.Color(0xffa500), 1 - (val-3.0)/1.0);
      else color = new THREE.Color(0xff0000);
    }
  } else if (activeVariable === 'all') {
    // Revert to solar preset colors
    const preset = SOLAR_PRESETS[currentPresetIndex];
    if (preset) {
       waterMaterial.uniforms.uSurfaceColor.value.copy(preset.waterSurfaceColor);
       waterMaterial.uniforms.uDepthColor.value.copy(preset.waterDepthColor);
    }
    return;
  }
  
  if (color) {
    waterMaterial.uniforms.uSurfaceColor.value.copy(color);
    // make depth color a slightly darker version
    const depthCol = color.clone().multiplyScalar(0.4);
    waterMaterial.uniforms.uDepthColor.value.copy(depthCol);
  }
};

// ============================================================================
// DYNAMIC DEPTH TELEMETRY: REAL-TIME PHYSICAL OCEAN PROPERTY INTERPOLATION
// As user dives down (0m -> 4000m), water temperature, salinity, oxygen, and
// chlorophyll dynamically reflect the vertical CTD gradient.
// ============================================================================
window.updateLiveDepthData = function (depthMeters) {
  if (!currentFloatData) return;
  const interp = oceanDataService.interpolateAtDepth(
    currentFloatData,
    depthMeters,
  );

  const tempEl = document.getElementById("descTemp");
  const tempLabelEl = document.getElementById("descTempLabel");
  const salEl = document.getElementById("descSalinity");
  const depthEl = document.getElementById("descDepth");
  const oxyEl = document.getElementById("descOxygen");
  const chlEl = document.getElementById("descChlorophyll");

  if (tempEl) {
    tempEl.textContent = `${interp.temperatureC.toFixed(1)} °C`;
  }
  if (tempLabelEl) {
    tempLabelEl.textContent =
      depthMeters === 0 ? "🌡 Surface Temp" : `🌡 Temp (@ ${depthMeters}m)`;
  }
  if (salEl) {
    salEl.textContent = `${interp.salinityPSU.toFixed(1)} PSU`;
  }
  if (depthEl) {
    depthEl.textContent = `${depthMeters} m / 2000 m`;
  }
  if (oxyEl) {
    oxyEl.textContent = `${interp.dissolvedOxygenUmolKg} μmol/kg`;
  }
  if (chlEl) {
    chlEl.textContent = `${interp.chlorophyllMgM3.toFixed(2)} mg/m³`;
  }

  // Update live depth marker line on the docked SVG profile chart
  const marker = document.getElementById("profileChartDepthMarker");
  if (marker) {
    const padTop = 15;
    const plotH = 200 - 15 - 25;
    const markerY = padTop + (Math.min(2000, depthMeters) / 2000) * plotH;
    marker.setAttribute("y1", markerY.toFixed(1));
    marker.setAttribute("y2", markerY.toFixed(1));
  }
  
  if (window.OCEAN_STATE && window.OCEAN_STATE.variable && window.OCEAN_STATE.variable !== 'all') {
    if (typeof window.updateVolumeVariable === 'function') {
      window.updateVolumeVariable(window.OCEAN_STATE.variable);
    }
  }

  // ─── QUERY BGC ARGO FASTAPI DEPTH-SLICE BACKEND ────────────────────────────
  const rawPlatform = (window.OCEAN_STATE?.selectedInstrument?.floatId) ||
                      (currentStation?.platformNumber) ||
                      '2902251';
  const timestamp = window.currentTemporalTimestamp || null;

  fetchArgoDepthSlice(rawPlatform, depthMeters, timestamp)
    .then((backendData) => {
      if (backendData) {
        window.updateBGCTelemetryFromBackend(backendData);
      }
    })
    .catch((err) => {
      // Backend errors handled gracefully with procedural fallback
    });
};

/**
 * Updates DOM telemetry elements and Zustand store with BGC Argo backend depth slice.
 */
window.updateBGCTelemetryFromBackend = function (data) {
  if (!data) return;

  const vars = data.primary_oceanographic_variables;
  const optics = data.bgc_optics_and_diagnostics;
  const hydraulics = data.hydraulics_telemetry;
  const meta = data.metadata;

  if (vars) {
    const tempEl = document.getElementById("descTemp");
    const salEl = document.getElementById("descSalinity");
    const oxyEl = document.getElementById("descOxygen");
    const chlEl = document.getElementById("descChlorophyll");
    const currentEl = document.getElementById("descCurrent");

    if (tempEl && vars.temperature_c != null) {
      tempEl.textContent = `${vars.temperature_c.toFixed(1)} °C`;
    }
    if (salEl && vars.salinity_psu != null) {
      salEl.textContent = `${vars.salinity_psu.toFixed(1)} PSU`;
    }
    if (oxyEl && vars.dissolved_oxygen_umol_kg != null) {
      oxyEl.textContent = `${vars.dissolved_oxygen_umol_kg.toFixed(0)} μmol/kg`;
    }
    if (chlEl && vars.chlorophyll_a_mg_m3 != null) {
      chlEl.textContent = `${vars.chlorophyll_a_mg_m3.toFixed(2)} mg/m³`;
    }
    if (currentEl && vars.current_speed_m_s != null) {
      currentEl.textContent = `${vars.current_speed_m_s.toFixed(2)} m/s → NE`;
    }
  }

  // Update Coordinates & Metadata
  if (meta) {
    const coordsEl = document.getElementById("descCoords");
    if (coordsEl && meta.coordinates) {
      coordsEl.textContent = `${meta.coordinates.latitude}, ${meta.coordinates.longitude}`;
    }
    const modelSourceEl = document.getElementById("descModelSource");
    if (modelSourceEl && meta.data_source) {
      modelSourceEl.textContent = meta.data_source;
    }
    const biasRatingEl = document.getElementById("descModelBiasRating");
    if (biasRatingEl && meta.residual_bias) {
      biasRatingEl.textContent = meta.residual_bias;
    }
  }

  // Update BGC optics & diagnostics if DOM elements exist
  if (optics) {
    const densityEl = document.getElementById("descDensity");
    if (densityEl && optics.potential_density_kg_m3 != null) {
      densityEl.textContent = `${optics.potential_density_kg_m3.toFixed(2)} kg/m³`;
    }
    const soundSpeedEl = document.getElementById("descSoundSpeed");
    if (soundSpeedEl && optics.sound_velocity_m_s != null) {
      soundSpeedEl.textContent = `${optics.sound_velocity_m_s.toFixed(1)} m/s`;
    }
    const parEl = document.getElementById("descPar");
    if (parEl && optics.downwelling_par_umol_m2_s != null) {
      parEl.textContent = `${optics.downwelling_par_umol_m2_s.toFixed(1)} μmol/m²·s`;
    }
    const bbpEl = document.getElementById("descBbp");
    if (bbpEl && optics.backscattering_bbp_m_inv != null) {
      bbpEl.textContent = `${optics.backscattering_bbp_m_inv.toFixed(5)} m⁻¹`;
    }
    const cdomEl = document.getElementById("descCdom");
    if (cdomEl && optics.cdom_fluorescence_ppb != null) {
      cdomEl.textContent = `${optics.cdom_fluorescence_ppb.toFixed(2)} ppb`;
    }
    const oxySatEl = document.getElementById("descOxySat");
    if (oxySatEl && optics.oxygen_saturation_pct != null) {
      oxySatEl.textContent = `${optics.oxygen_saturation_pct.toFixed(1)}%`;
    }
  }

  // Update Float Hydraulics if DOM elements exist
  if (hydraulics) {
    const bladderEl = document.getElementById("descBladder");
    if (bladderEl && hydraulics.hydraulic_bladder_cc != null) {
      bladderEl.textContent = `${hydraulics.hydraulic_bladder_cc.toFixed(1)} cc`;
    }
    const vacEl = document.getElementById("descVacuum");
    if (vacEl && hydraulics.internal_vacuum_inhg != null) {
      vacEl.textContent = `${hydraulics.internal_vacuum_inhg.toFixed(1)} inHg`;
    }
    const phaseEl = document.getElementById("descDivePhase");
    if (phaseEl && hydraulics.dive_phase) {
      phaseEl.textContent = hydraulics.dive_phase;
    }
    const linkEl = document.getElementById("descLinkMode");
    if (linkEl && hydraulics.link_mode) {
      linkEl.textContent = hydraulics.link_mode;
    }
  }
};

/**
 * Renders high-resolution CTD vertical profile SVG chart
 */
function renderProfileChart(profileData) {
  const svg = document.getElementById("modalChartSvg");
  if (!svg || !profileData || profileData.length === 0) return;

  const w = 700;
  const h = 300;
  const padLeft = 65;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 30;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  // Depth domain: 0 to 2000m (inverted Y axis, surface on top)
  const maxDepth = 2000;
  const getY = (depth) =>
    padTop + (Math.min(maxDepth, depth) / maxDepth) * plotH;

  // Value scales:
  // Temp: 0 to 30 °C
  const getXTemp = (temp) =>
    padLeft + (Math.max(0, Math.min(30, temp)) / 30) * plotW;
  // Salinity: 33.5 to 36.0 PSU
  const getXSal = (sal) =>
    padLeft + ((Math.max(33.5, Math.min(36.0, sal)) - 33.5) / 2.5) * plotW;
  // Oxygen: 0 to 220 μmol/kg
  const getXOxy = (o2) =>
    padLeft + (Math.max(0, Math.min(220, o2)) / 220) * plotW;

  let elements = [];

  // Background Depth Zone Shading & Atmospheric Bathymetry Bands
  const y0 = getY(0);
  const y200 = getY(200);
  const y1000 = getY(1000);
  const y2000 = getY(2000);

  // 1. Epipelagic (Sunlight Zone: 0 - 200m)
  elements.push(
    `<rect x="${padLeft}" y="${y0}" width="${plotW}" height="${y200 - y0}" fill="rgba(0, 229, 255, 0.05)" rx="4" />`
  );
  elements.push(
    `<text x="${w - padRight - 10}" y="${(y0 + y200) / 2 + 4}" fill="#00e5ff" font-family="'Space Mono', monospace" font-size="9.5" text-anchor="end" opacity="0.8">☀️ Sunlight Epipelagic (0–200m)</text>`
  );

  // 2. Mesopelagic (Twilight & OMZ: 200 - 1000m)
  elements.push(
    `<rect x="${padLeft}" y="${y200}" width="${plotW}" height="${y1000 - y200}" fill="rgba(192, 132, 252, 0.05)" rx="4" />`
  );
  elements.push(
    `<text x="${w - padRight - 10}" y="${(y200 + y1000) / 2 + 4}" fill="#c084fc" font-family="'Space Mono', monospace" font-size="9.5" text-anchor="end" opacity="0.8">🌘 Twilight & OMZ (200–1000m)</text>`
  );

  // 3. Bathypelagic (Midnight Abyss: 1000 - 2000m)
  elements.push(
    `<rect x="${padLeft}" y="${y1000}" width="${plotW}" height="${y2000 - y1000}" fill="rgba(15, 23, 42, 0.38)" rx="4" />`
  );
  elements.push(
    `<text x="${w - padRight - 10}" y="${(y1000 + y2000) / 2 + 4}" fill="#94a3b8" font-family="'Space Mono', monospace" font-size="9.5" text-anchor="end" opacity="0.8">🌌 Midnight Abyss (1000–2000m)</text>`
  );

  // Gridlines & Y-axis depth markers
  const depthTicks = [0, 200, 500, 1000, 1500, 2000];
  depthTicks.forEach((d) => {
    const y = getY(d);
    elements.push(
      `<line x1="${padLeft}" y1="${y}" x2="${w - padRight}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3,3" />`
    );
    elements.push(
      `<text x="${padLeft - 8}" y="${y + 4}" fill="#94a3b8" font-family="'Space Mono', monospace" font-size="9.5" text-anchor="end">${d}m</text>`
    );
  });

  // Vertical axis lines
  elements.push(
    `<line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + plotH}" stroke="rgba(0,229,255,0.3)" stroke-width="1.2" />`
  );
  elements.push(
    `<line x1="${padLeft}" y1="${padTop + plotH}" x2="${w - padRight}" y2="${padTop + plotH}" stroke="rgba(255,255,255,0.2)" />`
  );

  // Build line paths
  let tempPts = [];
  let salPts = [];
  let oxyPts = [];

  profileData.forEach((pt) => {
    const y = getY(pt.depthMeters);
    tempPts.push(`${getXTemp(pt.temperatureC).toFixed(1)},${y.toFixed(1)}`);
    salPts.push(`${getXSal(pt.salinityPSU).toFixed(1)},${y.toFixed(1)}`);
    oxyPts.push(
      `${getXOxy(pt.dissolvedOxygenUmolKg).toFixed(1)},${y.toFixed(1)}`
    );
  });

  // Draw Polylines
  elements.push(
    `<polyline fill="none" stroke="#ff9436" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" points="${tempPts.join(" ")}" />`
  );
  elements.push(
    `<polyline fill="none" stroke="#38bdf8" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" points="${salPts.join(" ")}" />`
  );
  elements.push(
    `<polyline fill="none" stroke="#c084fc" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" points="${oxyPts.join(" ")}" />`
  );

  // Data point dots on temperature
  profileData.forEach((pt) => {
    const x = getXTemp(pt.temperatureC);
    const y = getY(pt.depthMeters);
    elements.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#ff9436" stroke="#040a16" stroke-width="1.8"><title>${pt.depthMeters}m: ${pt.temperatureC}°C</title></circle>`
    );
  });

  // Live depth tracker line across chart (from scroller)
  elements.push(
    `<line id="profileChartDepthMarker" x1="${padLeft}" y1="${padTop}" x2="${w - padRight}" y2="${padTop}" stroke="#00f0ff" stroke-width="1.8" stroke-dasharray="4,2" opacity="0.95"><title>Current depth</title></line>`
  );

  // Interactive mouse pointer observation crosshair line
  elements.push(
    `<line id="cursorLineH" x1="${padLeft}" y1="${padTop}" x2="${w - padRight}" y2="${padTop}" stroke="#ffe042" stroke-width="1.8" stroke-dasharray="3,2" opacity="0.95" style="display:none;"></line>`
  );

  // Observation intersection dots
  elements.push(
    `<circle id="cursorDotTemp" r="5.5" fill="#ff9436" stroke="#ffffff" stroke-width="2" style="display:none; filter:drop-shadow(0 0 6px #ff9436);"></circle>`
  );
  elements.push(
    `<circle id="cursorDotSal" r="5.5" fill="#38bdf8" stroke="#ffffff" stroke-width="2" style="display:none; filter:drop-shadow(0 0 6px #38bdf8);"></circle>`
  );
  elements.push(
    `<circle id="cursorDotOxy" r="5.5" fill="#c084fc" stroke="#ffffff" stroke-width="2" style="display:none; filter:drop-shadow(0 0 6px #c084fc);"></circle>`
  );

  svg.innerHTML = elements.join("");

  // Wire mouse pointer tracking and click-to-dive observation events
  attachChartPointerEvents();
}

/**
 * Attaches interactive mouse pointer observation events to the profile chart SVG
 */
function attachChartPointerEvents() {
  const svg = document.getElementById("modalChartSvg");
  if (!svg || svg.dataset.pointerBound) return;
  svg.dataset.pointerBound = "true";

  const w = 700;
  const h = 300;
  const padLeft = 65;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 30;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  const getXTemp = (temp) =>
    padLeft + (Math.max(0, Math.min(30, temp)) / 30) * plotW;
  const getXSal = (sal) =>
    padLeft + ((Math.max(33.5, Math.min(36.0, sal)) - 33.5) / 2.5) * plotW;
  const getXOxy = (o2) =>
    padLeft + (Math.max(0, Math.min(220, o2)) / 220) * plotW;

  const hudDepth = document.getElementById("hudDepthTag");
  const hudMetrics = document.getElementById("hudMetricsTags");
  const hudTemp = document.getElementById("hudTempTag");
  const hudSal = document.getElementById("hudSalTag");
  const hudOxy = document.getElementById("hudOxyTag");
  const hudChl = document.getElementById("hudChlTag");
  const hudZone = document.getElementById("hudZoneTag");
  const diveBtn = document.getElementById("hudDiveBtn");

  svg.addEventListener("mousemove", (e) => {
    if (!currentFloatData) return;
    const rect = svg.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const scaleY = h / rect.height;
    const svgY = mouseY * scaleY;

    const clampedY = Math.max(padTop, Math.min(padTop + plotH, svgY));
    const depthRatio = (clampedY - padTop) / plotH;
    const depthMeters = Math.round(depthRatio * 2000);
    window.currentPointedDepth = depthMeters;

    const obs = oceanDataService.interpolateAtDepth(
      currentFloatData,
      depthMeters
    );

    const lineH = document.getElementById("cursorLineH");
    const dotTemp = document.getElementById("cursorDotTemp");
    const dotSal = document.getElementById("cursorDotSal");
    const dotOxy = document.getElementById("cursorDotOxy");

    if (lineH) {
      lineH.style.display = "block";
      lineH.setAttribute("y1", clampedY.toFixed(1));
      lineH.setAttribute("y2", clampedY.toFixed(1));
    }
    if (dotTemp) {
      dotTemp.style.display = "block";
      dotTemp.setAttribute("cx", getXTemp(obs.temperatureC).toFixed(1));
      dotTemp.setAttribute("cy", clampedY.toFixed(1));
    }
    if (dotSal) {
      dotSal.style.display = "block";
      dotSal.setAttribute("cx", getXSal(obs.salinityPSU).toFixed(1));
      dotSal.setAttribute("cy", clampedY.toFixed(1));
    }
    if (dotOxy) {
      dotOxy.style.display = "block";
      dotOxy.setAttribute("cx", getXOxy(obs.dissolvedOxygenUmolKg).toFixed(1));
      dotOxy.setAttribute("cy", clampedY.toFixed(1));
    }

    let layerName = "☀️ Epipelagic (Sunlight)";
    if (depthMeters > 1000) {
      layerName = "🌌 Bathypelagic (Abyss)";
    } else if (depthMeters > 200) {
      layerName = "🌘 Mesopelagic (Twilight OMZ)";
    }

    if (hudDepth) {
      hudDepth.innerHTML = `<span class="hud-depth-icon">📍</span> Pointed Depth: <strong style="color:#ffffff; font-size:0.86rem;">${depthMeters} m</strong> <span style="font-size:0.7rem; color:#ffe042; font-weight:600;">(${layerName})</span>`;
    }
    if (diveBtn) {
      diveBtn.style.display = "inline-flex";
    }
    if (hudMetrics) {
      hudMetrics.style.display = "flex";
      if (hudTemp) hudTemp.innerHTML = `🌡 Temp: <strong>${obs.temperatureC.toFixed(1)} °C</strong>`;
      if (hudSal) hudSal.innerHTML = `💧 Salinity: <strong>${obs.salinityPSU.toFixed(1)} PSU</strong>`;
      if (hudOxy)
        hudOxy.innerHTML = `🫧 O₂: <strong>${obs.dissolvedOxygenUmolKg} μmol/kg</strong>`;
      if (hudChl)
        hudChl.innerHTML = `🌿 Chl: <strong>${obs.chlorophyllMgM3.toFixed(2)} mg/m³</strong>`;
      if (hudZone) {
        hudZone.textContent = layerName;
      }
    }
  });

  svg.addEventListener("mouseleave", () => {
    const lineH = document.getElementById("cursorLineH");
    const dotTemp = document.getElementById("cursorDotTemp");
    const dotSal = document.getElementById("cursorDotSal");
    const dotOxy = document.getElementById("cursorDotOxy");

    if (lineH) lineH.style.display = "none";
    if (dotTemp) dotTemp.style.display = "none";
    if (dotSal) dotSal.style.display = "none";
    if (dotOxy) dotOxy.style.display = "none";

    if (hudDepth) {
      hudDepth.innerHTML = `<span class="hud-depth-icon">📏</span> Move cursor over chart to inspect depth observations · Click to dive`;
    }
    if (diveBtn) {
      diveBtn.style.display = "none";
    }
  });

  // Clicking anywhere on the chart dives to that exact depth
  svg.addEventListener("click", (e) => {
    const rect = svg.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const scaleY = h / rect.height;
    const svgY = mouseY * scaleY;
    const clampedY = Math.max(padTop, Math.min(padTop + plotH, svgY));
    const depthRatio = (clampedY - padTop) / plotH;
    const depthMeters = Math.round(depthRatio * 2000);

    if (window.jumpToDepth) {
      window.jumpToDepth(depthMeters);
    }
  });
}

/**
 * Populates Trajectory modal drift history table
 */
function renderTrajectoryTable(history) {
  const tbody = document.getElementById("trajectoryTableBody");
  if (!tbody || !history) return;

  tbody.innerHTML = history
    .map((h) => {
      const cycle = h.cycleNumber ?? h.cycle ?? 1;
      const date = h.date || "--";
      const lat = (h.lat !== undefined ? h.lat : 11.6).toFixed(4);
      const lon = (h.lon !== undefined ? h.lon : 92.5).toFixed(4);
      const temp = (h.tempC !== undefined ? h.tempC : (h.temp !== undefined ? h.temp : 28.0)).toFixed(1);
      const speed = (h.speedMs !== undefined ? h.speedMs : (h.speed !== undefined ? h.speed : 0.42));
      const direction = h.direction || "→ NE";
      return `
    <tr>
      <td style="color:#00e5ff; font-weight:700;">#${cycle}</td>
      <td style="color:#94a3b8;">${date}</td>
      <td style="color:#ffffff;">${lat}° N, ${lon}° E</td>
      <td style="color:#ff9436; font-weight:700;">${temp} °C</td>
      <td style="color:#38bdf8;">${speed} m/s ${direction}</td>
    </tr>
  `;
    })
    .join("");
}

// Active station and float data state
let currentStation = null;
let activeCurrentSpeed = 0.42;

/**
 * Populates all DOM sidebar and subtab elements with active float data
 */
function populateUIWithFloatData(floatData) {
  if (!floatData) return;
  currentFloatData = floatData;

  const nameEl = document.getElementById("descStationName");
  const codeEl = document.getElementById("descStationCode");
  const locPrimEl = document.getElementById("descLocPrimary");
  const locSecEl = document.getElementById("descLocSecondary");
  const coordsEl = document.getElementById("descCoords");
  const tempEl = document.getElementById("descTemp");
  const tempLabelEl = document.getElementById("descTempLabel");
  const salEl = document.getElementById("descSalinity");
  const depthEl = document.getElementById("descDepth");
  const oxyEl = document.getElementById("descOxygen");
  const chlEl = document.getElementById("descChlorophyll");
  const currentEl = document.getElementById("descCurrent");
  const qualityEl = document.getElementById("descQuality");
  const cycleEl = document.getElementById("descCycle");
  const lastProfEl = document.getElementById("descLastProfile");
  const batteryEl = document.getElementById("descBattery");
  const statusEl = document.getElementById("descStatusPill");
  const modalCycleEl = document.getElementById("modalProfileCycle");

  if (nameEl) nameEl.textContent = `Argo Float #${floatData.floatId}`;
  if (codeEl)
    codeEl.textContent = `${floatData.stationCode} · ${floatData.platformType}`;
  if (statusEl)
    statusEl.textContent = (floatData.status || "ACTIVE").toUpperCase();

  if (locPrimEl)
    locPrimEl.textContent =
      floatData.locationPrimary ||
      floatData.coordinates?.seaPrimary ||
      floatData.coordinates?.seaBasin ||
      "Indian Ocean";
  if (locSecEl)
    locSecEl.textContent =
      floatData.locationSecondary ||
      floatData.coordinates?.seaSecondary ||
      "Port Blair";

  if (coordsEl && floatData.coordinates) {
    const latStr = `${Math.abs(floatData.coordinates.lat).toFixed(4)}° ${floatData.coordinates.lat >= 0 ? "N" : "S"}`;
    const lonStr = `${Math.abs(floatData.coordinates.lon).toFixed(4)}° ${floatData.coordinates.lon >= 0 ? "E" : "W"}`;
    coordsEl.textContent = `${latStr}, ${lonStr}`;
  }

  const sci = floatData.scientificData || {};
  if (tempEl)
    tempEl.textContent = sci.surfaceTempC !== undefined && sci.surfaceTempC !== null ? `${Number(sci.surfaceTempC).toFixed(2)} °C` : "—";
  if (tempLabelEl) tempLabelEl.textContent = "🌡 Surface Temp";
  if (salEl)
    salEl.textContent = sci.surfaceSalinityPSU !== undefined && sci.surfaceSalinityPSU !== null ? `${Number(sci.surfaceSalinityPSU).toFixed(2)} PSU` : "—";
  if (depthEl) depthEl.textContent = "0 m / 2000 m";
  if (oxyEl) oxyEl.textContent = sci.dissolvedOxygenUmolKg != null ? `${sci.dissolvedOxygenUmolKg} μmol/kg` : "— (Core Argo)";
  if (chlEl)
    chlEl.textContent = sci.chlorophyllMgM3 != null ? `${Number(sci.chlorophyllMgM3).toFixed(2)} mg/m³` : "— (Core Argo)";
  if (currentEl)
    currentEl.textContent =
      sci.currentDisplay ||
      (sci.currentSpeedMs != null ? `${sci.currentSpeedMs} m/s → ${sci.currentDirection || "NE"}` : "— (Lagrangian Drift)");
  if (qualityEl) qualityEl.textContent = sci.dataQuality || "GOOD (QC 1, 2, 5)";

  const mission = floatData.mission || {};
  if (cycleEl)
    cycleEl.textContent =
      mission.cycleDisplay || (mission.cycleNumber ? `#${mission.cycleNumber}` : "—");
  if (lastProfEl)
    lastProfEl.textContent = mission.lastProfileRelative || floatData.lastObservation || "—";
  if (batteryEl)
    batteryEl.textContent =
      mission.batteryDisplay || (mission.batteryPercent ? `${mission.batteryPercent}%` : "85%");
  if (modalCycleEl)
    modalCycleEl.textContent = `Cycle ${mission.cycleDisplay || (mission.cycleNumber ? `#${mission.cycleNumber}` : "—")}`;

  // Update Temporal Status Banner
  const statusTxt = document.getElementById("temporalStatusText");
  const regimeBadge = document.getElementById("temporalRegimeBadge");
  const dateInput = document.getElementById("oceanDatePicker");
  const timeInput = document.getElementById("oceanTimePicker");

  const tempInfo = floatData.temporalInfo || {};
  if (dateInput && tempInfo.queriedDate) dateInput.value = tempInfo.queriedDate;
  if (timeInput && tempInfo.queriedTime) timeInput.value = tempInfo.queriedTime;

  if (statusTxt) {
    const timeDisplay = tempInfo.queriedDate
      ? `${tempInfo.day || 10} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][(tempInfo.month || 9) - 1]} ${tempInfo.year || 2024}, ${tempInfo.queriedTime || '12:00'} UTC`
      : (floatData.lastObservation || "10 Sep 2024, 12:00 UTC");
    statusTxt.innerHTML = `Selected Fix: <strong>${timeDisplay}</strong> · Cycle #${mission.cycleNumber || 147}`;
  }

  if (regimeBadge) {
    const regime = tempInfo.regime || "Post-Monsoon Transition";
    regimeBadge.innerHTML = `<span class="regime-tag">🌊 ${regime}</span>`;
  }

  // Update active ocean current speed for 3D streamlines
  if (sci.currentSpeedMs) {
    activeCurrentSpeed = sci.currentSpeedMs;
  }

  // Render SVG profile chart and trajectory table
  if (floatData.verticalProfile) {
    renderProfileChart(floatData.verticalProfile);
  }
  if (floatData.trajectoryHistory) {
    renderTrajectoryTable(floatData.trajectoryHistory);
  }
}

// Temporal Filter Handlers (Date, Year, Time)
window.onTemporalDateChange = function (event) {
  // Clear preset active classes when manual input is edited
  document.querySelectorAll(".preset-pill").forEach((pill) => pill.classList.remove("active"));
};

window.applyPresetTemporal = async function (presetKey) {
  document.querySelectorAll(".preset-pill").forEach((pill) => {
    pill.classList.toggle("active", pill.getAttribute("data-preset") === presetKey);
  });

  const dateInput = document.getElementById("oceanDatePicker");
  const timeInput = document.getElementById("oceanTimePicker");

  if (presetKey === "latest") {
    const now = new Date();
    if (dateInput) dateInput.value = now.toISOString().split("T")[0];
    if (timeInput) timeInput.value = "12:00";
  } else if (presetKey === "monsoon") {
    if (dateInput) dateInput.value = "2024-07-22";
    if (timeInput) timeInput.value = "08:30";
  } else if (presetKey === "premonsoon") {
    if (dateInput) dateInput.value = "2024-05-14";
    if (timeInput) timeInput.value = "13:30";
  } else if (presetKey === "winter") {
    if (dateInput) dateInput.value = "2024-01-18";
    if (timeInput) timeInput.value = "06:00";
  } else if (presetKey === "historical") {
    if (dateInput) dateInput.value = "2021-10-05";
    if (timeInput) timeInput.value = "10:00";
  }

  await window.applyTemporalFilter();
};

window.applyTemporalFilter = async function () {
  const dateInput = document.getElementById("oceanDatePicker");
  const timeInput = document.getElementById("oceanTimePicker");
  const spinner = document.getElementById("temporalSpinner");
  const queryBtn = document.getElementById("btnQueryTemporal");

  const dateVal = dateInput ? dateInput.value : "";
  const timeVal = timeInput ? timeInput.value : "12:00";

  // Compute ISO timestamp for historical queries
  const isLatest = document.getElementById("pill-latest")?.classList.contains("active");
  const isoTimestamp = (!isLatest && dateVal) ? `${dateVal}T${timeVal}:00Z` : null;
  window.currentTemporalTimestamp = isoTimestamp;

  if (window.oceanStore?.getState) {
    window.oceanStore.getState().setSelectedTimestamp(isoTimestamp || new Date().toISOString());
  }

  if (spinner) spinner.style.display = "inline";
  if (queryBtn) queryBtn.style.opacity = "0.7";

  try {
    const station = currentStation || getStationById("A7");
    const updatedData = await oceanDataService.getFloatDetails(station, {
      date: dateVal,
      time: timeVal,
    });
    populateUIWithFloatData(updatedData);

    // Refresh live depth data with this new temporal context
    const currentDepth = window.OCEAN_STATE?.depthMeters || 15;
    if (typeof window.updateLiveDepthData === 'function') {
      window.updateLiveDepthData(currentDepth);
    }

    // Subtle pulse feedback on the active fix dot
    const pulseDot = document.getElementById("temporalPulseDot");
    if (pulseDot) {
      pulseDot.style.background = "#00f0ff";
      pulseDot.style.boxShadow = "0 0 14px #00f0ff";
      setTimeout(() => {
        pulseDot.style.background = "#10b981";
        pulseDot.style.boxShadow = "0 0 8px #10b981";
      }, 600);
    }
  } catch (err) {
    console.error("[applyTemporalFilter] Error fetching temporal ocean data:", err);
  } finally {
    if (spinner) spinner.style.display = "none";
    if (queryBtn) queryBtn.style.opacity = "1";
  }
};

window.queryOceanDataByDateTime = async function (dateStr, timeStr = "12:00") {
  const dateInput = document.getElementById("oceanDatePicker");
  const timeInput = document.getElementById("oceanTimePicker");
  if (dateInput) dateInput.value = dateStr;
  if (timeInput) timeInput.value = timeStr;
  await window.applyTemporalFilter();
};

// Asynchronously load float metadata & populate right-hand description bar
async function initFloatDescription() {
  try {
  const urlParams = new URLSearchParams(window.location.search);
  const buoyId = urlParams.get("id") || "A7";
  const urlLat = urlParams.get("lat");
  const urlLon = urlParams.get("lon");
  const urlSea = urlParams.get("sea");

  let stationFallback = getStationById(buoyId) || getStationById("A7");

  // Numeric WMO ids arrive from the globe orbital-dive (e.g. ?id=2902251).
  // getStationById() falls back to AD07 for unknown ids, so preserve the real
  // WMO + coordinates explicitly instead of inheriting the fallback's wmoId.
  const numericWmo = String(buoyId || "").replace(/\D/g, "");
  const isNumericWmo = numericWmo.length >= 5;

  if (urlLat && urlLon) {
    const lat = parseFloat(urlLat);
    const lon = parseFloat(urlLon);
    currentStation = {
      ...stationFallback,
      id: isNumericWmo ? numericWmo : buoyId,
      code: isNumericWmo ? numericWmo : buoyId,
      wmoId: isNumericWmo ? numericWmo : (stationFallback.wmoId || numericWmo || "2902351"),
      lat: Number.isFinite(lat) ? lat : stationFallback.lat,
      lon: Number.isFinite(lon) ? lon : stationFallback.lon,
      sea: urlSea || stationFallback.sea,
      name: `Argo Float ${buoyId}`
    };
  } else if (isNumericWmo) {
    // Direct ?id=<wmo> link without coordinates — keep the WMO, use fallback position
    currentStation = {
      ...stationFallback,
      id: numericWmo,
      code: numericWmo,
      wmoId: numericWmo,
      name: `Argo Float ${numericWmo}`,
    };
  } else {
    currentStation = stationFallback;
  }
  let floatData = null;
  try {
    floatData = await oceanDataService.getFloatDetails(currentStation);
  } catch (dataErr) {
    console.warn("[Ocean] getFloatDetails failed, retrying with default station:", dataErr?.message);
    currentStation = getStationById("A7");
    floatData = await oceanDataService.getFloatDetails(currentStation);
  }
  populateUIWithFloatData(floatData);

  if (window.oceanStore) {
    if (isNumericWmo) {
      await window.oceanStore.getState().selectFloat(numericWmo);
    } else {
      const fullInstrumentData = {
        ...currentStation,
        name: floatData.buoyName || currentStation?.name || currentStation?.id,
        sea: floatData.locationPrimary || "Indian Ocean",
        region: floatData.locationSecondary || "Central Basin",
        type: floatData.platformType?.toLowerCase().includes("glider") ? "glider" : (floatData.platformType?.toLowerCase().includes("ctd") ? "ctd" : "argo"),
        platform: floatData.platformType || "APEX Profiling Float",
        lat: floatData.coordinates?.lat || currentStation?.lat,
        lon: floatData.coordinates?.lon || currentStation?.lon,
        depth: floatData.maxDepthMeters || 2000,
        depthMeters: floatData.maxDepthMeters || 2000,
        status: (floatData.status || "active").toLowerCase(),
        telemetry: {
          temperatureC: floatData.scientificData?.surfaceTempC,
          salinityPSU: floatData.scientificData?.surfaceSalinityPSU,
          dissolvedOxygen: floatData.scientificData?.dissolvedOxygenUmolKg,
          chlorophyll: floatData.scientificData?.chlorophyllMgM3,
          currentSpeed: floatData.scientificData?.currentSpeedMs,
          currentDirection: floatData.scientificData?.currentDirection,
          batteryPct: floatData.mission?.batteryPercent,
          cycle: floatData.mission?.cycleNumber,
          status: (floatData.status || "active").toLowerCase(),
          missionWaypoint: floatData.locationSecondary,
          vessel: floatData.locationSecondary,
          sourceLabel: floatData.source,
          sourceDetails: floatData.sourceDetails,
        },
        geoCoordinates: {
          lat: floatData.coordinates?.lat || currentStation?.lat,
          lon: floatData.coordinates?.lon || currentStation?.lon,
        }
      };
      window.oceanStore.getState().setActiveInstrument(fullInstrumentData);
    }
  }

  // Ensure WorkspaceManager opens this instrument card in the right dock
  const targetInstId = isNumericWmo ? `argo-${numericWmo}` : currentStation.id;
  if (window.workspaceManager?.openInstrument) {
    window.workspaceManager.openInstrument(targetInstId);
  } else if (window.openInstrument) {
    window.openInstrument(targetInstId);
  }

  // Apply the initial time of day preset
  applySolarPreset(initialPreset);
  } catch (bootErr) {
    // NEVER let a data failure kill the 3D scene — fall back to default station
    console.error("[Ocean] initFloatDescription failed, using fallback station:", bootErr);
    try {
      currentStation = getStationById("A7");
      const fallbackData = await oceanDataService.getFloatDetails(currentStation);
      populateUIWithFloatData(fallbackData);
      applySolarPreset(initialPreset);
    } catch (_fatal) { /* scene + animate() below still run */ }
  }
}

initFloatDescription().catch((e) => console.error("[Ocean] initFloatDescription unhandled:", e));

// ============================================================================
// 5. VOLUMETRIC CAUSTIC SUNLIGHT SHAFTS (GOD RAYS)
// Shimmering downwelling sun rays in the photic zone (0m - 180m)
// ============================================================================
const GOD_RAY_COUNT = 14;
const godRaysGroup = new THREE.Group();
godRaysGroup.name = "volumetric_god_rays";

const godRayVertexShader = `
  varying vec3 vWorldPos;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const godRayFragmentShader = `
  uniform float uTime;
  uniform float uDepthFade;
  uniform vec3 uRayColor;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    // Vertical extinction: intense near surface y=0, exponentially decaying down to y=-16
    float depthFade = clamp(exp(vWorldPos.y * 0.26), 0.0, 1.0);
    
    // Beam cross-section falloff (soft Gaussian profile across beam width)
    float edgeFade = sin(vUv.x * 3.14159);
    edgeFade = pow(edgeFade, 1.6);

    // Shimmering caustic wave interference
    float c1 = sin(vWorldPos.x * 0.4 + vWorldPos.z * 0.3 + uTime * 1.6);
    float c2 = cos(vWorldPos.x * 0.35 - vWorldPos.z * 0.45 - uTime * 1.3);
    float caustics = (c1 * c2) * 0.4 + 0.6;

    float intensity = depthFade * edgeFade * caustics * uDepthFade;
    if (intensity < 0.008) discard;

    vec3 col = uRayColor * intensity;
    gl_FragColor = vec4(col, intensity * 0.65);
  }
`;

const godRayMat = new THREE.ShaderMaterial({
  vertexShader: godRayVertexShader,
  fragmentShader: godRayFragmentShader,
  uniforms: {
    uTime: { value: 0 },
    uDepthFade: { value: 0.0 },
    uRayColor: { value: new THREE.Color(0x67e8f9) },
  },
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});

// Construct radiating conical light shaft geometry
for (let i = 0; i < GOD_RAY_COUNT; i++) {
  const angle = (i / GOD_RAY_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
  const radiusTop = 1.0 + Math.random() * 2.5;
  const radiusBottom = 12.0 + Math.random() * 16.0;
  const height = 18.0 + Math.random() * 8.0;
  
  const rayGeo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 16, 8, true);
  // Place top at y = -0.1 (just beneath ocean surface)
  rayGeo.translate(0, -height / 2 - 0.1, 0);

  const rayMesh = new THREE.Mesh(rayGeo, godRayMat);
  rayMesh.rotation.y = angle;
  rayMesh.rotation.z = (Math.random() - 0.5) * 0.18;
  rayMesh.rotation.x = 0.15 + (Math.random() - 0.5) * 0.12;
  rayMesh.position.set(
    (Math.random() - 0.5) * 12,
    0,
    (Math.random() - 0.5) * 12
  );
  godRaysGroup.add(rayMesh);
}
godRaysGroup.visible = false;
scene.add(godRaysGroup);

// ============================================================================
// 5.5. ULTRA-REALISTIC DEEP OCEAN MARINE SNOW & BIOLUMINESCENT PARTICLES
// Continuous microscopic organic detritus & pulsing plankton drifting in currents
// ============================================================================
const MARINE_SNOW_COUNT = 2800;
const snowPositions = new Float32Array(MARINE_SNOW_COUNT * 3);
const snowSizes = new Float32Array(MARINE_SNOW_COUNT);
const snowSpeeds = new Float32Array(MARINE_SNOW_COUNT);
const snowPhases = new Float32Array(MARINE_SNOW_COUNT);
const snowBiolum = new Float32Array(MARINE_SNOW_COUNT);
const snowColors = new Float32Array(MARINE_SNOW_COUNT * 3);

for (let i = 0; i < MARINE_SNOW_COUNT; i++) {
  const i3 = i * 3;
  // Volume: around camera/argo travel cylinder
  snowPositions[i3] = (Math.random() - 0.5) * 44;
  snowPositions[i3 + 1] = -Math.random() * 95; // 0 to -95m
  snowPositions[i3 + 2] = (Math.random() - 0.5) * 44;

  snowSizes[i] = 1.2 + Math.random() * 2.8;
  snowSpeeds[i] = 0.25 + Math.random() * 0.65;
  snowPhases[i] = Math.random() * Math.PI * 2;

  // Bioluminescent probability: ~18% of particles in deep water exhibit bio-pulses
  const isBio = Math.random() < 0.18 ? 1.0 : 0.0;
  snowBiolum[i] = isBio;

  if (isBio > 0.5) {
    if (Math.random() > 0.5) {
      // Electric cyan bioluminescence
      snowColors[i3] = 0.22;
      snowColors[i3 + 1] = 0.92;
      snowColors[i3 + 2] = 1.0;
    } else {
      // Bioluminescent emerald green
      snowColors[i3] = 0.15;
      snowColors[i3 + 1] = 0.98;
      snowColors[i3 + 2] = 0.65;
    }
  } else {
    // Translucent organic marine snow (silver-cyan ivory)
    snowColors[i3] = 0.85;
    snowColors[i3 + 1] = 0.94;
    snowColors[i3 + 2] = 1.0;
  }
}

const marineSnowGeo = new THREE.BufferGeometry();
marineSnowGeo.setAttribute("position", new THREE.BufferAttribute(snowPositions, 3));
marineSnowGeo.setAttribute("aSize", new THREE.BufferAttribute(snowSizes, 1));
marineSnowGeo.setAttribute("aSpeed", new THREE.BufferAttribute(snowSpeeds, 1));
marineSnowGeo.setAttribute("aPhase", new THREE.BufferAttribute(snowPhases, 1));
marineSnowGeo.setAttribute("aBiolum", new THREE.BufferAttribute(snowBiolum, 1));
marineSnowGeo.setAttribute("aColor", new THREE.BufferAttribute(snowColors, 3));

const marineSnowVertexShader = `
  uniform float uTime;
  uniform float uUnderwaterRatio;
  attribute float aSize;
  attribute float aSpeed;
  attribute float aPhase;
  attribute float aBiolum;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vBiolum;

  void main() {
    vec3 pos = position;

    // Gentle vertical sinking drift (loops seamlessly across 95m column)
    float yTravel = mod(-pos.y + uTime * (0.35 + aSpeed * 0.4), 95.0);
    pos.y = -yTravel;

    // Oceanic micro-turbulence / horizontal eddy sway
    pos.x += sin(uTime * 0.5 + aPhase) * 0.35;
    pos.z += cos(uTime * 0.42 + aPhase * 1.2) * 0.35;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    
    // Distance attenuation for point sprite
    float pSize = aSize * (150.0 / -mvPosition.z);
    gl_PointSize = clamp(pSize, 1.2, 6.5);

    vColor = aColor;
    vBiolum = aBiolum;

    // Soft distance clipping so particles fade out smoothly
    float dist = length(mvPosition.xyz);
    vAlpha = smoothstep(42.0, 14.0, dist) * smoothstep(0.4, 1.8, dist);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const marineSnowFragmentShader = `
  uniform float uTime;
  uniform float uUnderwaterRatio;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vBiolum;

  void main() {
    // Soft circular Gaussian disc
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    float discAlpha = smoothstep(0.5, 0.06, dist);

    vec3 col = vColor;
    float pulse = 0.0;
    
    // Bioluminescent pulsation in twilight/abyssal depths (>200m)
    if (vBiolum > 0.5 && uUnderwaterRatio > 0.04) {
      pulse = sin(uTime * 2.4 + vBiolum * 17.0) * 0.5 + 0.5;
      col = mix(col, vec3(0.1, 0.98, 0.85), pulse * 0.7);
    }

    float finalAlpha = discAlpha * vAlpha * (0.55 + pulse * 0.45);
    gl_FragColor = vec4(col, finalAlpha);
  }
`;

const marineSnowMat = new THREE.ShaderMaterial({
  vertexShader: marineSnowVertexShader,
  fragmentShader: marineSnowFragmentShader,
  uniforms: {
    uTime: { value: 0 },
    uUnderwaterRatio: { value: 0 },
  },
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

const marineSnowPoints = new THREE.Points(marineSnowGeo, marineSnowMat);
marineSnowPoints.visible = false;
scene.add(marineSnowPoints);

// Backward-compatibility alias
const bubblesMesh = marineSnowPoints;

// ============================================================================
// 6. APEX ARGO PROFILING FLOAT 3D MODEL
// ============================================================================
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
  z: 1.5, // <--- [CHANGE POSITION HERE] Moved back to 1.5 (was 7.5). Set to 0.0 or -2.0 to move further back!
  scale: 1.0, // Overall scale of the float model
};
window.ARGO_FLOAT_CONFIG = ARGO_FLOAT_CONFIG;

// Dive tracking variables for scroller synchronization
let argoDiveY = 0.0;
let argoDiveRatio = 0.0;

export function createArgoFloatModel() {
  const floatGroup = new THREE.Group();

  // Materials matching the real APEX Argo float
  const yellowHullMat = new THREE.MeshStandardMaterial({
    color: 0xf6c500, // Vibrant marine safety yellow
    roughness: 0.28,
    metalness: 0.12,
  });

  const yellowBaseMat = new THREE.MeshStandardMaterial({
    color: 0xefbd00,
    roughness: 0.35,
    metalness: 0.1,
  });

  const blackHardwareMat = new THREE.MeshStandardMaterial({
    color: 0x18191c, // Dark anodized aluminum / graphite
    roughness: 0.45,
    metalness: 0.4,
  });

  const whiteCollarMat = new THREE.MeshStandardMaterial({
    color: 0xf8f9fa, // Damping collar white
    roughness: 0.22,
    metalness: 0.05,
  });

  const antennaMat = new THREE.MeshStandardMaterial({
    color: 0x121214, // High-frequency satellite antenna
    roughness: 0.3,
    metalness: 0.75,
  });

  const sensorMetalMat = new THREE.MeshStandardMaterial({
    color: 0xdde3ea, // Conductivity sensor probe chrome/metal
    roughness: 0.15,
    metalness: 0.9,
  });

  const HULL_RADIUS = 0.24;

  // 1. Bottom Flared Base (External Hydraulic Oil Bladder Housing)
  const baseFlangeGeo = new THREE.CylinderGeometry(0.32, 0.38, 0.3, 32);
  const baseFlange = new THREE.Mesh(baseFlangeGeo, yellowBaseMat);
  baseFlange.position.y = -2.15;
  floatGroup.add(baseFlange);

  const baseChamferGeo = new THREE.CylinderGeometry(0.38, 0.34, 0.09, 32);
  const baseChamfer = new THREE.Mesh(baseChamferGeo, yellowBaseMat);
  baseChamfer.position.y = -2.32;
  floatGroup.add(baseChamfer);

  // Black lower collar joint
  const baseJointGeo = new THREE.CylinderGeometry(0.25, 0.31, 0.15, 32);
  const baseJoint = new THREE.Mesh(baseJointGeo, blackHardwareMat);
  baseJoint.position.y = -1.94;
  floatGroup.add(baseJoint);

  // 2. Lower Yellow Cylindrical Pressure Hull
  const lowerHullGeo = new THREE.CylinderGeometry(
    HULL_RADIUS,
    HULL_RADIUS,
    1.95,
    32,
  );
  const lowerHull = new THREE.Mesh(lowerHullGeo, yellowHullMat);
  lowerHull.position.y = -0.92;
  floatGroup.add(lowerHull);

  // Hull joint seam band
  const seamBandGeo = new THREE.CylinderGeometry(
    HULL_RADIUS + 0.005,
    HULL_RADIUS + 0.005,
    0.03,
    32,
  );
  const seamBand = new THREE.Mesh(seamBandGeo, blackHardwareMat);
  seamBand.position.y = -0.95;
  floatGroup.add(seamBand);

  // 3. White Damping Flange Disk / Collar (Stabilizing Ring)
  // Sits right around the waterline to minimize wave rocking
  const collarDiskGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.038, 48);
  const collarDisk = new THREE.Mesh(collarDiskGeo, whiteCollarMat);
  collarDisk.position.y = 0.14;
  floatGroup.add(collarDisk);

  const collarSupportGeo = new THREE.CylinderGeometry(
    HULL_RADIUS + 0.025,
    HULL_RADIUS + 0.025,
    0.08,
    32,
  );
  const collarSupport = new THREE.Mesh(collarSupportGeo, whiteCollarMat);
  collarSupport.position.y = 0.11;
  floatGroup.add(collarSupport);

  // 4. Upper Yellow Pressure Hull Section
  const upperHullGeo = new THREE.CylinderGeometry(
    HULL_RADIUS,
    HULL_RADIUS,
    1.05,
    32,
  );
  const upperHull = new THREE.Mesh(upperHullGeo, yellowHullMat);
  upperHull.position.y = 0.68;
  floatGroup.add(upperHull);

  // Upper joint seam band
  const upperSeamGeo = new THREE.CylinderGeometry(
    HULL_RADIUS + 0.005,
    HULL_RADIUS + 0.005,
    0.025,
    32,
  );
  const upperSeam = new THREE.Mesh(upperSeamGeo, blackHardwareMat);
  upperSeam.position.y = 1.18;
  floatGroup.add(upperSeam);

  // 5. Dark Graphite Domed Shoulder Cap
  const shoulderGeo = new THREE.CylinderGeometry(
    0.19,
    HULL_RADIUS + 0.005,
    0.22,
    32,
  );
  const shoulder = new THREE.Mesh(shoulderGeo, blackHardwareMat);
  shoulder.position.y = 1.3;
  floatGroup.add(shoulder);

  const domeCapGeo = new THREE.SphereGeometry(
    0.19,
    32,
    16,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  const domeCap = new THREE.Mesh(domeCapGeo, blackHardwareMat);
  domeCap.position.y = 1.41;
  floatGroup.add(domeCap);

  // 6. CTD Sensor Pod Head (Conductivity, Temperature & Depth sensors)
  // Sensor guard tower (slotted cylindrical cage)
  const sensorTowerGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.58, 16);
  const sensorTower = new THREE.Mesh(sensorTowerGeo, blackHardwareMat);
  sensorTower.position.set(0.045, 1.74, 0.0);
  floatGroup.add(sensorTower);

  // Sensor guard ribs
  for (let r = 0; r < 4; r++) {
    const ribGeo = new THREE.BoxGeometry(0.02, 0.52, 0.02);
    const rib = new THREE.Mesh(ribGeo, blackHardwareMat);
    const angle = (r * Math.PI) / 2;
    rib.position.set(
      0.045 + Math.cos(angle) * 0.075,
      1.74,
      Math.sin(angle) * 0.075,
    );
    floatGroup.add(rib);
  }

  // CTD temperature/conductivity intake tube (chrome/white probe)
  const sensorTubeGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.52, 12);
  const sensorTube = new THREE.Mesh(sensorTubeGeo, sensorMetalMat);
  sensorTube.position.set(-0.045, 1.72, 0.03);
  floatGroup.add(sensorTube);

  const sensorTubeCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.07, 12),
    whiteCollarMat,
  );
  sensorTubeCap.position.set(-0.045, 2.0, 0.03);
  floatGroup.add(sensorTubeCap);

  // 7. Tall Satellite Transmission Antenna Rod
  const antennaBaseGeo = new THREE.CylinderGeometry(0.025, 0.038, 0.14, 16);
  const antennaBase = new THREE.Mesh(antennaBaseGeo, blackHardwareMat);
  antennaBase.position.set(-0.065, 1.52, -0.04);
  floatGroup.add(antennaBase);

  const antennaRodGeo = new THREE.CylinderGeometry(0.009, 0.018, 2.5, 16);
  const antennaRod = new THREE.Mesh(antennaRodGeo, antennaMat);
  antennaRod.position.set(-0.065, 2.78, -0.04);
  floatGroup.add(antennaRod);

  // Small antenna tip bead
  const antennaTipGeo = new THREE.SphereGeometry(0.02, 12, 12);
  const antennaTip = new THREE.Mesh(antennaTipGeo, antennaMat);
  antennaTip.position.set(-0.065, 4.04, -0.04);
  floatGroup.add(antennaTip);

  // Position based on configuration
  floatGroup.position.set(
    ARGO_FLOAT_CONFIG.x,
    ARGO_FLOAT_CONFIG.y,
    ARGO_FLOAT_CONFIG.z,
  );
  floatGroup.scale.setScalar(ARGO_FLOAT_CONFIG.scale);
  return floatGroup;
}

const argoFloat = createArgoFloatModel();
scene.add(argoFloat);

// Submersible exploration light that illuminates the Argo float in deep water
const argoDiveLight = new THREE.SpotLight(0xe0f7fa, 0.0, 65, Math.PI / 3.4, 0.65, 1.2);
scene.add(argoDiveLight);
scene.add(argoDiveLight.target);

// ============================================================================
// 6.5. 3D OCEAN INSTRUMENTS FLEET (Argo Floats, Gliders, CTD Rosettes)
// ============================================================================
const instrumentsFleetGroup = new THREE.Group();
instrumentsFleetGroup.name = "ocean_instruments_fleet";
scene.add(instrumentsFleetGroup);

const interactiveInstrumentsMap = new Map();
const instrumentMeshes = [];

// Selection Halo Ring (cyan glowing ring when an instrument is focused)
const selectionRingGeo = new THREE.RingGeometry(1.6, 1.85, 32);
const selectionRingMat = new THREE.MeshBasicMaterial({
  color: 0x00f0ff,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.85,
});
const selectionRing = new THREE.Mesh(selectionRingGeo, selectionRingMat);
selectionRing.rotation.x = -Math.PI / 2;
selectionRing.visible = false;
scene.add(selectionRing);

// CTD Rosette Winch Cable (runs from surface down to CTD station 1)
const ctdInst1 = DEMO_INSTRUMENTS.find((i) => i.id === "ctd-rosette-01");
if (ctdInst1) {
  const cablePoints = [
    new THREE.Vector3(ctdInst1.position[0], 0.0, ctdInst1.position[2]),
    new THREE.Vector3(
      ctdInst1.position[0],
      ctdInst1.position[1] + 1.6,
      ctdInst1.position[2]
    ),
  ];
  const cableGeo = new THREE.BufferGeometry().setFromPoints(cablePoints);
  const cableMat = new THREE.LineBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.45,
    linewidth: 1.5,
  });
  const ctdWinchCable = new THREE.Line(cableGeo, cableMat);
  ctdWinchCable.name = "ctd_winch_cable";
  instrumentsFleetGroup.add(ctdWinchCable);
}

// Spawn Instruments Fleet
DEMO_INSTRUMENTS.forEach((inst) => {
  // Primary surface Argo float is mapped to existing argoFloat
  if (inst.type === "argo" || (inst.id && String(inst.id).startsWith("argo-"))) {
    argoFloat.userData = {
      isInstrument: true,
      id: inst.id,
      instrumentData: inst,
    };
    interactiveInstrumentsMap.set(inst.id, argoFloat);
    instrumentMeshes.push(argoFloat);
    return;
  }

  // If instrument has depth, compute 3D Y coordinate
  if (inst.depth !== undefined && inst.position) {
    const depthRatio = Math.min(1.0, inst.depth / 4000);
    inst.position[1] = -depthRatio * 90.0;
  }

  const mesh = createInstrumentObject(inst);
  instrumentsFleetGroup.add(mesh);
  interactiveInstrumentsMap.set(inst.id, mesh);
  instrumentMeshes.push(mesh);
});

// ============================================================================
// 6.55. GLIDER SAWTOOTH TRAJECTORY TRAILS (Slocum & Spray)
// Glowing 3D polyline ribbons showing operational V/W dive & climb cycles
// ============================================================================
const slocumGliderMesh = interactiveInstrumentsMap.get("glider-slocum-04");
let slocumTrail = null;
if (slocumGliderMesh) {
  slocumTrail = createGliderSawtoothTrail({
    color: 0x00f0ff, // Electric cyan glowing trail
    cycles: 4,
    wavelength: 5.5,
    diveAmplitude: 2.2,
    ribbonWidth: 0.16,
    heading: [0.85, 0.4],
  });
  slocumTrail.position.copy(slocumGliderMesh.position);
  scene.add(slocumTrail);
}

const sprayGliderMesh = interactiveInstrumentsMap.get("glider-spray-09");
let sprayTrail = null;
if (sprayGliderMesh) {
  sprayTrail = createGliderSawtoothTrail({
    color: 0xffd000, // Radiant golden yellow glowing trail
    cycles: 4,
    wavelength: 6.8,
    diveAmplitude: 3.2,
    ribbonWidth: 0.18,
    heading: [-0.75, 0.6],
  });
  sprayTrail.position.copy(sprayGliderMesh.position);
  scene.add(sprayTrail);
}

// ============================================================================
// 6.56. CURRENT VECTOR PARTICLE STREAM (Horizontal Ocean Current Flow)
// Visualizes ocean current speed and direction (0.42 m/s -> NE) around floats
// ============================================================================
function createCurrentVectorStream(options = {}) {
  const count = options.count || 260;
  const currentSpeed = options.speed || 0.42; // m/s
  const headingDeg = options.headingDeg || 45; // 45 deg = North-East

  // 45 deg NE -> +X (East), -Z (North) in Three.js coordinates
  const rad = (headingDeg * Math.PI) / 180;
  const dirX = Math.sin(rad); // +0.707
  const dirZ = -Math.cos(rad); // -0.707

  // Sleek tapered aerodynamic streamline cone
  const streamGeo = new THREE.ConeGeometry(0.065, 1.35, 6);
  streamGeo.rotateX(Math.PI / 2);

  const streamMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.52,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const instMesh = new THREE.InstancedMesh(streamGeo, streamMat, count);
  instMesh.name = "current_vector_stream";

  const bounds = {
    minX: -36, maxX: 36,
    minY: -75, maxY: -1.5,
    minZ: -36, maxZ: 36,
  };

  const dummy = new THREE.Object3D();
  const vectorData = [];
  const yawAngle = Math.atan2(dirX, -dirZ);

  for (let i = 0; i < count; i++) {
    // Higher density in upper 200m where surface currents are strongest
    const yRatio = Math.pow(Math.random(), 1.6);
    const y = bounds.maxY - yRatio * (bounds.maxY - bounds.minY);
    const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);

    // Natural vertical current shear: surface is fastest, abyss is gentle
    const depthShear = Math.max(0.35, 1.0 - Math.abs(y) / 80.0);
    const speed = (0.038 + Math.random() * 0.032) * (currentSpeed / 0.42) * depthShear;
    const lengthScale = 0.7 + depthShear * 0.6 + Math.random() * 0.3;

    vectorData.push({ x, y, z, speed, depthShear, lengthScale });

    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yawAngle, 0);
    dummy.scale.set(0.8, 0.8, lengthScale);
    dummy.updateMatrix();
    instMesh.setMatrixAt(i, dummy.matrix);
  }
  instMesh.instanceMatrix.needsUpdate = true;

  instMesh.userData = {
    vectorData,
    dirX,
    dirZ,
    bounds,
    dummy,
    yawAngle,
    update: function(deltaTime, liveCurrentSpeed) {
      const speedMultiplier = liveCurrentSpeed !== undefined ? liveCurrentSpeed / 0.42 : 1.0;
      for (let i = 0; i < count; i++) {
        const v = vectorData[i];
        const step = v.speed * speedMultiplier;
        v.x += dirX * step;
        v.z += dirZ * step;

        // Continuous volume wrap-around
        if (v.x > bounds.maxX) v.x = bounds.minX;
        if (v.x < bounds.minX) v.x = bounds.maxX;
        if (v.z < bounds.minZ) v.z = bounds.maxZ;
        if (v.z > bounds.maxZ) v.z = bounds.minZ;

        dummy.position.set(v.x, v.y, v.z);
        dummy.rotation.set(0, yawAngle, 0);
        dummy.scale.set(0.8, 0.8, v.lengthScale);
        dummy.updateMatrix();
        instMesh.setMatrixAt(i, dummy.matrix);
      }
      instMesh.instanceMatrix.needsUpdate = true;
    }
  };

  return instMesh;
}

const currentVectorStream = createCurrentVectorStream({
  count: 260,
  speed: 0.42,
  headingDeg: 45,
});
scene.add(currentVectorStream);

// ============================================================================
// 6.6. DEEP ABYSSAL SEABED PLAIN (4000m Ocean Floor Bathymetry)
// Prevents empty black void when device/camera dives deep underground under scene
// ============================================================================
function createAbyssalSeabed() {
  const seabedGroup = new THREE.Group();
  seabedGroup.name = "abyssal_seabed_group";
  seabedGroup.position.y = -102.0; // Sits just beneath 4000m depth plunge (-92.0m)

  // 1. Undulating Ocean Floor Bathymetry
  const seabedGeo = new THREE.PlaneGeometry(600, 600, 36, 36);
  seabedGeo.rotateX(-Math.PI / 2);

  const posAttr = seabedGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const elev =
      Math.sin(vx * 0.035) * Math.cos(vz * 0.035) * 1.8 +
      Math.sin(vx * 0.09 + vz * 0.07) * 0.8;
    posAttr.setY(i, elev);
  }
  seabedGeo.computeVertexNormals();

  const seabedMat = new THREE.MeshStandardMaterial({
    color: 0x092b4c, // Deep oceanic marine blue sediment
    roughness: 0.90,
    metalness: 0.08,
    flatShading: true,
  });

  const seabedMesh = new THREE.Mesh(seabedGeo, seabedMat);
  seabedGroup.add(seabedMesh);

  // 2. Luminous Bathymetric Sonar Grid Lines (Cyan & Blue Survey Grid)
  const gridHelper = new THREE.GridHelper(500, 40, 0x00b4d8, 0x073c68);
  gridHelper.position.y = 0.2;
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.35;
  seabedGroup.add(gridHelper);

  // 3. Concentric Bathymetric Sonar Rings under primary float station
  for (let r = 1; r <= 3; r++) {
    const ringGeo = new THREE.RingGeometry(r * 14 - 0.2, r * 14, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.38 - r * 0.09,
      side: THREE.DoubleSide,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(ARGO_FLOAT_CONFIG.x, 0.25, ARGO_FLOAT_CONFIG.z);
    seabedGroup.add(ringMesh);
  }

  return seabedGroup;
}

const abyssalSeabed = createAbyssalSeabed();
scene.add(abyssalSeabed);

// ============================================================================
// 🌊 6.7. INCOIS VOLUMETRIC MODEL FIELD & 20°C ISOTHERM ISOSURFACE ENGINE
// Full water-column scalar fields (Temperature, Salinity, Current, Chlorophyll)
// ============================================================================
export const OCEAN_STATE = {
  depthRatio: 0.0,
  depthMeters: 0,
  variable: "temp", // 'temp' | 'sal' | 'vel' | 'chl'
  colormap: "thermal", // 'thermal' | 'haline' | 'turbo' | 'viridis' | 'chlorophyll'
  verticalExaggeration: 1.0, // 1.0x to 8.0x
  isothermActive: false, // Default false: clean open 3D ocean water
  isothermTemp: 20.0, // °C
  sliceVisible: false, // Default false: prevents fake cyan water level moving with float
  sliceOpacity: 0.45,
  transectVisible: false,
  timeOffsetHours: 0, // -72 to +72
  isPlaying: false,
  playbackSpeed: 1.0,
  roleMode: "forecaster", // 'forecaster' | 'public'
  mhwStatus: null,
};
window.OCEAN_STATE = OCEAN_STATE;

// Shaders for Volumetric Depth Slice
const sliceVertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const sliceFragmentShader = `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  uniform sampler2D uScalarTexture;
  uniform int uColormap;
  uniform float uOpacity;
  uniform float uTime;

  vec3 colormapThermal(float t) {
    if (t < 0.25) return mix(vec3(0.04, 0.12, 0.55), vec3(0.0, 0.85, 0.95), t * 4.0);
    if (t < 0.50) return mix(vec3(0.0, 0.85, 0.95), vec3(0.95, 0.92, 0.18), (t - 0.25) * 4.0);
    if (t < 0.75) return mix(vec3(0.95, 0.92, 0.18), vec3(1.0, 0.45, 0.0), (t - 0.50) * 4.0);
    return mix(vec3(1.0, 0.45, 0.0), vec3(0.92, 0.05, 0.15), (t - 0.75) * 4.0);
  }

  vec3 colormapHaline(float t) {
    if (t < 0.33) return mix(vec3(0.18, 0.05, 0.35), vec3(0.08, 0.35, 0.75), t * 3.0);
    if (t < 0.66) return mix(vec3(0.08, 0.35, 0.75), vec3(0.12, 0.82, 0.75), (t - 0.33) * 3.0);
    return mix(vec3(0.12, 0.82, 0.75), vec3(0.98, 0.95, 0.45), (t - 0.66) * 3.0);
  }

  vec3 colormapTurbo(float t) {
    vec4 kVec = vec4(t, t * t, t * t * t, t * t * t * t);
    float r = 0.1357 + dot(kVec, vec4(4.5974, -42.3277, 130.5887, -150.5614)) + 58.1375 * kVec.w * t;
    float g = 0.0914 + dot(kVec, vec4(2.1856, 4.8052, -14.0195, 4.2109)) + 2.7747 * kVec.w * t;
    float b = 0.1067 + dot(kVec, vec4(12.5732, -83.5881, 236.8145, -288.7800)) + 120.4814 * kVec.w * t;
    return clamp(vec3(r, g, b), 0.0, 1.0);
  }

  vec3 colormapViridis(float t) {
    if (t < 0.25) return mix(vec3(0.267, 0.004, 0.329), vec3(0.190, 0.407, 0.556), t * 4.0);
    if (t < 0.50) return mix(vec3(0.190, 0.407, 0.556), vec3(0.128, 0.567, 0.551), (t - 0.25) * 4.0);
    if (t < 0.75) return mix(vec3(0.128, 0.567, 0.551), vec3(0.369, 0.788, 0.383), (t - 0.50) * 4.0);
    return mix(vec3(0.369, 0.788, 0.383), vec3(0.993, 0.906, 0.144), (t - 0.75) * 4.0);
  }

  vec3 colormapChlorophyll(float t) {
    if (t < 0.3) return mix(vec3(0.04, 0.12, 0.35), vec3(0.0, 0.65, 0.75), t / 0.3);
    if (t < 0.7) return mix(vec3(0.0, 0.65, 0.75), vec3(0.05, 0.85, 0.35), (t - 0.3) / 0.4);
    return mix(vec3(0.05, 0.85, 0.35), vec3(0.75, 1.0, 0.2), (t - 0.7) / 0.3);
  }

  vec3 colormapPlasma(float t) {
    if (t < 0.25) return mix(vec3(0.05, 0.03, 0.53), vec3(0.42, 0.0, 0.66), t * 4.0);
    if (t < 0.50) return mix(vec3(0.42, 0.0, 0.66), vec3(0.80, 0.14, 0.45), (t - 0.25) * 4.0);
    if (t < 0.75) return mix(vec3(0.80, 0.14, 0.45), vec3(0.97, 0.56, 0.23), (t - 0.50) * 4.0);
    return mix(vec3(0.97, 0.56, 0.23), vec3(0.94, 0.98, 0.13), (t - 0.75) * 4.0);
  }

  void main() {
    float val = texture2D(uScalarTexture, vUv).r;
    val = clamp(val, 0.0, 1.0);

    vec3 col;
    if (uColormap == 0) col = colormapThermal(val);
    else if (uColormap == 1) col = colormapHaline(val);
    else if (uColormap == 2) col = colormapTurbo(val);
    else if (uColormap == 3) col = colormapViridis(val);
    else if (uColormap == 4) col = colormapChlorophyll(val);
    else col = colormapPlasma(val);

    // High-precision isoline rings at 0.1 normalized intervals
    float iso = abs(fract(val * 10.0 - 0.5) - 0.5) / max(1e-4, fwidth(val * 10.0));
    float isoLine = 1.0 - clamp(iso, 0.0, 1.0);
    col = mix(col, vec3(1.0, 1.0, 1.0), isoLine * 0.40);

    // Smooth edge fade
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float edgeAlpha = smoothstep(0.0, 0.04, edge);

    gl_FragColor = vec4(col, uOpacity * edgeAlpha);
  }
`;

// Helper: map colormap name to integer ID
function getColormapId(name) {
  switch (name?.toLowerCase()) {
    case "haline": return 1;
    case "turbo": return 2;
    case "viridis": return 3;
    case "chlorophyll": return 4;
    case "plasma": return 5;
    case "thermal":
    default: return 0;
  }
}

// Generate DataTexture from NetCDF parser slice
function createScalarDataTexture(slice) {
  const N = slice.gridResolution;
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    const val = Math.round(slice.normalizedValues[i] * 255);
    data[i * 4] = val;     // R
    data[i * 4 + 1] = val; // G
    data[i * 4 + 2] = val; // B
    data[i * 4 + 3] = 255; // A
  }
  const texture = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

// Initial slice calculation
let activeSliceData = netCDFParserService.generateSlice({
  variable: OCEAN_STATE.variable,
  depthMeters: OCEAN_STATE.depthMeters,
  timeOffsetHours: OCEAN_STATE.timeOffsetHours,
});
let scalarDataTexture = createScalarDataTexture(activeSliceData);

// 1. Horizontal Volumetric Depth-Slice Mesh
const sliceGeo = new THREE.PlaneGeometry(64, 64, 32, 32);
sliceGeo.rotateX(-Math.PI / 2);

const sliceMat = new THREE.ShaderMaterial({
  vertexShader: sliceVertexShader,
  fragmentShader: sliceFragmentShader,
  uniforms: {
    uScalarTexture: { value: scalarDataTexture },
    uColormap: { value: getColormapId(OCEAN_STATE.colormap) },
    uOpacity: { value: OCEAN_STATE.sliceOpacity },
    uTime: { value: 0.0 },
  },
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
});

const volumetricSliceMesh = new THREE.Mesh(sliceGeo, sliceMat);
volumetricSliceMesh.name = "volumetric_depth_slice";
volumetricSliceMesh.position.set(ARGO_FLOAT_CONFIG.x, -2.8, ARGO_FLOAT_CONFIG.z);
volumetricSliceMesh.visible = false;
scene.add(volumetricSliceMesh);

// Glowing boundary frame around the slice
const sliceFrameGeo = new THREE.EdgesGeometry(sliceGeo);
const sliceFrameMat = new THREE.LineBasicMaterial({
  color: 0x00f0ff,
  transparent: true,
  opacity: 0.75,
});
const sliceFrameMesh = new THREE.LineSegments(sliceFrameGeo, sliceFrameMat);
volumetricSliceMesh.add(sliceFrameMesh);

// 2. Vertical Transect Curtain Mesh
const transectGeo = new THREE.PlaneGeometry(64, 95, 32, 32);
const transectMat = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    uniform int uColormap;
    uniform float uOpacity;

    ${sliceFragmentShader.slice(sliceFragmentShader.indexOf("vec3 colormapThermal"), sliceFragmentShader.indexOf("void main()"))}

    void main() {
      // Stratified vertical depth: surface is 1.0 (warm), depth is 0.0 (abyss)
      float depthFactor = 1.0 - vUv.y;
      // Thermocline curve
      float t = exp(-depthFactor * 3.5);
      t = clamp(t, 0.0, 1.0);

      vec3 col;
      if (uColormap == 0) col = colormapThermal(t);
      else if (uColormap == 1) col = colormapHaline(t);
      else if (uColormap == 2) col = colormapTurbo(t);
      else if (uColormap == 3) col = colormapViridis(t);
      else if (uColormap == 4) col = colormapChlorophyll(t);
      else col = colormapPlasma(t);

      gl_FragColor = vec4(col, uOpacity * 0.85);
    }
  `,
  uniforms: {
    uColormap: { value: getColormapId(OCEAN_STATE.colormap) },
    uOpacity: { value: 0.75 },
  },
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
});

const transectMesh = new THREE.Mesh(transectGeo, transectMat);
transectMesh.position.set(ARGO_FLOAT_CONFIG.x, -47.5, ARGO_FLOAT_CONFIG.z - 16);
transectMesh.visible = OCEAN_STATE.transectVisible;
scene.add(transectMesh);

// 3. 20°C Isotherm (D20) Isosurface Contoured Mesh
function createIsothermIsosurface(targetTemp = 20.0) {
  const d20Data = netCDFParserService.compute20DegIsothermMatrix(OCEAN_STATE.timeOffsetHours, targetTemp);
  const N = d20Data.resolution;
  const isoGeo = new THREE.PlaneGeometry(64, 64, N - 1, N - 1);
  isoGeo.rotateX(-Math.PI / 2);

  const posAttr = isoGeo.attributes.position;
  const maxDepthWorld = 95.0 * OCEAN_STATE.verticalExaggeration;

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const idx = j * N + i;
      const depthM = d20Data.depthMatrix[idx];
      const yWorld = -(depthM / 4000.0) * maxDepthWorld;
      posAttr.setY(idx, yWorld);
    }
  }
  isoGeo.computeVertexNormals();

  const isoMat = new THREE.MeshStandardMaterial({
    color: 0x00f0ff,
    roughness: 0.25,
    metalness: 0.35,
    transparent: true,
    opacity: 0.58,
    side: THREE.DoubleSide,
    wireframe: false,
  });

  const isoMesh = new THREE.Mesh(isoGeo, isoMat);
  isoMesh.name = "d20_isotherm_isosurface";
  isoMesh.position.set(ARGO_FLOAT_CONFIG.x, 0, ARGO_FLOAT_CONFIG.z);

  // Overlay wireframe contour isolines on top of the isosurface
  const isoWireGeo = isoGeo.clone();
  const isoWireMat = new THREE.MeshBasicMaterial({
    color: 0xffe042,
    wireframe: true,
    transparent: true,
    opacity: 0.32,
  });
  const isoWireMesh = new THREE.Mesh(isoWireGeo, isoWireMat);
  isoMesh.add(isoWireMesh);

  isoMesh.userData = {
    targetTemp,
    updateDepthPositions: function(vExagg = 1.0, timeOffset = 0) {
      const updated = netCDFParserService.compute20DegIsothermMatrix(timeOffset, isoMesh.userData.targetTemp);
      const pos = isoGeo.attributes.position;
      const wirePos = isoWireGeo.attributes.position;
      const mDepthWorld = 95.0 * vExagg;

      for (let k = 0; k < N * N; k++) {
        const dM = updated.depthMatrix[k];
        const yW = -(dM / 4000.0) * mDepthWorld;
        pos.setY(k, yW);
        wirePos.setY(k, yW);
      }
      isoGeo.computeVertexNormals();
      isoGeo.attributes.position.needsUpdate = true;
      isoWireGeo.attributes.position.needsUpdate = true;
    }
  };

  return isoMesh;
}

const isothermMesh = createIsothermIsosurface(OCEAN_STATE.isothermTemp);
isothermMesh.visible = OCEAN_STATE.isothermActive;
scene.add(isothermMesh);

// ─── HIGH-VISIBILITY NEON BEACON WIREFRAME ISOSURFACE DOME ───────────────────
// Anchored directly around active Argo float, renders on TOP of water (depthTest: false)
const neonBeaconGeo = new THREE.SphereGeometry(1, 16, 16);
const neonBeaconMat = new THREE.MeshBasicMaterial({
  color: OCEAN_STATE.isothermTemp >= 26.5 ? 0xff2200 : 0x00ffcc,
  wireframe: true,
  depthTest: false, // Forces it to render on TOP of water so it cannot be hidden
  depthWrite: false,
  transparent: true,
  opacity: 0.88,
});
const neonBeaconMesh = new THREE.Mesh(neonBeaconGeo, neonBeaconMat);
neonBeaconMesh.name = "neon_beacon_isosurface";
neonBeaconMesh.renderOrder = 999;
neonBeaconMesh.position.set(ARGO_FLOAT_CONFIG.x, 0, ARGO_FLOAT_CONFIG.z);
neonBeaconMesh.visible = OCEAN_STATE.isothermActive;
scene.add(neonBeaconMesh);

function updateNeonBeacon() {
  if (neonBeaconMesh) {
    const threshold = OCEAN_STATE.isothermTemp ?? 25;
    const s = ((32 - threshold) / 5) * 8 + 5;
    neonBeaconMesh.scale.set(s, s * 0.5, s);
    neonBeaconMat.color.set(threshold >= 26.5 ? 0xff2200 : 0x00ffcc);
    neonBeaconMesh.visible = Boolean(OCEAN_STATE.isothermActive);
  }
}
updateNeonBeacon();
function refreshVolumetricFields() {
  activeSliceData = netCDFParserService.generateSlice({
    variable: OCEAN_STATE.variable,
    depthMeters: OCEAN_STATE.depthMeters,
    timeOffsetHours: OCEAN_STATE.timeOffsetHours,
  });

  const N = activeSliceData.gridResolution;
  const texData = scalarDataTexture.image.data;
  for (let i = 0; i < N * N; i++) {
    const val = Math.round(activeSliceData.normalizedValues[i] * 255);
    texData[i * 4] = val;
    texData[i * 4 + 1] = val;
    texData[i * 4 + 2] = val;
    texData[i * 4 + 3] = 255;
  }
  scalarDataTexture.needsUpdate = true;

  sliceMat.uniforms.uColormap.value = getColormapId(OCEAN_STATE.colormap);
  sliceMat.uniforms.uOpacity.value = OCEAN_STATE.sliceOpacity;
  transectMat.uniforms.uColormap.value = getColormapId(OCEAN_STATE.colormap);

  if (isothermMesh && isothermMesh.userData.updateDepthPositions) {
    isothermMesh.userData.updateDepthPositions(OCEAN_STATE.verticalExaggeration, OCEAN_STATE.timeOffsetHours);
  }

  // Dispatch custom event for UI updates
  window.dispatchEvent(new CustomEvent("ocean-field-updated", {
    detail: {
      variable: OCEAN_STATE.variable,
      cfMetadata: CF_CONVENTIONS[OCEAN_STATE.variable],
      depthMeters: OCEAN_STATE.depthMeters,
      timeOffsetHours: OCEAN_STATE.timeOffsetHours,
      colormap: OCEAN_STATE.colormap,
      verticalExaggeration: OCEAN_STATE.verticalExaggeration,
      isothermActive: OCEAN_STATE.isothermActive,
      isothermTemp: OCEAN_STATE.isothermTemp,
    }
  }));
}

// ============================================================================
// 🎛️ PUBLIC WINDOW API CONTROLS (For HTML HUD & React Components)
// ============================================================================
window.setVolumetricVariable = function(varName) {
  if (CF_CONVENTIONS[varName]) {
    OCEAN_STATE.variable = varName;
    OCEAN_STATE.colormap = CF_CONVENTIONS[varName].colormap;
    refreshVolumetricFields();
    console.log(`[Volumetric] Variable switched to ${varName} (${CF_CONVENTIONS[varName].standard_name})`);
  }
};

window.setVolumetricColormap = function(cmapName) {
  OCEAN_STATE.colormap = cmapName;
  refreshVolumetricFields();
};

window.setVolumetricOpacity = function(opacity) {
  OCEAN_STATE.sliceOpacity = Math.max(0.1, Math.min(1.0, opacity));
  sliceMat.uniforms.uOpacity.value = OCEAN_STATE.sliceOpacity;
};

window.toggleVolumetricSlice = function(visible) {
  OCEAN_STATE.sliceVisible = visible !== undefined ? visible : !volumetricSliceMesh.visible;
  volumetricSliceMesh.visible = OCEAN_STATE.sliceVisible;
};

window.setIsothermActive = function(active) {
  OCEAN_STATE.isothermActive = active;
  isothermMesh.visible = active;
  if (typeof neonBeaconMesh !== 'undefined' && neonBeaconMesh) {
    neonBeaconMesh.visible = Boolean(active);
  }
};

window.setIsothermThreshold = function(tempC) {
  OCEAN_STATE.isothermTemp = parseFloat(tempC);
  isothermMesh.userData.targetTemp = OCEAN_STATE.isothermTemp;
  if (typeof updateNeonBeacon === 'function') {
    updateNeonBeacon();
  }
  refreshVolumetricFields();
};

window.setVerticalExaggeration = function(mult) {
  const clamped = Math.max(1.0, Math.min(8.0, parseFloat(mult) || 1.0));
  OCEAN_STATE.verticalExaggeration = clamped;

  // Re-trigger depth positioning with new exaggeration factor
  if (window.setOceanDepth) {
    window.setOceanDepth(OCEAN_STATE.depthRatio);
  }
  refreshVolumetricFields();
  console.log(`[Core] Vertical Exaggeration set to ${clamped.toFixed(1)}x`);
};

window.setSimulationTimeOffset = function(hours) {
  OCEAN_STATE.timeOffsetHours = Math.max(-72, Math.min(72, parseFloat(hours) || 0));
  refreshVolumetricFields();
};

window.toggleSimulationPlay = function() {
  OCEAN_STATE.isPlaying = !OCEAN_STATE.isPlaying;
  return OCEAN_STATE.isPlaying;
};

window.setSimulationSpeed = function(speed) {
  OCEAN_STATE.playbackSpeed = parseFloat(speed) || 1.0;
};

window.setRoleMode = function(mode) {
  OCEAN_STATE.roleMode = mode === "public" ? "public" : "forecaster";
  document.body.setAttribute("data-role-mode", OCEAN_STATE.roleMode);

  window.dispatchEvent(new CustomEvent("role-mode-changed", {
    detail: { mode: OCEAN_STATE.roleMode }
  }));
  console.log(`[Role] Mode switched to: ${OCEAN_STATE.roleMode.toUpperCase()}`);
};

window.copyShareableLink = function() {
  const url = ShareableStateService.serializeToUrl({
    depth: OCEAN_STATE.depthMeters,
    variable: OCEAN_STATE.variable,
    timeOffset: OCEAN_STATE.timeOffsetHours,
    isothermActive: OCEAN_STATE.isothermActive,
    isothermTemp: OCEAN_STATE.isothermTemp,
    verticalExaggeration: OCEAN_STATE.verticalExaggeration,
    roleMode: OCEAN_STATE.roleMode,
    colormap: OCEAN_STATE.colormap,
  });

  navigator.clipboard.writeText(url).then(() => {
    const toast = document.createElement("div");
    toast.className = "share-toast-notification";
    toast.textContent = "🔗 Sharable Ocean View URL copied to clipboard!";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }).catch((err) => {
    prompt("Copy shareable URL:", url);
  });
};

window.captureHighResScreenshot = function() {
  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL("image/png");
  const link = document.createElement("a");
  const dateStr = new Date().toISOString().replace(/[:.]/g, "-");
  link.download = `INCOIS_3D_Ocean_${OCEAN_STATE.variable.toUpperCase()}_${OCEAN_STATE.depthMeters}m_${dateStr}.png`;
  link.href = dataUrl;
  link.click();
};

window.exportOceanReport = function() {
  const report = {
    institution: "INCOIS - Indian National Centre for Ocean Information Services",
    project: "Web-Based 3D Ocean Data Visualization System",
    problemId: "26067",
    timestamp: new Date().toISOString(),
    viewState: {
      depthMeters: OCEAN_STATE.depthMeters,
      activeVariable: OCEAN_STATE.variable,
      cfMetadata: CF_CONVENTIONS[OCEAN_STATE.variable],
      colormap: OCEAN_STATE.colormap,
      verticalExaggeration: `${OCEAN_STATE.verticalExaggeration.toFixed(1)}x`,
      temporalOffsetHours: OCEAN_STATE.timeOffsetHours,
      d20IsothermTemp: `${OCEAN_STATE.isothermTemp}°C`,
      roleMode: OCEAN_STATE.roleMode,
    },
    marineHeatwave: MarineHeatwaveService.evaluateMHW(28.5 + (OCEAN_STATE.timeOffsetHours / 72)),
    telemetry: DEMO_INSTRUMENTS,
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `INCOIS_Oceanographic_Summary_${Date.now()}.json`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
};

// Ingest ASCII/CSV telemetry data directly from user file or paste
window.ingestAsciiBuoyData = function(text) {
  try {
    const result = AsciiBuoyParser.parse(text);
    console.log(`✅ [ASCII Ingest] Successfully parsed ${result.rowCount} records:`, result.headers);
    alert(`✅ Successfully ingested ${result.rowCount} records from ASCII buoy telemetry!`);
    return result;
  } catch (err) {
    alert(`❌ Ingestion failed: ${err.message}`);
    return null;
  }
};

// Initial state restore from URL if deep-link parameters exist
try {
  const deepState = ShareableStateService.parseFromUrl();
  if (deepState.variable) OCEAN_STATE.variable = deepState.variable;
  if (deepState.colormap) OCEAN_STATE.colormap = deepState.colormap;
  if (deepState.timeOffset !== undefined) OCEAN_STATE.timeOffsetHours = deepState.timeOffset;
  if (deepState.isothermActive !== undefined) OCEAN_STATE.isothermActive = deepState.isothermActive;
  if (deepState.isothermTemp !== undefined) OCEAN_STATE.isothermTemp = deepState.isothermTemp;
  if (deepState.verticalExaggeration !== undefined) OCEAN_STATE.verticalExaggeration = deepState.verticalExaggeration;
  if (deepState.roleMode) OCEAN_STATE.roleMode = deepState.roleMode;
} catch (e) {
  console.warn("Could not parse deep link params", e);
}



// Update the right-side glassmorphism telemetry panel with active instrument
function updateTelemetryPanelWithInstrument(inst) {
  const stationNameEl = document.getElementById("descStationName");
  const stationCodeEl = document.getElementById("descStationCode");
  const statusPillEl = document.getElementById("descStatusPill");
  const locPrimaryEl = document.getElementById("descLocPrimary");
  const locSecondaryEl = document.getElementById("descLocSecondary");
  const coordsEl = document.getElementById("descCoords");
  const tempEl = document.getElementById("descTemp");
  const salEl = document.getElementById("descSalinity");
  const depthEl = document.getElementById("descDepth");
  const oxyEl = document.getElementById("descOxygen");
  const currentEl = document.getElementById("descCurrent");
  const cycleEl = document.getElementById("descCycle");
  const lastProfileEl = document.getElementById("descLastProfile");
  const batteryEl = document.getElementById("descBattery");

  if (stationNameEl) stationNameEl.textContent = inst.name;
  if (stationCodeEl)
    stationCodeEl.textContent = `${inst.platform} · ${inst.type.toUpperCase()}`;
  if (statusPillEl) {
    statusPillEl.textContent = (inst.telemetry.status || "ACTIVE").toUpperCase();
    if (inst.type === "glider") {
      statusPillEl.style.background = "#2a1e04";
      statusPillEl.style.color = "#ffd000";
      statusPillEl.style.borderColor = "rgba(255, 208, 0, 0.45)";
    } else if (inst.type === "ctd") {
      statusPillEl.style.background = "#04202c";
      statusPillEl.style.color = "#00e5ff";
      statusPillEl.style.borderColor = "rgba(0, 229, 255, 0.45)";
    } else {
      statusPillEl.style.background = "#0b3223";
      statusPillEl.style.color = "#10b981";
      statusPillEl.style.borderColor = "rgba(16, 185, 129, 0.45)";
    }
  }

  if (locPrimaryEl) {
    locPrimaryEl.textContent = inst.sea || inst.locationPrimary || "Indian Ocean";
  }
  if (locSecondaryEl) {
    locSecondaryEl.textContent = inst.region || inst.locationSecondary || inst.telemetry?.missionWaypoint || inst.telemetry?.vessel || "";
  }
  if (coordsEl && inst.geoCoordinates) {
    coordsEl.textContent = `${Math.abs(inst.geoCoordinates.lat).toFixed(4)}° ${inst.geoCoordinates.lat >= 0 ? "N" : "S"}, ${Math.abs(inst.geoCoordinates.lon).toFixed(4)}° ${inst.geoCoordinates.lon >= 0 ? "E" : "W"}`;
  } else if (coordsEl && inst.lat && inst.lon) {
    coordsEl.textContent = `${Math.abs(inst.lat).toFixed(4)}° ${inst.lat >= 0 ? "N" : "S"}, ${Math.abs(inst.lon).toFixed(4)}° ${inst.lon >= 0 ? "E" : "W"}`;
  }
  const tVal = inst.telemetry?.temperatureC ?? inst.temp;
  if (tempEl) {
    tempEl.textContent = tVal != null ? `${Number(tVal).toFixed(2)} °C` : "--";
  }
  const sVal = inst.telemetry?.salinityPSU ?? inst.salinity;
  if (salEl) {
    salEl.textContent = sVal != null ? `${Number(sVal).toFixed(2)} PSU` : "--";
  }
  if (depthEl) {
    const dVal = inst.depthMeters ?? inst.depth ?? 0;
    depthEl.textContent = `${dVal} m / 4000 m`;
  }
  if (oxyEl) {
    const oxyVal = inst.telemetry?.dissolvedOxygen ?? inst.dissolvedOxygen;
    oxyEl.textContent = oxyVal != null ? `${oxyVal} μmol/kg` : (inst.type === "argo" ? "— (Core Argo)" : "--");
  }
  if (currentEl) {
    const speedVal = inst.telemetry?.speedKnots ?? inst.telemetry?.currentSpeed;
    currentEl.textContent = speedVal != null ? `${speedVal} kn Glide` : (inst.type === "argo" ? "— (Lagrangian Drift)" : "0.42 m/s → NE");
  }
  if (cycleEl) {
    const cycleVal = inst.cycle ?? inst.telemetry?.cycle;
    cycleEl.textContent = cycleVal ? `#${cycleVal}` : (inst.type === "glider" ? "Mission #12" : "Cast #4");
  }
  if (lastProfileEl) {
    lastProfileEl.textContent =
      inst.type === "argo"
        ? "18 min ago"
        : inst.type === "glider"
        ? "Live Telemetry"
        : "Active Cast";
  }
  if (batteryEl) {
    batteryEl.textContent = `${inst.telemetry.batteryPct || 85}%`;
  }

  // Update Model vs. Obs Delta Validation Badge
  const model = inst.modelValidation;
  const modelSourceEl = document.getElementById("descModelSource");
  const deltaTempEl = document.getElementById("descDeltaTemp");
  const deltaSalEl = document.getElementById("descDeltaSal");
  const deltaTempDetailEl = document.getElementById("descDeltaTempDetail");
  const deltaSalDetailEl = document.getElementById("descDeltaSalDetail");
  const assimStatusEl = document.getElementById("descAssimStatus");
  const modelBiasRatingEl = document.getElementById("descModelBiasRating");

  if (model) {
    if (modelSourceEl) modelSourceEl.textContent = model.modelName;
    if (deltaTempEl) {
      const sign = model.deltaTempC >= 0 ? "+" : "";
      deltaTempEl.textContent = `${sign}${model.deltaTempC.toFixed(2)} °C`;
      deltaTempEl.className = `delta-val ${model.deltaTempC >= 0 ? "delta-positive" : "delta-negative"}`;
    }
    if (deltaSalEl) {
      const sign = model.deltaSalPSU >= 0 ? "+" : "";
      deltaSalEl.textContent = `${sign}${model.deltaSalPSU.toFixed(2)} PSU`;
      deltaSalEl.className = `delta-val ${model.deltaSalPSU >= 0 ? "delta-positive" : "delta-negative"}`;
    }
    if (deltaTempDetailEl) {
      deltaTempDetailEl.textContent = `Obs: ${model.obsTemp}°C · Model: ${model.modelTemp}°C`;
    }
    if (deltaSalDetailEl) {
      deltaSalDetailEl.textContent = `Obs: ${model.obsSal} PSU · Model: ${model.modelSal} PSU`;
    }
    if (assimStatusEl) {
      assimStatusEl.textContent = `${model.status} (${model.confidenceScore})`;
    }
    if (modelBiasRatingEl) {
      modelBiasRatingEl.textContent = model.biasRating;
    }
  }
}

// Focuses and dives camera to an instrument
let selectedInstrumentId = DEMO_INSTRUMENTS[0]?.id || "argo-2902351";
const cameraTargetLookAt = new THREE.Vector3(0, -0.2, 1.5);
const cameraTargetPosition = new THREE.Vector3(3.8, 2.2, 5.2);
let isCameraLerping = false;

window.focusInstrument = function (instrumentId) {
  if (window.__focusingInstrumentInternal) return;
  window.__focusingInstrumentInternal = true;
  try {
    const inst = DEMO_INSTRUMENTS.find((i) => i.id === instrumentId);
    if (!inst) return;

    selectedInstrumentId = inst.id;

    // 1. Smoothly glide camera orbit target and camera position to the new instrument (60-frame Lerp)
    cameraTargetLookAt.set(inst.position[0], inst.position[1], inst.position[2]);
    cameraTargetPosition.set(inst.position[0] + 3.8, inst.position[1] + 2.2, inst.position[2] + 5.2);
    isCameraLerping = true;

    // 2. Update depth input and left-side vertical scrollbar UI to match selected instrument depth
    const instDepth = inst.depthMeters || inst.depth || 15;
    if (window.updateDepthUI) {
      window.updateDepthUI(instDepth / 4000, false);
    } else {
      const depthInput = document.getElementById('depthInput');
      if (depthInput) {
        depthInput.value = instDepth;
      }
    }

    // 3. Position selection ring
    if (selectionRing) {
      selectionRing.visible = true;
      selectionRing.position.set(
        inst.position[0],
        inst.position[1] - 0.25,
        inst.position[2]
      );
    }

    // 4. Update UI telemetry panel
    updateTelemetryPanelWithInstrument(inst);

    // 5. Update active chip in fleet selector bar
    document.querySelectorAll(".fleet-chip-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.instId === inst.id);
    });

    // 6. Update Zustand global oceanStore (instant synchronous state)
    if (window.oceanStore?.getState) {
      const store = window.oceanStore.getState();
      if (store.activeInstrument?.id !== inst.id) {
        store.selectInstrument(inst.id);
      }
    }

    // 7. Open or focus in React WorkspaceManager
    if (window.workspaceManager && window.workspaceManager.openInstrument) {
      window.workspaceManager.openInstrument(inst.id);
    }
  } finally {
    window.__focusingInstrumentInternal = false;
  }
};

// Initialize Sector Fleet Chips in bottom bar
function initFleetSelectorUI() {
  const container = document.getElementById("fleetChipsContainer");
  if (!container) return;

  container.innerHTML = "";
  DEMO_INSTRUMENTS.forEach((inst, idx) => {
    const btn = document.createElement("button");
    btn.className = `fleet-chip-btn ${idx === 0 ? "active" : ""}`;
    btn.dataset.instId = inst.id;

    let icon = "🟠";
    if (inst.type === "glider") icon = "🟡";
    if (inst.type === "ctd") icon = "🔷";

    btn.innerHTML = `<span>${icon}</span> <span>${inst.name.split(" ")[0]}</span> <span style="font-family:'Space Mono',monospace; font-size:0.65rem; color:#00e5ff;">(${inst.depthMeters}m)</span>`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      window.focusInstrument(inst.id);
    });
    container.appendChild(btn);
  });
}
initFleetSelectorUI();

// 3D Raycasting Hover & Click Handlers
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const hoverCard = document.getElementById("instrumentHoverCard");
const hoverIcon = document.getElementById("instHoverIcon");
const hoverName = document.getElementById("instHoverName");
const hoverType = document.getElementById("instHoverType");
const hoverDepth = document.getElementById("instHoverDepthPill");
const hoverStatus = document.getElementById("instHoverStatus");
const hoverTemp = document.getElementById("instHoverTemp");
const hoverBattery = document.getElementById("instHoverBattery");

function getHoveredInstrument(clientX, clientY) {
  mouse.x = (clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(instrumentMeshes, true);
  if (intersects.length > 0) {
    let obj = intersects[0].object;
    while (obj && !obj.userData?.isInstrument && obj.parent) {
      obj = obj.parent;
    }
    if (obj && obj.userData?.isInstrument) {
      return obj.userData.instrumentData;
    }
  }
  return null;
}

window.addEventListener("pointermove", (e) => {
  if (
    e.target.closest(
      ".glass-panel, .argo-subtab-card, .depth-bar-container, .cycle-sun-btn, .workspace-interactive, .workspace-window, .fleet-bar-wrapper, .picker-popover-backdrop"
    )
  ) {
    if (hoverCard) hoverCard.classList.remove("active");
    document.body.style.cursor = "default";
    return;
  }

  const inst = getHoveredInstrument(e.clientX, e.clientY);
  if (inst) {
    document.body.style.cursor = "pointer";
    if (hoverCard) {
      if (hoverIcon) {
        hoverIcon.textContent =
          inst.type === "argo" ? "🟠" : inst.type === "glider" ? "🟡" : "🔷";
      }
      if (hoverName) hoverName.textContent = inst.name;
      if (hoverType)
        hoverType.textContent = inst.platform || inst.type.toUpperCase();
      if (hoverDepth) hoverDepth.textContent = `${inst.depthMeters}m`;
      if (hoverStatus)
        hoverStatus.textContent = (inst.telemetry.status || "Active").toUpperCase();
      const hoverTempVal = inst.telemetry?.temperatureC ?? inst.temp;
      if (hoverTemp)
        hoverTemp.textContent = hoverTempVal != null
          ? `${Number(hoverTempVal).toFixed(2)} °C`
          : "--";
      if (hoverBattery)
        hoverBattery.textContent = `${inst.telemetry.batteryPct || 85}%`;

      const cardW = 290;
      let left = e.clientX + 16;
      if (left + cardW > window.innerWidth - 20) {
        left = e.clientX - cardW - 16;
      }
      let top = e.clientY - 40;
      if (top < 20) top = 20;

      hoverCard.style.left = `${left}px`;
      hoverCard.style.top = `${top}px`;
      hoverCard.classList.add("active");
    }
  } else {
    document.body.style.cursor = "default";
    if (hoverCard) hoverCard.classList.remove("active");
  }
});

window.addEventListener("click", (e) => {
  if (
    e.target.closest(
      ".glass-panel, .argo-subtab-card, .depth-bar-container, .cycle-sun-btn, .workspace-interactive, .workspace-window, .fleet-bar-wrapper, .picker-popover-backdrop"
    )
  ) {
    return;
  }

  const inst = getHoveredInstrument(e.clientX, e.clientY);
  if (inst) {
    window.focusInstrument(inst.id);
  }
});

// ============================================================================
// 7. RESPONSIVE RESIZE HANDLING
// Uses the canvas panel container if available, otherwise falls back to window
// ============================================================================
window.addEventListener("resize", () => {
  const container = window.oceanCanvasContainer;
  const w = container ? container.clientWidth : window.innerWidth;
  const h = container ? container.clientHeight : window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// ============================================================================
// 7. INTERACTIVE DEPTH PROFILING & EXTREME UNDERWATER DIVING
// ============================================================================
window.setOceanDepth = function (ratio) {
  // ratio: 0.0 (0m, Top level) -> 1.0 (4000m, Extreme Hadal Abyss)
  const depthMeters = Math.round(ratio * 4000);

  if (window.OCEAN_STATE) {
    window.OCEAN_STATE.currentDepth = depthMeters;
    window.OCEAN_STATE.depthRatio = ratio;
  }
  if (window.oceanStore?.getState) {
    const store = window.oceanStore.getState();
    store.setModelControl('currentDepth', depthMeters);
    store.setActiveInstrumentDepth(depthMeters);
  }

  // Synchronize live depth telemetry HUD with BGC depth slice
  if (typeof window.updateLiveDepthData === 'function') {
    window.updateLiveDepthData(depthMeters);
  }

  // 1. DIVE DYNAMICS FOR ACTIVE INSTRUMENT & CAMERA:
  // Move whichever instrument is currently selected (Slocum Glider, CTD Rosette, or Argo Float)
  const baseDepth = 95.0;
  const maxUnderwaterDepth = baseDepth * (OCEAN_STATE.verticalExaggeration || 1.0);
  const currentDiveY = -ratio * maxUnderwaterDepth;

  const isSlocum = selectedInstrumentId === "glider-slocum-04";
  const isCtd = selectedInstrumentId === "ctd-rosette-01";
  const isArgo = !isSlocum && !isCtd;

  let activeTargetX = ARGO_FLOAT_CONFIG.x;
  let activeTargetZ = ARGO_FLOAT_CONFIG.z;
  let activeTargetY = currentDiveY;

  if (isSlocum) {
    const gliderSlocum = interactiveInstrumentsMap.get("glider-slocum-04");
    if (gliderSlocum) {
      gliderSlocum.position.y = currentDiveY;
      activeTargetX = gliderSlocum.position.x;
      activeTargetZ = gliderSlocum.position.z;
      activeTargetY = currentDiveY;
      if (slocumTrail && slocumTrail.userData?.update) {
        slocumTrail.userData.update(clock ? clock.getElapsedTime() : 0, gliderSlocum.position);
      }
    }
  } else if (isCtd) {
    const ctdRosette = interactiveInstrumentsMap.get("ctd-rosette-01");
    if (ctdRosette) {
      ctdRosette.position.y = currentDiveY;
      activeTargetX = ctdRosette.position.x;
      activeTargetZ = ctdRosette.position.z;
      activeTargetY = currentDiveY;
    }
  } else {
    // Argo Float
    argoDiveRatio = ratio;
    argoDiveY = currentDiveY;
    argoFloat.position.y = currentDiveY;
    argoFloat.visible = true;
    activeTargetX = argoFloat.position.x;
    activeTargetZ = argoFloat.position.z;
    activeTargetY = currentDiveY;
  }

  // Camera follows the active device down into the water column
  let targetCamY;
  let targetLookY;
  if (ratio <= 0.002) {
    targetCamY = activeTargetY + 3.2;
    targetLookY = activeTargetY + 1.8;
  } else {
    targetCamY = activeTargetY + 3.0;
    targetLookY = activeTargetY + 0.6;
  }
  if (!isCameraLerping) {
    camera.position.y = targetCamY;
    controls.target.y = targetLookY;
    controls.target.x = activeTargetX;
    controls.target.z = activeTargetZ;
  }

  if (selectionRing && selectionRing.visible) {
    selectionRing.position.set(activeTargetX, activeTargetY - 0.25, activeTargetZ);
  }

  // Orbit controls constraints
  if (ratio > 0.02) {
    // Underwater: full spherical look-around freedom
    controls.maxPolarAngle = Math.PI - 0.05;
    controls.minPolarAngle = 0.05;
  } else {
    // Above water: keep scenic angle
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minPolarAngle = 0.05;
  }

  // 2. UPPER LEVEL COMPLETELY DISAPPEARS (Clouds, Sun, and Surface Fade Out):
  // As user dives past 150m (ratio > 0.04), clouds disappear
  if (ratio > 0.04) {
    cloudsGroup.visible = false;
  } else {
    cloudsGroup.visible = true;
    cloudsGroup.children.forEach((cloud) => {
      cloud.children.forEach((puff) => {
        puff.material.opacity = Math.max(0, 0.88 - ratio * 20.0);
      });
    });
  }

  // Sun disc and glow fade out completely as you descend into deep water
  const sunFade = Math.max(0.0, 1.0 - ratio * 4.0); // Completely disappears by ~1000m
  sunMesh.material.opacity = sunFade;
  sunGlowMesh.material.opacity = sunFade * 0.7;
  sunGroup.visible = sunFade > 0.01;

  // Keep surface water visible from below with luminous optical transmission
  // (In deep abyss > 250m, shader automatically dissolves surface via depth absorption)
  const surfaceFade = Math.max(0.20, 1.0 - ratio * 0.75);
  waterMaterial.opacity = surfaceFade;
  water.visible = true;

  // Sun ascends as camera plunges down
  const newSunY = 32.0 + ratio * 250.0;
  sunGroup.position.y = newSunY;
  sunLight.position.y = newSunY;
  waterMaterial.uniforms.uSunPosition.value.y = newSunY;
  skyMat.uniforms.uSunPosition.value.y = newSunY;

  // 3. PROGRESSIVE PHYSICAL BEER-LAMBERT OPTICAL ABSORPTION (0m -> 4000m):
  skyMat.uniforms.uUnderwaterRatio.value = ratio;
  skyMat.uniforms.uCameraDepth.value = depthMeters;
  waterMaterial.uniforms.uUnderwaterRatio.value = ratio;

  // Dynamic Multi-Spectral Oceanic Fog:
  // Models the physical wavelength absorption of seawater (red -> green -> blue -> abyss)
  if (ratio > 0.015) {
    let currentFogColor;
    let currentFogDensity;

    if (ratio < 0.04) {
      // Epipelagic Photic Zone (0m - 160m): Tropical Azure to Photic Sapphire
      const t = ratio / 0.04;
      currentFogColor = new THREE.Color().lerpColors(
        new THREE.Color(0x0284c7),
        new THREE.Color(0x034f8a),
        t
      );
      currentFogDensity = 0.010 + t * 0.003;
    } else if (ratio < 0.18) {
      // Mesopelagic Twilight Zone (160m - 720m): Sapphire to Oceanic Indigo
      const t = (ratio - 0.04) / 0.14;
      currentFogColor = new THREE.Color().lerpColors(
        new THREE.Color(0x034f8a),
        new THREE.Color(0x041f48),
        t
      );
      currentFogDensity = 0.013 + t * 0.004;
    } else {
      // Bathypelagic & Hadal Abyss (>720m to 4000m): Deep Velvety Oceanic Midnight (NOT raw flat grey)
      const t = Math.min(1.0, (ratio - 0.18) / 0.82);
      currentFogColor = new THREE.Color().lerpColors(
        new THREE.Color(0x041f48),
        new THREE.Color(0x010816),
        t
      );
      currentFogDensity = 0.017 + t * 0.005;
    }

    if (!scene.fog) {
      scene.fog = new THREE.FogExp2(currentFogColor, currentFogDensity);
    } else {
      scene.fog.color.copy(currentFogColor);
      scene.fog.density = currentFogDensity;
    }
    renderer.setClearColor(currentFogColor, 1.0);
  } else {
    scene.fog = null;
    renderer.setClearColor(0x0a2d52, 1.0);
  }

  // 4. WATER SHADER COLOR & SPECULAR (Rich Blueish Tone):
  const surfaceWater = new THREE.Color(0x0284c7);
  const deepOceanBlue = new THREE.Color(0x0a3b68);
  waterMaterial.uniforms.uSurfaceColor.value.lerpColors(
    surfaceWater,
    deepOceanBlue,
    Math.min(1.0, ratio * 1.6),
  );

  const surfaceDepthColor = new THREE.Color(0x073b6a);
  const deepWaterBase = new THREE.Color(0x062242);
  waterMaterial.uniforms.uDepthColor.value.lerpColors(
    surfaceDepthColor,
    deepWaterBase,
    Math.min(1.0, ratio * 1.6),
  );

  // Synchronize sky horizon reflection with deep water
  waterMaterial.uniforms.uSkyHorizonColor.value.copy(skyMat.uniforms.uHorizonColor.value);

  // 5. AMBIENT & SUN LIGHTING IN DEEP WATER COLUMN:
  // Sunlight attenuates exponentially following Beer-Lambert law
  const lightFactor = Math.max(
    0.0,
    Math.pow(1.0 - Math.min(1.0, ratio * 1.4), 2.5),
  );
  sunLight.intensity = 2.5 * lightFactor;

  // Ambient light provides soft oceanic fill
  const surfaceAmbientColor = new THREE.Color(0xffffff);
  const deepOceanAmbientColor = new THREE.Color(0x164673);
  ambientLight.color.lerpColors(
    surfaceAmbientColor,
    deepOceanAmbientColor,
    Math.min(1.0, ratio * 1.3),
  );
  ambientLight.intensity = Math.max(0.45, 1.15 * (1.0 - ratio * 0.55));

  // 5.5 VOLUMETRIC GOD RAYS (SUNLIGHT SHAFTS):
  // Active only in photic layer (0m - 200m)
  const inPhoticZone = ratio > 0.005 && ratio < 0.055;
  godRaysGroup.visible = inPhoticZone;
  if (inPhoticZone) {
    godRayMat.uniforms.uDepthFade.value = Math.max(0.0, 1.0 - (ratio - 0.005) * 22.0);
  }

  // 6. APEX ARGO FLOAT DIVE SYNCHRONIZATION:
  // Synchronize Volumetric Slicing Mesh with depth descent (positioned below float's sensor pod)
  if (volumetricSliceMesh) {
    volumetricSliceMesh.position.y = argoDiveY - 2.8;
    volumetricSliceMesh.visible = OCEAN_STATE.sliceVisible;
  }
  OCEAN_STATE.depthRatio = ratio;
  OCEAN_STATE.depthMeters = depthMeters;
  if (typeof refreshVolumetricFields === "function") {
    refreshVolumetricFields();
  }

  // Focused Submersible Inspection Spotlight aimed at the APEX Float
  argoDiveLight.position.set(
    ARGO_FLOAT_CONFIG.x - 2.8,
    argoDiveY + 5.5,
    ARGO_FLOAT_CONFIG.z + 5.6,
  );
  argoDiveLight.target.position.set(
    ARGO_FLOAT_CONFIG.x,
    argoDiveY,
    ARGO_FLOAT_CONFIG.z,
  );
  argoDiveLight.target.updateMatrixWorld();
  argoDiveLight.color.setHex(0xe0f7fa);
  argoDiveLight.distance = 65;
  argoDiveLight.intensity =
    ratio > 0.015 ? Math.min(4.8, 1.5 + ratio * 3.3) : 0.0;

  // 7. ULTRA-REALISTIC MARINE SNOW PARTICLES:
  marineSnowPoints.visible = ratio > 0.008;
  marineSnowMat.uniforms.uUnderwaterRatio.value = ratio;
};

// ============================================================================
// 8. ANIMATION LOOP
// ============================================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  // Keep sky/abyss dome centered on camera so horizon and underground stay perfectly aligned
  sky.position.copy(camera.position);

  const elapsedTime = clock.getElapsedTime();

  // 1. Update Water Shader & Volumetric Slice Time Uniforms
  waterMaterial.uniforms.uTime.value = elapsedTime;
  
  // Dynamic Water Color based on Active Variable Checkbox
  if (window.oceanStore?.getState) {
    const activeVar = window.oceanStore.getState().activeVariable;
    if (activeVar === 'temperature') {
      waterMaterial.uniforms.uSurfaceColor.value.setHex(0xef476f); // Reddish for warm surface
      waterMaterial.uniforms.uDepthColor.value.setHex(0x00b4d8);   // Teal for cold deep
    } else if (activeVar === 'salinity') {
      waterMaterial.uniforms.uSurfaceColor.value.setHex(0xf97316); // Orange for salty surface
      waterMaterial.uniforms.uDepthColor.value.setHex(0x3b82f6);   // Blue for deeper salinity
    } else if (activeVar === 'chlorophyll') {
      waterMaterial.uniforms.uSurfaceColor.value.setHex(0x00ff00); // Green for high chl surface
      waterMaterial.uniforms.uDepthColor.value.setHex(0x3b006b);   // Dark purple for deep
    } else {
      waterMaterial.uniforms.uSurfaceColor.value.setHex(0x00f0ff); // Default Cyan
      waterMaterial.uniforms.uDepthColor.value.setHex(0x092d54);   // Default Deep Blue
    }
  }

  if (typeof sliceMat !== "undefined" && sliceMat.uniforms) {
    sliceMat.uniforms.uTime.value = elapsedTime;
  }

  // 1.5 4D Simulation Temporal Advance
  if (OCEAN_STATE.isPlaying) {
    OCEAN_STATE.timeOffsetHours += 0.08 * OCEAN_STATE.playbackSpeed;
    if (OCEAN_STATE.timeOffsetHours > 72) {
      OCEAN_STATE.timeOffsetHours = -72;
    }
    if (typeof refreshVolumetricFields === "function") {
      refreshVolumetricFields();
    }
  }


  // 2. Realistic Floating, Diving & Bobbing Effect for APEX Argo Float
  // Strictly reads ONLY its own depth from store.instruments['argo-2902351']
  if (argoFloat.visible) {
    const store = window.oceanStore?.getState ? window.oceanStore.getState() : null;
    const activeArgoId = DEMO_INSTRUMENTS[0]?.id || 'argo-2902351';
    const argoDepth = store?.instruments?.[activeArgoId]?.depth ?? store?.instruments?.['argo-2902351']?.depth ?? 15;
    const argoRatio = argoDepth / 4000.0;
    const maxArgoDepth = 95.0 * (OCEAN_STATE.verticalExaggeration || 1.0);
    const isolatedArgoDiveY = -argoRatio * maxArgoDepth;

    const fx = argoFloat.position.x;
    const fz = argoFloat.position.z;
    // Calculate water wave height at float's position
    const waveElev =
      Math.sin(fx * 0.28 + elapsedTime * 1.1) *
      Math.cos(fz * 0.18 + elapsedTime * 1.1) *
      0.38;

    // Smooth transition from surface wave bobbing to underwater smooth descent
    const surfaceInfluence = Math.max(0.0, 1.0 - argoRatio * 20.0);

    // Surface wave bobbing vs underwater gentle hydrodynamic motion
    const surfaceBobbing =
      (waveElev - 0.08 + Math.sin(elapsedTime * 2.2) * 0.04) * surfaceInfluence;
    const underwaterMotion =
      Math.sin(elapsedTime * 1.2) * 0.05 * (1.0 - surfaceInfluence);

    // Dynamic vertical position: strictly isolated Argo depth + waves/underwater current
    argoFloat.position.y =
      ARGO_FLOAT_CONFIG.y + isolatedArgoDiveY + surfaceBobbing + underwaterMotion;

    // Organic wave tilting at surface, stabilized underwater descent orientation
    argoFloat.rotation.z =
      Math.sin(elapsedTime * 1.4) *
      (0.065 * surfaceInfluence + 0.015 * (1.0 - surfaceInfluence));
    argoFloat.rotation.x =
      Math.cos(elapsedTime * 1.6) *
      (0.05 * surfaceInfluence + 0.012 * (1.0 - surfaceInfluence));
    argoFloat.rotation.y = elapsedTime * 0.035; // Gentle slow yaw drift
  }

  // 3. Animate Slow Cloud Drift across sky
  cloudsGroup.children.forEach((cloud) => {
    cloud.position.x += cloud.userData.speed;
    if (cloud.position.x > 150) {
      cloud.position.x = -150;
    }
  });

  // 4. Subtle Sun Glow pulsation
  sunGlowMesh.scale.setScalar(1.0 + 0.04 * Math.sin(elapsedTime * 1.5));

  // 5. Animate Volumetric God Rays & Deep-Sea Marine Snow
  if (godRaysGroup && godRaysGroup.visible) {
    godRayMat.uniforms.uTime.value = elapsedTime;
  }
  if (marineSnowPoints && marineSnowPoints.visible) {
    marineSnowMat.uniforms.uTime.value = elapsedTime;
  }

  // 6. Animate Ocean Instruments Fleet (Gliders sawtooth flight, CTD swaying, beacons pulsing)
  const gliderSlocum = interactiveInstrumentsMap.get("glider-slocum-04");
  if (gliderSlocum) {
    const isSlocumActive = selectedInstrumentId === "glider-slocum-04";
    const store = window.oceanStore?.getState ? window.oceanStore.getState() : null;

    if (isSlocumActive && store) {
      // 1. Target Depth (Y): from isolated instruments['glider-slocum-04'].depth
      const gliderData = store.instruments?.['glider-slocum-04'] || {};
      const currentDepthVal = gliderData.depth ?? store.activeInstrumentDepth ?? 190;
      const targetY = -Math.min(95, (currentDepthVal / 4000.0) * 90.0 * (OCEAN_STATE.verticalExaggeration || 1.0));

      // 2. Target Horizontal Position: from isolated instruments['glider-slocum-04'].transectDistance
      const horizontalKm = gliderData.transectDistance ?? store.activeInstrumentHorizontal ?? 25;
      const targetX = 7.2 + (horizontalKm - 25) * 0.75;
      const targetZ = -3.0 + (horizontalKm - 25) * 0.35;

      // 3. Move Slocum Glider immediately with high responsiveness
      gliderSlocum.position.y = THREE.MathUtils.lerp(gliderSlocum.position.y, targetY, 0.22);
      gliderSlocum.position.x = THREE.MathUtils.lerp(gliderSlocum.position.x, targetX, 0.22);
      gliderSlocum.position.z = THREE.MathUtils.lerp(gliderSlocum.position.z, targetZ, 0.22);

      // 4. Hydrodynamic Pitch & Roll Kinematics (-15° dive / +15° climb)
      const verticalDelta = targetY - gliderSlocum.position.y;
      const targetPitch = verticalDelta < -0.04 ? 0.2618 : (verticalDelta > 0.04 ? -0.2618 : 0);
      gliderSlocum.rotation.x = THREE.MathUtils.lerp(gliderSlocum.rotation.x, targetPitch, 0.12);
      gliderSlocum.rotation.z = Math.sin(elapsedTime * 0.8) * 0.03;

      // 5. Smooth Character Possession Chase Camera
      // Allows user to visibly see the glider model translate across the screen and dive,
      // while the camera smoothly follows and preserves the user's orbital view!
      if (!isCameraLerping) {
        const targetLookAt = new THREE.Vector3(
          gliderSlocum.position.x,
          gliderSlocum.position.y + 0.6,
          gliderSlocum.position.z
        );
        controls.target.lerp(targetLookAt, 0.08);

        const currentCamOffset = camera.position.clone().sub(controls.target);
        if (currentCamOffset.length() < 3.5 || currentCamOffset.length() > 22.0) {
          currentCamOffset.set(3.8, 2.4, 5.2);
        }
        const desiredCamPos = controls.target.clone().add(currentCamOffset);
        camera.position.lerp(desiredCamPos, 0.08);
      }
    } else {
      // Idle Slocum glider sawtooth kinematics: undulates with realistic pitch angle
      const slocumBaseY = -4.5;
      const slocumDive = Math.sin(elapsedTime * 0.4) * 1.5;
      const slocumPitch = Math.cos(elapsedTime * 0.4) * 0.16;
      gliderSlocum.position.x = 7.2 + Math.sin(elapsedTime * 0.25) * 1.8;
      gliderSlocum.position.y = slocumBaseY + slocumDive;
      gliderSlocum.position.z = -3.0 + Math.cos(elapsedTime * 0.25) * 1.8;
      gliderSlocum.rotation.x = slocumPitch;
      gliderSlocum.rotation.z = Math.sin(elapsedTime * 0.5) * 0.08;
    }

    // Update glowing sawtooth trajectory ribbon tracking behind Slocum
    if (slocumTrail && slocumTrail.userData?.update) {
      slocumTrail.userData.update(elapsedTime, gliderSlocum.position);
    }
  }

  const gliderSpray = interactiveInstrumentsMap.get("glider-spray-09");
  if (gliderSpray) {
    // Spray glider deep mesopelagic sawtooth flight kinematics
    const sprayBaseY = -14.2;
    const sprayDive = Math.sin(elapsedTime * 0.3) * 2.0;
    const sprayPitch = -Math.cos(elapsedTime * 0.3) * 0.14;
    gliderSpray.position.x = -7.8 + Math.cos(elapsedTime * 0.2) * 1.8;
    gliderSpray.position.y = sprayBaseY + sprayDive;
    gliderSpray.position.z = 4.0 + Math.sin(elapsedTime * 0.2) * 1.8;
    gliderSpray.rotation.x = sprayPitch;
    gliderSpray.rotation.z = -Math.sin(elapsedTime * 0.4) * 0.06;

    // Update glowing sawtooth trajectory ribbon tracking behind Spray
    if (sprayTrail && sprayTrail.userData?.update) {
      sprayTrail.userData.update(elapsedTime, gliderSpray.position);
    }
  }

  // 6.5. Animate Current Vector Particle Stream (Drifting horizontally along current direction)
  if (currentVectorStream && currentVectorStream.userData?.update) {
    currentVectorStream.userData.update(0.016, activeCurrentSpeed);
  }

  const ctdRosette = interactiveInstrumentsMap.get("ctd-rosette-01");
  if (ctdRosette) {
    // Gentle yaw rotation and current sway on the winch wire
    ctdRosette.rotation.y = Math.sin(elapsedTime * 0.4) * 0.18;
    ctdRosette.position.y = -28.5 + Math.sin(elapsedTime * 0.8) * 0.08;
  }

  const ctdMoored = interactiveInstrumentsMap.get("ctd-rosette-02");
  if (ctdMoored) {
    ctdMoored.rotation.y = Math.sin(elapsedTime * 0.2) * 0.05;
  }

  if (selectionRing && selectionRing.visible) {
    const activeMesh = interactiveInstrumentsMap.get(selectedInstrumentId);
    if (activeMesh) {
      selectionRing.position.set(activeMesh.position.x, activeMesh.position.y - 0.25, activeMesh.position.z);
    }
    selectionRing.scale.setScalar(1.0 + Math.sin(elapsedTime * 4.0) * 0.06);
  }

  // 7. Update camera controls & smooth lerping to prevent instant teleportation
  if (isCameraLerping) {
    controls.target.lerp(cameraTargetLookAt, 0.05);
    camera.position.lerp(cameraTargetPosition, 0.05);
    if (controls.target.distanceTo(cameraTargetLookAt) < 0.01 && camera.position.distanceTo(cameraTargetPosition) < 0.02) {
      controls.target.copy(cameraTargetLookAt);
      camera.position.copy(cameraTargetPosition);
      isCameraLerping = false;
    }
  }
  controls.update();

  try {
    renderer.render(scene, camera);
  } catch (renderErr) {
    console.error("[Ocean] render failed (loop survives):", renderErr?.message);
  }
  if (typeof window !== "undefined") window.__oceanBooted = true;
}

try {
  animate();
} catch (bootErr) {
  console.error("[Ocean] animate() failed to start:", bootErr);
  // Last-resort retry: the canvas exists, so schedule one more attempt
  try { requestAnimationFrame(animate); } catch (_e) {}
}

// ============================================================================
// 9. REACT MULTI-WINDOW WORKSPACE & FLEET BAR MOUNT
// ============================================================================
function initReactWorkspace() {
  let rootEl = document.getElementById("ocean-react-root");
  if (!rootEl) {
    rootEl = document.createElement("div");
    rootEl.id = "ocean-react-root";
    document.body.appendChild(rootEl);
  }

  try {
    const reactRoot = ReactDOM.createRoot(rootEl);
    reactRoot.render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(OceanDashboard, { instruments: DEMO_INSTRUMENTS })
      )
    );
    console.log("✅ [Ocean.js] OceanDashboard (resizable panels) mounted successfully.");
  } catch (err) {
    console.error("❌ [Ocean.js] Failed to mount OceanDashboard:", err);
  }
}

// Mount the full dashboard layout
initReactWorkspace();
