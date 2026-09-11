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
  const visualization = useOceanStore((state) => state.visualization);  // Instrument subscriptions with isolated coordinates
  const activeInstrument = useOceanStore((state) => state.activeInstrument);
  const activeInstrumentId = activeInstrument?.id || 'argo-2902351';
  const depth = useOceanStore((state) => state.instruments[activeInstrumentId]?.depth ?? state.activeInstrumentDepth ?? 0);
  const transectDistance = useOceanStore(
    (state) => state.instruments['glider-slocum-04']?.transectDistance ?? state.activeInstrumentHorizontal ?? 25
  );
  const setActiveInstrumentDepth = useOceanStore((state) => state.setActiveInstrumentDepth);
  const setActiveInstrumentTransect = useOceanStore((state) => state.setActiveInstrumentTransect);
  const setActiveInstrumentHorizontal = useOceanStore((state) => state.setActiveInstrumentHorizontal);

  // Setters from Zustand store
  const setDataLayer = useOceanStore((state) => state.setDataLayer);
  const setActiveVariable = useOceanStore((state) => state.setActiveVariable);
  const setCurrentDepth = useOceanStore((state) => state.setCurrentDepth);
  const setOpacity = useOceanStore((state) => state.setOpacity);
  const setColorbar = useOceanStore((state) => state.setColorbar);
  const setShowDepthSlice = useOceanStore((state) => state.setShowDepthSlice);
  const setVerticalExaggeration = useOceanStore((state) => state.setVerticalExaggeration);

  const { showModel, showCurrents, showArgo, showGliders } = dataLayers;
  const { activeVariable, currentDepth, opacity, colorbar } = modelControls;
  const { showDepthSlice, verticalExaggeration } = visualization;

  const handleVariableChange = useCallback((e) => {
    setActiveVariable(e.target.value);
  }, [setActiveVariable]);

  const handleDepthChange = useCallback((e) => {
    setActiveInstrumentDepth(Number(e.target.value) || 0);
  }, [setActiveInstrumentDepth]);

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
    <div className="left-panel">
      <div className="left-panel__content">
        {/* ────────────────────────────────────────────────────────
            1. DATA LAYERS
            ──────────────────────────────────────────────────────── */}
        <div className="sidebar-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div className="sidebar-section__label">Data Layers</div>
            <InfoCircle
              title="1. Data Layers"
              whatItDoes="Toggles 3D volumetric ocean layers: Numerical circulation model output, 3D ocean current velocity vectors, and active in-situ observing platform pins (Argo Floats & Autonomous Gliders)."
              futureApiUse="Query INCOIS ERDDAP gridded OGC WMS/WFS services to dynamically stream 4D NetCDF ocean forecast datasets."
              position="right"
            />
          </div>

          <label className="layer-check">
            <input
              type="checkbox"
              checked={showModel}
              onChange={(e) => setDataLayer('showModel', e.target.checked)}
            />
            Ocean Model Volume (HYCOM / INCOIS)
          </label>

          <label className="layer-check">
            <input
              type="checkbox"
              checked={showCurrents}
              onChange={(e) => setDataLayer('showCurrents', e.target.checked)}
            />
            Ocean Currents Velocity Field
          </label>

          <label className="layer-check">
            <input
              type="checkbox"
              checked={showArgo}
              onChange={(e) => setDataLayer('showArgo', e.target.checked)}
            />
            Argo Profiling Floats
          </label>

          <label className="layer-check">
            <input
              type="checkbox"
              checked={showGliders}
              onChange={(e) => setDataLayer('showGliders', e.target.checked)}
            />
            Underwater Gliders
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
              whatItDoes="Selects the physical parameter being visualized (Temperature, Salinity, Currents, Chlorophyll). Also controls the depth level, slice opacity, and dynamic colormap temperature boundaries."
              futureApiUse="Call backend /api/model-slice to dynamically extract and slice NetCDF hyperslabs across depth coordinates."
              position="right"
            />
          </div>

          {/* Active Variable Dropdown */}
          <div className="slider-row">
            <div className="slider-row__header">
              <span>Variable</span>
            </div>
            <select
              className="modal-select"
              value={activeVariable}
              onChange={handleVariableChange}
            >
              <option value="temperature">🌡️ Potential Temperature (°C)</option>
              <option value="salinity">💧 Salinity (PSU)</option>
              <option value="current">🌊 Current Velocity (m/s)</option>
              <option value="chlorophyll">🌿 Chlorophyll-a (mg/m³)</option>
            </select>
          </div>

          {/* Depth Scroll Slider — visible for all devices, bound to isolated instrument depth */}
          <div className="slider-row">
            <div className="slider-row__header">
              <span>Depth Scroll</span>
              <span className="slider-row__value">{Math.round(depth)} m</span>
            </div>
            <input
              type="range"
              className="panel-slider"
              min="0"
              max="4000"
              step="25"
              value={depth}
              onChange={handleDepthChange}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.58rem', color: '#64748b', marginTop: 1 }}>
              <span>0m (Surface)</span>
              <span>1000m</span>
              <span>2000m</span>
              <span>4000m (Abyss)</span>
            </div>
          </div>

          {/* Conditional Render: Horizontal Distance Slider strictly for Autonomous Gliders */}
          {activeInstrument?.type === 'glider' && (
            <div className="slider-row" style={{ marginTop: 10, padding: '10px 0 4px 0', borderTop: '1px dashed rgba(251, 191, 36, 0.35)' }}>
              <div className="slider-row__header">
                <span style={{ color: '#fbbf24', fontWeight: 600 }}>✈️ Horizontal Distance</span>
                <span className="slider-row__value" style={{ color: '#fbbf24', fontFamily: 'Space Mono, monospace', fontWeight: 700 }}>
                  {Number(transectDistance).toFixed(1)} km
                </span>
              </div>
              <input
                type="range"
                className="panel-slider"
                min="0"
                max="50"
                step="0.5"
                value={transectDistance}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (setActiveInstrumentTransect) setActiveInstrumentTransect(val);
                  else if (setActiveInstrumentHorizontal) setActiveInstrumentHorizontal(val);
                }}
                style={{ accentColor: '#fbbf24' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.58rem', color: '#fbbf24', opacity: 0.8, marginTop: 1 }}>
                <span>0 km (Start)</span>
                <span>25 km</span>
                <span>50 km (Transect)</span>
              </div>
            </div>
          )}

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
              whatItDoes="Depth Slice: Toggles a horizontal 2D plane cutting through the 3D ocean at your chosen depth. Vertical Exaggeration: Scales the Y-axis up to 100x so deep-water trenches and glider dive paths become visible."
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
