import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useComparisonStore } from './useComparisonStore.js';

export function ComparisonArgoFloat({
  panelId,
  basePosition = [0.0, -0.2, 1.5],
  scale = 1.0,
  depthScaleFactor = 0.0225,
}) {
  const meshRef = useRef();

  // Subscribe ONLY to this specific panel's depth in Zustand
  const argoDepth = useComparisonStore((state) => state.regionData[panelId]?.depth ?? 15);

  const { hullGeo, capGeo, antennaGeo, hullMat, capMat, antennaMat } = useMemo(() => {
    return {
      hullGeo: new THREE.CylinderGeometry(0.35, 0.35, 3.8, 24),
      capGeo: new THREE.CylinderGeometry(0.38, 0.38, 0.5, 24),
      antennaGeo: new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8),
      hullMat: new THREE.MeshStandardMaterial({
        color: 0xff7a00,
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

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const targetY = basePosition[1] - argoDepth * depthScaleFactor;
    const lerpRate = Math.min(1.0, delta * 4.0);

    meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, targetY, lerpRate);
    meshRef.current.position.x = basePosition[0];
    meshRef.current.position.z = basePosition[2];

    const surfaceInfluence = Math.max(0.0, 1.0 - (argoDepth / 120.0));
    const bobbing = Math.sin(state.clock.elapsedTime * 1.8) * 0.12 * surfaceInfluence;
    const waveTilt = Math.cos(state.clock.elapsedTime * 1.4) * 0.06 * surfaceInfluence;

    meshRef.current.position.y += bobbing;
    meshRef.current.rotation.z = waveTilt;
    meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 1.1) * 0.04 * surfaceInfluence;
    meshRef.current.rotation.y += delta * 0.12;
  });

  return (
    <group
      ref={meshRef}
      position={[basePosition[0], basePosition[1] - argoDepth * depthScaleFactor, basePosition[2]]}
      scale={[scale, scale, scale]}
    >
      <mesh geometry={hullGeo} material={hullMat} castShadow />
      <mesh geometry={capGeo} material={capMat} position={[0, 1.9, 0]} />
      <mesh geometry={antennaGeo} material={antennaMat} position={[0, 2.8, 0]} />
      <pointLight color="#ff7a00" intensity={2.0} distance={10} position={[0, 3.5, 0]} />
      <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.5, 1.65, 32]} />
        <meshBasicMaterial color="#00f0ff" side={THREE.DoubleSide} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

export default ComparisonArgoFloat;
