import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ============================================================================
// 1. SCENE & CAMERA SETUP (Framed for 60% Sky & Sun / 40% Ocean)
// ============================================================================
const scene = new THREE.Scene();

// Camera setup
const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
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
document.body.appendChild(renderer.domElement);

// Orbit Controls (restricted so user can enjoy the scenic 60/40 view)
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
// Sky gradient background using procedural hemispherical dome
const vertexSkyShader = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentSkyShader = `
  varying vec3 vWorldPosition;
  uniform vec3 uTopColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uSunPosition;
  uniform vec3 uSunColor;

  void main() {
    vec3 dir = normalize(vWorldPosition);
    float h = max(dir.y, 0.0);

    // Sky gradient from warm golden horizon to soft cyan-blue zenith
    vec3 sky = mix(uHorizonColor, uTopColor, pow(h, 0.6));

    // Sun atmospheric glow
    vec3 sunDir = normalize(uSunPosition);
    float sunDot = max(dot(dir, sunDir), 0.0);
    float sunGlow = pow(sunDot, 8.0) * 0.55 + pow(sunDot, 64.0) * 0.9;
    sky += uSunColor * sunGlow;

    gl_FragColor = vec4(sky, 1.0);
  }
`;

const skyGeo = new THREE.SphereGeometry(600, 32, 32);
const skyMat = new THREE.ShaderMaterial({
  vertexShader: vertexSkyShader,
  fragmentShader: fragmentSkyShader,
  uniforms: {
    uTopColor: { value: new THREE.Color(0x2a75b3) },       // Soft sky blue
    uHorizonColor: { value: new THREE.Color(0xffe6a3) },   // Warm white-yellow horizon
    uSunPosition: { value: new THREE.Vector3(0, 32, -180) },
    uSunColor: { value: new THREE.Color(0xffea78) }        // Yellow sun glow
  },
  side: THREE.BackSide
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

// Vibrant Yellow 3D Sun
const sunGroup = new THREE.Group();
const sunPosition = new THREE.Vector3(0, 32, -180);
sunGroup.position.copy(sunPosition);

// Core Sun Sphere
const sunGeo = new THREE.SphereGeometry(12, 32, 32);
const sunMat = new THREE.MeshBasicMaterial({
  color: 0xffe042, // Vibrant golden yellow
  fog: false
});
const sunMesh = new THREE.Mesh(sunGeo, sunMat);
sunGroup.add(sunMesh);

// Soft Outer Sun Halo / Corona
const sunGlowMat = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    void main() {
      float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
      gl_FragColor = vec4(1.0, 0.9, 0.4, intensity * 0.7);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide
});
const sunGlowMesh = new THREE.Mesh(new THREE.SphereGeometry(17, 32, 32), sunGlowMat);
sunGroup.add(sunGlowMesh);
scene.add(sunGroup);

// Sun Directional Light & Warm Ambient Light
const sunLight = new THREE.DirectionalLight(0xfff0a8, 2.5);
sunLight.position.copy(sunPosition);
scene.add(sunLight);

const ambientLight = new THREE.AmbientLight(0xfff4d6, 0.9);
scene.add(ambientLight);

// ============================================================================
// 3. LIGHTISH WHITE-YELLOW CLOUDS
// ============================================================================
// Clouds with soft warm white-yellow lighting
const cloudsGroup = new THREE.Group();
scene.add(cloudsGroup);

function createFluffyCloud(x, y, z, scale) {
  const cloud = new THREE.Group();
  const puffMat = new THREE.MeshStandardMaterial({
    color: 0xfffae6,       // Lightish warm white-yellow
    roughness: 0.8,
    metalness: 0.05,
    transparent: true,
    opacity: 0.88,
    flatShading: true
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
      (Math.random() - 0.5) * 4 * scale
    );
    puff.scale.set(1 + Math.random() * 0.3, 0.8 + Math.random() * 0.4, 1 + Math.random() * 0.3);
    cloud.add(puff);
  }

  cloud.position.set(x, y, z);
  cloud.userData = { speed: 0.02 + Math.random() * 0.025, initialX: x };
  cloudsGroup.add(cloud);
}

// Generate scattered cloud banks in the upper 60% sky
const cloudConfigs = [
  { x: -50, y: 28, z: -140, scale: 1.8 },
  { x: 35, y: 34, z: -130, scale: 1.5 },
  { x: -80, y: 22, z: -110, scale: 2.0 },
  { x: 75, y: 26, z: -120, scale: 2.2 },
  { x: -15, y: 38, z: -160, scale: 1.4 },
  { x: 95, y: 30, z: -150, scale: 1.9 },
  { x: -120, y: 25, z: -130, scale: 2.4 },
  { x: 0, y: 44, z: -120, scale: 1.6 },
  { x: -40, y: 18, z: -90, scale: 1.3 },
  { x: 50, y: 20, z: -95, scale: 1.4 }
];

cloudConfigs.forEach(c => createFluffyCloud(c.x, c.y, c.z, c.scale));

// ============================================================================
// 4. CUSTOM WATER SHADERS (GLSL Ocean Waves with Specular Sun Glint)
// ============================================================================
const waterVertexShader = `
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

const waterFragmentShader = `
  uniform vec3 uDepthColor;
  uniform vec3 uSurfaceColor;
  uniform vec3 uFoamColor;
  uniform float uColorOffset;
  uniform float uColorMultiplier;
  uniform vec3 uSunPosition;
  uniform vec3 uSunColor;
  uniform vec3 uSkyHorizonColor;

  varying float vElevation;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 normal = normalize(vNormal);

    // Smooth lighting when viewed from underwater looking up
    if (cameraPosition.y < vWorldPosition.y) {
      normal = -normal;
    }

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

    gl_FragColor = vec4(finalColor, 0.92);
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
    // Wave dynamics
    uBigWavesElevation: { value: 0.38 },
    uBigWavesFrequency: { value: new THREE.Vector2(0.28, 0.18) },
    uBigWavesSpeed: { value: 1.1 },
    uSmallWavesElevation: { value: 0.14 },
    uSmallWavesFrequency: { value: 1.6 },
    uSmallWavesSpeed: { value: 0.35 },
    // Color parameters
    uDepthColor: { value: new THREE.Color(0x0a2b5e) },       // Deep ocean navy
    uSurfaceColor: { value: new THREE.Color(0x1992b8) },     // Surface turquoise blue
    uFoamColor: { value: new THREE.Color(0xf6ffff) },        // White foam crests
    uColorOffset: { value: 0.15 },
    uColorMultiplier: { value: 2.2 },
    // Sun & Reflection
    uSunPosition: { value: sunPosition.clone() },
    uSunColor: { value: new THREE.Color(0xffe875) },         // Golden yellow sun reflection
    uSkyHorizonColor: { value: new THREE.Color(0xffe6a3) }   // Warm horizon
  },
  side: THREE.DoubleSide,
  transparent: true,
  wireframe: false
});

const water = new THREE.Mesh(waterGeometry, waterMaterial);
water.position.y = 0;
scene.add(water);

// ============================================================================
// 5. PROCEDURAL RISING OCEAN BUBBLES
// ============================================================================
const BUBBLE_COUNT = 450;
const bubbleGeo = new THREE.SphereGeometry(1, 14, 14);
const bubbleMat = new THREE.MeshPhysicalMaterial({
  color: 0xdbf7ff,
  transmission: 0.88,
  opacity: 0.8,
  transparent: true,
  roughness: 0.08,
  ior: 1.12,
  metalness: 0.05
});

const bubblesMesh = new THREE.InstancedMesh(bubbleGeo, bubbleMat, BUBBLE_COUNT);
bubblesMesh.visible = false;
scene.add(bubblesMesh);

const dummy = new THREE.Object3D();
const bubbleData = [];

for (let i = 0; i < BUBBLE_COUNT; i++) {
  const x = (Math.random() - 0.5) * 45;
  const y = -Math.random() * 22;
  const z = (Math.random() - 0.5) * 45;
  const scale = 0.06 + Math.random() * 0.22;
  const speed = 0.035 + Math.random() * 0.07;
  const phase = Math.random() * Math.PI * 2;

  bubbleData.push({ x, y, z, scale, speed, phase });

  dummy.position.set(x, y, z);
  dummy.scale.set(scale, scale, scale);
  dummy.updateMatrix();
  bubblesMesh.setMatrixAt(i, dummy.matrix);
}
bubblesMesh.instanceMatrix.needsUpdate = true;

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
  z: 1.5,        // <--- [CHANGE POSITION HERE] Moved back to 1.5 (was 7.5). Set to 0.0 or -2.0 to move further back!
  scale: 1.0     // Overall scale of the float model
};
window.ARGO_FLOAT_CONFIG = ARGO_FLOAT_CONFIG;

// Dive tracking variables for scroller synchronization
let argoDiveY = 0.0;
let argoDiveRatio = 0.0;

function createArgoFloatModel() {
  const floatGroup = new THREE.Group();

  // Materials matching the real APEX Argo float
  const yellowHullMat = new THREE.MeshStandardMaterial({
    color: 0xf6c500,        // Vibrant marine safety yellow
    roughness: 0.28,
    metalness: 0.12
  });

  const yellowBaseMat = new THREE.MeshStandardMaterial({
    color: 0xefbd00,
    roughness: 0.35,
    metalness: 0.1
  });

  const blackHardwareMat = new THREE.MeshStandardMaterial({
    color: 0x18191c,        // Dark anodized aluminum / graphite
    roughness: 0.45,
    metalness: 0.4
  });

  const whiteCollarMat = new THREE.MeshStandardMaterial({
    color: 0xf8f9fa,        // Damping collar white
    roughness: 0.22,
    metalness: 0.05
  });

  const antennaMat = new THREE.MeshStandardMaterial({
    color: 0x121214,        // High-frequency satellite antenna
    roughness: 0.3,
    metalness: 0.75
  });

  const sensorMetalMat = new THREE.MeshStandardMaterial({
    color: 0xdde3ea,        // Conductivity sensor probe chrome/metal
    roughness: 0.15,
    metalness: 0.9
  });

  const HULL_RADIUS = 0.24;

  // 1. Bottom Flared Base (External Hydraulic Oil Bladder Housing)
  const baseFlangeGeo = new THREE.CylinderGeometry(0.32, 0.38, 0.30, 32);
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
  const lowerHullGeo = new THREE.CylinderGeometry(HULL_RADIUS, HULL_RADIUS, 1.95, 32);
  const lowerHull = new THREE.Mesh(lowerHullGeo, yellowHullMat);
  lowerHull.position.y = -0.92;
  floatGroup.add(lowerHull);

  // Hull joint seam band
  const seamBandGeo = new THREE.CylinderGeometry(HULL_RADIUS + 0.005, HULL_RADIUS + 0.005, 0.03, 32);
  const seamBand = new THREE.Mesh(seamBandGeo, blackHardwareMat);
  seamBand.position.y = -0.95;
  floatGroup.add(seamBand);

  // 3. White Damping Flange Disk / Collar (Stabilizing Ring)
  // Sits right around the waterline to minimize wave rocking
  const collarDiskGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.038, 48);
  const collarDisk = new THREE.Mesh(collarDiskGeo, whiteCollarMat);
  collarDisk.position.y = 0.14;
  floatGroup.add(collarDisk);

  const collarSupportGeo = new THREE.CylinderGeometry(HULL_RADIUS + 0.025, HULL_RADIUS + 0.025, 0.08, 32);
  const collarSupport = new THREE.Mesh(collarSupportGeo, whiteCollarMat);
  collarSupport.position.y = 0.11;
  floatGroup.add(collarSupport);

  // 4. Upper Yellow Pressure Hull Section
  const upperHullGeo = new THREE.CylinderGeometry(HULL_RADIUS, HULL_RADIUS, 1.05, 32);
  const upperHull = new THREE.Mesh(upperHullGeo, yellowHullMat);
  upperHull.position.y = 0.68;
  floatGroup.add(upperHull);

  // Upper joint seam band
  const upperSeamGeo = new THREE.CylinderGeometry(HULL_RADIUS + 0.005, HULL_RADIUS + 0.005, 0.025, 32);
  const upperSeam = new THREE.Mesh(upperSeamGeo, blackHardwareMat);
  upperSeam.position.y = 1.18;
  floatGroup.add(upperSeam);

  // 5. Dark Graphite Domed Shoulder Cap
  const shoulderGeo = new THREE.CylinderGeometry(0.19, HULL_RADIUS + 0.005, 0.22, 32);
  const shoulder = new THREE.Mesh(shoulderGeo, blackHardwareMat);
  shoulder.position.y = 1.30;
  floatGroup.add(shoulder);

  const domeCapGeo = new THREE.SphereGeometry(0.19, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
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
    rib.position.set(0.045 + Math.cos(angle) * 0.075, 1.74, Math.sin(angle) * 0.075);
    floatGroup.add(rib);
  }

  // CTD temperature/conductivity intake tube (chrome/white probe)
  const sensorTubeGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.52, 12);
  const sensorTube = new THREE.Mesh(sensorTubeGeo, sensorMetalMat);
  sensorTube.position.set(-0.045, 1.72, 0.03);
  floatGroup.add(sensorTube);

  const sensorTubeCap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 12), whiteCollarMat);
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
  floatGroup.position.set(ARGO_FLOAT_CONFIG.x, ARGO_FLOAT_CONFIG.y, ARGO_FLOAT_CONFIG.z);
  floatGroup.scale.setScalar(ARGO_FLOAT_CONFIG.scale);
  return floatGroup;
}

const argoFloat = createArgoFloatModel();
scene.add(argoFloat);

// Submersible exploration light that illuminates the Argo float in deep water
const argoDiveLight = new THREE.PointLight(0x70d6ff, 0.0, 25);
scene.add(argoDiveLight);

// ============================================================================
// 7. RESPONSIVE RESIZE HANDLING
// ============================================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// ============================================================================
// 7. INTERACTIVE DEPTH PROFILING & EXTREME UNDERWATER DIVING
// ============================================================================
window.setOceanDepth = function(ratio) {
  // ratio: 0.0 (0m, Top level) -> 1.0 (4000m, Extreme Hadal Abyss)
  const depthMeters = Math.round(ratio * 4000);

  // 1. STRAIGHT VERTICAL DIVE:
  // Deep camera travel: plunges straight down from y = 3.2 to y = -90.0
  const startCamY = 3.2;
  const maxUnderwaterDepth = 95.0; 
  const targetCamY = startCamY - ratio * maxUnderwaterDepth;
  camera.position.y = targetCamY;

  // Keep orbit control target centered around the diving Argo float
  controls.target.y = targetCamY - 1.2;
  controls.target.x = ARGO_FLOAT_CONFIG.x;
  controls.target.z = ARGO_FLOAT_CONFIG.z;

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
    cloudsGroup.children.forEach(cloud => {
      cloud.children.forEach(puff => {
        puff.material.opacity = Math.max(0, 0.88 - ratio * 20.0);
      });
    });
  }

  // Sun disc and glow fade out completely as you descend into deep water
  const sunFade = Math.max(0.0, 1.0 - ratio * 4.0); // Completely disappears by ~1000m
  sunMesh.material.opacity = sunFade;
  sunGlowMesh.material.opacity = sunFade * 0.7;
  sunGroup.visible = (sunFade > 0.01);

  // Surface water plane fades out when looking from extreme depths
  const surfaceFade = Math.max(0.0, 1.0 - ratio * 3.5);
  waterMaterial.opacity = surfaceFade;
  water.visible = (surfaceFade > 0.01);

  // Sun ascends as camera plunges down
  const newSunY = 32.0 + ratio * 250.0;
  sunGroup.position.y = newSunY;
  sunLight.position.y = newSunY;
  waterMaterial.uniforms.uSunPosition.value.y = newSunY;
  skyMat.uniforms.uSunPosition.value.y = newSunY;

  // 3. PROGRESSIVE DARKER BLUISH OCEANIC LIGHTING (0m -> 4000m):
  // Dims lighting dynamically into deep oceanic dark blue
  const lightFactor = Math.max(0.005, Math.pow(1.0 - Math.min(1.0, ratio * 1.5), 2.5));
  sunLight.intensity = 2.5 * lightFactor;
  ambientLight.intensity = Math.max(0.14, 0.9 * Math.pow(1.0 - ratio, 2.0));

  // Darker bluish oceanic palette
  // Surface: soft sky blue / golden
  // 500m: deep oceanic royal navy (#001845)
  // 1500m: dark midnight blue (#000b21)
  // 3000m - 4000m: pitch-dark abyss blue (#00040f)
  const surfaceSkyTop = new THREE.Color(0x2a75b3);
  const darkAbyssBlue = new THREE.Color(0x00040f);
  skyMat.uniforms.uTopColor.value.lerpColors(surfaceSkyTop, darkAbyssBlue, Math.min(1.0, ratio * 1.6));

  const surfaceHorizon = new THREE.Color(0xffe6a3);
  const deepMidnightBlue = new THREE.Color(0x00081c);
  skyMat.uniforms.uHorizonColor.value.lerpColors(surfaceHorizon, deepMidnightBlue, Math.min(1.0, ratio * 1.8));

  // 4. WATER SHADER COLOR & SPECULAR DARKENING:
  const surfaceWater = new THREE.Color(0x1992b8);
  const deepOceanBlue = new THREE.Color(0x000922);
  waterMaterial.uniforms.uSurfaceColor.value.lerpColors(surfaceWater, deepOceanBlue, Math.min(1.0, ratio * 2.0));

  const surfaceDepthColor = new THREE.Color(0x0a2b5e);
  const ultraDarkBlue = new THREE.Color(0x00030a);
  waterMaterial.uniforms.uDepthColor.value.lerpColors(surfaceDepthColor, ultraDarkBlue, Math.min(1.0, ratio * 2.0));

  // 5. APEX ARGO FLOAT DIVE SYNCHRONIZATION:
  // The Argo float plunges down into the ocean synchronously with the scroller
  argoDiveRatio = ratio;
  argoDiveY = - ratio * maxUnderwaterDepth;
  argoFloat.visible = true;

  // Submersible inspection light that illuminates the Argo float in deep water
  argoDiveLight.position.set(ARGO_FLOAT_CONFIG.x, targetCamY + 2.0, ARGO_FLOAT_CONFIG.z + 4.0);
  argoDiveLight.intensity = ratio > 0.015 ? Math.min(2.6, 0.4 + ratio * 2.4) : 0.0;

  // 6. PROCEDURAL RISING BUBBLES:
  // Visible during diving, glowing softly in the dark blue water
  bubblesMesh.visible = (ratio > 0.015);
  // Bubble color shifts to bioluminescent cyan-blue in deep darkness
  const bubbleBright = new THREE.Color(0xdbf7ff);
  const bubbleDeep = new THREE.Color(0x1ee3cf);
  bubbleMat.color.lerpColors(bubbleBright, bubbleDeep, ratio);
  bubbleMat.opacity = Math.max(0.2, 0.75 - ratio * 0.35);
};

// ============================================================================
// 8. ANIMATION LOOP
// ============================================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const elapsedTime = clock.getElapsedTime();

  // 1. Update Water Shader Time Uniform
  waterMaterial.uniforms.uTime.value = elapsedTime;

  // 2. Realistic Floating, Diving & Bobbing Effect for APEX Argo Float
  if (argoFloat.visible) {
    const fx = argoFloat.position.x;
    const fz = argoFloat.position.z;
    // Calculate water wave height at float's position
    const waveElev = Math.sin(fx * 0.28 + elapsedTime * 1.1) * Math.cos(fz * 0.18 + elapsedTime * 1.1) * 0.38;

    // Smooth transition from surface wave bobbing to underwater smooth descent
    // At surface (ratio=0), waveInfluence is 1.0. Underwater (ratio > 0.04), it fades to 0.0
    const surfaceInfluence = Math.max(0.0, 1.0 - argoDiveRatio * 20.0);

    // Surface wave bobbing vs underwater gentle hydrodynamic motion
    const surfaceBobbing = (waveElev - 0.08 + Math.sin(elapsedTime * 2.2) * 0.04) * surfaceInfluence;
    const underwaterMotion = (Math.sin(elapsedTime * 1.2) * 0.05) * (1.0 - surfaceInfluence);

    // Dynamic vertical position: base Y + scroller dive Y + waves/underwater current
    argoFloat.position.y = ARGO_FLOAT_CONFIG.y + argoDiveY + surfaceBobbing + underwaterMotion;

    // Organic wave tilting at surface, stabilized underwater descent orientation
    argoFloat.rotation.z = Math.sin(elapsedTime * 1.4) * (0.065 * surfaceInfluence + 0.015 * (1.0 - surfaceInfluence));
    argoFloat.rotation.x = Math.cos(elapsedTime * 1.6) * (0.05 * surfaceInfluence + 0.012 * (1.0 - surfaceInfluence));
    argoFloat.rotation.y = elapsedTime * 0.035; // Gentle slow yaw drift
  }

  // 3. Animate Slow Cloud Drift across sky
  cloudsGroup.children.forEach(cloud => {
    cloud.position.x += cloud.userData.speed;
    if (cloud.position.x > 150) {
      cloud.position.x = -150;
    }
  });

  // 4. Subtle Sun Glow pulsation
  sunGlowMesh.scale.setScalar(1.0 + 0.04 * Math.sin(elapsedTime * 1.5));

  // 5. Animate Rising Bubbles (when diving underwater)
  if (bubblesMesh.visible) {
    const camY = camera.position.y;
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      const b = bubbleData[i];
      b.y += b.speed;
      b.x += Math.sin(elapsedTime * 2.5 + b.phase) * 0.015;
      b.z += Math.cos(elapsedTime * 2.0 + b.phase) * 0.015;

      // When bubble reaches the water surface, reset beneath camera
      if (b.y >= -0.1) {
        b.y = Math.min(-1.0, camY - 8.0 - Math.random() * 12.0);
        b.x = camera.position.x + (Math.random() - 0.5) * 35;
        b.z = camera.position.z + (Math.random() - 0.5) * 35;
      }

      dummy.position.set(b.x, b.y, b.z);
      dummy.scale.set(b.scale, b.scale, b.scale);
      dummy.updateMatrix();
      bubblesMesh.setMatrixAt(i, dummy.matrix);
    }
    bubblesMesh.instanceMatrix.needsUpdate = true;
  }

  // 6. Update camera controls
  controls.update();

  renderer.render(scene, camera);
}

animate();

