import React, { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';
import { useOceanStore } from './useOceanStore.js';
import { InfoCircle } from './components/InfoCircle.jsx';

/**
 * OceanCanvas.jsx — 3D Ocean Data Visualization Canvas Component.
 * Demonstrates:
 * 1. Subscribing to `verticalExaggeration` to scale Three.js bathymetry/meshes [1, y, 1].
 * 2. Subscribing to `activeInstrumentDepth` & `activeInstrumentHorizontal`.
 * 3. In-Canvas dual-slider scrubber (Vertical Depth Scroll + Glider Horizontal Distance).
 */
export function OceanCanvas({ instruments = [] }) {
  const containerRef = useRef(null);
  const depthSliceMeshRef = useRef(null);
  const bathymetryGroupRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);

  // Zustand State Subscriptions
  const currentDepth = useOceanStore((state) => state.modelControls.currentDepth);
  const opacity = useOceanStore((state) => state.modelControls.opacity);
  const activeVariable = useOceanStore((state) => state.modelControls.activeVariable);
  const verticalExaggeration = useOceanStore((state) => state.visualization.verticalExaggeration);
  const showDepthSlice = useOceanStore((state) => state.visualization.showDepthSlice);
  const showArgo = useOceanStore((state) => state.dataLayers.showArgo);
  const setCurrentDepth = useOceanStore((state) => state.setCurrentDepth);
  const fetchAndSetInstrument = useOceanStore((state) => state.fetchAndSetInstrument);
  const activeInstrument = useOceanStore((state) => state.activeInstrument);
  const activeInstrumentId = activeInstrument?.id || 'argo-2902351';
  const depth = useOceanStore((state) => state.instruments[activeInstrumentId]?.depth ?? state.activeInstrumentDepth ?? 0);
  const transectDistance = useOceanStore(
    (state) => state.instruments['glider-slocum-04']?.transectDistance ?? state.activeInstrumentHorizontal ?? 25
  );
  const setActiveInstrumentDepth = useOceanStore((state) => state.setActiveInstrumentDepth);
  const setActiveInstrumentTransect = useOceanStore((state) => state.setActiveInstrumentTransect);
  const setActiveInstrumentHorizontal = useOceanStore((state) => state.setActiveInstrumentHorizontal);

  // ─────────────────────────────────────────────────────────────
  // 1. Synchronize Depth Slice Mesh Position with currentDepth
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (depthSliceMeshRef.current) {
      const maxSceneDepth = 95.0;
      const targetY = - (currentDepth / 4000.0) * maxSceneDepth * verticalExaggeration;
      depthSliceMeshRef.current.position.y = targetY;
      depthSliceMeshRef.current.visible = showDepthSlice;
      if (depthSliceMeshRef.current.material) {
        depthSliceMeshRef.current.material.opacity = opacity;
      }
    }
  }, [currentDepth, verticalExaggeration, showDepthSlice, opacity]);

  // ─────────────────────────────────────────────────────────────
  // 2. Synchronize Bathymetry Mesh Scale with verticalExaggeration [1, y, 1]
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (bathymetryGroupRef.current) {
      bathymetryGroupRef.current.scale.set(1.0, verticalExaggeration, 1.0);
    }
  }, [verticalExaggeration]);

  // ─────────────────────────────────────────────────────────────
  // 3. Float Mesh Click: Ingest ERDDAP + GSAP Camera Transition
  // ─────────────────────────────────────────────────────────────
  const handleArgoFloatClick = useCallback((instrument) => {
    if (!instrument) return;

    fetchAndSetInstrument(instrument.id || instrument.floatId);

    const targetX = instrument.position ? instrument.position[0] : 0;
    const targetY = instrument.position ? instrument.position[1] : -0.2;
    const targetZ = instrument.position ? instrument.position[2] : 1.5;

    const camera = cameraRef.current || (window.__oceanRenderer && window.__oceanRenderer.camera);
    const controls = controlsRef.current || window.controls;

    if (camera && controls) {
      gsap.to(controls.target, {
        x: targetX,
        y: targetY,
        z: targetZ,
        duration: 1.4,
        ease: 'power3.inOut',
      });

      gsap.to(camera.position, {
        x: targetX + 4.0,
        y: targetY + 3.2,
        z: targetZ + 6.0,
        duration: 1.6,
        ease: 'power3.inOut',
        onUpdate: () => controls.update(),
      });
    }

    if (window.focusInstrument) {
      window.focusInstrument(instrument.id);
    }
  }, [fetchAndSetInstrument]);

  // ─────────────────────────────────────────────────────────────
  // 3b. Task 3: Smooth Camera Interpolation (Lerp) on activeInstrument change
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeInstrument) return;

    const camera = cameraRef.current || (window.__oceanRenderer && window.__oceanRenderer.camera) || window.camera;
    const controls = controlsRef.current || window.controls;
    if (!camera || !controls) return;

    const pos = activeInstrument.position || [0, -0.2, 1.5];
    const targetX = pos[0];
    const targetY = pos[1];
    const targetZ = pos[2];

    const targetLookAt = new THREE.Vector3(targetX, targetY, targetZ);
    const targetCamPos = new THREE.Vector3(targetX + 3.8, targetY + 2.2, targetZ + 5.2);

    if (typeof gsap !== 'undefined' && gsap.to) {
      gsap.to(controls.target, {
        x: targetLookAt.x,
        y: targetLookAt.y,
        z: targetLookAt.z,
        duration: 1.3,
        ease: 'power2.out',
      });
      gsap.to(camera.position, {
        x: targetCamPos.x,
        y: targetCamPos.y,
        z: targetCamPos.z,
        duration: 1.5,
        ease: 'power2.out',
        onUpdate: () => controls.update(),
      });
    } else {
      let frameId;
      let ticks = 0;
      const lerpStep = () => {
        ticks += 1;
        controls.target.lerp(targetLookAt, 0.05);
        camera.position.lerp(targetCamPos, 0.05);
        controls.update();

        if (camera.position.distanceTo(targetCamPos) > 0.02 && ticks < 90) {
          frameId = requestAnimationFrame(lerpStep);
        } else {
          controls.target.copy(targetLookAt);
          camera.position.copy(targetCamPos);
          controls.update();
        }
      };
      frameId = requestAnimationFrame(lerpStep);
      return () => cancelAnimationFrame(frameId);
    }
  }, [activeInstrument]);

  // ─────────────────────────────────────────────────────────────
  // 4. Mount Three.js Canvas into Ref
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (containerRef.current) {
      window.oceanCanvasContainer = containerRef.current;

      const existingCanvas = window.__oceanRenderer
        ? window.__oceanRenderer.domElement
        : document.querySelector('body > canvas');

      if (existingCanvas && existingCanvas.parentElement !== containerRef.current) {
        containerRef.current.appendChild(existingCanvas);
      }

      const ro = new ResizeObserver(() => {
        window.dispatchEvent(new Event('resize'));
      });
      ro.observe(containerRef.current);

      return () => ro.disconnect();
    }
  }, []);

  return (
    <div className="canvas-panel" ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Center Canvas Info Badge */}
      <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 20 }}>
        <InfoCircle
          title="4. 3D Canvas & Depth Scrubber"
          whatItDoes="Orbital Dive: Clicking an instrument pin locks the Three.js OrbitControls target to that pin's coordinates and smoothly animates the camera downward. In-Canvas Scrubber: Dual-axis control for depth and glider transect distance."
          futureApiUse="Stream real-time 3D NetCDF isosurfaces and dynamic bathymetric terrain directly on WebGL shader pipelines."
          position="bottom"
          badgeText="ⓘ 3D Scene Info"
        />
      </div>

      {/* In-Canvas Vertical Depth & Glider Horizontal Scrubber */}
      <div className="in-canvas-scrubber" style={{
        position: 'absolute',
        left: 14,
        top: 50,
        bottom: 56,
        width: 120,
        background: 'rgba(6, 18, 38, 0.78)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(0, 229, 255, 0.3)',
        borderRadius: 14,
        padding: '10px 8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 15,
        userSelect: 'none',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.58rem', color: 'var(--accent-cyan-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
            Depth Scroll
          </div>
          <div className="text-mono" style={{ fontSize: '0.86rem', color: '#00f0ff', fontWeight: 800 }}>
            {Math.round(depth)} m
          </div>
        </div>

        {/* Vertical Track Range Slider */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 0' }}>
          <input
            type="range"
            min="0"
            max="4000"
            step="25"
            value={depth}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 0;
              setActiveInstrumentDepth(val);
              setCurrentDepth(val);
            }}
            style={{
              writingMode: 'bt-lr',
              WebkitAppearance: 'slider-vertical',
              height: '100%',
              width: 8,
              accentColor: 'var(--accent-cyan)',
              cursor: 'pointer',
            }}
            title="Depth Scroll Slider (All Instruments)"
          />
        </div>

        <div style={{ textAlign: 'center', fontSize: '0.54rem', color: '#64748b', marginBottom: activeInstrument?.type === 'glider' ? 8 : 0 }}>
          Abyss (4000m)
        </div>

        {/* Conditional Render: Horizontal Distance Slider strictly for Autonomous Gliders */}
        {activeInstrument?.type === 'glider' && (
          <div style={{
            width: '100%',
            paddingTop: 8,
            borderTop: '1px dashed rgba(251, 191, 36, 0.4)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
          }}>
            <div style={{ fontSize: '0.55rem', color: '#fbbf24', textTransform: 'uppercase', fontWeight: 700 }}>
              ✈️ Glider Dist
            </div>
            <div className="text-mono" style={{ fontSize: '0.74rem', color: '#fbbf24', fontWeight: 800 }}>
              {Number(transectDistance).toFixed(1)} km
            </div>
            <input
              type="range"
              min="0"
              max="50"
              step="0.5"
              value={transectDistance}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                if (setActiveInstrumentTransect) setActiveInstrumentTransect(val);
                else if (setActiveInstrumentHorizontal) setActiveInstrumentHorizontal(val);
              }}
              style={{
                width: '100%',
                accentColor: '#fbbf24',
                cursor: 'pointer',
              }}
              title="Horizontal Transect Distance (Glider Only)"
            />
          </div>
        )}
      </div>

      {/* Floating Demo Float Pin Buttons for Direct Interaction */}
      <div style={{
        position: 'absolute',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 8,
        zIndex: 15,
      }}>
        {showArgo && (
          <button
            className={`nav-step-btn ${activeInstrument?.floatId === '2902351' ? 'nav-view-tab--active' : ''}`}
            onClick={() => handleArgoFloatClick({ id: 'argo-2902351', floatId: '2902351', position: [0, -0.2, 1.5] })}
            style={{ fontSize: '0.66rem', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <span>🟠</span>
            <span>Argo 2902351 (Dive)</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default OceanCanvas;

/**
 * InstrumentCameraController — Production R3F Camera Lerp Component
 * ============================================================================
 * Drop-in for React-Three-Fiber <Canvas> or vanilla Three.js rigs.
 *
 * Implements smooth 60-frame camera interpolation utilizing THREE.Vector3().lerp():
 * - Glides camera.position smoothly to the new instrument's X/Z and Y-depth
 * - Glides controls.target (or lookAt) to the instrument pivot
 * - Eliminates instant cut/teleportation and WebGL frame drops/stutter
 *
 * Usage inside R3F <Canvas>:
 *   <Canvas>
 *     <InstrumentCameraController frames={60} />
 *     ...
 *   </Canvas>
 */
export function InstrumentCameraController({ offset = [3.8, 2.2, 5.2], frames = 60 }) {
  const activeInstrument = useOceanStore((state) => state.activeInstrument);
  const targetPosition = useRef(new THREE.Vector3(3.8, 2.2, 5.2));
  const targetLookAt = useRef(new THREE.Vector3(0, -0.2, 1.5));
  const isTransitioning = useRef(false);
  const frameCount = useRef(0);

  useEffect(() => {
    if (!activeInstrument) return;

    const x = activeInstrument.x ?? (activeInstrument.position ? activeInstrument.position[0] : 0);
    const y = activeInstrument.y ?? (activeInstrument.position ? activeInstrument.position[1] : -0.2);
    const z = activeInstrument.z ?? (activeInstrument.position ? activeInstrument.position[2] : 1.5);

    targetLookAt.current.set(x, y, z);
    targetPosition.current.set(x + offset[0], y + offset[1], z + offset[2]);

    isTransitioning.current = true;
    frameCount.current = 0;
  }, [activeInstrument, offset]);

  // Smooth frame interpolation loop (60 frames, alpha = 0.05)
  useEffect(() => {
    let frameId;
    const lerpFrame = () => {
      if (isTransitioning.current) {
        const camera = window.camera || (window.__oceanRenderer && window.__oceanRenderer.camera);
        const controls = window.controls;

        if (camera) {
          camera.position.lerp(targetPosition.current, 0.05);

          if (controls && controls.target) {
            controls.target.lerp(targetLookAt.current, 0.05);
            controls.update();
          } else {
            camera.lookAt(targetLookAt.current);
          }

          frameCount.current += 1;

          if (
            camera.position.distanceTo(targetPosition.current) < 0.01 ||
            frameCount.current >= frames
          ) {
            camera.position.copy(targetPosition.current);
            if (controls && controls.target) {
              controls.target.copy(targetLookAt.current);
            }
            isTransitioning.current = false;
          }
        }
      }
      frameId = requestAnimationFrame(lerpFrame);
    };

    frameId = requestAnimationFrame(lerpFrame);
    return () => cancelAnimationFrame(frameId);
  }, [frames]);

  return null;
}

export const SmoothInstrumentCamera = InstrumentCameraController;
