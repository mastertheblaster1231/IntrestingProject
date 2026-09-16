import { create } from 'zustand';
import { DEMO_INSTRUMENTS } from './instruments.js';
import { fetchLiveArgoProfile, getProfileAtDepth } from '../services/argoService.js';
import { fetchArgoDepthSlice } from '../services/argoBackendService.js';
import {
  calculateDelta,
  getComparisonStatus,
  alignDepthProvenance,
  SUPPORTED_VARIABLES,
  calculateRealisticObservedProfile,
  calculateRealisticModelProfile,
} from './deltaMath.js';

/**
 * useOceanStore.js — Global Zustand State Management Store
 * =========================================================
 * INCOIS Ocean Visualization Dashboard — SIH Problem 26067
 *
 * This store is the single source of truth for ALL UI state.
 * It coordinates:
 *   - Data layer toggles (Argo, model, currents, gliders)
 *   - Model controls (active variable, depth slider, colorbar)
 *   - Visualization settings (depth slice, isosurface, exaggeration)
 *   - Active instrument telemetry (live float clicked on map)
 *   - Live vs. model data comparison (Delta = Observation - Model)
 *
 * ── NEW IN PHASE 3 ───────────────────────────────────────────────────────────
 *   selectFloat(floatId)    — async: fetches ERDDAP + model, calculates Delta
 *   setDepth(newDepth)      — recalculates model prediction + Delta on slider move
 *   modelComparison state   — holds { observed, model, delta } for UI panels
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

/** FastAPI microservice base URL (server.py running locally) */
const MODEL_API_BASE = 'http://127.0.0.1:8000';

/** Timeout for FastAPI model API calls in milliseconds */
const MODEL_API_TIMEOUT_MS = 4000;

// ─── STORE ───────────────────────────────────────────────────────────────────
export const useOceanStore = create((set, get) => ({

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. REUSABLE LAYER REGISTRY (Extensible for INCOIS HF-Radar, ADCP, etc.)
  // ═══════════════════════════════════════════════════════════════════════════
  layers: {
    bathymetry: true,
    argoFloats: true,
    currents:   false,
    hfRadar:    false,
    adcp:       false,
  },

  /**
   * Dynamic reusable action that updates any layer by key without rewriting store
   * @param {string} layerId - e.g. 'bathymetry', 'argoFloats', 'currents'
   * @param {boolean} [isVisible] - Explicit boolean, or toggles current if undefined
   */
  toggleLayer: (layerId, isVisible) => {
    set((state) => {
      const nextVisible = typeof isVisible === 'boolean'
        ? isVisible
        : !state.layers[layerId];

      const updatedLayers = {
        ...state.layers,
        [layerId]: nextVisible,
      };

      // Two-way synchronization with vanilla Three.js / window bridges
      if (layerId === 'bathymetry') {
        if (window.OCEAN_STATE) window.OCEAN_STATE.showBathymetry = nextVisible;
      } else if (layerId === 'currents') {
        if (window.OCEAN_STATE) window.OCEAN_STATE.showCurrents = nextVisible;
      }

      return {
        layers: updatedLayers,
      };
    });
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 1b. LEGACY DATA LAYERS (Backwards-compatibility bridge)
  // ═══════════════════════════════════════════════════════════════════════════
  dataLayers: {
    showModel:    true,
    showCurrents: true,
    showArgo:     true,
    showGliders:  true,
  },

  setDataLayer: (layerKey, value) => {
    set((state) => {
      const updated = {
        ...state.dataLayers,
        [layerKey]: typeof value === 'boolean' ? value : !state.dataLayers[layerKey],
      };
      // Synchronize with window.OCEAN_STATE for Three.js vanilla bridge
      if (window.OCEAN_STATE) window.OCEAN_STATE.layers = updated;
      return { dataLayers: updated };
    });
  },

  toggleDataLayer: (layerKey) => get().setDataLayer(layerKey),

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. MODEL CONTROLS
  // ═══════════════════════════════════════════════════════════════════════════
  modelControls: {
    activeVariable: 'temperature', // 'temperature' | 'salinity' | 'current' | 'chlorophyll'
    currentDepth:   500,            // 0 – 4000 metres
    opacity:        0.7,            // 0.0 – 1.0
    colorbar: {
      min:     5,
      max:     30,
      palette: 'thermal',
    },
  },

  setModelControl: (key, value) => {
    set((state) => ({
      modelControls: { ...state.modelControls, [key]: value },
    }));
  },

  setActiveVariable: (activeVariable) => {
    set((state) => {
      const minMaxMap = {
        temperature:      { min: 5,    max: 30,  palette: 'thermal' },
        salinity:         { min: 32,   max: 37,  palette: 'haline'  },
        current:          { min: 0,    max: 2.0, palette: 'viridis' },
        currentSpeed:     { min: 0,    max: 2.0, palette: 'viridis' },
        currentDirection: { min: 0,    max: 360, palette: 'cyclic'  },
        chlorophyll:      { min: 0.01, max: 5.0, palette: 'algae'   },
        dissolvedOxygen:  { min: 40,   max: 300, palette: 'plasma'  },
      };
      const colorbar = minMaxMap[activeVariable] || state.modelControls.colorbar;
      if (typeof window !== 'undefined' && window.OCEAN_STATE) {
        window.OCEAN_STATE.variableType = activeVariable;
        window.OCEAN_STATE.variable = activeVariable;
        if (typeof window.updateVolumeVariable === 'function') {
          window.updateVolumeVariable(activeVariable);
        }
        if (typeof window.updateParticlesVariable === 'function') {
          window.updateParticlesVariable(activeVariable);
        }
      }
      return {
        modelControls: { ...state.modelControls, activeVariable, colorbar },
      };
    });
  },

  /**
   * setCurrentDepth
   * ---------------
   * Updates the depth slider value AND recalculates the model vs. observation Delta
   * if a float is currently selected. This lets the user drag the depth slider
   * and see the comparison panel update in real time.
   *
   * @param {number} depth  New depth in metres (0 – 4000)
   */
  setCurrentDepth: (depth) => {
    const clampedDepth = Math.max(0, Math.min(4000, Math.round(depth)));

    set((state) => ({
      modelControls: { ...state.modelControls, currentDepth: clampedDepth },
      targetDepth: clampedDepth,
      activeInstrumentDepth: clampedDepth,
    }));

    // Notify Three.js scene of the new depth ratio for the vertical slice mesh
    const ratio = clampedDepth / 4000.0;
    if (window.setOceanDepth) window.setOceanDepth(ratio);
    if (window.OCEAN_STATE) {
      window.OCEAN_STATE.currentDepth = clampedDepth;
      window.OCEAN_STATE.depthRatio   = ratio;
    }

    // Update vanilla DOM depth slider elements (legacy bridge)
    const depthInput = document.getElementById('depthInput');
    if (depthInput && document.activeElement !== depthInput) depthInput.value = clampedDepth;
    const fill  = document.getElementById('depthTrackFill');
    const thumb = document.getElementById('depthThumb');
    const pct   = (ratio * 100).toFixed(1);
    if (fill)  fill.style.height = `${pct}%`;
    if (thumb) thumb.style.top   = `${pct}%`;

    // Update depth zone label and indicator dot
    _updateDepthZoneUI(clampedDepth);

    // Dynamically update model comparison, observation, and realtime residuals when diving
    const { _activeArgoProfile, activeInstrument } = get();
    if (activeInstrument) {
      get()._recalculateModelComparison(_activeArgoProfile, activeInstrument, clampedDepth);
    }
  },

  setOpacity: (opacity) => {
    const clamped = Math.max(0, Math.min(1, opacity));
    set((state) => ({
      modelControls: { ...state.modelControls, opacity: clamped },
    }));
    if (window.OCEAN_STATE) window.OCEAN_STATE.sliceOpacity = clamped;
  },

  setColorbar: (colorbarUpdate) => {
    set((state) => ({
      modelControls: {
        ...state.modelControls,
        colorbar: { ...state.modelControls.colorbar, ...colorbarUpdate },
      },
    }));
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. VISUALIZATION SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════
  visualization: {
    showDepthSlice:       true,
    verticalExaggeration: 10.0,  // 1x – 100x
  },

  setVisualization: (key, value) => {
    set((state) => ({
      visualization: { ...state.visualization, [key]: value },
    }));
  },

  setShowDepthSlice: (showDepthSlice) => {
    set((state) => ({ visualization: { ...state.visualization, showDepthSlice } }));
    if (window.OCEAN_STATE) window.OCEAN_STATE.showSlice = showDepthSlice;
  },

  setVerticalExaggeration: (verticalExaggeration) => {
    const clamped = Math.max(1, Math.min(100, verticalExaggeration));
    set((state) => ({
      visualization: { ...state.visualization, verticalExaggeration: clamped },
    }));
    if (window.OCEAN_STATE) {
      window.OCEAN_STATE.verticalExaggeration = clamped;
      if (window.setOceanDepth) window.setOceanDepth(window.OCEAN_STATE.depthRatio || 0.125);
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. SECTOR FLEET REGISTRY & ACTIVE INSTRUMENT TELEMETRY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Primary Fleet Registry: strictly the 3 representative oceanographic instruments
   * (Argo Lagrangian drifter, Autonomous Slocum glider, and shipboard CTD rosette)
   */
  fleet: DEMO_INSTRUMENTS,

  activeInstrument: null,

  isLoadingInstrument: false,
  instrumentError:     null,

  /**
   * _activeArgoProfile — internal state holding the raw ArgoProfile object
   * returned by fetchLiveArgoProfile(). NOT exposed directly to UI components;
   * only used by _recalculateModelComparison to interpolate at the selected depth.
   */
  _activeArgoProfile: null,

  setActiveInstrument: (activeInstrument) => {
    const enriched = activeInstrument ? {
      x: activeInstrument.x ?? (activeInstrument.position ? activeInstrument.position[0] : 0.0),
      y: activeInstrument.y ?? (activeInstrument.position ? activeInstrument.position[1] : 0.0),
      z: activeInstrument.z ?? (activeInstrument.position ? activeInstrument.position[2] : 1.5),
      ...activeInstrument,
    } : null;
    set({ activeInstrument: enriched, instrumentError: null });
    if (window.OCEAN_STATE && enriched) {
      window.OCEAN_STATE.selectedInstrument = enriched;
    }
  },

  /**
   * selectInstrument
   * ----------------
   * Dynamic action to switch the active instrument platform from the fleet.
   * Updates activeInstrument in Zustand, resets activeInstrumentDepth,
   * switches the telemetry drawer and bottom analytics cards, and notifies
   * the 3D camera / Three.js bridge.
   *
   * @param {string} instrumentId - e.g. 'argo-2902351', 'glider-slocum-04', 'ctd-rosette-01'
   */
  selectInstrument: (instrumentId) => {
    const currentFleet = get().fleet || DEMO_INSTRUMENTS;
    const inst =
      currentFleet.find((i) => i.id === instrumentId) ||
      currentFleet.find((i) => i.id.includes(instrumentId) || instrumentId.includes(i.id));

    if (!inst) {
      console.warn(`[useOceanStore] Instrument "${instrumentId}" not found in fleet.`);
      return;
    }

    const instSavedCoord = get().instruments?.[inst.id] || {};
    const targetDepth = instSavedCoord.depth ?? inst.depth ?? inst.depthMeters ?? (inst.type === 'glider' ? 190 : inst.type === 'ctd' ? 1200 : 15);
    const targetTransect = instSavedCoord.transectDistance ?? (inst.type === 'glider' ? 25 : 0);
    const realisticObs = calculateRealisticObservedProfile(targetDepth, inst.type || 'argo', inst);

    // 1. INSTANT SYNCHRONOUS UPDATE (0ms latency, eliminates frozen UI and lag)
    const enriched = {
      x: inst.position ? inst.position[0] : 0.0,
      y: inst.position ? inst.position[1] : -0.2,
      z: inst.position ? inst.position[2] : 1.5,
      depth: targetDepth,
      depthMeters: targetDepth,
      temp: realisticObs.temperature,
      salinity: realisticObs.salinity,
      dissolvedOxygen: realisticObs.dissolvedOxygen,
      currentSpeed: realisticObs.currentSpeed,
      currentDirection: realisticObs.currentDirection,
      chlorophyll: realisticObs.chlorophyll,
      battery: inst.telemetry?.batteryPct ?? 80,
      ...inst,
    };

    set((state) => ({
      activeInstrument: enriched,
      targetDepth: targetDepth,
      activeInstrumentDepth: targetDepth,
      activeInstrumentHorizontal: targetTransect,
      instruments: {
        ...state.instruments,
        [inst.id]: {
          ...(state.instruments[inst.id] || { x: 0, z: 0 }),
          depth: targetDepth,
          ...(inst.type === 'glider' ? { transectDistance: targetTransect } : {}),
        },
      },
      modelControls: { ...state.modelControls, currentDepth: targetDepth },
      isLoadingInstrument: false,
      instrumentError: null,
    }));

    if (typeof window !== 'undefined' && window.OCEAN_STATE) {
      window.OCEAN_STATE.selectedInstrument = enriched;
      window.OCEAN_STATE.currentDepth = targetDepth;
      window.OCEAN_STATE.depthRatio = targetDepth / 4000.0;
      window.OCEAN_STATE.activeInstrumentHorizontal = targetTransect;
    }

    // Trigger multi-variable validation engine
    get()._recalculateModelComparison(null, enriched, targetDepth);

    // If Argo, fetch live background profile asynchronously without blocking UI
    if (inst.type?.toLowerCase() === 'argo') {
      get().selectFloat(inst.floatId || inst.id);
    }

    // Sync with 3D camera / Three.js bridge (guarded against recursive re-entrancy)
    if (
      typeof window !== 'undefined' &&
      typeof window.focusInstrument === 'function' &&
      !window.__syncingInstrument
    ) {
      window.__syncingInstrument = true;
      try {
        window.focusInstrument(inst.id);
      } finally {
        window.__syncingInstrument = false;
      }
    }
  },

  clearActiveInstrument: () => {
    set({ activeInstrument: null, instrumentError: null, _activeArgoProfile: null, activeInstrumentHorizontal: 0 });
  },

  // ─── TEMPORAL STATE & DIURNAL CYCLE (Requirement 1 & 2) ──────────────────
  selectedTimestamp: new Date().toISOString(),

  /**
   * setSelectedTimestamp
   * --------------------
   * Updates the global simulated timestamp and recalculates deterministic diurnal perturbations
   * across model and observational datasets in real time without random numbers.
   *
   * @param {string|Date|number} timestamp
   */
  setSelectedTimestamp: (timestamp) => {
    let dateObj;
    try {
      dateObj = new Date(timestamp);
      if (isNaN(dateObj.getTime())) dateObj = new Date();
    } catch {
      dateObj = new Date();
    }
    const isoString = dateObj.toISOString();

    const { activeInstrument, targetDepth } = get();
    const instId = activeInstrument?.id || 'argo-2902351';
    const depth = targetDepth ?? 15;
    const dyn = getInstrumentComparisonData(instId, depth, isoString);

    set((state) => ({
      selectedTimestamp: isoString,
      modelComparison: {
        ...state.modelComparison,
        targetDepth: depth,
        observationDepth: depth,
        modelDepth: depth,
        observed: dyn.observed,
        model: dyn.model,
        delta: dyn.delta,
        variables: dyn.variables,
      },
    }));

    if (typeof window !== 'undefined' && window.OCEAN_STATE) {
      window.OCEAN_STATE.selectedTimestamp = isoString;
      const hour = dateObj.getHours() + dateObj.getMinutes() / 60.0;
      window.OCEAN_STATE.simulatedHour = hour;
    }

    const { _activeArgoProfile } = get();
    if (activeInstrument) {
      get()._recalculateModelComparison(_activeArgoProfile, activeInstrument, targetDepth);
    }
  },

  // ─── MULTI-DEVICE COMPARISON STATE (Requirement 3) ──────────────────────
  comparedInstruments: ['argo-2902351', 'glider-slocum-04'],

  setComparedInstruments: (instruments) => {
    const list = Array.isArray(instruments) ? instruments : [instruments];
    set({ comparedInstruments: list });
  },

  addComparedInstrument: (instrumentId) => {
    if (!instrumentId) return;
    set((state) => ({
      comparedInstruments: Array.from(new Set([...state.comparedInstruments, instrumentId])),
    }));
  },

  removeComparedInstrument: (instrumentId) => {
    set((state) => ({
      comparedInstruments: state.comparedInstruments.filter((id) => id !== instrumentId),
    }));
  },

  toggleComparedInstrument: (instrumentId) => {
    if (!instrumentId) return;
    set((state) => {
      const exists = state.comparedInstruments.includes(instrumentId);
      const updated = exists
        ? state.comparedInstruments.filter((id) => id !== instrumentId)
        : [...state.comparedInstruments, instrumentId];
      return {
        comparedInstruments: updated.length > 0 ? updated : [instrumentId],
      };
    });
  },

  // ─── DEPTH AS A FIRST-CLASS STATE FILTER ─────────────────────────────────
  /**
   * targetDepth
   * -----------
   * Primary user-defined depth filter for the Multi-Variable Validation Engine.
   * Tracks the target vertical coordinate (0 – 4000 m) used to align in-situ
   * observations with 4D NetCDF ocean model vertical grid levels.
   */
  // ─── INDEPENDENT INSTRUMENT SPATIAL COORDINATES ─────────────────────────
  instruments: {
    'argo-2902351': { depth: 15, x: 0, z: 0 },
    'glider-slocum-04': { depth: 190, transectDistance: 25, x: 0, z: 0 },
    'ctd-rosette-01': { depth: 1200, x: 0, z: 0 },
  },

  targetDepth: 15,
  activeInstrumentDepth: 15, // synchronized alias for backwards compatibility
  activeInstrumentHorizontal: 25, // 0 - 50 km horizontal transect for autonomous gliders

  /**
   * setActiveInstrumentTransect
   * --------------------------
   * Updates instruments['glider-slocum-04'].transectDistance.
   *
   * @param {number} km Distance in km (0 - 50)
   */
  setActiveInstrumentTransect: (km) => {
    const clamped = Math.max(0, Math.min(50, typeof km === 'number' ? km : parseFloat(km) || 0));
    set((state) => ({
      instruments: {
        ...state.instruments,
        'glider-slocum-04': {
          ...(state.instruments['glider-slocum-04'] || { depth: 190, x: 0, z: 0 }),
          transectDistance: clamped,
        },
      },
      activeInstrumentHorizontal: clamped,
    }));
    if (typeof window !== 'undefined' && window.OCEAN_STATE) {
      window.OCEAN_STATE.activeInstrumentHorizontal = clamped;
    }
  },

  /** Alias for backward compatibility */
  setActiveInstrumentHorizontal: (horizontal) => {
    get().setActiveInstrumentTransect(horizontal);
  },

  /**
   * setActiveInstrumentDepth
   * ------------------------
   * Updates instruments[activeInstrumentId].depth.
   * Isolates depth so modifying one instrument never alters another instrument.
   */
  setActiveInstrumentDepth: (depth) => {
    const clampedDepth = Math.max(0, Math.min(4000, Math.round(Number(depth) || 0)));
    const activeInstrument = get().activeInstrument;
    const activeId = activeInstrument?.id || 'argo-2902351';
    const ts = get().selectedTimestamp || new Date().toISOString();
    const dyn = getInstrumentComparisonData(activeId, clampedDepth, ts);

    set((state) => ({
      instruments: {
        ...state.instruments,
        [activeId]: {
          ...(state.instruments[activeId] || { x: 0, z: 0 }),
          depth: clampedDepth,
        },
      },
      activeInstrumentDepth: clampedDepth,
      targetDepth: clampedDepth,
      modelControls: { ...state.modelControls, currentDepth: clampedDepth },
      modelComparison: {
        ...state.modelComparison,
        targetDepth: clampedDepth,
        observationDepth: clampedDepth,
        modelDepth: clampedDepth,
        observed: dyn.observed,
        model: dyn.model,
        delta: dyn.delta,
        variables: dyn.variables,
      },
    }));

    if (typeof window !== 'undefined' && window.OCEAN_STATE) {
      window.OCEAN_STATE.currentDepth = clampedDepth;
      window.OCEAN_STATE.depthRatio = clampedDepth / 4000.0;
    }

    if (typeof window !== 'undefined' && window.setOceanDepth && !window.__syncingDepth) {
      window.__syncingDepth = true;
      try {
        window.setOceanDepth(clampedDepth / 4000.0);
      } finally {
        window.__syncingDepth = false;
      }
    }

    const { _activeArgoProfile } = get();
    if (activeInstrument) {
      get()._recalculateModelComparison(_activeArgoProfile, activeInstrument, clampedDepth);
    }
  },

  /**
   * setTargetDepth
   * --------------
   * Updates targetDepth, synchronizes 3D depth, and runs the depth-alignment engine.
   *
   * @param {number} depth User-requested depth in metres (0 – 4000)
   */
  setTargetDepth: (depth) => {
    const clampedDepth = Math.max(0, Math.min(4000, Math.round(Number(depth) || 0)));
    get().setActiveInstrumentDepth(clampedDepth);

    const ratio = clampedDepth / 4000.0;
    if (window.setOceanDepth && !window.__syncingDepth) {
      window.__syncingDepth = true;
      try {
        window.setOceanDepth(ratio);
      } finally {
        window.__syncingDepth = false;
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. MULTI-VARIABLE MODEL VALIDATION ENGINE (Δ = Observation - Model)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * modelComparison
   * ---------------
   * Complete multi-variable validation state comparing in-situ observations against
   * NetCDF supercomputer models across 6 physical parameters at the user-filtered targetDepth.
   */
  modelComparison: {
    targetDepth:      15,
    observationDepth: 15,
    modelDepth:       15,
    matchingMethod:   'Nearest Valid',
    provenance: {
      targetDepth:      15,
      observationDepth: 15,
      modelDepth:       15,
      matchingMethod:   'Nearest Valid',
    },
    variables: {
      temperature:      { key: 'temperature',      obs: 28.3, model: 28.1,  delta: 0.2,   status: 'VALID' },
      salinity:         { key: 'salinity',         obs: 34.3, model: 34.12, delta: 0.18,  status: 'VALID' },
      chlorophyll:      { key: 'chlorophyll',      obs: 0.42, model: 0.45,  delta: -0.03, status: 'VALID' },
      currentSpeed:     { key: 'currentSpeed',     obs: 0.42, model: 0.38,  delta: 0.04,  status: 'VALID' },
      currentDirection: { key: 'currentDirection', obs: 42.0, model: 40.0,  delta: 2.0,   status: 'VALID' },
      dissolvedOxygen:  { key: 'dissolvedOxygen',  obs: 198.0, model: 202.4, delta: -4.4, status: 'VALID' },
    },
    observed: {
      temperature:      28.3,
      salinity:         34.3,
      chlorophyll:      0.42,
      currentSpeed:     0.42,
      currentDirection: 42.0,
      dissolvedOxygen:  198.0,
    },
    model: {
      temperature:      28.1,
      salinity:         34.12,
      chlorophyll:      0.45,
      currentSpeed:     0.38,
      currentDirection: 40.0,
      dissolvedOxygen:  202.4,
    },
    delta: {
      temperature:      0.2,
      salinity:         0.18,
      chlorophyll:      -0.03,
      currentSpeed:     0.04,
      currentDirection: 2.0,
      dissolvedOxygen:  -4.4,
    },
    depth:       15,
    isLoading:   false,
    error:       null,
    modelSource: 'live-api',
    obsSource:   'live-erddap',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5b. BGC ARGO & FLOAT HYDRAULICS TELEMETRY (FastAPI /api/argo/depth-slice)
  // ═══════════════════════════════════════════════════════════════════════════
  argoTelemetry: null,
  bgcOptics: null,
  hydraulicsTelemetry: null,
  isFetchingArgoTelemetry: false,

  fetchArgoBGCTelemetry: async (depthMeters = 15, timestamp = null, platformNumber = '2902251') => {
    set({ isFetchingArgoTelemetry: true });
    try {
      const data = await fetchArgoDepthSlice(platformNumber, depthMeters, timestamp);
      if (data) {
        set({
          argoTelemetry: data,
          bgcOptics: data.bgc_optics_and_diagnostics || null,
          hydraulicsTelemetry: data.hydraulics_telemetry || null,
          isFetchingArgoTelemetry: false,
        });
        return data;
      }
    } catch (err) {
      console.warn('[useOceanStore] fetchArgoBGCTelemetry failed:', err);
    }
    set({ isFetchingArgoTelemetry: false });
    return null;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. ASYNC ACTIONS — PHASE 3 CORE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * selectFloat
   * -----------
   * The primary entry point called when the user clicks an Argo float marker
   * on the 3D globe or the fleet sidebar.
   *
   * Execution sequence:
   *   1. Set loading state to true
   *   2. Await fetchLiveArgoProfile(floatId)  ← ERDDAP or offline cache
   *   3. Map the ArgoProfile to the existing activeInstrument shape
   *   4. Await _recalculateModelComparison()  ← FastAPI model point extraction
   *   5. Set all state atomically via a single set() call
   *
   * The two async calls (ERDDAP + FastAPI) are kicked off concurrently with
   * Promise.allSettled so a FastAPI outage doesn't block the instrument panel.
   *
   * @param {string|number} floatId  WMO platform number, e.g. "2902351"
   */
  selectFloat: async (floatId) => {
    const rawId = String(floatId).replace(/^argo-/i, '');

    // 0. IMMEDIATE LOCAL SYNC (0ms UI latency, eliminates lag while awaiting ERDDAP)
    const localMetaImmediate = DEMO_INSTRUMENTS.find(
      (d) => d.id === `argo-${rawId}` || d.floatId === rawId
    );
    if (localMetaImmediate) {
      const immediateDepth = Math.round(localMetaImmediate.geoCoordinates?.depthM ?? localMetaImmediate.depthMeters ?? 15);
      set({
        activeInstrument: {
          ...localMetaImmediate,
          depth: immediateDepth,
          depthMeters: immediateDepth,
        },
        targetDepth: immediateDepth,
        activeInstrumentDepth: immediateDepth,
        activeInstrumentHorizontal: 0, // completely isolates horizontal state
        isLoadingInstrument: false,
        instrumentError: null,
      });
    }

    // Signal background fetching quietly
    set({
      modelComparison: {
        ...get().modelComparison,
        isLoading: true,
        error:     null,
      },
    });

    // ── PHASE A: ERDDAP live Argo data ─────────────────────────────────────
    // fetchLiveArgoProfile handles its own timeout and offline fallback internally,
    // so this await always resolves (never rejects).
    let argoProfile;
    try {
      argoProfile = await fetchLiveArgoProfile(rawId);
    } catch (unexpectedError) {
      // This branch should never be hit (argoService catches all errors internally),
      // but we guard it anyway for production robustness
      console.error('[useOceanStore] Unexpected error from fetchLiveArgoProfile:', unexpectedError);
      set({
        isLoadingInstrument: false,
        instrumentError:     'Failed to load float profile',
        modelComparison: {
          ...get().modelComparison,
          isLoading: false,
          error:     'Float data unavailable',
        },
      });
      return null;
    }

    // ── MAP ArgoProfile to the activeInstrument shape ──────────────────────
    // The UI panels were built to read from activeInstrument, so we map the
    // clean ArgoProfile fields into the legacy instrument object shape.
    const obsAtSurface = getProfileAtDepth(argoProfile, 0);   // surface reading for header display

    // Try to enrich with existing DEMO_INSTRUMENTS metadata (cycle, battery, etc.)
    const localMeta = DEMO_INSTRUMENTS.find(
      (d) => d.id === `argo-${rawId}` || d.floatId === rawId
    );

    // Use the float's actual physical depth from its profile, NOT the global slice depth.
    // This is the key decoupling: clicking a float resets activeInstrumentDepth
    // to the float's real depth without touching the 3D slice.
    const floatPhysicalDepth = Math.round(localMeta?.geoCoordinates?.depthM ?? obsAtSurface.depth ?? 15);

    const instrumentData = {
      id:               `argo-${rawId}`,
      floatId:          rawId,
      name:             argoProfile.name,
      platform:         localMeta?.platform || 'APEX Profiling Float',
      lat:              argoProfile.lat,
      lon:              argoProfile.lon,
      depth:            floatPhysicalDepth,
      temp:             obsAtSurface.temperature,
      salinity:         obsAtSurface.salinity,
      // Fields not available from ERDDAP profile endpoint — use local metadata or sensible defaults
      dissolvedOxygen:  localMeta?.telemetry?.dissolvedOxygen  ?? 195,
      chlorophyll:      localMeta?.telemetry?.chlorophyll      ?? 0.38,
      currentSpeed:     localMeta?.telemetry?.currentSpeed     ?? 0.40,
      currentDirection: localMeta?.telemetry?.currentDirection ?? 'ENE (55°)',
      status:           'ACTIVE',
      cycle:            localMeta?.telemetry?.cycle   ?? 148,
      battery:          localMeta?.telemetry?.battery ?? 80,
      timestamp:        argoProfile.timestamp,
      source:           argoProfile.source === 'live-erddap'
                          ? 'IFREMER / INCOIS Live ERDDAP GDAC'
                          : argoProfile.source === 'offline-cache'
                          ? 'Offline Cache (Hackathon Fail-Safe)'
                          : 'Synthetic Profile',
      profileId:        `${rawId} / ${localMeta?.telemetry?.cycle ?? 148}`,
      qcStatus:         'GOOD',
    };

    // Store the raw ArgoProfile internally for depth-slider recalculation
    // AND reset targetDepth and activeInstrumentDepth to this float's physical depth.
    set({
      _activeArgoProfile:         argoProfile,
      activeInstrument:           instrumentData,
      targetDepth:                floatPhysicalDepth,
      activeInstrumentDepth:      floatPhysicalDepth,
      activeInstrumentHorizontal: 0, // completely isolates horizontal state
      isLoadingInstrument:        false,
      instrumentError:            null,
    });

    if (typeof window !== 'undefined' && window.OCEAN_STATE) {
      window.OCEAN_STATE.selectedInstrument = instrumentData;
    }

    // ── PHASE B: Model extraction + Multi-Variable Delta calculation ─────────
    await get()._recalculateModelComparison(argoProfile, instrumentData, floatPhysicalDepth);

    return instrumentData;
  },

  /**
   * _recalculateModelComparison
   * ---------------------------
   * Multi-Variable Validation Engine (Observation vs 4D NetCDF Model).
   * Supports: Temperature, Salinity, Chlorophyll-a, Current Speed, Current Direction, Dissolved Oxygen.
   *
   * 1. Aligns targetDepth with in-situ observation profile and NetCDF vertical model grid.
   * 2. Stores provenance metadata: targetDepth, observationDepth, modelDepth, matchingMethod.
   * 3. Handles missing data gracefully: if either side is missing, delta = null.
   * 4. Applies vector circular math for Current Direction to prevent wrap-around errors.
   */
  _recalculateModelComparison: async (profile, instrument, targetDepthM) => {
    const depthM = Math.max(0, Math.min(4000, Math.round(Number(targetDepthM) || 0)));

    // 1. Depth Alignment & Provenance calculation
    const profileLevels = profile?.profile || null;
    const fallbackObsDepth = instrument?.depth ?? instrument?.depthMeters ?? depthM;
    const provenance = alignDepthProvenance(depthM, profileLevels, fallbackObsDepth);
    const timestamp = get().selectedTimestamp || new Date().toISOString();

    // 2. Extract In-Situ Observations across all 6 parameters (with diurnal cycle)
    const obsVars = _extractObservationVariables(profile, instrument, provenance.observationDepth, depthM, timestamp);

    // Immediate state update with loading indicator
    set((state) => ({
      modelComparison: {
        ...state.modelComparison,
        isLoading: true,
        targetDepth: depthM,
        observationDepth: provenance.observationDepth,
        modelDepth: provenance.modelDepth,
        matchingMethod: provenance.matchingMethod,
        provenance,
        observed: obsVars,
      },
    }));

    // 3. Extract NetCDF Model prediction (live API or analytical simulation fallback)
    let modelRaw = null;
    let modelSource = 'live-api';
    let modelError = null;

    try {
      const modelResp = await _fetchModelPoint(
        instrument?.lat ?? 11.6,
        instrument?.lon ?? 92.5,
        depthM
      );
      if (modelResp && modelResp.model) {
        modelRaw = modelResp.model;
        if (modelResp.matching_metadata?.model_depth != null) {
          provenance.modelDepth = modelResp.matching_metadata.model_depth;
        }
        if (modelResp.matching_metadata?.matching_method) {
          provenance.matchingMethod = modelResp.matching_metadata.matching_method;
        }
        modelSource = modelResp.data_source || 'live-api';
      } else {
        throw new Error('Invalid model response payload');
      }
    } catch (modelErr) {
      modelRaw = _simulateModelPointFallback(
        instrument?.lat ?? 11.6,
        instrument?.lon ?? 92.5,
        depthM,
        timestamp
      );
      modelSource = 'synthetic-fallback';
    }

    // 4. Normalize Model Variables with diurnal cycle
    const diurnalMod = calculateDiurnalModulation(timestamp, depthM, true);
    const modelVars = {
      temperature:      modelRaw.temperature != null ? +(Number(modelRaw.temperature) + (modelSource === 'live-api' ? diurnalMod.temperature : 0)).toFixed(2) : null,
      salinity:         modelRaw.salinity != null ? +(Number(modelRaw.salinity) + (modelSource === 'live-api' ? diurnalMod.salinity : 0)).toFixed(2) : null,
      chlorophyll:      modelRaw.chlorophyll != null ? +(Math.max(0.01, Number(modelRaw.chlorophyll) + (modelSource === 'live-api' ? diurnalMod.chlorophyll : 0))).toFixed(2) : null,
      currentSpeed:     modelRaw.current_speed != null ? +(Math.max(0.01, Number(modelRaw.current_speed) + (modelSource === 'live-api' ? diurnalMod.currentSpeed : 0))).toFixed(2) : (modelRaw.currentSpeed != null ? +(Math.max(0.01, Number(modelRaw.currentSpeed) + (modelSource === 'live-api' ? diurnalMod.currentSpeed : 0))).toFixed(2) : null),
      currentDirection: modelRaw.current_direction != null ? +((Number(modelRaw.current_direction) + (modelSource === 'live-api' ? diurnalMod.currentDirection : 0) + 360) % 360).toFixed(1) : (modelRaw.currentDirection != null ? +((Number(modelRaw.currentDirection) + (modelSource === 'live-api' ? diurnalMod.currentDirection : 0) + 360) % 360).toFixed(1) : null),
      dissolvedOxygen:  modelRaw.dissolved_oxygen != null ? +(Math.max(5.0, Number(modelRaw.dissolved_oxygen) + (modelSource === 'live-api' ? diurnalMod.dissolvedOxygen : 0))).toFixed(1) : (modelRaw.dissolvedOxygen != null ? +(Math.max(5.0, Number(modelRaw.dissolvedOxygen) + (modelSource === 'live-api' ? diurnalMod.dissolvedOxygen : 0))).toFixed(1) : null),
    };

    // 5. Compute Deltas using standard or circular math & evaluate missing states
    const deltaVars = {};
    const variablesState = {};
    const varKeys = ['temperature', 'salinity', 'chlorophyll', 'currentSpeed', 'currentDirection', 'dissolvedOxygen'];

    for (const k of varKeys) {
      const o = obsVars[k];
      const m = modelVars[k];

      // Missing Data Rule: Never calculate difference if one side is missing
      const d = (o != null && m != null && !isNaN(o) && !isNaN(m))
        ? calculateDelta(k, o, m)
        : null;

      deltaVars[k] = d;
      variablesState[k] = {
        key: k,
        obs: o,
        model: m,
        delta: d,
        status: getComparisonStatus(o, m),
      };
    }

    // 6. Atomically update Zustand store with provenance and comparison data
    set({
      modelComparison: {
        targetDepth:      depthM,
        observationDepth: provenance.observationDepth,
        modelDepth:       provenance.modelDepth,
        matchingMethod:   provenance.matchingMethod,
        provenance,
        variables:        variablesState,
        observed:         obsVars,
        model:            modelVars,
        delta:            deltaVars,
        depth:            depthM,
        isLoading:        false,
        error:            modelError,
        modelSource,
        obsSource:        profile?.source || (instrument?.type === 'glider' ? 'glider-telemetry' : 'shipboard-ctd'),
      },
    });

    // Simultaneously fetch full BGC optics and float hydraulics depth-slice
    const rawPlatform = instrument?.floatId || instrument?.id?.replace(/^argo-/i, '') || '2902251';
    get().fetchArgoBGCTelemetry(depthM, timestamp, rawPlatform);
  },

  /**
   * setDepth
   * --------
   * Public action for the depth slider UI component.
   * Wraps setCurrentDepth — the recalculation logic lives there so
   * the same Delta update happens regardless of how depth is changed.
   *
   * @param {number} newDepth  New depth in metres (0 – 4000)
   */
  setDepth: (newDepth) => {
    get().setCurrentDepth(newDepth);
  },

  // ─── LEGACY COMPAT: fetchAndSetInstrument ────────────────────────────────
  // Retained for any existing components that call this directly.
  fetchAndSetInstrument: async (instrumentId) => {
    const currentFleet = get().fleet || DEMO_INSTRUMENTS;
    const inst = currentFleet.find((i) => i.id === instrumentId || i.id.includes(instrumentId));
    if (inst && inst.type !== 'argo') {
      return get().selectInstrument(instrumentId);
    }
    return get().selectFloat(instrumentId);
  },

}));

// ═══════════════════════════════════════════════════════════════════════════════
// PRIVATE MODULE-LEVEL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * _fetchModelPoint
 * ----------------
 * Calls the local FastAPI microservice at /api/model/point and returns
 * the JSON response. Includes a timeout so a stalled server doesn't freeze the UI.
 *
 * @param {number} lat    Latitude
 * @param {number} lon    Longitude
 * @param {number} depth  Depth in metres
 * @returns {Promise<Object>} The FastAPI JSON response
 * @throws {Error} On timeout, network error, or non-200 HTTP response
 */
async function _fetchModelPoint(lat, lon, depth) {
  const url = `${MODEL_API_BASE}/api/model/point?lat=${lat}&lon=${lon}&depth=${depth}`;

  const controller   = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), MODEL_API_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    throw new Error(`Model API HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * calculateDiurnalModulation
 * --------------------------
 * Deterministic sinusoidal diurnal cycle modifier based on the selected hour of day.
 * Zero Math.random(), 100% physically motivated oceanographic diurnal physics:
 *
 * Example:
 * newTemp = baseTemp + Math.sin((hour - 8) / 24 * Math.PI * 2) * 0.4
 *
 * Diurnal Parameters:
 * - Temperature: Peaks at 14:00 (+0.4°C), cools at 02:00 (-0.4°C), attenuates exponentially with depth.
 * - Dissolved Oxygen: Peaks at 16:00 (+5.2 µmol/kg) from peak photosynthesis, nocturnal respiration minimum at 04:00.
 * - Chlorophyll-a: Photochemical quenching dip at solar noon (~12:00-14:00), nocturnal bloom recovery.
 * - Current Speed: Semidiurnal tidal velocity harmonics (M2 component ~ 12.42 hr).
 * - Current Direction: Clockwise tidal ellipse rotation (~12-hr cycle).
 * - Salinity: Solar evaporative peak in surface waters at 15:00.
 *
 * @param {string|Date|number} timestamp
 * @param {number} depthM
 * @param {boolean} isModel If true, applies numerical assimilation latency (~0.75h)
 * @returns {Object} Additive diurnal offsets per variable
 */
export function calculateDiurnalModulation(timestamp, depthM = 15, isModel = false) {
  const date = timestamp ? new Date(timestamp) : new Date();
  const validDate = isNaN(date.getTime()) ? new Date() : date;

  // Decimal hour of day [0.0, 24.0)
  const hour = validDate.getHours() + validDate.getMinutes() / 60.0 + validDate.getSeconds() / 3600.0;
  // Numerical forecast models have slight assimilation latency/phase offset (~0.75 hr)
  const h = isModel ? (hour - 0.75 + 24) % 24 : hour;

  const d = Math.max(0, Number(depthM) || 0);

  // Solar radiation and atmospheric exchange attenuate exponentially with depth
  const thermoclineAtten = Math.exp(-d / 45.0); // Penetrates upper 100m
  const photicAtten = d <= 120 ? Math.exp(-d / 35.0) : 0;
  const shallowAtten = Math.exp(-d / 25.0);

  // 1. Temperature (°C): Peaks at 14:00, coolest at 02:00
  const tempAmp = isModel ? 0.36 : 0.42;
  const tempOffset = Math.sin(((h - 8.0) / 24.0) * Math.PI * 2.0) * tempAmp * thermoclineAtten;

  // 2. Salinity (PSU): Solar evaporation peak in afternoon
  const salAmp = isModel ? 0.03 : 0.04;
  const salOffset = Math.sin(((h - 9.0) / 24.0) * Math.PI * 2.0) * salAmp * shallowAtten;

  // 3. Chlorophyll-a (mg/m³): Solar quenching midday dip
  const chlAmp = isModel ? 0.06 : 0.07;
  const chlOffset = -Math.sin(((h - 7.0) / 24.0) * Math.PI * 2.0) * chlAmp * photicAtten;

  // 4. Current Speed (m/s): Semidiurnal M2 tidal harmonic (~12.42 hr)
  const speedAmp = isModel ? 0.05 : 0.06;
  const speedOffset = Math.sin((h / 12.42) * Math.PI * 2.0) * speedAmp;

  // 5. Current Direction (°): Tidal ellipse rotation
  const dirOffset = Math.cos((h / 12.0) * Math.PI * 2.0) * (isModel ? 4.0 : 5.0);

  // 6. Dissolved Oxygen (µmol/kg): Photosynthetic peak at 16:00, respiration dip at 04:00
  const oxygenAmp = isModel ? 4.6 : 5.4;
  const oxygenOffset = Math.sin(((h - 10.0) / 24.0) * Math.PI * 2.0) * oxygenAmp * photicAtten;

  return {
    temperature: tempOffset,
    salinity: salOffset,
    chlorophyll: chlOffset,
    currentSpeed: speedOffset,
    currentDirection: dirOffset,
    dissolvedOxygen: oxygenOffset,
    hour: parseFloat(hour.toFixed(2)),
  };
}

/**
 * getInstrumentComparisonData
 * ---------------------------
 * Generates the complete side-by-side observation, numerical model, and dynamic residual (Δ)
 * for any instrument ID at the given depth and simulated timestamp.
 * Used by draggable ComparisonCards for multi-device comparisons.
 */
export function getInstrumentComparisonData(instrumentId, depthM = 15, timestamp = null) {
  const fleet = DEMO_INSTRUMENTS;
  const inst = fleet.find((i) => i.id === instrumentId) || fleet[0];
  const depth = Math.max(0, Math.min(4000, Number(depthM) || 0));
  const ts = timestamp || useOceanStore.getState().selectedTimestamp || new Date().toISOString();

  const obs = calculateRealisticObservedProfile(depth, inst?.type || 'argo', inst);
  const mod = calculateRealisticModelProfile(depth);

  const diurnalObs = calculateDiurnalModulation(ts, depth, false);
  const diurnalMod = calculateDiurnalModulation(ts, depth, true);

  const finalObs = {
    temperature: +(obs.temperature + diurnalObs.temperature).toFixed(2),
    salinity: +(obs.salinity + diurnalObs.salinity).toFixed(2),
    chlorophyll: obs.chlorophyll != null ? +(Math.max(0.01, obs.chlorophyll + diurnalObs.chlorophyll)).toFixed(2) : null,
    currentSpeed: +(Math.max(0.01, obs.currentSpeed + diurnalObs.currentSpeed)).toFixed(2),
    currentDirection: +((obs.currentDirection + diurnalObs.currentDirection + 360) % 360).toFixed(1),
    dissolvedOxygen: +(Math.max(5.0, obs.dissolvedOxygen + diurnalObs.dissolvedOxygen)).toFixed(1),
  };

  const finalMod = {
    temperature: +(mod.temperature + diurnalMod.temperature).toFixed(2),
    salinity: +(mod.salinity + diurnalMod.salinity).toFixed(2),
    chlorophyll: mod.chlorophyll != null ? +(Math.max(0.01, mod.chlorophyll + diurnalMod.chlorophyll)).toFixed(2) : null,
    currentSpeed: +(Math.max(0.01, mod.currentSpeed + diurnalMod.currentSpeed)).toFixed(2),
    currentDirection: +((mod.currentDirection + diurnalMod.currentDirection + 360) % 360).toFixed(1),
    dissolvedOxygen: +(Math.max(5.0, mod.dissolvedOxygen + diurnalMod.dissolvedOxygen)).toFixed(1),
  };

  const delta = {};
  const variables = {};
  const varKeys = ['temperature', 'salinity', 'chlorophyll', 'currentSpeed', 'currentDirection', 'dissolvedOxygen'];

  for (const k of varKeys) {
    const o = finalObs[k];
    const m = finalMod[k];
    const d = (o != null && m != null && !isNaN(o) && !isNaN(m)) ? calculateDelta(k, o, m) : null;
    delta[k] = d;
    variables[k] = {
      key: k,
      obs: o,
      model: m,
      delta: d,
      status: getComparisonStatus(o, m),
    };
  }

  return {
    instrument: inst,
    depth,
    timestamp: ts,
    observed: finalObs,
    model: finalMod,
    delta,
    variables,
  };
}

/**
 * _extractObservationVariables
 * ----------------------------
 * Extracts in-situ observation values across all 6 parameters dynamically with depth.
 * Applies realistic oceanographic vertical profiles and diurnal solar perturbations.
 */
function _extractObservationVariables(profile, instrument, observationDepth, targetDepth, timestamp) {
  const depthM = observationDepth ?? targetDepth ?? 0;
  const instType = instrument?.type || (instrument?.id?.includes('glider') ? 'glider' : (instrument?.id?.includes('ctd') ? 'ctd' : 'argo'));

  // Realistic baseline calculated from oceanic vertical physics for this device
  const realistic = calculateRealisticObservedProfile(depthM, instType, instrument);

  let temp = realistic.temperature;
  let sal = realistic.salinity;

  // If live/cached Argo profile has explicit sensor values at this depth, interpolate:
  if (profile) {
    const profReading = getProfileAtDepth(profile, depthM);
    if (!isNaN(profReading.temperature)) temp = profReading.temperature;
    if (!isNaN(profReading.salinity)) sal = profReading.salinity;
  }

  // Apply diurnal sinusoidal cycle modification
  const diurnal = calculateDiurnalModulation(timestamp || new Date(), depthM, false);
  if (temp != null) temp = +(temp + diurnal.temperature).toFixed(2);
  if (sal != null) sal = +(sal + diurnal.salinity).toFixed(2);

  // Chlorophyll: strictly null if depthM > 120m (aphotic zone)
  const chl = depthM <= 120 ? +(Math.max(0.01, realistic.chlorophyll + diurnal.chlorophyll)).toFixed(2) : null;
  const curSpd = +(Math.max(0.01, realistic.currentSpeed + diurnal.currentSpeed)).toFixed(2);
  const curDir = +((realistic.currentDirection + diurnal.currentDirection + 360) % 360).toFixed(1);
  const doxy = +(Math.max(5.0, realistic.dissolvedOxygen + diurnal.dissolvedOxygen)).toFixed(1);

  return {
    temperature:      temp != null && !isNaN(temp) ? parseFloat(Number(temp).toFixed(2)) : null,
    salinity:         sal != null && !isNaN(sal) ? parseFloat(Number(sal).toFixed(2)) : null,
    chlorophyll:      chl != null && !isNaN(chl) ? parseFloat(Number(chl).toFixed(2)) : null,
    currentSpeed:     curSpd,
    currentDirection: curDir,
    dissolvedOxygen:  doxy,
  };
}

/**
 * _simulateModelPointFallback
 * ---------------------------
 * Analytical physics simulation fallback when local FastAPI NetCDF backend is offline.
 * Simulates depth-dependent profiles for all 6 oceanographic variables with diurnal cycle.
 */
function _simulateModelPointFallback(lat, lon, depthM, timestamp) {
  const base = calculateRealisticModelProfile(depthM);
  const diurnal = calculateDiurnalModulation(timestamp || new Date(), depthM, true);

  return {
    temperature: +(base.temperature + diurnal.temperature).toFixed(2),
    salinity: +(base.salinity + diurnal.salinity).toFixed(2),
    chlorophyll: base.chlorophyll != null ? +(Math.max(0.01, base.chlorophyll + diurnal.chlorophyll)).toFixed(2) : null,
    currentSpeed: +(Math.max(0.01, base.currentSpeed + diurnal.currentSpeed)).toFixed(2),
    currentDirection: +((base.currentDirection + diurnal.currentDirection + 360) % 360).toFixed(1),
    dissolvedOxygen: +(Math.max(5.0, base.dissolvedOxygen + diurnal.dissolvedOxygen)).toFixed(1),
  };
}

/**
 * _updateDepthZoneUI
 * ------------------
 * Updates the depth zone text label and indicator dot color in the vanilla DOM.
 * Called by setCurrentDepth to keep the legacy Three.js UI in sync with Zustand.
 *
 * @param {number} depth  Current depth in metres
 */
function _updateDepthZoneUI(depth) {
  const zoneText = document.getElementById('zoneText');
  const zoneDot  = document.getElementById('zoneDot');
  if (!zoneText || !zoneDot) return;

  if (depth === 0) {
    zoneText.textContent     = '0m • Surface / Top Level (Sun & Clouds)';
    zoneDot.style.background = '#ffe042';
    zoneDot.style.boxShadow  = '0 0 8px #ffe042';
  } else if (depth <= 200) {
    zoneText.textContent     = `${depth}m • Sunlight Zone (Epipelagic)`;
    zoneDot.style.background = '#00f0ff';
    zoneDot.style.boxShadow  = '0 0 8px #00f0ff';
  } else if (depth <= 1000) {
    zoneText.textContent     = `${depth}m • Twilight Zone (Mesopelagic)`;
    zoneDot.style.background = '#0077b6';
    zoneDot.style.boxShadow  = '0 0 8px #0077b6';
  } else if (depth <= 3000) {
    zoneText.textContent     = `${depth}m • Midnight Zone (Bathypelagic)`;
    zoneDot.style.background = '#03045e';
    zoneDot.style.boxShadow  = '0 0 8px #0077b6';
  } else {
    zoneText.textContent     = `${depth}m • Abyssal Plain (Abyssopelagic)`;
    zoneDot.style.background = '#0a2d54';
    zoneDot.style.boxShadow  = '0 0 10px #00b4d8';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE SELECTORS (memoized shallow selectors for React component subscriptions)
// ═══════════════════════════════════════════════════════════════════════════════

export const selectDataLayers           = (state) => state.dataLayers;
export const selectModelControls        = (state) => state.modelControls;
export const selectVisualization        = (state) => state.visualization;
export const selectActiveInstrument     = (state) => state.activeInstrument;
export const selectModelComparison      = (state) => state.modelComparison;
export const selectFleet                = (state) => state.fleet;
export const selectTargetDepth          = (state) => state.targetDepth;
export const selectActiveInstrumentDepth = (state) => state.activeInstrumentDepth;
export const selectActiveInstrumentHorizontal = (state) => state.activeInstrumentHorizontal;
export const selectActiveVariable       = (state) => state.modelControls.activeVariable;

// ─── GLOBAL BRIDGE for vanilla Three.js inspector panels ────────────────────
if (typeof window !== 'undefined') {
  window.oceanStore = useOceanStore;
}

