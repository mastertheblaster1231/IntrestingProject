import { create } from 'zustand';
import { apiUrl } from '../services/api.js';

// Module-level cache for AbortControllers to prevent unneeded re-renders & race conditions
const abortControllers = {
  depthSlice: {},
  validation: {}
};

// Module-level debounce timers for slider / frequent updates
const debounceTimers = {
  depthSlice: {},
  validation: {}
};

/**
 * useComparisonStore.js — Zustand State for Multi-Region Ocean Comparison
 * ========================================================================
 * Standalone store (separate from useOceanStore) managing:
 *   - Comparison overlay open/close
 *   - Region search and bounding box lookup
 *   - Per-region: fleet data, depth slider, timestamp, depth-slice, validation
 *
 * All data is fetched from the Node/Express backend live endpoints.
 */

// ─── REGION BOUNDING BOX DICTIONARY ──────────────────────────────────────────
// Worldwide regions where real-time Argo floats are deployed.
// Each entry maps a human-readable name to ERDDAP lat/lon query bounds.
export const REGION_DICTIONARY = {
  // Indian Ocean Basin
  'Arabian Sea':       { lat_min: 5,   lat_max: 25,  lon_min: 55,  lon_max: 78  },
  'Bay of Bengal':     { lat_min: 5,   lat_max: 22,  lon_min: 78,  lon_max: 98  },
  'Lakshadweep Sea':   { lat_min: 8,   lat_max: 14,  lon_min: 70,  lon_max: 77  },
  'Andaman Sea':       { lat_min: 5,   lat_max: 18,  lon_min: 92,  lon_max: 100 },
  'Indian Ocean':      { lat_min: -35, lat_max: 25,  lon_min: 30,  lon_max: 115 },
  'Red Sea':           { lat_min: 12,  lat_max: 30,  lon_min: 32,  lon_max: 44  },
  'Persian Gulf':      { lat_min: 24,  lat_max: 30,  lon_min: 48,  lon_max: 56  },
  'Mozambique Channel':{ lat_min: -26, lat_max: -10, lon_min: 34,  lon_max: 50  },

  // Pacific Ocean
  'South China Sea':   { lat_min: 0,   lat_max: 23,  lon_min: 100, lon_max: 121 },
  'Philippine Sea':    { lat_min: 5,   lat_max: 30,  lon_min: 120, lon_max: 140 },
  'Coral Sea':         { lat_min: -25, lat_max: -10, lon_min: 145, lon_max: 165 },
  'Tasman Sea':        { lat_min: -45, lat_max: -28, lon_min: 148, lon_max: 175 },
  'North Pacific':     { lat_min: 25,  lat_max: 55,  lon_min: 140, lon_max: 220 },
  'South Pacific':     { lat_min: -50, lat_max: -10, lon_min: 180, lon_max: 290 },
  'Kuroshio Current':  { lat_min: 20,  lat_max: 40,  lon_min: 120, lon_max: 150 },

  // Atlantic Ocean
  'North Atlantic':    { lat_min: 25,  lat_max: 65,  lon_min: -80, lon_max: 0   },
  'South Atlantic':    { lat_min: -50, lat_max: 0,   lon_min: -60, lon_max: 20  },
  'Gulf of Mexico':    { lat_min: 18,  lat_max: 31,  lon_min: -98, lon_max: -80 },
  'Caribbean Sea':     { lat_min: 9,   lat_max: 22,  lon_min: -90, lon_max: -60 },
  'Mediterranean Sea': { lat_min: 30,  lat_max: 46,  lon_min: -6,  lon_max: 36  },
  'Norwegian Sea':     { lat_min: 62,  lat_max: 75,  lon_min: -10, lon_max: 20  },
  'Gulf Stream':       { lat_min: 25,  lat_max: 45,  lon_min: -80, lon_max: -40 },

  // Southern Ocean & Polar
  'Southern Ocean':    { lat_min: -70, lat_max: -45, lon_min: -180,lon_max: 180 },
  'Weddell Sea':       { lat_min: -75, lat_max: -60, lon_min: -60, lon_max: -20 },
  'Drake Passage':     { lat_min: -65, lat_max: -55, lon_min: -70, lon_max: -55 },

  // Other
  'East China Sea':    { lat_min: 25,  lat_max: 35,  lon_min: 120, lon_max: 130 },
  'Sea of Japan':      { lat_min: 33,  lat_max: 52,  lon_min: 127, lon_max: 142 },
  'Black Sea':         { lat_min: 40,  lat_max: 47,  lon_min: 27,  lon_max: 42  },
};

/** All region names sorted alphabetically for autocomplete */
export const REGION_NAMES = Object.keys(REGION_DICTIONARY).sort();

/** Generate a unique ID for a panel */
function generatePanelId(name) {
  return `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
}

// ─── STORE ───────────────────────────────────────────────────────────────────
export const useComparisonStore = create((set, get) => ({
  // ── UI toggles ─────────────────────────────────────────────────────────────
  isComparisonOpen: false,
  isSearchOpen: false,

  openComparison:  () => set({ isComparisonOpen: true }),
  closeComparison: () => set({ isComparisonOpen: false, isSearchOpen: false }),
  toggleSearch:    () => set((s) => ({ isSearchOpen: !s.isSearchOpen })),

  // ── Region list & tabs ─────────────────────────────────────────────────────
  regions: [],       // [{ id, name, bbox }]
  activeRegionId: null,

  setActiveRegion: (id) => set({ activeRegionId: id }),

  /**
   * Add a named region to the comparison.
   * Looks up bbox from REGION_DICTIONARY. If not found, skips silently.
   * Auto-opens the comparison overlay and fetches fleet for the new region.
   */
  addRegion: (name) => {
    const bbox = REGION_DICTIONARY[name];
    if (!bbox) return;

    const id = generatePanelId(name);
    const state = get();

    const newRegion = { id, name, bbox };

    set((s) => ({
      regions: [...s.regions, newRegion],
      activeRegionId: id,
      isComparisonOpen: true,
      isSearchOpen: false,
      regionData: {
        ...s.regionData,
        [id]: {
          depth: 15,
          timestamp: null,
          fleet: [],
          selectedFloat: null,
          depthSlice: null,
          validation: null,
          isLoadingFleet: true,
          isLoadingSlice: false,
          isLoadingValidation: false,
          error: null,
        },
      },
    }));

    // Auto-fetch fleet for the new region
    get().fetchFleet(id);
  },

  removeRegion: (id) => {
    set((s) => {
      const regions = s.regions.filter((r) => r.id !== id);
      const regionData = { ...s.regionData };
      delete regionData[id];
      const activeRegionId =
        s.activeRegionId === id
          ? regions.length > 0
            ? regions[0].id
            : null
          : s.activeRegionId;
      return {
        regions,
        regionData,
        activeRegionId,
        isComparisonOpen: regions.length > 0,
      };
    });
  },

  // ── Per-region data ────────────────────────────────────────────────────────
  regionData: {},

  /**
   * Set the depth slider value for a region panel.
   * Debounced API calls are handled at the component level.
   */
  setRegionDepth: (id, depth) => {
    const clamped = Math.max(0, Math.min(4000, Math.round(depth)));
    set((s) => ({
      regionData: {
        ...s.regionData,
        [id]: { ...s.regionData[id], depth: clamped },
      },
    }));
  },

  /**
   * Set the historical timestamp for a region panel (null = live)
   */
  setRegionTimestamp: (id, timestamp) => {
    set((s) => ({
      regionData: {
        ...s.regionData,
        [id]: { ...s.regionData[id], timestamp },
      },
    }));
  },

  /** Select an Argo float from the fleet for a region panel */
  selectFloat: (id, platform) => {
    set((s) => ({
      regionData: {
        ...s.regionData,
        [id]: { ...s.regionData[id], selectedFloat: platform },
      },
    }));
    // Auto-fetch depth data for the newly selected float
    if (platform) {
      get().fetchDepthSlice(id);
      get().fetchValidation(id);
    }
  },

  // ── API Actions ────────────────────────────────────────────────────────────

  /**
   * Fetch fleet of active Argo floats in a region's bounding box.
   * Uses: GET /api/fleet?lat_min=&lat_max=&lon_min=&lon_max=
   */
  fetchFleet: async (id) => {
    const state = get();
    const region = state.regions.find((r) => r.id === id);
    if (!region) return;

    const { lat_min, lat_max, lon_min, lon_max } = region.bbox;

    set((s) => ({
      regionData: {
        ...s.regionData,
        [id]: { ...s.regionData[id], isLoadingFleet: true, error: null },
      },
    }));

    try {
      const url = apiUrl(`/api/fleet?lat_min=${lat_min}&lat_max=${lat_max}&lon_min=${lon_min}&lon_max=${lon_max}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Fleet API HTTP ${res.status}`);
      const fleet = await res.json();

      set((s) => ({
        regionData: {
          ...s.regionData,
          [id]: {
            ...s.regionData[id],
            fleet,
            isLoadingFleet: false,
            // Auto-select first float
            selectedFloat: fleet.length > 0 ? fleet[0] : null,
          },
        },
      }));

      // Auto-fetch depth data for the first float
      if (fleet.length > 0) {
        get().fetchDepthSlice(id);
        get().fetchValidation(id);
      }
    } catch (err) {
      console.warn(`[ComparisonStore] Fleet fetch failed for ${id}:`, err.message);
      set((s) => ({
        regionData: {
          ...s.regionData,
          [id]: {
            ...s.regionData[id],
            isLoadingFleet: false,
            error: err.message,
          },
        },
      }));
    }
  },

  /**
   * Fetch depth-slice telemetry for the selected float in a region.
   * Uses: GET /api/argo/depth-slice
   */
  fetchDepthSlice: async (id) => {
    const data = get().regionData[id];
    if (!data || !data.selectedFloat) return;

    const platformNumber = data.selectedFloat.platform_number || data.selectedFloat.id;
    const depth = data.depth || 15;
    const timestamp = data.timestamp;

    // Abort previous in-flight request for this region
    if (abortControllers.depthSlice[id]) {
      abortControllers.depthSlice[id].abort();
    }
    const ac = new AbortController();
    abortControllers.depthSlice[id] = ac;

    set((s) => ({
      regionData: {
        ...s.regionData,
        [id]: { ...s.regionData[id], isLoadingSlice: true },
      },
    }));

    try {
      const params = new URLSearchParams({
        platform_number: platformNumber,
        depth: String(depth),
      });
      if (timestamp) params.set('time', timestamp);
      
      const url = apiUrl(`/api/argo/depth-slice?${params}`);
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok) throw new Error(`Depth-slice API HTTP ${res.status}`);
      const depthSlice = await res.json();

      set((s) => ({
        regionData: {
          ...s.regionData,
          [id]: { ...s.regionData[id], depthSlice, isLoadingSlice: false },
        },
      }));
    } catch (err) {
      if (err.name === 'AbortError') return; // Ignore aborted fetch
      console.warn(`[ComparisonStore] Depth-slice fetch failed for ${id}:`, err.message);
      set((s) => ({
        regionData: {
          ...s.regionData,
          [id]: { ...s.regionData[id], isLoadingSlice: false },
        },
      }));
    }
  },

  /**
   * Fetch model-vs-observation validation for the selected float.
   * Uses: GET /api/validation
   */
  fetchValidation: async (id) => {
    const data = get().regionData[id];
    if (!data || !data.selectedFloat) return;

    const platformNumber = data.selectedFloat.platform_number || data.selectedFloat.id;
    const depth = data.depth || 15;
    const timestamp = data.timestamp;

    // Abort previous in-flight request for this region
    if (abortControllers.validation[id]) {
      abortControllers.validation[id].abort();
    }
    const ac = new AbortController();
    abortControllers.validation[id] = ac;

    set((s) => ({
      regionData: {
        ...s.regionData,
        [id]: { ...s.regionData[id], isLoadingValidation: true },
      },
    }));

    try {
      const params = new URLSearchParams({
        platform_number: platformNumber,
        depth: String(depth),
      });
      if (timestamp) params.set('time', timestamp);
      
      const url = apiUrl(`/api/validation?${params}`);
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok) throw new Error(`Validation API HTTP ${res.status}`);
      const validation = await res.json();

      set((s) => ({
        regionData: {
          ...s.regionData,
          [id]: { ...s.regionData[id], validation, isLoadingValidation: false },
        },
      }));
    } catch (err) {
      if (err.name === 'AbortError') return; // Ignore aborted fetch
      console.warn(`[ComparisonStore] Validation fetch failed for ${id}:`, err.message);
      set((s) => ({
        regionData: {
          ...s.regionData,
          [id]: { ...s.regionData[id], isLoadingValidation: false },
        },
      }));
    }
  },
}));

// ─── GLOBAL BRIDGE for debugging ──────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.comparisonStore = useComparisonStore;
}
