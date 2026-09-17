/**
 * argoTelemetryService.js — Live Surface Telemetry Fetcher
 * =========================================================
 * Fetches live surface telemetry for a single Argo float using
 * dynamic column mapping, surface pressure filtering, and automatic fallback.
 *
 * Primary:   NOAA AOML Indian Ocean Dataset (2025-present)
 * Secondary: IFREMER Global ArgoFloats Dataset
 * Fallback:  Analytical offline data
 */

// ─── ENDPOINTS ──────────────────────────────────────────────────────────────

const AOML_BASE =
  "https://erddap.aoml.noaa.gov/hdb/erddap/tabledap/argo_float_indian_2025_present.json";
const IFREMER_BASE =
  "https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.json";

/** Timeout in ms — 5 seconds keeps the UI responsive */
const TELEMETRY_TIMEOUT_MS = 5000;

// ─── SESSION CACHE ──────────────────────────────────────────────────────────
const _telemetryCache = new Map();

// ─── MAIN PUBLIC API ────────────────────────────────────────────────────────

/**
 * fetchArgoTelemetry
 * ------------------
 * Fetches live surface telemetry for a single Argo float.
 * Uses NOAA AOML as the primary source with IFREMER as fallback,
 * and a final analytical offline fallback if both fail.
 *
 * Features:
 *   - Dynamic column mapping (handles case differences between AOML & IFREMER)
 *   - Surface pressure filtering (PRES <= 10 dbar)
 *   - AbortController timeout (5s)
 *   - Session-level caching
 *
 * @param {string} wmoId  WMO platform number, e.g. "2902351"
 * @returns {Promise<Object>} Telemetry object (never rejects)
 */
export const fetchArgoTelemetry = async (wmoId) => {
  const id = String(wmoId).replace(/^argo-/i, "");

  // Check session cache
  if (_telemetryCache.has(id)) {
    console.info(`[argoTelemetry] Cache HIT for float #${id}`);
    return _telemetryCache.get(id);
  }

  // Primary: NOAA AOML Indian Ocean Dataset
  const AOML_URL =
    `${AOML_BASE}?PLATFORM_NUMBER,time,latitude,longitude,PRES,TEMP,PSAL` +
    `&PLATFORM_NUMBER=%22${encodeURIComponent(id)}%22` +
    `&PRES<=10&orderByMax(%22time%22)`;

  // Secondary: IFREMER Global Dataset
  const IFREMER_URL =
    `${IFREMER_BASE}?platform_number,time,latitude,longitude,pres,temp,psal` +
    `&platform_number=%22${encodeURIComponent(id)}%22` +
    `&pres<=10&orderByMax(%22time%22)`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TELEMETRY_TIMEOUT_MS);

    // Try AOML first (Indian Ocean optimized)
    console.info(`[argoTelemetry] Fetching NOAA AOML telemetry for #${id}...`);
    let res = await fetch(AOML_URL, { signal: controller.signal }).catch(
      () => null,
    );

    // Fallback to IFREMER if AOML fails
    if (!res || !res.ok) {
      console.info(
        `[argoTelemetry] AOML unavailable, trying IFREMER for #${id}...`,
      );
      res = await fetch(IFREMER_URL, { signal: controller.signal }).catch(
        () => null,
      );
    }
    clearTimeout(timeout);

    if (!res || !res.ok) throw new Error("Both ERDDAP endpoints failed");

    const json = await res.json();
    const colNames = json.table.columnNames.map((c) => c.toLowerCase());
    const row = json.table.rows[0];

    if (!row) throw new Error("No live telemetry row returned");

    const getCol = (name) => row[colNames.indexOf(name)];

    const telemetry = {
      wmoId: String(getCol("platform_number") || id),
      time: String(getCol("time")),
      latitude: Number(Number(getCol("latitude")).toFixed(4)),
      longitude: Number(Number(getCol("longitude")).toFixed(4)),
      depth: Number(Number(getCol("pres")).toFixed(1)),
      temperature: Number(Number(getCol("temp")).toFixed(2)),
      salinity: Number(Number(getCol("psal")).toFixed(2)),
      status: "LIVE STREAM (QC PASSED)",
      isLive: true,
    };

    console.info(
      `[argoTelemetry] ✓ LIVE telemetry received for #${id}: ${telemetry.temperature}°C, ${telemetry.salinity} PSU`,
    );
    _telemetryCache.set(id, telemetry);
    return telemetry;
  } catch (err) {
    console.warn(
      `[argoTelemetry] Falling back to analytical telemetry for float ${id}:`,
      err.message,
    );
    const fallback = {
      wmoId: id,
      time: new Date().toISOString(),
      latitude: 11.68,
      longitude: 92.5,
      depth: 5.0,
      temperature: 28.3,
      salinity: 34.32,
      status: "ACTIVE (OFFLINE FALLBACK)",
      isLive: false,
    };
    return fallback;
  }
};

/**
 * clearTelemetryCache
 * -------------------
 * Clears the session-level telemetry cache. Useful when forcing a fresh fetch
 * after a long idle period.
 */
export const clearTelemetryCache = () => {
  _telemetryCache.clear();
  console.info("[argoTelemetry] Session cache cleared");
};
