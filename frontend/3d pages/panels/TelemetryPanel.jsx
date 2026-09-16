import React, { useState, useMemo, useCallback } from 'react';
import { useOceanStore, getInstrumentComparisonData } from '../useOceanStore.js';
import {
  calculateRealisticObservedProfile,
  calculateRealisticModelProfile,
  calculateDelta,
  formatVariableValue,
  getAgreementRating,
} from '../deltaMath.js';
import { useLiveTime } from '../hooks/useLiveTime.js';
import { DateTimePicker } from '../components/DateTimePicker.jsx';
import { ComparisonCard } from '../components/ComparisonCard.jsx';

/**
 * TelemetryPanel.jsx — Production In-Situ Telemetry & Model Validation Inspector
 *
 * Temporal Time-Travel & Multi-Device Draggable Cards:
 * - Injects glassmorphic DateTimePicker.jsx at top of panel.
 * - Renders draggable, snap-back <ComparisonCard /> components side-by-side.
 * - Driven by deterministic diurnal cycle for realistic dynamic metrics.
 */
export function TelemetryPanel() {
  // ── 1. ZUSTAND STORE SUBSCRIPTION ──────────────────────────────────────────
  const activeInstrument = useOceanStore((state) => state.activeInstrument);
  const activeInstrumentDepth = useOceanStore((state) => state.activeInstrumentDepth);
  const activeInstrumentHorizontal = useOceanStore((state) => state.activeInstrumentHorizontal);
  const selectedTimestamp = useOceanStore((state) => state.selectedTimestamp);
  const comparedInstruments = useOceanStore((state) => state.comparedInstruments || ['argo-2902351', 'glider-slocum-04']);
  const toggleComparedInstrument = useOceanStore((state) => state.toggleComparedInstrument);
  const removeComparedInstrument = useOceanStore((state) => state.removeComparedInstrument);
  const isLoading = useOceanStore((state) => state.isLoadingInstrument);
  const clearActiveInstrument = useOceanStore((state) => state.clearActiveInstrument);
  const fetchAndSetInstrument = useOceanStore((state) => state.fetchAndSetInstrument);

  // Toggle state for the Multi-Variable Model vs Observation comparison view
  const [showComparison, setShowComparison] = useState(true);

  // Live ticking IST / UTC clock for real-time observation display
  const liveTime = useLiveTime();

  // ── 2. FALLBACK STATE WHEN NO INSTRUMENT IS SELECTED ───────────────────────
  if (!activeInstrument) {
    return (
      <div
        className="telemetry-panel sidebar-panel sidebar-panel--right overflow-visible z-[100]"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(5, 14, 29, 0.94)',
          backdropFilter: 'blur(16px)',
          color: '#e2e8f0',
          fontFamily: 'var(--font-primary, "Outfit", sans-serif)',
          borderLeft: '1px solid rgba(0, 229, 255, 0.2)',
          overflow: 'visible',
          zIndex: 100,
          padding: '12px',
          gap: '12px',
        }}
      >
        {/* Requirement 1: DateTimePicker strictly placed above Right Telemetry Panel */}
        <DateTimePicker compact />

        <div
          className="empty-state"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '240px',
            padding: '28px 18px',
            textAlign: 'center',
            color: '#94a3b8',
            fontSize: '0.85rem',
            fontFamily: 'var(--font-primary, "Outfit", sans-serif)',
            background: 'rgba(6, 18, 38, 0.7)',
            borderRadius: '10px',
            border: '1px dashed rgba(0, 229, 255, 0.25)',
          }}
        >
          <span style={{ fontSize: '2rem', marginBottom: '10px' }}>🛰️</span>
          <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: '4px' }}>
            Select an instrument from the fleet dock
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', maxWidth: '240px', lineHeight: 1.4 }}>
            Click any Argo float, Glider, or CTD rosette in the 3D ocean scene or fleet dock to view in-situ telemetry and model comparison.
          </div>
        </div>
      </div>
    );
  }

  // ── 3. DYNAMIC METRICS CALCULATION WITH DIURNAL CYCLE ─────────────────────
  const resolvedDepth =
    activeInstrumentDepth ??
    activeInstrument.depth ??
    activeInstrument.depthMeters ??
    15;

  // Compute dynamic physical profile with deterministic diurnal perturbations
  const activeComparisonData = getInstrumentComparisonData(
    activeInstrument.id,
    resolvedDepth,
    selectedTimestamp
  );
  const dynamicObs = activeComparisonData.observed;
  const dynamicModel = activeComparisonData.model;

  // Comparison variables suite (6 parameters)
  const comparisonRows = [
    { key: 'temperature', label: 'Temperature', unit: '°C', obs: dynamicObs?.temperature, model: dynamicModel?.temperature },
    { key: 'salinity', label: 'Salinity', unit: 'PSU', obs: dynamicObs?.salinity, model: dynamicModel?.salinity },
    { key: 'chlorophyll', label: 'Chlorophyll-a', unit: 'mg/m³', obs: dynamicObs?.chlorophyll, model: dynamicModel?.chlorophyll },
    { key: 'currentSpeed', label: 'Current Speed', unit: 'm/s', obs: dynamicObs?.currentSpeed, model: dynamicModel?.currentSpeed },
    { key: 'currentDirection', label: 'Current Direction', unit: '°', obs: dynamicObs?.currentDirection, model: dynamicModel?.currentDirection },
    { key: 'dissolvedOxygen', label: 'Dissolved Oxygen', unit: 'µmol/kg', obs: dynamicObs?.dissolvedOxygen, model: dynamicModel?.dissolvedOxygen },
  ];

  const handleToggleComparison = () => {
    setShowComparison((prev) => !prev);
    // Also trigger side-by-side workspace window if available
    if (window.openSideBySideValidation) {
      window.openSideBySideValidation(activeInstrument);
    }
  };

  const handleFocus3D = () => {
    if (activeInstrument?.id && window.focusInstrument) {
      window.focusInstrument(activeInstrument.id);
    }
  };

  const handleRefresh = () => {
    if (activeInstrument?.id || activeInstrument?.floatId) {
      fetchAndSetInstrument(activeInstrument.floatId || activeInstrument.id);
    }
  };

  // ── 4. RENDER DYNAMIC TELEMETRY PANEL ──────────────────────────────────────
  return (
    <div
      className="telemetry-panel sidebar-panel sidebar-panel--right overflow-visible z-[100]"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(5, 14, 29, 0.94)',
        backdropFilter: 'blur(16px)',
        color: '#e2e8f0',
        fontFamily: 'var(--font-primary, "Outfit", sans-serif)',
        borderLeft: '1px solid rgba(0, 229, 255, 0.2)',
        overflow: 'visible',
        position: 'relative',
        zIndex: 100,
      }}
    >
      {/* ───────────────────────────────────────────────────────────────────
          REQUIREMENT 1: GLASSMORPHISM DATE TIME PICKER (Above Telemetry Panel)
         ─────────────────────────────────────────────────────────────────── */}
      <div style={{ padding: '10px 14px 4px 14px' }}>
        <DateTimePicker compact />
      </div>

      {/* ───────────────────────────────────────────────────────────────────
          TOP HEADER: Dynamic Title, Status & "Model vs Observation" Button
         ─────────────────────────────────────────────────────────────────── */}
      <div
        className="telemetry-header p-4 border-b border-cyan-950/40"
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(30, 58, 95, 0.45)',
          background: 'linear-gradient(180deg, rgba(8, 24, 52, 0.95), rgba(4, 15, 34, 0.90))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            {/* Status Beacon */}
            <div
              className={`telemetry-beacon ${isLoading ? 'animate-pulse' : ''}`}
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 10px rgba(16, 185, 129, 0.8)',
                flexShrink: 0,
              }}
            />
            {/* Dynamic Instrument Title & Subtitle */}
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2
                className="telemetry-float-name"
                style={{
                  margin: 0,
                  fontSize: '1rem',
                  fontWeight: 800,
                  color: '#f8fafc',
                  letterSpacing: '0.3px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {activeInstrument.name}
              </h2>
              <div
                className="telemetry-float-sub"
                style={{
                  fontSize: '0.68rem',
                  color: '#94a3b8',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginTop: '1px',
                }}
              >
                {activeInstrument.platform || (activeInstrument.type ? `${activeInstrument.type.toUpperCase()} Observation Platform` : 'Ocean Sensor')}
              </div>
            </div>
          </div>

          {/* Status Badge */}
          <span
            className="telemetry-status-badge"
            style={{
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '0.62rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#34d399',
            }}
          >
            {activeInstrument.status || 'ACTIVE'}
          </span>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            TASK 2: INJECT 'MODEL VS OBSERVATION' PRIMARY ACTION BUTTON
           ───────────────────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={handleToggleComparison}
          className="bg-cyan-600 hover:bg-cyan-500 text-white w-full rounded-md py-2 mt-3 font-bold transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
          style={{
            backgroundColor: showComparison ? '#0891b2' : '#0284c7',
            color: '#ffffff',
            width: '100%',
            borderRadius: '0.375rem',
            padding: '0.5rem 1rem',
            marginTop: '0.75rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
            border: 'none',
            boxShadow: '0 4px 12px rgba(6, 182, 212, 0.35)',
            fontFamily: 'inherit',
          }}
          title="Toggle Multi-Variable Model vs Observation Comparison View"
        >
          <span style={{ fontSize: '0.95rem' }}>⚖️</span>
          <span>Model vs Observation</span>
          <span style={{ fontSize: '0.72rem', opacity: 0.85 }}>
            {showComparison ? '▼ Active' : '▶'}
          </span>
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────────────────
          SCROLLABLE CONTENT BODY
         ─────────────────────────────────────────────────────────────────── */}
      <div
        className="telemetry-body overflow-visible z-[100]"
        style={{
          flex: 1,
          overflow: 'visible',
          overflowY: 'visible',
          overflowX: 'visible',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          position: 'relative',
          zIndex: 100,
        }}
      >
        {/* Loading Indicator */}
        {isLoading && (
          <div
            style={{
              padding: '8px 12px',
              background: 'rgba(0, 229, 255, 0.1)',
              border: '1px solid rgba(0, 229, 255, 0.3)',
              borderRadius: '6px',
              fontSize: '0.72rem',
              color: '#00e5ff',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
            <span>Syncing live ERDDAP GDAC stream...</span>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            REQUIREMENT 3: DRAGGABLE SNAP-BACK COMPARISON CARDS (Side-by-Side)
           ───────────────────────────────────────────────────────────── */}
        {showComparison && (
          <div
            className="comparison-cards-section overflow-visible z-[100]"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              background: 'rgba(6, 18, 42, 0.75)',
              border: '1px solid rgba(0, 229, 255, 0.3)',
              borderRadius: '12px',
              padding: '12px',
              position: 'relative',
              zIndex: 100,
              overflow: 'visible',
            }}
          >
            {/* Header with Title & canvas drag instruction */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.95rem' }}>⚖️</span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    color: '#00f0ff',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Model vs Obs Comparison
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.58rem',
                  color: '#fbbf24',
                  fontWeight: 600,
                  background: 'rgba(251, 191, 36, 0.12)',
                  border: '1px solid rgba(251, 191, 36, 0.3)',
                  padding: '2px 6px',
                  borderRadius: '10px',
                }}
              >
                🖐 Drag Cards Out to Canvas
              </span>
            </div>

            {/* Compared Instruments Device Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                Compare:
              </span>
              {[
                { id: 'argo-2902351', label: 'Argo #2902351' },
                { id: 'glider-slocum-04', label: 'Slocum Glider' },
                { id: 'ctd-rosette-01', label: 'CTD Rosette' },
              ].map(({ id, label }) => {
                const isSelected = comparedInstruments.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleComparedInstrument(id)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: isSelected ? '1px solid #00f0ff' : '1px solid rgba(255, 255, 255, 0.12)',
                      background: isSelected ? 'rgba(0, 229, 255, 0.22)' : 'rgba(255, 255, 255, 0.04)',
                      color: isSelected ? '#00f0ff' : '#94a3b8',
                      transition: 'all 0.15s ease',
                    }}
                    title={`Toggle ${label} in multi-device comparison`}
                  >
                    {isSelected ? '✓ ' : '+ '} {label}
                  </button>
                );
              })}
            </div>

            {/* Side-by-Side Draggable Snap-Back Cards Grid */}
            <div
              className="comparison-cards-grid overflow-visible z-[100]"
              style={{
                display: 'grid',
                gridTemplateColumns: comparedInstruments.length > 1 ? 'repeat(auto-fit, minmax(280px, 1fr))' : '1fr',
                gap: '10px',
                position: 'relative',
                zIndex: 100,
                overflow: 'visible',
              }}
            >
              {comparedInstruments.map((instId) => (
                <ComparisonCard
                  key={instId}
                  instrumentId={instId}
                  onRemove={(id) => removeComparedInstrument(id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            TELEMETRY DATA SECTIONS: Location, Variables, Hydrodynamics
           ───────────────────────────────────────────────────────────── */}
        {/* Section 1: Location & Sensor Depth */}
        <div className="telemetry-card" style={{ background: 'rgba(8, 20, 42, 0.65)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '10px 12px' }}>
          <div style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: '6px', letterSpacing: '0.5px' }}>
            📍 Platform Coordinates & Depth
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '4px' }}>
            <span style={{ color: '#94a3b8' }}>Coordinates:</span>
            <span style={{ fontFamily: 'Space Mono, monospace', color: '#00f0ff' }}>
              {(activeInstrument.lat ?? 11.6).toFixed(4)}°N, {(activeInstrument.lon ?? 92.5).toFixed(4)}°E
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '4px' }}>
            <span style={{ color: '#94a3b8' }}>Operating Depth:</span>
            <span style={{ fontFamily: 'Space Mono, monospace', color: '#38bdf8', fontWeight: 700 }}>
              {Math.round(activeInstrumentDepth)} m
            </span>
          </div>
          {activeInstrument?.type === 'glider' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '4px' }}>
              <span style={{ color: '#fbbf24', fontWeight: 600 }}>✈️ Horizontal Distance:</span>
              <span style={{ fontFamily: 'Space Mono, monospace', color: '#fbbf24', fontWeight: 700 }}>
                {(activeInstrumentHorizontal || 0).toFixed(1)} km
              </span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
            <span style={{ color: '#94a3b8' }}>Timestamp:</span>
            <span style={{ fontFamily: 'Space Mono, monospace', color: '#cbd5e1' }}>
              {liveTime}
            </span>
          </div>
        </div>

        {/* Section 2: In-Situ Ocean Variables */}
        <div className="telemetry-card" style={{ background: 'rgba(8, 20, 42, 0.65)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '10px 12px' }}>
          <div style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: '6px', letterSpacing: '0.5px' }}>
            🌊 Live In-Situ Variables
          </div>

          {/* Temperature */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '5px' }}>
            <span style={{ color: '#94a3b8' }}>Temperature:</span>
            <span style={{ fontFamily: 'Space Mono, monospace', fontWeight: 700, color: (dynamicObs?.temperature ?? 28) > 20 ? '#fbbf24' : '#38bdf8' }}>
              {dynamicObs?.temperature != null ? `${dynamicObs.temperature.toFixed(2)} °C` : '—'}
            </span>
          </div>

          {/* Salinity */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '5px' }}>
            <span style={{ color: '#94a3b8' }}>Salinity:</span>
            <span style={{ fontFamily: 'Space Mono, monospace', color: '#cbd5e1' }}>
              {dynamicObs?.salinity != null ? `${dynamicObs.salinity.toFixed(2)} PSU` : '—'}
            </span>
          </div>

          {/* Dissolved Oxygen */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '5px' }}>
            <span style={{ color: '#94a3b8' }}>Dissolved Oxygen:</span>
            <span style={{ fontFamily: 'Space Mono, monospace', color: '#cbd5e1' }}>
              {dynamicObs?.dissolvedOxygen != null ? `${dynamicObs.dissolvedOxygen.toFixed(1)} µmol/kg` : '—'}
            </span>
          </div>

          {/* Chlorophyll-a */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
            <span style={{ color: '#94a3b8' }}>Chlorophyll-a:</span>
            <span style={{ fontFamily: 'Space Mono, monospace', color: '#4ade80' }}>
              {dynamicObs?.chlorophyll != null ? `${dynamicObs.chlorophyll.toFixed(2)} mg/m³` : (resolvedDepth > 120 ? 'Aphotic (>100m)' : 'N/A')}
            </span>
          </div>
        </div>

        {/* Section 3: Hydrodynamic Currents & System Health */}
        <div className="telemetry-card" style={{ background: 'rgba(8, 20, 42, 0.65)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '10px 12px' }}>
          <div style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: '6px', letterSpacing: '0.5px' }}>
            🧭 Hydrodynamics & Power
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '5px' }}>
            <span style={{ color: '#94a3b8' }}>Current Velocity:</span>
            <span style={{ fontFamily: 'Space Mono, monospace', color: '#cbd5e1' }}>
              {dynamicObs?.currentSpeed != null ? `${dynamicObs.currentSpeed.toFixed(2)} m/s` : '0.40 m/s'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '5px' }}>
            <span style={{ color: '#94a3b8' }}>Current Heading:</span>
            <span style={{ fontFamily: 'Space Mono, monospace', color: '#cbd5e1' }}>
              {dynamicObs?.currentDirection != null ? `${dynamicObs.currentDirection.toFixed(0)}°` : '055° (ENE)'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '5px' }}>
            <span style={{ color: '#94a3b8' }}>Battery Health:</span>
            <span style={{ fontFamily: 'Space Mono, monospace', color: '#34d399', fontWeight: 700 }}>
              {activeInstrument.battery ?? activeInstrument.telemetry?.batteryPct ?? 82}%
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
            <span style={{ color: '#94a3b8' }}>Profile Cycle:</span>
            <span style={{ fontFamily: 'Space Mono, monospace', color: '#cbd5e1' }}>
              #{activeInstrument.cycle ?? activeInstrument.telemetry?.cycle ?? 148}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '8px' }}>
          <button
            type="button"
            onClick={handleRefresh}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '0.72rem',
              fontWeight: 600,
              background: 'rgba(0, 229, 255, 0.1)',
              border: '1px solid rgba(0, 229, 255, 0.3)',
              borderRadius: '6px',
              color: '#00e5ff',
              cursor: 'pointer',
            }}
          >
            🔄 Refresh
          </button>
          <button
            type="button"
            onClick={handleFocus3D}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '0.72rem',
              fontWeight: 600,
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '6px',
              color: '#38bdf8',
              cursor: 'pointer',
            }}
          >
            🎯 Focus 3D
          </button>
          <button
            type="button"
            onClick={clearActiveInstrument}
            style={{
              padding: '6px 10px',
              fontSize: '0.72rem',
              fontWeight: 600,
              background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              borderRadius: '6px',
              color: '#f87171',
              cursor: 'pointer',
            }}
            title="Deselect instrument"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

export default TelemetryPanel;
