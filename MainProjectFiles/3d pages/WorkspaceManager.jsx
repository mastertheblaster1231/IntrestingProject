import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { FleetBar } from './FleetBar.jsx';
import { DEMO_INSTRUMENTS } from './instruments.js';
import { useOceanStore } from './useOceanStore.js';
import { SideBySideValidationPanel } from './components/SideBySideValidationPanel.jsx';
import {
  calculateRealisticModelProfile,
  calculateRealisticObservedProfile,
  calculateDelta,
  formatVariableValue,
  getAgreementRating,
} from './deltaMath.js';

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
/**
 * Lightweight 1-second interval hook for real-time sensor updates and glider kinematics
 */
function useLiveOceanTime() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((prev) => (prev + 1) % 10000);
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  return tick;
}

/**
 * Formats raw instrument data into complete dynamic scientific parameters.
 * Responds dynamically when the user dives into the deep ocean or changes the depth slider.
 */
function formatInstrumentData(inst, oceanDepth = 15, liveTick = 0, horizontalDist = 0, isSelected = false) {
  if (!inst) return null;

  const isArgo = inst.type === 'argo';
  const isGlider = inst.type === 'glider';
  const isCtd = inst.type === 'ctd';

  let lat = inst.geoCoordinates?.lat ?? 11.6000;
  let lon = inst.geoCoordinates?.lon ?? 92.5000;

  // ── 1. DYNAMIC DEPTH RESOLUTION ──────────────────────────────────────────
  let depth = 15;
  let isGlidingDive = true;
  let pitchDeg = -14.5;
  let buoyancyEngine = '-240 cc (Gliding Dive)';
  let gliderStatus = 'GLIDING-DESCENT';
  let forwardSpeed = 0.35;

  if (isGlider) {
    if (isSelected) {
      // Direct slider control when Slocum Glider is actively selected
      depth = Math.max(0, Math.min(4000, Math.round(oceanDepth)));
      if (horizontalDist > 0) {
        lat = +(lat + horizontalDist * 0.0035).toFixed(4);
        lon = +(lon + horizontalDist * 0.0055).toFixed(4);
      }
      const isDive = depth >= (inst.depthMeters || 190);
      isGlidingDive = isDive;
      pitchDeg = isDive ? -14.5 : +12.2;
      buoyancyEngine = isDive ? '-240 cc (Negative Buoyancy)' : '+260 cc (Positive Buoyancy)';
      gliderStatus = isDive ? 'GLIDING-DESCENT' : 'BUOYANT-CLIMB';
      forwardSpeed = +(0.34 + Math.min(0.35, horizontalDist * 0.01)).toFixed(2);
    } else {
      // Autonomous Sawtooth Yo-Yo flight kinematics (period ~ 24s)
      const isSpray = inst.id?.includes('spray') || inst.name?.toLowerCase().includes('spray');
      const baseDepth = isSpray ? 600 : 190;
      const amplitude = isSpray ? 220 : 115;
      const cycleSpeed = isSpray ? 0.20 : 0.26;
      const cyclePhase = (liveTick * cycleSpeed) % (Math.PI * 2);

      // Continuous smooth undulating dive depth
      const waveSin = Math.sin(cyclePhase);
      isGlidingDive = Math.cos(cyclePhase) >= 0;

      let naturalDepth = Math.round(baseDepth + waveSin * amplitude);
      if (naturalDepth < 20) naturalDepth = 20;

      depth = naturalDepth;
      pitchDeg = isGlidingDive ? -14.5 : +12.2;
      buoyancyEngine = isGlidingDive ? '-240 cc (Negative Buoyancy)' : '+260 cc (Positive Buoyancy)';
      gliderStatus = isGlidingDive ? 'GLIDING-DESCENT' : 'BUOYANT-CLIMB';
      forwardSpeed = +(0.34 + (isGlidingDive ? 0.05 : 0.01) + Math.sin(cyclePhase) * 0.02).toFixed(2);
    }
  } else if (isArgo) {
    // Argo Profiler submerges beneath waterline into deep ocean water column
    depth = isSelected ? Math.max(0, Math.min(4000, Math.round(oceanDepth))) : (inst.depthMeters || 15);
  } else if (isCtd) {
    // CTD Rosette cable lowering into water column
    const defaultCtd = inst.depthMeters || 1200;
    depth = isSelected ? Math.max(0, Math.min(4000, Math.round(oceanDepth))) : defaultCtd;
  } else {
    depth = Math.max(inst.depthMeters || 15, Math.round(oceanDepth));
  }

  const isDivedDeep = depth > 25 || oceanDepth > 25;

  // ── 2. DYNAMIC WATER COLUMN PHYSICS (Thermocline, Halocline, OMZ, DCM) ───
  // A. Temperature (Conservative Potential Temperature in C)
  let temp;
  if (depth <= 45) {
    temp = 28.45 - (depth / 45) * 0.45;
  } else if (depth <= 180) {
    const f = (depth - 45) / 135;
    temp = 28.0 - f * 12.4; // drops from 28.0C down to 15.6C
  } else if (depth <= 800) {
    const factor = Math.exp(-(depth - 180) / 260);
    temp = 5.2 + (15.6 - 5.2) * factor; // drops to 6.2C
  } else if (depth <= 2000) {
    const factor = Math.exp(-(depth - 800) / 650);
    temp = 2.6 + (6.2 - 2.6) * factor; // drops to 3.1C
  } else {
    const factor = Math.exp(-(depth - 2000) / 1500);
    temp = 1.65 + (3.1 - 1.65) * factor; // drops to 1.8C in abyss
  }
  // Subtle live sensor micro-fluctuation (+/- 0.02C)
  temp += Math.sin(liveTick * 1.3 + depth * 0.05) * 0.025;
  temp = +temp.toFixed(2);

  // B. Salinity (Practical Salinity Units, with Subsurface Salinity Maximum ~150m)
  let salinity;
  if (depth <= 40) {
    salinity = 34.25 + (depth / 40) * 0.20;
  } else if (depth <= 160) {
    const f = (depth - 40) / 120;
    salinity = 34.45 + f * 0.65; // peaks at 35.10 PSU
  } else if (depth <= 800) {
    const f = (depth - 160) / 640;
    salinity = 35.10 - f * 0.32; // drops to 34.78 PSU
  } else {
    salinity = 34.76 + Math.min(0.04, ((depth - 800) / 3200) * 0.03);
  }
  salinity += Math.cos(liveTick * 1.1 + depth * 0.04) * 0.015;
  salinity = +salinity.toFixed(2);

  // C. Dissolved Oxygen (umol/kg, featuring Northern Indian Ocean OMZ ~200-600m)
  let dissolvedOxygen;
  if (depth <= 50) {
    dissolvedOxygen = 205 - (depth / 50) * 15;
  } else if (depth <= 180) {
    const f = (depth - 50) / 130;
    dissolvedOxygen = 190 - f * 125; // 190 -> 65
  } else if (depth <= 600) {
    // Oxygen Minimum Zone (OMZ core)
    const f = Math.sin(((depth - 180) / 420) * Math.PI);
    dissolvedOxygen = 65 - f * 28; // reaches ~37 umol/kg
  } else if (depth <= 1500) {
    const f = (depth - 600) / 900;
    dissolvedOxygen = 50 + f * 65; // recovers to 115
  } else {
    dissolvedOxygen = 115 + Math.min(25, ((depth - 1500) / 2500) * 20);
  }
  dissolvedOxygen = Math.round(dissolvedOxygen + Math.sin(liveTick * 0.9) * 1.4);

  // D. Chlorophyll-a (mg/m3, featuring Deep Chlorophyll Maximum ~40-75m)
  let chlorophyll;
  if (depth <= 30) {
    chlorophyll = 0.38 + (depth / 30) * 0.28;
  } else if (depth <= 75) {
    chlorophyll = 0.66 + Math.sin(((depth - 30) / 45) * Math.PI) * 0.22; // up to 0.88 mg/m3
  } else if (depth <= 140) {
    const f = (depth - 75) / 65;
    chlorophyll = 0.66 * (1 - f) + 0.04;
  } else {
    chlorophyll = Math.max(0.01, 0.03 * Math.exp(-(depth - 140) / 100));
  }
  chlorophyll = +chlorophyll.toFixed(2);

  // E. Current Speed & Direction (Ekman Spiral rotation with depth)
  let currentSpeed;
  if (depth <= 60) {
    currentSpeed = 0.48 - (depth / 60) * 0.16;
  } else if (depth <= 300) {
    currentSpeed = 0.32 - ((depth - 60) / 240) * 0.18;
  } else {
    currentSpeed = Math.max(0.04, 0.14 * Math.exp(-(depth - 300) / 800));
  }
  currentSpeed = +(currentSpeed + Math.sin(liveTick * 0.5) * 0.02).toFixed(2);

  const baseAngle = isGlider ? 35 : (isCtd ? 135 : 42);
  const spiralOffset = Math.round(Math.min(90, (depth / 300) * 45));
  const currentAngle = (baseAngle + spiralOffset) % 360;
  const cardinal = currentAngle < 90 ? 'NE' : (currentAngle < 180 ? 'SE' : (currentAngle < 270 ? 'SW' : 'NW'));
  const currentDirection = `${cardinal} (${currentAngle}°)`;

  // ── 3. DERIVED HYDROGRAPHIC & DEVICE-SPECIFIC PARAMETERS ─────────────────
  const seaPressureDbar = Math.round(depth * 1.006);
  const potentialDensity = +(23.2 + (depth <= 180 ? (depth / 180) * 3.2 : 3.2 + (depth / 2000) * 1.35)).toFixed(2);
  const soundVelocity = +(1538 - (depth <= 900 ? (depth / 900) * 52 : 52 - ((depth - 900) / 3100) * 46)).toFixed(1);
  const o2Saturation = depth <= 50 ? 98 : (depth <= 600 ? Math.round(30 + (dissolvedOxygen / 190) * 30) : 68);

  const bbp700 = (0.0022 * Math.exp(-depth / 220)).toFixed(4);
  const cdom = +(1.45 * Math.exp(-depth / 320) + 0.11).toFixed(2);
  const par = depth <= 20 ? 460 : (depth <= 85 ? Math.round(460 * Math.exp(-(depth - 20) / 18)) : 0);

  // Status & Bladder displacement for Argo
  let status = 'SURFACE-TELEMETRY';
  let bladderDisp = '+280 cc (Surface Waterline)';
  if (isGlider) {
    status = gliderStatus;
  } else if (isArgo) {
    if (depth <= 25) {
      status = 'SURFACE-TELEMETRY';
      bladderDisp = '+280 cc (Surface Waterline)';
    } else if (depth <= 200) {
      status = 'EPIPELAGIC-DESCENT';
      bladderDisp = '-180 cc (Descent Vector)';
    } else if (depth <= 1000) {
      status = 'MESOPELAGIC-PROBE';
      bladderDisp = '-210 cc (Deep Profiling)';
    } else if (depth <= 2500) {
      status = 'PARKING-DRIFT';
      bladderDisp = '0 cc (Neutrally Buoyant)';
    } else {
      status = 'ABYSSAL-BATHYMETRY';
      bladderDisp = '-250 cc (Deep Pressure)';
    }
  } else if (isCtd) {
    status = isDivedDeep ? 'CAST-LOWERING' : 'STATION-SURFACE';
  }

  // Live formatted timestamp
  const now = new Date();
  const utcHours = String(now.getUTCHours()).padStart(2, '0');
  const utcMins = String(now.getUTCMinutes()).padStart(2, '0');
  const utcSecs = String(now.getUTCSeconds()).padStart(2, '0');
  const timestamp = `11 Sep 2026 ${utcHours}:${utcMins}:${utcSecs} UTC`;

  const cycle = inst.telemetry?.cycle || (isArgo ? 147 : (isGlider ? 84 : 12));
  const battery = inst.telemetry?.batteryPct || 82;
  const source = inst.telemetry?.source || (isArgo ? 'INCOIS / ARGO GDAC' : (isGlider ? 'INCOIS Glider Fleet' : 'INCOIS Moored Array'));
  const qcStatus = 'GOOD';

  // Glider specific
  const rollDeg = '+1.8° (Trim Stable)';
  const headingCompass = isGlider ? `${(inst.headingDeg || 35) + Math.round(Math.sin(liveTick * 0.3) * 2)}° (ENE)` : '035° (ENE)';
  const waypoint = inst.telemetry?.missionWaypoint || 'Station Hydro-Alpha';
  const altimeter = Math.max(15, 3850 - depth) + ' m above seafloor';
  const depthAveragedCurrent = '0.22 m/s @ 068°';
  const gliderVacuum = '680 mbar (Sealed)';
  const leakDetectors = 'FWD: DRY | AFT: DRY';
  const turbidity = +(0.42 * Math.exp(-depth / 150) + 0.08).toFixed(2);
  const emergencyWeight = 'ARMED / SECURED';

  // CTD specific
  const tempPrimary = +(temp).toFixed(3);
  const tempSecondary = +(temp + 0.002).toFixed(3);
  const conductivity = +(54.2 - (depth / 1000) * 18.2).toFixed(2);
  const closedBottles = Math.min(24, Math.max(2, Math.floor(depth / 85)));
  const niskinStatus = `${closedBottles} / 24 Closed`;
  const wireTension = `${640 + Math.round(depth * 0.42)} kgf`;
  const castRate = isDivedDeep ? '1.0 m/s (Lowering)' : '0.0 m/s (Station Hold)';
  const beamTransmission = `${Math.max(82, Math.round(96 - (depth <= 150 ? (depth / 150) * 12 : 12 - (depth / 2000) * 8)))}% (650nm)`;
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
    isDivedDeep,
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
    horizontalDistance: horizontalDist || 0,
    // Researched properties
    seaPressureDbar,
    potentialDensity,
    soundVelocity,
    o2Saturation,
    bbp700,
    cdom,
    par,
    parkingDepth: 1000,
    maxDepth: 2000,
    bladderDisp,
    internalVacuum: '9.4 inHg (Nominal)',
    telemetryMode: 'Iridium SBD / INCOIS GDAC',
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
 * Features specialized dynamic Glider Sawtooth Trajectory (Yo-Yo dives) mode when analyzing gliders!
 */
function DepthProfileView({ telemetry, onBack }) {
  const currentDepth = telemetry.depth || 15;
  const maxDepthRange = currentDepth > 1500 ? 2000 : (telemetry.isGlider ? 1000 : 1000);
  const deltaT = telemetry.modelValidation?.deltaTempC ?? 0.3;

  // Glider sub-view toggle: 'sawtooth' (Yo-Yo profile) vs 'ctd' (vertical profile)
  const [gliderProfileTab, setGliderProfileTab] = useState(telemetry.isGlider ? 'sawtooth' : 'ctd');

  const profilePoints = useMemo(() => {
    return generateDepthProfileData(telemetry.temp, telemetry.salinity, maxDepthRange);
  }, [telemetry.temp, telemetry.salinity, maxDepthRange]);

  const modelPoints = useMemo(() => {
    return profilePoints.map((p) => ({
      depth: p.depth,
      temp: parseFloat((p.temp - deltaT).toFixed(2)),
    }));
  }, [profilePoints, deltaT]);

  const svgWidth = 310;
  const svgHeight = 185;
  const pad = { top: 18, right: 20, bottom: 25, left: 38 };
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

  // ── GLIDER SAWTOOTH YO-YO TRAJECTORY DATA (0 - 20 km transect, 4 dive cycles) ──
  const sawtoothCycles = useMemo(() => {
    const cycles = [];
    const totalKm = 20;
    const numDives = 4;
    const diveKm = totalKm / numDives; // 5 km per dive cycle

    for (let i = 0; i < numDives; i++) {
      const startX = i * diveKm;
      const midX = startX + diveKm / 2;
      const endX = startX + diveKm;
      cycles.push({
        diveIndex: i + 1,
        startX,
        midX,
        endX,
        surfaceY: 0,
        troughY: 1000,
      });
    }
    return cycles;
  }, []);

  const kmToX = (km) => pad.left + (km / 20) * plotW;
  const gliderDepthToY = (d) => pad.top + (Math.max(0, Math.min(1000, d)) / 1000) * plotH;

  // Active Glider Position along the Sawtooth curve based on active depth & flight phase
  const activeGliderKm = useMemo(() => {
    const normDepth = Math.min(1000, Math.max(0, telemetry.depth)) / 1000;
    // Base cycle 1 (0 to 5km): if diving (0 to 2.5km), if climbing (2.5 to 5km)
    if (telemetry.pitchDeg < 0) {
      return 0.4 + normDepth * 2.1;
    } else {
      return 2.5 + (1 - normDepth) * 2.1;
    }
  }, [telemetry.depth, telemetry.pitchDeg]);

  const gliderMarkerX = kmToX(activeGliderKm);
  const gliderMarkerY = gliderDepthToY(telemetry.depth);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header & Mode Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          type="button"
          className="nav-step-btn"
          onClick={onBack}
          style={{ fontSize: '0.68rem', padding: '3px 8px' }}
        >
          ← Back to Telemetry
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {telemetry.isGlider ? (
            <div style={{ display: 'flex', background: 'rgba(0, 229, 255, 0.1)', borderRadius: 6, padding: 2, border: '1px solid rgba(0, 229, 255, 0.2)' }}>
              <button
                type="button"
                onClick={() => setGliderProfileTab('sawtooth')}
                style={{
                  background: gliderProfileTab === 'sawtooth' ? 'rgba(0, 240, 255, 0.3)' : 'transparent',
                  color: gliderProfileTab === 'sawtooth' ? '#00f0ff' : '#94a3b8',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: '0.62rem',
                  padding: '2px 6px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Sawtooth
              </button>
              <button
                type="button"
                onClick={() => setGliderProfileTab('ctd')}
                style={{
                  background: gliderProfileTab === 'ctd' ? 'rgba(0, 240, 255, 0.3)' : 'transparent',
                  color: gliderProfileTab === 'ctd' ? '#00f0ff' : '#94a3b8',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: '0.62rem',
                  padding: '2px 6px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                CTD Cast
              </button>
            </div>
          ) : (
            <span style={{ fontSize: '0.68rem', color: 'var(--accent-cyan-bright)', fontWeight: 600 }}>
              Depth Profile (0 - {maxDepthRange}m)
            </span>
          )}
        </div>
      </div>

      {/* ── 1. GLIDER SAWTOOTH YO-YO TRAJECTORY VIEW ────────────────────── */}
      {telemetry.isGlider && gliderProfileTab === 'sawtooth' ? (
        <div style={{ background: 'rgba(2, 9, 23, 0.85)', borderRadius: 10, padding: 10, border: '1px solid rgba(0, 229, 255, 0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span>✈️</span>
              <span>Glider Sawtooth Trajectory (Yo-Yo Mission)</span>
            </span>
            <span
              className="telemetry-status-pill"
              style={{
                fontSize: '0.55rem',
                padding: '2px 6px',
                background: telemetry.pitchDeg < 0 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(0, 240, 255, 0.2)',
                color: telemetry.pitchDeg < 0 ? '#fbbf24' : '#00f0ff',
                border: `1px solid ${telemetry.pitchDeg < 0 ? 'rgba(245, 158, 11, 0.4)' : 'rgba(0, 240, 255, 0.4)'}`,
              }}
            >
              {telemetry.pitchDeg < 0 ? '⬇ DIVE PHASE' : '⬆ CLIMB PHASE'}
            </span>
          </div>

          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            {/* Depth horizontal grid lines (0m, 250m, 500m, 1000m) */}
            {[0, 250, 500, 750, 1000].map((d) => (
              <g key={d}>
                <line
                  x1={pad.left}
                  y1={gliderDepthToY(d)}
                  x2={svgWidth - pad.right}
                  y2={gliderDepthToY(d)}
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeDasharray="2 3"
                />
                <text x={pad.left - 4} y={gliderDepthToY(d) + 3} fill="#64748b" fontSize="7.5" textAnchor="end" fontFamily="Space Mono">
                  {d}m
                </text>
              </g>
            ))}

            {/* Distance vertical grid lines (0km, 5km, 10km, 15km, 20km) */}
            {[0, 5, 10, 15, 20].map((km) => (
              <g key={km}>
                <line
                  x1={kmToX(km)}
                  y1={pad.top}
                  x2={kmToX(km)}
                  y2={svgHeight - pad.bottom}
                  stroke="rgba(255, 255, 255, 0.05)"
                />
                <text x={kmToX(km)} y={svgHeight - pad.bottom + 12} fill="#64748b" fontSize="7.5" textAnchor="middle" fontFamily="Space Mono">
                  {km}k
                </text>
              </g>
            ))}

            {/* Continuous Sawtooth Yo-Yo Trajectory Path */}
            {sawtoothCycles.map((c) => (
              <g key={c.diveIndex}>
                {/* Downward Glide Dive (Amber line) */}
                <line
                  x1={kmToX(c.startX)}
                  y1={gliderDepthToY(c.surfaceY)}
                  x2={kmToX(c.midX)}
                  y2={gliderDepthToY(c.troughY)}
                  stroke="#f59e0b"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                {/* Upward Buoyant Climb (Cyan line) */}
                <line
                  x1={kmToX(c.midX)}
                  y1={gliderDepthToY(c.troughY)}
                  x2={kmToX(c.endX)}
                  y2={gliderDepthToY(c.surfaceY)}
                  stroke="#00f0ff"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                {/* Surface inflection burst nodes */}
                <circle cx={kmToX(c.startX)} cy={gliderDepthToY(c.surfaceY)} r="2.5" fill="#f59e0b" />
                {/* Deep inflection turn nodes (1000m) */}
                <circle cx={kmToX(c.midX)} cy={gliderDepthToY(c.troughY)} r="2.5" fill="#00f0ff" />
              </g>
            ))}

            {/* Dynamic Active Glider Position Marker */}
            <g transform={`translate(${gliderMarkerX}, ${gliderMarkerY})`}>
              {/* Radar pulse ring */}
              <circle r="7" fill="none" stroke={telemetry.pitchDeg < 0 ? '#f59e0b' : '#00f0ff'} strokeWidth="1" opacity="0.6">
                <animate attributeName="r" values="4;10;4" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.8;0.1;0.8" dur="2s" repeatCount="indefinite" />
              </circle>
              {/* Glider Marker Body */}
              <circle r="4.5" fill={telemetry.pitchDeg < 0 ? '#f59e0b' : '#00f0ff'} stroke="#ffffff" strokeWidth="1.5" />
              {/* Dynamic Direction Arrow */}
              <text x="8" y="3" fill="#ffffff" fontSize="8" fontWeight="bold" fontFamily="Space Mono">
                {telemetry.pitchDeg < 0 ? `↘ ${telemetry.depth}m` : `↗ ${telemetry.depth}m`}
              </text>
            </g>
          </svg>

          {/* Glider Live Kinematics Summary Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 6,
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            fontSize: '0.62rem',
          }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '4px 6px', borderRadius: 4 }}>
              <div style={{ color: '#64748b' }}>Flight Pitch</div>
              <div style={{ color: telemetry.pitchDeg < 0 ? '#fbbf24' : '#00f0ff', fontWeight: 700, fontFamily: 'Space Mono' }}>
                {telemetry.pitchDeg}° ({telemetry.pitchDeg < 0 ? 'Dive' : 'Climb'})
              </div>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '4px 6px', borderRadius: 4 }}>
              <div style={{ color: '#64748b' }}>Buoyancy Eng</div>
              <div style={{ color: '#f8fafc', fontWeight: 600, fontFamily: 'Space Mono' }}>
                {telemetry.pitchDeg < 0 ? '-240 cc' : '+260 cc'}
              </div>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '4px 6px', borderRadius: 4 }}>
              <div style={{ color: '#64748b' }}>Glide Speed</div>
              <div style={{ color: '#38bdf8', fontWeight: 700, fontFamily: 'Space Mono' }}>
                {telemetry.forwardSpeed} m/s
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── 2. VERTICAL CTD PROFILE VIEW (With Dynamic Depth Marker) ────── */
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

            {/* Dynamic Active Depth Indicator */}
            <circle
              cx={tempToX(telemetry.temp)}
              cy={depthToY(currentDepth)}
              r="5"
              fill="#00f0ff"
              stroke="#ffffff"
              strokeWidth="1.8"
            />
            <text
              x={Math.min(svgWidth - pad.right - 10, tempToX(telemetry.temp) + 8)}
              y={depthToY(currentDepth) + 3}
              fill="#00f0ff"
              fontSize="8"
              fontWeight="bold"
              fontFamily="Space Mono"
            >
              {currentDepth}m ({telemetry.temp}°C)
            </text>
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
      )}
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
 * ModelVsObsTopSection
 * --------------------
 * High-priority validation card placed at the very TOP of every instrument card.
 * Compares real-time in-situ telemetry against 4D INCOIS-ROMS numerical model
 * dynamically aligned with the instrument's exact dive depth.
 */
function ModelVsObsTopSection({ telemetry }) {
  if (!telemetry) return null;

  const depth = telemetry.depth ?? 15;
  const model = useMemo(() => calculateRealisticModelProfile(depth), [depth]);

  // Calculations
  const deltaTemp = +(telemetry.temp - model.temperature).toFixed(2);
  const deltaSal = +(telemetry.salinity - model.salinity).toFixed(2);
  const deltaSpeed = +(telemetry.currentSpeed - model.currentSpeed).toFixed(2);
  const deltaO2 = +(telemetry.dissolvedOxygen - model.dissolvedOxygen).toFixed(1);

  const hasChl = telemetry.chlorophyll != null && model.chlorophyll != null;
  const deltaChl = hasChl ? +(telemetry.chlorophyll - model.chlorophyll).toFixed(2) : null;

  return (
    <div
      className="model-vs-obs-top-card"
      style={{
        background: 'linear-gradient(135deg, rgba(3, 16, 42, 0.95), rgba(6, 26, 64, 0.90))',
        border: '1.5px solid rgba(0, 229, 255, 0.4)',
        borderRadius: '10px',
        padding: '10px 12px',
        marginBottom: '12px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(0, 229, 255, 0.25)',
      }}
    >
      {/* Header Strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: '1px solid rgba(0, 229, 255, 0.2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.95rem' }}>⚖️</span>
          <div>
            <div
              style={{
                fontSize: '0.74rem',
                fontWeight: 800,
                letterSpacing: '0.6px',
                color: '#00f0ff',
                textTransform: 'uppercase',
                fontFamily: 'var(--ws-font-mono, monospace)',
              }}
            >
              Model vs Observation
            </div>
            <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>
              INCOIS-ROMS 1/12° @ Depth: <strong style={{ color: '#f8fafc' }}>{depth}m</strong>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="telemetry-action-btn"
          onClick={() => window.openSideBySideValidation && window.openSideBySideValidation(telemetry)}
          title="Open Full-Width Side-by-Side Model Validation Panel"
          style={{
            fontSize: '0.64rem',
            padding: '3px 8px',
            background: 'rgba(0, 229, 255, 0.15)',
            borderColor: 'rgba(0, 229, 255, 0.5)',
            color: '#00f0ff',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          Side-by-Side ↗
        </button>
      </div>

      {/* Comparison Grid Table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {/* Table Column Headers */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.1fr 1fr 1fr 1fr',
            fontSize: '0.58rem',
            color: '#64748b',
            textTransform: 'uppercase',
            fontWeight: 700,
            letterSpacing: '0.5px',
            padding: '2px 4px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <span>Variable</span>
          <span style={{ textAlign: 'right', color: '#ff9436' }}>Observed</span>
          <span style={{ textAlign: 'right', color: '#38bdf8' }}>ROMS NetCDF</span>
          <span style={{ textAlign: 'right', color: '#00f0ff' }}>Delta (Δ)</span>
        </div>

        {/* Row 1: Temperature */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.1fr 1fr 1fr 1fr',
            fontSize: '0.68rem',
            alignItems: 'center',
            padding: '3px 4px',
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: 4,
          }}
        >
          <span style={{ fontWeight: 600, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>🌡️</span> Temp
          </span>
          <span style={{ textAlign: 'right', color: '#ff9436', fontFamily: 'Space Mono', fontWeight: 600 }}>
            {telemetry.temp.toFixed(1)}°C
          </span>
          <span style={{ textAlign: 'right', color: '#38bdf8', fontFamily: 'Space Mono' }}>
            {model.temperature.toFixed(1)}°C
          </span>
          <span
            style={{
              textAlign: 'right',
              fontFamily: 'Space Mono',
              fontWeight: 700,
              color: Math.abs(deltaTemp) <= 0.4 ? '#4ade80' : '#fbbf24',
            }}
          >
            {deltaTemp >= 0 ? `+${deltaTemp.toFixed(1)}` : deltaTemp.toFixed(1)}°
          </span>
        </div>

        {/* Row 2: Salinity */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.1fr 1fr 1fr 1fr',
            fontSize: '0.68rem',
            alignItems: 'center',
            padding: '3px 4px',
            borderRadius: 4,
          }}
        >
          <span style={{ fontWeight: 600, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>🧂</span> Salinity
          </span>
          <span style={{ textAlign: 'right', color: '#ff9436', fontFamily: 'Space Mono', fontWeight: 600 }}>
            {telemetry.salinity.toFixed(2)}
          </span>
          <span style={{ textAlign: 'right', color: '#38bdf8', fontFamily: 'Space Mono' }}>
            {model.salinity.toFixed(2)}
          </span>
          <span
            style={{
              textAlign: 'right',
              fontFamily: 'Space Mono',
              fontWeight: 700,
              color: Math.abs(deltaSal) <= 0.15 ? '#4ade80' : '#fbbf24',
            }}
          >
            {deltaSal >= 0 ? `+${deltaSal.toFixed(2)}` : deltaSal.toFixed(2)}
          </span>
        </div>

        {/* Row 3: Dissolved Oxygen */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.1fr 1fr 1fr 1fr',
            fontSize: '0.68rem',
            alignItems: 'center',
            padding: '3px 4px',
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: 4,
          }}
        >
          <span style={{ fontWeight: 600, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>🫧</span> O₂ Diss
          </span>
          <span style={{ textAlign: 'right', color: '#ff9436', fontFamily: 'Space Mono', fontWeight: 600 }}>
            {telemetry.dissolvedOxygen.toFixed(0)}
          </span>
          <span style={{ textAlign: 'right', color: '#38bdf8', fontFamily: 'Space Mono' }}>
            {model.dissolvedOxygen.toFixed(0)}
          </span>
          <span
            style={{
              textAlign: 'right',
              fontFamily: 'Space Mono',
              fontWeight: 700,
              color: Math.abs(deltaO2) <= 12 ? '#4ade80' : '#fbbf24',
            }}
          >
            {deltaO2 >= 0 ? `+${deltaO2.toFixed(0)}` : deltaO2.toFixed(0)}
          </span>
        </div>

        {/* Row 4: Current Speed */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.1fr 1fr 1fr 1fr',
            fontSize: '0.68rem',
            alignItems: 'center',
            padding: '3px 4px',
            borderRadius: 4,
          }}
        >
          <span style={{ fontWeight: 600, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>🧭</span> Speed
          </span>
          <span style={{ textAlign: 'right', color: '#ff9436', fontFamily: 'Space Mono', fontWeight: 600 }}>
            {telemetry.currentSpeed.toFixed(2)}m/s
          </span>
          <span style={{ textAlign: 'right', color: '#38bdf8', fontFamily: 'Space Mono' }}>
            {model.currentSpeed.toFixed(2)}m/s
          </span>
          <span
            style={{
              textAlign: 'right',
              fontFamily: 'Space Mono',
              fontWeight: 700,
              color: Math.abs(deltaSpeed) <= 0.08 ? '#4ade80' : '#fbbf24',
            }}
          >
            {deltaSpeed >= 0 ? `+${deltaSpeed.toFixed(2)}` : deltaSpeed.toFixed(2)}
          </span>
        </div>

        {/* Row 5: Chlorophyll-a / Aphotic Zone */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.1fr 1fr 1fr 1fr',
            fontSize: '0.68rem',
            alignItems: 'center',
            padding: '3px 4px',
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: 4,
          }}
        >
          <span style={{ fontWeight: 600, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>🌿</span> Chl-a
          </span>
          {hasChl ? (
            <>
              <span style={{ textAlign: 'right', color: '#ff9436', fontFamily: 'Space Mono', fontWeight: 600 }}>
                {telemetry.chlorophyll.toFixed(2)}
              </span>
              <span style={{ textAlign: 'right', color: '#38bdf8', fontFamily: 'Space Mono' }}>
                {model.chlorophyll.toFixed(2)}
              </span>
              <span
                style={{
                  textAlign: 'right',
                  fontFamily: 'Space Mono',
                  fontWeight: 700,
                  color: Math.abs(deltaChl) <= 0.1 ? '#4ade80' : '#fbbf24',
                }}
              >
                {deltaChl >= 0 ? `+${deltaChl.toFixed(2)}` : deltaChl.toFixed(2)}
              </span>
            </>
          ) : (
            <span
              style={{
                gridColumn: 'span 3',
                textAlign: 'right',
                fontSize: '0.62rem',
                color: '#64748b',
                fontStyle: 'italic',
              }}
            >
              {depth > 120 ? 'Aphotic depth (>100m) — No Chl-a' : 'Sensor not present / Inactive'}
            </span>
          )}
        </div>
      </div>

      {/* QC & Confidence Footer */}
      <div
        style={{
          marginTop: 8,
          paddingTop: 6,
          borderTop: '1px dashed rgba(0, 229, 255, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.62rem',
        }}
      >
        <span className="qc-badge qc-badge--good" style={{ fontSize: '0.58rem', padding: '1px 6px' }}>
          ● Validated (QC Passed)
        </span>
        <span style={{ color: '#00e5ff', fontFamily: 'Space Mono' }}>
          Residual Bias: {Math.abs(deltaTemp) <= 0.4 ? 'Optimal Match' : 'Moderate'}
        </span>
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
          {/* Model vs Observation Section for EVERY Instrument at the Top */}
          <ModelVsObsTopSection telemetry={telemetry} />

          {/* Quick Actions Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, gap: 6 }}>
            <button
              type="button"
              className="nav-step-btn"
              onClick={() => setViewMode('profile')}
              title={telemetry.isGlider ? 'View Dynamic Glider Sawtooth Trajectory' : 'View Vertical Ocean Profile'}
              style={{
                fontSize: '0.65rem',
                padding: '3px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: telemetry.isGlider ? 'rgba(245, 158, 11, 0.15)' : 'rgba(0, 240, 255, 0.15)',
                color: telemetry.isGlider ? '#fbbf24' : '#00f0ff',
                borderColor: telemetry.isGlider ? 'rgba(245, 158, 11, 0.4)' : 'rgba(0, 240, 255, 0.4)',
                fontWeight: 600,
              }}
            >
              <span>{telemetry.isGlider ? '✈️' : '📊'}</span>
              <span>{telemetry.isGlider ? 'Glider Sawtooth' : 'View Profile'}</span>
            </button>
            <button
              type="button"
              className="nav-step-btn"
              onClick={onRefresh}
              title="Re-query live ERDDAP REST API"
              style={{ fontSize: '0.65rem', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span>🔄</span>
              <span>Refresh</span>
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
            {telemetry.isGlider && (
              <div className="telemetry-row">
                <span className="telemetry-row__label">Transect Distance</span>
                <span className="telemetry-row__value telemetry-row__value--amber" style={{ fontFamily: 'Space Mono', fontWeight: 700 }}>
                  {telemetry.horizontalDistance != null ? `${telemetry.horizontalDistance.toFixed(1)} km` : '0.0 km'}
                </span>
              </div>
            )}
            <div className="telemetry-row">
              <span className="telemetry-row__label">Current Depth</span>
              <span className="telemetry-row__value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#00f0ff', fontWeight: 700, fontFamily: 'Space Mono' }}>
                  {telemetry.depth} m
                </span>
                {telemetry.isDivedDeep && (
                  <span
                    style={{
                      fontSize: '0.55rem',
                      padding: '1px 5px',
                      borderRadius: 4,
                      background: 'rgba(0, 240, 255, 0.15)',
                      color: '#00f0ff',
                      border: '1px solid rgba(0, 240, 255, 0.35)',
                      fontWeight: 600,
                      fontFamily: 'Space Mono',
                      letterSpacing: '0.5px',
                    }}
                  >
                    ● DEEP DIVE
                  </span>
                )}
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
              <span
                className="telemetry-row__value"
                style={{
                  color: telemetry.temp > 22 ? '#fbbf24' : (telemetry.temp > 12 ? '#38bdf8' : '#818cf8'),
                  fontWeight: 600,
                  fontFamily: 'Space Mono',
                }}
              >
                {typeof telemetry.temp === 'number' ? `${telemetry.temp.toFixed(2)} °C` : telemetry.temp}
              </span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-row__label">Salinity</span>
              <span className="telemetry-row__value" style={{ fontFamily: 'Space Mono' }}>
                {typeof telemetry.salinity === 'number' ? `${telemetry.salinity.toFixed(2)} PSU` : telemetry.salinity}
              </span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-row__label">Dissolved Oxygen</span>
              <span className="telemetry-row__value" style={{ fontFamily: 'Space Mono', color: telemetry.dissolvedOxygen < 80 ? '#f87171' : 'inherit' }}>
                {telemetry.dissolvedOxygen} µmol/kg {telemetry.dissolvedOxygen < 80 ? '(OMZ Depleted)' : ''}
              </span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-row__label">Chlorophyll-a</span>
              <span className="telemetry-row__value telemetry-row__value--amber" style={{ fontFamily: 'Space Mono' }}>
                {typeof telemetry.chlorophyll === 'number' ? `${telemetry.chlorophyll.toFixed(2)} mg/m³` : telemetry.chlorophyll} {telemetry.depth >= 30 && telemetry.depth <= 75 ? '(DCM Peak)' : ''}
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
              onClick={() => {
                if (window.openSideBySideValidation) {
                  window.openSideBySideValidation();
                } else {
                  setViewMode('model');
                }
              }}
              title="Open full Side-by-Side Model vs Observation Validation Panel on the right"
            >
              Compare Model ⚖️
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
/**
 * Sub-component card inside the Big Box Fleet Dock
 * Upgraded with Framer Motion for smooth sideways dragging anywhere as required.
 */
function DockedSubCard({
  windowData,
  onUndock,
  onClose,
  onUpdate,
}) {
  const { id, isMinimized, instrumentData } = windowData;
  const controls = useAnimation();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState('telemetry');

  const activeInstrument = useOceanStore((state) => state.activeInstrument);
  const currentOceanDepth = useOceanStore((state) => state.modelControls?.currentDepth ?? 15);
  const activeInstrumentDepth = useOceanStore((state) => state.activeInstrumentDepth);
  const activeInstrumentHorizontal = useOceanStore((state) => state.activeInstrumentHorizontal ?? 0);
  const liveTick = useLiveOceanTime();
  const isSelected = activeInstrument?.id === windowData.instrumentId;
  const currentInst = isSelected && activeInstrument ? activeInstrument : instrumentData;

  const effectiveDepth = isSelected ? (activeInstrumentDepth ?? currentOceanDepth) : (instrumentData.depth ?? 15);
  const effectiveHorizontal = isSelected ? activeInstrumentHorizontal : 0;

  const telemetry = useMemo(
    () => formatInstrumentData(currentInst, effectiveDepth, liveTick, effectiveHorizontal, isSelected),
    [currentInst, effectiveDepth, liveTick, effectiveHorizontal, isSelected]
  );

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1200);
  }, []);

  const handleCardClick = () => {
    useOceanStore.getState().setActiveInstrument(instrumentData);
  };

  const handleDragEnd = (event, info) => {
    setIsDragging(false);
    // If user dragged sideways out of the right dock (offset.x < -60 or significant movement)
    if (info.offset.x < -60 || Math.abs(info.offset.y) > 100) {
      const clientX = event?.clientX || (event?.changedTouches && event.changedTouches[0]?.clientX) || (window.innerWidth - 450);
      const clientY = event?.clientY || (event?.changedTouches && event.changedTouches[0]?.clientY) || 120;
      const dropX = Math.max(20, Math.min(window.innerWidth - 380, clientX - 160));
      const dropY = Math.max(60, Math.min(window.innerHeight - 400, clientY - 30));
      onUndock(id, dropX, dropY);
      controls.set({ x: 0, y: 0 });
    } else {
      // Snap smoothly back into dock position with spring physics
      controls.start({
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
    }
  };

  if (!telemetry) return null;

  return (
    <motion.div
      drag={true}
      dragConstraints={{ left: -1600, right: 100, top: -600, bottom: 600 }}
      dragElastic={0.1}
      dragMomentum={false}
      animate={controls}
      onDragStart={() => {
        setIsDragging(true);
        useOceanStore.getState().setActiveInstrument(instrumentData);
      }}
      onDragEnd={handleDragEnd}
      whileDrag={{
        scale: 1.02,
        zIndex: 9999,
        cursor: 'grabbing',
        boxShadow: '0 24px 48px rgba(0, 0, 0, 0.9), 0 0 35px rgba(0, 229, 255, 0.5)',
      }}
      className={`fleet-dock-subcard ${isSelected ? 'selected' : ''} ${isDragging ? 'is-dragging' : ''}`}
      style={{
        position: 'relative',
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
        userSelect: 'none',
      }}
      onClick={handleCardClick}
    >
      {/* Subcard Header */}
      <div
        className="fleet-dock-subcard-header"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        title="Drag card sideways to float over 3D ocean, or click to select"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          {/* Drag Handle Grip Icon */}
          <span
            style={{
              color: isDragging ? '#00f0ff' : '#64748b',
              fontSize: '0.9rem',
              letterSpacing: '-1px',
              cursor: isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
              paddingRight: 2,
              display: 'flex',
              alignItems: 'center',
            }}
            title="Drag sideways to float card onto 3D ocean canvas"
          >
            ⋮⋮
          </span>

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
    </motion.div>
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

  const activeInstrument = useOceanStore((state) => state.activeInstrument);
  const currentOceanDepth = useOceanStore((state) => state.modelControls?.currentDepth ?? 15);
  const activeInstrumentDepth = useOceanStore((state) => state.activeInstrumentDepth);
  const activeInstrumentHorizontal = useOceanStore((state) => state.activeInstrumentHorizontal ?? 0);
  const liveTick = useLiveOceanTime();
  const isSelected = activeInstrument?.id === windowData.instrumentId;
  const currentInst = isSelected && activeInstrument ? activeInstrument : instrumentData;

  const effectiveDepth = isSelected ? (activeInstrumentDepth ?? currentOceanDepth) : (instrumentData.depth ?? 15);
  const effectiveHorizontal = isSelected ? activeInstrumentHorizontal : 0;

  const telemetry = useMemo(
    () => formatInstrumentData(currentInst, effectiveDepth, liveTick, effectiveHorizontal, isSelected),
    [currentInst, effectiveDepth, liveTick, effectiveHorizontal, isSelected]
  );

  const cardRef = useRef(null);
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0, currentX: x, currentY: y });
  const resizeRef = useRef({ isResizing: false, direction: '', startX: 0, startY: 0, initW: 0, initH: 0, initX: 0, initY: 0, currentW: width, currentH: height, currentX: x, currentY: y });

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
      currentX: x,
      currentY: y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMoveHeader = (e) => {
    if (!dragRef.current.isDragging || isMaximized) return;

    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    const newX = Math.max(0, Math.min(window.innerWidth - width - 10, dragRef.current.initialX + dx));
    const newY = Math.max(50, Math.min(window.innerHeight - 60, dragRef.current.initialY + dy));

    dragRef.current.currentX = newX;
    dragRef.current.currentY = newY;

    // Smooth direct DOM positioning: 120 FPS hardware accelerated without React re-render lag
    if (cardRef.current) {
      cardRef.current.style.left = `${newX}px`;
      cardRef.current.style.top = `${newY}px`;
    }

    // Check if dragging near the Big Box on the right side ("stickable" zone)
    const isNearDock = e.clientX > window.innerWidth - bigBoxWidth - 70;
    onDragNearDock(isNearDock);
  };

  const handlePointerUpHeader = (e) => {
    if (dragRef.current.isDragging) {
      dragRef.current.isDragging = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {}

      const hasMoved = dragRef.current.currentX !== dragRef.current.initialX || dragRef.current.currentY !== dragRef.current.initialY;

      // If dropped near the Big Box, stick it right back inside as a sub-component!
      const isNearDock = hasMoved && (e.clientX > window.innerWidth - bigBoxWidth - 70);
      onDragNearDock(false);

      if (isNearDock) {
        onDock(id);
      } else {
        onUpdate(id, { x: dragRef.current.currentX, y: dragRef.current.currentY });
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
      currentW: width,
      currentH: height,
      currentX: x,
      currentY: y,
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

    resizeRef.current.currentW = newW;
    resizeRef.current.currentH = newH;
    resizeRef.current.currentX = newX;
    resizeRef.current.currentY = newY;

    if (cardRef.current) {
      cardRef.current.style.width = `${newW}px`;
      cardRef.current.style.height = `${newH}px`;
      cardRef.current.style.left = `${newX}px`;
      cardRef.current.style.top = `${newY}px`;
    }
  };

  const onResizePointerUp = (e) => {
    if (resizeRef.current.isResizing) {
      resizeRef.current.isResizing = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {}

      onUpdate(id, {
        width: resizeRef.current.currentW,
        height: resizeRef.current.currentH,
        x: resizeRef.current.currentX,
        y: resizeRef.current.currentY,
      });
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
      ref={cardRef}
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
          <span
            style={{
              color: '#64748b',
              fontSize: '0.88rem',
              letterSpacing: '-1px',
              cursor: 'grab',
              userSelect: 'none',
              paddingRight: 2,
              display: 'flex',
              alignItems: 'center',
            }}
            title="Drag window anywhere on canvas"
          >
            ⋮⋮
          </span>
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
  // Mode: 'telemetry' (Sector Fleet Cards) or 'validation' (Side-by-Side Model vs Observation)
  const [dockMode, setDockMode] = useState('telemetry');

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

  // Bring a window to front and ensure it is visible in the right dock
  const focusWindow = useCallback((winId) => {
    setActiveWindowId(winId);
    setIsBigBoxMinimized(false);
    setDockMode('telemetry');
    nextZIndexRef.current += 1;
    setWindows((prev) => {
      const target = prev.find((w) => w.id === winId);
      if (!target) return prev;
      const updated = { ...target, zIndex: nextZIndexRef.current, isMinimized: false, isDocked: true };
      const others = prev.filter((w) => w.id !== winId);
      return [updated, ...others];
    });
  }, []);

  const lastOpenRef = useRef({ id: null, time: 0 });

  // Open an instrument into the Big Box as a sub-component (ENSURING STRICTLY ONLY ONE INSTANCE IS ADDED)
  const openInstrument = useCallback(
    (instrumentId) => {
      const now = Date.now();
      if (lastOpenRef.current.id === instrumentId && now - lastOpenRef.current.time < 50) {
        return;
      }
      lastOpenRef.current = { id: instrumentId, time: now };

      const idStr = typeof instrumentId === 'object' && instrumentId?.id
        ? String(instrumentId.id)
        : String(instrumentId || '');

      let inst = allInstruments.find((i) => i.id === idStr);
      if (!inst) {
        inst = allInstruments.find(
          (i) =>
            i.id.toLowerCase() === idStr.toLowerCase() ||
            String(i.floatId) === idStr ||
            i.id.includes(idStr) ||
            idStr.includes(i.id)
        );
      }
      if (!inst) {
        inst = DEMO_INSTRUMENTS.find(
          (i) =>
            i.id === idStr ||
            String(i.floatId) === idStr ||
            i.id.includes(idStr) ||
            idStr.includes(i.id)
        );
      }

      if (!inst) return;

      // 1. Expand Big Box if it was minimized & ensure telemetry cards view is active
      setIsBigBoxMinimized(false);
      setDockMode('telemetry');

      // 2. Instantly sync active instrument & depth to global store so 3D scene & profiles update
      if (!window.__syncingInstrument) {
        window.__syncingInstrument = true;
        try {
          if (useOceanStore.getState().selectInstrument) {
            useOceanStore.getState().selectInstrument(inst.id);
          } else {
            useOceanStore.getState().setActiveInstrument(inst);
            useOceanStore.getState().setActiveInstrumentDepth(inst.depth ?? inst.depthMeters ?? 15);
          }
        } finally {
          window.__syncingInstrument = false;
        }
      }

      nextZIndexRef.current += 1;
      const winId = `win-${inst.id}`;

      // Newly opened instrument card inside the Big Box
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

      // STRICT DEDUPLICATION: Make sure only ONE instance of this device exists in right box, placed at top
      setWindows((prev) => {
        const existing = prev.find(
          (w) => w.instrumentId === inst.id || (w.id && w.id.includes(inst.id))
        );
        const winToActivate = existing
          ? {
              ...existing,
              isMinimized: false,
              isDocked: true,
              zIndex: nextZIndexRef.current,
              instrumentData: inst,
            }
          : newWin;
        const others = prev.filter(
          (w) => w.instrumentId !== inst.id && !(w.id && w.id.includes(inst.id))
        );
        return [winToActivate, ...others];
      });

      setActiveWindowId(winId);
    },
    [allInstruments, bigBoxWidth]
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
  const undockCard = useCallback(
    (winId, startX, startY) => {
      setWindows((prev) =>
        prev.map((w) =>
          w.id === winId
            ? {
                ...w,
                isDocked: false,
                isMinimized: false,
                x: startX !== undefined ? startX : Math.max(20, window.innerWidth - bigBoxWidth - 360),
                y: startY !== undefined ? startY : 90,
                width: 340,
                height: 480,
              }
            : w
        )
      );
      setActiveWindowId(winId);
    },
    [bigBoxWidth]
  );

  // Dock a floating window back into the Big Box
  const dockWindow = useCallback((winId) => {
    setWindows((prev) =>
      prev.map((w) =>
        w.id === winId
          ? { ...w, isDocked: true, isMinimized: false }
          : w
      )
    );
    setIsBigBoxMinimized(false);
  }, []);

  // Left-edge resizing of the Big Box
  const handleBigBoxResizeStart = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = bigBoxWidth;

    const onPointerMove = (moveEvt) => {
      const dx = startX - moveEvt.clientX;
      const maxWidth = Math.min(960, window.innerWidth - 60);
      const newW = Math.max(300, Math.min(maxWidth, startW + dx));
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

  // Expose bridge on window for Three.js and panel integrations
  useEffect(() => {
    window.workspaceManager = {
      openInstrument,
      focusWindow,
      closeWindow,
      openWindowsCount: windows.length,
    };
    window.openInstrument = openInstrument;
    window.selectAndDockInstrument = openInstrument;
    window.openSideBySideValidation = () => {
      setIsBigBoxMinimized(false);
      setBigBoxWidth((prev) => Math.max(prev, 640));
      setDockMode('validation');
    };
    window.openFleetTelemetry = () => {
      setDockMode('telemetry');
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
        className={`fleet-dock-container overflow-visible z-[100] ${isBigBoxMinimized ? 'minimized' : ''} ${isDragOverDock ? 'drop-active' : ''}`}
        style={{
          width: isBigBoxMinimized ? 'auto' : `${bigBoxWidth}px`,
          overflow: 'visible',
          zIndex: 100,
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

        {/* Big Box Header with Tabbed Mode Switcher */}
        <div className="fleet-dock-header">
          {/* Tab Navigation: Fleet Telemetry vs Side-by-Side Validation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setDockMode('telemetry')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: dockMode === 'telemetry' ? 'rgba(0, 229, 255, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                border: dockMode === 'telemetry' ? '1px solid #00e5ff' : '1px solid rgba(255, 255, 255, 0.1)',
                color: dockMode === 'telemetry' ? '#00e5ff' : '#94a3b8',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
              title="View Sector Fleet Telemetry Cards"
            >
              <span>📡</span>
              <span>Fleet Telemetry</span>
              <span className="fleet-dock-badge" style={{ marginLeft: 3 }}>
                {dockedWindows.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDockMode('validation');
                if (bigBoxWidth < 620) {
                  setBigBoxWidth(640);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: dockMode === 'validation' ? 'linear-gradient(135deg, rgba(0, 240, 255, 0.25), rgba(56, 189, 248, 0.15))' : 'rgba(255, 255, 255, 0.04)',
                border: dockMode === 'validation' ? '1px solid #00f0ff' : '1px solid rgba(255, 255, 255, 0.1)',
                color: dockMode === 'validation' ? '#00f0ff' : '#94a3b8',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                boxShadow: dockMode === 'validation' ? '0 0 10px rgba(0, 240, 255, 0.25)' : 'none',
              }}
              title="Side-by-Side Model vs Observation Validation Panel"
            >
              <span>⚖️</span>
              <span>Model vs Obs (Side-by-Side Δ)</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
            {/* Quick Width Preset Toggle */}
            {!isBigBoxMinimized && (
              <button
                className="win-btn"
                onClick={() => setBigBoxWidth((prev) => (prev >= 600 ? 370 : 660))}
                title={bigBoxWidth >= 600 ? 'Switch to compact width (370px)' : 'Expand width for side-by-side view (660px)'}
                style={{ width: 26, height: 26, fontSize: '0.7rem' }}
              >
                <span>{bigBoxWidth >= 600 ? '⇤' : '⇥'}</span>
              </button>
            )}

            {/* Minimize / Expand Big Box Button */}
            <button
              className="win-btn"
              onClick={() => setIsBigBoxMinimized((prev) => !prev)}
              title={isBigBoxMinimized ? 'Expand Right Panel' : 'Minimize Right Panel (more space for 3D view)'}
              style={{ width: 26, height: 26, fontSize: '0.75rem' }}
            >
              <span>{isBigBoxMinimized ? '▲' : '—'}</span>
            </button>

            {/* Close All Docked (only in telemetry mode) */}
            {dockMode === 'telemetry' && dockedWindows.length > 0 && !isBigBoxMinimized && (
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
        {!isBigBoxMinimized && isDragOverDock && dockMode === 'telemetry' && (
          <div style={{ padding: '8px 12px 0 12px' }}>
            <div className="fleet-dock-drop-indicator">
              <span>📌</span>
              <span>Release to dock back inside Big Box!</span>
            </div>
          </div>
        )}

        {/* Panel Content: Side-by-Side Validation OR Docked Telemetry Subcards */}
        {!isBigBoxMinimized && (
          dockMode === 'validation' ? (
            <div style={{ flex: 1, minHeight: 0, overflow: 'visible', display: 'flex', flexDirection: 'column' }}>
              <SideBySideValidationPanel onClose={() => setDockMode('telemetry')} />
            </div>
          ) : (
            <div className="fleet-dock-scroll overflow-visible z-[100]">
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
          )
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
