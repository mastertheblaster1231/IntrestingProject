import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useOceanStore } from './useOceanStore.js';

/**
 * GliderModel.jsx — 3D Autonomous Slocum Glider Component (R3F)
 * ============================================================================
 * Task 3: Subscribes strictly to Glider's isolated depth & transect distance.
 *
 * Requirements:
 * - const { depth, transectDistance } = useOceanStore((state) => state.instruments['glider-slocum-04']);
 * - Vertical (Y): -depth * depthScaleFactor (moves it down into the bathymetry)
 * - Horizontal (X): (transectDistance - 25) * horizontalScaleFactor (glides forward/backward along sawtooth line)
 * - Dynamic Pitch (Z-rotation):
 *     When depth increases (diving)   -> tilt nose down (-15° dive)
 *     When depth decreases (climbing) -> tilt nose up (+15° climb)
 */
export function GliderModel({
  basePosition = [7.2, -4.5, -3.0],
  scale = 1.0,
  depthScaleFactor = 0.0225, // 0 to 4000m maps to 0 to -90 scene units
  horizontalScaleFactor = 0.65, // 0 to 50 km maps along transect
}) {
  const meshRef = useRef();
  const prevDepthRef = useRef(190);

  // 1. Subscribe strictly to Glider's independent Zustand coordinates
  const { depth = 190, transectDistance = 25 } = useOceanStore(
    (state) => state.instruments['glider-slocum-04'] || { depth: 190, transectDistance: 25 }
  );
  const activeInstrument = useOceanStore((state) => state.activeInstrument);
  const isGliderSelected = activeInstrument?.id === 'glider-slocum-04' || activeInstrument?.type === 'glider';

  // 2. Procedural Swept Wing Geometry
  const sweptWingGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.6);
    shape.lineTo(2.6, -1.8);
    shape.lineTo(2.4, -2.1);
    shape.lineTo(0, -1.4);
    shape.closePath();

    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.08,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.02,
      bevelThickness: 0.02,
    });
  }, []);

  // 3. Procedural Vertical Tail Fin Geometry
  const tailFinGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0, 1.2);
    shape.lineTo(-0.8, 0.3);
    shape.lineTo(-0.8, 0);
    shape.closePath();

    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.06,
      bevelEnabled: false,
    });
  }, []);

  // 4. Per-Frame Dual-Axis Interpolation & Dynamic Hydrodynamic Pitch
  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // Vertical (Y): -depth * depthScaleFactor (moves it down into the bathymetry)
    const targetY = -depth * depthScaleFactor;

    // Horizontal (X): (transectDistance - 25) * horizontalScaleFactor
    const targetX = basePosition[0] + (transectDistance - 25) * horizontalScaleFactor;
    const targetZ = basePosition[2] + (transectDistance - 25) * 0.25;

    // Dampened per-frame lerp rate for silky 60 FPS gliding
    const lerpRate = Math.min(1.0, delta * 5.0);

    // Smooth Dual-Axis Position Lerp
    meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, targetY, lerpRate);
    meshRef.current.position.x = THREE.MathUtils.lerp(meshRef.current.position.x, targetX, lerpRate);
    meshRef.current.position.z = THREE.MathUtils.lerp(meshRef.current.position.z, targetZ, lerpRate);

    // Dynamic Pitch (Z-rotation):
    // When depth increases -> tilt nose down (-15° = -0.2618 rad)
    // When depth decreases -> tilt nose up (+15° = +0.2618 rad)
    const depthDelta = depth - prevDepthRef.current;
    let targetPitchRad = 0;
    const DEG_15 = (15 * Math.PI) / 180; // 0.261799 rad

    if (depthDelta > 0.3) {
      targetPitchRad = -DEG_15; // -15° dive
    } else if (depthDelta < -0.3) {
      targetPitchRad = DEG_15;  // +15° climb
    }

    // Decay previous depth toward current depth
    prevDepthRef.current = THREE.MathUtils.lerp(prevDepthRef.current, depth, delta * 2.5);

    // Smoothly apply pitch to Z-rotation as requested
    meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, targetPitchRad, delta * 4.5);

    // Subsurface sea-current roll/pitch sway
    meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 1.3) * 0.025;
  });

  // Calculate direct static positions for initial mounting
  const initialY = -depth * depthScaleFactor;
  const initialX = basePosition[0] + (transectDistance - 25) * horizontalScaleFactor;

  return (
    <group
      ref={meshRef}
      position={[initialX, initialY, basePosition[2]]}
      scale={[scale, scale, scale]}
      rotation={[0, THREE.MathUtils.degToRad(35), 0]}
    >
      {/* ── Fuselage: Hydrodynamic Marine Yellow Capsule ─────────────── */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <capsuleGeometry args={[0.55, 3.2, 12, 24]} />
        <meshStandardMaterial
          color={isGliderSelected ? '#ffea00' : '#ffd000'}
          roughness={0.25}
          metalness={0.2}
          emissive={isGliderSelected ? '#332600' : '#1a1400'}
          emissiveIntensity={0.25}
        />
      </mesh>

      {/* ── Right Wing: Swept Hydrodynamic Carbon Fiber ─────────────── */}
      <mesh geometry={sweptWingGeo} position={[0.35, 0, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial
          color="#0f172a"
          roughness={0.35}
          metalness={0.65}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* ── Left Wing: Mirrored Sweep ────────────────────────────────── */}
      <mesh geometry={sweptWingGeo} position={[-0.35, 0, 0.4]} rotation={[Math.PI / 2, Math.PI, 0]}>
        <meshStandardMaterial
          color="#0f172a"
          roughness={0.35}
          metalness={0.65}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* ── Vertical Stabilizer Tail Fin ────────────────────────────── */}
      <mesh geometry={tailFinGeo} position={[0, 0.45, -1.8]}>
        <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.5} />
      </mesh>

      {/* ── Telemetry Antenna & Sensor Mast ─────────────────────────── */}
      <mesh position={[0, 0.55, -1.2]}>
        <cylinderGeometry args={[0.02, 0.02, 0.8, 8]} />
        <meshStandardMaterial color="#38bdf8" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* ── Active Optical Strobe Beacon ─────────────────────────────── */}
      <mesh position={[0, 0.95, -1.2]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshBasicMaterial color={isGliderSelected ? '#00f0ff' : '#fbbf24'} />
      </mesh>

      {/* ── Visual Selection Aura when Glider is Active ─────────────── */}
      {isGliderSelected && (
        <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.8, 1.95, 32]} />
          <meshBasicMaterial color="#fbbf24" side={THREE.DoubleSide} transparent opacity={0.65} />
        </mesh>
      )}
    </group>
  );
}

export default GliderModel;
