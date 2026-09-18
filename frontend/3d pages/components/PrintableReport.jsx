import React from 'react';
import { createPortal } from 'react-dom';

/**
 * PrintableReport.jsx
 * A visually hidden component that becomes visible and absolute-positioned
 * during print mode, providing a clean, data-driven report of a single panel's validation state.
 */
export function PrintableReport({ snapshot }) {
  if (!snapshot) return null;

  const {
    validation,
    regionName,
    currentVector,
    generatedAt,
  } = snapshot;

  const depth = validation.depth_level || '15m';
  const obsTime = validation.time ? new Date(validation.time).toLocaleString() : '--';
  const coords = (validation.location && typeof validation.location.lat === 'number' && typeof validation.location.lon === 'number')
    ? `${validation.location.lat.toFixed(4)}°N, ${validation.location.lon.toFixed(4)}°E`
    : '--';

  // Helper for consistent formatting
  const formatVal = (val, decimals = 2) =>
    typeof val === 'number' && Number.isFinite(val) ? val.toFixed(decimals) : '--';

  // Detected Differences Thresholds
  const THRESHOLDS = {
    temp: 0.5,
    psal: 0.2,
    doxy: 15,
    chla: 0.15,
  };

  const detectedDiffs = [];
  const uniqueObsSources = new Set();
  const maxValues = {
    temp: 35,
    psal: 40,
    doxy: 350,
    chla: 5,
  };

  (validation.variables || []).forEach(v => {
    if (v.observed_source) uniqueObsSources.add(v.observed_source);
    
    if (v.observed !== null && v.model !== null) {
      if (Math.abs(v.delta) > (THRESHOLDS[v.key] || 9999)) {
        detectedDiffs.push(`${v.name} difference (|${v.delta.toFixed(2)}|) exceeds threshold of ${THRESHOLDS[v.key]}`);
      }
    }
  });

  return createPortal(
    <div id="print-report">
      <div className="print-header">
        <h1>INCOIS OCEAN ANALYSIS REPORT</h1>
        <div className="print-meta">
          <div><strong>Region:</strong> {regionName}</div>
          <div><strong>Observation Time:</strong> {obsTime}</div>
          <div><strong>Target Depth:</strong> {depth}</div>
          <div><strong>Coordinates:</strong> {coords}</div>
        </div>
      </div>

      <div className="print-section">
        <h2>Observation vs Model</h2>
        <table className="print-table">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Observed</th>
              <th>Model</th>
              <th>Delta (Δ)</th>
            </tr>
          </thead>
          <tbody>
            {(validation.variables || []).map(row => (
              <tr key={row.key}>
                <td>{row.name} {row.unit ? `(${row.unit})` : ''}</td>
                <td>{formatVal(row.observed, row.key === 'doxy' ? 1 : row.key === 'chla' ? 3 : 2)}</td>
                <td>{formatVal(row.model, 2)}</td>
                <td>{row.delta !== null ? (row.delta > 0 ? '+' : '') + row.delta.toFixed(2) : '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="print-bars">
          {(validation.variables || []).map(row => {
            if (row.observed === null || row.model === null) return null;
            const max = maxValues[row.key] || 100;
            const obsPct = Math.min(100, Math.max(0, (row.observed / max) * 100));
            const modPct = Math.min(100, Math.max(0, (row.model / max) * 100));

            return (
              <div key={`bar-${row.key}`} className="print-bar-row">
                <div className="print-bar-label">{row.name}</div>
                <div className="print-bar-track">
                  <div className="print-bar-fill obs-fill" style={{ width: `${obsPct}%` }}>
                    <span className="print-bar-text">Obs: {formatVal(row.observed)}</span>
                  </div>
                  <div className="print-bar-fill mod-fill" style={{ width: `${modPct}%` }}>
                    <span className="print-bar-text">Mod: {formatVal(row.model)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="print-section">
        <h2>Current Conditions</h2>
        {currentVector ? (
          <div>
            <div><strong>Speed:</strong> {formatVal(currentVector.speed, 2)} m/s</div>
            <div><strong>Direction:</strong> {formatVal(currentVector.direction_deg, 1)}°</div>
            <div className="print-note">(surface, geostrophic)</div>
          </div>
        ) : (
          <div>Current conditions unavailable at this location.</div>
        )}
      </div>

      <div className="print-section">
        <h2>Detected Differences</h2>
        {!validation.model?.available ? (
          <div>Model comparison unavailable for this observation.</div>
        ) : detectedDiffs.length > 0 ? (
          <ul>
            {detectedDiffs.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        ) : (
          <div>No significant anomalies detected.</div>
        )}
      </div>

      <div className="print-section print-provenance">
        <h2>Data Sources & Provenance</h2>
        <ul>
          {Array.from(uniqueObsSources).map(source => (
            <li key={source}><strong>Observation:</strong> {source}</li>
          ))}
          <li>
            <strong>Model:</strong> {validation.model?.available && validation.model?.source ? validation.model.source : 'Not configured for this panel'}
          </li>
          {currentVector?.source && (
            <li><strong>Currents:</strong> {currentVector.source}</li>
          )}
        </ul>
        <div className="print-timestamp">Report generated: {new Date(generatedAt).toLocaleString()}</div>
      </div>
    </div>,
    document.body
  );
}
