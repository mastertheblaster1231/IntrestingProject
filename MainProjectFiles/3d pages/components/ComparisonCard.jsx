import React, { useState, useMemo } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { useOceanStore, getInstrumentComparisonData } from '../useOceanStore.js';
import { formatVariableValue, getAgreementRating } from '../deltaMath.js';

/**
 * ComparisonCard.jsx — Draggable, Snap-Back "Model vs Observation" Card (framer-motion)
 * ===================================================================================
 * Requirement 3:
 * - Wrapped in framer-motion <motion.div> with full 2D drag capabilities.
 * - Can be dragged completely out of the Right Panel and placed anywhere on the 3D canvas.
 * - Custom "Dock / Snap-Back" button uses spring physics to fly the card smoothly
 *   back to { x: 0, y: 0 } inside the Right Panel grid.
 * - Driven by deterministic diurnal cycle for realistic non-random metrics.
 */
export function ComparisonCard({ instrumentId, onRemove, style = {} }) {
  const controls = useAnimation();
  const [isDocked, setIsDocked] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  // Zustand state subscriptions
  const selectedTimestamp = useOceanStore((state) => state.selectedTimestamp);
  const activeInstrument = useOceanStore((state) => state.activeInstrument);
  const instruments = useOceanStore((state) => state.instruments);
  const targetDepth = useOceanStore((state) => state.targetDepth);
  const selectInstrument = useOceanStore((state) => state.selectInstrument);

  // Resolve operating depth for this specific instrument
  const instSaved = instruments?.[instrumentId] || {};
  const depth = instSaved.depth ?? (instrumentId?.includes('glider') ? 190 : (instrumentId?.includes('ctd') ? 1200 : targetDepth ?? 15));

  // Compute side-by-side comparison data with diurnal cycle
  const data = useMemo(() => {
    return getInstrumentComparisonData(instrumentId, depth, selectedTimestamp);
  }, [instrumentId, depth, selectedTimestamp]);

  const instrument = data.instrument;
  const isSelected = activeInstrument?.id === instrumentId;

  // Snap-back animation: flies card back to original position in right panel grid
  const handleSnapBack = async () => {
    setIsDocked(true);
    await controls.start({
      x: 0,
      y: 0,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 480,
        damping: 30,
        mass: 0.8,
      },
    });
  };

  const handleDragStart = () => {
    setIsDragging(true);
    setIsDocked(false);
  };

  const handleDragEnd = (event, info) => {
    setIsDragging(false);
    // Ignore tiny movements that are likely just clicks
    if (Math.abs(info.offset.x) < 5 && Math.abs(info.offset.y) < 5) {
      return;
    }
    // Snap back only if dropped near the far right side of the screen
    if (info.point.x > window.innerWidth - 450) {
      handleSnapBack();
    } else {
      setIsDocked(false);
    }
  };

  const handleFocus3D = (e) => {
    e.stopPropagation();
    selectInstrument(instrumentId);
    if (window.focusInstrument) {
      window.focusInstrument(instrumentId);
    }
  };

  const getIcon = () => {
    if (instrument?.type === 'glider') return '✈️';
    if (instrument?.type === 'ctd') return '🔬';
    return '🟠';
  };

  const getThemeColor = () => {
    if (instrument?.type === 'glider') return '#fbbf24';
    if (instrument?.type === 'ctd') return '#38bdf8';
    return '#ff7a00';
  };

  const themeColor = getThemeColor();

  return (
    <motion.div
      drag={true}
      dragConstraints={{ left: -1500, right: 0, top: -500, bottom: 500 }}
      dragElastic={0.1}
      dragMomentum={false}
      animate={controls}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      whileDrag={{
        scale: 1.03,
        zIndex: 9999,
        cursor: 'grabbing',
        boxShadow: `0 24px 48px rgba(0, 0, 0, 0.85), 0 0 35px ${themeColor}66`,
      }}
      className="comparison-card-motion z-[100]"
      style={{
        background: 'rgba(5, 16, 38, 0.92)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: `1.5px solid ${isSelected ? themeColor : 'rgba(0, 229, 255, 0.28)'}`,
        borderRadius: '14px',
        padding: '12px 14px',
        boxShadow: isSelected
          ? `0 10px 30px rgba(0, 0, 0, 0.6), 0 0 20px ${themeColor}33`
          : '0 8px 24px rgba(0, 0, 0, 0.55)',
        color: '#e2e8f0',
        fontFamily: 'var(--font-primary, "Outfit", sans-serif)',
        userSelect: 'none',
        position: 'relative',
        cursor: isDragging ? 'grabbing' : 'grab',
        minWidth: '290px',
        flex: 1,
        ...style,
      }}
    >
      {/* ── 1. HEADER: Drag Grip, Icon, Title, Depth, Snap-Back Toggle ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          {/* Drag Handle Grip Icon */}
          <span
            style={{
              color: '#64748b',
              fontSize: '0.85rem',
              cursor: 'grab',
              letterSpacing: '-1px',
            }}
            title="Drag card anywhere on 3D canvas"
          >
            ⋮⋮
          </span>

          <span style={{ fontSize: '1.1rem' }}>{getIcon()}</span>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '0.86rem',
                  color: '#f8fafc',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {instrument?.name || instrumentId}
              </span>
            </div>
            <div
              style={{
                fontSize: '0.62rem',
                color: '#94a3b8',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {instrument?.platform || 'In-Situ Platform'}
            </div>
          </div>
        </div>

        {/* Operating Depth Pill */}
        <span
          style={{
            fontSize: '0.62rem',
            fontWeight: 800,
            fontFamily: 'Space Mono, monospace',
            padding: '2px 7px',
            borderRadius: '6px',
            background: 'rgba(0, 229, 255, 0.12)',
            color: '#00f0ff',
            border: '1px solid rgba(0, 229, 255, 0.35)',
            whiteSpace: 'nowrap',
          }}
        >
          {Math.round(depth)}m
        </span>

        {/* Snap-Back to Dock Button */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleSnapBack(); }}
          style={{
            background: isDocked ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 229, 255, 0.22)',
            border: isDocked ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #00f0ff',
            color: isDocked ? '#94a3b8' : '#00f0ff',
            borderRadius: '6px',
            padding: '3px 8px',
            fontSize: '0.62rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.15s ease',
          }}
          title={isDocked ? 'Card is docked inside Right Panel' : 'Snap card back to Right Panel grid'}
        >
          <span>{isDocked ? '📌 Docked' : '↩ Dock'}</span>
        </button>

        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(instrumentId);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: '0.8rem',
              padding: '0 3px',
            }}
            title="Remove from comparison"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── 2. MODEL VS OBSERVATION METRICS TABLE (Diurnal Perturbations) ── */}
      <div
        style={{
          background: 'rgba(3, 10, 25, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          padding: '8px 10px',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.66rem' }}>
          <thead>
            <tr style={{ color: '#64748b', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', textAlign: 'left' }}>
              <th style={{ padding: '3px 2px', fontWeight: 600 }}>Variable</th>
              <th style={{ padding: '3px 2px', textAlign: 'right', fontWeight: 600, color: '#38bdf8' }}>Obs</th>
              <th style={{ padding: '3px 2px', textAlign: 'right', fontWeight: 600, color: '#a78bfa' }}>Model</th>
              <th style={{ padding: '3px 2px', textAlign: 'right', fontWeight: 700 }}>Δ Delta</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(data.variables).map((key) => {
              const row = data.variables[key];
              const deltaRating = getAgreementRating(key, row.delta);
              const isDeltaPositive = row.delta != null && row.delta > 0;
              const deltaColor =
                deltaRating.tone === 'optimal'
                  ? '#10b981'
                  : deltaRating.tone === 'warning'
                  ? '#f59e0b'
                  : '#ef4444';

              return (
                <tr
                  key={key}
                  style={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                    height: '24px',
                  }}
                >
                  <td style={{ padding: '3px 2px', color: '#cbd5e1', textTransform: 'capitalize' }}>
                    {key === 'currentSpeed' ? 'Velocity' : key === 'currentDirection' ? 'Direction' : key === 'dissolvedOxygen' ? 'Oxygen' : key}
                  </td>
                  <td style={{ padding: '3px 2px', textAlign: 'right', fontFamily: 'Space Mono, monospace', color: '#e0f2fe' }}>
                    {formatVariableValue(key, row.obs)}
                  </td>
                  <td style={{ padding: '3px 2px', textAlign: 'right', fontFamily: 'Space Mono, monospace', color: '#ede9fe' }}>
                    {formatVariableValue(key, row.model)}
                  </td>
                  <td
                    style={{
                      padding: '3px 2px',
                      textAlign: 'right',
                      fontFamily: 'Space Mono, monospace',
                      fontWeight: 700,
                      color: row.delta != null ? deltaColor : '#64748b',
                    }}
                  >
                    {row.delta != null ? (
                      <span
                        style={{
                          padding: '1px 4px',
                          borderRadius: 4,
                          background: `${deltaColor}1a`,
                          border: `1px solid ${deltaColor}44`,
                        }}
                      >
                        {formatVariableValue(key, row.delta, true)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── 3. CARD FOOTER: 3D Jump & Drag Status ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <button
          type="button"
          onClick={handleFocus3D}
          style={{
            background: 'rgba(0, 229, 255, 0.1)',
            border: '1px solid rgba(0, 229, 255, 0.3)',
            color: '#00e5ff',
            borderRadius: '6px',
            padding: '3px 8px',
            fontSize: '0.6rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
          title="Jump camera to this instrument in 3D canvas"
        >
          <span>🎯</span>
          <span>Focus 3D</span>
        </button>

        <span style={{ fontSize: '0.55rem', color: isDocked ? '#64748b' : '#fbbf24', fontStyle: 'italic' }}>
          {isDocked ? 'Docked in Grid' : '🚀 Floating on Canvas'}
        </span>
      </div>
    </motion.div>
  );
}

export default ComparisonCard;
