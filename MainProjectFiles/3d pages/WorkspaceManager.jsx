import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { FleetBar } from './FleetBar.jsx';
import { DEMO_INSTRUMENTS } from './instruments.js';
import { useOceanStore } from './useOceanStore.js';

/**
 * Procedural depth profile generator for Depth Profile Graph
 * Generates physically accurate oceanographic curves (Thermocline & Halocline)
 */
function generateDepthProfileData(surfaceTemp = 28.3, surfaceSal = 34.3, maxDepth = 2000) {
  const points = [];
  const depthSteps = [0, 10, 25, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000];

  depthSteps.forEach((depth) => {
    if (depth > maxDepth) return;

    // Thermocline exponential drop
    let temp;
    if (depth <= 50) {
      temp = surfaceTemp - (depth / 50) * 0.4;
    } else if (depth <= 200) {
      const f = (depth - 50) / 150;
      temp = (surfaceTemp - 0.4) - f * ((surfaceTemp - 0.4) - 15.5);
    } else if (depth <= 1000) {
      const factor = Math.exp(-depth / 320);
      temp = 3.8 + (surfaceTemp - 3.8) * factor;
    } else {
      const factor = Math.exp(-(depth - 1000) / 800);
      temp = 2.2 + (4.5 - 2.2) * factor * 0.6;
    }

    // Halocline with subsurface salinity maximum at ~150m
    let sal;
    if (depth <= 150) {
      sal = surfaceSal + (depth / 150) * 0.55;
    } else if (depth <= 800) {
      sal = (surfaceSal + 0.55) - ((depth - 150) / 650) * 0.35;
    } else {
      sal = 34.75 + ((depth - 800) / 1200) * 0.15;
    }

    points.push({
      depth,
      temp: parseFloat(temp.toFixed(2)),
      sal: parseFloat(sal.toFixed(2)),
    });
  });

  return points;
}

/**
 * Formats raw instrument data into complete scientific parameters matching Image 2
 */
function formatInstrumentData(inst) {
  if (!inst) return null;

  const isArgo = inst.type === 'argo';
  const isGlider = inst.type === 'glider';
  const isCtd = inst.type === 'ctd';

  const depth = inst.depthMeters || (inst.geoCoordinates?.depthM) || 15;
  const lat = inst.geoCoordinates?.lat ?? 11.6000;
  const lon = inst.geoCoordinates?.lon ?? 92.5000;

  // Temperature
  let temp = inst.telemetry?.temperatureC ?? inst.modelValidation?.obsTemp;
  if (temp === undefined) {
    if (depth <= 50) temp = 28.3;
    else if (depth <= 200) temp = 21.6;
    else if (depth <= 1000) temp = 8.5;
    else temp = 2.8;
  }

  // Salinity
  let salinity = inst.telemetry?.salinityPSU ?? inst.modelValidation?.obsSal;
  if (salinity === undefined) {
    salinity = depth <= 150 ? 34.30 : (depth <= 800 ? 34.85 : 34.78);
  }

  // Dissolved Oxygen
  let dissolvedOxygen = inst.telemetry?.dissolvedOxygen;
  if (dissolvedOxygen === undefined) {
    dissolvedOxygen = depth <= 100 ? 198 : (depth <= 600 ? 88 : 132);
  }

  // Chlorophyll-a
  let chlorophyll = inst.telemetry?.chlorophyll;
  if (chlorophyll === undefined) {
    chlorophyll = depth <= 50 ? 0.42 : (depth <= 200 ? 0.28 : 0.02);
  }

  // Current Speed & Direction
  let currentSpeed = 0.42;
  let currentDirection = 'NE (42°)';
  if (inst.telemetry?.speedKnots !== undefined) {
    currentSpeed = +(inst.telemetry.speedKnots * 0.514).toFixed(2);
  }
  if (inst.headingDeg !== undefined) {
    currentDirection = `${inst.headingDeg > 180 ? 'SW' : 'NE'} (${inst.headingDeg}°)`;
  } else if (isGlider) {
    currentDirection = 'ENE (35°)';
  } else if (isCtd) {
    currentDirection = 'SE (135°)';
  }

  const cycle = inst.telemetry?.cycle || (isArgo ? 147 : (isGlider ? 84 : 12));
  const battery = inst.telemetry?.batteryPct || 82;
  const status = (inst.telemetry?.status || 'ACTIVE').toUpperCase();
  const timestamp = inst.telemetry?.timestamp || '09 Sep 2026 17:42 UTC';
  const source = inst.telemetry?.source || (isArgo ? 'INCOIS / ARGO GDAC' : (isGlider ? 'INCOIS Glider Fleet' : 'INCOIS Moored Array'));
  const qcStatus = inst.telemetry?.qcStatus || (inst.modelValidation?.biasRating?.includes('GOLD') ? 'EXCELLENT' : 'GOOD');

  // ── Researched parameters per device type ─────────────────
  // 1. Hydrographic & Acoustic
  const seaPressureDbar = Math.round(depth * 1.006);
  // Potential Density (sigma-theta, kg/m^3)
  const potentialDensity = +(23.4 + (depth <= 200 ? (depth / 200) * 2.8 : 2.8 + (depth / 2000) * 1.45)).toFixed(2);
  // Sound Velocity (m/s - SOFAR channel minimum around 800-1000m)
  const soundVelocity = +(1540 - (depth <= 800 ? (depth / 800) * 54 : 54 - (depth / 2000) * 26)).toFixed(1);

  // 2. BGC Argo specific
  const o2Saturation = depth <= 60 ? 98 : (depth <= 500 ? 38 : 65);
  const bbp700 = (0.0022 * Math.exp(-depth / 250)).toFixed(4);
  const cdom = +(1.45 * Math.exp(-depth / 350) + 0.12).toFixed(2);
  const par = depth <= 25 ? 460 : (depth <= 90 ? 32 : 0);
  const parkingDepth = 1000;
  const maxDepth = inst.id?.includes('2902352') ? 6000 : 2000;
  const bladderDisp = depth <= 50 ? '+280 cc (Surface)' : '-150 cc (Descent)';
  const internalVacuum = '9.4 inHg (Nominal)';
  const telemetryMode = 'Iridium SBD / INCOIS GDAC';

  // 3. Underwater Glider specific
  const pitchDeg = inst.telemetry?.pitchDeg ?? (inst.telemetry?.status?.includes('climb') ? 12 : -14);
  const rollDeg = '+1.8° (Trim Stable)';
  const headingCompass = inst.headingDeg ? `${inst.headingDeg}°` : '035° (ENE)';
  const forwardSpeed = inst.telemetry?.speedKnots ? +(inst.telemetry.speedKnots * 0.514).toFixed(2) : 0.33;
  const waypoint = inst.telemetry?.missionWaypoint || 'Station Hydro-Alpha';
  const altimeter = depth >= 150 ? '48 m above seafloor' : '> 200 m (Searching)';
  const depthAveragedCurrent = '0.22 m/s @ 068°';
  const buoyancyEngine = inst.telemetry?.status?.includes('climb') ? '+260 cc (Climbing)' : '-240 cc (Gliding Dive)';
  const gliderVacuum = '680 mbar (Sealed)';
  const leakDetectors = 'FWD: DRY | AFT: DRY';
  const turbidity = +(0.42 * Math.exp(-depth / 150) + 0.08).toFixed(2);
  const emergencyWeight = 'ARMED / SECURED';

  // 4. CTD Rosette / Moored Lander specific
  const tempPrimary = +(temp).toFixed(3);
  const tempSecondary = +(temp + 0.002).toFixed(3);
  const conductivity = +(54.2 - (depth / 1000) * 18.2).toFixed(2);
  const niskinStatus = `${inst.telemetry?.activeBottlesClosed ?? 12} / 24 Closed`;
  const wireTension = `${inst.telemetry?.wireTensionKg ?? 640} kgf`;
  const castRate = `${inst.telemetry?.castRateMps ?? 1.0} m/s`;
  const beamTransmission = '94.6% (650nm)';
  const beamAttenuation = '0.058 m⁻¹';
  const deckUnitVoltage = '230 VAC / 48 VDC Line';
  const vessel = inst.telemetry?.vessel || (inst.id?.includes('02') ? 'Deep Mooring Array' : 'R/V Sagar Kanya');

  return {
    id: inst.id,
    name: inst.name,
    platform: inst.platform || (isArgo ? 'APEX Profiling Float' : (isGlider ? 'Autonomous Glider' : 'CTD Sampling Station')),
    type: inst.type || 'argo',
    isArgo,
    isGlider,
    isCtd,
    lat,
    lon,
    depth,
    temp,
    salinity,
    dissolvedOxygen,
    chlorophyll,
    currentSpeed,
    currentDirection,
    cycle,
    battery,
    status,
    timestamp,
    source,
    qcStatus,
    modelValidation: inst.modelValidation,
    rawInstrument: inst,
    // Researched properties
    seaPressureDbar,
    potentialDensity,
    soundVelocity,
    o2Saturation,
    bbp700,
    cdom,
    par,
    parkingDepth,
    maxDepth,
    bladderDisp,
    internalVacuum,
    telemetryMode,
    pitchDeg,
    rollDeg,
    headingCompass,
    forwardSpeed,
    waypoint,
    altimeter,
    depthAveragedCurrent,
    buoyancyEngine,
    gliderVacuum,
    leakDetectors,
    turbidity,
    emergencyWeight,
    tempPrimary,
    tempSecondary,
    conductivity,
    niskinStatus,
    wireTension,
    castRate,
    beamTransmission,
    beamAttenuation,
    deckUnitVoltage,
    vessel,
  };
}

/**
 * Interactive SVG Depth Profile chart (opened via View Profile)
 */
function DepthProfileView({ telemetry, onBack }) {
  const currentDepth = telemetry.depth || 15;
  const maxDepthRange = currentDepth > 1500 ? 2000 : 1000;
  const deltaT = telemetry.modelValidation?.deltaTempC ?? 0.3;

  const profilePoints = useMemo(() => {
    return generateDepthProfileData(telemetry.temp, telemetry.salinity, maxDepthRange);
  }, [telemetry.temp, telemetry.salinity, maxDepthRange]);

  const modelPoints = useMemo(() => {
    return profilePoints.map((p) => ({
      depth: p.depth,
      temp: parseFloat((p.temp - deltaT).toFixed(2)),
    }));
  }, [profilePoints, deltaT]);

  const svgWidth = 300;
  const svgHeight = 175;
  const pad = { top: 15, right: 20, bottom: 25, left: 35 };
  const plotW = svgWidth - pad.left - pad.right;
  const plotH = svgHeight - pad.top - pad.bottom;

  const tempToX = (t) => pad.left + (Math.max(0, Math.min(30, t)) / 30) * plotW;
  const depthToY = (d) => pad.top + (Math.max(0, Math.min(maxDepthRange, d)) / maxDepthRange) * plotH;

  const obsPath = profilePoints
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${tempToX(p.temp).toFixed(1)} ${depthToY(p.depth).toFixed(1)}`)
    .join(' ');

  const modelPath = modelPoints
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${tempToX(p.temp).toFixed(1)} ${depthToY(p.depth).toFixed(1)}`)
    .join(' ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          type="button"
          className="nav-step-btn"
          onClick={onBack}
          style={{ fontSize: '0.68rem', padding: '3px 8px' }}
        >
          ← Back to Telemetry
        </button>
        <span style={{ fontSize: '0.68rem', color: 'var(--accent-cyan-bright)', fontWeight: 600 }}>
          Depth Profile (0 - {maxDepthRange}m)
        </span>
      </div>

      <div style={{ background: 'rgba(2, 9, 23, 0.75)', borderRadius: 10, padding: 8, border: '1px solid rgba(0, 229, 255, 0.2)' }}>
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {[0, 500, 1000, 1500, 2000].filter((d) => d <= maxDepthRange).map((d) => (
            <g key={d}>
              <line
                x1={pad.left}
                y1={depthToY(d)}
                x2={svgWidth - pad.right}
                y2={depthToY(d)}
                stroke="rgba(255, 255, 255, 0.08)"
                strokeDasharray="2 3"
              />
              <text x={pad.left - 5} y={depthToY(d) + 3} fill="#64748b" fontSize="8" textAnchor="end" fontFamily="Space Mono">
                {d}m
              </text>
            </g>
          ))}

          <path d={modelPath} fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeDasharray="3 3" opacity="0.85" />
          <path d={obsPath} fill="none" stroke="#ff9436" strokeWidth="2.2" />

          <circle
            cx={tempToX(telemetry.temp)}
            cy={depthToY(currentDepth)}
            r="4.5"
            fill="#00f0ff"
            stroke="#ffffff"
            strokeWidth="1.5"
          />
        </svg>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 6, fontSize: '0.65rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#ff9436' }}>
            <span style={{ width: 12, height: 2, background: '#ff9436' }} /> In-Situ Obs ({telemetry.temp}°C)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#38bdf8' }}>
            <span style={{ width: 12, height: 2, background: '#38bdf8', borderTop: '1px dashed #38bdf8' }} /> Model Fit
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Model vs Observation Delta View (opened via Compare Model)
 */
function ModelCompareView({ telemetry, onBack }) {
  const model = telemetry.modelValidation || {
    modelName: 'INCOIS-ROMS 1/12° Assimilation',
    deltaTempC: 0.3,
    deltaSalPSU: -0.10,
    obsTemp: telemetry.temp,
    modelTemp: +(telemetry.temp - 0.3).toFixed(2),
    obsSal: telemetry.salinity,
    modelSal: +(telemetry.salinity + 0.10).toFixed(2),
    status: 'OPTIMAL AGREEMENT',
    confidenceScore: '98.4%',
    biasRating: 'LOW BIAS',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          type="button"
          className="nav-step-btn"
          onClick={onBack}
          style={{ fontSize: '0.68rem', padding: '3px 8px' }}
        >
          ← Back to Telemetry
        </button>
        <span style={{ fontSize: '0.68rem', color: 'var(--accent-cyan-bright)', fontWeight: 600 }}>
          {model.modelName}
        </span>
      </div>

      <div style={{ background: 'rgba(2, 9, 23, 0.75)', borderRadius: 10, padding: 12, border: '1px solid rgba(0, 229, 255, 0.2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Temperature Delta (Obs - Model)</span>
          <span style={{ fontSize: '0.76rem', fontWeight: 700, color: model.deltaTempC >= 0 ? '#4ade80' : '#f87171', fontFamily: 'Space Mono' }}>
            {model.deltaTempC >= 0 ? `+${model.deltaTempC.toFixed(2)}` : model.deltaTempC.toFixed(2)} °C
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#64748b' }}>
          <span>Obs: {model.obsTemp}°C</span>
          <span>Model: {model.modelTemp}°C</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', marginTop: 4 }}>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Salinity Delta (Obs - Model)</span>
          <span style={{ fontSize: '0.76rem', fontWeight: 700, color: model.deltaSalPSU >= 0 ? '#4ade80' : '#f87171', fontFamily: 'Space Mono' }}>
            {model.deltaSalPSU >= 0 ? `+${model.deltaSalPSU.toFixed(2)}` : model.deltaSalPSU.toFixed(2)} PSU
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#64748b' }}>
          <span>Obs: {model.obsSal} PSU</span>
          <span>Model: {model.modelSal} PSU</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTop: '1px dashed rgba(0,229,255,0.2)' }}>
          <span className="qc-badge qc-badge--good">● {model.status}</span>
          <span style={{ fontSize: '0.68rem', color: '#38bdf8', fontFamily: 'Space Mono' }}>
            Confidence: {model.confidenceScore}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Shared Telemetry Card Content (used both inside Big Box subcards and floating windows)
 */
function TelemetryCardBody({
  telemetry,
  viewMode,
  setViewMode,
  isRefreshing,
  onRefresh,
  onClose,
}) {
  return (
    <>
      {isRefreshing && (
        <div
          style={{
            padding: '8px 10px',
            background: 'rgba(0, 229, 255, 0.08)',
            border: '1px solid rgba(0, 229, 255, 0.25)',
            borderRadius: '8px',
            marginBottom: '10px',
            fontSize: '0.7rem',
            color: 'var(--accent-cyan-bright)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
          <span>Querying INCOIS / IFREMER ERDDAP REST API...</span>
        </div>
      )}

      {viewMode === 'profile' ? (
        <DepthProfileView telemetry={telemetry} onBack={() => setViewMode('telemetry')} />
      ) : viewMode === 'model' ? (
        <ModelCompareView telemetry={telemetry} onBack={() => setViewMode('telemetry')} />
      ) : (
        /* EXACT TELEMETRY CARD MATCHING IMAGE 2 WITH DEDICATED SCROLLBAR */
        <div className="fleet-dock-subcard-scroll">
          {/* Quick Actions Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, gap: 6 }}>
            <button
              type="button"
              className="nav-step-btn"
              onClick={onRefresh}
              title="Re-query live ERDDAP REST API"
              style={{ fontSize: '0.65rem', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span>🔄</span>
              <span>Refresh ERDDAP</span>
            </button>
            <button
              type="button"
              className="nav-step-btn"
              onClick={onClose}
              title="Close/Deselect"
              style={{ fontSize: '0.65rem', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span>✕</span>
              <span>Deselect</span>
            </button>
          </div>

          {/* Geographic Coordinates & Location */}
          <div className="telemetry-section">
            <div className="telemetry-section__title">📍 Location & Metadata</div>
            <div className="telemetry-row">
              <span className="telemetry-row__label">Coordinates</span>
              <span className="telemetry-row__value telemetry-row__value--cyan">
                {telemetry.lat.toFixed(4)}°N, {telemetry.lon.toFixed(4)}°E
              </span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-row__label">Current Depth</span>
              <span className="telemetry-row__value">
                {telemetry.depth} m
              </span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-row__label">Observation Time</span>
              <span className="telemetry-row__value">
                {telemetry.timestamp}
              </span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-row__label">Data Source</span>
              <span className="telemetry-row__value">
                {telemetry.source}
              </span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-row__label">QC Status</span>
              <span className="telemetry-row__value">
                <span className="qc-badge qc-badge--good">● {telemetry.qcStatus}</span>
              </span>
            </div>
          </div>

          {/* In-Situ Physical Parameters */}
          <div className="telemetry-section">
            <div className="telemetry-section__title">🌊 Live In-Situ Ocean Parameters</div>
            <div className="telemetry-row">
              <span className="telemetry-row__label">Temperature</span>
              <span className="telemetry-row__value telemetry-row__value--cyan">
                {typeof telemetry.temp === 'number' ? `${telemetry.temp.toFixed(2)} °C` : telemetry.temp}
              </span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-row__label">Salinity</span>
              <span className="telemetry-row__value">
                {typeof telemetry.salinity === 'number' ? `${telemetry.salinity.toFixed(2)} PSU` : telemetry.salinity}
              </span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-row__label">Dissolved Oxygen</span>
              <span className="telemetry-row__value">
                {telemetry.dissolvedOxygen} µmol/kg
              </span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-row__label">Chlorophyll-a</span>
              <span className="telemetry-row__value telemetry-row__value--amber">
                {typeof telemetry.chlorophyll === 'number' ? `${telemetry.chlorophyll.toFixed(2)} mg/m³` : telemetry.chlorophyll}
              </span>
            </div>
          </div>

          {/* Current & Hydrodynamics */}
          <div className="telemetry-section">
            <div className="telemetry-section__title">🧭 Current Velocity & Direction</div>
            <div className="telemetry-row">
              <span className="telemetry-row__label">Speed</span>
              <span className="telemetry-row__value">
                {telemetry.currentSpeed} m/s
              </span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-row__label">Direction</span>
              <span className="telemetry-row__value">
                {telemetry.currentDirection}
              </span>
            </div>
          </div>

          {/* Researched Device-Specific Parameters Section */}
          {telemetry.isArgo && (
            <div className="telemetry-section">
              <div className="telemetry-section__title">🧬 BGC-Argo Optics & Hydraulics</div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Sea Pressure</span>
                <span className="telemetry-row__value">{telemetry.seaPressureDbar} dbar</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Potential Density (σθ)</span>
                <span className="telemetry-row__value">{telemetry.potentialDensity} kg/m³</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Sound Velocity</span>
                <span className="telemetry-row__value">{telemetry.soundVelocity} m/s</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Oxygen Saturation</span>
                <span className="telemetry-row__value telemetry-row__value--cyan">{telemetry.o2Saturation}%</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Backscattering (bbp 700)</span>
                <span className="telemetry-row__value">{telemetry.bbp700} m⁻¹</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">CDOM Fluorescence</span>
                <span className="telemetry-row__value">{telemetry.cdom} ppb</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Downwelling PAR</span>
                <span className="telemetry-row__value telemetry-row__value--amber">{telemetry.par} µmol/m²/s</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Hydraulic Bladder</span>
                <span className="telemetry-row__value">{telemetry.bladderDisp}</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Park / Max Depth</span>
                <span className="telemetry-row__value">{telemetry.parkingDepth} / {telemetry.maxDepth} dbar</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Internal Vacuum</span>
                <span className="telemetry-row__value">{telemetry.internalVacuum}</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Link Mode</span>
                <span className="telemetry-row__value">{telemetry.telemetryMode}</span>
              </div>
            </div>
          )}

          {telemetry.isGlider && (
            <div className="telemetry-section">
              <div className="telemetry-section__title">🛸 Glider Flight Dynamics & Subsystems</div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Pitch & Roll</span>
                <span className="telemetry-row__value telemetry-row__value--cyan">{telemetry.pitchDeg}° / {telemetry.rollDeg}</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Heading / Compass</span>
                <span className="telemetry-row__value">{telemetry.headingCompass}</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Flight Speed</span>
                <span className="telemetry-row__value">{telemetry.forwardSpeed} m/s</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Target Waypoint</span>
                <span className="telemetry-row__value">{telemetry.waypoint}</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Seafloor Clearance</span>
                <span className="telemetry-row__value">{telemetry.altimeter}</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Depth-Avg Current (DAC)</span>
                <span className="telemetry-row__value telemetry-row__value--cyan">{telemetry.depthAveragedCurrent}</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Buoyancy Displacement</span>
                <span className="telemetry-row__value">{telemetry.buoyancyEngine}</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Turbidity (NTU)</span>
                <span className="telemetry-row__value">{telemetry.turbidity} NTU</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Hull Leak Detectors</span>
                <span className="telemetry-row__value telemetry-row__value--emerald">{telemetry.leakDetectors}</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Emergency Weight</span>
                <span className="telemetry-row__value">{telemetry.emergencyWeight}</span>
              </div>
            </div>
          )}

          {telemetry.isCtd && (
            <div className="telemetry-section">
              <div className="telemetry-section__title">🔬 High-Precision CTD & Water Carousel</div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Primary Temp (T1)</span>
                <span className="telemetry-row__value telemetry-row__value--cyan">{telemetry.tempPrimary} °C</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Secondary Temp (T2)</span>
                <span className="telemetry-row__value">{telemetry.tempSecondary} °C (Δ 0.002°C)</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Conductivity (C1)</span>
                <span className="telemetry-row__value">{telemetry.conductivity} mS/cm</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Potential Density (σt)</span>
                <span className="telemetry-row__value">{telemetry.potentialDensity} kg/m³</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Sound Speed (Chen-Millero)</span>
                <span className="telemetry-row__value">{telemetry.soundVelocity} m/s</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Niskin 24-Carousel</span>
                <span className="telemetry-row__value telemetry-row__value--amber">{telemetry.niskinStatus}</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Wire Tension</span>
                <span className="telemetry-row__value">{telemetry.wireTension}</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Cast Lowering Rate</span>
                <span className="telemetry-row__value">{telemetry.castRate}</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Beam Transmissometer</span>
                <span className="telemetry-row__value">{telemetry.beamTransmission} (c={telemetry.beamAttenuation})</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Vessel / Platform</span>
                <span className="telemetry-row__value">{telemetry.vessel}</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-row__label">Sea-Cable Telemetry</span>
                <span className="telemetry-row__value">{telemetry.deckUnitVoltage}</span>
              </div>
            </div>
          )}

          {/* Mission Profile & Hardware */}
          <div className="telemetry-section">
            <div className="telemetry-section__title">🎯 Mission & Battery</div>
            <div className="telemetry-row">
              <span className="telemetry-row__label">Profile Cycle</span>
              <span className="telemetry-row__value">
                #{telemetry.cycle}
              </span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-row__label">Battery Reserve</span>
              <span className="telemetry-row__value telemetry-row__value--amber">
                {telemetry.battery}%
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="telemetry-actions" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="telemetry-action-btn"
              onClick={() => setViewMode('profile')}
            >
              View Profile
            </button>
            <button
              type="button"
              className="telemetry-action-btn"
              onClick={() => setViewMode('model')}
            >
              Compare Model
            </button>
            <button
              type="button"
              className="telemetry-action-btn"
              onClick={() => {
                if (window.focusInstrument) {
                  window.focusInstrument(telemetry.id);
                }
              }}
            >
              Focus In 3D
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Sub-component card inside the Big Box Fleet Dock
 */
function DockedSubCard({
  windowData,
  onUndock,
  onClose,
  onUpdate,
}) {
  const { id, isMinimized, instrumentData } = windowData;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('telemetry');

  const activeInstrument = useOceanStore((state) => state.activeInstrument);
  const isSelected = activeInstrument?.id === windowData.instrumentId;

  const telemetry = useMemo(() => formatInstrumentData(instrumentData), [instrumentData]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1200);
  }, []);

  const handleCardClick = () => {
    useOceanStore.getState().setActiveInstrument(instrumentData);
  };

  // Handle dragging the subcard out into a floating window
  const handlePointerDownHeader = (e) => {
    if (e.target.closest('button')) return;
    handleCardClick();
    const startX = e.clientX;
    const startY = e.clientY;

    const onPointerMove = (moveEvt) => {
      // If user drags left by > 25px, pop it out into a floating window!
      if (startX - moveEvt.clientX > 25 || Math.abs(startY - moveEvt.clientY) > 40) {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        onUndock(id, moveEvt.clientX - 160, moveEvt.clientY - 20);
      }
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  if (!telemetry) return null;

  return (
    <div
      className={`fleet-dock-subcard ${isSelected ? 'selected' : ''}`}
      onClick={handleCardClick}
    >
      {/* Subcard Header */}
      <div
        className="fleet-dock-subcard-header"
        onPointerDown={handlePointerDownHeader}
        title="Click to select this instrument data, or drag out to float"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          <div
            className={`telemetry-beacon ${isRefreshing ? 'animate-pulse' : ''}`}
            style={{ width: 8, height: 8, flexShrink: 0 }}
          />
          <div className="telemetry-title-group" style={{ minWidth: 0, flex: 1 }}>
            <div
              className="telemetry-float-name"
              style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              title={telemetry.name}
            >
              {telemetry.name}
            </div>
            {!isMinimized && (
              <div
                className="telemetry-float-sub"
                style={{ fontSize: '0.62rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                title={telemetry.platform}
              >
                {telemetry.platform}
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <span
            className="telemetry-status-pill"
            style={{ fontSize: '0.58rem', padding: '2px 6px', height: 'auto', lineHeight: 1.2 }}
          >
            {telemetry.status || 'ACTIVE'}
          </span>

          {/* 3D Focus */}
          {window.focusInstrument && (
            <button
              className="win-btn focus-btn"
              onClick={(e) => {
                e.stopPropagation();
                window.focusInstrument(telemetry.id);
              }}
              title="Focus in 3D Canvas"
              style={{ width: 22, height: 22, padding: 0, fontSize: '0.68rem' }}
            >
              🎯
            </button>
          )}

          {/* Undock / Drag Out Button */}
          <button
            className="win-btn undock-btn"
            onClick={(e) => {
              e.stopPropagation();
              onUndock(id);
            }}
            title="Pop out into a floating window over 3D ocean"
            style={{ width: 22, height: 22, fontSize: '0.75rem' }}
          >
            ⤢
          </button>

          {/* Minimize / Accordion Toggle */}
          <button
            className="win-btn"
            onClick={(e) => {
              e.stopPropagation();
              onUpdate(id, { isMinimized: !isMinimized });
            }}
            title={isMinimized ? 'Expand Sub-card' : 'Collapse Sub-card'}
            style={{ width: 22, height: 22, fontSize: '0.7rem' }}
          >
            {isMinimized ? '▲' : '—'}
          </button>

          {/* Close Button */}
          <button
            className="win-btn close-btn"
            onClick={(e) => {
              e.stopPropagation();
              onClose(id);
            }}
            title="Remove from Big Box"
            style={{ width: 22, height: 22, fontSize: '0.7rem' }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Subcard Body */}
      {!isMinimized && (
        <div className="fleet-dock-subcard-body">
          <TelemetryCardBody
            telemetry={telemetry}
            viewMode={viewMode}
            setViewMode={setViewMode}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            onClose={() => onClose(id)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Floating Window (Detached from the Big Box)
 * Freely draggable anywhere, resizable, and STICKABLE back into the Big Box
 */
function FloatingWorkspaceWindow({
  windowData,
  isActive,
  bigBoxWidth,
  onFocus,
  onClose,
  onUpdate,
  onDock,
  onDragNearDock,
}) {
  const { id, x, y, width, height, zIndex, isMinimized, isMaximized, instrumentData } = windowData;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('telemetry');

  const telemetry = useMemo(() => formatInstrumentData(instrumentData), [instrumentData]);

  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });
  const resizeRef = useRef({ isResizing: false, direction: '', startX: 0, startY: 0, initW: 0, initH: 0, initX: 0, initY: 0 });

  // 1. Dragging Handlers with Stickable Dock detection
  const handlePointerDownHeader = (e) => {
    if (e.target.closest('button') || isMaximized) return;
    onFocus(id);

    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      initialX: x,
      initialY: y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMoveHeader = (e) => {
    if (!dragRef.current.isDragging || isMaximized) return;

    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    const newX = Math.max(0, Math.min(window.innerWidth - width - 10, dragRef.current.initialX + dx));
    const newY = Math.max(50, Math.min(window.innerHeight - 60, dragRef.current.initialY + dy));

    // Check if dragging near the Big Box on the right side ("stickable" zone)
    const isNearDock = e.clientX > window.innerWidth - bigBoxWidth - 70;
    onDragNearDock(isNearDock);

    onUpdate(id, { x: newX, y: newY });
  };

  const handlePointerUpHeader = (e) => {
    if (dragRef.current.isDragging) {
      dragRef.current.isDragging = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {}

      // If dropped near the Big Box, stick it right back inside as a sub-component!
      const isNearDock = e.clientX > window.innerWidth - bigBoxWidth - 70;
      onDragNearDock(false);

      if (isNearDock) {
        onDock(id);
      }
    }
  };

  // 2. Resizing Handlers
  const startResize = (e, direction) => {
    e.stopPropagation();
    onFocus(id);

    resizeRef.current = {
      isResizing: true,
      direction,
      startX: e.clientX,
      startY: e.clientY,
      initW: width,
      initH: height,
      initX: x,
      initY: y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onResizePointerMove = (e) => {
    if (!resizeRef.current.isResizing || isMaximized) return;

    const { direction, startX, startY, initW, initH, initX, initY } = resizeRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let newW = initW;
    let newH = initH;
    let newX = initX;
    let newY = initY;

    const MIN_W = 280;
    const MIN_H = 220;

    if (direction.includes('right')) {
      newW = Math.max(MIN_W, Math.min(window.innerWidth - initX - 20, initW + dx));
    } else if (direction.includes('left')) {
      const possibleW = initW - dx;
      if (possibleW >= MIN_W) {
        newW = possibleW;
        newX = initX + dx;
      }
    }

    if (direction.includes('bottom')) {
      newH = Math.max(MIN_H, Math.min(window.innerHeight - initY - 30, initH + dy));
    } else if (direction.includes('top')) {
      const possibleH = initH - dy;
      if (possibleH >= MIN_H) {
        newH = possibleH;
        newY = initY + dy;
      }
    }

    onUpdate(id, { width: newW, height: newH, x: newX, y: newY });
  };

  const onResizePointerUp = (e) => {
    if (resizeRef.current.isResizing) {
      resizeRef.current.isResizing = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
  };

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1200);
  }, []);

  if (!telemetry) return null;

  const windowStyle = isMaximized
    ? {
        top: '65px',
        left: '20px',
        width: 'calc(100vw - 40px)',
        height: 'calc(100vh - 140px)',
        zIndex,
      }
    : {
        top: `${y}px`,
        left: `${x}px`,
        width: `${width}px`,
        height: isMinimized ? '46px' : `${height}px`,
        zIndex,
      };

  return (
    <div
      className={`workspace-window ${isActive ? 'active' : ''} ${isMinimized ? 'minimized' : ''}`}
      style={windowStyle}
      onPointerDown={() => onFocus(id)}
    >
      {/* Header Drag Bar with Stick/Dock button */}
      <div
        className="window-header"
        onPointerDown={handlePointerDownHeader}
        onPointerMove={handlePointerMoveHeader}
        onPointerUp={handlePointerUpHeader}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          height: 46,
          background: 'linear-gradient(90deg, rgba(8, 25, 52, 0.95), rgba(4, 16, 36, 0.98))',
          borderBottom: isMinimized ? 'none' : '1px solid rgba(0, 229, 255, 0.22)',
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          <div
            className={`telemetry-beacon ${isRefreshing ? 'animate-pulse' : ''}`}
            style={{ width: 8, height: 8, flexShrink: 0 }}
          />
          <div className="telemetry-title-group" style={{ minWidth: 0, flex: 1 }}>
            <div
              className="telemetry-float-name"
              style={{ fontSize: '0.84rem', fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              title={telemetry.name}
            >
              {telemetry.name}
            </div>
            {!isMinimized && (
              <div
                className="telemetry-float-sub"
                style={{ fontSize: '0.64rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                title={telemetry.platform}
              >
                {telemetry.platform}
              </div>
            )}
          </div>
        </div>

        {/* Header Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          {/* Stick / Dock back into Big Box button */}
          <button
            className="win-btn stick-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDock(id);
            }}
            title="Stick back into Big Box as a sub-component"
            style={{ width: 'auto', padding: '0 8px', fontSize: '0.68rem', fontWeight: 700, gap: 4 }}
          >
            <span>📌</span>
            <span>Stick</span>
          </button>

          {/* 3D Focus */}
          {window.focusInstrument && (
            <button
              className="win-btn focus-btn"
              onClick={(e) => {
                e.stopPropagation();
                window.focusInstrument(telemetry.id);
              }}
              title="Focus in 3D Canvas"
              style={{ width: 24, height: 24, padding: 0, fontSize: '0.7rem' }}
            >
              🎯
            </button>
          )}

          {/* Minimize / Restore */}
          <button
            className="win-btn"
            onClick={(e) => {
              e.stopPropagation();
              onUpdate(id, { isMinimized: !isMinimized });
            }}
            title={isMinimized ? 'Expand Window' : 'Minimize Window (more space to view)'}
            style={{ width: 24, height: 24, fontSize: '0.75rem' }}
          >
            <span>{isMinimized ? '▲' : '—'}</span>
          </button>

          {/* Close / Wrong button */}
          <button
            className="win-btn close-btn"
            onClick={(e) => {
              e.stopPropagation();
              onClose(id);
            }}
            title="Close Window"
            style={{ width: 24, height: 24, fontSize: '0.75rem' }}
          >
            <span>✕</span>
          </button>
        </div>
      </div>

      {/* Floating Window Body */}
      {!isMinimized && (
        <div
          className="sidebar-scroll"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 14px',
            background: 'rgba(6, 18, 38, 0.94)',
          }}
        >
          <TelemetryCardBody
            telemetry={telemetry}
            viewMode={viewMode}
            setViewMode={setViewMode}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            onClose={() => onClose(id)}
          />
        </div>
      )}

      {/* Resize Grip Handle at bottom-right */}
      {!isMaximized && !isMinimized && (
        <div
          onPointerDown={(e) => startResize(e, 'bottom-right')}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          title="Drag to resize window"
          style={{
            position: 'absolute',
            bottom: 2,
            right: 2,
            width: 14,
            height: 14,
            cursor: 'nwse-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="9" y1="2" x2="2" y2="9" stroke="rgba(0, 229, 255, 0.6)" strokeWidth="1.5" />
            <line x1="9" y1="6" x2="6" y2="9" stroke="rgba(0, 229, 255, 0.6)" strokeWidth="1.5" />
          </svg>
        </div>
      )}

      {/* 8-Direction Resize Edges */}
      {!isMaximized && !isMinimized && (
        <>
          <div className="resize-handle top" onPointerDown={(e) => startResize(e, 'top')} onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="resize-handle bottom" onPointerDown={(e) => startResize(e, 'bottom')} onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="resize-handle left" onPointerDown={(e) => startResize(e, 'left')} onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="resize-handle right" onPointerDown={(e) => startResize(e, 'right')} onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="resize-handle top-left" onPointerDown={(e) => startResize(e, 'top-left')} onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="resize-handle top-right" onPointerDown={(e) => startResize(e, 'top-right')} onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="resize-handle bottom-left" onPointerDown={(e) => startResize(e, 'bottom-left')} onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="resize-handle bottom-right" onPointerDown={(e) => startResize(e, 'bottom-right')} onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
        </>
      )}
    </div>
  );
}

/**
 * ============================================================================
 * MAIN WORKSPACE MANAGER COMPONENT
 * ============================================================================
 * Implements the Big Box Fleet Dock with stickable & draggable sub-components.
 */
export function WorkspaceManager({ instruments = [] }) {
  const allInstruments = instruments.length > 0 ? instruments : DEMO_INSTRUMENTS;

  // Initialize with the primary demo instrument docked in the Big Box
  const [windows, setWindows] = useState(() => {
    const firstInst = (instruments.length > 0 ? instruments : DEMO_INSTRUMENTS)[0];
    if (!firstInst) return [];
    return [
      {
        id: `win-${firstInst.id}-default`,
        instrumentId: firstInst.id,
        isDocked: true,
        title: firstInst.name,
        subtitle: firstInst.platform,
        type: firstInst.type,
        x: 40,
        y: 80,
        width: 340,
        height: 480,
        zIndex: 100,
        isMinimized: false,
        isMaximized: false,
        instrumentData: firstInst,
      },
    ];
  });
  const [activeWindowId, setActiveWindowId] = useState(null);
  const nextZIndexRef = useRef(100);

  // Big Box State
  const [isBigBoxMinimized, setIsBigBoxMinimized] = useState(false);
  const [bigBoxWidth, setBigBoxWidth] = useState(370);
  const [isDragOverDock, setIsDragOverDock] = useState(false);

  // Sync Big Box width to CSS custom property for layout calculation
  useEffect(() => {
    const effectiveWidth = isBigBoxMinimized ? 52 : bigBoxWidth;
    document.documentElement.style.setProperty('--big-box-width', `${effectiveWidth}px`);
    return () => {
      document.documentElement.style.removeProperty('--big-box-width');
    };
  }, [isBigBoxMinimized, bigBoxWidth]);

  // Split into docked sub-components vs floating windows
  const dockedWindows = useMemo(() => windows.filter((w) => w.isDocked), [windows]);
  const floatingWindows = useMemo(() => windows.filter((w) => !w.isDocked), [windows]);

  // Bring a window to front
  const focusWindow = useCallback((winId) => {
    setActiveWindowId(winId);
    nextZIndexRef.current += 1;
    setWindows((prev) =>
      prev.map((w) =>
        w.id === winId
          ? { ...w, zIndex: nextZIndexRef.current, isMinimized: false }
          : w
      )
    );
  }, []);

  // Open an instrument into the Big Box as a sub-component (ADDED TO TOP OF STACK!)
  const openInstrument = useCallback(
    (instrumentId) => {
      const inst =
        allInstruments.find((i) => i.id === instrumentId) ||
        allInstruments.find((i) => i.id.includes(instrumentId) || instrumentId.includes(i.id));

      if (!inst) return;

      // Expand Big Box if it was minimized
      setIsBigBoxMinimized(false);

      // Instantly sync active instrument to global store so bottom dock updates immediately
      useOceanStore.getState().setActiveInstrument(inst);

      const existingWin = windows.find((w) => w.instrumentId === inst.id);
      if (existingWin) {
        // Bring to front, un-minimize, and move to TOP of stack
        focusWindow(existingWin.id);
        setWindows((prev) => [
          { ...existingWin, isMinimized: false },
          ...prev.filter((w) => w.id !== existingWin.id),
        ]);
        return;
      }

      nextZIndexRef.current += 1;
      const winId = `win-${inst.id}-${Date.now()}`;

      // Newly opened instruments start docked inside the Big Box as sub-components
      const newWin = {
        id: winId,
        instrumentId: inst.id,
        isDocked: true,
        title: inst.name,
        subtitle: inst.platform,
        type: inst.type,
        x: Math.max(20, window.innerWidth - bigBoxWidth - 360),
        y: 80,
        width: 340,
        height: 480,
        zIndex: nextZIndexRef.current,
        isMinimized: false,
        isMaximized: false,
        instrumentData: inst,
      };

      // ADD TO TOP OF STACK!
      setWindows((prev) => [newWin, ...prev]);
      setActiveWindowId(winId);
    },
    [allInstruments, windows, bigBoxWidth, focusWindow]
  );

  // Close / Remove a window or subcard
  const closeWindow = useCallback((winId) => {
    setWindows((prev) => prev.filter((w) => w.id !== winId));
  }, []);

  // Update properties of a window
  const updateWindow = useCallback((winId, patch) => {
    setWindows((prev) => prev.map((w) => (w.id === winId ? { ...w, ...patch } : w)));
  }, []);

  // Undock a card from the Big Box -> becomes a floating draggable window
  const undockCard = useCallback((winId, startX, startY) => {
    nextZIndexRef.current += 1;
    const defaultFloatingX = startX !== undefined ? startX : Math.max(20, window.innerWidth - bigBoxWidth - 360);
    const defaultFloatingY = startY !== undefined ? startY : 80;

    setWindows((prev) =>
      prev.map((w) =>
        w.id === winId
          ? {
              ...w,
              isDocked: false,
              x: defaultFloatingX,
              y: defaultFloatingY,
              zIndex: nextZIndexRef.current,
              isMinimized: false,
            }
          : w
      )
    );
    setActiveWindowId(winId);
  }, [bigBoxWidth]);

  // Dock a floating window back into the Big Box as a sub-component
  const dockWindow = useCallback((winId) => {
    setIsBigBoxMinimized(false);
    setIsDragOverDock(false);
    setWindows((prev) =>
      prev.map((w) =>
        w.id === winId
          ? { ...w, isDocked: true, isMinimized: false }
          : w
      )
    );
  }, []);

  // Left-edge resizing of the Big Box
  const handleBigBoxResizeStart = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = bigBoxWidth;

    const onPointerMove = (moveEvt) => {
      const dx = startX - moveEvt.clientX;
      const newW = Math.max(300, Math.min(580, startW + dx));
      setBigBoxWidth(newW);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Close all windows
  const closeAll = useCallback(() => {
    setWindows([]);
    setActiveWindowId(null);
  }, []);

  // Minimize all
  const minimizeAll = useCallback((shouldMinimize) => {
    setIsBigBoxMinimized(shouldMinimize);
    setWindows((prev) => prev.map((w) => ({ ...w, isMinimized: shouldMinimize })));
  }, []);

  // Expose bridge on window for Three.js integration
  useEffect(() => {
    window.workspaceManager = {
      openInstrument,
      focusWindow,
      closeWindow,
      openWindowsCount: windows.length,
    };
  }, [openInstrument, focusWindow, closeWindow, windows.length]);

  return (
    <>
      {/* 1. Floating Detached Windows (Freely draggable over 3D Canvas) */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {floatingWindows.map((win) => (
          <FloatingWorkspaceWindow
            key={win.id}
            windowData={win}
            isActive={win.id === activeWindowId}
            bigBoxWidth={bigBoxWidth}
            onFocus={focusWindow}
            onClose={closeWindow}
            onUpdate={updateWindow}
            onDock={dockWindow}
            onDragNearDock={setIsDragOverDock}
          />
        ))}
      </div>

      {/* 2. THE BIG BOX (Right Dock Panel with Sub-Component Cards) */}
      <div
        className={`fleet-dock-container ${isBigBoxMinimized ? 'minimized' : ''} ${isDragOverDock ? 'drop-active' : ''}`}
        style={{
          width: isBigBoxMinimized ? 'auto' : `${bigBoxWidth}px`,
        }}
      >
        {/* Left Resize Handle for Big Box */}
        {!isBigBoxMinimized && (
          <div
            className="fleet-dock-resize-handle"
            onPointerDown={handleBigBoxResizeStart}
            title="Drag left/right to resize Big Box"
          />
        )}

        {/* Big Box Header */}
        <div className="fleet-dock-header">
          <div className="fleet-dock-title-group">
            <span style={{ fontSize: '1.1rem' }}>📡</span>
            <div className="fleet-dock-title">Sector Fleet Telemetry</div>
            <span className="fleet-dock-badge">
              {dockedWindows.length} Docked
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Minimize / Expand Big Box Button */}
            <button
              className="win-btn"
              onClick={() => setIsBigBoxMinimized((prev) => !prev)}
              title={isBigBoxMinimized ? 'Expand Big Box' : 'Minimize Big Box (more space for 3D view)'}
              style={{ width: 26, height: 26, fontSize: '0.75rem' }}
            >
              <span>{isBigBoxMinimized ? '▲' : '—'}</span>
            </button>

            {/* Close All Docked */}
            {dockedWindows.length > 0 && !isBigBoxMinimized && (
              <button
                className="win-btn close-btn"
                onClick={() => setWindows((prev) => prev.filter((w) => !w.isDocked))}
                title="Clear All Docked Cards"
                style={{ width: 26, height: 26, fontSize: '0.75rem' }}
              >
                <span>✕</span>
              </button>
            )}
          </div>
        </div>

        {/* Drop Zone Indicator when dragging a floating window near the Big Box */}
        {!isBigBoxMinimized && isDragOverDock && (
          <div style={{ padding: '8px 12px 0 12px' }}>
            <div className="fleet-dock-drop-indicator">
              <span>📌</span>
              <span>Release to dock back inside Big Box!</span>
            </div>
          </div>
        )}

        {/* Scrollable Sub-Components Container */}
        {!isBigBoxMinimized && (
          <div className="fleet-dock-scroll">
            {dockedWindows.length === 0 ? (
              <div
                style={{
                  padding: '36px 16px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    background: 'rgba(0, 229, 255, 0.08)',
                    border: '1px dashed rgba(0, 229, 255, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.4rem',
                  }}
                >
                  🛰️
                </div>
                <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Big Box is Ready
                </div>
                <p style={{ fontSize: '0.7rem', lineHeight: 1.5, maxWidth: 240, margin: 0 }}>
                  Click on any instrument chip in the bottom <strong>Sector Fleet</strong> bar or <strong>+ Add Instrument</strong> to dock telemetry sub-cards here.
                </p>
                <button
                  type="button"
                  className="telemetry-action-btn"
                  style={{ marginTop: 8 }}
                  onClick={() => openInstrument('argo-2902351')}
                >
                  Inspect Demo Float #2902351
                </button>
              </div>
            ) : (
              dockedWindows.map((win) => (
                <DockedSubCard
                  key={win.id}
                  windowData={win}
                  onUndock={undockCard}
                  onClose={closeWindow}
                  onUpdate={updateWindow}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* 3. FleetBar Component with '+' Button & Multi-Window Tools */}
      <FleetBar
        instruments={allInstruments}
        openWindows={windows}
        onOpenInstrument={openInstrument}
        onFocusWindow={focusWindow}
        onTileSideBySide={() => {
          // Undock first two cards and tile them floating
          if (dockedWindows.length >= 2) {
            undockCard(dockedWindows[0].id, 40, 80);
            undockCard(dockedWindows[1].id, 400, 80);
          }
        }}
        onTileGrid={() => {}}
        onMinimizeAll={minimizeAll}
        onCloseAll={closeAll}
      />
    </>
  );
}

export default WorkspaceManager;
