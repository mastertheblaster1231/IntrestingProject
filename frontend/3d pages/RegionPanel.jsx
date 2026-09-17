import React, { useState, useEffect } from 'react';
import { useComparisonStore } from './useComparisonStore.js';
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
  const setRegionDepth = useComparisonStore((s) => s.setRegionDepth);
  const selectFloat = useComparisonStore((s) => s.selectFloat);
  const fetchDepthSlice = useComparisonStore((s) => s.fetchDepthSlice);
  const fetchValidation = useComparisonStore((s) => s.fetchValidation);

  const [localDepth, setLocalDepth] = useState(data?.depth || 0);
  const [hoveredFloat, setHoveredFloat] = useState(null);

  // Sync local depth state when store changes externally
  useEffect(() => {
    if (data && data.depth !== localDepth) {
      setLocalDepth(data.depth);
    }
  }, [data?.depth]);

  // Debounced API calls on depth change
  useEffect(() => {
    const handler = setTimeout(() => {
      if (data && localDepth !== data.depth) {
        setRegionDepth(region.id, localDepth);
        fetchDepthSlice(region.id);
        fetchValidation(region.id);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [localDepth, region.id]);

  if (!data) return null;

  const {
    fleet,
    selectedFloat,
    depthSlice,
    validation,
    isLoadingFleet,
    isLoadingSlice,
    isLoadingValidation,
  } = data;

  const handleSliderChange = (e) => {
    setLocalDepth(Number(e.target.value));
  };

  const handleDepthInput = (e) => {
    if (e.key === 'Enter') {
      const val = parseInt(e.target.value);
      if (!isNaN(val)) setLocalDepth(Math.max(0, Math.min(4000, val)));
    }
  };

  const handleFloatChange = (e) => {
    const float = fleet.find((f) => String(f.id) === String(e.target.value));
    selectFloat(region.id, float || null);
  };

  // Find float near hovered depth
  const handleSliderHover = (e) => {
    // Basic approximation: assuming slider covers 0-4000 uniformly
    // We could calculate exact depth from clientY, but for now we'll just check if fleet is populated
    // To do an exact hover, we need geometry. A simpler approach is to find a float that matches the current depth.
    // Let's just use the selected float for info, or nearest to current depth.
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

      <div className="region-depth-section">
        <div className="depth-slider-container">
          <div className="depth-input-group">
            <input
              type="number"
              className="depth-input"
              value={localDepth}
              onChange={(e) => setLocalDepth(Number(e.target.value))}
              onKeyDown={handleDepthInput}
              min="0" max="4000"
            />
            <span className="depth-unit">m</span>
          </div>
          <input
            type="range"
            className="vertical-slider"
            min="0"
            max="4000"
            step="5"
            value={localDepth}
            onChange={handleSliderChange}
            onMouseMove={handleSliderHover}
            style={{ direction: 'rtl' }} // Hack to make bottom=0
          />
        </div>

        <div className="float-info-card">
          <div className="float-info-label">Active Float</div>
          <select value={selectedFloat?.id || ''} onChange={handleFloatChange}>
            {fleet?.map((f) => (
              <option key={f.id} value={f.id}>
                Argo #{f.platform_number || f.id}
              </option>
            ))}
          </select>
          {selectedFloat && (
            <>
              <div className="float-info-label" style={{ marginTop: '8px' }}>Coordinates</div>
              <div className="float-info-val">
                {selectedFloat.lat?.toFixed(4)}°N, {selectedFloat.lon?.toFixed(4)}°E
              </div>
              <div className="float-info-label" style={{ marginTop: '8px' }}>Last Telemetry</div>
              <div className="float-info-val" style={{ fontSize: '0.8rem' }}>
                {selectedFloat.time ? new Date(selectedFloat.time).toLocaleString() : '--'}
              </div>
            </>
          )}
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
