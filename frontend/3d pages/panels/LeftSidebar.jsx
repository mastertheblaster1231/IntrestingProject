import React, { useState, useEffect, useCallback } from 'react';

/**
 * LeftSidebar — Data Layers & Model Controls panel.
 * Migrated from the inline HTML "Volumetric Model Fields" window.
 * Communicates with Ocean.js via window.OCEAN_STATE bridge.
 */
export function LeftSidebar() {
  // Data layer toggles
  const [layers, setLayers] = useState({
    oceanModel: true,
    currentVectors: true,
    argoFloats: true,
    gliders: true,
    ctd: false,
    bgcChlorophyll: false,
  });

  // Model controls
  const [variable, setVariable] = useState('temp');
  const [depth, setDepth] = useState('500');
  const [opacity, setOpacity] = useState(70);
  const [colormap, setColormap] = useState('thermal');

  // Visualization toggles
  const [depthSlice, setDepthSlice] = useState(false);
  const [currentVectorsViz, setCurrentVectorsViz] = useState(false);
  const [verticalExagg, setVerticalExagg] = useState(1.0);

  // Sync with OCEAN_STATE
  useEffect(() => {
    if (window.OCEAN_STATE) {
      // Read initial state
      if (window.OCEAN_STATE.variableType) setVariable(window.OCEAN_STATE.variableType);
    }
  }, []);

  const handleLayerToggle = useCallback((key) => {
    setLayers(prev => {
      const newLayers = { ...prev, [key]: !prev[key] };
      // Notify OCEAN_STATE
      if (window.OCEAN_STATE) {
        window.OCEAN_STATE.layers = newLayers;
      }
      return newLayers;
    });
  }, []);

  const handleVariableChange = useCallback((e) => {
    const val = e.target.value;
    setVariable(val);
    // Trigger the volumetric variable pill buttons from OCEAN_STATE
    if (window.OCEAN_STATE) {
      window.OCEAN_STATE.variableType = val;
    }
    // Also trigger the existing DOM handler if available
    const pillBtn = document.querySelector(`.vol-pill-btn[data-var="${val}"]`);
    if (pillBtn) pillBtn.click();
  }, []);

  const handleDepthChange = useCallback((e) => {
    setDepth(e.target.value);
  }, []);

  const handleOpacityChange = useCallback((e) => {
    const val = parseInt(e.target.value);
    setOpacity(val);
    const sliderEl = document.getElementById('sliderSliceOpacity');
    if (sliderEl) {
      sliderEl.value = (val / 100).toString();
      sliderEl.dispatchEvent(new Event('input'));
    }
  }, []);

  const handleVerticalExagg = useCallback((e) => {
    const val = parseFloat(e.target.value);
    setVerticalExagg(val);
    const sliderEl = document.getElementById('sliderVerticalExaggeration');
    if (sliderEl) {
      sliderEl.value = val.toString();
      sliderEl.dispatchEvent(new Event('input'));
    }
  }, []);

  const handleDepthSliceToggle = useCallback(() => {
    setDepthSlice(prev => {
      const newVal = !prev;
      const checkEl = document.getElementById('checkVolumetricSlice');
      if (checkEl) {
        checkEl.checked = newVal;
        checkEl.dispatchEvent(new Event('change'));
      }
      return newVal;
    });
  }, []);

  const cycleColormap = useCallback(() => {
    const maps = ['thermal', 'viridis', 'haline'];
    setColormap(prev => {
      const idx = maps.indexOf(prev);
      const next = maps[(idx + 1) % maps.length];
      // Trigger existing DOM colormap cycling
      const bar = document.getElementById('colormapPreviewBar');
      if (bar) bar.click();
      return next;
    });
  }, []);

  const variableLabels = {
    temp: { name: 'Temperature', unit: '°C', min: 'Min 5°C', max: 'Max 30°C' },
    sal: { name: 'Salinity', unit: 'PSU', min: '32 PSU', max: '37 PSU' },
    vel: { name: 'Current', unit: 'm/s', min: '0 m/s', max: '2 m/s' },
    chl: { name: 'Chlorophyll-a', unit: 'mg/m³', min: '0', max: '10' },
  };

  const current = variableLabels[variable] || variableLabels.temp;

  return (
    <div className="sidebar-panel">
      <div className="sidebar-header">
        <div className="sidebar-header__title">
          🌊 Data Layers & Controls
        </div>
      </div>

      <div className="sidebar-scroll">
        {/* DATA LAYERS */}
        <div className="sidebar-section">
          <div className="sidebar-section__label">Data Layers</div>

          <label className="layer-check">
            <input type="checkbox" checked={layers.oceanModel} onChange={() => handleLayerToggle('oceanModel')} />
            <span className="layer-color-swatch" style={{ background: '#ff6b35' }} />
            Ocean Model (Temperature)
          </label>

          <label className="layer-check">
            <input type="checkbox" checked={layers.currentVectors} onChange={() => handleLayerToggle('currentVectors')} />
            <span className="layer-color-swatch" style={{ background: '#38bdf8' }} />
            Current Vectors
          </label>

          <label className="layer-check">
            <input type="checkbox" checked={layers.argoFloats} onChange={() => handleLayerToggle('argoFloats')} />
            <span className="layer-color-swatch" style={{ background: '#ff9436' }} />
            Argo Floats
          </label>

          <label className="layer-check">
            <input type="checkbox" checked={layers.gliders} onChange={() => handleLayerToggle('gliders')} />
            <span className="layer-color-swatch" style={{ background: '#fbbf24' }} />
            Gliders
          </label>

          <label className="layer-check">
            <input type="checkbox" checked={layers.ctd} onChange={() => handleLayerToggle('ctd')} />
            <span className="layer-color-swatch" style={{ background: '#60a5fa' }} />
            CTD
          </label>

          <label className="layer-check">
            <input type="checkbox" checked={layers.bgcChlorophyll} onChange={() => handleLayerToggle('bgcChlorophyll')} />
            <span className="layer-color-swatch" style={{ background: '#4ade80' }} />
            BGC (Chlorophyll)
          </label>
        </div>

        {/* MODEL CONTROLS */}
        <div className="sidebar-section">
          <div className="sidebar-section__label">Model Controls</div>

          <div className="slider-row">
            <div className="slider-row__header">
              <span>Variable</span>
            </div>
            <select className="panel-select" value={variable} onChange={handleVariableChange}>
              <option value="temp">🌡️ Temperature</option>
              <option value="sal">💧 Salinity</option>
              <option value="vel">🌊 Current Velocity</option>
              <option value="chl">🌿 Chlorophyll-a</option>
            </select>
          </div>

          <div className="slider-row">
            <div className="slider-row__header">
              <span>Depth</span>
            </div>
            <select className="panel-select" value={depth} onChange={handleDepthChange}>
              <option value="0">Surface (0m)</option>
              <option value="50">50 m</option>
              <option value="100">100 m</option>
              <option value="200">200 m</option>
              <option value="500">500 m</option>
              <option value="1000">1000 m</option>
              <option value="2000">2000 m</option>
            </select>
          </div>

          <div className="slider-row">
            <div className="slider-row__header">
              <span>Opacity</span>
              <span className="slider-row__value">{opacity}%</span>
            </div>
            <input
              type="range"
              className="panel-slider"
              min="10"
              max="100"
              step="5"
              value={opacity}
              onChange={handleOpacityChange}
            />
          </div>

          <div className="slider-row">
            <div className="slider-row__header">
              <span>Colorbar</span>
              <span className="slider-row__value" style={{ textTransform: 'capitalize' }}>{colormap}</span>
            </div>
            <div
              className={`colorbar-preview colorbar-preview--${colormap}`}
              onClick={cycleColormap}
              title="Click to cycle colormap"
            />
            <div className="colorbar-range">
              <span>{current.min}</span>
              <span>{current.max}</span>
            </div>
          </div>
        </div>

        {/* VISUALIZATION */}
        <div className="sidebar-section">
          <div className="sidebar-section__label">Visualization</div>

          <label className="layer-check">
            <input type="checkbox" checked={depthSlice} onChange={handleDepthSliceToggle} />
            Depth Slice
          </label>

          <label className="layer-check">
            <input type="checkbox" checked={currentVectorsViz} onChange={() => setCurrentVectorsViz(p => !p)} />
            Current Vectors
          </label>

          <div className="slider-row">
            <div className="slider-row__header">
              <span>Vertical Exaggeration</span>
              <span className="slider-row__value">{verticalExagg.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              className="panel-slider"
              min="1"
              max="8"
              step="0.5"
              value={verticalExagg}
              onChange={handleVerticalExagg}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default LeftSidebar;
