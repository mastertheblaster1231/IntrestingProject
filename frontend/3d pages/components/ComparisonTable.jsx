import React, { useState, useMemo } from 'react';
import {
  useOceanStore,
  selectModelComparison,
  selectTargetDepth,
  selectActiveVariable,
  selectActiveInstrument,
} from '../useOceanStore.js';
import {
  SUPPORTED_VARIABLES,
  formatVariableValue,
  getAgreementRating,
} from '../deltaMath.js';

/**
 * ComparisonTable.jsx — Multi-Variable Validation Engine Tabular Component
 * =========================================================================
 * Compares real-time in-situ observations (Argo/Gliders/CTD) against 4D NetCDF
 * numerical ocean models (INCOIS-ROMS / HYCOM / CMEMS).
 *
 * Core Features:
 * 1. Multi-variable support: Temp, Salinity, Chl-a, Current Speed, Current Dir, DO.
 * 2. Strict missing data handling: displays "Comparison unavailable — data missing"
 *    when either observation or model data is missing at targetDepth.
 * 3. Intelligent numerical formatting (no false precision / 10-decimal floats).
 * 4. Circular vector math display for Current Direction.
 * 5. Global Variable Selector dropdown synchronized with React-Three-Fiber <Canvas>.
 * 6. Interactive depth alignment provenance metadata display.
 */
export function ComparisonTable({ compact = false }) {
  // Zustand State Subscriptions
  const modelComparison = useOceanStore(selectModelComparison);
  const targetDepth = useOceanStore(selectTargetDepth);
  const setTargetDepth = useOceanStore((state) => state.setTargetDepth);
  const activeVariable = useOceanStore(selectActiveVariable);
  const setActiveVariable = useOceanStore((state) => state.setActiveVariable);
  const activeInstrument = useOceanStore(selectActiveInstrument);

  // Local filter dropdown state: 'all' or one of the 6 variable keys
  const [selectedFilter, setSelectedFilter] = useState('all');

  // Handle dropdown change: synchronize immediately with Zustand 3D store
  const handleFilterChange = (e) => {
    const value = e.target.value;
    setSelectedFilter(value);
    if (value !== 'all') {
      setActiveVariable(value);
    }
  };

  // Variable rows to display based on selected filter
  const displayedVariables = useMemo(() => {
    if (selectedFilter === 'all') {
      return SUPPORTED_VARIABLES;
    }
    return SUPPORTED_VARIABLES.filter((v) => v.key === selectedFilter);
  }, [selectedFilter]);

  // Provenance metadata
  const provenance = modelComparison?.provenance || {
    targetDepth: targetDepth ?? 15,
    observationDepth: modelComparison?.observationDepth ?? targetDepth ?? 15,
    modelDepth: modelComparison?.modelDepth ?? targetDepth ?? 15,
    matchingMethod: modelComparison?.matchingMethod ?? 'Nearest Valid',
  };

  const instrumentName = activeInstrument?.name || 'In-Situ Device';
  const isDepthLoading = modelComparison?.isLoading;

  return (
    <div className="comparison-table-wrapper" style={styles.container}>
      {/* ── HEADER / CONTROLS TOOLBAR ───────────────────────────────────── */}
      <div style={styles.toolbar}>
        <div style={styles.selectorGroup}>
          <label htmlFor="variable-selector-dropdown" style={styles.selectorLabel}>
            Variable:
          </label>
          <select
            id="variable-selector-dropdown"
            value={selectedFilter}
            onChange={handleFilterChange}
            style={styles.dropdown}
            title="Changing variable immediately updates 3D scene colormap and particle flow"
          >
            <option value="all">★ All Variables (6-Parameter Suite)</option>
            <option value="temperature">🌡️ Temperature (°C)</option>
            <option value="salinity">🧂 Salinity (PSU)</option>
            <option value="chlorophyll">🌿 Chlorophyll-a (mg/m³)</option>
            <option value="currentSpeed">🌊 Current Speed (m/s)</option>
            <option value="currentDirection">🧭 Current Direction (°)</option>
            <option value="dissolvedOxygen">🫧 Dissolved Oxygen (µmol/kg)</option>
          </select>
        </div>

        {/* Depth Provenance Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={styles.provenancePill} title="Depth alignment provenance between sensor & NetCDF grid">
            <span style={styles.provenanceLabel}>Target:</span>
            <span style={styles.provenanceValue}>{provenance.targetDepth}m</span>
            <span style={styles.provenanceDivider}>|</span>
            <span style={styles.provenanceLabel}>Obs:</span>
            <span style={styles.provenanceValue}>{provenance.observationDepth}m</span>
            <span style={styles.provenanceDivider}>|</span>
            <span style={styles.provenanceLabel}>Model:</span>
            <span style={styles.provenanceValue}>{provenance.modelDepth}m</span>
            <span style={styles.provenanceTag}>{provenance.matchingMethod}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              if (window.openSideBySideValidation) {
                window.openSideBySideValidation();
              }
            }}
            style={styles.expandSideBySideBtn}
            title="Open dedicated Side-by-Side Observation and Model panels in Right Full Panel"
          >
            <span>⚖️ Side-by-Side ↗</span>
          </button>
        </div>
      </div>

      {/* ── QUICK DEPTH FILTER STRIP ─────────────────────────────────────── */}
      <div style={styles.depthStrip}>
        <span style={styles.depthStripLabel}>Depth Filter:</span>
        {[0, 15, 50, 100, 190, 500, 1200].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setTargetDepth(d)}
            style={{
              ...styles.depthBtn,
              ...(targetDepth === d ? styles.depthBtnActive : {}),
            }}
            title={`Filter ocean validation at ${d}m`}
          >
            {d === 0 ? '0m (Sfc)' : `${d}m`}
          </button>
        ))}
      </div>

      {/* ── TABULAR VALIDATION MATRIX ───────────────────────────────────── */}
      <div style={styles.tableScroll}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Variable</th>
              <th style={{ ...styles.th, textAlign: 'center' }}>view</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>
                <span style={{ color: '#ff9436' }}>● In-Situ</span>
                <span style={styles.subHeader}> ({instrumentName})</span>
              </th>
              <th style={{ ...styles.th, textAlign: 'right' }}>
                <span style={{ color: '#38bdf8' }}>▲ NetCDF</span>
                <span style={styles.subHeader}> (ROMS/HYCOM)</span>
              </th>
              <th style={{ ...styles.th, textAlign: 'center' }}>Residual (Δ = Obs − Model)</th>
              <th style={{ ...styles.th, textAlign: 'center' }}>Validation Status</th>
            </tr>
          </thead>
          <tbody>
            {displayedVariables.map((v) => {
              const varKey = v.key;
              const obsVal = modelComparison?.observed?.[varKey];
              const modelVal = modelComparison?.model?.[varKey];
              const delta = modelComparison?.delta?.[varKey];
              const isSelected = activeVariable === varKey;

              const isMissing = obsVal == null || modelVal == null || isNaN(obsVal) || isNaN(modelVal);
              const rating = getAgreementRating(varKey, delta);

              return (
                <tr
                  key={varKey}
                  onClick={() => setActiveVariable(varKey)}
                  style={{
                    ...styles.tr,
                    ...(isSelected ? styles.trSelected : {}),
                  }}
                  title={`Click to sync 3D Canvas colormap & particles to ${v.label}`}
                >
                  {/* 1. Variable Name & Unit */}
                  <td style={styles.td}>
                    <div style={styles.varNameCell}>
                      <span style={styles.varIcon}>{getVariableIcon(varKey)}</span>
                      <div>
                        <div style={styles.varLabel}>
                          {v.label}
                          {isSelected && <span style={styles.active3dBadge}>3D Active</span>}
                        </div>
                        <div style={styles.varUnit}>{v.unit}</div>
                      </div>
                    </div>
                  </td>

                  {/* 1.5. View Checkbox */}
                  <td style={{ ...styles.td, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => setActiveVariable(isSelected ? 'all' : varKey)}
                      style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                    />
                  </td>

                  {/* 2. In-Situ Observation Value */}
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    {obsVal != null && !isNaN(obsVal) ? (
                      <span style={styles.monoValue}>
                        {formatVariableValue(varKey, obsVal)}
                      </span>
                    ) : (
                      <span style={styles.missingSensorText} title="Sensor parameter not equipped or below euphotic zone">
                        Sensor N/A
                      </span>
                    )}
                  </td>

                  {/* 3. NetCDF Model Value */}
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    {modelVal != null && !isNaN(modelVal) ? (
                      <span style={styles.monoValue}>
                        {formatVariableValue(varKey, modelVal)}
                      </span>
                    ) : (
                      <span style={styles.missingSensorText} title="NetCDF model grid point missing this parameter">
                        Model N/A
                      </span>
                    )}
                  </td>

                  {/* 4. Delta (Residual) Value */}
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    {isMissing ? (
                      <span
                        style={styles.missingBadge}
                        title="Never calculate difference if one side is missing"
                      >
                        Comparison unavailable — data missing
                      </span>
                    ) : (
                      <span
                        style={{
                          ...styles.deltaBadge,
                          ...getDeltaBadgeStyle(delta, rating.tone),
                        }}
                      >
                        {formatVariableValue(varKey, delta, true)}
                      </span>
                    )}
                  </td>

                  {/* 5. Validation Agreement Rating */}
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <span
                      style={{
                        ...styles.statusPill,
                        ...getStatusPillStyle(rating.tone),
                      }}
                    >
                      {rating.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── FOOTER / PROVENANCE AUDIT ───────────────────────────────────── */}
      <div style={styles.footer}>
        <div style={styles.footerNote}>
          <span style={{ color: 'var(--ws-cyan-primary, #00f0ff)' }}>● Angular Math:</span> Current Direction uses circular wrap-around Δθ = ((θ_obs − θ_mod + 540) % 360) − 180.
        </div>
        <div style={styles.footerSource}>
          Model Source: <span style={{ color: '#f8fafc' }}>{modelComparison?.modelSource || 'INCOIS-ROMS 1/12°'}</span>
          {isDepthLoading && <span style={styles.loadingPulse}> • Updating…</span>}
        </div>
      </div>
    </div>
  );
}

// ─── ICON HELPER ─────────────────────────────────────────────────────────────
function getVariableIcon(key) {
  switch (key) {
    case 'temperature':      return '🌡️';
    case 'salinity':         return '🧂';
    case 'chlorophyll':      return '🌿';
    case 'currentSpeed':     return '🌊';
    case 'currentDirection': return '🧭';
    case 'dissolvedOxygen':  return '🫧';
    default:                 return '📊';
  }
}

// ─── STYLING HELPERS ─────────────────────────────────────────────────────────
function getDeltaBadgeStyle(delta, tone) {
  if (tone === 'optimal') {
    return {
      color: '#34d399',
      backgroundColor: 'rgba(16, 185, 129, 0.16)',
      border: '1px solid rgba(16, 185, 129, 0.35)',
    };
  }
  if (tone === 'warning') {
    return {
      color: '#fbbf24',
      backgroundColor: 'rgba(245, 158, 11, 0.16)',
      border: '1px solid rgba(245, 158, 11, 0.35)',
    };
  }
  return {
    color: '#fb7185',
    backgroundColor: 'rgba(244, 63, 94, 0.16)',
    border: '1px solid rgba(244, 63, 94, 0.35)',
  };
}

function getStatusPillStyle(tone) {
  if (tone === 'optimal') {
    return {
      color: '#10b981',
      backgroundColor: 'rgba(16, 185, 129, 0.14)',
      borderColor: 'rgba(16, 185, 129, 0.35)',
    };
  }
  if (tone === 'warning') {
    return {
      color: '#f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.14)',
      borderColor: 'rgba(245, 158, 11, 0.35)',
    };
  }
  if (tone === 'anomaly') {
    return {
      color: '#f43f5e',
      backgroundColor: 'rgba(244, 63, 94, 0.14)',
      borderColor: 'rgba(244, 63, 94, 0.35)',
    };
  }
  return {
    color: '#94a3b8',
    backgroundColor: 'rgba(148, 163, 184, 0.10)',
    borderColor: 'rgba(148, 163, 184, 0.25)',
  };
}

// ─── COMPONENT STYLES ────────────────────────────────────────────────────────
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    background: 'rgba(5, 14, 30, 0.72)',
    backdropFilter: 'blur(16px)',
    borderRadius: '10px',
    border: '1px solid rgba(0, 229, 255, 0.22)',
    overflow: 'hidden',
    fontFamily: "'Inter', 'Outfit', sans-serif",
    fontSize: '0.74rem',
    color: '#e2e8f0',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: 'rgba(8, 22, 46, 0.85)',
    borderBottom: '1px solid rgba(0, 229, 255, 0.18)',
    gap: '10px',
    flexWrap: 'wrap',
  },
  selectorGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  selectorLabel: {
    fontSize: '0.68rem',
    color: '#94a3b8',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  dropdown: {
    background: 'rgba(15, 23, 42, 0.9)',
    border: '1px solid rgba(0, 240, 255, 0.45)',
    borderRadius: '6px',
    color: '#00f0ff',
    padding: '4px 8px',
    fontSize: '0.72rem',
    fontWeight: 600,
    outline: 'none',
    cursor: 'pointer',
    boxShadow: '0 0 10px rgba(0, 240, 255, 0.15)',
  },
  provenancePill: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '3px 8px',
    background: 'rgba(0, 229, 255, 0.08)',
    border: '1px solid rgba(0, 229, 255, 0.28)',
    borderRadius: '20px',
    fontSize: '0.64rem',
  },
  provenanceLabel: {
    color: '#94a3b8',
    fontWeight: 500,
  },
  provenanceValue: {
    color: '#f8fafc',
    fontWeight: 700,
    fontFamily: "'Space Mono', monospace",
  },
  provenanceDivider: {
    color: 'rgba(255, 255, 255, 0.2)',
  },
  provenanceTag: {
    background: 'rgba(0, 240, 255, 0.2)',
    color: '#00f0ff',
    padding: '1px 5px',
    borderRadius: '10px',
    fontSize: '0.58rem',
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  expandSideBySideBtn: {
    background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.22), rgba(56, 189, 248, 0.16))',
    border: '1px solid #00f0ff',
    color: '#00f0ff',
    borderRadius: '16px',
    padding: '3px 8px',
    fontSize: '0.62rem',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    boxShadow: '0 0 10px rgba(0, 240, 255, 0.2)',
    transition: 'all 0.15s ease',
  },
  depthStrip: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    background: 'rgba(4, 13, 28, 0.5)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    overflowX: 'auto',
  },
  depthStripLabel: {
    fontSize: '0.64rem',
    color: '#64748b',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    textTransform: 'uppercase',
  },
  depthBtn: {
    background: 'rgba(15, 23, 42, 0.7)',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    borderRadius: '4px',
    color: '#94a3b8',
    padding: '2px 7px',
    fontSize: '0.62rem',
    cursor: 'pointer',
    fontFamily: "'Space Mono', monospace",
    transition: 'all 0.15s ease',
  },
  depthBtnActive: {
    background: 'rgba(0, 240, 255, 0.22)',
    borderColor: '#00f0ff',
    color: '#00f0ff',
    fontWeight: 700,
    boxShadow: '0 0 8px rgba(0, 240, 255, 0.3)',
  },
  tableScroll: {
    overflowX: 'auto',
    maxHeight: '260px',
    overflowY: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
  },
  th: {
    padding: '7px 10px',
    fontSize: '0.62rem',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(8, 22, 46, 0.6)',
    whiteSpace: 'nowrap',
  },
  subHeader: {
    fontSize: '0.56rem',
    color: '#64748b',
    fontWeight: 400,
    textTransform: 'none',
  },
  tr: {
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  trSelected: {
    background: 'rgba(0, 229, 255, 0.12)',
    borderLeft: '3px solid #00f0ff',
  },
  td: {
    padding: '7px 10px',
    verticalAlign: 'middle',
  },
  varNameCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  varIcon: {
    fontSize: '0.9rem',
    lineHeight: 1,
  },
  varLabel: {
    fontWeight: 600,
    color: '#f8fafc',
    fontSize: '0.72rem',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  active3dBadge: {
    fontSize: '0.52rem',
    background: '#00f0ff',
    color: '#030712',
    fontWeight: 800,
    padding: '1px 4px',
    borderRadius: '3px',
    textTransform: 'uppercase',
  },
  varUnit: {
    fontSize: '0.58rem',
    color: '#64748b',
    fontFamily: "'Space Mono', monospace",
  },
  monoValue: {
    fontFamily: "'Space Mono', monospace",
    fontWeight: 700,
    fontSize: '0.72rem',
    color: '#f8fafc',
  },
  missingSensorText: {
    fontStyle: 'italic',
    color: '#64748b',
    fontSize: '0.62rem',
  },
  missingBadge: {
    display: 'inline-block',
    padding: '3px 8px',
    background: 'rgba(239, 68, 68, 0.10)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '4px',
    color: '#fca5a5',
    fontSize: '0.62rem',
    fontWeight: 600,
    fontStyle: 'italic',
  },
  deltaBadge: {
    display: 'inline-block',
    padding: '3px 9px',
    borderRadius: '5px',
    fontFamily: "'Space Mono', monospace",
    fontWeight: 800,
    fontSize: '0.72rem',
  },
  statusPill: {
    display: 'inline-block',
    padding: '2px 7px',
    borderRadius: '12px',
    fontSize: '0.58rem',
    fontWeight: 700,
    border: '1px solid transparent',
    whiteSpace: 'nowrap',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    background: 'rgba(4, 13, 28, 0.8)',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    fontSize: '0.60rem',
    color: '#64748b',
    flexWrap: 'wrap',
    gap: '6px',
  },
  footerNote: {
    fontStyle: 'normal',
  },
  footerSource: {
    fontFamily: "'Space Mono', monospace",
  },
  loadingPulse: {
    color: '#00f0ff',
    animation: 'pulse 1.5s infinite',
  },
};
