import {
  C,
  buildTableUrl,
  buildTimeConstraints,
  createCache,
  fetchErddapJson,
  parseTable,
  pickCycle,
  relativeDays,
} from './erddap.js';
import { availability, round, sanitize, sanitizeWithQc } from './sanitize.js';

/**
 * Core Argo physics — the ArgoFloats dataset on Ifremer ERDDAP.
 *
 * This dataset contains ONLY pres, temp, psal and position.
 * It has NO dissolved oxygen and NO chlorophyll. Those live in
 * ArgoFloats-synthetic-BGC — see argoBgc.js.
 */

const CORE_BASE =
  process.env.ERDDAP_IFREMER_BASE ||
  'https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.json';

const fleetCache = new Map();
const profileCache = createCache(5 * 60 * 1000);

/**
 * All floats reporting in a bounding box, one row per float (most recent
 * shallow measurement).
 *
 * orderByMax("platform_number,time") groups by platform_number and returns the
 * row with the largest time in each group. That is the correct way to get a
 * current fleet snapshot — the previous code fetched every row and deduped in
 * JavaScript, which pulled far more data than needed.
 */
export async function fetchFleet({
  latMin = 0,
  latMax = 25,
  lonMin = 55,
  lonMax = 98,
  days = 45,
} = {}) {
  const key = `${latMin},${latMax},${lonMin},${lonMax},${days}`;
  const cached = fleetCache.get(key);
  if (cached && Date.now() < cached.expiry) return cached.value;

  const url = buildTableUrl(
    CORE_BASE,
    ['platform_number', 'time', 'latitude', 'longitude', 'temp', 'psal', 'temp_qc', 'psal_qc'],
    [
      C.ge('time', relativeDays(days)),
      C.ge('latitude', latMin),
      C.le('latitude', latMax),
      C.ge('longitude', lonMin),
      C.le('longitude', lonMax),
      C.le('pres', 10),
      C.fn('orderByMax', 'platform_number,time'),
    ]
  );

  const rows = parseTable(await fetchErddapJson(url));

  const floats = rows
    .map((r) => {
      const lat = sanitize('latitude', r.latitude);
      const lon = sanitize('longitude', r.longitude);
      if (lat === null || lon === null) return null;

      const surfaceTemp = sanitizeWithQc('temp', r);
      const surfaceSalinity = sanitizeWithQc('psal', r);

      return {
        id: String(r.platform_number),
        platform_number: String(r.platform_number),
        name: `Argo Float #${r.platform_number}`,
        lat: round(lat, 4),
        lon: round(lon, 4),
        time: r.time,
        // null means the surface reading failed QC. The UI must show that as
        // "no reading", not substitute a plausible number.
        surfaceTemp: round(surfaceTemp, 2),
        surfaceSalinity: round(surfaceSalinity, 2),
        source: 'ifremer-erddap',
      };
    })
    .filter(Boolean);

  const value = { floats, source: 'ifremer-erddap', fetchedAt: new Date().toISOString() };
  fleetCache.set(key, { value, expiry: Date.now() + 5 * 60 * 1000 });
  return value;
}

/**
 * Vertical physics profile for one float.
 *
 * Two modes:
 *   atTime omitted -> most recent cycle within `days` (live view)
 *   atTime given    -> the cycle whose own time is closest to atTime, searched
 *                       within +/- windowDays. Position and time in the
 *                       response reflect that CYCLE's actual timestamp and
 *                       location (floats drift), not the requested one.
 *
 * Throws with .code === 'EMPTY_RESULT' when the float genuinely has nothing
 * in the searched window — that is a normal, expected outcome for historical
 * queries (Argo floats aren't always active, and windows can miss every
 * cycle), not a failure. Callers that want silent "--" cells rather than an
 * error page should catch that code specifically and render nulls.
 *
 * The previous implementation used orderByMax("time") while also requesting
 * pres, which groups by pressure level and returns the newest reading at each
 * depth — a profile stitched from different dives. Here we request
 * cycle_number and keep only one dive's rows together.
 */
export async function fetchCoreProfile(
  platformNumber,
  { days = 120, maxPres = 2100, atTime = null, windowDays = 45 } = {}
) {
  const pid = String(platformNumber).replace(/^argo-/i, '').trim();
  const cacheKey = `core:${pid}:${days}:${maxPres}:${atTime || 'latest'}:${windowDays}`;

  return profileCache.wrap(cacheKey, async () => {
    const url = buildTableUrl(
      CORE_BASE,
      [
        'platform_number',
        'cycle_number',
        'time',
        'latitude',
        'longitude',
        'pres',
        'temp',
        'psal',
        'pres_qc',
        'temp_qc',
        'psal_qc',
      ],
      [
        C.eqStr('platform_number', pid),
        ...buildTimeConstraints(atTime, days, windowDays),
        C.le('pres', maxPres),
      ]
    );

    const rows = parseTable(await fetchErddapJson(url));
    if (rows.length === 0) {
      const err = new Error(
        atTime
          ? `Float ${pid} has no cycle within ${windowDays} days of ${atTime}`
          : `No core Argo data for float ${pid} in the last ${days} days`
      );
      err.code = 'EMPTY_RESULT';
      throw err;
    }

    const targetCycle = pickCycle(rows, atTime);
    const cycleRows = rows.filter((r) => Number(r.cycle_number) === targetCycle);

    const levels = cycleRows
      .map((r) => {
        const pres = sanitizeWithQc('pres', r);
        if (pres === null) return null;
        return {
          depth: round(pres, 1),
          pres: round(pres, 1),
          temp: round(sanitizeWithQc('temp', r), 3),
          salinity: round(sanitizeWithQc('psal', r), 3),
          psal: round(sanitizeWithQc('psal', r), 3),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.depth - b.depth);

    if (levels.length === 0) {
      const err = new Error(`Float ${pid} cycle ${targetCycle} has no levels that pass QC`);
      err.code = 'EMPTY_RESULT';
      throw err;
    }

    const withPosition = cycleRows.find(
      (r) => r.latitude !== null && r.longitude !== null
    );

    return {
      platform_number: pid,
      cycle_number: targetCycle,
      time: cycleRows[0]?.time ?? null,
      requested_time: atTime,
      // These were always null before: latitude and longitude were read from
      // columns that the query never requested. Note this is the position AT
      // THIS CYCLE, not the float's current position — it drifts between dives.
      lat: withPosition ? round(Number(withPosition.latitude), 4) : null,
      lon: withPosition ? round(Number(withPosition.longitude), 4) : null,
      levels,
      available: availability(levels, ['temp', 'psal']),
      source: 'ifremer-erddap',
    };
  });
}

/**
 * Linear interpolation between the two bracketing levels.
 * Returns null outside the profile's range rather than clamping to the nearest
 * value — a 15 m request should not be answered with a 980 m parking reading.
 */
export function interpolateAt(levels, targetDepth, variable) {
  const pts = levels
    .filter((l) => l[variable] !== null && l[variable] !== undefined)
    .sort((a, b) => a.depth - b.depth);

  if (pts.length === 0) return null;
  if (pts.length === 1) {
    return Math.abs(targetDepth - pts[0].depth) <= 20 ? pts[0][variable] : null;
  }
  if (targetDepth < pts[0].depth || targetDepth > pts[pts.length - 1].depth) return null;

  for (let i = 0; i < pts.length - 1; i++) {
    const lo = pts[i];
    const hi = pts[i + 1];
    if (lo.depth <= targetDepth && targetDepth <= hi.depth) {
      if (hi.depth === lo.depth) return lo[variable];
      const t = (targetDepth - lo.depth) / (hi.depth - lo.depth);
      return lo[variable] + t * (hi[variable] - lo[variable]);
    }
  }
  return null;
}
