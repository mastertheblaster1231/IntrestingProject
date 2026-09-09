import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * ============================================================================
 * SHARED GEOMETRIES & MATERIALS (Module-Level Singletons for Maximum Performance)
 * ============================================================================
 * Reusing these singletons across all RenderInstrument instances ensures zero
 * redundant GPU memory allocations and prevents garbage collection stutter.
 */

// 1. Argo Geometries & Materials
const argoHullGeometry = new THREE.CylinderGeometry(0.35, 0.35, 3.8, 24);
const argoCapGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.5, 24);
const argoAntennaGeometry = new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8);

const argoHullMaterial = new THREE.MeshStandardMaterial({
  color: 0xff7a00, // International orange
  roughness: 0.35,
  metalness: 0.25,
  emissive: 0x331400,
  emissiveIntensity: 0.2
});
const argoCapMaterial = new THREE.MeshStandardMaterial({
  color: 0x1e293b,
  roughness: 0.2,
  metalness: 0.8
});
const argoAntennaMaterial = new THREE.MeshBasicMaterial({
  color: 0x00f0ff
});

// 2. Glider Geometries & Materials
const gliderFuselageGeometry = new THREE.CapsuleGeometry(0.55, 3.2, 12, 24);

// Triangular swept wing profile
const createGliderWingShape = () => {
  const shape = new THREE.Shape();
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
};
const gliderWingGeometry = createGliderWingShape();

// Vertical tail fin
const createGliderTailShape = () => {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0, 1.2);
  shape.lineTo(-0.8, 0.3);
  shape.lineTo(-0.8, 0);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false });
};
const gliderTailGeometry = createGliderTailShape();

const gliderHullMaterial = new THREE.MeshStandardMaterial({
  color: 0xffd000, // Vibrant research submarine yellow
  roughness: 0.3,
  metalness: 0.2,
  emissive: 0x221800,
  emissiveIntensity: 0.2
});
const gliderWingMaterial = new THREE.MeshStandardMaterial({
  color: 0x0f172a, // Carbon composite
  roughness: 0.4,
  metalness: 0.6,
  side: THREE.DoubleSide
});

// 3. CTD Rosette Geometries & Materials
const ctdBoxGeometry = new THREE.BoxGeometry(2.4, 3.2, 2.4);
const ctdEdgesGeometry = new THREE.EdgesGeometry(ctdBoxGeometry);
const ctdCanisterGeometry = new THREE.CylinderGeometry(0.7, 0.7, 2.6, 16);

const ctdWireframeMaterial = new THREE.LineBasicMaterial({
  color: 0x00e5ff,
  transparent: true,
  opacity: 0.85,
  linewidth: 1.5
});
const ctdCanisterMaterial = new THREE.MeshStandardMaterial({
  color: 0x94a3b8,
  roughness: 0.5,
  metalness: 0.5
});

/**
 * ============================================================================
 * TYPE-SPECIFIC PRIMITIVE SUB-COMPONENTS
 * ============================================================================
 */

/**
 * Argo Float: Slim Vertical Cylinder
 */
export function ArgoFloatMesh() {
  return (
    <group>
      {/* Slim vertical cylinder hull */}
      <mesh geometry={argoHullGeometry} material={argoHullMaterial} castShadow />

      {/* Top CTD sensor head / buoyancy collar */}
      <mesh
        geometry={argoCapGeometry}
        material={argoCapMaterial}
        position={[0, 1.9, 0]}
      />

      {/* Vertical telemetry antenna */}
      <mesh
        geometry={argoAntennaGeometry}
        material={argoAntennaMaterial}
        position={[0, 2.8, 0]}
      />

      {/* Beacon beacon point light */}
      <pointLight color="#ff7a00" intensity={1.2} distance={8} position={[0, 3.5, 0]} />
    </group>
  );
}

/**
 * Glider: Horizontal Capsule with Small Swept Triangular Wings
 */
export function GliderMesh({ headingDeg = 0, pitchDeg = 0 }) {
  const rotationY = (headingDeg * Math.PI) / 180;
  const rotationX = (pitchDeg * Math.PI) / 180;

  return (
    <group rotation={[rotationX, rotationY, 0]}>
      {/* Horizontal capsule fuselage (rotated so it points forward along Z axis) */}
      <mesh
        geometry={gliderFuselageGeometry}
        material={gliderHullMaterial}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      />

      {/* Right Triangular Swept Wing */}
      <mesh
        geometry={gliderWingGeometry}
        material={gliderWingMaterial}
        position={[0.35, 0, 0.4]}
        rotation={[Math.PI / 2, 0, 0]}
      />

      {/* Left Triangular Swept Wing (Mirrored) */}
      <mesh
        geometry={gliderWingGeometry}
        material={gliderWingMaterial}
        position={[-0.35, 0, 0.4]}
        rotation={[Math.PI / 2, Math.PI, 0]}
      />

      {/* Vertical Stabilizer Tail Fin */}
      <mesh
        geometry={gliderTailGeometry}
        material={gliderWingMaterial}
        position={[0, 0.45, -1.8]}
      />
    </group>
  );
}

/**
 * CTD Rosette: Simple Wireframe Box
 */
export function CtdRosetteMesh() {
  return (
    <group>
      {/* Wireframe box cage */}
      <lineSegments geometry={ctdEdgesGeometry} material={ctdWireframeMaterial} />

      {/* Inner rosette water sampling canister bundle */}
      <mesh geometry={ctdCanisterGeometry} material={ctdCanisterMaterial} />
    </group>
  );
}

/**
 * ============================================================================
 * MAIN COMPONENT: RenderInstrument
 * Dynamically switches primitive shape based on instrument.type
 * ============================================================================
 *
 * @param {Object} props
 * @param {Object} props.instrument - The instrument data object
 * @param {string} props.instrument.type - 'argo' | 'glider' | 'ctd'
 * @param {Array<number>} [props.instrument.position] - [x, y, z] in 3D world space
 * @param {Function} [props.onClick] - Click handler (e.g. open telemetry modal)
 * @param {Function} [props.onPointerOver] - Hover handler
 * @param {Function} [props.onPointerOut] - Unhover handler
 * @param {boolean} [props.isSelected] - Selection highlight state
 */
export function RenderInstrument({
  instrument,
  onClick,
  onPointerOver,
  onPointerOut,
  isSelected = false
}) {
  const groupRef = useRef();

  if (!instrument || !instrument.type) {
    return null;
  }

  const position = instrument.position || [0, 0, 0];
  const type = instrument.type.toLowerCase();

  // Polymorphic primitive selection
  const renderShape = () => {
    switch (type) {
      case 'argo':
        return <ArgoFloatMesh />;

      case 'glider':
        return (
          <GliderMesh
            headingDeg={instrument.headingDeg || 0}
            pitchDeg={instrument.telemetry?.pitchDeg || 0}
          />
        );

      case 'ctd':
        return <CtdRosetteMesh />;

      default:
        console.warn(`[RenderInstrument] Unknown instrument type "${type}". Defaulting to wireframe CTD.`);
        return <CtdRosetteMesh />;
    }
  };

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        if (onClick) onClick(instrument);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
        if (onPointerOver) onPointerOver(instrument);
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto';
        if (onPointerOut) onPointerOut();
      }}
    >
      {renderShape()}

      {/* Selected Indicator Halo */}
      {isSelected && (
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[2.8, 16, 16]} />
          <meshBasicMaterial
            color="#00f0ff"
            wireframe
            transparent
            opacity={0.35}
          />
        </mesh>
      )}
    </group>
  );
}

/**
 * ============================================================================
 * BULK INSTANCING COMPONENT: InstancedInstruments
 * For rendering 100s to 10,000s of instruments with maximum framerate (1 draw call per type)
 * ============================================================================
 */
export function InstancedInstruments({ instruments = [], onSelect }) {
  const { argos, gliders, ctds } = useMemo(() => {
    return {
      argos: instruments.filter((i) => i.type?.toLowerCase() === 'argo'),
      gliders: instruments.filter((i) => i.type?.toLowerCase() === 'glider'),
      ctds: instruments.filter((i) => i.type?.toLowerCase() === 'ctd')
    };
  }, [instruments]);

  const argoRef = useRef();
  const gliderRef = useRef();
  const ctdRef = useRef();

  // Setup matrices for instanced meshes
  React.useEffect(() => {
    const dummy = new THREE.Object3D();

    // 1. Argos
    if (argoRef.current && argos.length > 0) {
      argos.forEach((inst, i) => {
        dummy.position.set(inst.position[0], inst.position[1], inst.position[2]);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        argoRef.current.setMatrixAt(i, dummy.matrix);
      });
      argoRef.current.instanceMatrix.needsUpdate = true;
    }

    // 2. Gliders
    if (gliderRef.current && gliders.length > 0) {
      gliders.forEach((inst, i) => {
        dummy.position.set(inst.position[0], inst.position[1], inst.position[2]);
        dummy.rotation.set(Math.PI / 2, (inst.headingDeg || 0) * (Math.PI / 180), 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        gliderRef.current.setMatrixAt(i, dummy.matrix);
      });
      gliderRef.current.instanceMatrix.needsUpdate = true;
    }

    // 3. CTDs
    if (ctdRef.current && ctds.length > 0) {
      ctds.forEach((inst, i) => {
        dummy.position.set(inst.position[0], inst.position[1], inst.position[2]);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        ctdRef.current.setMatrixAt(i, dummy.matrix);
      });
      ctdRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [argos, gliders, ctds]);

  return (
    <group>
      {/* Instanced Argo Floats (Vertical Cylinders) */}
      {argos.length > 0 && (
        <instancedMesh
          ref={argoRef}
          args={[argoHullGeometry, argoHullMaterial, argos.length]}
          castShadow
        />
      )}

      {/* Instanced Gliders (Horizontal Capsules) */}
      {gliders.length > 0 && (
        <instancedMesh
          ref={gliderRef}
          args={[gliderFuselageGeometry, gliderHullMaterial, gliders.length]}
          castShadow
        />
      )}

      {/* Instanced CTD Rosettes (Wireframe Boxes) */}
      {ctds.length > 0 && (
        <instancedMesh
          ref={ctdRef}
          args={[
            ctdBoxGeometry,
            new THREE.MeshBasicMaterial({ color: 0x00e5ff, wireframe: true }),
            ctds.length
          ]}
        />
      )}
    </group>
  );
}

/**
 * ============================================================================
 * 5. GLIDER SAWTOOTH TRAJECTORY TRAIL COMPONENT (React Three Fiber)
 * ============================================================================
 * Renders an undulating 3D polyline ribbon trailing behind an autonomous glider
 * to visually depict its V/W dive & climb cycle history in the water column.
 */
export function GliderSawtoothTrail({
  color = '#00f0ff',
  cycles = 4,
  wavelength = 6.0,
  diveAmplitude = 2.4,
  ribbonWidth = 0.28,
  segments = 60,
  heading = [1, 0],
}) {
  const meshRef = useRef();

  const { ribbonGeometry, linePoints } = useMemo(() => {
    const totalLength = cycles * wavelength;
    const spinePoints = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const distBehind = t * totalLength;
      const phase = t * cycles * Math.PI * 2;
      const yOffset = -Math.sin(phase) * diveAmplitude;
      const px = -heading[0] * distBehind;
      const pz = -heading[1] * distBehind;
      const py = yOffset;
      spinePoints.push(new THREE.Vector3(px, py, pz));
    }

    const geo = new THREE.BufferGeometry();
    const posArr = [];
    const colorArr = [];
    const uvArr = [];
    const baseColor = new THREE.Color(color);
    const normX = -heading[1];
    const normZ = heading[0];

    for (let i = 0; i < spinePoints.length; i++) {
      const pt = spinePoints[i];
      const t = i / (spinePoints.length - 1);
      const fade = Math.pow(1.0 - t, 1.4);
      const r = baseColor.r * (0.4 + fade * 0.6);
      const g = baseColor.g * (0.4 + fade * 0.6);
      const b = baseColor.b * (0.4 + fade * 0.6);
      const halfW = ribbonWidth * (0.6 + fade * 0.4);

      posArr.push(pt.x + normX * halfW, pt.y, pt.z + normZ * halfW);
      colorArr.push(r, g, b);
      uvArr.push(0, t);

      posArr.push(pt.x - normX * halfW, pt.y, pt.z - normZ * halfW);
      colorArr.push(r, g, b);
      uvArr.push(1, t);
    }

    const indices = [];
    for (let i = 0; i < spinePoints.length - 1; i++) {
      const v0 = i * 2;
      const v1 = i * 2 + 1;
      const v2 = (i + 1) * 2;
      const v3 = (i + 1) * 2 + 1;
      indices.push(v0, v1, v2);
      indices.push(v2, v1, v3);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colorArr, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return { ribbonGeometry: geo, linePoints: spinePoints };
  }, [color, cycles, wavelength, diveAmplitude, ribbonWidth, segments, heading]);

  return (
    <group>
      {/* 3D Glowing Ribbon Mesh */}
      <mesh ref={meshRef} geometry={ribbonGeometry}>
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.72}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Center High-Intensity Spine Polyline */}
      <line>
        <bufferGeometry attach="geometry" {...new THREE.BufferGeometry().setFromPoints(linePoints)} />
        <lineBasicMaterial color={color} transparent opacity={0.88} blending={THREE.AdditiveBlending} />
      </line>
    </group>
  );
}

/**
 * ============================================================================
 * 6. CURRENT VECTOR PARTICLE STREAM COMPONENT (React Three Fiber)
 * ============================================================================
 * Visualizes horizontal ocean current velocity (0.42 m/s -> NE) around floats
 * using a single, lightweight GPU instanced mesh with wrapping boundaries.
 */
export function CurrentVectorStream({
  count = 200,
  speed = 0.42,
  headingDeg = 45,
  color = '#00f0ff',
  bounds = { minX: -30, maxX: 30, minY: -60, maxY: -2, minZ: -30, maxZ: 30 },
}) {
  const instRef = useRef();
  const rad = (headingDeg * Math.PI) / 180;
  const dirX = Math.sin(rad);
  const dirZ = -Math.cos(rad);
  const yawAngle = Math.atan2(dirX, -dirZ);

  const { particles, coneGeo } = useMemo(() => {
    const geo = new THREE.ConeGeometry(0.065, 1.35, 6);
    geo.rotateX(Math.PI / 2);

    const pts = [];
    for (let i = 0; i < count; i++) {
      const yRatio = Math.pow(Math.random(), 1.6);
      const y = bounds.maxY - yRatio * (bounds.maxY - bounds.minY);
      const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      const z = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
      const depthShear = Math.max(0.35, 1.0 - Math.abs(y) / 70.0);
      const vSpeed = (0.035 + Math.random() * 0.03) * (speed / 0.42) * depthShear;
      pts.push({ x, y, z, speed: vSpeed });
    }
    return { particles: pts, coneGeo: geo };
  }, [count, speed, bounds]);

  return (
    <instancedMesh
      ref={instRef}
      args={[coneGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), count]}
    />
  );
}

/**
 * ============================================================================
 * 7. MODEL VS. OBSERVATION DELTA BADGE COMPONENT (React UI)
 * ============================================================================
 * Glassmorphic UI badge comparing observed in-situ instrument data with
 * numerical ocean circulation model predictions (O - B residuals).
 */
export function ModelVsObsDeltaBadge({
  modelValidation = {
    modelName: 'INCOIS-ROMS 1/12°',
    deltaTempC: +0.30,
    deltaSalPSU: -0.10,
    obsTemp: 28.3,
    modelTemp: 28.0,
    obsSal: 34.3,
    modelSal: 34.4,
    status: 'OPTIMAL AGREEMENT',
    confidenceScore: '98.4%',
    biasRating: 'LOW BIAS',
  },
}) {
  const {
    modelName,
    deltaTempC,
    deltaSalPSU,
    obsTemp,
    modelTemp,
    obsSal,
    modelSal,
    status,
    confidenceScore,
    biasRating,
  } = modelValidation;

  return (
    <div
      style={{
        background: 'rgba(4, 18, 38, 0.65)',
        border: '1px solid rgba(0, 229, 255, 0.22)',
        borderRadius: '12px',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        fontFamily: "'Inter', sans-serif",
        backdropFilter: 'blur(8px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#67e8f9', textTransform: 'uppercase' }}>
          🤖 Model vs. Obs Validation
        </span>
        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: '0.62rem',
            fontWeight: 700,
            background: 'rgba(6, 182, 212, 0.18)',
            color: '#22d3ee',
            border: '1px solid rgba(34, 211, 238, 0.35)',
            borderRadius: '10px',
            padding: '2px 8px',
          }}
        >
          {modelName}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {/* Delta Temp */}
        <div
          style={{
            background: 'rgba(2, 10, 22, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            padding: '6px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.74rem', fontWeight: 700, color: '#94a3b8' }}>
              ΔT
            </span>
            <span style={{ fontSize: '0.58rem', color: '#64748b' }}>T_obs - T_model</span>
          </div>
          <div
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: '0.88rem',
              fontWeight: 700,
              color: deltaTempC >= 0 ? '#10b981' : '#38bdf8',
            }}
          >
            {deltaTempC >= 0 ? `+${deltaTempC.toFixed(2)}` : deltaTempC.toFixed(2)} °C
          </div>
          <div style={{ fontSize: '0.60rem', color: '#8dafcb' }}>
            Obs: {obsTemp}°C · Model: {modelTemp}°C
          </div>
          <span
            style={{
              alignSelf: 'flex-start',
              fontSize: '0.54rem',
              fontWeight: 700,
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(52, 211, 153, 0.3)',
              borderRadius: '4px',
              padding: '1px 5px',
            }}
          >
            {biasRating || 'ACCURATE'}
          </span>
        </div>

        {/* Delta Salinity */}
        <div
          style={{
            background: 'rgba(2, 10, 22, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            padding: '6px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.74rem', fontWeight: 700, color: '#94a3b8' }}>
              ΔS
            </span>
            <span style={{ fontSize: '0.58rem', color: '#64748b' }}>S_obs - S_model</span>
          </div>
          <div
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: '0.88rem',
              fontWeight: 700,
              color: deltaSalPSU >= 0 ? '#10b981' : '#38bdf8',
            }}
          >
            {deltaSalPSU >= 0 ? `+${deltaSalPSU.toFixed(2)}` : deltaSalPSU.toFixed(2)} PSU
          </div>
          <div style={{ fontSize: '0.60rem', color: '#8dafcb' }}>
            Obs: {obsSal} PSU · Model: {modelSal} PSU
          </div>
          <span
            style={{
              alignSelf: 'flex-start',
              fontSize: '0.54rem',
              fontWeight: 700,
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '4px',
              padding: '1px 5px',
            }}
          >
            HIGH FIDELITY
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '0.66rem',
          color: '#7dd3fc',
          background: 'rgba(14, 165, 233, 0.09)',
          border: '1px solid rgba(14, 165, 233, 0.22)',
          borderRadius: '6px',
          padding: '4px 8px',
        }}
      >
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#10b981',
            boxShadow: '0 0 8px #10b981',
            flexShrink: 0,
          }}
        />
        <span>{status} ({confidenceScore})</span>
      </div>
    </div>
  );
}

export default RenderInstrument;

