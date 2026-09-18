import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  SOLAR_PRESETS,
  ARGO_FLOAT_CONFIG,
  vertexSkyShader,
  fragmentSkyShader,
  waterVertexShader,
  waterFragmentShader,
  sunGlowVertexShader,
  sunGlowFragmentShader,
  createFluffyCloud,
  cloudConfigs,
  createArgoFloatModel,
} from './Ocean.jsx';

/**
 * oceanPanelScene.js — Independent Ocean.jsx environment instances.
 * ============================================================================
 * Each comparison panel mounts its OWN full Ocean environment built from the
 * exact same Ocean.jsx pieces as the main page:
 *   - Sky dome shader + sun + corona + lights (same shaders, preset colors)
 *   - Fluffy cumulus clouds (same createFluffyCloud factory)
 *   - Water surface (same water vertex/fragment shaders, lighter 128² mesh
 *     so N panels stay GPU-friendly)
 *   - The real APEX Argo model (same createArgoFloatModel + ARGO_FLOAT_CONFIG)
 *
 * No globals are shared between instances: every mount creates its own
 * renderer, scene, camera, controls, clock and rAF loop, and `dispose()`
 * tears everything down when the panel unmounts (no WebGL leaks).
 *
 * Usage:
 *   const handle = mountOceanPanel(containerEl, { preset, depth });
 *   handle.setDepth(1500);        // smooth dive to 1500 m (lerped)
 *   handle.setPreset(otherPreset); // swap solar time
 *   handle.dispose();              // on unmount
 */

const MAX_PANEL_DEPTH_M = 4000;
const PANEL_DIVE_RANGE = 95.0; // world units, mirrors main Ocean.js baseDepth

function disposeObject(root) {
  root.traverse((obj) => {
    try {
      if (obj.geometry) obj.geometry.dispose();
      const mats = Array.isArray(obj.material)
        ? obj.material
        : obj.material
          ? [obj.material]
          : [];
      mats.forEach((m) => {
        try {
          Object.values(m).forEach((v) => {
            if (v && v.isTexture) { try { v.dispose(); } catch (_e) { /* ignore */ } }
          });
        } catch (_e) { /* ignore */ }
        try { m.dispose(); } catch (_e) { /* ignore */ }
      });
    } catch (_e) { /* ignore */ }
  });
}

export function mountOceanPanel(container, options = {}) {
  if (!container) throw new Error('mountOceanPanel: container is required');
  let preset = options.preset || SOLAR_PRESETS[0];

  const width = container.clientWidth || 320;
  const height = container.clientHeight || 300;

  // ── Renderer (private WebGL context per panel) ──────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  // ── Scene / Camera / Controls ───────────────────────────────────────────
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
  camera.position.set(0, 3.2, 14);
  camera.lookAt(0, 2.0, 1.5);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 2.0, 1.5);
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.minDistance = 5;
  controls.maxDistance = 35;

  // ── Sky dome (same shader as Ocean.js) ──────────────────────────────────
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: vertexSkyShader,
    fragmentShader: fragmentSkyShader,
    uniforms: {
      uTopColor: { value: preset.topColor.clone() },
      uHorizonColor: { value: preset.horizonColor.clone() },
      uBottomColor: { value: new THREE.Color(0x0a2f54) },
      uSunPosition: { value: preset.sunPos.clone() },
      uSunColor: { value: preset.sunColor.clone() },
      uUnderwaterRatio: { value: 0.0 },
      uCameraDepth: { value: 0.0 },
    },
    side: THREE.BackSide,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 32), skyMat);
  scene.add(sky);

  // ── Sun + corona (same model as Ocean.js) ───────────────────────────────
  const sunGroup = new THREE.Group();
  sunGroup.position.copy(preset.sunPos);
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(12, 32, 32),
    new THREE.MeshBasicMaterial({ color: preset.sunColor.clone(), fog: false, transparent: true }),
  );
  sunGroup.add(sunMesh);
  const sunGlowMesh = new THREE.Mesh(
    new THREE.SphereGeometry(17, 32, 32),
    new THREE.ShaderMaterial({
      vertexShader: sunGlowVertexShader,
      fragmentShader: sunGlowFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    }),
  );
  sunGroup.add(sunGlowMesh);
  scene.add(sunGroup);

  const sunLight = new THREE.DirectionalLight(
    preset.sunLightColor.clone(),
    preset.sunLightIntensity,
  );
  sunLight.position.copy(preset.sunPos);
  scene.add(sunLight);
  const ambientLight = new THREE.AmbientLight(
    preset.ambientColor.clone(),
    preset.ambientIntensity,
  );
  scene.add(ambientLight);

  // ── Clouds (same fluffy cumulus factory as Ocean.js) ────────────────────
  const cloudsGroup = new THREE.Group();
  scene.add(cloudsGroup);
  const panelClouds = [];
  // Subset of the main banks keeps multi-panel rendering GPU-friendly
  cloudConfigs.slice(0, 6).forEach((c) => {
    const cloud = createFluffyCloud(c.x, c.y, c.z, c.scale, cloudsGroup);
    if (cloud) panelClouds.push(cloud);
  });

  // ── Water (same shaders as Ocean.js, lighter tessellation) ──────────────
  const waterGeometry = new THREE.PlaneGeometry(350, 350, 128, 128);
  waterGeometry.rotateX(-Math.PI / 2);
  const waterMaterial = new THREE.ShaderMaterial({
    vertexShader: waterVertexShader,
    fragmentShader: waterFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uUnderwaterRatio: { value: 0.0 },
      uBigWavesElevation: { value: 0.38 },
      uBigWavesFrequency: { value: new THREE.Vector2(0.28, 0.18) },
      uBigWavesSpeed: { value: 1.1 },
      uSmallWavesElevation: { value: 0.14 },
      uSmallWavesFrequency: { value: 1.6 },
      uSmallWavesSpeed: { value: 0.35 },
      uDepthColor: { value: preset.waterDepthColor.clone() },
      uSurfaceColor: { value: preset.waterSurfaceColor.clone() },
      uFoamColor: { value: new THREE.Color(0xf6ffff) },
      uColorOffset: { value: 0.15 },
      uColorMultiplier: { value: 2.2 },
      uSunPosition: { value: preset.sunPos.clone() },
      uSunColor: { value: preset.sunColor.clone() },
      uSkyHorizonColor: { value: preset.horizonColor.clone() },
    },
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.position.y = 0;
  scene.add(water);

  // ── The real APEX Argo model (same builder + config as Ocean.js) ─────────
  const argoFloat = createArgoFloatModel();
  argoFloat.position.set(ARGO_FLOAT_CONFIG.x, ARGO_FLOAT_CONFIG.y, ARGO_FLOAT_CONFIG.z);
  scene.add(argoFloat);

  // ── Depth state (lerped every frame for smooth dives) ────────────────────
  let targetRatio = Math.max(0, Math.min(1, (Number(options.depth) || 0) / MAX_PANEL_DEPTH_M));
  let currentRatio = targetRatio;
  argoFloat.position.y = ARGO_FLOAT_CONFIG.y - currentRatio * PANEL_DIVE_RANGE;

  const clock = new THREE.Clock();
  let raf = 0;
  let disposed = false;

  function applyPreset(p) {
    preset = p;
    skyMat.uniforms.uTopColor.value.copy(p.topColor);
    skyMat.uniforms.uHorizonColor.value.copy(p.horizonColor);
    skyMat.uniforms.uSunPosition.value.copy(p.sunPos);
    skyMat.uniforms.uSunColor.value.copy(p.sunColor);
    sunGroup.position.copy(p.sunPos);
    sunMesh.material.color.copy(p.sunColor);
    sunLight.position.copy(p.sunPos);
    sunLight.color.copy(p.sunLightColor);
    sunLight.intensity = p.sunLightIntensity;
    ambientLight.color.copy(p.ambientColor);
    ambientLight.intensity = p.ambientIntensity;
    waterMaterial.uniforms.uSunPosition.value.copy(p.sunPos);
    waterMaterial.uniforms.uSunColor.value.copy(p.sunColor);
    waterMaterial.uniforms.uSkyHorizonColor.value.copy(p.horizonColor);
    waterMaterial.uniforms.uSurfaceColor.value.copy(p.waterSurfaceColor);
    waterMaterial.uniforms.uDepthColor.value.copy(p.waterDepthColor);
  }

  function tick() {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // Smooth dive toward the slider depth
    currentRatio = THREE.MathUtils.lerp(currentRatio, targetRatio, Math.min(1, dt * 4));
    if (Math.abs(currentRatio - targetRatio) < 0.0004) currentRatio = targetRatio;
    const diveY = -currentRatio * PANEL_DIVE_RANGE;

    // Surface wave bobbing fading out with depth (same feel as Ocean.js)
    const surfaceInfluence = Math.max(0, 1 - currentRatio * 20);
    const bob = (Math.sin(t * 2.2) * 0.04 + Math.sin(argoFloat.position.x * 0.28 + t * 1.1) * 0.1) * surfaceInfluence;
    argoFloat.position.y = ARGO_FLOAT_CONFIG.y + diveY + bob;
    argoFloat.rotation.z = Math.sin(t * 1.4) * (0.065 * surfaceInfluence + 0.015 * (1 - surfaceInfluence));
    argoFloat.rotation.x = Math.cos(t * 1.6) * (0.05 * surfaceInfluence + 0.012 * (1 - surfaceInfluence));
    argoFloat.rotation.y = t * 0.035;

    // Camera follows the float down the water column
    if (currentRatio <= 0.002) {
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, diveY + 3.2, 0.08);
      controls.target.set(ARGO_FLOAT_CONFIG.x, diveY + 1.8, ARGO_FLOAT_CONFIG.z);
    } else {
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, diveY + 3.0, 0.08);
      controls.target.set(ARGO_FLOAT_CONFIG.x, diveY + 0.6, ARGO_FLOAT_CONFIG.z);
    }
    controls.maxPolarAngle = currentRatio > 0.02 ? Math.PI - 0.05 : Math.PI / 2 - 0.02;

    // Water + sky dive response (underwater ratio + fog, compact Ocean.js logic)
    waterMaterial.uniforms.uTime.value = t;
    waterMaterial.uniforms.uUnderwaterRatio.value = currentRatio;
    skyMat.uniforms.uUnderwaterRatio.value = currentRatio;
    skyMat.uniforms.uCameraDepth.value = Math.round(currentRatio * MAX_PANEL_DEPTH_M);
    sky.position.copy(camera.position);

    if (currentRatio > 0.015) {
      let fogColor;
      let fogDensity;
      if (currentRatio < 0.04) {
        const k = currentRatio / 0.04;
        fogColor = new THREE.Color().lerpColors(new THREE.Color(0x0284c7), new THREE.Color(0x034f8a), k);
        fogDensity = 0.01 + k * 0.003;
      } else if (currentRatio < 0.18) {
        const k = (currentRatio - 0.04) / 0.14;
        fogColor = new THREE.Color().lerpColors(new THREE.Color(0x034f8a), new THREE.Color(0x041f48), k);
        fogDensity = 0.013 + k * 0.004;
      } else {
        const k = Math.min(1, (currentRatio - 0.18) / 0.82);
        fogColor = new THREE.Color().lerpColors(new THREE.Color(0x041f48), new THREE.Color(0x010816), k);
        fogDensity = 0.017 + k * 0.005;
      }
      if (!scene.fog) scene.fog = new THREE.FogExp2(fogColor, fogDensity);
      else { scene.fog.color.copy(fogColor); scene.fog.density = fogDensity; }
      renderer.setClearColor(fogColor, 1);
    } else {
      scene.fog = null;
      renderer.setClearColor(0x0a2d52, 1);
    }

    // Clouds drift + fade on descent
    const cloudsVisible = currentRatio <= 0.04;
    cloudsGroup.visible = cloudsVisible;
    if (cloudsVisible) {
      panelClouds.forEach((cloud) => {
        cloud.position.x += cloud.userData.speed || 0.02;
        if (cloud.position.x > 150) cloud.position.x = -150;
      });
    }

    // Sun fades as the float descends
    const sunFade = Math.max(0, 1 - currentRatio * 4);
    sunGroup.visible = sunFade > 0.01;
    sunMesh.material.opacity = sunFade;
    sunLight.intensity = preset.sunLightIntensity * Math.max(0, Math.pow(1 - Math.min(1, currentRatio * 1.4), 2.5));

    controls.update();
    renderer.render(scene, camera);
  }
  tick();

  const resizeObserver = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  resizeObserver.observe(container);

  return {
    /** Smoothly dive the Argo to `depthMeters` (0–4000). */
    setDepth(depthMeters) {
      const d = Math.max(0, Math.min(MAX_PANEL_DEPTH_M, Number(depthMeters) || 0));
      targetRatio = d / MAX_PANEL_DEPTH_M;
    },
    /** Swap the solar-time preset (sky, sun, water colors follow). */
    setPreset(p) {
      if (p) applyPreset(p);
    },
    /** Full teardown: stops the loop, frees GPU memory, removes the canvas. */
    dispose() {
      disposed = true;
      try { cancelAnimationFrame(raf); } catch (_e) { /* ignore */ }
      try { resizeObserver.disconnect(); } catch (_e) { /* ignore */ }
      try { controls.dispose(); } catch (_e) { /* ignore */ }
      try {
        disposeObject(scene);
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentElement === container) {
          container.removeChild(renderer.domElement);
        }
      } catch (_e) { /* ignore */ }
    },
  };
}

export default mountOceanPanel;
