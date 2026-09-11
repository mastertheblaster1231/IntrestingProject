import React, { useCallback } from 'react';
import { useOceanStore } from '../useOceanStore.js';
import { InfoCircle } from '../components/InfoCircle.jsx';

/**
 * LeftPanel.jsx — Data Layers, Model Controls & Visualization Panel.
 * Bound directly to the global Zustand useOceanStore with granular selectors.
 */
export function LeftPanel() {
  // Granular selectors — component only re-renders when relevant state slices change
  const dataLayers = useOceanStore((state) => state.dataLayers);
  const modelControls = useOceanStore((state) => state.modelControls);
  const visualization = useOceanStore((state) => state.visualization);

  // Setters from Zustand store
  const setDataLayer = useOceanStore((state) => state.setDataLayer);
  const setActiveVariable = useOceanStore((state) => state.setActiveVariable);
  const setCurrentDepth = useOceanStore((state) => state.setCurrentDepth);
  const setOpacity = useOceanStore((state) => state.setOpacity);
  const setColorbar = useOceanStore((state) => state.setColorbar);
  const setShowDepthSlice = useOceanStore((state) => state.setShowDepthSlice);
  const setShowIsosurface = useOceanStore((state) => state.setShowIsosurface);
  const setVerticalExaggeration = useOceanStore((state) => state.setVerticalExaggeration);

  const { showModel, showCurrents, showArgo, showGliders } = dataLayers;
  const { activeVariable, currentDepth, opacity, colorbar } = modelControls;
  const { showDepthSlice, showIsosurface, verticalExaggeration } = visualization;

  const handleVariableChange = useCallback((e) => {
    setActiveVariable(e.target.value);
  }, [setActiveVariable]);

  const handleDepthChange = useCallback((e) => {
    setCurrentDepth(parseFloat(e.target.value) || 0);
  }, [setCurrentDepth]);

  const handleOpacityChange = useCallback((e) => {
    setOpacity(parseFloat(e.target.value) / 100.0);
  }, [setOpacity]);

  const handleVerticalExaggerationChange = useCallback((e) => {
    setVerticalExaggeration(parseFloat(e.target.value) || 1.0);
  }, [setVerticalExaggeration]);

  const handleColorbarMinChange = useCallback((e) => {
    setColorbar({ min: parseFloat(e.target.value) || 0 });
  }, [setColorbar]);

  const handleColorbarMaxChange = useCallback((e) => {
    setColorbar({ max: parseFloat(e.target.value) || 35 });
  }, [setColorbar]);

  return (
    <div className="sidebar-panel">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-header__title">
          <span>🌊</span>
          <span>Command Parameters</span>
        </div>
      </div>

      <div className="sidebar-scroll">
        {/* ────────────────────────────────────────────────────────
            1. DATA LAYERS
            ──────────────────────────────────────────────────────── */}
        <div className="sidebar-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div className="sidebar-section__label">Data Layers</div>
            <InfoCircle
              title="1. Data Layers"
              whatItDoes="Checkboxes that mount or unmount entire 3D data sets from the React tree."
              futureApiUse="Toggling 'Argo Floats' triggers a lightweight API call to the INCOIS ERDDAP server (e.g., https://erddap.incois.gov.in/erddap/info/index.json) to pull just the Lat/Lon coordinates of active floats, rendering them as 3D pins."
              position="right"
            />
          </div>

          <label className="layer-check">
            <input
              type="checkbox"
              checked={showModel}
              onChange={(e) => setDataLayer('showModel', e.target.checked)}
            />
            <span className="layer-color-swatch" style={{ background: '#ff6b35' }} />
            Ocean Model (Temperature)
          </label>

          <label className="layer-check">
            <input
              type="checkbox"
              checked={showCurrents}
              onChange={(e) => setDataLayer('showCurrents', e.target.checked)}
            />
            <span className="layer-color-swatch" style={{ background: '#38bdf8' }} />
            Current Vectors
          </label>

          <label className="layer-check">
            <input
              type="checkbox"
              checked={showArgo}
              onChange={(e) => setDataLayer('showArgo', e.target.checked)}
            />
            <span className="layer-color-swatch" style={{ background: '#ff9436' }} />
            Argo Floats
          </label>

          <label className="layer-check">
            <input
              type="checkbox"
              checked={showGliders}
              onChange={(e) => setDataLayer('showGliders', e.target.checked)}
            />
            <span className="layer-color-swatch" style={{ background: '#fbbf24' }} />
            Gliders
          </label>
        </div>

        {/* ────────────────────────────────────────────────────────
            2. MODEL CONTROLS
            ──────────────────────────────────────────────────────── */}
        <div className="sidebar-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div className="sidebar-section__label">Model Controls</div>
            <InfoCircle
              title="2. Model Controls"
              whatItDoes="Variable Dropdown: Swaps active texture map on the 3D depth slice. Depth Slider: Changes currentDepth; the 3D plane physically moves down into the dark water and Bottom Dock charts instantly update for that specific depth. Opacity: Adjusts alpha to see seabed bathymetry underneath. Colorbar Min/Max: Recalibrates heatmap (set Min to 26°C to highlight cyclone danger zones)."
              futureApiUse="Stream multi-dimensional NetCDF arrays asynchronously through OPeNDAP or THREDDS data services directly into Three.js textures."
              position="right"
            />
          </div>

          {/* Active Variable Dropdown */}
          <div className="slider-row">
            <div className="slider-row__header">
              <span>Variable</span>
            </div>
            <select
              className="panel-select"
              value={activeVariable}
              onChange={handleVariableChange}
            >
              <option value="temperature">🌡️ Temperature (°C)</option>
              <option value="salinity">💧 Salinity (PSU)</option>
              <option value="current">🌊 Current Velocity (m/s)</option>
              <option value="chlorophyll">🌿 Chlorophyll-a (mg/m³)</option>
            </select>
          </div>

          {/* Depth Slider */}
          <div className="slider-row">
            <div className="slider-row__header">
              <span>Depth</span>
              <span className="slider-row__value">{Math.round(currentDepth)} m</span>
            </div>
            <input
              type="range"
              className="panel-slider"
              min="0"
              max="4000"
              step="25"
              value={currentDepth}
              onChange={handleDepthChange}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.58rem', color: '#64748b', marginTop: 1 }}>
              <span>0m (Surface)</span>
              <span>1000m</span>
              <span>2000m</span>
              <span>4000m (Abyss)</span>
            </div>
          </div>

          {/* Opacity Slider */}
          <div className="slider-row">
            <div className="slider-row__header">
              <span>Opacity</span>
              <span className="slider-row__value">{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range"
              className="panel-slider"
              min="10"
              max="100"
              step="5"
              value={Math.round(opacity * 100)}
              onChange={handleOpacityChange}
            />
          </div>

          {/* Colorbar Min / Max Calibration */}
          <div className="slider-row">
            <div className="slider-row__header">
              <span>Colorbar Range</span>
              <span className="slider-row__value">
                {colorbar.min}°C – {colorbar.max}°C
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>Min:</span>
                <input
                  type="number"
                  className="modal-input"
                  style={{ padding: '3px 6px', fontSize: '0.68rem' }}
                  value={colorbar.min}
                  onChange={handleColorbarMinChange}
                />
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>Max:</span>
                <input
                  type="number"
                  className="modal-input"
                  style={{ padding: '3px 6px', fontSize: '0.68rem' }}
                  value={colorbar.max}
                  onChange={handleColorbarMaxChange}
                />
              </div>
            </div>
            <div
              className={`colorbar-preview colorbar-preview--${colorbar.palette || 'thermal'}`}
              style={{ marginTop: 6 }}
            />
          </div>
        </div>

        {/* ────────────────────────────────────────────────────────
            3. VISUALIZATION
            ──────────────────────────────────────────────────────── */}
        <div className="sidebar-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div className="sidebar-section__label">Visualization</div>
            <InfoCircle
              title="3. Visualization"
              whatItDoes="Depth Slice: Toggles a horizontal 2D plane cutting through the 3D ocean at your chosen depth. Isosurface: Toggles a 3D blob representing a specific value (e.g., showing a 3D volume of all water exactly at 20°C). Vertical Exaggeration: Scales the Y-axis up to 100x so deep-water trenches and glider dive paths become visible."
              futureApiUse="Perform GPU compute-shader marching cubes on live volumetric oceanic datasets."
              position="right"
            />
          </div>

          {/* Depth Slice Toggle */}
          <label className="layer-check">
            <input
              type="checkbox"
              checked={showDepthSlice}
              onChange={(e) => setShowDepthSlice(e.target.checked)}
            />
            Depth Slice (2D Horizontal Cut)
          </label>

          {/* Isosurface Toggle */}
          <label className="layer-check">
            <input
              type="checkbox"
              checked={showIsosurface}
              onChange={(e) => setShowIsosurface(e.target.checked)}
            />
            Isosurface (3D Thermal Envelope)
          </label>

          {/* Vertical Exaggeration Slider (1x to 100x) */}
          <div className="slider-row">
            <div className="slider-row__header">
              <span>Vertical Exaggeration</span>
              <span className="slider-row__value">{verticalExaggeration.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              className="panel-slider"
              min="1"
              max="100"
              step="1"
              value={verticalExaggeration}
              onChange={handleVerticalExaggerationChange}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.58rem', color: '#64748b', marginTop: 1 }}>
              <span>1x (1:1 Natural)</span>
              <span>25x</span>
              <span>50x</span>
              <span>100x (Abyssal)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LeftPanel;
