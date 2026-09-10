import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { FleetBar } from './FleetBar.jsx';

/**
 * Procedural depth profile generator for Tab 2 (Graphs)
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
 * ============================================================================
 * INTERACTIVE DEPTH PROFILE SVG GRAPH (Tab 2)
 * ============================================================================
 */
function DepthProfileGraph({ instrument }) {
  const [hoveredData, setHoveredData] = useState(null);
  const containerRef = useRef(null);

  const surfaceTemp = instrument.telemetry?.temperatureC || 28.0;
  const surfaceSal = instrument.telemetry?.salinityPSU || 34.3;
  const currentDepth = instrument.depthMeters || 15;
  const maxDepthRange = currentDepth > 1500 ? 2000 : 1000;

  const profilePoints = useMemo(() => {
    return generateDepthProfileData(surfaceTemp, surfaceSal, maxDepthRange);
  }, [surfaceTemp, surfaceSal, maxDepthRange]);

  // Dimensions & Scales
  const svgWidth = 440;
  const svgHeight = 220;
  const pad = { top: 20, right: 30, bottom: 30, left: 45 };
  const plotW = svgWidth - pad.left - pad.right;
  const plotH = svgHeight - pad.top - pad.bottom;

  // X scale: Temperature (0 to 30 °C)
  const tempToX = (t) => pad.left + (Math.max(0, Math.min(30, t)) / 30) * plotW;
  // Y scale: Depth (0 at top, maxDepth at bottom)
  const depthToY = (d) => pad.top + (Math.max(0, Math.min(maxDepthRange, d)) / maxDepthRange) * plotH;

  // SVG Path Strings
  const tempPath = profilePoints
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${tempToX(p.temp).toFixed(1)} ${depthToY(p.depth).toFixed(1)}`)
    .join(' ');

  // Current instrument marker position
  const currentY = depthToY(currentDepth);
  const currentX = tempToX(surfaceTemp);

  // Mouse hover crosshair handler
  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const clampedY = Math.max(pad.top, Math.min(pad.top + plotH, offsetY));
    const ratio = (clampedY - pad.top) / plotH;
    const pointedDepth = Math.round(ratio * maxDepthRange);

    // Find nearest point
    let closest = profilePoints[0];
    let minDiff = Infinity;
    profilePoints.forEach((p) => {
      const diff = Math.abs(p.depth - pointedDepth);
      if (diff < minDiff) {
        minDiff = diff;
        closest = p;
      }
    });

    setHoveredData({
      depth: pointedDepth,
      temp: closest.temp,
      sal: closest.sal,
      y: clampedY,
    });
  };

  const handleMouseLeave = () => setHoveredData(null);

  return (
    <div className="graph-container">
      {/* Graph Legend & Dive Action */}
      <div className="graph-toolbar">
        <div className="graph-legend">
          <div className="legend-item">
            <span className="legend-dot" style={{ background: '#ff9436' }} />
            <span>Temp (°C)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ background: '#00f0ff' }} />
            <span>Instrument Depth ({currentDepth}m)</span>
          </div>
        </div>

        {window.jumpToDepth && (
          <button
            className="win-btn focus-btn"
            onClick={() => window.jumpToDepth(currentDepth)}
            title="Dive 3D ocean scene to this instrument's depth"
          >
            <span>🌊 Dive 3D Scene</span>
          </button>
        )}
      </div>

      {/* Interactive SVG Plot */}
      <div
        className="graph-svg-wrapper"
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <svg
          className="graph-svg"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="none"
        >
          {/* Depth Zone Bands */}
          <rect
            x={pad.left}
            y={pad.top}
            width={plotW}
            height={depthToY(Math.min(200, maxDepthRange)) - pad.top}
            fill="rgba(2, 132, 199, 0.12)"
          />
          <text
            x={pad.left + 8}
            y={pad.top + 14}
            fill="#38bdf8"
            fontSize="9"
            fontFamily="var(--ws-font-mono)"
            opacity="0.7"
          >
            SUNLIGHT ZONE (0-200m)
          </text>

          {/* Grid lines */}
          {[0, 10, 20, 30].map((t) => (
            <g key={`t-${t}`}>
              <line
                x1={tempToX(t)}
                y1={pad.top}
                x2={tempToX(t)}
                y2={pad.top + plotH}
                stroke="rgba(255, 255, 255, 0.08)"
                strokeDasharray="2,2"
              />
              <text
                x={tempToX(t)}
                y={svgHeight - 10}
                fill="#94a3b8"
                fontSize="9"
                fontFamily="var(--ws-font-mono)"
                textAnchor="middle"
              >
                {t}°C
              </text>
            </g>
          ))}

          {[0, Math.round(maxDepthRange * 0.25), Math.round(maxDepthRange * 0.5), Math.round(maxDepthRange * 0.75), maxDepthRange].map((d) => (
            <g key={`d-${d}`}>
              <line
                x1={pad.left}
                y1={depthToY(d)}
                x2={pad.left + plotW}
                y2={depthToY(d)}
                stroke="rgba(255, 255, 255, 0.08)"
                strokeDasharray="2,2"
              />
              <text
                x={pad.left - 6}
                y={depthToY(d) + 3}
                fill="#94a3b8"
                fontSize="9"
                fontFamily="var(--ws-font-mono)"
                textAnchor="end"
              >
                {d}m
              </text>
            </g>
          ))}

          {/* Temperature Profile Curve */}
          <path
            d={tempPath}
            fill="none"
            stroke="#ff9436"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Profile Data Points */}
          {profilePoints.map((p, i) => (
            <circle
              key={i}
              cx={tempToX(p.temp)}
              cy={depthToY(p.depth)}
              r="3"
              fill="#ff9436"
              stroke="#020713"
              strokeWidth="1.5"
            />
          ))}

          {/* Current Instrument Marker Line */}
          <line
            x1={pad.left}
            y1={currentY}
            x2={pad.left + plotW}
            y2={currentY}
            stroke="#00f0ff"
            strokeWidth="2"
            strokeDasharray="4,3"
          />
          <circle
            cx={pad.left + plotW - 8}
            cy={currentY}
            r="4.5"
            fill="#00f0ff"
            stroke="#ffffff"
            strokeWidth="1.5"
          />

          {/* Crosshair on Hover */}
          {hoveredData && (
            <g>
              <line
                x1={pad.left}
                y1={hoveredData.y}
                x2={pad.left + plotW}
                y2={hoveredData.y}
                stroke="#ffe042"
                strokeWidth="1.2"
              />
            </g>
          )}
        </svg>

        {/* Hovered Floating Crosshair Readout */}
        {hoveredData && (
          <div className="graph-crosshair-info">
            <span style={{ color: '#00f0ff' }}>Depth: {hoveredData.depth}m</span>
            <span style={{ color: '#ff9436' }}>Temp: {hoveredData.temp}°C</span>
            <span style={{ color: '#38bdf8' }}>Sal: {hoveredData.sal} PSU</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ============================================================================
 * SINGLE FLOATING RESIZABLE WINDOW COMPONENT
 * ============================================================================
 */
function WorkspaceWindow({
  windowData,
  isActive,
  onFocus,
  onClose,
  onUpdate,
  onSnap,
}) {
  const {
    id,
    instrumentData,
    x,
    y,
    width,
    height,
    zIndex,
    isMinimized,
    isMaximized,
    activeTab,
  } = windowData;

  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });
  const resizeRef = useRef({ isResizing: false, direction: '', startX: 0, startY: 0, initW: 0, initH: 0, initX: 0, initY: 0 });

  // 1. Header Drag Handler (Smooth with setPointerCapture)
  const handlePointerDownHeader = (e) => {
    // Only drag on primary mouse button and not clicking interactive controls
    if (e.button !== 0 || e.target.closest('button, .tab-btn')) return;

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

    const newX = Math.max(10, Math.min(window.innerWidth - width - 10, dragRef.current.initialX + dx));
    const newY = Math.max(10, Math.min(window.innerHeight - 80, dragRef.current.initialY + dy));

    onUpdate(id, { x: newX, y: newY });
  };

  const handlePointerUpHeader = (e) => {
    if (dragRef.current.isDragging) {
      dragRef.current.isDragging = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
  };

  // 2. 8-Direction Resizing Handler
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

    const MIN_W = 380;
    const MIN_H = 320;

    // Horizontal resizing
    if (direction.includes('right')) {
      newW = Math.max(MIN_W, Math.min(window.innerWidth - initX - 20, initW + dx));
    } else if (direction.includes('left')) {
      const possibleW = initW - dx;
      if (possibleW >= MIN_W) {
        newW = possibleW;
        newX = initX + dx;
      }
    }

    // Vertical resizing
    if (direction.includes('bottom')) {
      newH = Math.max(MIN_H, Math.min(window.innerHeight - initY - 40, initH + dy));
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

  // Helper for instrument icon
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

  const model = instrumentData.modelValidation;

  // Window geometry styles
  const windowStyle = isMaximized
    ? {
        top: '16px',
        left: '20px',
        width: 'calc(100vw - 40px)',
        height: 'calc(100vh - 100px)',
        zIndex,
      }
    : {
        top: `${y}px`,
        left: `${x}px`,
        width: `${width}px`,
        height: isMinimized ? '48px' : `${height}px`,
        zIndex,
      };

  return (
    <div
      className={`workspace-window ${isActive ? 'active' : ''} ${isMinimized ? 'minimized' : ''}`}
      style={windowStyle}
      onPointerDown={() => onFocus(id)}
    >
      {/* 1. Header Drag Bar */}
      <div
        className="window-header"
        onPointerDown={handlePointerDownHeader}
        onPointerMove={handlePointerMoveHeader}
        onPointerUp={handlePointerUpHeader}
      >
        <div className="window-title-group">
          <span className="window-icon">{getInstrumentIcon(instrumentData.type)}</span>
          <div className="window-title-text">
            <span className="window-title">{instrumentData.name}</span>
            <span className="window-subtitle">
              {instrumentData.platform} · {instrumentData.depthMeters}m
            </span>
          </div>
          <span className={`window-type-badge ${instrumentData.type?.toLowerCase()}`}>
            {instrumentData.type}
          </span>
        </div>

        {/* Header Action Controls */}
        <div className="window-controls">
          {/* 3D Camera Focus Button */}
          {window.focusInstrument && (
            <button
              className="win-btn focus-btn"
              onClick={(e) => {
                e.stopPropagation();
                window.focusInstrument(instrumentData.id);
              }}
              title="Dive camera & center this instrument in 3D WebGL Canvas"
            >
              <span>🎯 3D View</span>
            </button>
          )}

          {/* Snap Left */}
          <button
            className="win-btn snap-btn"
            onClick={(e) => {
              e.stopPropagation();
              onSnap(id, 'left');
            }}
            title="Snap Window to Left Half (Comparison Mode)"
          >
            <span>◀</span>
          </button>

          {/* Snap Right */}
          <button
            className="win-btn snap-btn"
            onClick={(e) => {
              e.stopPropagation();
              onSnap(id, 'right');
            }}
            title="Snap Window to Right Half (Comparison Mode)"
          >
            <span>▶</span>
          </button>

          {/* Minimize / Restore */}
          <button
            className="win-btn"
            onClick={(e) => {
              e.stopPropagation();
              onUpdate(id, { isMinimized: !isMinimized });
            }}
            title={isMinimized ? 'Expand Window' : 'Minimize Window'}
          >
            <span>{isMinimized ? '▲' : '—'}</span>
          </button>

          {/* Maximize */}
          <button
            className="win-btn"
            onClick={(e) => {
              e.stopPropagation();
              onUpdate(id, { isMaximized: !isMaximized, isMinimized: false });
            }}
            title={isMaximized ? 'Restore Size' : 'Maximize Window'}
          >
            <span>{isMaximized ? '❐' : '□'}</span>
          </button>

          {/* Close */}
          <button
            className="win-btn close-btn"
            onClick={(e) => {
              e.stopPropagation();
              onClose(id);
            }}
            title="Close Comparison Window"
          >
            <span>✕</span>
          </button>
        </div>
      </div>

      {/* If not minimized, render Tab System and Content */}
      {!isMinimized && (
        <>
          {/* 2. Switchable Tab Navigation System */}
          <div className="window-tab-bar">
            <button
              className={`tab-btn ${activeTab === 'raw' ? 'active' : ''}`}
              onClick={() => onUpdate(id, { activeTab: 'raw' })}
            >
              <span>📊 Raw Data</span>
              <span className="tab-badge">Sensors</span>
            </button>

            <button
              className={`tab-btn ${activeTab === 'graphs' ? 'active' : ''}`}
              onClick={() => onUpdate(id, { activeTab: 'graphs' })}
            >
              <span>📈 Graphs</span>
              <span className="tab-badge">Depth Profile</span>
            </button>
          </div>

          {/* 3. Window Body Views */}
          <div className="window-content">
            {activeTab === 'raw' ? (
              <>
                {/* Scientific Parameters Metric Cards */}
                <div className="raw-metrics-grid">
                  {/* Temperature */}
                  <div className="metric-card">
                    <div className="metric-card-header">
                      <span>Temperature</span>
                      <span>🌡️</span>
                    </div>
                    <div className="metric-card-value temp">
                      {instrumentData.telemetry?.temperatureC !== undefined
                        ? instrumentData.telemetry.temperatureC.toFixed(1)
                        : '--'}
                      <span className="metric-card-unit">°C</span>
                    </div>
                    <div className="metric-card-sub">In-situ CTD Probe</div>
                  </div>

                  {/* Salinity */}
                  <div className="metric-card">
                    <div className="metric-card-header">
                      <span>Salinity</span>
                      <span>💧</span>
                    </div>
                    <div className="metric-card-value salinity">
                      {instrumentData.telemetry?.salinityPSU !== undefined
                        ? instrumentData.telemetry.salinityPSU.toFixed(2)
                        : '--'}
                      <span className="metric-card-unit">PSU</span>
                    </div>
                    <div className="metric-card-sub">Conductivity Cell</div>
                  </div>

                  {/* Ocean Current / Velocity */}
                  <div className="metric-card">
                    <div className="metric-card-header">
                      <span>Ocean Current</span>
                      <span>🌊</span>
                    </div>
                    <div className="metric-card-value current">
                      {instrumentData.telemetry?.speedKnots !== undefined
                        ? `${instrumentData.telemetry.speedKnots.toFixed(2)} kn`
                        : '0.42 m/s'}
                    </div>
                    <div className="metric-card-sub">Heading 45° NE</div>
                  </div>

                  {/* Dissolved Oxygen */}
                  <div className="metric-card">
                    <div className="metric-card-header">
                      <span>Dissolved O₂</span>
                      <span>🫧</span>
                    </div>
                    <div className="metric-card-value oxygen">
                      {instrumentData.telemetry?.dissolvedOxygen !== undefined
                        ? instrumentData.telemetry.dissolvedOxygen
                        : '185'}
                      <span className="metric-card-unit">μmol/kg</span>
                    </div>
                    <div className="metric-card-sub">Optode Sensor</div>
                  </div>

                  {/* Operating Depth */}
                  <div className="metric-card">
                    <div className="metric-card-header">
                      <span>Current Depth</span>
                      <span>⚓</span>
                    </div>
                    <div className="metric-card-value depth">
                      {instrumentData.depthMeters}
                      <span className="metric-card-unit">meters</span>
                    </div>
                    <div className="metric-card-sub">Pressure: {Math.round(instrumentData.depthMeters * 1.008)} dbar</div>
                  </div>

                  {/* Battery & Status */}
                  <div className="metric-card">
                    <div className="metric-card-header">
                      <span>Power / Cycle</span>
                      <span>⚡</span>
                    </div>
                    <div className="metric-card-value battery">
                      {instrumentData.telemetry?.batteryPct || 85}%
                      <span className="metric-card-unit">
                        #{instrumentData.telemetry?.cycle || 142}
                      </span>
                    </div>
                    <div className="metric-card-sub">
                      Status: {(instrumentData.telemetry?.status || 'Active').toUpperCase()}
                    </div>
                  </div>
                </div>

                {/* Model vs Obs Validation Badge (INCOIS Assimilation) */}
                {model && (
                  <div className="model-validation-panel">
                    <div className="model-val-header">
                      <span>🤖 Model vs. In-Situ Validation</span>
                      <span style={{ fontFamily: 'var(--ws-font-mono)', fontSize: '0.65rem', color: '#38bdf8' }}>
                        {model.modelName}
                      </span>
                    </div>

                    <div className="delta-grid">
                      {/* Delta Temp */}
                      <div className="delta-box">
                        <div className="delta-lbl">
                          <span>ΔT (Obs - Model)</span>
                          <span>°C</span>
                        </div>
                        <div className={`delta-num ${model.deltaTempC >= 0 ? 'delta-positive' : 'delta-negative'}`}>
                          {model.deltaTempC >= 0 ? `+${model.deltaTempC.toFixed(2)}` : model.deltaTempC.toFixed(2)} °C
                        </div>
                        <div className="delta-detail">
                          Obs: {model.obsTemp}°C · Model: {model.modelTemp}°C
                        </div>
                      </div>

                      {/* Delta Salinity */}
                      <div className="delta-box">
                        <div className="delta-lbl">
                          <span>ΔS (Obs - Model)</span>
                          <span>PSU</span>
                        </div>
                        <div className={`delta-num ${model.deltaSalPSU >= 0 ? 'delta-positive' : 'delta-negative'}`}>
                          {model.deltaSalPSU >= 0 ? `+${model.deltaSalPSU.toFixed(2)}` : model.deltaSalPSU.toFixed(2)} PSU
                        </div>
                        <div className="delta-detail">
                          Obs: {model.obsSal} PSU · Model: {model.modelSal} PSU
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.64rem',
                        color: '#7dd3fc',
                        background: 'rgba(2, 8, 20, 0.6)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                        {model.status} ({model.confidenceScore})
                      </span>
                      <span style={{ color: '#94a3b8' }}>{model.biasRating}</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Tab 2: Graphs View (Depth Profile) */
              <DepthProfileGraph instrument={instrumentData} />
            )}
          </div>
        </>
      )}

      {/* 4. 8-Direction Resize Handles (Hidden if maximized or minimized) */}
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
 * Manages the array of open windows, positioning, side-by-side snapping,
 * z-index stacking, and hooks into the bottom FleetBar.
 */
export function WorkspaceManager({ instruments = [] }) {
  const [windows, setWindows] = useState([]);
  const [activeWindowId, setActiveWindowId] = useState(null);
  const nextZIndexRef = useRef(100);

  // Bring a window to front
  const focusWindow = useCallback((winId) => {
    setActiveWindowId(winId);
    nextZIndexRef.current += 1;
    setWindows((prev) =>
      prev.map((w) => (w.id === winId ? { ...w, zIndex: nextZIndexRef.current, isMinimized: false } : w))
    );
  }, []);

  // Open an instrument in a floating window
  const openInstrument = useCallback(
    (instrumentId) => {
      const inst = instruments.find((i) => i.id === instrumentId);
      if (!inst) return;

      const existingWin = windows.find((w) => w.instrumentId === instrumentId);
      if (existingWin) {
        focusWindow(existingWin.id);
        return;
      }

      nextZIndexRef.current += 1;
      const winId = `win-${instrumentId}-${Date.now()}`;
      const defaultW = 460;
      const defaultH = 480;

      let newX = 50;
      let newY = 65;

      // Smart Side-by-Side Snapping: If 1 window is already open, place this one right next to it!
      if (windows.length === 1) {
        const first = windows[0];
        const halfWidth = Math.max(390, Math.floor((window.innerWidth - 60) / 2));
        const uniformHeight = Math.min(520, window.innerHeight - 150);

        // Adjust first window to left half
        setWindows((prev) => [
          {
            ...prev[0],
            x: 20,
            y: 65,
            width: halfWidth,
            height: uniformHeight,
            isMinimized: false,
          },
          {
            id: winId,
            instrumentId: inst.id,
            title: inst.name,
            subtitle: inst.platform,
            type: inst.type,
            x: 20 + halfWidth + 16,
            y: 65,
            width: halfWidth,
            height: uniformHeight,
            zIndex: nextZIndexRef.current,
            isMinimized: false,
            isMaximized: false,
            activeTab: 'raw',
            instrumentData: inst,
          },
        ]);
        setActiveWindowId(winId);
        return;
      } else if (windows.length > 0) {
        // Cascade subsequent windows neatly
        const last = windows[windows.length - 1];
        newX = (last.x + 35) % (window.innerWidth - defaultW - 50);
        newY = (last.y + 35) % (window.innerHeight - defaultH - 100);
      }

      const newWin = {
        id: winId,
        instrumentId: inst.id,
        title: inst.name,
        subtitle: inst.platform,
        type: inst.type,
        x: newX,
        y: newY,
        width: defaultW,
        height: defaultH,
        zIndex: nextZIndexRef.current,
        isMinimized: false,
        isMaximized: false,
        activeTab: 'raw',
        instrumentData: inst,
      };

      setWindows((prev) => [...prev, newWin]);
      setActiveWindowId(winId);
    },
    [instruments, windows, focusWindow]
  );

  // Close a window
  const closeWindow = useCallback((winId) => {
    setWindows((prev) => prev.filter((w) => w.id !== winId));
  }, []);

  // Update window properties (coordinates, size, activeTab, isMinimized, etc.)
  const updateWindow = useCallback((winId, patch) => {
    setWindows((prev) => prev.map((w) => (w.id === winId ? { ...w, ...patch } : w)));
  }, []);

  // Snap Window to Left or Right Half
  const snapWindow = useCallback((winId, side) => {
    const halfWidth = Math.floor((window.innerWidth - 40) / 2);
    const height = window.innerHeight - 150;
    const top = 65;

    nextZIndexRef.current += 1;
    updateWindow(winId, {
      x: side === 'left' ? 16 : 16 + halfWidth + 8,
      y: top,
      width: halfWidth,
      height,
      zIndex: nextZIndexRef.current,
      isMinimized: false,
      isMaximized: false,
    });
    setActiveWindowId(winId);
  }, [updateWindow]);

  // Tile Two Active Windows Side-by-Side for Comparison
  const tileSideBySide = useCallback(() => {
    if (windows.length < 2) return;

    const halfWidth = Math.floor((window.innerWidth - 44) / 2);
    const height = Math.min(540, window.innerHeight - 140);
    const top = 65;

    setWindows((prev) => {
      const topTwo = [...prev].sort((a, b) => b.zIndex - a.zIndex).slice(0, 2);
      const otherWindows = prev.filter((w) => !topTwo.some((t) => t.id === w.id));

      const winLeft = {
        ...topTwo[0],
        x: 16,
        y: top,
        width: halfWidth,
        height,
        isMinimized: false,
        isMaximized: false,
      };

      const winRight = {
        ...topTwo[1],
        x: 16 + halfWidth + 12,
        y: top,
        width: halfWidth,
        height,
        isMinimized: false,
        isMaximized: false,
      };

      return [winLeft, winRight, ...otherWindows];
    });
  }, [windows]);

  // Tile All Open Windows into an Organized Grid
  const tileGrid = useCallback(() => {
    if (windows.length === 0) return;

    const count = windows.length;
    const cols = count > 2 ? 2 : count;
    const rows = Math.ceil(count / cols);

    const cellW = Math.floor((window.innerWidth - 32 - (cols - 1) * 12) / cols);
    const cellH = Math.floor((window.innerHeight - 150 - (rows - 1) * 12) / rows);

    setWindows((prev) =>
      prev.map((w, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        return {
          ...w,
          x: 16 + col * (cellW + 12),
          y: 65 + row * (cellH + 12),
          width: cellW,
          height: cellH,
          isMinimized: false,
          isMaximized: false,
        };
      })
    );
  }, [windows]);

  // Minimize or restore all windows
  const minimizeAll = useCallback((shouldMinimize) => {
    setWindows((prev) => prev.map((w) => ({ ...w, isMinimized: shouldMinimize })));
  }, []);

  // Close all windows
  const closeAll = useCallback(() => {
    setWindows([]);
    setActiveWindowId(null);
  }, []);

  // Expose bridge on window for Three.js integration
  useEffect(() => {
    window.workspaceManager = {
      openInstrument,
      focusWindow,
      closeWindow,
      tileSideBySide,
      openWindowsCount: windows.length,
    };
  }, [openInstrument, focusWindow, closeWindow, tileSideBySide, windows.length]);

  // On initial mount, automatically open the primary surface float and glider for instant comparison!
  useEffect(() => {
    if (instruments.length > 0 && windows.length === 0) {
      openInstrument('argo-2902351');
    }
  }, [instruments]); // Run once when instruments are loaded

  return (
    <>
      {/* 1. Floating Resizable Windows Workspace */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {windows.map((win) => (
          <WorkspaceWindow
            key={win.id}
            windowData={win}
            isActive={win.id === activeWindowId}
            onFocus={focusWindow}
            onClose={closeWindow}
            onUpdate={updateWindow}
            onSnap={snapWindow}
          />
        ))}
      </div>

      {/* 2. FleetBar Component with '+' Button & Multi-Window Tools */}
      <FleetBar
        instruments={instruments}
        openWindows={windows}
        onOpenInstrument={openInstrument}
        onFocusWindow={focusWindow}
        onTileSideBySide={tileSideBySide}
        onTileGrid={tileGrid}
        onMinimizeAll={minimizeAll}
        onCloseAll={closeAll}
      />
    </>
  );
}

export default WorkspaceManager;
