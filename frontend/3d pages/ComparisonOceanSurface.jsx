import React, { useRef, useMemo, useEffect, useState } from 'react';
import { SOLAR_PRESETS } from './Ocean.jsx';
import { useComparisonStore } from './useComparisonStore.js';
import { mountOceanPanel } from './oceanPanelScene.js';

// NOTE: Each panel mounts a REAL Ocean.jsx environment instance
// (same sky/sun/cloud/water shaders + same APEX Argo model) through
// mountOceanPanel(). Instances are fully independent — own renderer, scene,
// camera and loop — and are disposed on unmount. No @react-three/fiber is
// used here (the project's fiber import is a DOM shim that cannot render R3F).

// Map panelId string to a stable integer to pick a consistent preset
function getHash(str) {
  const s = String(str ?? '');
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = s.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

/**
 * Props (independent per comparison panel):
 *   panelId    — unique region-panel id (preset selection + store fallback key)
 *   depth      — panel depth in meters (0–4000); dives the 3D Argo float
 *   platformId — active Argo float WMO for this panel (shown on the badge)
 * When props are absent, the component falls back to the comparison store.
 * Prop updates drive handle.setDepth() — the WebGL context is never rebuilt.
 */
export function ComparisonOceanSurface({ panelId, depth, platformId }) {
  const mountRef = useRef(null);
  const handleRef = useRef(null);
  const [failed, setFailed] = useState(false);

  // Select a solar preset deterministically based on panelId
  const presetIndex = useMemo(() => getHash(panelId) % SOLAR_PRESETS.length, [panelId]);
  const preset = SOLAR_PRESETS[presetIndex];

  // Store fallback keeps the panel live even if the parent passes no props
  const storeDepth = useComparisonStore((s) => s.regionData[panelId]?.depth ?? 15);
  const effectiveDepth =
    typeof depth === 'number' && Number.isFinite(depth) ? depth : storeDepth;

  // Mount one independent Ocean environment for this panel
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return undefined;

    try {
      const handle = mountOceanPanel(container, { preset, depth: effectiveDepth });
      handleRef.current = handle;
    } catch (err) {
      console.error('[ComparisonOceanSurface] Ocean panel mount failed:', err);
      setFailed(true);
    }

    return () => {
      try {
        if (handleRef.current) handleRef.current.dispose();
      } catch (_e) { /* ignore */ }
      handleRef.current = null;
    };
    // Re-mount only when the panel identity (preset) changes — depth and
    // float flow through the handle below without touching WebGL state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId, preset]);

  // Bind slider depth + float changes into the live 3D instance.
  // setDepth lerps the Argo's Y every frame; data-table fetching is handled
  // by RegionPanel / useComparisonStore (fetchDepthSlice + fetchValidation).
  useEffect(() => {
    try {
      if (handleRef.current) handleRef.current.setDepth(effectiveDepth);
    } catch (_e) { /* decorative update must never throw */ }
  }, [effectiveDepth]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 0 }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />
      {failed && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(2,7,19,0.85)', color: '#8bb2db', fontSize: '11px', padding: '12px', textAlign: 'center' }}>
          3D preview unavailable — telemetry table below still shows live ERDDAP data.
        </div>
      )}

    </div>
  );
}

export default ComparisonOceanSurface;
