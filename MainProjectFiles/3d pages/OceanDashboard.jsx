import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';

import { TopNavbar } from './panels/TopNavbar.jsx';
import { BottomDock } from './panels/BottomDock.jsx';
import { FooterBar } from './panels/FooterBar.jsx';
import { WorkspaceManager } from './WorkspaceManager.jsx';
import { useOceanStore } from './useOceanStore.js';
import { InfoCircle } from './components/InfoCircle.jsx';

import './panels/PanelStyles.css';
import './workspace.css';

/**
 * OceanDashboard — Master layout component using react-resizable-panels v4.
 *
 * Architecture:
 * ┌──────────────────────────────────────────────────────────┐
 * │                    TopNavbar (fixed h-14)                │
 * ├──────────────────────────────────────────────────────────┤
 * │   3D Canvas + overlays (default 68%)                     │
 * ├──────────────────────────────────────────────────────────┤
 * │   Analytics Dock (default 32%)                           │
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

  // Handle panel resize — trigger Three.js resize
  const handleLayoutChanged = useCallback(() => {
    window.dispatchEvent(new Event('resize'));
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

      {/* Main Content Area — Vertical split: 3D Canvas (top) + Analytics Dock (bottom) */}
      <div className="ocean-dashboard-main">
        <Group
          orientation="vertical"
          onLayoutChanged={handleLayoutChanged}
          style={{ height: '100%', flex: 1 }}
        >
          {/* 3D Canvas */}
          <Panel id="canvas-panel" defaultSize="68%" minSize="30%">
            <div className="canvas-panel" ref={canvasContainerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
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
              <div className="canvas-location-tag">
                <div className="location-pin-icon">📍</div>
                <div className="location-tag-content">
                  <span className="location-tag-name">Andaman Sea</span>
                  <span className="location-tag-coords">11.6000° N, 92.5000° E</span>
                </div>
              </div>

              {/* Depth Scrollbar Toggle Pill & 3D Info Circle */}
              <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
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
                  futureApiUse="Stream real-time 3D NetCDF isosurfaces and dynamic bathymetric terrain directly on WebGL shader pipelines."
                  position="bottom"
                />
              </div>

              {/* Overlay layer for workspace windows */}
              <div className="canvas-overlay">
                {/* WorkspaceManager renders floating windows + FleetBar */}
                <WorkspaceManager instruments={instruments} />
              </div>

              {/* Bottom HUD strip */}
              <div className="canvas-hud-strip">
                <div className="hud-item">
                  <span className="hud-item__label">Temperature (°C)</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <div className="hud-colorbar" />
                    <div className="hud-colorbar-labels">
                      <span>5</span>
                      <span>10</span>
                      <span>15</span>
                      <span>20</span>
                      <span>25</span>
                      <span>30</span>
                    </div>
                  </div>
                </div>

                <div className="hud-item">
                  <span className="hud-item__label">Current Speed</span>
                  <span className="hud-item__value">0.42 m/s</span>
                  <span className="hud-item__label" style={{ marginLeft: 4 }}>→</span>
                  <span className="hud-item__value">NE</span>
                </div>

                <div className="hud-item">
                  <span className="hud-item__label">Depth Slice:</span>
                  <span className="hud-item__value">
                    {Math.round(useOceanStore.getState().modelControls.currentDepth)} m
                  </span>
                </div>

                <div className="instruments-in-view">
                  <span className="instruments-in-view__title">Instruments in View</span>
                  <div className="instruments-in-view__row">
                    <span className="instruments-in-view__dot" style={{ background: '#ff9436' }} />
                    <span>Argo Float</span>
                    <span className="instruments-in-view__count">3</span>
                  </div>
                  <div className="instruments-in-view__row">
                    <span className="instruments-in-view__dot" style={{ background: '#fbbf24' }} />
                    <span>Glider</span>
                    <span className="instruments-in-view__count">1</span>
                  </div>
                  <div className="instruments-in-view__row">
                    <span className="instruments-in-view__dot" style={{ background: '#60a5fa' }} />
                    <span>CTD</span>
                    <span className="instruments-in-view__count">0</span>
                  </div>
                  <div className="instruments-in-view__row">
                    <span className="instruments-in-view__dot" style={{ background: '#4ade80' }} />
                    <span>BGC</span>
                    <span className="instruments-in-view__count">0</span>
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          {/* Vertical Separator */}
          <Separator className="panel-resize-handle-vertical" />

          {/* Analytics Dock */}
          <Panel
            id="analytics-dock"
            defaultSize="32%"
            minSize="15%"
            maxSize="50%"
            collapsible={true}
            collapsedSize={0}
          >
            <BottomDock />
          </Panel>
        </Group>
      </div>

      {/* Footer */}
      <FooterBar />
    </div>
  );
}

export default OceanDashboard;
