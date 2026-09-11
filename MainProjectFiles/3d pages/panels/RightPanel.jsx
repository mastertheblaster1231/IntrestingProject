import React, { useCallback } from 'react';
import { useOceanStore, selectActiveInstrument } from '../useOceanStore.js';
import { InfoCircle } from '../components/InfoCircle.jsx';

/**
 * RightPanel.jsx — Argo & Glider Live Telemetry Inspector.
 * Subscribes strictly to activeInstrument from useOceanStore.
 * Renders an informative empty state if activeInstrument is null,
 * or a professional key-value telemetry readout of ERDDAP data if populated.
 */
export function RightPanel() {
  // Subscribe strictly to activeInstrument slice
  const activeInstrument = useOceanStore(selectActiveInstrument);
  const isLoading = useOceanStore((state) => state.isLoadingInstrument);
  const clearActiveInstrument = useOceanStore((state) => state.clearActiveInstrument);
  const fetchAndSetInstrument = useOceanStore((state) => state.fetchAndSetInstrument);

  const handleRefresh = useCallback(() => {
    if (activeInstrument?.floatId) {
      fetchAndSetInstrument(activeInstrument.floatId);
    }
  }, [activeInstrument, fetchAndSetInstrument]);

  return (
    <div className="sidebar-panel sidebar-panel--right">
      {/* Header */}
      <div className="telemetry-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className={`telemetry-beacon ${isLoading ? 'animate-pulse' : ''}`} />
          <div className="telemetry-title-group">
            <div className="telemetry-float-name">
              {activeInstrument ? activeInstrument.name : 'Telemetry Inspector'}
            </div>
            <div className="telemetry-float-sub">
              {activeInstrument ? activeInstrument.platform : 'INCOIS Ocean Observation System'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {activeInstrument && (
            <span className="telemetry-status-pill">
              {activeInstrument.status || 'ACTIVE'}
            </span>
          )}
          <InfoCircle
            title="5. Active Telemetry"
            whatItDoes="This is the live data readout for the selected oceanographic hardware."
            futureApiUse="When you click a pin, this panel parses the JSON returned from the ERDDAP server. It extracts the latest row of data and displays the exact physical measurements (Temperature, Salinity, Oxygen) recorded by that hardware instrument moments ago in the ocean."
            position="left"
          />
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="sidebar-scroll">
        {isLoading && (
          <div style={{
            padding: '12px',
            background: 'rgba(0, 229, 255, 0.08)',
            border: '1px solid rgba(0, 229, 255, 0.25)',
            borderRadius: '8px',
            marginBottom: '10px',
            fontSize: '0.72rem',
            color: 'var(--accent-cyan-bright)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
            <span>Querying INCOIS / IFREMER ERDDAP REST API...</span>
          </div>
        )}

        {/* EMPTY STATE IF NULL */}
        {!activeInstrument ? (
          <div style={{
            padding: '36px 16px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'rgba(0, 229, 255, 0.08)',
              border: '1px dashed rgba(0, 229, 255, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem',
            }}>
              🛰️
            </div>
            <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Select an instrument to view telemetry.
            </div>
            <p style={{ fontSize: '0.68rem', lineHeight: 1.5, maxWidth: 220, margin: 0 }}>
              Click on any Argo profiling float or glider pin in the 3D scene to ingest real-time physical ocean measurements.
            </p>
            <button
              className="telemetry-action-btn"
              style={{ marginTop: 8 }}
              onClick={() => fetchAndSetInstrument('2902351')}
            >
              Inspect Demo Float #2902351
            </button>
          </div>
        ) : (
          /* POPULATED PROFESSIONAL KEY-VALUE GRID */
          <>
            {/* Quick Actions Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <button
                type="button"
                className="nav-step-btn"
                onClick={handleRefresh}
                title="Re-query live ERDDAP REST API"
                style={{ fontSize: '0.65rem', padding: '3px 8px' }}
              >
                🔄 Refresh ERDDAP
              </button>
              <button
                type="button"
                className="nav-step-btn"
                onClick={clearActiveInstrument}
                title="Deselect instrument"
                style={{ fontSize: '0.65rem', padding: '3px 8px' }}
              >
                ✕ Deselect
              </button>
            </div>

            {/* Geographic Coordinates & Location */}
            <div className="telemetry-section">
              <div className="telemetry-section__title">📍 Location & Metadata</div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Coordinates</span>
                <span className="telemetry-row__value telemetry-row__value--cyan">
                  {activeInstrument.lat.toFixed(4)}°N, {activeInstrument.lon.toFixed(4)}°E
                </span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Current Depth</span>
                <span className="telemetry-row__value">
                  {activeInstrument.depth} m
                </span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Observation Time</span>
                <span className="telemetry-row__value">
                  {activeInstrument.timestamp}
                </span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Data Source</span>
                <span className="telemetry-row__value">
                  {activeInstrument.source}
                </span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">QC Status</span>
                <span className="telemetry-row__value">
                  <span className="qc-badge qc-badge--good">● {activeInstrument.qcStatus || 'GOOD'}</span>
                </span>
              </div>
            </div>

            {/* In-Situ Physical Parameters */}
            <div className="telemetry-section">
              <div className="telemetry-section__title">🌊 Live In-Situ Ocean Parameters</div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Temperature</span>
                <span className="telemetry-row__value telemetry-row__value--cyan">
                  {typeof activeInstrument.temp === 'number' ? `${activeInstrument.temp.toFixed(2)} °C` : activeInstrument.temp}
                </span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Salinity</span>
                <span className="telemetry-row__value">
                  {typeof activeInstrument.salinity === 'number' ? `${activeInstrument.salinity.toFixed(2)} PSU` : activeInstrument.salinity}
                </span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Dissolved Oxygen</span>
                <span className="telemetry-row__value">
                  {activeInstrument.dissolvedOxygen} µmol/kg
                </span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Chlorophyll-a</span>
                <span className="telemetry-row__value telemetry-row__value--amber">
                  {activeInstrument.chlorophyll} mg/m³
                </span>
              </div>
            </div>

            {/* Current & Hydrodynamics */}
            <div className="telemetry-section">
              <div className="telemetry-section__title">🧭 Current Velocity & Direction</div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Speed</span>
                <span className="telemetry-row__value">
                  {activeInstrument.currentSpeed} m/s
                </span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Direction</span>
                <span className="telemetry-row__value">
                  {activeInstrument.currentDirection}
                </span>
              </div>
            </div>

            {/* Mission Profile & Hardware */}
            <div className="telemetry-section">
              <div className="telemetry-section__title">🎯 Mission & Battery</div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Profile Cycle</span>
                <span className="telemetry-row__value">
                  #{activeInstrument.cycle}
                </span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Battery Reserve</span>
                <span className="telemetry-row__value telemetry-row__value--amber">
                  {activeInstrument.battery}%
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="telemetry-actions">
              <button
                className="telemetry-action-btn"
                onClick={() => {
                  if (window.workspaceManager) {
                    window.workspaceManager.openInstrument(activeInstrument.id);
                  }
                }}
              >
                View Profile
              </button>
              <button
                className="telemetry-action-btn"
                onClick={() => {
                  if (window.workspaceManager) {
                    window.workspaceManager.openInstrument(activeInstrument.id);
                  }
                }}
              >
                Compare Model
              </button>
              <button
                className="telemetry-action-btn"
                onClick={() => {
                  if (window.focusInstrument) {
                    window.focusInstrument(activeInstrument.id);
                  }
                }}
              >
                Focus In 3D
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default RightPanel;
