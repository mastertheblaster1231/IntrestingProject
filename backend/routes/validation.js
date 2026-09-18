import { Router } from 'express';
import dotenv from 'dotenv';

import { fetchCoreProfile, fetchFleet, interpolateAt } from '../services/argoCore.js';
import { BGC_UNITS, BGC_VARIABLES, discoverBgcFloats, fetchBgcProfile } from '../services/argoBgc.js';
import { discoverModelDatasets, fetchModelPoint, isModelConfigured } from '../services/modelGrid.js';
import { round } from '../services/sanitize.js';

dotenv.config();

const router = Router();

/**
 * Every endpoint here returns real measurements or an explicit absence.
 *
 * What was removed and why:
 *   analyticalTemp/Sal/Oxy/Chl/Current  - generated observations
 *   deriveBGC()                         - generated PAR, backscatter, CDOM,
 *                                         oxygen saturation, and a
 *                                         hydraulics_telemetry block reporting
 *                                         bladder position and internal vacuum.
 *                                         Argo does not transmit any of that
 *                                         over ERDDAP.
 *   the hardcoded 3-float fleet fallback
 *   the /validation and /model/point analytical models
 *
 * Those made a broken pipeline indistinguishable from a working one, and
 * presenting computed numbers as float observations to an INCOIS panel is a
 * credibility problem, not just a technical one.
 *
 * Response contract: a value is either a real number or null. `source` says
 * where it came from. `available` says whether the sensor exists at all.
 */

const asError = (res, status, message, extra = {}) =>
  res.status(status).json({ error: message, available: false, ...extra });

// ---- 1. FLEET --------------------------------------------------------------
router.get('/fleet', async (req, res) => {
  const opts = {
    latMin: parseFloat(req.query.lat_min) || 0,
    latMax: parseFloat(req.query.lat_max) || 25,
    lonMin: parseFloat(req.query.lon_min) || 55,
    lonMax: parseFloat(req.query.lon_max) || 98,
    days: parseInt(req.query.days, 10) || 45,
  };

  try {
    const { floats, fetchedAt } = await fetchFleet(opts);

    // Array response preserved — the frontend maps over it directly.
    res.json(
      floats.map((f) => ({
        ...f,
        maxDepth: 2000, // nominal Argo park depth, not a measurement
        status: 'Active',
        mode: 'LIVE',
        fetchedAt,
      }))
    );
  } catch (err) {
    console.error('[fleet]', err.message);
    asError(res, 502, `Could not reach Ifremer ERDDAP: ${err.message}`, {
      hint: 'Check network access to erddap.ifremer.fr, or widen the bounding box.',
      floats: [],
    });
  }
});

// ---- 2. PROFILE ------------------------------------------------------------
/**
 * Physics and BGC in one call. BGC failure does not fail the request — most
 * Argo floats carry no biogeochemical sensors, which is normal.
 */
router.get('/profile/:platform_number', async (req, res) => {
  const pid = String(req.params.platform_number).replace(/^argo-/i, '').trim();
  const days = parseInt(req.query.days, 10) || 120;

  const [core, bgc] = await Promise.allSettled([
    fetchCoreProfile(pid, { days }),
    fetchBgcProfile(pid, { days: Math.max(days, 365) }),
  ]);

  if (core.status === 'rejected') {
    return asError(res, 404, core.reason.message, { platform_number: pid });
  }

  const p = core.value;
  const errors = [];
  if (bgc.status === 'rejected') errors.push(`bgc: ${bgc.reason.message}`);

  res.json({
    platform_number: pid,
    cycle_number: p.cycle_number,
    time: p.time,
    lat: p.lat,
    lon: p.lon,
    mode: 'LIVE',
    source: 'ifremer-erddap',

    // Existing field kept so the current frontend chart keeps working.
    profile: p.levels.map((l) => ({
      depth: l.depth,
      temp: l.temp,
      salinity: l.salinity,
    })),

    physics: { levels: p.levels, available: p.available },
    bgc:
      bgc.status === 'fulfilled'
        ? { levels: bgc.value.levels, available: bgc.value.available, units: BGC_UNITS }
        : null,
    errors,
  });
});

// ---- 2b. BGC PROFILE (standalone) -----------------------------------------
router.get('/bgc/profile/:platform_number', async (req, res) => {
  try {
    res.json(await fetchBgcProfile(req.params.platform_number, {
      days: parseInt(req.query.days, 10) || 365,
    }));
  } catch (err) {
    asError(res, err.code === 'NO_BGC_DATA' ? 404 : 502, err.message, {
      hint: 'This float likely carries no BGC sensors. Use /api/bgc/floats to find one that does.',
    });
  }
});

// ---- 2c. BGC DISCOVERY -----------------------------------------------------
router.get('/bgc/floats', async (req, res) => {
  try {
    res.json(
      await discoverBgcFloats({
        latMin: parseFloat(req.query.lat_min ?? -10),
        latMax: parseFloat(req.query.lat_max ?? 30),
        lonMin: parseFloat(req.query.lon_min ?? 45),
        lonMax: parseFloat(req.query.lon_max ?? 100),
        days: parseInt(req.query.days, 10) || 180,
      })
    );
  } catch (err) {
    asError(res, 502, err.message);
  }
});

// ---- 3. DEPTH SLICE --------------------------------------------------------
/**
 * Values at one depth for one float, interpolated between the two bracketing
 * measured levels. Returns null outside the profile's measured range instead of
 * clamping to the nearest reading — asking for 15 m should not be answered with
 * a 980 m parking measurement.
 */
async function handleDepthSlice(req, res) {
  const pid = String(
    req.query.platform_number || req.query.platformNumber || req.query.floatId || ''
  )
    .replace(/^argo-/i, '')
    .trim();

  if (!pid) return asError(res, 400, 'platform_number is required');

  const depth = Math.max(0, Math.min(2100, parseFloat(req.query.depth) || 15));

  const rawTime = req.query.timestamp || req.query.time || null;
  let atTime = null;
  if (rawTime) {
    const parsed = new Date(rawTime);
    if (Number.isNaN(parsed.getTime())) {
      return asError(res, 400, `Invalid time value: ${rawTime}. Expected ISO-8601.`);
    }
    atTime = parsed.toISOString();
  }

  const [core, bgc] = await Promise.allSettled([
    fetchCoreProfile(pid, { atTime }),
    fetchBgcProfile(pid, { atTime }),
  ]);

  if (core.status === 'rejected') {
    const status = core.reason.code === 'BAD_INPUT' ? 400 : 404;
    return asError(res, status, core.reason.message, { platform_number: pid, depth });
  }

  const p = core.value;
  const bgcLevels = bgc.status === 'fulfilled' ? bgc.value.levels : [];
  const bgcAvailable = bgc.status === 'fulfilled' ? bgc.value.available : {};

  const variables = {
    temperature_c: round(interpolateAt(p.levels, depth, 'temp'), 2),
    salinity_psu: round(interpolateAt(p.levels, depth, 'salinity'), 2),
  };

  for (const v of BGC_VARIABLES) {
    variables[v] = bgcLevels.length ? round(interpolateAt(bgcLevels, depth, v), 4) : null;
  }

  // Backward-compatible aliases for the existing frontend keys.
  variables.dissolved_oxygen_umol_kg = variables.doxy;
  variables.chlorophyll_a_mg_m3 = variables.chla;

  res.json({
    platform_number: pid,
    requested_depth: depth,
    timestamp: p.time,
    interpolation: 'linear between measured levels',
    primary_oceanographic_variables: variables,
    available: {
      temperature_c: variables.temperature_c !== null,
      salinity_psu: variables.salinity_psu !== null,
      ...bgcAvailable,
    },
    units: { temperature_c: '°C', salinity_psu: 'PSU', ...BGC_UNITS },
    metadata: {
      coordinates: { lat: p.lat, lon: p.lon },
      cycle_number: p.cycle_number,
      data_source: 'ifremer-erddap',
      bgc_source: bgc.status === 'fulfilled' ? 'ifremer-erddap-bgc' : null,
      measured_depth_range: p.levels.length
        ? [p.levels[0].depth, p.levels[p.levels.length - 1].depth]
        : null,
      notes:
        'Current speed and direction are not measured by Argo floats and are ' +
        'therefore not reported here. Use a model product for currents.',
    },
    errors: bgc.status === 'rejected' ? [`bgc: ${bgc.reason.message}`] : [],
  });
}

router.get('/argo/depth-slice', handleDepthSlice);
router.get('/depth-slice', handleDepthSlice);
router.get('/argo/depth_slice', handleDepthSlice);

// ---- 4. MODEL POINT --------------------------------------------------------
router.get('/model/point', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const depth = Math.max(0, Math.min(2100, parseFloat(req.query.depth) || 0));

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return asError(res, 400, 'lat and lon are required');
  }

  try {
    const result = await fetchModelPoint({ lat, lon, depth, time: req.query.time });
    res.json({
      ...result,
      model: result.variables,
      data_source: result.source ?? null,
      depth,
    });
  } catch (err) {
    asError(res, 502, err.message);
  }
});

/** One-off helper: list INCOIS gridded datasets so you can configure .env */
router.get('/model/datasets', async (_req, res) => {
  try {
    res.json({ configured: isModelConfigured(), datasets: await discoverModelDatasets() });
  } catch (err) {
    asError(res, 502, err.message);
  }
});

// ---- 5. VALIDATION ---------------------------------------------------------
const VARIABLE_DEFS = [
  ['temp', 'Temp', '°C', 'temperature'],
  ['psal', 'Salinity', 'PSU', 'salinity'],
  ['doxy', 'O₂ Diss', BGC_UNITS.doxy, 'dissolved_oxygen'],
  ['chla', 'Chl-a', BGC_UNITS.chla, 'chlorophyll'],
];

/** Every cell null, for a float/time combination with no nearby cycle at all. */
function emptyValidationResponse(pid, depth, requestedTime, reason) {
  return {
    platform_number: pid,
    cycle_number: null,
    depth_level: `${depth}m`,
    time: null,
    requested_time: requestedTime,
    location: { lat: null, lon: null },
    model: { available: false, reason: 'no observation to match against', source: null },
    variables: VARIABLE_DEFS.map(([key, name, unit]) => ({
      key,
      name,
      unit,
      observed: null,
      model: null,
      delta: null,
      observed_source: null,
      reason,
    })),
    qc: 'Argo QC flags 1, 2, 5 accepted; values outside physical range rejected',
    errors: [],
  };
}

/**
 * Observation vs model at a given depth, optionally at a historical timestamp.
 *
 * time query param (optional): any ISO-8601 string, e.g. from
 * <input type="datetime-local">. When given, this returns the nearest real
 * Argo cycle within a search window, NOT an exact-timestamp reading — Argo
 * floats dive roughly every 10 days, so "the exact reading at time X" does
 * not exist as a concept.
 *
 * When no cycle exists anywhere near the requested time, this responds 200
 * with every variable null and a `reason`, rather than 404 — a UI scrubbing
 * through historical dates should show quiet "--" cells for gaps, not an
 * error page. A 404/502 here means something actually went wrong (bad input,
 * ERDDAP unreachable), not "this float had no dive that week".
 *
 * When the model is unavailable, `model` and `delta` are null. The previous
 * version computed model = observation minus a constant, which produced a
 * delta column that looked like model skill but measured nothing.
 */
async function handleValidation(req, res) {
  const pid = String(req.query.platform_number || '').replace(/^argo-/i, '').trim();
  const depth = Math.max(0, Math.min(2100, parseFloat(req.query.depth) || 15));
  const rawTime = req.query.time ? String(req.query.time).trim() : null;

  if (!pid) return asError(res, 400, 'platform_number is required');

  let atTime = null;
  if (rawTime) {
    const parsed = new Date(rawTime);
    if (Number.isNaN(parsed.getTime())) {
      return asError(res, 400, `Invalid time value: ${rawTime}. Expected ISO-8601.`);
    }
    atTime = parsed.toISOString();
  }

  const [core, bgc] = await Promise.allSettled([
    fetchCoreProfile(pid, { atTime }),
    fetchBgcProfile(pid, { atTime }),
  ]);

  if (core.status === 'rejected') {
    // EMPTY_RESULT with a historical time = a real, expected gap in the
    // record. Everything else (bad input, ERDDAP unreachable) is a real error.
    if (core.reason.code === 'EMPTY_RESULT' && atTime) {
      return res.json(emptyValidationResponse(pid, depth, atTime, core.reason.message));
    }
    const status = core.reason.code === 'BAD_INPUT' ? 400 : 404;
    return asError(res, status, core.reason.message, { platform_number: pid });
  }

  const p = core.value;
  const bgcLevels = bgc.status === 'fulfilled' ? bgc.value.levels : [];

  const observed = {
    temp: round(interpolateAt(p.levels, depth, 'temp'), 2),
    psal: round(interpolateAt(p.levels, depth, 'salinity'), 2),
    doxy: bgcLevels.length ? round(interpolateAt(bgcLevels, depth, 'doxy'), 1) : null,
    chla: bgcLevels.length ? round(interpolateAt(bgcLevels, depth, 'chla'), 3) : null,
  };

  let model = { available: false, reason: 'not requested', variables: {} };
  if (p.lat !== null && p.lon !== null) {
    try {
      // Pass the CYCLE's own time (p.time), not the requested time — the
      // model should be compared at the moment the float actually measured,
      // which is what "delta" is supposed to mean.
      model = await fetchModelPoint({ lat: p.lat, lon: p.lon, depth, time: p.time });
    } catch (err) {
      model = { available: false, reason: err.message, variables: {} };
    }
  }

  const pair = (key, name, unit, modelKey) => {
    const obs = observed[key];
    const mod = model.available ? (model.variables[modelKey] ?? null) : null;
    return {
      key,
      name,
      unit,
      observed: obs,
      model: mod,
      delta: obs !== null && mod !== null ? round(obs - mod, 3) : null,
      observed_source: obs === null ? null : key === 'doxy' || key === 'chla'
        ? 'ifremer-erddap-bgc'
        : 'ifremer-erddap',
      reason:
        obs === null
          ? `no ${name} measurement at ${depth} m on this float${atTime ? ' near the requested time' : ''}`
          : mod === null
            ? 'model value unavailable'
            : null,
    };
  };

  res.json({
    platform_number: pid,
    cycle_number: p.cycle_number,
    depth_level: `${depth}m`,
    time: p.time,
    requested_time: atTime,
    // The float drifts between dives — this cycle's position is not
    // necessarily where it is "now". Label it as such in the UI when atTime
    // is set, rather than showing it as a live position.
    location: { lat: p.lat, lon: p.lon },
    model: { available: model.available, reason: model.reason, source: model.source ?? null },
    variables: VARIABLE_DEFS.map(([key, name, unit, modelKey]) => pair(key, name, unit, modelKey)),
    qc: 'Argo QC flags 1, 2, 5 accepted; values outside physical range rejected',
    errors: bgc.status === 'rejected' ? [`bgc: ${bgc.reason.message}`] : [],
  });
}

router.get('/validation', handleValidation);

// Legacy alias so any existing frontend call keeps resolving.
router.get('/validate', handleValidation);

export default router;
