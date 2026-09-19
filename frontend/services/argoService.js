/**
 * argoService.js — Live In-Situ Argo Float Data Service
 * ========================================================
 * Phase 1 of the INCOIS Ocean Visualization Data Pipeline.
 *
 * PRIMARY SOURCE:  IFREMER GDAC ERDDAP REST API (live JSON endpoint)
 * FALLBACK SOURCE: local real_argo_cache.json (hackathon offline fail-safe)
 *
 * ERDDAP query strategy:
 *   - Table dataset: ArgoFloats
 *   - Variables: platform_number, time, latitude, longitude, pres, temp, psal
 *   - Filter:    platform_number = "<floatId>" (exact WMO code)
 *   - Ordering:  orderByMax("time") — returns only the most recent cycle rows
 *
 * Offline fail-safe guarantees the demo never breaks on throttled hackathon Wi-Fi.
 */

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

import { apiUrl } from './api.js';

/**
 * Fetch timeout in milliseconds.
 * 25 seconds for public ERDDAP (international latency, large tables).
 */
const FETCH_TIMEOUT_MS = 60000; // public ERDDAP (was 40000)

/**
 * Path to the bundled offline JSON cache.
 * Structure expected inside real_argo_cache.json:
 * {
 *   "2902351": { <ArgoProfile object — same shape as fetchLiveArgoProfile return> },
 *   "2902352": { ... },
 *   ...
 * }
 */
const CACHE_URL = "/src/assets/real_argo_cache.json";

// ─── ERDDAP ROW INDEX MAP (deprecated — dynamic columnNames lookup is now used) ─
const COL = {
  PLATFORM: 0,
  TIME: 1,
  LAT: 2,
  LON: 3,
  PRES: 4, // pressure in decibars ~ depth in metres (1 dbar ~ 1 m)
  TEMP: 5, // in-situ temperature (degrees C, ITS-90 scale)
  PSAL: 6, // practical salinity (PSU)
};

// ─── MODULE-LEVEL SESSION CACHE ──────────────────────────────────────────────
// Prevents redundant network calls for the same float within one browser session
const _sessionCache = new Map(); // key: platformNumber string -> ArgoProfile object

// ─── MAIN PUBLIC API ─────────────────────────────────────────────────────────

/**
 * fetchLiveArgoProfile
 * --------------------
 * Fetches the LATEST full vertical profile for an Argo float from ERDDAP.
 * Automatically falls back to the local JSON cache on any network error,
 * timeout, or CORS rejection — crucial for a stable live hackathon demo.
 *
 * @param {string|number} platformNumber  WMO platform number, e.g. "2902351"
 * @returns {Promise<ArgoProfile>}        Clean profile object (never throws)
 *
 * @typedef {Object} ArgoProfile
 * @property {string}   floatId          WMO platform number (string)
 * @property {string}   name             Human-readable label e.g. "Argo Float #2902351"
 * @property {string}   timestamp        ISO-8601 UTC timestamp of the latest profile
 * @property {number}   lat              Latitude (decimal degrees, positive = North)
 * @property {number}   lon              Longitude (decimal degrees, positive = East)
 * @property {string}   source           Data provenance tag ("live-erddap" | "offline-cache" | "synthetic-fallback")
 * @property {DepthPoint[]} profile      Vertical profile sorted shallow to deep
 *
 * @typedef {Object} DepthPoint
 * @property {number} depth         Depth in metres (derived from pressure: 1 dbar ~ 1 m)
 * @property {number} temperature   In-situ temperature in degrees C
 * @property {number} salinity      Practical salinity in PSU
 */
export async function fetchLiveArgoProfile(platformNumber) {
  const id = String(platformNumber).replace(/^argo-/i, ""); // strip "argo-" prefix if present

  // 1. Check in-memory session cache first (avoids redundant network calls)
  if (_sessionCache.has(id)) {
    console.info(`[argoService] Cache HIT for float #${id}`);
    return _sessionCache.get(id);
  }

  console.info(
    `[argoService] Fetching live ERDDAP profile for Argo float #${id}...`,
  );

  try {
    // 2. Attempt live ERDDAP fetch with an AbortController timeout
    const profile = await _fetchFromERDDAP(id);
    _sessionCache.set(id, profile); // warm the session cache on success
    return profile;
  } catch (networkError) {
    // 3. OFFLINE FAIL-SAFE — triggered on any of:
    //    - AbortError (timeout exceeded FETCH_TIMEOUT_MS)
    //    - TypeError: Failed to fetch (CORS / no internet)
    //    - Non-200 HTTP response
    //    - JSON parse failures
    console.warn(
      `[argoService] Live ERDDAP unreachable for #${id} — activating offline fail-safe. Reason: ${networkError.message}`,
    );
    return await _fetchFromLocalCache(id);
  }
}

// ─── PRIVATE HELPERS ─────────────────────────────────────────────────────────

/**
 * _fetchFromERDDAP
 * ----------------
 * Makes the actual ERDDAP network request and parses the table.rows response
 * into a clean ArgoProfile object.
 *
 * ERDDAP returns data in this JSON structure:
 * {
 *   "table": {
 *     "columnNames": ["platform_number", "time", "latitude", "longitude", "pres", "temp", "psal"],
 *     "rows": [
 *       ["2902351", "2026-09-09T17:42:00Z", 11.6, 92.5,  5.0, 28.3, 34.3],
 *       ["2902351", "2026-09-09T17:42:00Z", 11.6, 92.5, 50.0, 26.1, 34.6],
 *       ...  (multiple rows per profile, one per pressure level)
 *     ]
 *   }
 * }
 *
 * @param {string} id  WMO platform number
 * @returns {Promise<ArgoProfile>}
 * @throws {Error} on any network or parse failure
 */
async function _fetchFromERDDAP(id) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const url = apiUrl(`/api/profile/${encodeURIComponent(id)}`);
    console.info(`[argoService] Fetching backend profile for float #${id} from ${url}`);
    
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Backend API HTTP ${response.status} for float #${id}`);
    }

    const json = await response.json();
    
    if (json.available === false) {
      throw new Error(json.reason || 'Data unavailable');
    }

    const physicsLevels = json.physics?.levels || [];
    if (physicsLevels.length === 0) {
      throw new Error(`No physics levels returned for float #${id}`);
    }

    const profile = physicsLevels.map(level => {
      // The backend uses 'temp' and 'psal' or 'temperature'/'salinity' depending on how it was built.
      // Usually fetchCoreProfile produces { depth, temp, psal }
      return {
        depth: level.depth,
        temperature: level.temp !== undefined ? level.temp : level.temperature,
        salinity: level.psal !== undefined ? level.psal : level.salinity,
      };
    }).sort((a, b) => a.depth - b.depth);

    return {
      floatId: json.platform_number,
      name: `Argo Float #${json.platform_number}`,
      timestamp: json.time,
      lat: json.lat ?? json.latitude,
      lon: json.lon ?? json.longitude,
      source: "live-erddap",
      sourceLabel: "LIVE",
      sourceDetails: "Source: IFREMER Argo GDAC",
      profile,
      cycleNumber: json.cycle_number ?? null,
      bgc: json.bgc ?? null,
      rawPhysics: json.physics ?? null,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * _fetchFromLocalCache
 * --------------------
 * Loads the bundled real_argo_cache.json (captured from IFREMER ERDDAP on 2026-09-09)
 * and returns the entry matching `id`. This is REAL historical data, labeled as such.
 * Synthetic generation is completely eliminated per project integrity mandate.
 *
 * @param {string} id  WMO platform number
 * @returns {Promise<ArgoProfile>}
 */
async function _fetchFromLocalCache(id) {
  try {
    const cacheResponse = await fetch(CACHE_URL);
    if (!cacheResponse.ok)
      throw new Error(`Cache fetch HTTP ${cacheResponse.status}`);

    const cacheData = await cacheResponse.json();

    if (cacheData[id]) {
      console.info(`[argoService] Offline cache HIT for float #${id}`);
      return {
        ...cacheData[id],
        source: "offline-cache",
        sourceLabel: "HISTORICAL SNAPSHOT",
        sourceDetails: "Source: IFREMER Argo GDAC (Captured: 09 Sep 2026)",
        cycleNumber: cacheData[id].cycleNumber ?? cacheData[id].cycle_number ?? null,
      };
    }

    throw new Error(`Float #${id} is not present in the offline historical cache`);
  } catch (cacheError) {
    console.warn(
      `[argoService] Float #${id} unavailable: ${cacheError.message}`
    );
    throw cacheError;
  }
}

// ─── UTILITY ─────────────────────────────────────────────────────────────────

/**
 * _toNum — safely coerces ERDDAP cell values (which may be strings, numbers, or null)
 * to a JavaScript number, returning null for invalid / missing values.
 * @param {*} v
 * @returns {number|null}
 */
function _toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

// ─── PUBLIC UTILITY EXPORT ───────────────────────────────────────────────────

/**
 * getProfileAtDepth
 * -----------------
 * Convenience helper: linearly interpolates temperature and salinity
 * at an arbitrary depth from an ArgoProfile object.
 *
 * Used by the Zustand store's setDepth action to get the Observation value
 * at the current depth slider position for the Delta calculation.
 *
 * If depth is outside the measured profile range by more than 25m, returns NaN
 * so the system marks the variable as unavailable rather than fabricating data.
 *
 * @param {ArgoProfile} profile   Profile object from fetchLiveArgoProfile
 * @param {number}      depthM    Target depth in metres
 * @returns {{ temperature: number, salinity: number, depth: number }}
 */
export function getProfileAtDepth(profile, depthM) {
  const pts = profile?.profile;
  if (!pts || pts.length === 0) {
    return { depth: depthM, temperature: NaN, salinity: NaN };
  }

  const minD = pts[0].depth;
  const maxD = pts[pts.length - 1].depth;

  // Beyond measured range -> return NaN to indicate unavailable
  if (depthM < minD - 25 || depthM > maxD + 25) {
    return { depth: depthM, temperature: NaN, salinity: NaN };
  }

  const d = Math.max(minD, Math.min(maxD, depthM));

  // Locate the two bracketing profile points
  let lower = pts[0];
  let upper = pts[pts.length - 1];

  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i].depth <= d && pts[i + 1].depth >= d) {
      lower = pts[i];
      upper = pts[i + 1];
      break;
    }
  }

  // Exact match — no interpolation needed
  if (lower.depth === upper.depth) {
    return {
      depth: d,
      temperature: lower.temperature,
      salinity: lower.salinity,
    };
  }

  // t is the fractional position between the two bracketing levels (0 = at lower, 1 = at upper)
  const t = (d - lower.depth) / (upper.depth - lower.depth);

  return {
    depth: d,
    temperature: parseFloat(
      (lower.temperature + t * (upper.temperature - lower.temperature)).toFixed(
        3,
      ),
    ),
    salinity: parseFloat(
      (lower.salinity + t * (upper.salinity - lower.salinity)).toFixed(3),
    ),
  };
}
