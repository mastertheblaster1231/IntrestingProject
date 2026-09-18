import React, { useState, useEffect, useRef } from 'react';
import { useComparisonStore } from './useComparisonStore.js';

/**
 * PanelDepthSlider.jsx — Reference-style vertical depth sliders.
 * ============================================================================
 * One slim slider per comparison region, styled like the design reference:
 *   [ 0206 m ]   <- readout pill (zero-padded meters)
 *   ── track ──  <- tall track, blue fill from top, glowing thumb dot
 *   BAY OF       <- region label
 *   BENGAL
 *
 * Drag / click / arrow-keys all drive `onChange(meters)`. Debounced store
 * sync + live fetches live in DockSlider below (same 300 ms pattern the
 * panels used before), so the 3D float dives instantly while
 * /api/argo/depth-slice + /api/validation fire per settled value.
 */

const DOCK_MAX_DEPTH = 4000;

export function PanelDepthSlider({ value = 0, max = DOCK_MAX_DEPTH, onChange, label = '' }) {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);
  const clamped = Math.max(0, Math.min(max, Number(value) || 0));
  const ratio = clamped / max;

  const valueFromClientY = (clientY) => {
    const el = trackRef.current;
    if (!el) return clamped;
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) return clamped;
    const r = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return Math.round(r * max);
  };

  const handlePointerDown = (e) => {
    draggingRef.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
    if (onChange) onChange(valueFromClientY(e.clientY));
  };
  const handlePointerMove = (e) => {
    if (!draggingRef.current) return;
    if (onChange) onChange(valueFromClientY(e.clientY));
  };
  const stopDrag = () => { draggingRef.current = false; };

  const handleKeyDown = (e) => {
    if (!onChange) return;
    const step = e.shiftKey ? 500 : 50;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); onChange(Math.min(max, clamped + step)); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); onChange(Math.max(0, clamped - step)); }
    else if (e.key === 'Home') { e.preventDefault(); onChange(0); }
    else if (e.key === 'End') { e.preventDefault(); onChange(max); }
  };

  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const handleFocus = () => {
    setIsEditing(true);
    setInputValue(String(Math.round(clamped)));
  };

  const handleBlur = () => {
    setIsEditing(false);
    const parsed = parseInt(inputValue, 10);
    if (!isNaN(parsed)) {
      onChange(Math.max(0, Math.min(max, parsed)));
    }
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') e.target.blur();
  };

  return (
    <div className="dock-slider">
      <div className="dock-readout" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {isEditing ? (
          <input
            type="number"
            value={inputValue}
            autoFocus
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleInputKeyDown}
            style={{
              width: '40px',
              background: 'rgba(0,0,0,0.5)',
              color: '#00f0ff',
              border: '1px solid rgba(0,240,255,0.5)',
              borderRadius: '4px',
              textAlign: 'center',
              fontSize: '11px',
              fontFamily: 'inherit',
              padding: '2px',
              outline: 'none',
              MozAppearance: 'textfield'
            }}
          />
        ) : (
          <div style={{ cursor: 'text' }} onClick={handleFocus}>
            {String(Math.round(clamped)).padStart(4, '0')} m
          </div>
        )}
      </div>
      <div
        ref={trackRef}
        className="dock-track"
        role="slider"
        aria-label={`${label} depth`}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(clamped)}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onKeyDown={handleKeyDown}
      >
        <div className="dock-fill" style={{ height: `${(ratio * 100).toFixed(2)}%` }} />
        <div className="dock-thumb" style={{ top: `${(ratio * 100).toFixed(2)}%` }} />
      </div>
      <div className="dock-label">{label}</div>
    </div>
  );
}

/**
 * DockSlider — binds one PanelDepthSlider to a region in the comparison store.
 * Local state keeps dragging at 60 fps; a 300 ms debounce commits to the
 * store and triggers that panel's depth-slice + validation fetches.
 */
function DockSlider({ region }) {
  const storeDepth = useComparisonStore((s) => s.regionData[region.id]?.depth ?? 0);
  const setRegionDepth = useComparisonStore((s) => s.setRegionDepth);
  const fetchDepthSlice = useComparisonStore((s) => s.fetchDepthSlice);
  const fetchValidation = useComparisonStore((s) => s.fetchValidation);

  const [local, setLocal] = useState(storeDepth);

  // Follow external store changes (e.g. new panel defaults)
  useEffect(() => {
    if (storeDepth !== local) setLocal(storeDepth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeDepth]);

  // Debounced commit → store + live per-panel API fetches
  useEffect(() => {
    const handler = setTimeout(() => {
      if (local !== storeDepth) {
        setRegionDepth(region.id, local);
        fetchDepthSlice(region.id);
        fetchValidation(region.id);
      }
    }, 300);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, region.id]);

  return <PanelDepthSlider value={local} max={DOCK_MAX_DEPTH} onChange={setLocal} label={region.name} />;
}

/**
 * RegionDepthDock — slim fixed column of one slider per active region.
 * Mounted beside the scrolling panels (never scrolls away).
 */
export function RegionDepthDock() {
  const regions = useComparisonStore((s) => s.regions);
  if (!regions || regions.length === 0) return null;

  return (
    <div className="depth-dock" aria-label="Per-region depth controls">
      {regions.map((r) => (
        <DockSlider key={r.id} region={r} />
      ))}
    </div>
  );
}

export default RegionDepthDock;
