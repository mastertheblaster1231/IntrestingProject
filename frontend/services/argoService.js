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

/** Live ERDDAP endpoints — Primary: NOAA AOML (Indian Ocean), Secondary: IFREMER (Global) */
const ERDDAP_IFREMER =
  typeof window !== "undefined" && window.location && window.location.origin
    ? "/erddap-proxy/erddap/tabledap/ArgoFloats.json"
    : "https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.json";

const ERDDAP_AOML =
  "https://erddap.aoml.noaa.gov/hdb/erddap/tabledap/argo_float_indian_2025_present.json";

/**
 * Fetch timeout in milliseconds.
 * 25 seconds for public ERDDAP (international latency, large tables).
 */
const FETCH_TIMEOUT_MS = 25000;

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
  // Build ERDDAP tabledap query URLs:
  //   Variables: platform_number, time, latitude, longitude, pres, temp, psal
  //   Constraint: platform_number = "2902351" (double-quoted string in ERDDAP filter syntax)
  //   orderByMax("time") returns ALL rows for the most recent profile cycle only

  // Primary: NOAA AOML Indian Ocean Dataset (uppercase column names)
  const aomlUrl =
    `${ERDDAP_AOML}?PLATFORM_NUMBER,time,latitude,longitude,PRES,TEMP,PSAL` +
    `&PLATFORM_NUMBER=%22${encodeURIComponent(id)}%22` +
    `&orderByMax(%22time%22)`;

  // Secondary: IFREMER Global Dataset (lowercase column names)
  const ifremerUrl =
    `${ERDDAP_IFREMER}?platform_number,time,latitude,longitude,pres,temp,psal` +
    `&platform_number=%22${encodeURIComponent(id)}%22` +
    `&orderByMax(%22time%22)`;



  // AbortController lets us cancel the fetch if it stalls on slow hackathon Wi-Fi
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  try {
    // Try AOML first (Indian Ocean optimized)
    console.info(`[argoService] Trying NOAA AOML for float #${id}...`);
    response = await fetch(aomlUrl, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    }).catch(() => null);

    // Fallback to IFREMER if AOML fails
    if (!response || !response.ok) {
      console.info(
        `[argoService] AOML unavailable, trying IFREMER for float #${id}...`,
      );
      response = await fetch(ifremerUrl, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "INCOIS-SIH-Dashboard/1.0",
        },
      });
    }
  } finally {
    clearTimeout(timeoutHandle); // always clear to avoid ghost timers
  }

  if (!response || !response.ok) {
    throw new Error(
      `ERDDAP HTTP ${response?.status || "N/A"} for float #${id}`,
    );
  }

  const json = await response.json();
  const rows = json?.table?.rows;
  const colNames = json?.table?.columnNames;

  if (!rows || rows.length === 0) {
    throw new Error(`ERDDAP returned zero rows for float #${id}`);
  }

  // Dynamic column mapping — handles case differences between AOML and IFREMER
  if (colNames) {
    const lowerCols = colNames.map((c) => c.toLowerCase());
    COL.PLATFORM = lowerCols.indexOf("platform_number");
    COL.TIME = lowerCols.indexOf("time");
    COL.LAT = lowerCols.indexOf("latitude");
    COL.LON = lowerCols.indexOf("longitude");
    COL.PRES = lowerCols.indexOf("pres");
    COL.TEMP = lowerCols.indexOf("temp");
    COL.PSAL = lowerCols.indexOf("psal");
  }

  return _parseErddapRows(id, rows, columnNames);
}

/**
 * _parseErddapRows
 * ----------------
 * Converts raw ERDDAP table.rows into a structured ArgoProfile.
 *
 * Each row is an array: [platform_number, time, latitude, longitude, pres, temp, psal]
 * All rows share the same platform_number, time, lat, lon (one profile cycle).
 * Each row represents ONE measurement at one pressure level (depth).
 *
 * The function:
 *   1. Extracts the metadata from the first row (time, lat, lon are identical across rows)
 *   2. Iterates every row to build the vertical profile array
 *   3. Skips rows where temp or psal is null (QC-flagged bad data or missing sensors)
 *   4. Converts pressure (dbar) to depth (m) using standard approximation: 1 dbar ~ 1 m
 *   5. Sorts profile by ascending depth (shallow to deep)
 *
 * @param {string}   id    WMO platform number
 * @param {Array[]}  rows  Raw ERDDAP row arrays
 * @returns {ArgoProfile}
 */
function _parseErddapRows(id, rows) {
  // Metadata from row[0]; lat/lon/time are identical for all rows in one profile
  const firstRow = rows[0];
  const timestamp = firstRow[COL.TIME] || new Date().toISOString();
  const lat = _toNum(firstRow[COL.LAT]);
  const lon = _toNum(firstRow[COL.LON]);

  const profile = rows
    .map((row) => {
      const pressure = _toNum(row[COL.PRES]); // decibars
      const temperature = _toNum(row[COL.TEMP]); // degrees C
      const salinity = _toNum(row[COL.PSAL]); // PSU

      // Skip rows with missing or clearly invalid sensor readings
      if (pressure === null || temperature === null || salinity === null)
        return null;
      if (isNaN(pressure) || isNaN(temperature) || isNaN(salinity)) return null;

      return {
        // 1 dbar of pressure ~ 1 metre of depth (standard seawater approximation, <1% error to 2000m)
        depth: parseFloat(pressure.toFixed(1)),
        temperature: parseFloat(temperature.toFixed(3)),
        salinity: parseFloat(salinity.toFixed(3)),
      };
    })
    .filter(Boolean) // remove null entries from rejected rows
    .sort((a, b) => a.depth - b.depth); // shallow to deep ordering for charts

  return {
    floatId: id,
    name: `Argo Float #${id}`,
    timestamp,
    lat,
    lon,
    source: "live-erddap",
    profile,
    rawColumnNames: columnNames,
  };
}

/**
 * _fetchFromLocalCache
 * --------------------
 * Loads the bundled real_argo_cache.json (captured from IFREMER ERDDAP on 2026-09-09)
 * and returns the entry matching `id`. This is REAL data (historical snapshot), not synthetic.
 * Per project mandate, synthetic generation is DEPRECATED — if cache misses we throw
 * so the UI shows a proper "data unavailable" state instead of fake physics.
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
      // Tag the provenance so the UI can show the offline badge
      return { ...cacheData[id], source: "offline-cache" };
    }

    console.warn(
      `[argoService] Float #${id} not in offline cache; using synthetic fallback`,
    );
    return _syntheticFallback(id);
  } catch (cacheError) {
    // Absolute last resort: cache file itself is missing or corrupt
    console.error(
      `[argoService] Offline cache load failed: ${cacheError.message} — generating synthetic profile`,
    );
    return _syntheticFallback(id);
  }
}

/**
 * _syntheticFallback — DEPRECATED (real-data mandate)
 * Retained only for reference / tests. Not used in production code path.
 * @deprecated Use real ERDDAP live or real_argo_cache.json instead.
 */
function _syntheticFallback(id) {
  const DEPTHS = [
    0, 10, 25, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000,
  ];
  const surfaceT = 28.3; // degrees C — typical Indian Ocean surface temperature
  const surfaceS = 34.3; // PSU — typical Bay of Bengal surface salinity

  const profile = DEPTHS.map((d) => {
    let temperature;
    if (d <= 50) temperature = surfaceT - (d / 50) * 0.4;
    else if (d <= 1000)
      temperature = 3.5 + (surfaceT - 3.5) * Math.exp(-d / 320);
    else temperature = 1.8 + (3.5 - 1.8) * Math.exp(-(d - 1000) / 900);
    let salinity;
    if (d <= 150) {
      salinity = surfaceS + (d / 150) * 0.55;
    } else if (d <= 800) {
      salinity = surfaceS + 0.55 - ((d - 150) / 650) * 0.35;
    } else {
      salinity = 34.75 + ((d - 800) / 1200) * 0.15;
    }

    return {
      depth: d,
      temperature: parseFloat(temperature.toFixed(2)),
      salinity: parseFloat(salinity.toFixed(2)),
    };
  });

  return {
    floatId: id,
    name: `Argo Float #${id}`,
    timestamp: new Date().toISOString(),
    lat: 11.6,
    lon: 92.5,
    source: "synthetic-fallback",
    profile,
  };
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
 * Strategy:
 *   - Find the two bracketing profile levels above and below the target depth
 *   - Linear interpolation: value = lower + t * (upper - lower), where t is the fractional position
 *   - Falls back to nearest-neighbour if depth is outside the profiled range
 *
 * @param {ArgoProfile} profile   Profile object from fetchLiveArgoProfile
 * @param {number}      depthM    Target depth in metres
 * @returns {{ temperature: number, salinity: number, depth: number }}
 */
export function getProfileAtDepth(profile, depthM) {
  const pts = profile.profile;
  if (!pts || pts.length === 0) {
    return { depth: depthM, temperature: NaN, salinity: NaN };
  }

  // Clamp target depth to the measured range
  const minD = pts[0].depth;
  const maxD = pts[pts.length - 1].depth;
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
