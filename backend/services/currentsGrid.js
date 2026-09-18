import { createCache, fetchErddapJson, parseTable } from './erddap.js';

/**
 * Surface ocean currents — NOAA CoastWatch ERDDAP.
 *
 * Dataset: noaacwBLENDEDNRTcurrentsDaily
 *   https://coastwatch.noaa.gov/erddap/griddap/noaacwBLENDEDNRTcurrentsDaily.html
 *
 * This is geostrophic surface current derived from satellite altimetry
 * (sea surface height + MDT CNES/CLS 2013), global, 0.25°, updated daily,
 * no login. ERDDAP flags the dataset "out of date" if it goes more than
 * 2 days without a fresh grid.
 *
 * WHY NOT COPERNICUS uo/vo: Copernicus Marine has no plain-HTTP endpoint —
 * it is only reachable through their Python toolbox, so a Node backend
 * cannot fetch it per-request. Label the UI "NOAA CoastWatch
 * (altimetry-derived)", never "Copernicus".
 *
 * Honest limitations (do not hide these in the UI):
 *   - surface only — there is no depth dimension to query
 *   - geostrophic component only — no wind-driven or tidal currents, so
 *     speeds are undercounted close to the coast
 */

const NOAA_CURRENTS_BASE =
  process.env.NOAA_CURRENTS_BASE ||
  'https://coastwatch.noaa.gov/erddap/griddap/noaacwBLENDEDNRTcurrentsDaily.json';

const U_VAR = 'u_current';
const V_VAR = 'v_current';
/** ERDDAP _FillValue for land cells — filtered out, never replaced with a guess. */
const FILL_VALUE = -214748.3648;

export const CURRENTS_SOURCE = 'NOAA CoastWatch (altimetry-derived geostrophic currents)';
export const CURRENTS_DEPTH = 'surface (geostrophic, no vertical profile)';

const currentsCache = createCache(10 * 60 * 1000); // daily cadence — 10 min is plenty

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round = (value, decimals = 3) => {
  if (value === null || value === undefined) return null;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

/**
 * Decimated geostrophic current vectors for a lat/lon box.
 *
 * Decimation is done by ERDDAP itself: the stride is part of the griddap
 * bracket syntax  [latMin:stride:latMax]  so the server returns every Nth
 * grid row. We do NOT download the full grid and sample in JavaScript.
 *
 * Land cells come back as _FillValue (NaN after ERDDAP's JSON encoding) —
 * those rows are dropped. No gaps are filled and no vectors are invented.
 *
 * @returns {Promise<{time, source, depth, units, grid, vectors}>}
 *   vectors: [{ lat, lon, u, v, speed, direction_deg }]
 *   direction_deg is the compass bearing the current flows TOWARD
 *   (0 = north, 90 = east), speed = sqrt(u² + v²) in m/s.
 */
export async function fetchCurrentVectors({
  latMin = 0,
  latMax = 25,
  lonMin = 55,
  lonMax = 98,
  stride = 4,
} = {}) {
  const s = Math.round(Number(stride) || 4);
  if (s < 1 || s > 40) {
    throw Object.assign(new Error(`stride must be 1..40, got ${stride}`), { code: 'BAD_INPUT' });
  }

  const laMin = Number(latMin);
  const laMax = Number(latMax);
  const loMin = Number(lonMin);
  const loMax = Number(lonMax);
  if ([laMin, laMax, loMin, loMax].some((v) => !Number.isFinite(v))) {
    throw Object.assign(new Error('lat/lon bounds must be numbers'), { code: 'BAD_INPUT' });
  }
  if (laMin >= laMax || loMin >= loMax) {
    throw Object.assign(
      new Error('empty box: need lat_min < lat_max and lon_min < lon_max'),
      { code: 'BAD_INPUT' }
    );
  }

  const key = `currents:${laMin}:${laMax}:${loMin}:${loMax}:${s}`;

  return currentsCache.wrap(key, async () => {
    // griddap bracket grammar: [time][lat start:stride:lat end][lon start:stride:lon end]
    // 'last' = the freshest daily grid. Same brackets for both variables.
    const brackets = `[(last)][(${laMin}):${s}:(${laMax})][(${loMin}):${s}:(${loMax})]`;
    const url = `${NOAA_CURRENTS_BASE}?${U_VAR}${brackets},${V_VAR}${brackets}`;

    let rows;
    try {
      rows = parseTable(await fetchErddapJson(url, { retries: 1, timeoutMs: 25000 }));
    } catch (err) {
      throw Object.assign(
        new Error(`NOAA CoastWatch ERDDAP unreachable: ${err.message}`),
        { code: 'UPSTREAM' }
      );
    }

    const vectors = [];
    let time = null;
    for (const r of rows) {
      const lat = Number(r.latitude);
      const lon = Number(r.longitude);
      const u = Number(r[U_VAR]);
      const v = Number(r[V_VAR]);
      // Land / fill cells are absent data — skip them, never substitute.
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (u === FILL_VALUE || v === FILL_VALUE) continue;
      if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
      if (Math.abs(u) > 10 || Math.abs(v) > 10) continue; // fill-value garbage

      vectors.push({
        lat: round(lat, 4),
        lon: round(lon, 3),
        u: round(u, 4),
        v: round(v, 4),
        speed: round(Math.sqrt(u * u + v * v), 3),
        direction_deg: round((Math.atan2(u, v) * 180) / Math.PI + 360) % 360,
      });
    }

    if (vectors.length === 0) {
      throw Object.assign(
        new Error('No valid ocean cells in the requested box (all land or fill values)'),
        { code: 'EMPTY_RESULT' }
      );
    }

    time = rows[0]?.time ?? null;

    return {
      time,
      source: CURRENTS_SOURCE,
      dataset: 'noaacwBLENDEDNRTcurrentsDaily',
      depth: CURRENTS_DEPTH,
      units: {
        u: 'm/s',
        v: 'm/s',
        speed: 'm/s',
        direction: 'degrees clockwise from north (flow direction)',
      },
      grid: {
        stride: s,
        requested_spacing_deg: round(0.25 * s, 2),
        count: vectors.length,
      },
      age_days: time ? round((Date.now() - new Date(time).getTime()) / 86400000, 1) : null,
      note:
        time && Date.now() - new Date(time).getTime() > 2 * 86400000
          ? 'Dataset is older than 48h — ERDDAP flags it out of date. Showing the latest available grid.'
          : null,
      vectors,
    };
  });
}

/**
 * Standalone check — run with:  node backend/services/currentsGrid.js
 * Prints real values so you can confirm the pipeline before touching the UI.
 * Optional args: latMin latMax lonMin lonMax stride
 */
import { pathToFileURL } from 'node:url';

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const [latMin, latMax, lonMin, lonMax, stride] = process.argv.slice(2).map(Number);

  (async () => {
    const result = await fetchCurrentVectors({
      latMin: Number.isFinite(latMin) ? latMin : 0,
      latMax: Number.isFinite(latMax) ? latMax : 25,
      lonMin: Number.isFinite(lonMin) ? lonMin : 55,
      lonMax: Number.isFinite(lonMax) ? lonMax : 98,
      stride: Number.isFinite(stride) ? stride : 4,
    });

    console.log(`Grid time      : ${result.time}  (age: ${result.age_days} days)`);
    console.log(`Source         : ${result.source}`);
    console.log(`Depth          : ${result.depth}`);
    console.log(
      `Grid           : stride ${result.grid.stride} (~${result.grid.requested_spacing_deg}° spacing), ${result.grid.count} vectors`
    );
    if (result.note) console.log(`Note           : ${result.note}`);

    console.log('\nFirst 10 vectors:');
    console.table(result.vectors.slice(0, 10));

    const fast = [...result.vectors].sort((a, b) => b.speed - a.speed)[0];
    if (fast) {
      console.log(
        `\nStrongest vector: ${fast.speed} m/s toward ${fast.direction_deg}° at (${fast.lat}, ${fast.lon})`
      );
    }
  })().catch((e) => {
    console.error('FAILED:', e.message);
    process.exit(1);
  });
}