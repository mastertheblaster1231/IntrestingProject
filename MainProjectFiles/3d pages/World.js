import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import worldMapUrl from "../Images/Worldmap_pic.jpg";

// ============================================================================
// ⚙️ ANCHOR & BADGE SIZE CONFIGURATION
// You can adjust these numbers to change how large/small anchors appear!
// ============================================================================
export const ANCHOR_SIZE_CONFIG = {
  // 1. Zoomed-out size (Orbit view of whole Earth):
  maxScale: 0.8, // <-- Adjust this to make zoomed-out anchors bigger/smaller

  // 2. Zoomed-in size (Close-up view of sea/coast):
  minScale: 0.09, // <-- Adjust this to make zoomed-in anchors even smaller (e.g. 0.03)

  // 3. Zoom distance thresholds:
  zoomOutDistance: 4.5, // Camera distance when zoomed out
  zoomInDistance: 1.85, // Camera distance when zoomed in close

  // 4. Shrink rate power: (Higher = shrinks much faster as you start zooming in)
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
const renderer = new THREE.WebGLRenderer({ antialias: true });
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

// 5. Axes Helper (X = Red, Y = Green, Z = Blue)
const axesHelper = new THREE.AxesHelper(3);
scene.add(axesHelper);

// 6. Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.8);
sunLight.position.set(5, 4, -4);
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x4080ff, 0.8);
fillLight.position.set(-5, -2, 4);
scene.add(fillLight);

// 7. World Globe with texture
const textureLoader = new THREE.TextureLoader();
const worldTexture = textureLoader.load(worldMapUrl);
worldTexture.colorSpace = THREE.SRGBColorSpace;

const globeGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 32);
const globeMaterial = new THREE.MeshStandardMaterial({
  map: worldTexture,
  roughness: 0.65,
  metalness: 0.05,
});
const globe = new THREE.Mesh(globeGeometry, globeMaterial);
scene.add(globe);

// Subtle Atmosphere glow layer
const atmosphereGeometry = new THREE.SphereGeometry(
  GLOBE_RADIUS * 1.015,
  64,
  32,
);
const atmosphereMaterial = new THREE.MeshBasicMaterial({
  color: 0x00aaff,
  transparent: true,
  opacity: 0.12,
  side: THREE.BackSide,
});
const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
scene.add(atmosphere);

// 8. Argo / OON Observation Points Data
export const argoPoints = [
  {
    id: "A1",
    code: "AD07",
    lat: 15.0,
    lon: 69.0,
    sea: "Arabian Sea (West of Goa)",
    type: "Deep Sea Moored Buoy",
  },
  {
    id: "A2",
    code: "AD08",
    lat: 12.0,
    lon: 68.5,
    sea: "Arabian Sea (Central Basin)",
    type: "Omni Meteorological Buoy",
  },
  {
    id: "A3",
    code: "CB02",
    altCode: "CALVAL / AD10",
    lat: 10.3,
    lon: 72.5,
    sea: "Lakshadweep (Agatti / Kavaratti)",
    type: "Coastal & CalVal Buoy",
  },
  {
    id: "A4",
    code: "AD09",
    lat: 8.2,
    lon: 73.3,
    sea: "South Lakshadweep / Minicoy Channel",
    type: "Deep Ocean Buoy",
  },
  {
    id: "A5",
    code: "CB06",
    lat: 13.1,
    lon: 80.3,
    sea: "Bay of Bengal (Chennai Offshore)",
    type: "Coastal Moored Buoy",
  },
  {
    id: "A6",
    code: "BD13",
    lat: 14.0,
    lon: 87.0,
    sea: "Bay of Bengal (Central Basin)",
    type: "Deep Sea Meteorological Buoy",
  },
  {
    id: "A7",
    code: "CB01",
    lat: 11.6,
    lon: 92.5,
    sea: "Andaman Sea (Port Blair)",
    type: "Coastal Observation Buoy",
  },
  {
    id: "A8",
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

  // 2. Compact Name badge under the anchor: "A1", "A2", etc.
  ctx.shadowBlur = 6;
  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
  ctx.fillStyle = "rgba(6, 18, 38, 0.92)";
  const badgeWidth = 116; // Compact width
  const badgeHeight = 44; // Compact height
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

argoPoints.forEach((point) => {
  const surfacePos = latLonToVector3(point.lat, point.lon, GLOBE_RADIUS);
  const markerPos = latLonToVector3(point.lat, point.lon, GLOBE_RADIUS + 0.14);

  // 1. Surface beacon dot (Default: Cyan / Amber; Selected: GREEN)
  const defaultColor = point.id === "A3" ? 0xff7b00 : 0x00f0ff;
  const beaconGeo = new THREE.SphereGeometry(0.022, 16, 16);
  const beaconMat = new THREE.MeshBasicMaterial({ color: defaultColor });
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.position.copy(surfacePos);
  beacon.userData = { id: point.id, defaultColor: defaultColor };
  markersGroup.add(beacon);
  beaconMeshes.push(beacon);

  // 2. Connecting stem line between surface beacon and floating anchor sprite
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

  // 3. Floating billboard anchor sprite with ⚓ and A1, A2...
  const sprite = createAnchorSprite(point.id, point.code);
  sprite.position.copy(markerPos);
  sprite.userData = point;
  markersGroup.add(sprite);
  clickableSprites.push(sprite);
});

// Selection function: Turns clicked station's dot to GREEN (#00ff66)
export function selectStation(id) {
  selectedStationId = id;

  // Turn selected station's dot GREEN, reset others to default
  beaconMeshes.forEach((b) => {
    if (b.userData.id === id) {
      b.material.color.setHex(0x00ff66); // <-- GREEN when clicked!
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
}

// 9. Interactive Raycasting & Mouse Events
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tooltip = document.getElementById("tooltip");

// Hover event for tooltip
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
          <div style="margin-top:4px; color:#00ff66;">✦ Click to select & turn beacon Green</div>
        </div>
      `;
    }
  } else {
    document.body.style.cursor = "default";
    if (tooltip) tooltip.style.display = "none";
  }
}

// Click event: Click on any ⚓ anchor on the 3D globe to select and turn its dot GREEN
function onPointerClick(event) {
  // Ignore clicks on HUD UI panels
  if (
    event.target.closest &&
    event.target.closest(".hud-sidebar, .hud-header, .sidebar-toggle-btn")
  ) {
    return;
  }

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(clickableSprites);

  if (intersects.length > 0) {
    const target = intersects[0].object;
    const data = target.userData;
    selectStation(data.id);
  }
}

window.addEventListener("pointermove", onPointerMove);
window.addEventListener("click", onPointerClick);

// Focus function when clicking a point in the list
window.focusOnPoint = function (id) {
  selectStation(id);

  const pt = argoPoints.find((p) => p.id === id);
  if (!pt) return;

  const targetVec = latLonToVector3(pt.lat, pt.lon, GLOBE_RADIUS + 0.9);
  camera.position.set(targetVec.x * 1.5, targetVec.y * 1.5, targetVec.z * 1.5);
  controls.target.set(0, 0, 0);
  controls.update();
};

// 10. Responsive resize handling
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// 11. Animation loop with dynamic zoom scaling for anchor points
let clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const elapsedTime = clock.getElapsedTime();

  // DYNAMIC ZOOM SCALING:
  // As the user zooms in (camera moves closer), shrink the anchor sprites
  // so both the anchor and the badge decrease noticeably in size!
  const camDist = camera.position.distanceTo(controls.target);
  const cfg = ANCHOR_SIZE_CONFIG;

  // Normalized distance from 0.0 (closest zoom) to 1.0 (furthest zoom)
  const normDist = Math.max(
    0,
    Math.min(
      1,
      (camDist - cfg.zoomInDistance) /
        (cfg.zoomOutDistance - cfg.zoomInDistance),
    ),
  );

  // Non-linear power curve: shrinks quickly as soon as you zoom in close
  const dynamicScale =
    cfg.minScale +
    Math.pow(normDist, cfg.zoomCurvePower) * (cfg.maxScale - cfg.minScale);

  clickableSprites.forEach((sprite) => {
    sprite.scale.set(dynamicScale, dynamicScale, 1);
  });

  // Pulse the surface beacon dots (the clicked green beacon pulses prominently)
  const pulseBase = 1.0 + 0.28 * Math.sin(elapsedTime * 4);
  const zoomFactor = Math.max(0.45, Math.min(1.0, camDist / 3.8));
  beaconMeshes.forEach((b) => {
    const isSelected = b.userData.id === selectedStationId;
    const extraScale = isSelected ? 1.5 : 1.0;
    const s = pulseBase * zoomFactor * extraScale;
    b.scale.set(s, s, s);
  });

  // Update controls for smooth inertia
  controls.update();

  renderer.render(scene, camera);
}

animate();
