/**
 * instruments.js
 * Comprehensive 3D Ocean Instrument Visualization System (Three.js & WebGL)
 * 
 * Supported Instrument Types:
 * - 'argo'   : Slim vertical cylinder (APEX / Navis profiling float)
 * - 'glider' : Horizontal capsule with hydrodynamic triangular wings (Autonomous Slocum/Spray Glider)
 * - 'ctd'    : Wireframe cage box (Shipboard CTD Rosette water sampler)
 * 
 * Supports both:
 * 1. Individual interactive Object3D meshes (for detailed inspections, tooltips, click-to-dive)
 * 2. High-performance THREE.InstancedMesh rendering (for 100s–10,000s of instruments with 1 draw call per type)
 */

import * as THREE from 'three';

// ============================================================================
// 1. DEMO UNIFIED INSTRUMENT DATASET (Ready for future API replacements)
// ============================================================================
export const DEMO_INSTRUMENTS = [
  // 1. ARGO PROFILING FLOATS (Vertical Cylinders)
  {
    id: "argo-2902351",
    name: "Argo Float #2902351",
    type: "argo",
    platform: "APEX Profiling Float",
    position: [0, -0.2, 1.5], // Surface waterline (15m)
    depthMeters: 15,
    geoCoordinates: { lat: 11.6000, lon: 92.5000, depthM: 15 },
    telemetry: {
      temperatureC: 28.3,
      salinityPSU: 34.3,
      dissolvedOxygen: 198,
      batteryPct: 82,
      cycle: 147,
      status: "surface-telemetry"
    },
    modelValidation: {
      modelName: "INCOIS-ROMS 1/12°",
      deltaTempC: 0.3,
      deltaSalPSU: -0.10,
      obsTemp: 28.3,
      modelTemp: 28.0,
      obsSal: 34.30,
      modelSal: 34.40,
      status: "OPTIMAL AGREEMENT",
      confidenceScore: "98.4%",
      biasRating: "LOW BIAS",
      lastRun: "00:00 UTC Assimilation"
    }
  },
  {
    id: "argo-2902352",
    name: "Deep SOLO Float #2902352",
    type: "argo",
    platform: "Deep SOLO Profiler (6000m rated)",
    position: [-6.4, -38.0, 5.2], // Abyssal depth (1600m)
    depthMeters: 1600,
    geoCoordinates: { lat: 10.8900, lon: 92.1400, depthM: 1600 },
    telemetry: {
      temperatureC: 2.8,
      salinityPSU: 34.78,
      dissolvedOxygen: 115,
      batteryPct: 68,
      cycle: 210,
      status: "abyssal-parking"
    },
    modelValidation: {
      modelName: "HYCOM Global 0.08°",
      deltaTempC: 0.1,
      deltaSalPSU: 0.02,
      obsTemp: 2.8,
      modelTemp: 2.7,
      obsSal: 34.78,
      modelSal: 34.76,
      status: "DEEP WATER FIT",
      confidenceScore: "99.1%",
      biasRating: "MINIMAL BIAS",
      lastRun: "06:00 UTC Assimilation"
    }
  },

  // 2. UNDERWATER GLIDERS (Horizontal Capsules with Wings)
  {
    id: "glider-slocum-04",
    name: "Slocum Glider SG-04 'Nautilus'",
    type: "glider",
    platform: "Teledyne Slocum G3",
    position: [7.2, -4.5, -3.0], // Epipelagic thermocline border (190m)
    depthMeters: 190,
    headingDeg: 35,
    geoCoordinates: { lat: 11.7500, lon: 92.8000, depthM: 190 },
    telemetry: {
      speedKnots: 0.65,
      pitchDeg: -14,
      missionWaypoint: "Station Hydro-Alpha",
      batteryPct: 78,
      status: "gliding-dive"
    },
    modelValidation: {
      modelName: "MERCATOR-PSY4V3",
      deltaTempC: -0.4,
      deltaSalPSU: 0.15,
      obsTemp: 21.6,
      modelTemp: 22.0,
      obsSal: 34.85,
      modelSal: 34.70,
      status: "TRANSECT VALIDATED",
      confidenceScore: "96.7%",
      biasRating: "MODERATE THERMOCLINE OFFSET",
      lastRun: "03:00 UTC Assimilation"
    }
  },
  {
    id: "glider-spray-09",
    name: "Spray Glider #09 'Poseidon'",
    type: "glider",
    platform: "Scripps Spray Glider",
    position: [-7.8, -14.2, 4.0], // Mesopelagic Oxygen Minimum Zone (600m)
    depthMeters: 600,
    headingDeg: 215,
    telemetry: {
      speedKnots: 0.58,
      pitchDeg: 12,
      missionWaypoint: "Transect Bravo",
      batteryPct: 88,
      status: "gliding-climb"
    },
    modelValidation: {
      modelName: "INCOIS-ROMS 1/12°",
      deltaTempC: 0.2,
      deltaSalPSU: -0.05,
      obsTemp: 11.2,
      modelTemp: 11.0,
      obsSal: 35.12,
      modelSal: 35.17,
      status: "OMZ BOUNDARY FIT",
      confidenceScore: "97.5%",
      biasRating: "LOW BIAS",
      lastRun: "00:00 UTC Assimilation"
    }
  },

  // 3. CTD ROSETTES (Wireframe Box Cages)
  {
    id: "ctd-rosette-01",
    name: "CTD Rosette Station #01",
    type: "ctd",
    platform: "SBE 32 Carousel 24-Bottle",
    position: [4.8, -28.5, 1.2], // Bathypelagic ocean cast (1200m)
    depthMeters: 1200,
    geoCoordinates: { lat: 11.6000, lon: 92.5000, depthM: 1200 },
    telemetry: {
      wireTensionKg: 640,
      castRateMps: 1.0,
      activeBottlesClosed: 12,
      vessel: "R/V Sagar Kanya",
      status: "downcast"
    },
    modelValidation: {
      modelName: "NCEP CFSv2 Hybrid",
      deltaTempC: -0.2,
      deltaSalPSU: 0.08,
      obsTemp: 5.4,
      modelTemp: 5.6,
      obsSal: 34.90,
      modelSal: 34.82,
      status: "REFERENCE BENCHMARK",
      confidenceScore: "99.5%",
      biasRating: "GOLD STANDARD QC",
      lastRun: "12:00 UTC Cast Sync"
    }
  },
  {
    id: "ctd-rosette-02",
    name: "Seabed Moored CTD Station #02",
    type: "ctd",
    platform: "Deep Mooring Cage",
    position: [-5.0, -46.3, -3.5], // Deep ocean abyss floor (1950m)
    depthMeters: 1950,
    geoCoordinates: { lat: 11.8500, lon: 93.4000, depthM: 1950 },
    telemetry: {
      wireTensionKg: 0,
      castRateMps: 0.0,
      activeBottlesClosed: 24,
      vessel: "Abyssal Mooring",
      status: "bottom-recording"
    },
    modelValidation: {
      modelName: "ECCO Version 4",
      deltaTempC: 0.05,
      deltaSalPSU: -0.01,
      obsTemp: 2.1,
      modelTemp: 2.05,
      obsSal: 34.72,
      modelSal: 34.73,
      status: "SEABED CALIBRATED",
      confidenceScore: "99.8%",
      biasRating: "PRISTINE ACCURACY",
      lastRun: "Stationary Benchmark"
    }
  }
];

// ============================================================================
// 2. SHARED GEOMETRY & MATERIAL SINGLETONS (Memory & WebGL Optimization)
// ============================================================================
// Reusing geometries & materials prevents memory leaks, minimizes GC pauses,
// and drastically lowers GPU draw calls when rendering hundreds of instruments.

const sharedMaterials = {
  // Argo Float Materials
  argoHull: new THREE.MeshStandardMaterial({
    color: 0xff7a00, // Safety beacon orange
    roughness: 0.35,
    metalness: 0.25,
    emissive: 0x331400,
    emissiveIntensity: 0.2
  }),
  argoCap: new THREE.MeshStandardMaterial({
    color: 0x1e293b, // Dark titanium sensor cap
    roughness: 0.2,
    metalness: 0.8
  }),
  argoAntenna: new THREE.MeshBasicMaterial({
    color: 0x00f0ff // Cyan satellite telemetry antenna
  }),

  // Glider Materials
  gliderHull: new THREE.MeshStandardMaterial({
    color: 0xffd000, // Vibrant submarine yellow
    roughness: 0.3,
    metalness: 0.15,
    emissive: 0x221800,
    emissiveIntensity: 0.2
  }),
  gliderWings: new THREE.MeshStandardMaterial({
    color: 0x0f172a, // Carbon fiber composite black wings
    roughness: 0.4,
    metalness: 0.6,
    side: THREE.DoubleSide
  }),

  // CTD Rosette Materials
  ctdWireframe: new THREE.LineBasicMaterial({
    color: 0x00e5ff, // Glowing cyan wireframe cage
    transparent: true,
    opacity: 0.85,
    linewidth: 1.5
  }),
  ctdBottles: new THREE.MeshStandardMaterial({
    color: 0x94a3b8, // Niskin gray canisters
    roughness: 0.5,
    metalness: 0.5
  })
};

// Cached Base Geometries
const sharedGeometries = {
  argoCylinder: new THREE.CylinderGeometry(0.35, 0.35, 3.8, 24),
  argoCap: new THREE.CylinderGeometry(0.38, 0.38, 0.5, 24),
  argoAntenna: new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8),

  gliderFuselage: new THREE.CapsuleGeometry(0.55, 3.2, 12, 24),
  gliderWingGeometry: createSweptWingGeometry(),
  gliderTailFin: createTailFinGeometry(),

  ctdBoxGeometry: new THREE.BoxGeometry(2.4, 3.2, 2.4),
  ctdInnerCanister: new THREE.CylinderGeometry(0.7, 0.7, 2.6, 16)
};

/**
 * Procedurally generates small swept triangular wings for underwater glider
 */
function createSweptWingGeometry() {
  const shape = new THREE.Shape();
  // Triangular swept wing profile: root at hull, sweeping back to sharp tip
  shape.moveTo(0, -0.6);
  shape.lineTo(2.8, -1.8);
  shape.lineTo(2.6, -2.1);
  shape.lineTo(0, -1.4);
  shape.closePath();

  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.08,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.02,
    bevelThickness: 0.02
  });
}

/**
 * Procedurally generates vertical stabilizer tail fin for glider
 */
function createTailFinGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0, 1.2);
  shape.lineTo(-0.8, 0.3);
  shape.lineTo(-0.8, 0);
  shape.closePath();

  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.06,
    bevelEnabled: false
  });
}

// ============================================================================
// 3. INDIVIDUAL PRIMITIVE BUILDERS (Type-Specific 3D Implementations)
// ============================================================================

/**
 * Type 1: Argo Float - Slim vertical cylinder with antenna
 * @param {Object} instrument
 * @returns {THREE.Group}
 */
export function createArgoFloatMesh(instrument) {
  const group = new THREE.Group();
  group.name = `instrument_argo_${instrument.id}`;

  // Main slim vertical cylinder hull
  const hull = new THREE.Mesh(sharedGeometries.argoCylinder, sharedMaterials.argoHull);
  hull.castShadow = true;
  group.add(hull);

  // Top CTD sensor head / buoyancy collar
  const collar = new THREE.Mesh(sharedGeometries.argoCap, sharedMaterials.argoCap);
  collar.position.y = 1.9;
  group.add(collar);

  // Vertical satellite communication antenna
  const antenna = new THREE.Mesh(sharedGeometries.argoAntenna, sharedMaterials.argoAntenna);
  antenna.position.y = 2.8;
  group.add(antenna);

  // Subtle beacon light at antenna tip
  const beaconLight = new THREE.PointLight(0xff7a00, 1.2, 8);
  beaconLight.position.y = 3.5;
  group.add(beaconLight);

  return group;
}

/**
 * Type 2: Underwater Glider - Horizontal capsule with small triangular wings
 * @param {Object} instrument
 * @returns {THREE.Group}
 */
export function createGliderMesh(instrument) {
  const group = new THREE.Group();
  group.name = `instrument_glider_${instrument.id}`;

  // Fuselage: Horizontal capsule (rotate Z-axis 90 degrees to lay horizontal)
  const fuselage = new THREE.Mesh(sharedGeometries.gliderFuselage, sharedMaterials.gliderHull);
  fuselage.rotation.x = Math.PI / 2; // Lie along Z axis (forward/back)
  fuselage.castShadow = true;
  group.add(fuselage);

  // Right Wing (Triangular swept wing)
  const rightWing = new THREE.Mesh(sharedGeometries.gliderWingGeometry, sharedMaterials.gliderWings);
  rightWing.position.set(0.35, 0, 0.4);
  rightWing.rotation.x = Math.PI / 2;
  group.add(rightWing);

  // Left Wing (Mirrored along X)
  const leftWing = new THREE.Mesh(sharedGeometries.gliderWingGeometry, sharedMaterials.gliderWings);
  leftWing.position.set(-0.35, 0, 0.4);
  leftWing.rotation.x = Math.PI / 2;
  leftWing.rotation.y = Math.PI; // Mirror flip
  group.add(leftWing);

  // Vertical Tail Fin
  const tailFin = new THREE.Mesh(sharedGeometries.gliderTailFin, sharedMaterials.gliderWings);
  tailFin.position.set(0, 0.45, -1.8);
  group.add(tailFin);

  // Apply heading / pitch rotation if available
  if (instrument.headingDeg) {
    group.rotation.y = THREE.MathUtils.degToRad(instrument.headingDeg);
  }
  if (instrument.telemetry && instrument.telemetry.pitchDeg) {
    group.rotation.x = THREE.MathUtils.degToRad(instrument.telemetry.pitchDeg);
  }

  return group;
}

/**
 * Type 3: CTD Rosette - Simple wireframe box cage with inner sensor payload
 * @param {Object} instrument
 * @returns {THREE.Group}
 */
export function createCtdRosetteMesh(instrument) {
  const group = new THREE.Group();
  group.name = `instrument_ctd_${instrument.id}`;

  // 1. Simple wireframe box cage (using EdgesGeometry for crisp clean lines)
  const edgesGeometry = new THREE.EdgesGeometry(sharedGeometries.ctdBoxGeometry);
  const wireframeBox = new THREE.LineSegments(edgesGeometry, sharedMaterials.ctdWireframe);
  group.add(wireframeBox);

  // 2. Inner cylindrical sensor rosette cluster (representing Niskin water sampling bottles)
  const innerCarousel = new THREE.Mesh(sharedGeometries.ctdInnerCanister, sharedMaterials.ctdBottles);
  group.add(innerCarousel);

  // 3. Top lifting bridle wire
  const bridlePoints = [
    new THREE.Vector3(-1.1, 1.6, -1.1),
    new THREE.Vector3(0, 2.6, 0),
    new THREE.Vector3(1.1, 1.6, -1.1),
    new THREE.Vector3(0, 2.6, 0),
    new THREE.Vector3(0, 1.6, 1.1),
    new THREE.Vector3(0, 2.6, 0)
  ];
  const bridleGeo = new THREE.BufferGeometry().setFromPoints(bridlePoints);
  const bridleLine = new THREE.LineSegments(bridleGeo, sharedMaterials.ctdWireframe);
  group.add(bridleLine);

  return group;
}

// ============================================================================
// 4. FACTORY COMPONENT: createInstrumentObject (Polymorphic Primitive Dispatcher)
// ============================================================================

/**
 * Dynamic factory that renders the appropriate 3D primitive shape based on instrument.type
 * 
 * @param {Object} instrument - Instrument data object with .type, .position, .telemetry
 * @returns {THREE.Group} Fully configured Three.js Object3D
 */
export function createInstrumentObject(instrument) {
  if (!instrument || !instrument.type) {
    console.warn("[instruments.js] Missing instrument or instrument.type, skipping render.");
    return new THREE.Group();
  }

  let meshGroup;

  switch (instrument.type.toLowerCase()) {
    case 'argo':
      meshGroup = createArgoFloatMesh(instrument);
      break;

    case 'glider':
      meshGroup = createGliderMesh(instrument);
      break;

    case 'ctd':
      meshGroup = createCtdRosetteMesh(instrument);
      break;

    default:
      console.warn(`[instruments.js] Unknown instrument type "${instrument.type}". Defaulting to wireframe box.`);
      meshGroup = createCtdRosetteMesh(instrument);
      break;
  }

  // Set position in 3D world space
  if (Array.isArray(instrument.position) && instrument.position.length >= 3) {
    meshGroup.position.set(
      instrument.position[0],
      instrument.position[1],
      instrument.position[2]
    );
  }

  // Attach metadata reference directly to userData for raycasting & pointer tooltips
  meshGroup.userData = {
    isInstrument: true,
    id: instrument.id,
    instrumentData: instrument
  };

  return meshGroup;
}

// ============================================================================
// 5. HIGH-PERFORMANCE INSTANCED MESH MANAGER (Scales to 10,000+ Instruments)
// ============================================================================

/**
 * InstancedInstrumentCollection
 * Uses THREE.InstancedMesh to render hundreds or thousands of floats, gliders,
 * and CTDs with only 1 draw call per instrument type!
 */
export class InstancedInstrumentCollection {
  constructor(scene) {
    this.scene = scene;
    this.argoInstancedMesh = null;
    this.gliderInstancedMesh = null;
    this.ctdInstancedMesh = null;
    this.instrumentMap = new Map(); // instanceId -> instrument object
  }

  /**
   * Initializes or updates instanced meshes from a unified JSON array
   * @param {Array<Object>} instrumentsList
   */
  loadInstruments(instrumentsList = DEMO_INSTRUMENTS) {
    // 1. Separate by type
    const argos = instrumentsList.filter(i => i.type.toLowerCase() === 'argo');
    const gliders = instrumentsList.filter(i => i.type.toLowerCase() === 'glider');
    const ctds = instrumentsList.filter(i => i.type.toLowerCase() === 'ctd');

    // 2. Build or rebuild instanced meshes
    this.buildArgoInstances(argos);
    this.buildGliderInstances(gliders);
    this.buildCtdInstances(ctds);
  }

  buildArgoInstances(argos) {
    if (this.argoInstancedMesh) {
      this.scene.remove(this.argoInstancedMesh);
      this.argoInstancedMesh.dispose();
    }
    if (argos.length === 0) return;

    this.argoInstancedMesh = new THREE.InstancedMesh(
      sharedGeometries.argoCylinder,
      sharedMaterials.argoHull,
      argos.length
    );
    this.argoInstancedMesh.name = "instanced_argo_floats";
    this.argoInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const dummy = new THREE.Object3D();
    argos.forEach((inst, index) => {
      dummy.position.set(inst.position[0], inst.position[1], inst.position[2]);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.argoInstancedMesh.setMatrixAt(index, dummy.matrix);
      this.instrumentMap.set(`argo_${index}`, inst);
    });

    this.argoInstancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.argoInstancedMesh);
  }

  buildGliderInstances(gliders) {
    if (this.gliderInstancedMesh) {
      this.scene.remove(this.gliderInstancedMesh);
      this.gliderInstancedMesh.dispose();
    }
    if (gliders.length === 0) return;

    this.gliderInstancedMesh = new THREE.InstancedMesh(
      sharedGeometries.gliderFuselage,
      sharedMaterials.gliderHull,
      gliders.length
    );
    this.gliderInstancedMesh.name = "instanced_gliders";
    this.gliderInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const dummy = new THREE.Object3D();
    gliders.forEach((inst, index) => {
      dummy.position.set(inst.position[0], inst.position[1], inst.position[2]);
      dummy.rotation.x = Math.PI / 2; // horizontal capsule
      if (inst.headingDeg) {
        dummy.rotation.y = THREE.MathUtils.degToRad(inst.headingDeg);
      }
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.gliderInstancedMesh.setMatrixAt(index, dummy.matrix);
      this.instrumentMap.set(`glider_${index}`, inst);
    });

    this.gliderInstancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.gliderInstancedMesh);
  }

  buildCtdInstances(ctds) {
    if (this.ctdInstancedMesh) {
      this.scene.remove(this.ctdInstancedMesh);
      this.ctdInstancedMesh.dispose();
    }
    if (ctds.length === 0) return;

    // Use BoxGeometry with wireframe standard material
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      wireframe: true
    });

    this.ctdInstancedMesh = new THREE.InstancedMesh(
      sharedGeometries.ctdBoxGeometry,
      wireMat,
      ctds.length
    );
    this.ctdInstancedMesh.name = "instanced_ctds";
    this.ctdInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const dummy = new THREE.Object3D();
    ctds.forEach((inst, index) => {
      dummy.position.set(inst.position[0], inst.position[1], inst.position[2]);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.ctdInstancedMesh.setMatrixAt(index, dummy.matrix);
      this.instrumentMap.set(`ctd_${index}`, inst);
    });

    this.ctdInstancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.ctdInstancedMesh);
  }
}

// ============================================================================
// 6. FUTURE API INTEGRATION ADAPTER
// ============================================================================

/**
 * Connects to future real-time REST / WebSocket API or GeoJSON endpoint
 * Example: fetchInstrumentsFromAPI('https://api.argo.ucsd.edu/v1/active-instruments')
 */
export async function fetchInstrumentsFromAPI(apiEndpointUrl) {
  try {
    const response = await fetch(apiEndpointUrl);
    if (!response.ok) {
      throw new Error(`API returned HTTP ${response.status}`);
    }
    const data = await response.json();

    // Normalize API response into unified format:
    return data.map(item => ({
      id: item.id || item.platform_number || `inst-${Math.random()}`,
      name: item.name || `Float #${item.platform_number}`,
      type: (item.type || item.instrument_type || 'argo').toLowerCase(),
      position: item.position || [item.x || 0, item.depth ? -item.depth : 0, item.z || 0],
      geoCoordinates: {
        lat: item.latitude || item.lat || 0,
        lon: item.longitude || item.lon || 0,
        depthM: item.depth || 0
      },
      telemetry: item.telemetry || {
        temperatureC: item.temp || item.sst || 0,
        salinityPSU: item.salinity || 0,
        dissolvedOxygen: item.oxygen || 0,
        batteryPct: item.battery || 100,
        status: item.status || "active"
      }
    }));
  } catch (err) {
    console.warn(`[instruments.js] API fetch failed: ${err.message}. Falling back to demo data.`);
    return DEMO_INSTRUMENTS;
  }
}

// ============================================================================
// 7. GLIDER SAWTOOTH TRAJECTORY TRAIL HELPER (Three.js Glowing Ribbon)
// ============================================================================
/**
 * Creates a glowing 3D polyline ribbon trailing behind an autonomous glider
 * to visually depict its historical and live up-and-down V/W dive cycles.
 *
 * @param {Object} options Configuration parameters:
 *   - color: Hex number or THREE.Color (e.g. 0x00f0ff for Slocum, 0xffd000 for Spray)
 *   - cycles: Number of historical sawtooth dive cycles to draw (default 4)
 *   - wavelength: Horizontal distance per cycle in Three.js units (default 6.5)
 *   - diveAmplitude: Vertical peak-to-trough travel in units (default 2.4)
 *   - ribbonWidth: Width of the glowing 3D ribbon strip (default 0.28)
 *   - heading: Normalized 2D vector for heading [dx, dz] (default [0.85, 0.5])
 * @returns {THREE.Group} Group containing glowing ribbon mesh and center polyline with depth markers
 */
export function createGliderSawtoothTrail(options = {}) {
  const color = new THREE.Color(options.color !== undefined ? options.color : 0x00f0ff);
  const cycles = options.cycles || 4;
  const wavelength = options.wavelength || 6.5;
  const diveAmplitude = options.diveAmplitude || 2.4;
  const ribbonWidth = options.ribbonWidth || 0.18;
  const segments = options.segments || 64;
  const heading = options.heading || [1, 0]; // Normalized x, z direction
  
  const trailGroup = new THREE.Group();
  trailGroup.name = "glider_sawtooth_trail";

  // Generate sawtooth spline curve points trailing behind origin (0,0,0)
  const spinePoints = [];
  const totalLength = cycles * wavelength;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments; // 0 = at glider head, 1 = oldest tail point
    const distBehind = t * totalLength;
    
    // Sawtooth / sinusoidal dive pattern:
    // Wave goes up and down smoothly mimicking actual variable-buoyancy glider cycles
    const phase = t * cycles * Math.PI * 2;
    const yOffset = -Math.sin(phase) * diveAmplitude;
    
    // Trailing backwards along opposite of heading
    const px = -heading[0] * distBehind;
    const pz = -heading[1] * distBehind;
    const py = yOffset;
    
    spinePoints.push(new THREE.Vector3(px, py, pz));
  }

  // 1. Construct 3D Ribbon Mesh (Triangle Strip with vertex alpha fade)
  const ribbonGeo = new THREE.BufferGeometry();
  const posArr = [];
  const colorArr = [];
  const uvArr = [];

  // Ribbon perpendicular vector (horizontal normal)
  const normX = -heading[1];
  const normZ = heading[0];

  for (let i = 0; i < spinePoints.length; i++) {
    const pt = spinePoints[i];
    const t = i / (spinePoints.length - 1); // 0 at head, 1 at tail
    
    // Alpha/brightness fade from bright head (1.0) to faded tail (0.05)
    const fade = Math.pow(1.0 - t, 1.4);
    const r = color.r * (0.4 + fade * 0.6);
    const g = color.g * (0.4 + fade * 0.6);
    const b = color.b * (0.4 + fade * 0.6);

    const halfW = ribbonWidth * (0.6 + fade * 0.4);

    // Left vertex
    posArr.push(pt.x + normX * halfW, pt.y, pt.z + normZ * halfW);
    colorArr.push(r, g, b);
    uvArr.push(0, t);

    // Right vertex
    posArr.push(pt.x - normX * halfW, pt.y, pt.z - normZ * halfW);
    colorArr.push(r, g, b);
    uvArr.push(1, t);
  }

  // Construct index for triangle strip
  const indices = [];
  for (let i = 0; i < spinePoints.length - 1; i++) {
    const v0 = i * 2;
    const v1 = i * 2 + 1;
    const v2 = (i + 1) * 2;
    const v3 = (i + 1) * 2 + 1;
    indices.push(v0, v1, v2);
    indices.push(v2, v1, v3);
  }

  ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
  ribbonGeo.setAttribute('color', new THREE.Float32BufferAttribute(colorArr, 3));
  ribbonGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
  ribbonGeo.setIndex(indices);
  ribbonGeo.computeVertexNormals();

  const ribbonMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.48,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
  trailGroup.add(ribbonMesh);

  // 2. High-intensity center glowing polyline
  const lineGeo = new THREE.BufferGeometry().setFromPoints(spinePoints);
  const lineMat = new THREE.LineBasicMaterial({
    color: color.clone().multiplyScalar(1.4),
    transparent: true,
    opacity: 0.88,
    linewidth: 2,
    blending: THREE.AdditiveBlending,
  });
  const spineLine = new THREE.Line(lineGeo, lineMat);
  trailGroup.add(spineLine);

  // 3. Glowing Depth Inflection Waypoint Nodes (Apices)
  const nodeGeo = new THREE.SphereGeometry(0.12, 10, 10);
  const nodeMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
  });

  // Add nodes at crests and troughs of sawtooth
  for (let c = 0; c < cycles * 2; c++) {
    const fraction = (c + 0.5) / (cycles * 2);
    const idx = Math.min(segments, Math.floor(fraction * segments));
    const pt = spinePoints[idx];
    const node = new THREE.Mesh(nodeGeo, nodeMat);
    node.position.copy(pt);
    node.scale.setScalar(0.7 + (1.0 - fraction) * 0.6);
    trailGroup.add(node);
  }

  // Animation pulse update method
  trailGroup.userData = {
    color,
    cycles,
    wavelength,
    diveAmplitude,
    spinePoints,
    ribbonMesh,
    ribbonMat,
    update: function(time, parentPosition) {
      if (parentPosition) {
        trailGroup.position.copy(parentPosition);
      }
      // Subtle glowing pulsation along ribbon
      ribbonMat.opacity = 0.38 + Math.sin(time * 2.5) * 0.12;
    }
  };

  return trailGroup;
}
