import React from 'react';
import { useOceanStore } from '../useOceanStore.js';

/**
 * DepthSlider.jsx — Left Vertical / Dock Depth Controller
 * ============================================================================
 * Task 4: Subscribes to the active instrument's isolated depth in Zustand.
 *
 * Wire:
 * Value: useOceanStore((state) => state.instruments[activeInstrumentId]?.depth || 0)
 * onChange: (e) => setActiveInstrumentDepth(Number(e.target.value))
 */
export function DepthSlider({ vertical = false, className = '' }) {
  const activeInstrument = useOceanStore((state) => state.activeInstrument);
  const activeInstrumentId = activeInstrument?.id || 'argo-2902351';
  const depth = useOceanStore((state) => state.instruments[activeInstrumentId]?.depth || 0);
  const setActiveInstrumentDepth = useOceanStore((state) => state.setActiveInstrumentDepth);

  const getDepthZone = (m) => {
    if (m <= 200) return 'Epipelagic (Sunlight)';
    if (m <= 1000) return 'Mesopelagic (Twilight)';
    if (m <= 2000) return 'Bathypelagic (Midnight)';
    return 'Abyssopelagic (Abyss)';
  };

  const isGlider = activeInstrument?.type === 'glider';
  const accentColor = isGlider ? '#fbbf24' : '#00f0ff';

  if (vertical) {
    return (
      <div className={`depth-slider-vertical ${className}`} style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        height: '100%',
        padding: '8px 4px',
        userSelect: 'none',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.58rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
            {activeInstrument?.name || 'Instrument'}
          </div>
          <div style={{ fontSize: '0.9rem', color: accentColor, fontWeight: 800, fontFamily: 'Space Mono, monospace' }}>
            {Math.round(depth)} m
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <input
            type="range"
            min="0"
            max="4000"
            step="25"
            value={depth}
            onChange={(e) => setActiveInstrumentDepth(Number(e.target.value))}
            style={{
              writingMode: 'bt-lr',
              WebkitAppearance: 'slider-vertical',
              height: '100%',
              width: 8,
              accentColor: accentColor,
              cursor: 'pointer',
            }}
            title="Vertical Depth Scrubber"
          />
        </div>

        <div style={{ fontSize: '0.52rem', color: '#64748b', textAlign: 'center' }}>
          4000m
        </div>
      </div>
    );
  }

  return (
    <div className={`depth-slider-horizontal slider-row ${className}`} style={{ width: '100%' }}>
      <div className="slider-row__header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span>↕️ Depth Scroll</span>
          <span style={{
            fontSize: '0.56rem',
            padding: '1px 5px',
            borderRadius: 4,
            background: 'rgba(0, 229, 255, 0.12)',
            color: accentColor,
            border: `1px solid ${accentColor}33`,
          }}>
            {getDepthZone(depth)}
          </span>
        </span>
        <span className="slider-row__value" style={{ color: accentColor, fontFamily: 'Space Mono, monospace', fontWeight: 700 }}>
          {Math.round(depth)} m
        </span>
      </div>

      <input
        type="range"
        className="panel-slider"
        min="0"
        max="4000"
        step="25"
        value={depth}
        onChange={(e) => setActiveInstrumentDepth(Number(e.target.value))}
        style={{ width: '100%', accentColor: accentColor, cursor: 'pointer' }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.58rem', color: '#64748b', marginTop: 2 }}>
        <span>0m (Surface)</span>
        <span>1000m</span>
        <span>2000m</span>
        <span>4000m (Abyss)</span>
      </div>
    </div>
  );
}

export default DepthSlider;
