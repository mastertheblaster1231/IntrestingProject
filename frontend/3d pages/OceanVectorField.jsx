import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

export function OceanVectorField() {
  const { scene } = useThree();
  const meshRef = useRef(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const velocityData = useRef(null);

  // Fetch Real-Time Data
  useEffect(() => {
    const fetchCurrents = async () => {
      try {
        // Mocking a backend API call as requested
        // In reality, this would be an API call to a NetCDF/ERDDAP backend
        const count = 10000;
        const u = new Float32Array(count);
        const v = new Float32Array(count);
        
        for (let i = 0; i < count; i++) {
          u[i] = (Math.random() - 0.5) * 2;
          v[i] = (Math.random() - 0.5) * 2;
        }

        const data = { u, v };
        console.log("Vector field data loaded:", data);
        velocityData.current = data;
        setDataLoaded(true);
      } catch (err) {
        console.error("Failed to fetch vector field data", err);
      }
    };
    
    fetchCurrents();
  }, []);

  // Initialize the 3D Particle System (InstancedMesh)
  useEffect(() => {
    if (!dataLoaded || !scene) return;

    const count = 10000;
    // Elongated cone geometry to look like a directional streak
    const geometry = new THREE.ConeGeometry(0.015, 0.1, 4);
    geometry.rotateX(Math.PI / 2); // Align cone to point along the Z-axis
    
    const material = new THREE.MeshBasicMaterial({ 
      color: 0x00ffcc, 
      transparent: true, 
      opacity: 0.7 
    });

    const mesh = new THREE.InstancedMesh(geometry, material, count);
    meshRef.current = mesh;

    // Initialization of particle states
    const dummy = new THREE.Object3D();
    const ages = new Float32Array(count);
    const lifespans = new Float32Array(count);

    // Map bounds (assume standard globe radius around 1.5 in World.js)
    const radius = 1.51; 
    
    for (let i = 0; i < count; i++) {
      // Random lat/lon mapping onto a sphere
      const phi = Math.acos(-1 + (2 * i) / count);
      const theta = Math.sqrt(count * Math.PI) * phi;

      const x = radius * Math.cos(theta) * Math.sin(phi);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(theta) * Math.sin(phi);

      dummy.position.set(x, y, z);
      dummy.lookAt(new THREE.Vector3(0, 0, 0)); // Point outwards
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Randomize age and lifespan to prevent clumping
      ages[i] = Math.random() * 100;
      lifespans[i] = 100 + Math.random() * 50;
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData = { ages, lifespans, dummy, radius };

    // Prevent frustum culling issues with instanced mesh on a globe
    mesh.frustumCulled = false;

    // Add to vanilla Three.js scene
    scene.add(mesh);

    // Cleanup: Completely unmount and free GPU resources
    return () => {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      mesh.dispose();
      meshRef.current = null;
    };
  }, [dataLoaded, scene]);

  // Animation Logic
  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !velocityData.current) return;

    const { ages, lifespans, dummy, radius } = mesh.userData;
    const count = mesh.count;
    const { u, v } = velocityData.current;

    for (let i = 0; i < count; i++) {
      mesh.getMatrixAt(i, dummy.matrix);
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

      // Extract raw U/V (simplified mapping for demonstration)
      const vx = u[i] * 0.1;
      const vy = v[i] * 0.1;

      // Calculate movement along the surface tangent
      const normal = dummy.position.clone().normalize();
      
      // Simple tangent projection (approximate East/North movement)
      const north = new THREE.Vector3(0, 1, 0).projectOnPlane(normal).normalize();
      const east = new THREE.Vector3().crossVectors(north, normal).normalize();
      
      const velocity = new THREE.Vector3()
        .addScaledVector(east, vx)
        .addScaledVector(north, vy);

      // Move particle
      dummy.position.addScaledVector(velocity, delta);
      
      // Snap back to sphere radius
      dummy.position.normalize().multiplyScalar(radius);

      // Orient the particle to point in the direction of the flow
      const lookTarget = dummy.position.clone().add(velocity);
      dummy.lookAt(lookTarget);

      // Age management
      ages[i] += delta * 60;
      if (ages[i] > lifespans[i]) {
        // Reset particle to a new random location
        const phi = Math.random() * Math.PI;
        const theta = Math.random() * 2 * Math.PI;
        dummy.position.set(
          radius * Math.cos(theta) * Math.sin(phi),
          radius * Math.cos(phi),
          radius * Math.sin(theta) * Math.sin(phi)
        );
        ages[i] = 0;
      }

      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return null;
}

export default OceanVectorField;
