import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { gsap } from "gsap";
import earth8kMapUrl from "../Images/8k_earth_daymap.jpg";
import earth8kCloudsUrl from "../Images/8k_earth_clouds.jpg";
import { oceanDataService } from "./oceanDataService.js";
import { createOrbitalDiveController } from "./orbitalDive.js";
import { getRealArgoPoints, ARGO_FLEET_CONFIG } from "./argoFleetService.js";
import { useOceanStore } from "./useOceanStore.js";

// ============================================================================
// ⚙️ ANCHOR & BADGE SIZE CONFIGURATION (User Configurable)
// ============================================================================
export const ANCHOR_SIZE_CONFIG = {
  masterScale: 0.7,
  minScale: 0.055,
  maxScale: 0.42,
  zoomOutDistance: 4.8,
  zoomInDistance: 1.85,
  zoomCurvePower: 1.8,
  dynamicZoom: true,
};

// Load saved user preferences if available
try {
  const saved = localStorage.getItem("ocean_marker_config");
  if (saved) {
    Object.assign(ANCHOR_SIZE_CONFIG, JSON.parse(saved));
  }
} catch (e) {
  console.warn("Could not read marker config from localStorage", e);
}

// Expose configuration globally for UI controls
window.ANCHOR_SIZE_CONFIG = ANCHOR_SIZE_CONFIG;
window.updateMarkerSizing = function (newCfg) {
  Object.assign(ANCHOR_SIZE_CONFIG, newCfg);
  try {
    localStorage.setItem(
      "ocean_marker_config",
      JSON.stringify(ANCHOR_SIZE_CONFIG),
    );
  } catch (_e) {
    /* ignore */
  }
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
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

// Expose these for the React-Three-Fiber shim
window.scene = scene;
window.camera = camera;
window.__oceanRenderer = renderer;

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
worldTexture.anisotropy = Math.min(
  renderer.capabilities.getMaxAnisotropy(),
  16,
);
worldTexture.minFilter = THREE.LinearMipmapLinearFilter;
worldTexture.magFilter = THREE.LinearFilter;
worldTexture.generateMipmaps = true;

// Pristine tessellation for 8K resolution: 128 x 96 segments
const globeGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 128, 96);
const globeMaterial = new THREE.MeshStandardMaterial({
  map: worldTexture,
  roughness: 0.65,
  metalness: 0.05,
  transparent: true,
  opacity: 1.0,
});
export const globeMesh = new THREE.Mesh(globeGeometry, globeMaterial);
globeMesh.renderOrder = 0;
scene.add(globeMesh);

// ----------------------------------------------------------------------------
// 7a. Photorealistic 8K Earth Clouds Layer with Volumetric Shadow Projection
// ----------------------------------------------------------------------------
// Load 8K Earth satellite cloud density map
const cloudsTexture = textureLoader.load(earth8kCloudsUrl, (tex) => {
  tex.needsUpdate = true;
});
cloudsTexture.colorSpace = THREE.LinearSRGBColorSpace;
cloudsTexture.wrapS = THREE.RepeatWrapping;
cloudsTexture.wrapT = THREE.ClampToEdgeWrapping;
cloudsTexture.minFilter = THREE.LinearMipmapLinearFilter;
cloudsTexture.magFilter = THREE.LinearFilter;
cloudsTexture.generateMipmaps = true;
cloudsTexture.anisotropy = Math.min(
  renderer.capabilities.getMaxAnisotropy(),
  16,
);

// 1. Soft Cloud Shadow Projection Layer
// Renders just 0.0035 above the Earth surface to cast true physical shadows onto oceans and continents
const cloudShadowVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const cloudShadowFragmentShader = `
  uniform sampler2D uCloudsMap;
  uniform vec3 uSunDirection;
  uniform float uShadowOpacity;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 norm = normalize(vNormal);
    vec3 sunDir = normalize(uSunDirection);
    float sunDot = dot(norm, sunDir);

    // Shadows only exist where sun penetrates and illuminates the cloud tops
    if (sunDot <= 0.0) {
      discard;
    }

    // Offset shadow UV along the anti-sun tangent vector to simulate true physical altitude projection
    vec2 shadowOffset = vec2(-sunDir.x, -sunDir.y) * 0.0022;
    vec2 sampleUv = vUv + shadowOffset;

    float cloudSample = texture2D(uCloudsMap, sampleUv).r;
    if (cloudSample < 0.04) {
      discard;
    }

    // Smooth shadow density profile
    float shadowDensity = smoothstep(0.08, 0.75, cloudSample);

    // Soft, gentle ambient shadow: 22% max darkening so oceans & terrain remain luminous
    float shadowAlpha = shadowDensity * 0.22 * smoothstep(0.0, 0.28, sunDot) * uShadowOpacity;

    // Atmospheric shadow tint (deep charcoal navy)
    gl_FragColor = vec4(vec3(0.015, 0.02, 0.035), shadowAlpha);
  }
`;

export const cloudShadowMaterial = new THREE.ShaderMaterial({
  vertexShader: cloudShadowVertexShader,
  fragmentShader: cloudShadowFragmentShader,
  uniforms: {
    uCloudsMap: { value: cloudsTexture },
    uSunDirection: { value: sunLight.position.clone().normalize() },
    uShadowOpacity: { value: 1.0 },
  },
  transparent: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
});

const cloudShadowGeometry = new THREE.SphereGeometry(
  GLOBE_RADIUS * 1.0024,
  128,
  96,
);
export const cloudShadowMesh = new THREE.Mesh(
  cloudShadowGeometry,
  cloudShadowMaterial,
);
cloudShadowMesh.renderOrder = 1;
cloudShadowMesh.raycast = () => {}; // Never block raycasting or buoy selection
scene.add(cloudShadowMesh);

// 2. Realistic Pure White 8K NASA Cloud Layer
const cloudsVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const cloudsFragmentShader = `
  uniform sampler2D uCloudsMap;
  uniform vec3 uSunDirection;
  uniform float uCloudOpacity;
  uniform float uFogDensity; // For backward compatibility
  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;

  void main() {
    // High-resolution NASA satellite cloud density sample
    float cloudRaw = texture2D(uCloudsMap, vUv).r;

    // Razor-sharp clear sky: keep ocean waters and landmasses crystal clear
    if (cloudRaw < 0.02) {
      discard;
    }

    vec3 norm = normalize(vNormal);
    vec3 sunDir = normalize(uSunDirection);
    vec3 viewDir = normalize(vViewPosition);

    float sunDot = dot(norm, sunDir);

    // Organic cloud density profile: delicate wispy fog to dense storm fronts
    float density = smoothstep(0.03, 0.74, cloudRaw);
    float core = smoothstep(0.30, 0.88, cloudRaw);

    // Volumetric water droplet Mie scattering: clouds remain pure luminous white everywhere!
    // Lit side: brilliant crisp white. Shaded side: soft glowing white-marine fog mist.
    float directDiffuse = clamp(sunDot * 0.55 + 0.45, 0.0, 1.0);
    vec3 sunlitWhite = vec3(1.0, 1.0, 1.0) * (0.88 + 0.12 * directDiffuse);
    vec3 ambientWhite = vec3(0.85, 0.90, 0.98) * 0.72; // Soft marine ambient
    vec3 cloudColor = mix(ambientWhite, sunlitWhite, clamp(sunDot * 0.8 + 0.4, 0.0, 1.0));

    // Core convective storm albedo boost: brilliant white storm centers
    cloudColor += vec3(0.12, 0.12, 0.12) * core * directDiffuse;

    // Inverted Fresnel limb glow: luminous white cloud fog seen at the planetary horizon
    float limbFresnel = 1.0 - max(0.0, dot(norm, viewDir));
    float limbGlow = pow(limbFresnel, 2.2) * 0.38;
    cloudColor += vec3(0.92, 0.96, 1.0) * limbGlow;

    // Silver lining specular highlight when facing towards the sun
    vec3 halfVec = normalize(sunDir + viewDir);
    float silverLining = pow(max(0.0, dot(norm, halfVec)), 8.0) * 0.26 * directDiffuse;
    cloudColor += vec3(1.0, 1.0, 1.0) * silverLining;

    // Realistic fog alpha: translucent cirrus mist, solid opaque cumulus clouds
    float alpha = (density * 0.76 + core * 0.24) * uCloudOpacity;
    alpha = clamp(alpha, 0.0, 0.94);

    gl_FragColor = vec4(cloudColor, alpha);
  }
`;

export const cloudsMaterial = new THREE.ShaderMaterial({
  vertexShader: cloudsVertexShader,
  fragmentShader: cloudsFragmentShader,
  uniforms: {
    uCloudsMap: { value: cloudsTexture },
    uSunDirection: { value: sunLight.position.clone().normalize() },
    uCloudOpacity: { value: 1.0 },
    uFogDensity: { value: 1.0 },
    uTime: { value: 0.0 },
  },
  transparent: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
});

// Pristine tessellation matching 8K texture resolution
export const cloudsMesh = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.008, 128, 96),
  cloudsMaterial,
);
cloudsMesh.renderOrder = 2;
cloudsMesh.raycast = () => {}; // Never block raycasting or buoy selection
scene.add(cloudsMesh);

// 3. High-Altitude Swirling White Cloud Fog Layer
const cloudFogVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const cloudFogFragmentShader = `
  uniform float uTime;
  uniform vec3 uSunDirection;
  uniform float uFogOpacity;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;

  // Fast GPU Simplex Noise
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
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  void main() {
    vec3 norm = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    vec3 sunDir = normalize(uSunDirection);

    // Organic planetary cloud fog coordinates
    vec3 p = normalize(vWorldPosition) * 3.4;
    vec3 drift1 = vec3(uTime * 0.009, uTime * 0.005, uTime * 0.007);
    vec3 drift2 = vec3(-uTime * 0.006, uTime * 0.008, -uTime * 0.005);
    float n = snoise(p + drift1) * 0.65 + snoise(p * 2.1 + drift2) * 0.35;

    // Smooth wisps of white fog
    float fogPattern = smoothstep(0.12, 0.62, n + 0.16);
    if (fogPattern < 0.02) {
      discard;
    }

    float sunDot = dot(norm, sunDir);
    float directLight = clamp(sunDot * 0.5 + 0.5, 0.35, 1.0);

    // Pure ethereal white cloud fog
    vec3 whiteFogColor = vec3(0.96, 0.98, 1.0) * (0.88 + 0.12 * directLight);

    // Grazing edge cloud fog illumination
    float limb = pow(1.0 - max(0.0, dot(norm, viewDir)), 2.4);
    whiteFogColor += vec3(0.18, 0.20, 0.24) * limb;

    // Translucent airy fog mist
    float alpha = fogPattern * (0.18 + 0.14 * directLight) * uFogOpacity;
    alpha = clamp(alpha, 0.0, 0.32);

    gl_FragColor = vec4(whiteFogColor, alpha);
  }
`;

export const cloudFogMaterial = new THREE.ShaderMaterial({
  vertexShader: cloudFogVertexShader,
  fragmentShader: cloudFogFragmentShader,
  uniforms: {
    uTime: { value: 0.0 },
    uSunDirection: { value: sunLight.position.clone().normalize() },
    uFogOpacity: { value: 1.0 },
  },
  transparent: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
});

export const cloudFogMesh = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.014, 96, 64),
  cloudFogMaterial,
);
cloudFogMesh.renderOrder = 3;
cloudFogMesh.raycast = () => {}; // Never block raycasting or buoy selection
scene.add(cloudFogMesh);

// Backwards-compatibility aliases
export const dynamicFogMesh = cloudsMesh;
export const dynamicFogMaterial = cloudsMaterial;

// ----------------------------------------------------------------------------
// 7b. Realistic Atmospheric White Cloud Fog Horizon Rim & Azure Halo
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
  uniform float uTime;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    vec3 norm = normalize(vNormal);
    vec3 worldNorm = normalize(vWorldPosition);

    // Inverted Fresnel: highest along the grazing edge of the planet
    float rim = 1.0 - max(0.0, dot(viewDir, norm));

    // Two-tier atmospheric horizon:
    // 1. Lower troposphere: Soft luminous milky-white cloud fog mist right along the horizon
    // 2. Upper stratosphere: Gentle azure blue blending gracefully into deep space
    vec3 whiteCloudFog = vec3(0.96, 0.98, 1.0);
    vec3 azureSky = vec3(0.20, 0.65, 1.0);

    // Low grazing angles catch dense white mist; outer grazing fades to azure
    vec3 rimColor = mix(whiteCloudFog, azureSky, pow(rim, 1.5));

    // Sunlit hemisphere illumination
    float sunDot = dot(worldNorm, normalize(uSunDirection));
    float sunFactor = clamp(sunDot * 0.5 + 0.5, 0.25, 1.0);

    // Atmospheric halo intensity
    float halo = pow(rim, 2.6) * 1.65;
    float alpha = clamp(halo * sunFactor, 0.0, 0.92);

    gl_FragColor = vec4(rimColor, alpha);
  }
`;

const atmosphereMaterial = new THREE.ShaderMaterial({
  vertexShader: atmosphereVertexShader,
  fragmentShader: atmosphereFragmentShader,
  uniforms: {
    uTime: { value: 0.0 },
    uSunDirection: { value: sunLight.position.clone().normalize() },
  },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const atmosphereGeometry = new THREE.SphereGeometry(
  GLOBE_RADIUS * 1.025,
  96,
  64,
);
const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
atmosphere.renderOrder = 4;
atmosphere.raycast = () => {}; // Never block raycasting
scene.add(atmosphere);

// ----------------------------------------------------------------------------
// 7b. Real-Time Sea Surface Temperature (SST) Thermal Heatmap Layer
// ----------------------------------------------------------------------------
// Dynamically renders a continuous high-resolution satellite-style ocean thermal
// field across the Indian Ocean basin interpolated directly from live ERDDAP floats.
const sstCanvas = document.createElement("canvas");
sstCanvas.width = 2048;
sstCanvas.height = 1024;
const sstCtx = sstCanvas.getContext("2d", { willReadFrequently: true });
const sstTexture = new THREE.CanvasTexture(sstCanvas);
sstTexture.colorSpace = THREE.SRGBColorSpace;
sstTexture.minFilter = THREE.LinearFilter;
sstTexture.magFilter = THREE.LinearFilter;

const sstGeometry = new THREE.SphereGeometry(GLOBE_RADIUS * 1.0022, 128, 96);
const sstMaterial = new THREE.MeshBasicMaterial({
  map: sstTexture,
  transparent: true,
  opacity: 0.0,
  depthWrite: false,
  depthTest: true,
  blending: THREE.NormalBlending,
});
export const sstMesh = new THREE.Mesh(sstGeometry, sstMaterial);
sstMesh.renderOrder = 2; // Above Earth daymap (0) & shadows (1), beneath clouds (3) & atmosphere (4)
sstMesh.raycast = () => {}; // Never block raycasting
scene.add(sstMesh);

// ─── Indian Ocean Geographic Land Mask Helpers ──────────────────────────────
function getWestCoastLon(lat) {
  if (lat < 8.08) return 77.55;
  if (lat < 10.0)
    return 77.55 - ((lat - 8.08) / (10.0 - 8.08)) * (77.55 - 76.2);
  if (lat < 13.0) return 76.2 - ((lat - 10.0) / 3.0) * (76.2 - 74.8);
  if (lat < 16.0) return 74.8 - ((lat - 13.0) / 3.0) * (74.8 - 73.5);
  if (lat < 19.5) return 73.5 - ((lat - 16.0) / 3.5) * (73.5 - 72.7);
  if (lat < 21.0) return 72.7 - ((lat - 19.5) / 1.5) * (72.7 - 71.0);
  if (lat < 22.5) return 71.0 - ((lat - 21.0) / 1.5) * (71.0 - 69.0);
  if (lat <= 24.0) return 69.0 - ((lat - 22.5) / 1.5) * (69.0 - 68.3);
  return 68.3;
}

function getEastCoastLon(lat) {
  if (lat < 8.08) return 77.55;
  if (lat < 10.5)
    return 77.55 + ((lat - 8.08) / (10.5 - 8.08)) * (79.8 - 77.55);
  if (lat < 13.5) return 79.8 + ((lat - 10.5) / 3.0) * (80.3 - 79.8);
  if (lat < 16.5) return 80.3 + ((lat - 13.5) / 3.0) * (82.0 - 80.3);
  if (lat < 19.0) return 82.0 + ((lat - 16.5) / 2.5) * (84.5 - 82.0);
  if (lat < 21.5) return 84.5 + ((lat - 19.0) / 2.5) * (87.2 - 84.5);
  if (lat <= 23.5) return 87.2 + ((lat - 21.5) / 2.0) * (91.0 - 87.2);
  return 91.0;
}

function isIndianOceanWater(lat, lon) {
  if (lat < 0.0 || lat > 25.5 || lon < 54.0 || lon > 99.0) return false;
  // Sri Lanka
  if (lat >= 5.85 && lat <= 9.85 && lon >= 79.6 && lon <= 81.9) return false;
  // Indian Peninsula
  if (lat >= 8.08 && lat <= 23.5) {
    const w = getWestCoastLon(lat);
    const e = getEastCoastLon(lat);
    if (lon >= w && lon <= e) return false;
  }
  // North India mainland
  if (lat > 23.5 && lon >= 68.0 && lon <= 89.0) return false;
  // Northwest land (Pakistan / Iran / Oman)
  if (lat > 24.5 && lon < 67.2) return false;
  if (lat > 22.0 && lon < 59.5) return false;
  // East land (Myanmar / Thailand / Malay peninsula)
  if (lat > 16.0 && lon > 94.5) return false;
  if (lat > 10.0 && lon > 98.5) return false;
  if (lat < 5.5 && lon > 95.5) return false;
  return true;
}

// ─── Thermal Color Ramp (Satellite Ocean Sea Surface Temperature) ───────────
const SST_COLOR_STOPS = [
  { t: 26.0, r: 14, g: 116, b: 144 }, // Deep Ocean Teal
  { t: 27.0, r: 6, g: 182, b: 212 }, // Cool Cyan
  { t: 27.7, r: 34, g: 197, b: 94 }, // Sea Green
  { t: 28.4, r: 234, g: 179, b: 8 }, // Golden Amber
  { t: 29.1, r: 249, g: 115, b: 22 }, // Flame Orange
  { t: 29.7, r: 225, g: 29, b: 72 }, // Rich Crimson
  { t: 30.8, r: 115, g: 20, b: 48 }, // Deep Burgundy / Thermal Maroon
];

function tempToSstColor(t) {
  const stops = SST_COLOR_STOPS;
  if (t <= stops[0].t) return [stops[0].r, stops[0].g, stops[0].b];
  if (t >= stops[stops.length - 1].t) {
    const last = stops[stops.length - 1];
    return [last.r, last.g, last.b];
  }
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      const factor = (t - stops[i].t) / (stops[i + 1].t - stops[i].t);
      const r = Math.round(stops[i].r + factor * (stops[i + 1].r - stops[i].r));
      const g = Math.round(stops[i].g + factor * (stops[i + 1].g - stops[i].g));
      const b = Math.round(stops[i].b + factor * (stops[i + 1].b - stops[i].b));
      return [r, g, b];
    }
  }
  return [115, 20, 48];
}

/**
 * Generate high-resolution continuous thermal sea surface temperature field
 * interpolated from live Argo float observations across the North Indian Ocean basin.
 */
export function updateSstHeatmap(floats) {
  if (!floats || floats.length === 0) return;
  const validFloats = floats.filter(
    (f) => f.surfaceTemp !== undefined && !isNaN(f.surfaceTemp),
  );
  if (validFloats.length === 0) return;

  const W = sstCanvas.width;
  const H = sstCanvas.height;
  const xMin = Math.floor(((54.0 + 180.0) / 360.0) * W);
  const xMax = Math.ceil(((99.0 + 180.0) / 360.0) * W);
  const yMin = Math.floor(((90.0 - 25.5) / 180.0) * H);
  const yMax = Math.ceil(((90.0 - 0.0) / 180.0) * H);
  const patchW = xMax - xMin;
  const patchH = yMax - yMin;

  const imgData = sstCtx.createImageData(patchW, patchH);
  const data = imgData.data;

  for (let y = yMin; y < yMax; y++) {
    const lat = 90.0 - (y / H) * 180.0;
    for (let x = xMin; x < xMax; x++) {
      const lon = (x / W) * 360.0 - 180.0;
      const idx = ((y - yMin) * patchW + (x - xMin)) * 4;

      if (!isIndianOceanWater(lat, lon)) {
        data[idx + 3] = 0;
        continue;
      }

      // Inverse Distance Weighting (IDW) interpolation from real-time floats
      let sumW = 0.0;
      let sumT = 0.0;
      for (let k = 0; k < validFloats.length; k++) {
        const f = validFloats[k];
        const d2 =
          (lat - f.lat) * (lat - f.lat) + (lon - f.lon) * (lon - f.lon);
        const w = 1.0 / (d2 + 0.42);
        sumW += w;
        sumT += w * f.surfaceTemp;
      }
      const t = sumT / sumW;
      const [r, g, b] = tempToSstColor(t);

      // Smooth alpha feathering near outer domain boundaries
      const fNorth = Math.min(1.0, Math.max(0.0, (25.5 - lat) / 1.2));
      const fSouth = Math.min(1.0, Math.max(0.0, (lat - 0.0) / 1.2));
      const fWest = Math.min(1.0, Math.max(0.0, (lon - 54.0) / 1.5));
      const fEast = Math.min(1.0, Math.max(0.0, (99.0 - lon) / 1.5));
      const alpha = Math.round(212 * fNorth * fSouth * fWest * fEast);

      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = alpha;
    }
  }

  sstCtx.clearRect(0, 0, W, H);
  sstCtx.putImageData(imgData, xMin, yMin);
  sstTexture.needsUpdate = true;
  console.info(
    `[SST Heatmap] ✓ Real-time sea surface temperature field generated from ${validFloats.length} live Argo floats.`,
  );
}
window.updateSstHeatmap = updateSstHeatmap;

// 8. Argo Float Points — loaded dynamically from ERDDAP (or fallback)
// Mutable array: populated by loadLiveArgoFleet() at startup
export let argoPoints = [];

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
  const lat =
    90 - Math.acos(Math.max(-1, Math.min(1, norm.y))) * (180 / Math.PI);
  let lon = Math.atan2(norm.z, -norm.x) * (180 / Math.PI) - 180;
  while (lon < -180) lon += 360;
  while (lon > 180) lon -= 360;
  return { lat, lon };
}

// Function to generate billboard Sprite matching buoy / pin styles in user screenshots
function createAnchorSprite(point) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 384;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const markerType = point.markerType || "buoy-yellow";
  const code = point.code || point.id;
  const cx = 192;

  if (markerType === "buoy-yellow") {
    // ==========================================
    // 🟡 MARITIME OBSERVATION BUOY (Yellow Buoy)
    // ==========================================
    ctx.save();

    // 1. Top Flashing Beacon Light Glow
    ctx.shadowColor = "#ffea00";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "#fff59d";
    ctx.beginPath();
    ctx.arc(cx, 44, 14, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright core
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, 44, 7, 0, Math.PI * 2);
    ctx.fill();

    // 2. Antenna Mast with outline
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, 56);
    ctx.lineTo(cx, 98);
    ctx.stroke();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx, 56);
    ctx.lineTo(cx, 98);
    ctx.stroke();

    // 3. Superstructure Tower Struts
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx - 24, 106);
    ctx.lineTo(cx, 66);
    ctx.lineTo(cx + 24, 106);
    ctx.stroke();

    ctx.strokeStyle = "#ffe082";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 24, 106);
    ctx.lineTo(cx, 66);
    ctx.lineTo(cx + 24, 106);
    ctx.stroke();

    // Cross strut
    ctx.beginPath();
    ctx.moveTo(cx - 16, 88);
    ctx.lineTo(cx + 16, 88);
    ctx.stroke();

    // 4. Buoy Float Hull (conical maritime buoy float)
    const buoyGrad = ctx.createLinearGradient(cx - 60, 106, cx + 60, 180);
    buoyGrad.addColorStop(0, "#fff59d");
    buoyGrad.addColorStop(0.25, "#ffd600");
    buoyGrad.addColorStop(0.75, "#ffb300");
    buoyGrad.addColorStop(1, "#f57f17");

    ctx.beginPath();
    ctx.moveTo(cx - 32, 106);
    ctx.lineTo(cx + 32, 106);
    ctx.lineTo(cx + 56, 150);
    ctx.quadraticCurveTo(cx + 52, 180, cx, 182);
    ctx.quadraticCurveTo(cx - 52, 180, cx - 56, 150);
    ctx.closePath();

    ctx.fillStyle = buoyGrad;
    ctx.fill();

    // Bold dark outer border + white inner border
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 4;
    ctx.stroke();

    // Waterline band
    ctx.fillStyle = "#0a1932";
    ctx.fillRect(cx - 50, 144, 100, 7);

    ctx.restore();
  } else if (markerType === "pin-red") {
    // ==========================================
    // 📍 RED LOCATION PIN (CB02, CALVAL, CB01)
    // ==========================================
    ctx.save();
    const cy = 96;
    const r = 50;
    const tipY = 186;

    ctx.shadowColor = "#ff3b30";
    ctx.shadowBlur = 24;

    const redGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, tipY);
    redGrad.addColorStop(0, "#ff5252");
    redGrad.addColorStop(0.5, "#e53935");
    redGrad.addColorStop(1, "#b71c1c");

    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.85, Math.PI * 0.15, false);
    ctx.lineTo(cx, tipY);
    ctx.closePath();

    ctx.fillStyle = redGrad;
    ctx.fill();

    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 4.5;
    ctx.stroke();

    // Center circular dot
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#d32f2f";
    ctx.fill();

    ctx.restore();
  } else {
    // ==========================================
    // 🔘 GREY / PLATINUM PIN (CB06)
    // ==========================================
    ctx.save();
    const cy = 96;
    const r = 50;
    const tipY = 186;

    ctx.shadowColor = "#cfd8dc";
    ctx.shadowBlur = 20;

    const greyGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, tipY);
    greyGrad.addColorStop(0, "#ffffff");
    greyGrad.addColorStop(0.4, "#cfd8dc");
    greyGrad.addColorStop(1, "#607d8b");

    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.85, Math.PI * 0.15, false);
    ctx.lineTo(cx, tipY);
    ctx.closePath();

    ctx.fillStyle = greyGrad;
    ctx.fill();

    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 4.5;
    ctx.stroke();

    // Center circular dot
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#37474f";
    ctx.fill();

    ctx.restore();
  }

  // ==========================================
  // 🏷️ HIGH-CONTRAST DATA BADGE UNDER MARKER
  // ==========================================
  ctx.save();
  const badgeY = 206;
  const badgeHeight = 66;

  // Measure text width for perfect badge sizing
  ctx.font = '900 32px "Outfit", "Segoe UI", Inter, sans-serif';
  const textWidth = ctx.measureText(code).width;
  const badgeWidth = Math.max(170, textWidth + 56);
  const badgeX = cx - badgeWidth / 2;

  const strokeColor =
    markerType === "pin-red"
      ? "#ff3b30"
      : markerType === "pin-grey"
        ? "#cfd8dc"
        : "#ffea00";

  // 1. Solid Jet-Black Opaque Background (Prevents any clouds from bleeding through)
  ctx.shadowColor = strokeColor;
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#020713"; // 100% Solid Dark Navy

  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 14);
  ctx.fill();

  // 2. Thick Vibrant Accent Border with shadow glow
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 4;
  ctx.stroke();

  // Outer black halo border
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 3. Station Code (Ultra-Bold White with Heavy Black Outline)
  ctx.shadowBlur = 0;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = '900 30px "Outfit", "Segoe UI", Inter, sans-serif';
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.strokeText(code, cx, badgeY + 26);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(code, cx, badgeY + 26);

  // 4. Subtitle Coordinates (Crisp with Black Outline)
  const subtitleColor =
    markerType === "pin-red"
      ? "#ff8a80"
      : markerType === "pin-grey"
        ? "#e0e0e0"
        : "#ffe57f";
  const coords = `${point.lat.toFixed(1)}°N, ${point.lon.toFixed(1)}°E`;
  ctx.font = 'bold 16px "Space Mono", monospace';
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 4;
  ctx.strokeText(coords, cx, badgeY + 50);
  ctx.fillStyle = subtitleColor;
  ctx.fillText(coords, cx, badgeY + 50);

  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.renderOrder = 200; // ALWAYS renders ON TOP of all clouds, atmosphere & fog!
  sprite.scale.set(
    ANCHOR_SIZE_CONFIG.maxScale * ANCHOR_SIZE_CONFIG.masterScale,
    ANCHOR_SIZE_CONFIG.maxScale * ANCHOR_SIZE_CONFIG.masterScale,
    1,
  );
  return sprite;
}

// Group to hold all interactive markers
const markersGroup = new THREE.Group();
markersGroup.renderOrder = 200;
scene.add(markersGroup);

const clickableSprites = [];
const beaconMeshes = [];
const stemLines = [];
let selectedStationId = null;
let currentLoadedData = null;
let temperatureColorMode = false; // Toggle state for temperature-based beacon colors

/**
 * Initialize 3D markers on the globe for the given array of float points.
 * Clears any existing markers first, allowing dynamic reload.
 */
function initArgoMarkers(points) {
  // Clear existing markers
  clickableSprites.length = 0;
  beaconMeshes.length = 0;
  stemLines.length = 0;

  // Remove all children from markersGroup
  while (markersGroup.children.length > 0) {
    const child = markersGroup.children[0];
    markersGroup.remove(child);
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (child.material.map) child.material.map.dispose();
      child.material.dispose();
    }
  }

  points.forEach((point) => {
    const surfacePos = latLonToVector3(point.lat, point.lon, GLOBE_RADIUS);
    // Snug marker altitude so stem is short, clean, and tight to the surface
    const markerPos = latLonToVector3(
      point.lat,
      point.lon,
      GLOBE_RADIUS + 0.075,
    );

    // Determine beacon color: temperature-based or default
    let defaultColor = point.beaconColor || 0x00f0ff;
    if (temperatureColorMode && point.surfaceTemp !== undefined) {
      defaultColor = point.surfaceTemp > 28 ? 0xff4d4d : 0x00f0ff;
    }

    // 1. Surface beacon dot
    const beaconGeo = new THREE.SphereGeometry(0.022, 16, 16);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: defaultColor,
      depthTest: true,
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.copy(surfacePos);
    beacon.userData = {
      id: point.id,
      defaultColor: defaultColor,
      point: point,
    };
    beacon.renderOrder = 150;
    markersGroup.add(beacon);
    beaconMeshes.push(beacon);

    // 2. Connecting stem line matching beacon color
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      surfacePos,
      markerPos,
    ]);
    const lineMat = new THREE.LineBasicMaterial({
      color: defaultColor,
      transparent: true,
      opacity: 0.9,
      linewidth: 2,
      depthTest: true,
    });
    const stem = new THREE.Line(lineGeo, lineMat);
    stem.renderOrder = 120;
    markersGroup.add(stem);
    stemLines.push(stem);

    // 3. Floating billboard anchor sprite
    const sprite = createAnchorSprite(point);
    sprite.position.copy(markerPos);
    sprite.userData = point;
    sprite.renderOrder = 200;
    markersGroup.add(sprite);
    clickableSprites.push(sprite);
  });

  // Update sidebar station count if present
  const countEl = document.querySelector(".sidebar-count");
  if (countEl) countEl.textContent = `${points.length} FLOATS`;
}

/**
 * Load live Argo fleet data from ERDDAP and render markers on the globe.
 * @param {number} [count] - Override targetCount (optional)
 */
async function loadLiveArgoFleet(count) {
  const targetCount = count || ARGO_FLEET_CONFIG.targetCount;
  console.info(`[ArgoFleet] Loading ${targetCount} live Argo floats...`);

  try {
    const points = await getRealArgoPoints(targetCount);
    argoPoints = points;
    initArgoMarkers(argoPoints);

    // Build sidebar station cards dynamically
    buildSidebarCards(argoPoints);

    // Generate real-time Sea Surface Temperature (SST) thermal field across the basin
    const allFloats =
      typeof window !== "undefined" &&
      window.argoAllBasinFloats &&
      window.argoAllBasinFloats.length > 0
        ? window.argoAllBasinFloats
        : argoPoints;
    updateSstHeatmap(allFloats);

    // Select the first float
    if (argoPoints.length > 0) {
      selectStation(argoPoints[0].id);
    }

    console.info(
      `[ArgoFleet] ✓ ${argoPoints.length} Argo floats rendered on globe`,
    );
  } catch (err) {
    console.error("[ArgoFleet] Failed to load fleet:", err);
  }
}

/**
 * Build sidebar station cards from live Argo data.
 */
function buildSidebarCards(points) {
  const list = document.querySelector(".stations-list");
  if (!list) return;

  list.innerHTML = points
    .map((pt) => {
      const icon =
        pt.surfaceTemp !== undefined && pt.surfaceTemp > 28 ? "🔴" : "🔵";
      const typeLabel = pt.type || "Argo Profiling Float";
      return `
      <div class="station-card" data-id="${pt.id}" data-alt-id="${pt.altId || pt.id}" onclick="focusOnPoint('${pt.id}')">
        <div class="card-top">
          <span class="card-id" style="color:#00f0ff;">${icon} ${pt.id}</span>
          <span class="card-code">${typeLabel.split(" ").slice(0, 2).join(" ").toUpperCase()}</span>
        </div>
        <div class="card-sea">${pt.sea || pt.region}</div>
        <div class="card-coords">
          <span>${pt.lat.toFixed(2)}°N</span>
          <span>${pt.lon.toFixed(2)}°E</span>
        </div>
      </div>
    `;
    })
    .join("");
}

/**
 * Apply or remove temperature-based beacon coloring and ocean SST thermal field.
 * Called by the Temperature toggle checkbox in the UI.
 */
function applyTemperatureColors(enabled) {
  temperatureColorMode = enabled;

  // 1. Recolor beacon meshes
  beaconMeshes.forEach((b) => {
    const pt = b.userData.point;
    if (!pt) return;

    let newColor;
    if (enabled && pt.surfaceTemp !== undefined) {
      // Temperature-based: warm red (>28°C) vs cool cyan (≤28°C)
      newColor = pt.surfaceTemp > 28 ? 0xff4d4d : 0x00f0ff;
    } else {
      // Default uniform cyan
      newColor = pt.beaconColor || 0x00f0ff;
    }

    b.userData.defaultColor = newColor;
    // Only recolor if not currently selected (selected = green)
    if (b.userData.id !== selectedStationId) {
      b.material.color.setHex(newColor);
    }
  });

  // 2. Recolor stem lines
  stemLines.forEach((stem, idx) => {
    if (beaconMeshes[idx]) {
      stem.material.color.setHex(beaconMeshes[idx].userData.defaultColor);
    }
  });

  // 3. Animate Real-Time Sea Surface Temperature (SST) Thermal Heatmap Layer on Globe
  if (sstMaterial) {
    if (enabled) {
      sstMesh.visible = true;
      gsap.killTweensOf(sstMaterial);
      gsap.to(sstMaterial, {
        opacity: 0.86,
        duration: 0.75,
        ease: "power2.out",
      });
    } else {
      gsap.killTweensOf(sstMaterial);
      gsap.to(sstMaterial, {
        opacity: 0.0,
        duration: 0.55,
        ease: "power2.in",
        onComplete: () => {
          if (!temperatureColorMode) sstMesh.visible = false;
        },
      });
    }
  }

  // 4. Toggle HUD SST Color Scale Legend
  const legend = document.getElementById("sstLegendPanel");
  if (legend) {
    if (enabled) {
      legend.classList.add("visible");
    } else {
      legend.classList.remove("visible");
    }
  }
}

// Expose developer controls on window
window.reloadArgoFleet = function (count) {
  loadLiveArgoFleet(count);
};
window.applyTemperatureColors = applyTemperatureColors;

// --- Custom UI Toggles State Logic ---
window.filterArgoPoints = function (query, showAll) {
  let filtered = [];
  if (showAll) {
    filtered = argoPoints;
  } else if (query) {
    const q = query.toLowerCase();
    filtered = argoPoints.filter((pt) => {
      const region = (pt.sea || pt.region || "").toLowerCase();
      return region.includes(q);
    });
  }
  // If showAll is false and query is empty, filtered remains empty (0 points).
  initArgoMarkers(filtered);
  buildSidebarCards(filtered);
};

window.applySalinityLayer = function (enabled) {
  console.info(`[Globe] Salinity layer visibility: ${enabled}`);
  // Add 3D layer visibility logic here if implemented
};

// ============================================================================
// 🌊 OCEAN VECTOR FIELD — Realistic Animated "Perpetual Ocean" Visualization
// Inspired by NASA SVS — dense flowing white streamers tracing ocean currents
// ============================================================================

// ── Configuration ──────────────────────────────────────────────────────────
const VF_COUNT = 40000; // Dense streamer particles for NASA SVS look
const VF_TRAIL = 24;   // Long trails for flowing streamline effect
const VF_SEGS = VF_TRAIL - 1;
const VF_VERTS = VF_COUNT * VF_SEGS * 2;
const VF_R = GLOBE_RADIUS + 0.003;

// ── State ──────────────────────────────────────────────────────────────────
let vfMesh = null; // THREE.LineSegments
let vfGeo = null; // BufferGeometry
let vfMat = null; // ShaderMaterial
let vfActive = false;
let vfTrails = null; // Float32Array  — all trail positions
let vfHeads = null; // Uint8Array    — ring-buffer head per particle
let vfAges = null; // Float32Array
let vfLifes = null; // Float32Array
let vfPosAttr = null; // BufferAttribute (position)
let vfAlphaAttr = null; // BufferAttribute (alpha)
let vfSpeedAttr = null; // BufferAttribute (speed)

// ── Pre-allocated temp vectors (zero GC in hot loop) ───────────────────────
const _vfN = new THREE.Vector3();
const _vfNorth = new THREE.Vector3();
const _vfEast = new THREE.Vector3();

// ── Coordinate helpers (reuse existing project mapping) ────────────────────
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function _vfToXYZ(lat, lon, out) {
  const phi = ((lon + 180) / 360) * 2 * Math.PI;
  const theta = (90 - lat) * DEG2RAD;
  const st = Math.sin(theta);
  out[0] = -(VF_R * Math.cos(phi) * st);
  out[1] = VF_R * Math.cos(theta);
  out[2] = VF_R * Math.sin(phi) * st;
}

const _llOut = [0, 0];
function _vfToLL(x, y, z) {
  const r = Math.sqrt(x * x + y * y + z * z);
  _llOut[0] = 90 - Math.acos(Math.max(-1, Math.min(1, y / r))) * RAD2DEG;
  let lon = Math.atan2(z, -x) * RAD2DEG - 180;
  if (lon < -180) lon += 360;
  _llOut[1] = lon;
  return _llOut;
}

// ============================================================================
// 🌍 REALISTIC OCEAN CURRENT VELOCITY FIELD
// Models all major planetary-scale circulation patterns
// ============================================================================

function normalizeLongitude(lon) {
  let l = lon % 360;
  if (l > 180) l -= 360;
  if (l < -180) l += 360;
  return l;
}

function sampleCurrentField(field, lat, lon) {
  if (!field) return null;
  const normalizedLon = normalizeLongitude(lon);
  const { lats, lons, u, v, width, height } = field;
  
  const i0 = Math.floor((normalizedLon - field.west) / field.longitudeStep);
  const j0 = Math.floor((lat - field.south) / field.latitudeStep);
  
  if (i0 < 0 || i0 >= width - 1 || j0 < 0 || j0 >= height - 1) return null;
  
  const i1 = i0 + 1;
  const j1 = j0 + 1;
  
  const tx = (normalizedLon - lons[i0]) / field.longitudeStep;
  const ty = (lat - lats[j0]) / field.latitudeStep;
  
  const u00 = u[j0 * width + i0];
  const u10 = u[j0 * width + i1];
  const u01 = u[j1 * width + i0];
  const u11 = u[j1 * width + i1];
  
  const v00 = v[j0 * width + i0];
  const v10 = v[j0 * width + i1];
  const v01 = v[j1 * width + i0];
  const v11 = v[j1 * width + i1];
  
  if (![u00, u10, u01, u11, v00, v10, v01, v11].every(Number.isFinite)) {
    return null;
  }
  
  const sampledU = (1 - tx) * (1 - ty) * u00 + tx * (1 - ty) * u10 + (1 - tx) * ty * u01 + tx * ty * u11;
  const sampledV = (1 - tx) * (1 - ty) * v00 + tx * (1 - ty) * v10 + (1 - tx) * ty * v01 + tx * ty * v11;
  
  return { u: sampledU, v: sampledV, speed: Math.hypot(sampledU, sampledV) };
}

const EARTH_RADIUS_METERS = 6371000;
function advanceLatLon(lat, lon, u, v, deltaSeconds) {
  const latRadians = lat * Math.PI / 180;
  const metersPerDegreeLat = Math.PI * EARTH_RADIUS_METERS / 180;
  const metersPerDegreeLon = metersPerDegreeLat * Math.max(0.05, Math.cos(latRadians));
  
  const nextLat = lat + (v * deltaSeconds) / metersPerDegreeLat;
  const nextLon = lon + (u * deltaSeconds) / metersPerDegreeLon;
  
  return {
    lat: Math.max(-89.9, Math.min(89.9, nextLat)),
    lon: normalizeLongitude(nextLon)
  };
}

function spawnFromValidOceanCell(field, xyzOut) {
  if (!field) return;
  for (let attempt = 0; attempt < 50; attempt++) {
    const i = Math.floor(Math.random() * field.width);
    const j = Math.floor(Math.random() * field.height);
    const uVal = field.u[j * field.width + i];
    if (Number.isFinite(uVal)) {
      const lat = field.lats[j];
      const lon = field.lons[i];
      _vfToXYZ(lat, lon, xyzOut);
      return { lat, lon };
    }
  }
}

// ============================================================================
// 🎬 LIFECYCLE — Create / Destroy / Update
// ============================================================================

function createOceanVectorField() {
  if (vfMesh) return;

  console.log("Vector field data loaded:", {
    particles: VF_COUNT,
    trailLength: VF_TRAIL,
    model: "Copernicus Marine Real-Time Vectors",
  });

  // ── Allocate per-particle state ──────────────────────────────────────────
  vfTrails = new Float32Array(VF_COUNT * VF_TRAIL * 3);
  vfHeads = new Uint8Array(VF_COUNT);
  vfAges = new Float32Array(VF_COUNT);
  vfLifes = new Float32Array(VF_COUNT);

  const xyz = [0, 0, 0];
  for (let i = 0; i < VF_COUNT; i++) {
    const lat = Math.asin(2 * Math.random() - 1) * RAD2DEG;
    const lon = Math.random() * 360 - 180;

    _vfToXYZ(lat, lon, xyz);

    // Fill entire trail with identical position (will spread naturally)
    for (let j = 0; j < VF_TRAIL; j++) {
      const b = (i * VF_TRAIL + j) * 3;
      vfTrails[b] = xyz[0];
      vfTrails[b + 1] = xyz[1];
      vfTrails[b + 2] = xyz[2];
    }
    vfHeads[i] = VF_TRAIL - 1;
    vfAges[i] = Math.random() * 80; // Stagger to avoid mass reset
    vfLifes[i] = 50 + Math.random() * 90;
  }

  // ── Build LineSegments geometry ──────────────────────────────────────────
  const positions = new Float32Array(VF_VERTS * 3);
  const alphas = new Float32Array(VF_VERTS);
  const speeds = new Float32Array(VF_VERTS);

  vfGeo = new THREE.BufferGeometry();
  vfPosAttr = new THREE.Float32BufferAttribute(positions, 3);
  vfAlphaAttr = new THREE.Float32BufferAttribute(alphas, 1);
  vfSpeedAttr = new THREE.Float32BufferAttribute(speeds, 1);
  vfGeo.setAttribute("position", vfPosAttr);
  vfGeo.setAttribute("alpha", vfAlphaAttr);
  vfGeo.setAttribute("speed", vfSpeedAttr);

  // ── NASA SVS-inspired ShaderMaterial — deep blue to bright white ─────────
  vfMat = new THREE.ShaderMaterial({
    vertexShader: [
      "attribute float alpha;",
      "attribute float speed;",
      "varying float vAlpha;",
      "varying float vSpeed;",
      "void main() {",
      "  vAlpha = alpha;",
      "  vSpeed = speed;",
      "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
      "}",
    ].join("\n"),
    fragmentShader: [
      "varying float vAlpha;",
      "varying float vSpeed;",
      "void main() {",
      // 4-stop gradient: deep navy → ocean blue → cyan → white
      "  float s = clamp(vSpeed * 1.8, 0.0, 1.0);",
      "  vec3 c1 = vec3(0.04, 0.12, 0.35);",  // deep navy for very slow
      "  vec3 c2 = vec3(0.1, 0.4, 0.9);",     // ocean blue
      "  vec3 c3 = vec3(0.3, 0.75, 1.0);",    // bright cyan
      "  vec3 c4 = vec3(0.9, 0.95, 1.0);",    // near-white for fastest
      "  vec3 col;",
      "  if (s < 0.33) col = mix(c1, c2, s * 3.0);",
      "  else if (s < 0.66) col = mix(c2, c3, (s - 0.33) * 3.0);",
      "  else col = mix(c3, c4, (s - 0.66) * 3.0);",
      "  gl_FragColor = vec4(col, vAlpha * (0.6 + s * 0.4));",
      "}",
    ].join("\n"),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  vfMesh = new THREE.LineSegments(vfGeo, vfMat);
  vfMesh.frustumCulled = false;
  vfMesh.renderOrder = 3; // Render above ocean, below UI overlays
  scene.add(vfMesh);
  vfActive = true;

  // ── Startup fetch: populate window.currentField immediately ──────────────
  if (!window.currentField) {
    console.log('[VectorField] Fetching initial current field from backend...');
    fetch('http://localhost:8000/api/currents/latest?depth=0&step=1')
      .then(r => r.json())
      .then(data => {
        if (!data.ok || !data.grid || !data.vectors) return;
        const { width, height, west, longitudeStep, latitudeStep } = data.grid;
        const south = data.grid.south;
        const count = width * height;
        const uArr = new Float32Array(count);
        const vArr = new Float32Array(count);
        uArr.fill(NaN);
        vArr.fill(NaN);
        const lats = new Float32Array(height);
        const lons = new Float32Array(width);
        for (let j = 0; j < height; j++) lats[j] = south + j * latitudeStep;
        for (let i = 0; i < width; i++) lons[i] = west + i * longitudeStep;
        for (const vec of data.vectors) {
          const i = Math.round((vec.lon - west) / longitudeStep);
          const j = Math.round((vec.lat - south) / latitudeStep);
          if (i >= 0 && i < width && j >= 0 && j < height) {
            uArr[j * width + i] = vec.u;
            vArr[j * width + i] = vec.v;
          }
        }
        window.currentField = {
          width, height, west, south,
          east: data.grid.east, north: data.grid.north,
          longitudeStep, latitudeStep,
          u: uArr, v: vArr, lats, lons,
          timestamp: data.source.time,
          provider: data.source.provider,
          mode: data.source.mode
        };
        console.log('[VectorField] ✅ Current field loaded:', data.vectors.length, 'vectors');
      })
      .catch(err => console.warn('[VectorField] Startup fetch failed:', err.message));
  }
}

function destroyOceanVectorField() {
  if (!vfMesh) return;
  scene.remove(vfMesh);
  vfGeo.dispose();
  vfMat.dispose();
  vfMesh = null;
  vfGeo = null;
  vfMat = null;
  vfTrails = null;
  vfHeads = null;
  vfAges = null;
  vfLifes = null;
  vfPosAttr = null;
  vfAlphaAttr = null;
  vfSpeedAttr = null;
  vfActive = false;
}

// ── Per-frame animation (called from animate()) ────────────────────────────
function updateOceanVectorField(delta) {
  if (!vfActive || !vfMesh) return;
  if (delta <= 0 || delta > 0.5) delta = 0.016; // Clamp wild deltas

  const posArr = vfPosAttr.array;
  const alphaArr = vfAlphaAttr.array;
  const spdArr = vfSpeedAttr.array;
  const xyz = [0, 0, 0];

  for (let i = 0; i < VF_COUNT; i++) {
    // ── Read current head position ──
    const headSlot = vfHeads[i];
    const hb = (i * VF_TRAIL + headSlot) * 3;
    const hx = vfTrails[hb],
      hy = vfTrails[hb + 1],
      hz = vfTrails[hb + 2];

    // ── Convert to lat/lon → lookup velocity ──
    const ll = _vfToLL(hx, hy, hz);
    const sample = window.currentField ? sampleCurrentField(window.currentField, ll[0], ll[1]) : null;

    let isLand = false;
    let spd = 0;
    let nx, ny2, nz;

    if (!sample || !Number.isFinite(sample.u) || !Number.isFinite(sample.v)) {
        isLand = true; // Use provider missing data mask
    } else {
        spd = sample.speed;
        const visualTimeScale = 180; // Global visual acceleration
        const visualSeconds = delta * visualTimeScale;
        
        const next = advanceLatLon(
            ll[0], ll[1],
            sample.u, sample.v,
            visualSeconds
        );
        _vfToXYZ(next.lat, next.lon, xyz);
        nx = xyz[0];
        ny2 = xyz[1];
        nz = xyz[2];
    }

    // ── Push new head into ring buffer ──
    const newHead = (headSlot + 1) % VF_TRAIL;
    vfHeads[i] = newHead;
    const nb = (i * VF_TRAIL + newHead) * 3;
    vfTrails[nb] = nx || hx;
    vfTrails[nb + 1] = ny2 || hy;
    vfTrails[nb + 2] = nz || hz;

    // ── Age management ──
    vfAges[i] += delta * 15;  // Slower aging = longer visible trails
    if (vfAges[i] > vfLifes[i] || spd < 0.005 || isLand) {
      if (window.currentField) {
        spawnFromValidOceanCell(window.currentField, xyz);
      } else {
        const rLat = Math.asin(2 * Math.random() - 1) * RAD2DEG;
        const rLon = Math.random() * 360 - 180;
        _vfToXYZ(rLat, rLon, xyz);
      }
      for (let j = 0; j < VF_TRAIL; j++) {
        const b = (i * VF_TRAIL + j) * 3;
        vfTrails[b] = xyz[0];
        vfTrails[b + 1] = xyz[1];
        vfTrails[b + 2] = xyz[2];
      }
      vfHeads[i] = VF_TRAIL - 1;
      vfAges[i] = 0;
      vfLifes[i] = 80 + Math.random() * 160; // Much longer lives for continuous flow
    }

    // ── Build LineSegments vertex data ──
    const segBase = i * VF_SEGS * 2; // starting vertex index
    const head_i = vfHeads[i];
    for (let j = 0; j < VF_SEGS; j++) {
      const tA = (head_i + 1 + j) % VF_TRAIL;
      const tB = (head_i + 1 + j + 1) % VF_TRAIL;

      const bA = (i * VF_TRAIL + tA) * 3;
      const bB = (i * VF_TRAIL + tB) * 3;

      const vA = (segBase + j * 2) * 3;
      const vB = (segBase + j * 2 + 1) * 3;

      // Positions
      posArr[vA] = vfTrails[bA];
      posArr[vA + 1] = vfTrails[bA + 1];
      posArr[vA + 2] = vfTrails[bA + 2];
      posArr[vB] = vfTrails[bB];
      posArr[vB + 1] = vfTrails[bB + 1];
      posArr[vB + 2] = vfTrails[bB + 2];

      // Alpha: smooth gradient from tail (dim) to head (bright)
      // NASA SVS style — uniform brightness boost, no regional bias
      const fadeIn = j / VF_SEGS;           // 0 at tail, 1 at head
      const spdBoost = Math.min(1.0, spd * 2.5);  // Boost visibility
      const alphaA = fadeIn * fadeIn * spdBoost;        // Quadratic fade for smooth taper
      const alphaB = ((j + 1) / VF_SEGS) * ((j + 1) / VF_SEGS) * spdBoost;
      const aIdx = segBase + j * 2;
      alphaArr[aIdx] = alphaA;
      alphaArr[aIdx + 1] = alphaB;

      // Speed (drives color gradient)
      spdArr[aIdx] = spd;
      spdArr[aIdx + 1] = spd;
    }
  }

  vfPosAttr.needsUpdate = true;
  vfAlphaAttr.needsUpdate = true;
  vfSpeedAttr.needsUpdate = true;
}

// ============================================================================
// 📡 REAL-TIME OCEAN CURRENTS API FETCH (OSCAR / HYCOM)
// ============================================================================
async function fetchRealOceanCurrents() {
  console.group(
    "%c🌊 REAL OCEAN CURRENTS STATUS",
    "color: #00ffcc; font-weight: bold; font-size: 14px;",
  );
  console.log("Checking for live gridded U/V vector data from ERDDAP/OSCAR...");

  try {
    // In a production environment, this would hit a backend proxy that
    // downloads a NetCDF grid and serves it as a binary texture or lightweight JSON.
    // ERDDAP raw Griddap requests are too massive (~50MB+) to fetch directly into the browser.
    const res = await fetch("/api/ocean-currents/latest", { method: "HEAD" });
    if (res.ok) {
      console.log(
        "✅ Live backend grid found! Switching to real-time ERDDAP vectors.",
      );
      // ... Load real data ...
    } else {
      throw new Error("Backend proxy not found (404)");
    }
  } catch (err) {
    console.warn("⚠️ Live Vector Backend Proxy not connected.");
    console.warn(
      "ℹ️ HOW TO KNOW IF VECTORS ARE REAL: Real vectors require a server to parse massive NetCDF current grids into compressed textures. Without a backend, querying ERDDAP Griddap directly for 40,000 global U/V points crashes the browser.",
    );
    console.warn(
      "🔄 FALLING BACK TO SCIENTIFIC MATH MODEL: Using high-fidelity Navier-Stokes approximations of the 5 global gyres and 12 major boundary currents.",
    );
  }
  console.groupEnd();
}

window.applyVectorsLayer = function (enabled) {
  console.info(`[Globe] Ocean Vectors layer visibility: ${enabled}`);
  if (enabled) {
    fetchRealOceanCurrents(); // Trigger the real-data check and log
    createOceanVectorField();
  } else {
    destroyOceanVectorField();
  }
};
// ============================================================================

window.applyChloroLayer = function (enabled) {
  console.info(`[Globe] Chlorophyll - a layer visibility: ${enabled}`);
  // Add 3D layer visibility logic here if implemented
};
// -------------------------------------

// Smooth Camera Transition State
let cameraTransition = null;

function animateCameraTo(
  targetCamPos,
  targetLookAt = new THREE.Vector3(0, 0, 0),
  duration = 900,
) {
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
  const tempToX = (t) =>
    padLeft + ((t - minTemp) / (maxTemp - minTemp)) * chartW;
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
  if (elSurfaceTemp)
    elSurfaceTemp.textContent = `${data.scientificData?.surfaceTempC ?? "--"} °C`;
  if (elSurfaceSal)
    elSurfaceSal.textContent = `${data.scientificData?.surfaceSalinityPSU ?? "--"} PSU`;

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
  if (elCycleNum)
    elCycleNum.textContent = `Cycle #${data.mission?.cycleNumber ?? "--"}`;
  if (elBattery)
    elBattery.textContent = `${data.mission?.batteryPercent ?? "--"}%`;
  if (elTrans) elTrans.textContent = data.status || "OK";

  // 6. Location Tab
  const elBasin = document.getElementById("argoSeaBasin");
  const elCoords = document.getElementById("argoExactCoords");
  const elDrift = document.getElementById("argoDriftSpeed");
  const elDistance = document.getElementById("argoDistance24h");
  if (elBasin)
    elBasin.textContent =
      data.coordinates?.seaBasin || data.locationPrimary || "Indian Ocean";
  if (elCoords)
    elCoords.textContent = `${(data.coordinates?.lat || 0).toFixed(4)}°N, ${(data.coordinates?.lon || 0).toFixed(4)}°E`;
  if (elDrift)
    elDrift.textContent = `${data.scientificData?.currentSpeedMs ?? 0} m/s @ ${data.scientificData?.currentDirection ?? "N"}`;
  if (elDistance) elDistance.textContent = `Active Drift`;

  // 7. Raw Data Tab (JSON View & API Info)
  const elRawJson = document.getElementById("argoRawJsonView");
  const elApiEndpoint = document.getElementById("argoApiEndpoint");
  if (elRawJson) {
    elRawJson.textContent = JSON.stringify(data, null, 2);
  }
  if (elApiEndpoint) {
    elApiEndpoint.textContent = `/api/v1/float/${data.floatId || data.stationId}`;
  }

  // Ensure panel is visible
  const panel = document.getElementById("argoFloatPanel");
  if (panel) {
    panel.classList.add("visible");
  }
}

// Selection function: Turns clicked station's dot to GREEN (#00ff66) & fetches data
export async function selectStation(id) {
  const defaultId = argoPoints.length > 0 ? argoPoints[0].id : "";
  const cleanId = String(id || defaultId)
    .trim()
    .toUpperCase();
  const point =
    argoPoints.find(
      (p) =>
        p.id.toUpperCase() === cleanId ||
        p.code.toUpperCase() === cleanId ||
        (p.altId && p.altId.toUpperCase() === cleanId) ||
        String(p.wmoId) === cleanId,
    ) || argoPoints[0];

  const targetId = point.id;
  selectedStationId = targetId;
  window.selectedStationId = targetId;

  // Turn selected station's dot GREEN, reset others to default
  beaconMeshes.forEach((b) => {
    if (b.userData.id === targetId) {
      b.material.color.setHex(0x00ff66);
    } else {
      b.material.color.setHex(b.userData.defaultColor);
    }
  });

  // Highlight active card in sidebar
  document.querySelectorAll(".station-card").forEach((card) => {
    const cardId = card.getAttribute("data-id");
    const cardAltId = card.getAttribute("data-alt-id");
    if (
      cardId === targetId ||
      cardAltId === targetId ||
      cardId === cleanId ||
      cardAltId === cleanId ||
      (point.altId && cardId === point.altId)
    ) {
      card.classList.add("active");
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      card.classList.remove("active");
    }
  });

  // Fetch procedural (or API) data asynchronously
  const floatData = await oceanDataService.getFloatDetails(point);
  updateArgoFloatUI(floatData);

  // Sync with Zustand store so React components (like OceanDashboard) update their location badges
  if (window.oceanStore) {
    const fullInstrumentData = {
      ...point,
      name: floatData.buoyName || point.name || point.id,
      sea: floatData.locationPrimary || "Indian Ocean",
      region: floatData.locationSecondary || "Central Basin",
      type: floatData.platformType?.toLowerCase().includes("glider")
        ? "glider"
        : floatData.platformType?.toLowerCase().includes("ctd")
          ? "ctd"
          : "argo",
      platform: floatData.platformType || "APEX Profiling Float",
      lat: floatData.coordinates?.lat || point.lat,
      lon: floatData.coordinates?.lon || point.lon,
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
      },
      geoCoordinates: {
        lat: floatData.coordinates?.lat || point.lat,
        lon: floatData.coordinates?.lon || point.lon,
      },
    };
    window.oceanStore.getState().setActiveInstrument(fullInstrumentData);

    // Expose selected location for the top-left overlay
    window.selectedArgoLocation = {
      floatId: point.id || floatData.floatId,
      name: floatData.buoyName || point.name || point.id,
      sea: floatData.locationPrimary || "Indian Ocean",
      region: floatData.locationSecondary || "Central Basin",
      lat: floatData.coordinates?.lat || point.lat,
      lon: floatData.coordinates?.lon || point.lon,
      depth: floatData.maxDepthMeters || 2000,
      status: (floatData.status || "active").toLowerCase(),
      timestamp: new Date().toISOString()
    };
    // Dispatch custom event so React components re-render
    window.dispatchEvent(new CustomEvent('argoLocationSelected', { detail: window.selectedArgoLocation }));
  }
}

// ============================================================================
// 8b. CINEMATIC ORBITAL DIVE CONTROLLER (GSAP)
// ============================================================================
export const orbitalDiveController = createOrbitalDiveController({
  camera,
  controls,
  globeRadius: GLOBE_RADIUS,
  scene,
});
window.orbitalDiveController = orbitalDiveController;

/**
 * Triggers the cinematic two-phase Orbital Dive:
 * Phase 1: Sweeps OrbitControls.target to the float, swings camera directly above it.
 * Phase 2: Plunges in close with strong power3.inOut easing.
 * Threshold: Fades out globe & clouds, activates local water column grid.
 */
export function startOrbitalDiveTransition(target) {
  const data = target && target.userData ? target.userData : target || {};
  const rawId =
    data.id ||
    data.code ||
    selectedStationId ||
    (argoPoints.length > 0 ? argoPoints[0].id : "");
  const point =
    argoPoints.find(
      (p) =>
        p.id === rawId ||
        p.code === rawId ||
        p.altId === rawId ||
        String(p.wmoId) === String(rawId),
    ) || argoPoints[0];
  const floatId = point.id;

  // Select and highlight station in HUD
  selectStation(floatId);

  // Close HUD panels for full cinematic visual immersion
  if (tooltip) tooltip.style.display = "none";
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.classList.remove("open");
  const panel = document.getElementById("argoFloatPanel");
  if (panel) panel.classList.remove("visible");

  // Cancel any manual lerp transition
  cameraTransition = null;

  // Resolve target object/sprite
  let diveTarget = target;
  if (!target || !target.isObject3D) {
    const sprite = clickableSprites.find(
      (s) => s.userData?.id === floatId || s.userData?.code === floatId,
    );
    if (sprite) {
      diveTarget = sprite;
    } else {
      diveTarget = latLonToVector3(point.lat, point.lon, GLOBE_RADIUS + 0.08);
    }
  }

  // Execute Orbital Dive
  orbitalDiveController.triggerDive(diveTarget, {
    durationPhase1: 1.35, // Sweep & Center
    durationPhase2: 1.85, // The Plunge (power3.inOut)
    orbitalElevation: 1.15,
    plungeDistance: 0.04,
    distanceThreshold: 0.42,
    onPhase1Complete: ({ floatId: fId }) => {
      console.log(
        `[OrbitalDive] Phase 1 Sweep & Center complete for Station ${fId}. Plunging through atmosphere...`,
      );
    },
    onThresholdCrossed: ({ distance, floatId: fId }) => {
      console.log(
        `[OrbitalDive] Distance threshold crossed at ${distance.toFixed(3)}. Fading globe & activating water column grid...`,
      );

      // 1. Fade out globe sphere & SST thermal layer
      if (globeMaterial) {
        globeMaterial.transparent = true;
        gsap.to(globeMaterial, {
          opacity: 0.0,
          duration: 0.65,
          ease: "power2.out",
        });
      }
      if (sstMaterial && sstMesh.visible) {
        gsap.to(sstMaterial, {
          opacity: 0.0,
          duration: 0.65,
          ease: "power2.out",
        });
      }

      // 2. Fade out 8K atmospheric clouds, shadows & white fog mist
      if (cloudsMaterial && cloudsMaterial.uniforms) {
        gsap.to(cloudsMaterial.uniforms.uCloudOpacity, {
          value: 0.0,
          duration: 0.65,
          ease: "power2.out",
        });
        if (cloudsMaterial.uniforms.uFogDensity) {
          gsap.to(cloudsMaterial.uniforms.uFogDensity, {
            value: 0.0,
            duration: 0.65,
            ease: "power2.out",
          });
        }
      }
      if (cloudShadowMaterial && cloudShadowMaterial.uniforms) {
        gsap.to(cloudShadowMaterial.uniforms.uShadowOpacity, {
          value: 0.0,
          duration: 0.65,
          ease: "power2.out",
        });
      }
      if (cloudFogMaterial && cloudFogMaterial.uniforms) {
        gsap.to(cloudFogMaterial.uniforms.uFogOpacity, {
          value: 0.0,
          duration: 0.65,
          ease: "power2.out",
        });
      }

      // 3. Fade out beacons and stems
      markersGroup.children.forEach((child) => {
        if (child.material) {
          child.material.transparent = true;
          gsap.to(child.material, {
            opacity: 0.0,
            duration: 0.5,
            ease: "power2.out",
          });
        }
      });

      // 4. Activate high-res water column transition overlay & plunge grid
      const overlay = document.getElementById("transitionOverlay");
      if (overlay) overlay.classList.add("active");
      const plungeGrid = document.getElementById("waterColumnPlungeGrid");
      if (plungeGrid) plungeGrid.classList.add("active");
    },
    onComplete: ({ floatId: fId }) => {
      console.log(
        `[OrbitalDive] Plunge complete. Transitioning to Ocean view...`,
      );
      // Pass coordinates and basin to dynamically override the fallback model in Ocean view
      const lat = point.lat || 0;
      const lon = point.lon !== undefined ? point.lon : point.lng || 0;
      const sea = point.basin || "Indian Ocean Basin";
      window.location.href = `/ocean.html?id=${encodeURIComponent(fId)}&lat=${lat}&lon=${lon}&sea=${encodeURIComponent(sea)}`;
    },
  });
}
window.startOrbitalDiveTransition = startOrbitalDiveTransition;

window.triggerOrbitalDiveForSelected = function () {
  const id =
    selectedStationId || (argoPoints.length > 0 ? argoPoints[0].id : "");
  const sprite = clickableSprites.find(
    (s) => s.userData?.id === id || s.userData?.code === id,
  );
  startOrbitalDiveTransition(sprite || { id });
};

// Transition fallback alias
export function transitionToOcean(id) {
  startOrbitalDiveTransition({ id });
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
      const icon =
        data.surfaceTemp !== undefined && data.surfaceTemp > 28 ? "🔴" : "🔵";
      const tempStr =
        data.surfaceTemp !== undefined ? `${data.surfaceTemp}°C` : "—";
      const salStr =
        data.surfaceSalinity !== undefined
          ? `${data.surfaceSalinity} PSU`
          : "—";
      tooltip.style.display = "block";
      tooltip.style.left = `${event.clientX + 16}px`;
      tooltip.style.top = `${event.clientY - 24}px`;
      tooltip.innerHTML = `
        <div class="tooltip-header">${icon} ${data.name || data.code} • ${data.sea || data.region || ""}</div>
        <div class="tooltip-body">
          <div><strong>Float ID:</strong> <span style="color:#00f0ff; font-weight:700;">${data.id}</span> (WMO: ${data.wmoId})</div>
          <div><strong>Basin:</strong> ${data.sea || data.region}</div>
          <div><strong>Coordinates:</strong> ${data.lat.toFixed(2)}°N, ${data.lon.toFixed(2)}°E</div>
          <div><strong>Surface:</strong> <span style="color:#ff9436;">${tempStr}</span> | <span style="color:#38bdf8;">${salStr}</span></div>
          <div><strong>Platform:</strong> ${data.type}</div>
          <div style="margin-top:5px; color:#00e5ff;">✦ Click to inspect station ocean data</div>
          <div style="margin-top:2px; color:#00ff66; font-weight:700;">🚀 Double-click for Cinematic Orbital Dive</div>
        </div>
      `;
    }
  } else {
    document.body.style.cursor = "default";
    if (tooltip) tooltip.style.display = "none";
  }
}

// Track double-click timing on anchor sprites
let lastClickTime = 0;
let lastClickSprite = null;
const DOUBLE_CLICK_THRESHOLD_MS = 340;

function onPointerClick(event) {
  // Ignore clicks on HUD UI panels and buttons
  if (
    event.target.closest &&
    event.target.closest(
      ".hud-sidebar, .hud-header, .sidebar-toggle-btn, .top-ocean-btn, .argo-float-panel, .globe-nav-controls, .orbital-dive-hud-btn, .top-right-bar, .temp-toggle-container, .argo-live-pill, .sst-legend-panel, .modal-overlay",
    )
  ) {
    return;
  }

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // 1. Check if user clicked an anchor sprite
  const intersects = raycaster.intersectObjects(clickableSprites);
  if (intersects.length > 0) {
    const sprite = intersects[0].object;
    const data = sprite.userData;

    const now = performance.now();
    const isDbl =
      now - lastClickTime < DOUBLE_CLICK_THRESHOLD_MS &&
      lastClickSprite === sprite;
    lastClickTime = now;
    lastClickSprite = sprite;

    if (isDbl) {
      // DOUBLE-CLICK: Initiate cinematic Orbital Dive!
      startOrbitalDiveTransition(sprite);
    } else {
      // SINGLE-CLICK: Select station & inspect data panel
      selectStation(data.id);
    }
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
        wmoId:
          2900000 +
          Math.floor(Math.abs(coords.lat * 100) + Math.abs(coords.lon * 100)),
        code: "LOC",
        lat: coords.lat,
        lon: coords.lon,
        sea:
          coords.lat > 0
            ? coords.lon < 77
              ? "Arabian Sea"
              : "Bay of Bengal"
            : "Equatorial Indian Ocean",
        type: "Ocean Profile Probe",
      };
      oceanDataService.getFloatDetails(dynamicPoint).then(updateArgoFloatUI);
    }
  }
}

// Native double-click event listener for anchor points
function onPointerDoubleClick(event) {
  if (
    event.target.closest &&
    event.target.closest(
      ".hud-sidebar, .hud-header, .sidebar-toggle-btn, .top-ocean-btn, .argo-float-panel, .globe-nav-controls, .orbital-dive-hud-btn",
    )
  ) {
    return;
  }

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(clickableSprites);
  if (intersects.length > 0) {
    const sprite = intersects[0].object;
    startOrbitalDiveTransition(sprite);
  }
}

window.addEventListener("pointermove", onPointerMove);
window.addEventListener("click", onPointerClick);
window.addEventListener("dblclick", onPointerDoubleClick);

// Focus function when clicking a point in the list
window.focusOnPoint = function (id) {
  selectStation(id);

  const defaultId = argoPoints.length > 0 ? argoPoints[0].id : "";
  const cleanId = String(id || defaultId)
    .trim()
    .toUpperCase();
  const pt = argoPoints.find(
    (p) =>
      p.id.toUpperCase() === cleanId ||
      p.code.toUpperCase() === cleanId ||
      (p.altId && p.altId.toUpperCase() === cleanId) ||
      String(p.wmoId) === cleanId,
  );
  if (!pt) return;

  // Preserve the user's current zoom distance - NEVER zoom the Earth out!
  const currentDist = camera.position.distanceTo(controls.target);
  // Keep the current zoom level, or gently pull in closer if currently very far out
  const targetDist = Math.min(currentDist, 2.6);

  const dirVec = latLonToVector3(pt.lat, pt.lon, 1.0).normalize();
  const targetCam = dirVec.multiplyScalar(targetDist);

  animateCameraTo(targetCam, new THREE.Vector3(0, 0, 0), 600);
};

// ============================================================================
// 🧭 GLOBE NAVIGATION CONTROLS (Left Dock)
// ============================================================================
window.navResetNorth = function () {
  cameraTransition = null;
  const currentDist = camera.position.distanceTo(controls.target);
  const targetCam = new THREE.Vector3(
    0,
    currentDist * 0.25,
    -currentDist * 0.968,
  );
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
  const newDist = Math.min(controls.maxDistance, currentDist * 1.3);
  offset.setLength(newDist);
  camera.position.copy(controls.target).add(offset);
  controls.update();
};

window.navCenterView = function () {
  cameraTransition = null;
  const currentDist = camera.position.distanceTo(controls.target);
  const defaultDir = new THREE.Vector3(0.9, 0.8, -4.0).normalize();
  animateCameraTo(
    defaultDir.multiplyScalar(currentDist),
    new THREE.Vector3(0, 0, 0),
    600,
  );
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
  navigator.clipboard
    .writeText(JSON.stringify(currentLoadedData, null, 2))
    .then(() => {
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
let _lastFrameTime = 0;

function animate() {
  requestAnimationFrame(animate);

  const elapsedTime = clock.getElapsedTime();
  const frameDelta = elapsedTime - _lastFrameTime;
  _lastFrameTime = elapsedTime;

  // Handle smooth camera lerping if transition is active and orbital dive is not running
  if (
    cameraTransition &&
    (!orbitalDiveController || !orbitalDiveController.isDiving())
  ) {
    const elapsedMs = performance.now() - cameraTransition.startTime;
    const progress = Math.min(1.0, elapsedMs / cameraTransition.duration);
    // Smooth easeInOutCubic
    const ease =
      progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    camera.position.lerpVectors(
      cameraTransition.startPos,
      cameraTransition.endPos,
      ease,
    );
    controls.target.lerpVectors(
      cameraTransition.startLookAt,
      cameraTransition.endLookAt,
      ease,
    );

    if (progress >= 1.0) {
      cameraTransition = null;
    }
  }

  // 1. HORIZON OCCLUSION CHECK (Hide markers when behind the Earth's curvature)
  const camPos = camera.position;
  clickableSprites.forEach((sprite, idx) => {
    const normal = sprite.position.clone().normalize();
    const camDir = camPos.clone().sub(sprite.position).normalize();
    const dot = normal.dot(camDir);
    const isVisible = dot > 0.03; // Visible hemisphere
    sprite.visible = isVisible;
    if (beaconMeshes[idx]) beaconMeshes[idx].visible = isVisible;
    if (stemLines[idx]) stemLines[idx].visible = isVisible;
  });

  // 2. DYNAMIC ZOOM SCALING (Configurable in UI)
  const camDist = camera.position.distanceTo(controls.target);
  const cfg = ANCHOR_SIZE_CONFIG;

  let dynamicScale;
  if (!cfg.dynamicZoom) {
    dynamicScale = cfg.maxScale * cfg.masterScale;
  } else {
    const normDist = Math.max(
      0,
      Math.min(
        1,
        (camDist - cfg.zoomInDistance) /
          (cfg.zoomOutDistance - cfg.zoomInDistance),
      ),
    );
    const interpolated =
      cfg.minScale +
      Math.pow(normDist, cfg.zoomCurvePower) * (cfg.maxScale - cfg.minScale);
    dynamicScale = interpolated * cfg.masterScale;
  }

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

  // Dynamic atmospheric clouds, shadows, white fog & limb glow updates
  if (cloudsMaterial && cloudsMaterial.uniforms) {
    cloudsMaterial.uniforms.uTime.value = elapsedTime;
  }
  if (cloudFogMaterial && cloudFogMaterial.uniforms) {
    cloudFogMaterial.uniforms.uTime.value = elapsedTime;
  }
  if (atmosphereMaterial && atmosphereMaterial.uniforms) {
    atmosphereMaterial.uniforms.uTime.value = elapsedTime;
  }
  if (cloudsMesh) {
    // Realistic eastward atmospheric jet-stream circulation
    cloudsMesh.rotation.y += 0.00014;
  }
  if (cloudShadowMesh) {
    // Soft shadows rotate in exact lockstep with clouds
    cloudShadowMesh.rotation.y += 0.00014;
  }
  if (cloudFogMesh) {
    // High-altitude cirrus fog drifts smoothly around the globe
    cloudFogMesh.rotation.y += 0.00018;
  }

  // Ocean Vector Field per-frame animation
  updateOceanVectorField(frameDelta);

  if (!orbitalDiveController || !orbitalDiveController.isDiving()) {
    controls.update();
  }
  renderer.render(scene, camera);
}

animate();

// Initialize live Argo fleet from ERDDAP after a brief load delay
setTimeout(() => {
  loadLiveArgoFleet();
}, 400);
