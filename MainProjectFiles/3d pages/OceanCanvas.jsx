import React, { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';
import { useOceanStore } from './useOceanStore.js';
import { InfoCircle } from './components/InfoCircle.jsx';

/**
 * OceanCanvas.jsx — 3D Ocean Data Visualization Canvas Component.
 * Demonstrates:
 * 1. Subscribing to `verticalExaggeration` to scale Three.js bathymetry/meshes [1, y, 1].
 * 2. Subscribing to `currentDepth` to move THREE.PlaneGeometry (depth slice) up & down Y-axis.
 * 3. `onClick` on Argo float mesh triggering `fetchAndSetInstrument(id)` while simultaneously
 *    firing a GSAP smooth camera dive to those coordinates.
 * 4. In-Canvas depth scrubber writing directly to `currentDepth` in Zustand.
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

  // ─────────────────────────────────────────────────────────────
  // 1. Synchronize Depth Slice Mesh Position with currentDepth
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (depthSliceMeshRef.current) {
      // Scale depth from [0, 4000m] to Three.js Y-axis coordinates [-0, -95]
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

    // 1. Trigger async ERDDAP REST API fetch in Zustand store
    fetchAndSetInstrument(instrument.id || instrument.floatId);

    // 2. Camera target coordinates
    const targetX = instrument.position ? instrument.position[0] : 0;
    const targetY = instrument.position ? instrument.position[1] : -0.2;
    const targetZ = instrument.position ? instrument.position[2] : 1.5;

    // 3. Fire GSAP orbital dive animation if camera and controls are active
    const camera = cameraRef.current || (window.__oceanRenderer && window.__oceanRenderer.camera);
    const controls = controlsRef.current || window.controls;

    if (camera && controls) {
      // Smoothly animate OrbitControls target
      gsap.to(controls.target, {
        x: targetX,
        y: targetY,
        z: targetZ,
        duration: 1.4,
        ease: 'power3.inOut',
      });

      // Smoothly zoom camera closer to instrument coordinates
      gsap.to(camera.position, {
        x: targetX + 4.0,
        y: targetY + 3.2,
        z: targetZ + 6.0,
        duration: 1.6,
        ease: 'power3.inOut',
        onUpdate: () => controls.update(),
      });
    }

    // Also trigger vanilla Three.js focus if active
    if (window.focusInstrument) {
      window.focusInstrument(instrument.id);
    }
  }, [fetchAndSetInstrument]);

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

      // Smooth live resize observer
      const ro = new ResizeObserver(() => {
        window.dispatchEvent(new Event('resize'));
      });
      ro.observe(containerRef.current);

      return () => ro.disconnect();
    }
  }, []);

  return (
    <div className="canvas-panel" ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* 3D WebGL Canvas will render here */}

      {/* Center Canvas Info Badge */}
      <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 20 }}>
        <InfoCircle
          title="4. 3D Canvas & Depth Scrubber"
          whatItDoes="Orbital Dive: Clicking an instrument pin locks the Three.js OrbitControls target to that pin's coordinates and smoothly animates the camera downward using GSAP. In-Canvas Scrubber: A visual UX duplicate of the Left Panel depth slider that writes to the same Zustand state, ensuring sidebars and 3D view are always in sync."
          futureApiUse="Stream real-time 3D NetCDF isosurfaces and dynamic bathymetric terrain directly on WebGL shader pipelines."
          position="bottom"
          badgeText="ⓘ 3D Scene Info"
        />
      </div>

      {/* In-Canvas Vertical Depth Scrubber (Synced with Zustand currentDepth) */}
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
            Depth Level
          </div>
          <div className="text-mono" style={{ fontSize: '0.86rem', color: '#00f0ff', fontWeight: 800 }}>
            {Math.round(currentDepth)} m
          </div>
        </div>

        {/* Vertical Track Range Slider */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 0' }}>
          <input
            type="range"
            min="0"
            max="4000"
            step="25"
            value={currentDepth}
            onChange={(e) => setCurrentDepth(parseFloat(e.target.value) || 0)}
            style={{
              writingMode: 'bt-lr', // Vertical slider for supported browsers
              WebkitAppearance: 'slider-vertical',
              height: '100%',
              width: 8,
              accentColor: 'var(--accent-cyan)',
              cursor: 'pointer',
            }}
          />
        </div>

        <div style={{ textAlign: 'center', fontSize: '0.54rem', color: '#64748b' }}>
          Abyss (4000m)
        </div>
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
          <>
            <button
              className={`nav-step-btn ${activeInstrument?.floatId === '2902351' ? 'nav-view-tab--active' : ''}`}
              onClick={() => handleArgoFloatClick({ id: 'argo-2902351', floatId: '2902351', position: [0, -0.2, 1.5] })}
              style={{ fontSize: '0.66rem', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span>🟠</span>
              <span>Float #2902351 (Dive)</span>
            </button>
            <button
              className={`nav-step-btn ${activeInstrument?.floatId === '2902352' ? 'nav-view-tab--active' : ''}`}
              onClick={() => handleArgoFloatClick({ id: 'argo-2902352', floatId: '2902352', position: [-6.4, -38.0, 5.2] })}
              style={{ fontSize: '0.66rem', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span>🟠</span>
              <span>Deep SOLO #2902352 (Abyss)</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default OceanCanvas;
