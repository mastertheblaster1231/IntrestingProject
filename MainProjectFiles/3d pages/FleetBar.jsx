import React, { useState, useEffect } from 'react';
import { useOceanStore, selectFleet, selectActiveInstrument } from './useOceanStore.js';
import { DEMO_INSTRUMENTS } from './instruments.js';

/**
 * FleetBar / SectorFleetBar Component
 * ====================================
 * Cyber-marine bottom navigation dock:
 * - SECTOR FLEET radar badge
 * - The '+' Add Instrument picker button
 * - The 3 primary representative instrument pills:
 *     1. Argo 2902351 (15m, orange tag)
 *     2. Slocum G0-04 (190m, yellow tag)
 *     3. CTD Rosette (1200m, blue tag)
 * - Dynamic active-state highlighting linked directly to Zustand useOceanStore
 * - Multi-Window Layout View Mode Toggles (Side-by-Side, Grid, Min All, Close All)
 */
export function FleetBar({
  instruments = [],
  openWindows = [],
  onOpenInstrument,
  onFocusWindow,
  onTileSideBySide,
  onTileGrid,
  onMinimizeAll,
  onCloseAll,
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('all'); // 'all' | 'argo' | 'glider' | 'ctd'

  // Subscriptions to Zustand store
  const storeFleet = useOceanStore(selectFleet);
  const activeInstrument = useOceanStore(selectActiveInstrument);
  const selectInstrument = useOceanStore((state) => state.selectInstrument);

  // Strictly prioritize 3 primary instruments from Zustand store or fallback
  const fleetList =
    storeFleet && storeFleet.length > 0
      ? storeFleet
      : instruments.length > 0
      ? instruments
      : DEMO_INSTRUMENTS;

  // Close picker on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isPickerOpen) {
        setIsPickerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPickerOpen]);

  // Determine which instruments are currently open in the workspace
  const openInstrumentIds = new Set(openWindows.map((w) => w.instrumentId));

  // Filter instruments for picker popover
  const filteredInstruments = fleetList.filter((inst) => {
    if (selectedFilter === 'all') return true;
    return inst.type?.toLowerCase() === selectedFilter;
  });

  // Get icon by instrument type
  const getInstrumentIcon = (type) => {
    switch (type?.toLowerCase()) {
      case 'argo':
        return '🟠';
      case 'glider':
        return '🟡';
      case 'ctd':
        return '🔷';
      default:
        return '📡';
    }
  };

  const getDepthZoneLabel = (depthMeters) => {
    if (depthMeters <= 200) return 'Sunlight (Epipelagic)';
    if (depthMeters <= 1000) return 'Twilight (Mesopelagic)';
    if (depthMeters <= 3000) return 'Midnight (Bathypelagic)';
    return 'Abyssal Plain';
  };

  const allMinimized = openWindows.length > 0 && openWindows.every((w) => w.isMinimized);

  return (
    <>
      <div className="fleet-bar-wrapper workspace-interactive">
        <div className="fleet-bar">
          {/* 1. SECTOR FLEET Badge & Radar Dot */}
          <div className="fleet-brand">
            <span className="fleet-radar" />
            <span className="fleet-brand-text">Sector Fleet</span>
          </div>

          {/* 2. THE '+' ADD INSTRUMENT BUTTON */}
          <button
            className="add-instrument-btn"
            onClick={() => setIsPickerOpen((prev) => !prev)}
            title="Open Instrument Fleet Menu to Add Comparison Windows"
          >
            <span className="plus-icon">+</span>
            <span>Add Instrument</span>
          </button>

          {/* 3. The 3 Primary Instrument Pills with Dynamic Active Highlighting */}
          <div className="fleet-chips-group">
            {fleetList.map((inst) => {
              const isOpen = openInstrumentIds.has(inst.id);
              const isActive = activeInstrument?.id === inst.id;
              const matchingWin = openWindows.find((w) => w.instrumentId === inst.id);
              const colorTag =
                inst.colorTag ||
                (inst.type === 'argo' ? 'orange' : inst.type === 'glider' ? 'yellow' : 'blue');

              return (
                <button
                  key={inst.id}
                  className={`fleet-chip ${isActive ? 'active' : ''} ${
                    isOpen ? 'open-in-workspace' : ''
                  } tag-${colorTag}`}
                  onClick={() => {
                    // 1. Immediately switch Zustand activeInstrument & depth to update telemetry drawer & bottom analytics
                    if (selectInstrument) {
                      selectInstrument(inst.id);
                    } else {
                      useOceanStore.getState().setActiveInstrument(inst);
                      useOceanStore
                        .getState()
                        .setActiveInstrumentDepth(inst.depth ?? inst.depthMeters ?? 0);
                    }

                    // 2. Always dock and open in right side card
                    if (onOpenInstrument) {
                      onOpenInstrument(inst.id);
                    } else if (matchingWin && onFocusWindow) {
                      onFocusWindow(matchingWin.id);
                    }
                  }}
                  title={`${inst.name} (${inst.depth ?? inst.depthMeters}m) — Click to focus telemetry & camera`}
                >
                  <span>{getInstrumentIcon(inst.type)}</span>
                  <span>{inst.name}</span>
                  <span
                    style={{
                      fontFamily: 'var(--ws-font-mono)',
                      fontSize: '0.65rem',
                      color: '#00f0ff',
                    }}
                  >
                    ({inst.depth ?? inst.depthMeters}m)
                  </span>
                  <span
                    className="fleet-chip-active-dot"
                    title={isActive ? 'Active Platform' : 'Available Platform'}
                  />
                </button>
              );
            })}
          </div>

          {/* 4. Workspace Multi-Window View Mode Toggles */}
          <div className="fleet-tools-group">
            <span className="window-count-badge" title="Active Floating Windows">
              {openWindows.length} Active
            </span>

            {/* Snap Side-by-Side Comparison Button */}
            <button
              className="fleet-tool-btn highlight"
              onClick={onTileSideBySide}
              disabled={openWindows.length < 2}
              style={{
                opacity: openWindows.length < 2 ? 0.45 : 1,
                cursor: openWindows.length < 2 ? 'not-allowed' : 'pointer',
              }}
              title="Snap Two Windows Side-by-Side for Instant Data Comparison"
            >
              <span>◫</span>
              <span>Side-by-Side</span>
            </button>

            {/* Tile Grid */}
            <button
              className="fleet-tool-btn"
              onClick={onTileGrid}
              disabled={openWindows.length === 0}
              style={{
                opacity: openWindows.length === 0 ? 0.45 : 1,
                cursor: openWindows.length === 0 ? 'not-allowed' : 'pointer',
              }}
              title="Tile All Open Windows into an Organized Grid"
            >
              <span>⊞</span>
              <span>Grid</span>
            </button>

            {/* Minimize / Restore All */}
            {openWindows.length > 0 && (
              <button
                className="fleet-tool-btn"
                onClick={() => onMinimizeAll(!allMinimized)}
                title={allMinimized ? 'Restore All Windows' : 'Minimize All Windows'}
              >
                <span>{allMinimized ? '⤡' : '—'}</span>
                <span>{allMinimized ? 'Restore' : 'Min All'}</span>
              </button>
            )}

            {/* Close All */}
            {openWindows.length > 0 && (
              <button
                className="fleet-tool-btn"
                onClick={onCloseAll}
                title="Close All Floating Windows"
                style={{ color: '#f87171' }}
              >
                <span>✕</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ======================================================================
          5. INSTRUMENT PICKER POPOVER MODAL (Filtered to 3 Primary Platforms)
          ====================================================================== */}
      {isPickerOpen && (
        <div
          className="picker-popover-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsPickerOpen(false);
          }}
        >
          <div className="picker-popover workspace-interactive">
            {/* Header */}
            <div className="picker-header">
              <div className="picker-title-group">
                <span style={{ fontSize: '1.4rem' }}>🛰️</span>
                <div>
                  <div className="picker-title">Add Ocean Instrument to Workspace</div>
                  <div className="picker-subtitle">
                    Select an instrument to open a draggable, resizable data comparison window
                  </div>
                </div>
              </div>
              <button
                className="win-btn close-btn"
                onClick={() => setIsPickerOpen(false)}
                title="Close Menu"
              >
                ✕
              </button>
            </div>

            {/* Category Filter Chips */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                padding: '10px 20px 0 20px',
                borderBottom: '1px solid rgba(0, 229, 255, 0.12)',
              }}
            >
              {[
                { id: 'all', label: 'All Instruments', icon: '🌐' },
                { id: 'argo', label: 'Argo Float', icon: '🟠' },
                { id: 'glider', label: 'Underwater Glider', icon: '🟡' },
                { id: 'ctd', label: 'CTD Rosette', icon: '🔷' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedFilter(cat.id)}
                  style={{
                    background:
                      selectedFilter === cat.id ? 'rgba(0, 229, 255, 0.22)' : 'transparent',
                    border: '1px solid',
                    borderColor: selectedFilter === cat.id ? '#00f0ff' : 'transparent',
                    color: selectedFilter === cat.id ? '#ffffff' : '#94a3b8',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '0.74rem',
                    fontWeight: selectedFilter === cat.id ? 700 : 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    transition: 'all 0.18s ease',
                  }}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>

            {/* Instrument Cards List */}
            <div className="picker-grid">
              {filteredInstruments.map((inst) => {
                const isOpen = openInstrumentIds.has(inst.id);
                const matchingWin = openWindows.find((w) => w.instrumentId === inst.id);

                return (
                  <div
                    key={inst.id}
                    className={`picker-card ${isOpen ? 'already-open' : ''}`}
                    onClick={() => {
                      if (selectInstrument) {
                        selectInstrument(inst.id);
                      } else {
                        useOceanStore.getState().setActiveInstrument(inst);
                        useOceanStore
                          .getState()
                          .setActiveInstrumentDepth(inst.depth ?? inst.depthMeters ?? 0);
                      }
                      if (onOpenInstrument) {
                        onOpenInstrument(inst.id);
                      } else if (matchingWin && onFocusWindow) {
                        onFocusWindow(matchingWin.id);
                      }
                      setIsPickerOpen(false);
                    }}
                  >
                    <div className="picker-card-left">
                      <div className="picker-card-icon">{getInstrumentIcon(inst.type)}</div>
                      <div className="picker-card-info">
                        <div className="picker-card-name">{inst.name}</div>
                        <div className="picker-card-details">
                          <span style={{ color: '#00f0ff', fontWeight: 700 }}>
                            {inst.platform}
                          </span>
                          <span>•</span>
                          <span>
                            {inst.depth ?? inst.depthMeters}m Depth (
                            {getDepthZoneLabel(inst.depth ?? inst.depthMeters)})
                          </span>
                        </div>
                        {/* Live Telemetry Summary */}
                        <div
                          style={{
                            display: 'flex',
                            gap: '12px',
                            marginTop: '4px',
                            fontFamily: 'var(--ws-font-mono)',
                            fontSize: '0.64rem',
                            color: '#cbd5e1',
                          }}
                        >
                          {inst.telemetry?.temperatureC !== undefined && (
                            <span style={{ color: '#ff9436' }}>
                              🌡️ {inst.telemetry.temperatureC}°C
                            </span>
                          )}
                          {inst.telemetry?.salinityPSU !== undefined && (
                            <span style={{ color: '#38bdf8' }}>
                              💧 {inst.telemetry.salinityPSU} PSU
                            </span>
                          )}
                          {inst.telemetry?.speedKnots !== undefined ? (
                            <span style={{ color: '#2dd4bf' }}>
                              🧭 {inst.telemetry.speedKnots} kn
                            </span>
                          ) : (
                            <span style={{ color: '#2dd4bf' }}>
                              🌊 0.42 m/s Current
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button className="picker-open-btn">
                      {isOpen ? <span>✓ Focus Window</span> : <span>+ Open in Workspace</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default FleetBar;
