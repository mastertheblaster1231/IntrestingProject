import React, { useState } from 'react';
import { useComparisonStore } from './useComparisonStore.js';
import { ComparisonOceanSurface } from './ComparisonOceanSurface.jsx';
import './ComparisonWindow.css';

/**
 * Helper to style delta values
 */
function DeltaBadge({ delta }) {
  if (delta == null || isNaN(delta)) return <span>--</span>;
  const abs = Math.abs(delta);
  let colorClass = 'delta-good';
  if (abs > 1.5) colorClass = 'delta-bad';
  else if (abs > 0.5) colorClass = 'delta-warn';
  const sign = delta > 0 ? '+' : '';
  return <span className={`val-delta ${colorClass}`}>{sign}{delta.toFixed(2)}</span>;
}

export function RegionPanel({ region }) {
  const data = useComparisonStore((s) => s.regionData[region.id]);
  const selectFloat = useComparisonStore((s) => s.selectFloat);
  const setRegionTimestamp = useComparisonStore((s) => s.setRegionTimestamp);
  const fetchDepthSlice = useComparisonStore((s) => s.fetchDepthSlice);
  const fetchValidation = useComparisonStore((s) => s.fetchValidation);

  const [hoveredFloat, setHoveredFloat] = useState(null);
  const [isInfoMaximized, setIsInfoMaximized] = useState(true);

  if (!data) return null;

  // Depth is owned by the central RegionDepthDock (per-region slider column);
  // the 3D view follows the store value directly — no local slider state here.
  const panelDepth = data.depth ?? 15;

  const {
    fleet,
    selectedFloat,
    depthSlice,
    validation,
    isLoadingFleet,
    isLoadingSlice,
    isLoadingValidation,
  } = data;

  const handleFloatChange = (e) => {
    const float = fleet.find((f) => String(f.id) === String(e.target.value));
    selectFloat(region.id, float || null);
  };

  const handleTimestampChange = (e) => {
    const val = e.target.value;
    const iso = val ? new Date(val).toISOString() : null;
    setRegionTimestamp(region.id, iso);
    // Fetch immediately on time selection
    fetchDepthSlice(region.id);
    fetchValidation(region.id);
  };

  const clearTimestamp = () => {
    setRegionTimestamp(region.id, null);
    fetchDepthSlice(region.id);
    fetchValidation(region.id);
  };

  const formatVal = (val, decimals = 2) =>
    typeof val === 'number' && Number.isFinite(val) ? val.toFixed(decimals) : '--';

  const getLocalDatetimeString = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const isLoading = isLoadingFleet || isLoadingSlice || isLoadingValidation;

  return (
    <div className="region-panel">
      <div className="region-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="region-name">{region.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input 
              type="datetime-local" 
              value={getLocalDatetimeString(data.timestamp)} 
              onChange={handleTimestampChange}
              style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid rgba(0,240,255,0.3)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}
            />
            {data.timestamp && (
              <button 
                onClick={clearTimestamp}
                style={{ background: 'transparent', color: '#00f0ff', border: '1px solid rgba(0,240,255,0.5)', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}
              >
                Live
              </button>
            )}
          </div>
        </div>
        <div className={`region-status ${isLoading ? 'loading' : ''}`}>
          {isLoading ? 'Fetching Data...' : data.timestamp ? 'HISTORICAL' : 'LIVE STREAM'}
        </div>
      </div>

      <div className="region-depth-section" style={{ position: 'relative', height: '300px', minHeight: '300px', width: '100%', overflow: 'hidden', padding: '16px', display: 'flex', flexDirection: 'row', gap: '16px' }}>
        <ComparisonOceanSurface
          panelId={region.id}
          depth={panelDepth}
          platformId={selectedFloat?.platform_number || selectedFloat?.id || null}
        />

        {/* Depth is driven by the central RegionDepthDock slider column;
            the live depth is mirrored on the 3D badge overlay. */}

        {/* Top-left edge: Active Float dropdown card, pinned over the 3D viewport */}
        <div style={{ position: 'absolute', top: '12px', left: '52px', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: '230px' }}>
          <div className="float-info-card" style={{ transition: 'all 0.3s ease', padding: '12px', background: 'rgba(5, 12, 26, 0.85)', border: '1px solid rgba(0, 240, 255, 0.2)', borderRadius: '8px', backdropFilter: 'blur(4px)' }}>
            
            {/* Header with Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isInfoMaximized ? '8px' : '0' }}>
              <div className="float-info-label" style={{ margin: 0 }}>Active Float Icon</div>
              <button 
                onClick={() => setIsInfoMaximized(!isInfoMaximized)}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '10px' }}
              >
                {isInfoMaximized ? '-' : '+'}
              </button>
            </div>

            {/* Collapsible Content */}
            {isInfoMaximized && (
              <>
                <select value={selectedFloat?.id || ''} onChange={handleFloatChange} style={{ width: '100%', background: 'rgba(0,0,0,0.5)', color: '#00f0ff', border: '1px solid rgba(0,240,255,0.2)', padding: '4px', borderRadius: '4px', fontSize: '12px' }}>
                  {fleet?.map((f) => (
                    <option key={f.id} value={f.id}>
                      Argo #{f.platform_number || f.id}
                    </option>
                  ))}
                </select>
                {selectedFloat && (
                  <div style={{ marginTop: '12px' }}>
                    <div className="float-info-label">Coordinates</div>
                    <div className="float-info-val" style={{ fontSize: '12px' }}>
                      {validation?.location?.lat?.toFixed(4) ?? selectedFloat.lat?.toFixed(4)}°N, {validation?.location?.lon?.toFixed(4) ?? selectedFloat.lon?.toFixed(4)}°E
                    </div>
                    {data.timestamp && validation?.time && Math.abs(new Date(validation.time) - new Date(data.timestamp)) > 86400000 && (
                      <div style={{ fontSize: '10px', color: '#fbbf24', marginTop: '4px', lineHeight: '1.2' }}>
                        Nearest cycle: {new Date(validation.time).toLocaleDateString()} ({Math.round(Math.abs(new Date(validation.time) - new Date(data.timestamp)) / 86400000)} days from requested)
                      </div>
                    )}
                    <div className="float-info-label" style={{ marginTop: '8px' }}>Cycle Time</div>
                    <div className="float-info-val" style={{ fontSize: '11px' }}>
                      {validation?.time ? new Date(validation.time).toLocaleString() : '--'}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="region-data-section">
        <table className="data-table">
          <thead>
            <tr>
              <th>Parameter</th>
              <th style={{ textAlign: 'center' }}>Real (ERDDAP)</th>
              <th style={{ textAlign: 'center' }}>ROMS 1/12°</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody>
            {validation?.variables?.map(row => (
              <tr key={row.key}>
                <td>{row.name} {row.unit ? `(${row.unit})` : ''}</td>
                <td className="val-real" style={{ textAlign: 'center' }} title={row.reason ?? ''}>
                  {formatVal(row.observed, row.key === 'doxy' ? 1 : row.key === 'chla' ? 3 : 2)}
                </td>
                <td className="val-model" style={{ textAlign: 'center' }}>
                  {formatVal(row.model, 2)}
                </td>
                <td><DeltaBadge delta={row.delta} /></td>
              </tr>
            )) || (
              <tr>
                <td colSpan="4" style={{ textAlign: 'center', padding: '12px', color: '#94a3b8' }}>
                  Awaiting Data...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
