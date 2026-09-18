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
import { availability, round, sanitizeWithQc } from './sanitize.js';

/**
 * Biogeochemical Argo — dissolved oxygen, chlorophyll, backscatter.
 *
 * THIS IS A DIFFERENT DATASET FROM THE PHYSICS ONE.
 *   ArgoFloats                  -> pres, temp, psal only
 *   ArgoFloats-synthetic-BGC    -> the above PLUS doxy, chla, bbp700, cdom,
 *                                  nitrate, ph_in_situ_total, downwelling_par
 *
 * Asking ArgoFloats for doxy returns an ERDDAP error, which is why oxygen and
 * chlorophyll never arrived. All variable names are lowercase.
 *
 * Note: this dataset has NO `data_mode` variable. It uses `parameter_data_mode`,
 * a compound per-parameter string. Do not copy a data_mode filter across from
 * the core dataset — it throws "unrecognized variable".
 */

const BGC_BASE =
  process.env.ERDDAP_BGC_BASE ||
  'https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats-synthetic-BGC.json';

export const BGC_VARIABLES = ['doxy', 'chla', 'bbp700', 'cdom', 'nitrate'];

export const BGC_UNITS = {
  doxy: 'µmol/kg',
  chla: 'mg/m³',
  bbp700: 'm⁻¹',
  cdom: 'ppb',
  nitrate: 'µmol/kg',
};

const bgcCache = createCache(5 * 60 * 1000);
const discoveryCache = createCache(30 * 60 * 1000);

/**
 * Which BGC floats are reporting in a bounding box.
 *
 * BGC floats are far rarer than core Argo floats — roughly a tenth as many
 * globally — so a tight box over a short window will often return nothing.
 * That is a real property of the observing network, not a bug. Widen the box
 * or the window rather than assuming the query is broken.
 */
export async function discoverBgcFloats({
  latMin = -10,
  latMax = 30,
  lonMin = 45,
  lonMax = 100,
  days = 180,
} = {}) {
  const key = `bgc-discover:${latMin},${latMax},${lonMin},${lonMax},${days}`;

  return discoveryCache.wrap(key, async () => {
    const url = buildTableUrl(
      BGC_BASE,
      ['platform_number', 'time', 'latitude', 'longitude'],
      [
        C.ge('time', relativeDays(days)),
        C.ge('latitude', latMin),
        C.le('latitude', latMax),
        C.ge('longitude', lonMin),
        C.le('longitude', lonMax),
        C.le('pres', 20),
        C.fn('orderByMax', 'platform_number,time'),
      ]
    );

    const rows = parseTable(await fetchErddapJson(url));

    return {
      floats: rows.map((r) => ({
        platform_number: String(r.platform_number),
        lat: round(Number(r.latitude), 4),
        lon: round(Number(r.longitude), 4),
        time: r.time,
      })),
      searchArea: { latMin, latMax, lonMin, lonMax, days },
      source: 'ifremer-erddap-bgc',
    };
  });
}

/**
 * Full BGC profile for one float.
 *
 * Same two modes as fetchCoreProfile: atTime omitted -> latest cycle;
 * atTime given -> nearest cycle within +/- windowDays. BGC floats dive less
 * often and are far rarer than core floats, so the default window here is
 * wider than the core default.
 *
 * QC filtering happens per value in JavaScript, not as an ERDDAP constraint.
 * A server-side &doxy_qc=~"[12]" would drop the entire row wherever oxygen is
 * absent, discarding good temp and psal along with it.
 *
 * Throws with .code === 'NO_BGC_DATA' when nothing is found in the window —
 * expected for most floats/times, not a failure. Callers building a "--" UI
 * should catch this specifically rather than surfacing it as an error.
 */
export async function fetchBgcProfile(
  platformNumber,
  { days = 365, maxPres = 2100, atTime = null, windowDays = 60 } = {}
) {
  const pid = String(platformNumber).replace(/^argo-/i, '').trim();
  const cacheKey = `bgc:${pid}:${days}:${maxPres}:${atTime || 'latest'}:${windowDays}`;

  return bgcCache.wrap(cacheKey, async () => {
    const dataVars = ['pres', 'temp', 'psal', ...BGC_VARIABLES];
    const qcVars = dataVars.map((v) => `${v}_qc`);

    const url = buildTableUrl(
      BGC_BASE,
      ['platform_number', 'cycle_number', 'time', 'latitude', 'longitude', ...dataVars, ...qcVars],
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
          ? `Float ${pid} has no BGC cycle within ${windowDays} days of ${atTime}`
          : `Float ${pid} has no BGC data in the last ${days} days`
      );
      err.code = 'NO_BGC_DATA';
      throw err;
    }

    const targetCycle = pickCycle(rows, atTime);
    const cycleRows = rows.filter((r) => Number(r.cycle_number) === targetCycle);

    const levels = cycleRows
      .map((r) => {
        const pres = sanitizeWithQc('pres', r);
        if (pres === null) return null;

        const level = { depth: round(pres, 1), pres: round(pres, 1) };
        level.temp = round(sanitizeWithQc('temp', r), 3);
        level.salinity = round(sanitizeWithQc('psal', r), 3);
        for (const v of BGC_VARIABLES) {
          level[v] = round(sanitizeWithQc(v, r), 4);
        }
        return level;
      })
      .filter(Boolean)
      .sort((a, b) => a.depth - b.depth);

    const withPosition = cycleRows.find((r) => r.latitude !== null && r.longitude !== null);

    return {
      platform_number: pid,
      cycle_number: targetCycle,
      time: cycleRows[0]?.time ?? null,
      requested_time: atTime,
      lat: withPosition ? round(Number(withPosition.latitude), 4) : null,
      lon: withPosition ? round(Number(withPosition.longitude), 4) : null,
      levels,
      available: availability(levels, ['temp', 'salinity', ...BGC_VARIABLES]),
      units: BGC_UNITS,
      source: 'ifremer-erddap-bgc',
    };
  });
}

/**
 * Standalone check — run with:  node backend/services/argoBgc.js 2902351
 * Prints real values so you can confirm the pipeline before touching the UI.
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const pid = process.argv[2];

  (async () => {
    if (!pid) {
      console.log('No float given. Discovering BGC floats near India...\n');
      const found = await discoverBgcFloats();
      if (found.floats.length === 0) {
        console.log('No BGC floats in that box. Widen the search area.');
        return;
      }
      console.table(found.floats.slice(0, 10));
      console.log(`\nRe-run with:  node backend/services/argoBgc.js ${found.floats[0].platform_number}`);
      return;
    }

    const profile = await fetchBgcProfile(pid);
    console.log(`Float ${profile.platform_number}  cycle ${profile.cycle_number}  ${profile.time}`);
    console.log(`Position: ${profile.lat}, ${profile.lon}`);
    console.log('Available sensors:', profile.available);
    console.log(`\n${profile.levels.length} levels. First 10:`);
    console.table(profile.levels.slice(0, 10));

    if (profile.available.doxy) {
      const withO2 = profile.levels.filter((l) => l.doxy !== null);
      const min = withO2.reduce((a, b) => (a.doxy < b.doxy ? a : b));
      console.log(`\nOxygen minimum: ${min.doxy} µmol/kg at ${min.depth} m`);
    }
  })().catch((e) => {
    console.error('FAILED:', e.message);
    process.exit(1);
  });
}
