import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useOceanStore } from '../useOceanStore.js';

/**
 * GliderHorizontalScrollbar
 * =========================
 * Top-mounted glassmorphic horizontal slider that controls the forward transect
 * distance (0 to 50 km) of the autonomous Slocum Glider.
 *
 * Strict Condition:
 * ONLY renders when activeInstrument is a glider (activeInstrument.type === 'glider').
 * Completely unmounts/disappears when another device (Argo, CTD) is selected.
 */
export function GliderHorizontalScrollbar() {
  const activeInstrument = useOceanStore((state) => state.activeInstrument);
  const horizontalKm = useOceanStore(
    (state) => state.instruments['glider-slocum-04']?.transectDistance ?? state.activeInstrumentHorizontal ?? 25
  );
  const setActiveInstrumentTransect = useOceanStore((state) => state.setActiveInstrumentTransect);
  const setActiveInstrumentHorizontal = useOceanStore((state) => state.setActiveInstrumentHorizontal);

  const trackRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  // Maximum transect survey distance in kilometres
  const MAX_KM = 50.0;
  const ratio = Math.max(0, Math.min(1, horizontalKm / MAX_KM));
  const percent = (ratio * 100).toFixed(1);

  // Calculate distance from pointer coordinates
  const updateFromPointer = useCallback((clientX) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const rawRatio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newKm = +(rawRatio * MAX_KM).toFixed(1);
    if (setActiveInstrumentTransect) {
      setActiveInstrumentTransect(newKm);
    } else if (setActiveInstrumentHorizontal) {
      setActiveInstrumentHorizontal(newKm);
    }
  }, [setActiveInstrumentTransect, setActiveInstrumentHorizontal, MAX_KM]);

  const handlePointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    if (e.currentTarget.setPointerCapture) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_err) { /* ignore */ }
    }
    updateFromPointer(e.clientX);
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    updateFromPointer(e.clientX);
  };

  const handlePointerUp = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.currentTarget.releasePointerCapture) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_err) { /* ignore */ }
    }
  };

  const stepDistance = (deltaKm) => {
    const nextVal = Math.max(0, Math.min(MAX_KM, +(horizontalKm + deltaKm).toFixed(1)));
    setActiveInstrumentHorizontal(nextVal);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    const step = delta > 0 ? 1.0 : -1.0;
    stepDistance(step);
  };

  // Keyboard "Character Possession" Controls for Slocum (Arrow keys / WASD)
  useEffect(() => {
    if (!activeInstrument || activeInstrument.type !== 'glider') return;

    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        stepDistance(+1.0);
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        stepDistance(-1.0);
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        const currentDepth = useOceanStore.getState().activeInstrumentDepth ?? 190;
        const newDepth = Math.min(4000, currentDepth + 50);
        if (window.updateDepthUI) {
          window.updateDepthUI(newDepth / 4000, true);
        } else {
          useOceanStore.getState().setActiveInstrumentDepth(newDepth);
        }
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        const currentDepth = useOceanStore.getState().activeInstrumentDepth ?? 190;
        const newDepth = Math.max(0, currentDepth - 50);
        if (window.updateDepthUI) {
          window.updateDepthUI(newDepth / 4000, true);
        } else {
          useOceanStore.getState().setActiveInstrumentDepth(newDepth);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeInstrument, horizontalKm]);

  // Strictly conditional render: Gliders ONLY
  if (!activeInstrument || activeInstrument.type !== 'glider') {
    return null;
  }

  return (
    <div
      className="glider-horizontal-bar-overlay"
      onWheel={handleWheel}
      style={{
        position: 'absolute',
        top: '74px',
        left: 'clamp(210px, 20vw, 270px)',
        right: 'clamp(340px, 28vw, 420px)',
        zIndex: 25,
        pointerEvents: 'auto',
        animation: 'fadeInBar 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div
        style={{
          background: 'rgba(3, 14, 33, 0.88)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1.5px solid rgba(0, 229, 255, 0.42)',
          borderRadius: '14px',
          padding: '10px 16px 12px 16px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.65), 0 0 20px rgba(0, 229, 255, 0.18)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          userSelect: 'none',
        }}
      >
        {/* Top Info Strip */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1rem', filter: 'drop-shadow(0 0 6px #ffd000)' }}>✈️</span>
            <div>
              <div
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  color: '#00f0ff',
                  letterSpacing: '0.8px',
                  textTransform: 'uppercase',
                  fontFamily: 'Space Mono, monospace',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>Slocum Glider Transect</span>
                <span
                  style={{
                    fontSize: '0.55rem',
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: 'rgba(255, 208, 0, 0.18)',
                    color: '#ffd000',
                    border: '1px solid rgba(255, 208, 0, 0.4)',
                    fontWeight: 700,
                  }}
                >
                  AUTONOMOUS FORWARD GLIDE
                </span>
              </div>
              <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>
                Transect Heading: <strong style={{ color: '#f8fafc' }}>035° (ENE)</strong> • Dynamic 3D Translation
              </div>
            </div>
          </div>

          {/* Value Display & Step Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                background: 'rgba(0, 240, 255, 0.08)',
                border: '1px solid rgba(0, 229, 255, 0.25)',
                borderRadius: '8px',
                padding: '3px 8px',
                fontFamily: 'Space Mono, monospace',
                fontSize: '0.76rem',
                color: '#f8fafc',
                display: 'flex',
                alignItems: 'baseline',
                gap: 4,
              }}
            >
              <span style={{ color: '#00f0ff', fontWeight: 800, fontSize: '0.88rem' }}>
                {horizontalKm.toFixed(1)}
              </span>
              <span style={{ fontSize: '0.62rem', color: '#64748b' }}>/ 50.0 km</span>
            </div>

            {/* Quick Step Controls */}
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                onClick={() => stepDistance(-1.0)}
                title="Step backward 1 km"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#94a3b8',
                  borderRadius: 6,
                  padding: '2px 6px',
                  fontSize: '0.65rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                ◀ -1k
              </button>
              <button
                type="button"
                onClick={() => stepDistance(+1.0)}
                title="Step forward 1 km"
                style={{
                  background: 'rgba(0, 229, 255, 0.15)',
                  border: '1px solid rgba(0, 229, 255, 0.4)',
                  color: '#00f0ff',
                  borderRadius: 6,
                  padding: '2px 6px',
                  fontSize: '0.65rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                ▶ +1k
              </button>
              <button
                type="button"
                onClick={() => setActiveInstrumentHorizontal(0)}
                title="Reset to Transect Origin (0 km)"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#94a3b8',
                  borderRadius: 6,
                  padding: '2px 6px',
                  fontSize: '0.65rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                ↺ Origin
              </button>
            </div>
          </div>
        </div>

        {/* Interactive Draggable Rail */}
        <div
          ref={trackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            position: 'relative',
            height: '26px',
            display: 'flex',
            alignItems: 'center',
            cursor: isDragging ? 'grabbing' : 'pointer',
            touchAction: 'none',
          }}
        >
          {/* Rail Track Background */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: '6px',
              borderRadius: '3px',
              background: 'rgba(255, 255, 255, 0.08)',
              overflow: 'hidden',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)',
            }}
          >
            {/* Active Filled Glowing Portion */}
            <div
              style={{
                width: `${percent}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #00e5ff 0%, #38bdf8 65%, #ffd000 100%)',
                boxShadow: '0 0 12px rgba(0, 229, 255, 0.65)',
                transition: isDragging ? 'none' : 'width 0.12s ease',
              }}
            />
          </div>

          {/* Tick Markers */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              pointerEvents: 'none',
              fontSize: '0.58rem',
              color: '#64748b',
              fontFamily: 'Space Mono, monospace',
            }}
          >
            <span>0k</span>
            <span>10k</span>
            <span>20k</span>
            <span>30k</span>
            <span>40k</span>
            <span>50k (Abyss End)</span>
          </div>

          {/* Draggable Glowing Thumb */}
          <div
            style={{
              position: 'absolute',
              left: `${percent}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #00f0ff, #0284c7)',
              border: '2px solid #ffffff',
              boxShadow: '0 0 16px #00f0ff, 0 4px 10px rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '0.62rem',
              fontWeight: 800,
              transition: isDragging ? 'none' : 'left 0.12s ease',
              cursor: isDragging ? 'grabbing' : 'grab',
            }}
          >
            <span>➔</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GliderHorizontalScrollbar;
