import React from 'react';
import { useOceanStore } from '../useOceanStore.js';

/**
 * GliderTransectBanner.jsx — Top Horizontal Transect Slider Banner
 * ============================================================================
 * Task 4: Top Horizontal Slider strictly for Autonomous Underwater Glider
 *
 * Wire:
 * Value: useOceanStore((state) => state.instruments['glider-slocum-04']?.transectDistance || 0)
 * onChange: (e) => setActiveInstrumentTransect(Number(e.target.value))
 */
export function GliderTransectBanner() {
  const activeInstrument = useOceanStore((state) => state.activeInstrument);
  const transectDistance = useOceanStore((state) => state.instruments['glider-slocum-04']?.transectDistance || 0);
  const setActiveInstrumentTransect = useOceanStore((state) => state.setActiveInstrumentTransect);

  // Strictly conditional render: Gliders ONLY
  if (!activeInstrument || activeInstrument.type !== 'glider') {
    return null;
  }

  const ratio = Math.max(0, Math.min(1, transectDistance / 50.0));
  const percent = (ratio * 100).toFixed(1);

  return (
    <div
      className="glider-transect-banner-container"
      style={{
        position: 'absolute',
        top: '74px',
        left: 'clamp(210px, 20vw, 270px)',
        right: 'clamp(340px, 28vw, 420px)',
        zIndex: 25,
        pointerEvents: 'auto',
        animation: 'fadeInBanner 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div
        style={{
          background: 'rgba(3, 14, 33, 0.90)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1.5px solid rgba(251, 191, 36, 0.45)',
          borderRadius: '14px',
          padding: '10px 18px 12px 18px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.7), 0 0 24px rgba(251, 191, 36, 0.22)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          userSelect: 'none',
        }}
      >
        {/* Header Strip */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1rem' }}>✈️</span>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fbbf24', letterSpacing: '0.04em' }}>
                SLOCUM GLIDER TRANSECT
              </div>
              <div style={{ fontSize: '0.58rem', color: '#94a3b8' }}>
                Andaman Sea Hydrographic Survey Track (0 – 50 km)
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ textAlign: 'right' }}>
              <span
                style={{
                  fontFamily: 'Space Mono, monospace',
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  color: '#fbbf24',
                  letterSpacing: '-0.02em',
                }}
              >
                {Number(transectDistance).toFixed(1)}
              </span>
              <span style={{ fontSize: '0.66rem', color: '#cbd5e1', marginLeft: 3 }}>km</span>
            </div>
            <span
              style={{
                fontSize: '0.58rem',
                fontFamily: 'Space Mono, monospace',
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'rgba(251, 191, 36, 0.15)',
                color: '#fbbf24',
                border: '1px solid rgba(251, 191, 36, 0.35)',
              }}
            >
              {percent}%
            </span>
          </div>
        </div>

        {/* Range Slider Track */}
        <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
          <input
            type="range"
            min="0"
            max="50"
            step="0.5"
            value={transectDistance}
            onChange={(e) => setActiveInstrumentTransect(Number(e.target.value))}
            style={{
              width: '100%',
              accentColor: '#fbbf24',
              cursor: 'pointer',
              height: '6px',
              borderRadius: '3px',
            }}
            title="Slocum Glider Horizontal Transect Distance"
          />
        </div>

        {/* Footer Track Labels & Quick Steppers */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.58rem', color: '#94a3b8' }}>
          <span>0 km (Port Blair Bay)</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setActiveInstrumentTransect(Math.max(0, transectDistance - 2))}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#cbd5e1',
                padding: '2px 7px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: '0.58rem',
              }}
            >
              -2 km
            </button>
            <button
              onClick={() => setActiveInstrumentTransect(25)}
              style={{
                background: 'rgba(251, 191, 36, 0.12)',
                border: '1px solid rgba(251, 191, 36, 0.3)',
                color: '#fbbf24',
                padding: '2px 7px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: '0.58rem',
              }}
            >
              Mid (25 km)
            </button>
            <button
              onClick={() => setActiveInstrumentTransect(Math.min(50, transectDistance + 2))}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#cbd5e1',
                padding: '2px 7px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: '0.58rem',
              }}
            >
              +2 km
            </button>
          </div>
          <span>50 km (Abyssal Trench)</span>
        </div>
      </div>
    </div>
  );
}

export default GliderTransectBanner;
