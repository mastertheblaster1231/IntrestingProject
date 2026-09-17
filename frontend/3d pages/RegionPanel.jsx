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

  const [hoveredFloat, setHoveredFloat] = useState(null);
  const [isInfoMaximized, setIsInfoMaximized] = useState(true);

  if (!data) return null;

  // Depth is owned by the central RegionDepthDock (per-region slider column);
  // the 3D view follows the store value directly — no local slider state here.
  const panelDepth = data.depth ?? 0;

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

  // Safe accessors for data
  const realTemp = depthSlice?.primary_oceanographic_variables?.temperature_c;
  const realSal = depthSlice?.primary_oceanographic_variables?.salinity_psu;
  const realO2 = depthSlice?.primary_oceanographic_variables?.dissolved_oxygen_umol_kg;
  const realSpeed = depthSlice?.primary_oceanographic_variables?.current_speed_m_s;
  const realChl = depthSlice?.primary_oceanographic_variables?.chlorophyll_a_mg_m3;
  
  const modTemp = validation?.variables?.find(v => v.name === 'Temp');
  const modSal = validation?.variables?.find(v => v.name === 'Salinity');
  const modO2 = validation?.variables?.find(v => v.name === 'O₂ Diss');
  const modSpeed = validation?.variables?.find(v => v.name === 'Speed');
  const modChl = validation?.variables?.find(v => v.name === 'Chl-a');

  const isLoading = isLoadingFleet || isLoadingSlice || isLoadingValidation;

  return (
    <div className="region-panel">
      <div className="region-header">
        <div className="region-name">{region.name}</div>
        <div className={`region-status ${isLoading ? 'loading' : ''}`}>
          {isLoading ? 'Fetching Data...' : 'LIVE STREAM'}
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
                      {selectedFloat.lat?.toFixed(4)}°N, {selectedFloat.lon?.toFixed(4)}°E
                    </div>
                    <div className="float-info-label" style={{ marginTop: '8px' }}>Last Telemetry</div>
                    <div className="float-info-val" style={{ fontSize: '11px' }}>
                      {selectedFloat.time ? new Date(selectedFloat.time).toLocaleString() : '--'}
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
            <tr>
              <td>Temp (°C)</td>
              <td className="val-real" style={{ textAlign: 'center' }}>{realTemp ?? '--'}</td>
              <td className="val-model" style={{ textAlign: 'center' }}>{modTemp?.model ?? '--'}</td>
              <td><DeltaBadge delta={modTemp?.delta} /></td>
            </tr>
            <tr>
              <td>Salinity (PSU)</td>
              <td className="val-real" style={{ textAlign: 'center' }}>{realSal ?? '--'}</td>
              <td className="val-model" style={{ textAlign: 'center' }}>{modSal?.model ?? '--'}</td>
              <td><DeltaBadge delta={modSal?.delta} /></td>
            </tr>
            <tr>
              <td>O₂ Diss (µmol/kg)</td>
              <td className="val-real" style={{ textAlign: 'center' }}>{realO2 ?? '--'}</td>
              <td className="val-model" style={{ textAlign: 'center' }}>{modO2?.model ?? '--'}</td>
              <td><DeltaBadge delta={modO2?.delta} /></td>
            </tr>
            <tr>
              <td>Speed (m/s)</td>
              <td className="val-real" style={{ textAlign: 'center' }}>{realSpeed ?? '--'}</td>
              <td className="val-model" style={{ textAlign: 'center' }}>{modSpeed?.model ?? '--'}</td>
              <td><DeltaBadge delta={modSpeed?.delta} /></td>
            </tr>
            <tr>
              <td>Chl-a (mg/m³)</td>
              <td className="val-real" style={{ textAlign: 'center' }}>{realChl ?? '--'}</td>
              <td className="val-model" style={{ textAlign: 'center' }}>{modChl?.model ?? '--'}</td>
              <td><DeltaBadge delta={modChl?.delta} /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
