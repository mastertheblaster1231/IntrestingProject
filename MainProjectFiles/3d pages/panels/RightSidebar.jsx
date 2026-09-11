import React, { useState, useEffect } from 'react';

/**
 * RightSidebar — Argo Float Telemetry Inspector panel.
 * Migrated from the inline HTML "argoRightContainer" window.
 * Reads telemetry data from window.OCEAN_STATE and selected instrument.
 */
export function RightSidebar() {
  const [telemetry, setTelemetry] = useState({
    floatId: '2902351',
    floatName: 'Argo Float #2902351',
    subCode: 'CB01 · Coastal Observation Buoy',
    status: 'ACTIVE',
    location: 'Andaman Sea',
    locationSub: 'Port Blair',
    coords: '11.6000° N, 92.5000° E',
    observationDate: '09 Sep 2026 17:42 UTC',
    dataQuality: 'GOOD',
    source: 'ARGO / INCOIS',
    profileId: '2902351 / 147',
    temperature: '28.3 °C',
    salinity: '34.3 PSU',
    dissolvedOxygen: '198 μmol/kg',
    chlorophyll: '0.42 mg/m³',
    currentSpeed: '0.42 m/s',
    currentDirection: 'NE (42°)',
    cycle: '147',
    nextProfile: '~6 h',
    battery: '82%',
  });

  // Poll OCEAN_STATE for selected instrument updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (window.OCEAN_STATE && window.OCEAN_STATE.selectedInstrument) {
        const inst = window.OCEAN_STATE.selectedInstrument;
        setTelemetry(prev => ({
          ...prev,
          floatId: inst.id || prev.floatId,
          floatName: inst.name || prev.floatName,
          temperature: inst.temperatureC ? `${inst.temperatureC} °C` : prev.temperature,
          salinity: inst.salinityPSU ? `${inst.salinityPSU} PSU` : prev.salinity,
          status: inst.status || prev.status,
        }));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleViewProfile = () => {
    // Trigger existing toggleSubtab('profile') if available
    if (window.toggleSubtab) window.toggleSubtab('profile');
    if (window.workspaceManager) window.workspaceManager.openInstrument(`argo-${telemetry.floatId}`);
  };

  const handleCompareModel = () => {
    if (window.workspaceManager) window.workspaceManager.openInstrument(`argo-${telemetry.floatId}`);
  };

  const handleTrajectory = () => {
    if (window.toggleSubtab) window.toggleSubtab('trajectory');
  };

  return (
    <div className="sidebar-panel sidebar-panel--right">
      {/* Telemetry Header */}
      <div className="telemetry-header">
        <div className="telemetry-beacon" />
        <div className="telemetry-title-group">
          <div className="telemetry-float-name">{telemetry.floatName}</div>
          <div className="telemetry-float-sub">{telemetry.subCode}</div>
        </div>
        <span className="telemetry-status-pill">{telemetry.status}</span>
      </div>

      {/* Scrollable Body */}
      <div className="sidebar-scroll">
        {/* Location */}
        <div className="telemetry-section">
          <div className="telemetry-section__title">📍 Location</div>
          <div className="telemetry-row">
            <span className="telemetry-row__label">Location</span>
            <span className="telemetry-row__value">
              {telemetry.location}<br />
              <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>{telemetry.locationSub}</span>
            </span>
          </div>
          <div className="telemetry-row">
            <span className="telemetry-row__label">Coordinates</span>
            <span className="telemetry-row__value">{telemetry.coords}</span>
          </div>
        </div>

        {/* Observation */}
        <div className="telemetry-section">
          <div className="telemetry-section__title">📡 Observation</div>
          <div className="telemetry-row">
            <span className="telemetry-row__label">Timestamp</span>
            <span className="telemetry-row__value">{telemetry.observationDate}</span>
          </div>
          <div className="telemetry-row">
            <span className="telemetry-row__label">Data Quality</span>
            <span className="telemetry-row__value">
              <span className="qc-badge qc-badge--good">● {telemetry.dataQuality}</span>
            </span>
          </div>
          <div className="telemetry-row">
            <span className="telemetry-row__label">Source</span>
            <span className="telemetry-row__value">{telemetry.source}</span>
          </div>
          <div className="telemetry-row">
            <span className="telemetry-row__label">Profile ID</span>
            <span className="telemetry-row__value">{telemetry.profileId}</span>
          </div>
        </div>

        {/* Ocean Parameters */}
        <div className="telemetry-section">
          <div className="telemetry-section__title">🌊 Ocean Parameters (Surface)</div>
          <div className="telemetry-row">
            <span className="telemetry-row__label">Temperature</span>
            <span className="telemetry-row__value telemetry-row__value--cyan">{telemetry.temperature}</span>
          </div>
          <div className="telemetry-row">
            <span className="telemetry-row__label">Salinity</span>
            <span className="telemetry-row__value">{telemetry.salinity}</span>
          </div>
          <div className="telemetry-row">
            <span className="telemetry-row__label">Dissolved Oxygen</span>
            <span className="telemetry-row__value">{telemetry.dissolvedOxygen}</span>
          </div>
          <div className="telemetry-row">
            <span className="telemetry-row__label">Chlorophyll-a</span>
            <span className="telemetry-row__value telemetry-row__value--amber">{telemetry.chlorophyll}</span>
          </div>
        </div>

        {/* Current */}
        <div className="telemetry-section">
          <div className="telemetry-section__title">🧭 Current (at 100m)</div>
          <div className="telemetry-row">
            <span className="telemetry-row__label">Speed</span>
            <span className="telemetry-row__value">{telemetry.currentSpeed}</span>
          </div>
          <div className="telemetry-row">
            <span className="telemetry-row__label">Direction</span>
            <span className="telemetry-row__value">{telemetry.currentDirection}</span>
          </div>
        </div>

        {/* Mission */}
        <div className="telemetry-section">
          <div className="telemetry-section__title">🎯 Mission</div>
          <div className="telemetry-row">
            <span className="telemetry-row__label">Cycle</span>
            <span className="telemetry-row__value">{telemetry.cycle}</span>
          </div>
          <div className="telemetry-row">
            <span className="telemetry-row__label">Next Profile</span>
            <span className="telemetry-row__value">{telemetry.nextProfile}</span>
          </div>
          <div className="telemetry-row">
            <span className="telemetry-row__label">Battery</span>
            <span className="telemetry-row__value telemetry-row__value--amber">{telemetry.battery}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="telemetry-actions">
          <button className="telemetry-action-btn" onClick={handleViewProfile}>
            View Profile
          </button>
          <button className="telemetry-action-btn" onClick={handleCompareModel}>
            Compare Model
          </button>
          <button className="telemetry-action-btn" onClick={handleTrajectory}>
            Trajectory
          </button>
        </div>
      </div>
    </div>
  );
}

export default RightSidebar;
