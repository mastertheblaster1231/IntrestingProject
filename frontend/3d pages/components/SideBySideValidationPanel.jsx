import React, { useState, useMemo } from 'react';
import {
  useOceanStore,
  selectModelComparison,
  selectTargetDepth,
  selectActiveVariable,
  selectActiveInstrument,
  getInstrumentComparisonData,
} from '../useOceanStore.js';
import {
  SUPPORTED_VARIABLES,
  formatVariableValue,
  getAgreementRating,
} from '../deltaMath.js';
import { DateTimePicker } from './DateTimePicker.jsx';

/**
 * SideBySideValidationPanel.jsx
 * =============================
 * Dedicated full-width/full-height side-by-side validation panel.
 * Displays:
 *  - Left: In-Situ Observation Panel (live float/glider/CTD sensor parameters)
 *  - Right: 4D NetCDF Numerical Model Panel (INCOIS-ROMS / HYCOM supercomputer forecast)
 *  - Center/Rows: Real-time Delta (Δ = Obs - Model) with circular vector math and missing-data guards.
 *
 * Synchronized with:
 *  - Global Zustand targetDepth filter
 *  - Global Zustand activeVariable (dynamically updating 3D Canvas colormaps & particles)
 *  - Global Zustand selectedTimestamp Timeline
 */
export function SideBySideValidationPanel({ onClose }) {
  // Zustand Subscriptions
  const modelComparison = useOceanStore(selectModelComparison);
  const targetDepth = useOceanStore(selectTargetDepth);
  const setTargetDepth = useOceanStore((state) => state.setTargetDepth);
  const activeVariable = useOceanStore(selectActiveVariable);
  const setActiveVariable = useOceanStore((state) => state.setActiveVariable);
  const activeInstrument = useOceanStore(selectActiveInstrument);
  const selectedTimestamp = useOceanStore((state) => state.selectedTimestamp);

  // Filter dropdown: 'all' or specific variable key
  const [selectedVarFilter, setSelectedVarFilter] = useState('all');

  const handleDropdownChange = (e) => {
    const val = e.target.value;
    setSelectedVarFilter(val);
    if (val !== 'all') {
      setActiveVariable(val);
    }
  };

  const displayedVariables = useMemo(() => {
    if (selectedVarFilter === 'all') return SUPPORTED_VARIABLES;
    return SUPPORTED_VARIABLES.filter((v) => v.key === selectedVarFilter);
  }, [selectedVarFilter]);

  // Dynamic realistic data: values realistically grow and decrease with depth and diurnal timeline
  const resolvedDepth = targetDepth ?? 15;
  const comparisonData = useMemo(() => {
    const instId = activeInstrument?.id || 'argo-2902351';
    return getInstrumentComparisonData(instId, resolvedDepth, selectedTimestamp);
  }, [activeInstrument?.id, resolvedDepth, selectedTimestamp]);

  const dynamicObs = comparisonData.observed;
  const dynamicModel = comparisonData.model;
  const dynamicDelta = comparisonData.delta;

  const provenance = {
    targetDepth: resolvedDepth,
    observationDepth: resolvedDepth,
    modelDepth: resolvedDepth,
    matchingMethod: modelComparison?.matchingMethod ?? 'Nearest Valid Grid',
  };

  const instrumentName = activeInstrument?.name || 'In-Situ Device';
  const instrumentPlatform = activeInstrument?.platform || 'Oceanographic In-Situ Sensor';
  const instrumentCoords = `${(activeInstrument?.lat ?? 11.6).toFixed(4)}°N, ${(activeInstrument?.lon ?? 92.5).toFixed(4)}°E`;
  const isDepthLoading = modelComparison?.isLoading;

  return (
    <div style={styles.container}>
      {/* ── 1. TOP HEADER & PROVENANCE BAR ────────────────────────────── */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.1rem' }}>⚖️</span>
            <div>
              <div style={styles.title}>Model vs Observation Validation Engine</div>
              <div style={styles.subtitle}>
                Dual-Pipeline Real-Time Residual Analysis (Δ = In-Situ Obs − NetCDF Model)
              </div>
            </div>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={styles.closeBtn}
              title="Close Validation Panel"
            >
              ✕ Close
            </button>
          )}
        </div>

        {/* Provenance Metadata Strip */}
        <div style={styles.provenanceBar}>
          <div style={styles.provenanceItem}>
            <span style={styles.provenanceDimLabel}>TARGET DEPTH:</span>
            <span style={styles.provenanceDimValue}>{provenance.targetDepth} m</span>
          </div>
          <span style={styles.provenanceSep}>•</span>
          <div style={styles.provenanceItem}>
            <span style={styles.provenanceDimLabel}>OBS ALIGNMENT:</span>
            <span style={styles.provenanceDimValue}>{provenance.observationDepth} m</span>
          </div>
          <span style={styles.provenanceSep}>•</span>
          <div style={styles.provenanceItem}>
            <span style={styles.provenanceDimLabel}>MODEL GRID:</span>
            <span style={styles.provenanceDimValue}>{provenance.modelDepth} m</span>
          </div>
          <span style={styles.provenanceSep}>•</span>
          <span style={styles.provenanceBadge}>{provenance.matchingMethod}</span>
          {isDepthLoading && <span style={styles.pulseText}>⏳ Aligning…</span>}
        </div>

        {/* Controls Toolbar: Variable Selector, Quick Depth Filters & Timeline DatePicker */}
        <div style={styles.controlsBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label htmlFor="side-by-side-var-select" style={styles.filterLabel}>
              Active Variable:
            </label>
            <select
              id="side-by-side-var-select"
              value={selectedVarFilter}
              onChange={handleDropdownChange}
              style={styles.selectDropdown}
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

          {/* Quick Depth Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span style={styles.filterLabel}>Depth Filter:</span>
            {[0, 15, 50, 100, 190, 500, 1200].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setTargetDepth(d);
                  if (typeof window !== 'undefined' && window.setOceanDepth) {
                    window.setOceanDepth(d / 4000);
                  }
                }}
                style={{
                  ...styles.depthFilterBtn,
                  ...(targetDepth === d ? styles.depthFilterBtnActive : {}),
                }}
              >
                {d === 0 ? '0m (Sfc)' : `${d}m`}
              </button>
            ))}
          </div>

          {/* ─────────────────────────────────────────────────────────────
              DATE PICKER / TIMELINE (White Circled Position)
             ───────────────────────────────────────────────────────────── */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            <DateTimePicker compact style={{ minWidth: '310px' }} />
          </div>
        </div>
      </div>

      {/* ── 2. SIDE-BY-SIDE DUAL PANELS CONTAINER ─────────────────────── */}
      <div style={styles.sideBySideGrid}>
        {/* ── LEFT COLUMN: IN-SITU OBSERVATION PANEL ───────────────────── */}
        <div style={styles.columnCard}>
          <div style={styles.columnHeaderObs}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={styles.beaconObs} />
              <div>
                <div style={styles.columnTitle}>In-Situ Sensor Observation</div>
                <div style={styles.columnSubtitle}>{instrumentName} • {instrumentPlatform}</div>
              </div>
            </div>
            <span style={styles.sourceTagObs}>ERDDAP GDAC</span>
          </div>

          <div style={styles.metaRow}>
            <span>📍 Location: <strong style={{ color: '#f8fafc' }}>{instrumentCoords}</strong></span>
            <span>Level: <strong style={{ color: '#ff9436', fontFamily: 'Space Mono' }}>{provenance.observationDepth} m</strong></span>
          </div>

          {/* Variable Rows for Observation */}
          <div style={styles.variableList}>
            {displayedVariables.map((v) => {
              const varKey = v.key;
              const obsVal = dynamicObs?.[varKey] ?? modelComparison?.observed?.[varKey];
              const isSelected = activeVariable === varKey;
              const isMissing = obsVal == null || isNaN(obsVal);

              return (
                <div
                  key={`obs-${varKey}`}
                  onClick={() => setActiveVariable(varKey)}
                  style={{
                    ...styles.paramCard,
                    ...(isSelected ? styles.paramCardActive : {}),
                  }}
                  title="Click to activate 3D visualization for this variable"
                >
                  <div style={styles.paramCardHeader}>
                    <span style={styles.paramIcon}>{getVariableIcon(varKey)}</span>
                    <span style={styles.paramLabel}>{v.label}</span>
                    {isSelected && <span style={styles.active3dTag}>3D ACTIVE</span>}
                  </div>

                  <div style={styles.paramValueRow}>
                    {isMissing ? (
                      <span style={styles.missingSensorBadge} title="Sensor missing or below euphotic zone">
                        Sensor N/A — Aphotic Zone
                      </span>
                    ) : (
                      <span style={styles.paramNumberObs}>
                        {formatVariableValue(varKey, obsVal)}
                      </span>
                    )}
                    <span style={styles.paramUnit}>{v.unit}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT COLUMN: 4D NETCDF SUPERCOMPUTER MODEL PANEL ────────── */}
        <div style={styles.columnCard}>
          <div style={styles.columnHeaderMod}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={styles.beaconMod} />
              <div>
                <div style={styles.columnTitle}>4D NetCDF Numerical Model</div>
                <div style={styles.columnSubtitle}>INCOIS-ROMS 1/12° Forecast Assimilation</div>
              </div>
            </div>
            <span style={styles.sourceTagMod}>4D NetCDF</span>
          </div>

          <div style={styles.metaRow}>
            <span>Grid Point: <strong style={{ color: '#f8fafc' }}>{instrumentCoords}</strong></span>
            <span>Grid Level: <strong style={{ color: '#38bdf8', fontFamily: 'Space Mono' }}>{provenance.modelDepth} m</strong></span>
          </div>

          {/* Variable Rows for Model */}
          <div style={styles.variableList}>
            {displayedVariables.map((v) => {
              const varKey = v.key;
              const modelVal = dynamicModel?.[varKey] ?? modelComparison?.model?.[varKey];
              const isSelected = activeVariable === varKey;
              const isMissing = modelVal == null || isNaN(modelVal);

              return (
                <div
                  key={`mod-${varKey}`}
                  onClick={() => setActiveVariable(varKey)}
                  style={{
                    ...styles.paramCard,
                    ...(isSelected ? styles.paramCardActive : {}),
                  }}
                  title="Click to activate 3D visualization for this variable"
                >
                  <div style={styles.paramCardHeader}>
                    <span style={styles.paramIcon}>{getVariableIcon(varKey)}</span>
                    <span style={styles.paramLabel}>{v.label} (Model)</span>
                    {isSelected && <span style={styles.active3dTag}>3D ACTIVE</span>}
                  </div>

                  <div style={styles.paramValueRow}>
                    {isMissing ? (
                      <span style={styles.missingModelBadge} title="Supercomputer grid point lacks this variable">
                        Model N/A — Aphotic Zone
                      </span>
                    ) : (
                      <span style={styles.paramNumberMod}>
                        {formatVariableValue(varKey, modelVal)}
                      </span>
                    )}
                    <span style={styles.paramUnit}>{v.unit}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 3. DELTA RESIDUAL & VALIDATION ACCORDION SECTION ───────────── */}
      <div style={styles.deltaSection}>
        <div style={styles.deltaSectionHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.9rem', color: '#00f0ff' }}>Δ</span>
            <span style={{ fontWeight: 700, fontSize: '0.78rem', color: '#f8fafc' }}>
              Real-Time Residuals & Agreement Matrix (Δ = Obs − Model)
            </span>
          </div>
          <span style={{ fontSize: '0.62rem', color: '#94a3b8' }}>
            Circular wrap-around applied for Current Direction: Δθ = ((θ_obs − θ_mod + 540) % 360) − 180
          </span>
        </div>

        <div style={styles.deltaGrid}>
          {displayedVariables.map((v) => {
            const varKey = v.key;
            const obsVal = dynamicObs?.[varKey] ?? modelComparison?.observed?.[varKey];
            const modelVal = dynamicModel?.[varKey] ?? modelComparison?.model?.[varKey];
            const delta = dynamicDelta?.[varKey] ?? modelComparison?.delta?.[varKey];
            const isMissing = obsVal == null || modelVal == null || isNaN(obsVal) || isNaN(modelVal);
            const rating = getAgreementRating(varKey, delta);

            return (
              <div key={`delta-${varKey}`} style={styles.deltaCard}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{getVariableIcon(varKey)}</span>
                    <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.72rem' }}>{v.label}</span>
                  </div>
                  <span
                    style={{
                      ...styles.ratingPill,
                      ...getRatingPillStyle(rating.tone),
                    }}
                  >
                    {rating.label}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <div style={{ fontSize: '0.64rem', color: '#94a3b8' }}>
                    Obs: <span style={{ color: '#ff9436', fontFamily: 'Space Mono' }}>{formatVariableValue(varKey, obsVal)}</span>
                    {'  '}•{'  '}
                    Model: <span style={{ color: '#38bdf8', fontFamily: 'Space Mono' }}>{formatVariableValue(varKey, modelVal)}</span>
                  </div>

                  <div>
                    {isMissing ? (
                      <span style={styles.missingDeltaAlert} title="Missing data rule: Never compute difference if one side is missing">
                        Comparison unavailable — data missing
                      </span>
                    ) : (
                      <span style={{ ...styles.deltaValue, ...getDeltaColor(delta, rating.tone) }}>
                        Δ = {formatVariableValue(varKey, delta, true)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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

function getRatingPillStyle(tone) {
  if (tone === 'optimal') {
    return {
      color: '#10b981',
      backgroundColor: 'rgba(16, 185, 129, 0.16)',
      border: '1px solid rgba(16, 185, 129, 0.4)',
    };
  }
  if (tone === 'warning') {
    return {
      color: '#f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.16)',
      border: '1px solid rgba(245, 158, 11, 0.4)',
    };
  }
  if (tone === 'anomaly') {
    return {
      color: '#f43f5e',
      backgroundColor: 'rgba(244, 63, 94, 0.16)',
      border: '1px solid rgba(244, 63, 94, 0.4)',
    };
  }
  return {
    color: '#94a3b8',
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    border: '1px solid rgba(148, 163, 184, 0.3)',
  };
}

function getDeltaColor(delta, tone) {
  if (tone === 'optimal') return { color: '#34d399' };
  if (tone === 'warning') return { color: '#fbbf24' };
  return { color: '#fb7185' };
}

// ─── COMPONENT STYLES ────────────────────────────────────────────────────────
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    background: 'transparent',
    color: '#e2e8f0',
    fontFamily: "'Inter', 'Outfit', sans-serif",
    fontSize: '0.74rem',
    overflowY: 'auto',
    padding: '12px 14px',
    boxSizing: 'border-box',
    gap: '12px',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    paddingBottom: '10px',
    borderBottom: '1px solid rgba(0, 229, 255, 0.2)',
  },
  title: {
    fontSize: '0.94rem',
    fontWeight: 800,
    color: '#f8fafc',
    letterSpacing: '0.2px',
  },
  subtitle: {
    fontSize: '0.64rem',
    color: '#94a3b8',
    marginTop: '1px',
  },
  closeBtn: {
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '5px',
    color: '#94a3b8',
    fontSize: '0.65rem',
    padding: '3px 8px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  provenanceBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(0, 229, 255, 0.08)',
    border: '1px solid rgba(0, 229, 255, 0.25)',
    borderRadius: '8px',
    padding: '5px 10px',
    fontSize: '0.64rem',
    flexWrap: 'wrap',
  },
  provenanceItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  provenanceDimLabel: {
    color: '#94a3b8',
    fontWeight: 600,
    fontSize: '0.58rem',
  },
  provenanceDimValue: {
    color: '#00f0ff',
    fontWeight: 700,
    fontFamily: 'Space Mono',
  },
  provenanceSep: {
    color: 'rgba(255, 255, 255, 0.2)',
  },
  provenanceBadge: {
    background: 'rgba(0, 240, 255, 0.22)',
    color: '#00f0ff',
    padding: '1px 6px',
    borderRadius: '10px',
    fontSize: '0.56rem',
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  pulseText: {
    color: '#38bdf8',
    fontSize: '0.62rem',
  },
  controlsBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    flexWrap: 'wrap',
    marginTop: '2px',
  },
  filterLabel: {
    fontSize: '0.64rem',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  selectDropdown: {
    background: 'rgba(15, 23, 42, 0.95)',
    border: '1px solid rgba(0, 240, 255, 0.45)',
    borderRadius: '6px',
    color: '#00f0ff',
    padding: '4px 8px',
    fontSize: '0.72rem',
    fontWeight: 600,
    outline: 'none',
    cursor: 'pointer',
    boxShadow: '0 0 12px rgba(0, 240, 255, 0.15)',
  },
  depthFilterBtn: {
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid rgba(148, 163, 184, 0.25)',
    borderRadius: '4px',
    color: '#94a3b8',
    padding: '2px 7px',
    fontSize: '0.62rem',
    cursor: 'pointer',
    fontFamily: 'Space Mono',
    transition: 'all 0.15s ease',
  },
  depthFilterBtnActive: {
    background: 'rgba(0, 240, 255, 0.25)',
    borderColor: '#00f0ff',
    color: '#00f0ff',
    fontWeight: 700,
    boxShadow: '0 0 8px rgba(0, 240, 255, 0.35)',
  },
  sideBySideGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    alignItems: 'start',
  },
  columnCard: {
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(6, 20, 44, 0.72)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    padding: '10px',
    gap: '8px',
  },
  columnHeaderObs: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: '8px',
    borderBottom: '1px solid rgba(255, 148, 54, 0.25)',
  },
  columnHeaderMod: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: '8px',
    borderBottom: '1px solid rgba(56, 189, 248, 0.25)',
  },
  beaconObs: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#ff9436',
    boxShadow: '0 0 8px #ff9436',
  },
  beaconMod: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#38bdf8',
    boxShadow: '0 0 8px #38bdf8',
  },
  columnTitle: {
    fontSize: '0.78rem',
    fontWeight: 700,
    color: '#f8fafc',
  },
  columnSubtitle: {
    fontSize: '0.60rem',
    color: '#94a3b8',
  },
  sourceTagObs: {
    fontSize: '0.55rem',
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'rgba(255, 148, 54, 0.15)',
    color: '#ff9436',
    border: '1px solid rgba(255, 148, 54, 0.3)',
    fontWeight: 700,
  },
  sourceTagMod: {
    fontSize: '0.55rem',
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'rgba(56, 189, 248, 0.15)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.3)',
    fontWeight: 700,
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.64rem',
    color: '#94a3b8',
    padding: '2px 4px',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '4px',
  },
  variableList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  paramCard: {
    display: 'flex',
    flexDirection: 'column',
    padding: '7px 9px',
    background: 'rgba(2, 9, 23, 0.65)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  paramCardActive: {
    border: '1px solid #00f0ff',
    background: 'rgba(0, 240, 255, 0.08)',
    boxShadow: '0 0 10px rgba(0, 240, 255, 0.18)',
  },
  paramCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '3px',
  },
  paramIcon: {
    fontSize: '0.82rem',
  },
  paramLabel: {
    fontSize: '0.66rem',
    fontWeight: 600,
    color: '#94a3b8',
    flex: 1,
  },
  active3dTag: {
    fontSize: '0.50rem',
    background: '#00f0ff',
    color: '#040f22',
    fontWeight: 800,
    padding: '1px 4px',
    borderRadius: '3px',
  },
  paramValueRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  paramNumberObs: {
    fontSize: '0.84rem',
    fontWeight: 800,
    fontFamily: 'Space Mono',
    color: '#ff9436',
  },
  paramNumberMod: {
    fontSize: '0.84rem',
    fontWeight: 800,
    fontFamily: 'Space Mono',
    color: '#38bdf8',
  },
  paramUnit: {
    fontSize: '0.58rem',
    color: '#64748b',
    fontFamily: 'Space Mono',
  },
  missingSensorBadge: {
    fontSize: '0.62rem',
    fontStyle: 'italic',
    color: '#f87171',
    background: 'rgba(239, 68, 68, 0.1)',
    padding: '2px 5px',
    borderRadius: '4px',
  },
  missingModelBadge: {
    fontSize: '0.62rem',
    fontStyle: 'italic',
    color: '#f87171',
    background: 'rgba(239, 68, 68, 0.1)',
    padding: '2px 5px',
    borderRadius: '4px',
  },
  deltaSection: {
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(6, 20, 44, 0.65)',
    border: '1px solid rgba(0, 229, 255, 0.2)',
    borderRadius: '10px',
    padding: '10px',
    gap: '8px',
  },
  deltaSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: '6px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    flexWrap: 'wrap',
    gap: '6px',
  },
  deltaGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  deltaCard: {
    display: 'flex',
    flexDirection: 'column',
    padding: '6px 10px',
    background: 'rgba(2, 9, 23, 0.55)',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.04)',
  },
  ratingPill: {
    fontSize: '0.56rem',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '10px',
    textTransform: 'uppercase',
  },
  missingDeltaAlert: {
    fontSize: '0.60rem',
    fontWeight: 600,
    fontStyle: 'italic',
    color: '#fca5a5',
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '4px',
    padding: '2px 6px',
  },
  deltaValue: {
    fontSize: '0.78rem',
    fontWeight: 800,
    fontFamily: 'Space Mono',
  },
};
