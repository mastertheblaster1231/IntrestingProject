import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useOceanStore } from './useOceanStore.js';

/**
 * ArgoFloat.jsx — 3D APEX Profiling Float Component (R3F)
 * ============================================================================
 * Task 2: Fix ArgoFloat (Stop Moving When Not Selected)
 *
 * Strict Isolation:
 * - Reads ONLY its own depth: state.instruments['argo-2902351'].depth
 * - Converts depth to 3D units: -argoDepth * depthScaleFactor
 * - NEVER listens to the active instrument depth slider when Glider or CTD is selected.
 */
export function ArgoFloat({
  basePosition = [0.0, -0.2, 1.5],
  scale = 1.0,
  depthScaleFactor = 0.0225, // Maps 0-4000m to 0 to -90 scene units
}) {
  const meshRef = useRef();

  // 1. Subscribe ONLY to Argo's own independent coordinates in Zustand
  const argoDepth = useOceanStore((state) => state.instruments['argo-2902351']?.depth ?? 15);
  const activeInstrument = useOceanStore((state) => state.activeInstrument);
  const isSelected = activeInstrument?.id === 'argo-2902351';

  // 2. High-precision procedural APEX Float Geometries & Materials
  const { hullGeo, capGeo, antennaGeo, hullMat, capMat, antennaMat } = useMemo(() => {
    return {
      hullGeo: new THREE.CylinderGeometry(0.35, 0.35, 3.8, 24),
      capGeo: new THREE.CylinderGeometry(0.38, 0.38, 0.5, 24),
      antennaGeo: new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8),
      hullMat: new THREE.MeshStandardMaterial({
        color: 0xff7a00, // International oceanographic orange
        roughness: 0.35,
        metalness: 0.25,
        emissive: 0x331400,
        emissiveIntensity: 0.2,
      }),
      capMat: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.2,
        metalness: 0.8,
      }),
      antennaMat: new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
      }),
    };
  }, []);

  // 3. Smooth Per-Frame Positioning & Surface Hydrodynamics
  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // Convert depth to 3D units (negative for underwater descent)
    const targetY = basePosition[1] - argoDepth * depthScaleFactor;
    const lerpRate = Math.min(1.0, delta * 4.0);

    // Smooth vertical position interpolation
    meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, targetY, lerpRate);
    meshRef.current.position.x = basePosition[0];
    meshRef.current.position.z = basePosition[2];

    // Surface wave bobbing attenuates as float submerges beneath 100m
    const surfaceInfluence = Math.max(0.0, 1.0 - (argoDepth / 120.0));
    const bobbing = Math.sin(state.clock.elapsedTime * 1.8) * 0.12 * surfaceInfluence;
    const waveTilt = Math.cos(state.clock.elapsedTime * 1.4) * 0.06 * surfaceInfluence;

    meshRef.current.position.y += bobbing;
    meshRef.current.rotation.z = waveTilt;
    meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 1.1) * 0.04 * surfaceInfluence;

    // Gentle slow yaw drift in ocean current
    meshRef.current.rotation.y += delta * 0.12;
  });

  return (
    <group
      ref={meshRef}
      position={[basePosition[0], basePosition[1] - argoDepth * depthScaleFactor, basePosition[2]]}
      scale={[scale, scale, scale]}
    >
      {/* ── Main Pressure Hull Cylinder ─────────────────────────────── */}
      <mesh geometry={hullGeo} material={hullMat} castShadow />

      {/* ── Top CTD Sensor Head / Buoyancy Collar ────────────────────── */}
      <mesh geometry={capGeo} material={capMat} position={[0, 1.9, 0]} />

      {/* ── Vertical Telemetry Antenna ───────────────────────────────── */}
      <mesh geometry={antennaGeo} material={antennaMat} position={[0, 2.8, 0]} />

      {/* ── Active Optical Strobe Beacon ─────────────────────────────── */}
      <pointLight color="#ff7a00" intensity={isSelected ? 2.2 : 1.2} distance={8} position={[0, 3.5, 0]} />

      {/* ── Selection Ring Halo when Selected ───────────────────────── */}
      {isSelected && (
        <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.5, 1.65, 32]} />
          <meshBasicMaterial color="#00f0ff" side={THREE.DoubleSide} transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}

export default ArgoFloat;
