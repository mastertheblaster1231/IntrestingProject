import React, { useState, useEffect, useRef, useCallback } from 'react';

import { TopNavbar } from './panels/TopNavbar.jsx';
import { FooterBar } from './panels/FooterBar.jsx';
import { WorkspaceManager } from './WorkspaceManager.jsx';
import { useOceanStore } from './useOceanStore.js';
import { InfoCircle } from './components/InfoCircle.jsx';
import { GliderHorizontalScrollbar } from './components/GliderHorizontalScrollbar.jsx';

import './panels/PanelStyles.css';
import './workspace.css';

/**
 * OceanDashboard — Master layout component.
 *
 * Architecture:
 * ┌──────────────────────────────────────────────────────────┐
 * │                    TopNavbar (fixed h-14)                │
 * ├──────────────────────────────────────────────────────────┤
 * │   3D Canvas + overlays (Full-height interactive GIS)    │
 * ├──────────────────────────────────────────────────────────┤
 * │                     FooterBar                            │
 * └──────────────────────────────────────────────────────────┘
 *
 * @param {Object} props
 * @param {Array} props.instruments - DEMO_INSTRUMENTS array from Ocean.js
 */
export function OceanDashboard({ instruments = [] }) {
  const canvasContainerRef = useRef(null);
  const [showDepthBar, setShowDepthBar] = useState(true);
  const activeInstrument = useOceanStore((state) => state.activeInstrument);
  const [backendStatus, setBackendStatus] = useState('checking'); // 'checking', 'connected', 'fallback'

  // Health check for backend status
  useEffect(() => {
    fetch('/api/health')
      .then(res => {
        if (res.ok) setBackendStatus('connected');
        else setBackendStatus('fallback');
      })
      .catch(() => setBackendStatus('fallback'));
  }, []);

  // Expose the canvas container ref for Ocean.js to attach the Three.js renderer
  useEffect(() => {
    if (canvasContainerRef.current) {
      window.oceanCanvasContainer = canvasContainerRef.current;

      // 1. If the Three.js renderer exists, move it into our panel
      const existingCanvas = window.__oceanRenderer
        ? window.__oceanRenderer.domElement
        : document.querySelector('body > canvas');
      if (existingCanvas && existingCanvas.parentElement !== canvasContainerRef.current) {
        canvasContainerRef.current.appendChild(existingCanvas);
      }

      // 2. Relocate legacy depth-bar-container into the canvas panel
      const depthBar = document.querySelector('.depth-bar-container');
      if (depthBar && depthBar.parentElement !== canvasContainerRef.current) {
        canvasContainerRef.current.appendChild(depthBar);
      }

      // 3. Silky-smooth live resize observer
      const ro = new ResizeObserver(() => {
        window.dispatchEvent(new Event('resize'));
      });
      ro.observe(canvasContainerRef.current);

      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 150);

      return () => {
        ro.disconnect();
        clearTimeout(timer);
      };
    }
  }, []);

  const toggleDepthBar = useCallback(() => {
    setShowDepthBar(prev => {
      const next = !prev;
      const bar = document.querySelector('.depth-bar-container');
      if (bar) bar.style.display = next ? 'flex' : 'none';
      return next;
    });
  }, []);

  return (
    <div className="ocean-dashboard">
      {/* Top Navigation Bar */}
      <TopNavbar />

      {/* Main Content Area — Full Viewport 3D Canvas */}
      <div className="ocean-dashboard-main">
        <div
          className="canvas-panel"
          ref={canvasContainerRef}
          style={{ width: '100%', height: '100%', position: 'relative', flex: 1 }}
        >
          {/* Three.js canvas & depth-bar-container will be positioned here */}

          {/* Compass Rose (Top Right) */}
          <div className="canvas-compass-rose">
            <div className="compass-rose-dial">
              <span className="compass-point compass-n">N</span>
              <span className="compass-point compass-s">S</span>
              <span className="compass-point compass-w">W</span>
              <span className="compass-point compass-e">E</span>
              <div className="compass-crosshair-v" />
              <div className="compass-crosshair-h" />
              <div className="compass-needle" />
            </div>
          </div>

          {/* Geographic Sector Pin Tag */}
          {activeInstrument ? (
            <div className="canvas-location-tag">
              <div className="location-pin-icon">📍</div>
              <div className="location-tag-content">
                <span className="location-tag-name">{activeInstrument.sea || activeInstrument.region || activeInstrument.name || 'Indian Ocean'}</span>
                <span className="location-tag-coords">
                  {activeInstrument.lat != null ? `${activeInstrument.lat.toFixed(4)}° N, ` : ''}
                  {activeInstrument.lon != null ? `${activeInstrument.lon.toFixed(4)}° E` : ''}
                </span>
              </div>
            </div>
          ) : (
            <div className="canvas-location-tag">
              <div className="location-pin-icon">📍</div>
              <div className="location-tag-content">
                <span className="location-tag-name">Indian Ocean Basin</span>
                <span className="location-tag-coords">Awaiting Selection...</span>
              </div>
            </div>
          )}

          {/* Slocum Glider Top Horizontal Transect Scrollbar (Glider-Only) */}
          <GliderHorizontalScrollbar />

          {/* Depth Scrollbar Toggle Pill & 3D Info Circle */}
          <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Backend Connection Status */}
            <div 
              style={{
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px', 
                padding: '4px 10px', 
                background: 'rgba(3, 16, 42, 0.85)',
                border: `1px solid ${backendStatus === 'connected' ? 'rgba(74, 222, 128, 0.5)' : 'rgba(251, 191, 36, 0.5)'}`,
                borderRadius: '20px',
                fontSize: '0.65rem',
                color: '#f8fafc',
                fontWeight: 600,
                backdropFilter: 'blur(8px)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                whiteSpace: 'nowrap'
              }}
              title={backendStatus === 'connected' ? "Live connection to Node.js / ERDDAP Backend" : "Backend offline. Using simulated fallback data."}
            >
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: backendStatus === 'connected' ? '#4ade80' : '#fbbf24',
                boxShadow: `0 0 8px ${backendStatus === 'connected' ? '#4ade80' : '#fbbf24'}`
              }} />
              {backendStatus === 'connected' ? 'Backend Connected' : 'Fallback Mode'}
            </div>

            <button
              className={`canvas-depth-toggle ${showDepthBar ? 'active' : ''}`}
              onClick={toggleDepthBar}
              title="Toggle Vertical Depth Profiler"
              style={{ position: 'static' }}
            >
              ↕️ Depth Scroll
            </button>
            <InfoCircle
              title="3D Canvas & Depth Scrubber"
              whatItDoes="Orbital Dive: Clicking an instrument pin locks the Three.js OrbitControls target to that pin's coordinates and smoothly animates the camera downward using GSAP. In-Canvas Scrubber: Synchronized with depth state."
              futureApiUse="Stream real-time 3D NetCDF volumetric fields and dynamic bathymetric terrain directly on WebGL shader pipelines."
              position="bottom"
            />
          </div>

          {/* Overlay layer for workspace windows */}
          <div className="canvas-overlay">
            {/* WorkspaceManager renders floating windows + FleetBar */}
            <WorkspaceManager instruments={instruments} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <FooterBar />
    </div>
  );
}

export default OceanDashboard;
