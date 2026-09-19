import { buildGridUrl, createCache, fetchErddapJson, parseTable } from './erddap.js';
import { round, sanitize } from './sanitize.js';

/**
 * Gridded ocean model fields via ERDDAP griddap.
 *
 * The previous /model/point endpoint made no network request at all. It
 * computed  28.5 * exp(-depth/380) + 1.5  and returned it labelled
 * "INCOIS-ROMS 1/12°". This file replaces that with a real griddap client.
 *
 * griddap uses a DIFFERENT URL grammar from tabledap:
 *   tabledap   ?var1,var2&time>=X&latitude>=Y
 *   griddap    ?var[(time)][(depth)][(latMin):(latMax)][(lonMin):(lonMax)]
 * The bracket order must match the dataset's own dimension order. Check
 *   https://erddap.incois.gov.in/erddap/griddap/<datasetID>.dds
 * before configuring anything below.
 *
 * If MODEL_DATASET_ID is not configured this module returns
 * { available: false, reason: ... }. It never returns a computed number.
 */

const INCOIS_ERDDAP = process.env.ERDDAP_INCOIS_BASE || 'https://erddap.incois.gov.in/erddap';
const MODEL_DATASET_ID = process.env.MODEL_DATASET_ID || 'incois_argo_10d_VAM';

/**
 * Variable names in the configured dataset, comma-separated as
 * canonical:actual, e.g. "temperature:TEMP,salinity:SAL".
 * Different INCOIS products use different names, so this stays configurable.
 */
const MODEL_VARIABLE_MAP = parseVariableMap(
  process.env.MODEL_VARIABLES || 'temperature:TEMP,salinity:SAL'
);

/**
 * Dimension order of the configured dataset. Almost always one of:
 *   time,latitude,longitude          (2D surface products, e.g. SST)
 *   time,depth,latitude,longitude    (3D products)
 *   time,ZAX,latitude,longitude      (INCOIS 3D products where ZAX = depth in meters)
 */
const MODEL_DIMENSIONS = (process.env.MODEL_DIMENSIONS || 'time,ZAX,latitude,longitude')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const modelCache = createCache(15 * 60 * 1000);

function parseVariableMap(raw) {
  const map = {};
  for (const pair of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [canonical, actual] = pair.split(':').map((s) => s.trim());
    if (canonical && actual) map[canonical] = actual;
  }
  return map;
}

export function isModelConfigured() {
  return Boolean(MODEL_DATASET_ID && Object.keys(MODEL_VARIABLE_MAP).length > 0);
}

/**
 * List gridded datasets on the INCOIS ERDDAP that cover the Indian Ocean.
 * Run this once to find a dataset ID for MODEL_DATASET_ID, then hardcode it in
 * .env rather than discovering on every request.
 */
export async function discoverModelDatasets() {
  const url =
    `${INCOIS_ERDDAP}/tabledap/allDatasets.json` +
    `?datasetID,title,institution,dataStructure,minLongitude,maxLongitude,minLatitude,maxLatitude`;

  const rows = parseTable(await fetchErddapJson(url, { timeoutMs: 20000 }));

  return rows
    .filter((r) => r.dataStructure === 'grid')
    .filter((r) => {
      const lonOk = Number(r.maxLongitude) >= 60 && Number(r.minLongitude) <= 100;
      const latOk = Number(r.maxLatitude) >= 0 && Number(r.minLatitude) <= 30;
      return lonOk && latOk;
    })
    .map((r) => ({
      datasetID: r.datasetID,
      title: r.title,
      institution: r.institution,
      ddsUrl: `${INCOIS_ERDDAP}/griddap/${r.datasetID}.dds`,
    }));
}

/**
 * Model value at a single point.
 * Returns { available: false, reason } rather than a number when the model
 * cannot answer. The caller must render that as "no model data", never as zero
 * and never as an estimate.
 */
export async function fetchModelPoint({ lat, lon, depth = 0, time = null } = {}) {
  if (!isModelConfigured()) {
    return {
      available: false,
      reason:
        'MODEL_DATASET_ID / MODEL_VARIABLES not configured. Run discoverModelDatasets() ' +
        'or browse https://erddap.incois.gov.in/erddap/griddap/index.html to pick a dataset.',
      variables: {},
    };
  }

  const stamp = time || 'last';
  const key = `model:${MODEL_DATASET_ID}:${lat}:${lon}:${depth}:${stamp}`;

  return modelCache.wrap(key, async () => {
    const base = `${INCOIS_ERDDAP}/griddap/${MODEL_DATASET_ID}.json`;
    const variables = {};
    const errors = [];

    for (const [canonical, actual] of Object.entries(MODEL_VARIABLE_MAP)) {
      try {
        const buildRanges = (tVal) =>
          MODEL_DIMENSIONS.map((dim) => {
            if (dim === 'time') return [tVal];
            if (dim === 'depth' || dim === 'altitude' || dim === 'LEV' || dim === 'ZAX') return [depth];
            if (dim === 'latitude' || dim === 'lat') return [lat];
            if (dim === 'longitude' || dim === 'lon') return [lon];
            return [0];
          });

        let url = buildGridUrl(base, actual, buildRanges(stamp));
        let rows = [];
        try {
          rows = parseTable(await fetchErddapJson(url, { timeoutMs: 20000 }));
        } catch (fetchErr) {
          // If a specific timestamp is outside coverage, query the latest available grid ('last')
          if (stamp !== 'last') {
            const fallbackUrl = buildGridUrl(base, actual, buildRanges('last'));
            rows = parseTable(await fetchErddapJson(fallbackUrl, { timeoutMs: 20000 }));
          } else {
            throw fetchErr;
          }
        }

        if (rows.length === 0) {
          errors.push(`${canonical}: no grid cell at that position`);
          continue;
        }

        const value = sanitize(canonical, rows[0][actual]);
        variables[canonical] = value === null ? null : round(value, 3);
        if (rows[0].time) variables[`${canonical}_time`] = rows[0].time;
      } catch (err) {
        errors.push(`${canonical}: ${err.message}`);
      }
    }

    const gotSomething = Object.values(variables).some((v) => typeof v === 'number');

    return {
      available: gotSomething,
      reason: gotSomething ? null : errors.join(' | ') || 'model returned no usable values',
      datasetID: MODEL_DATASET_ID,
      source: `incois-erddap-griddap:${MODEL_DATASET_ID}`,
      requested: { lat, lon, depth, time: stamp },
      variables,
      errors,
    };
  });
}

/** node backend/services/modelGrid.js   -> lists candidate INCOIS datasets */
const isMain = typeof process !== 'undefined' && process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isMain) {
  discoverModelDatasets()
    .then((list) => {
      if (list.length === 0) {
        console.log('No gridded INCOIS datasets matched the Indian Ocean bounds.');
        return;
      }
      console.log(`${list.length} candidate datasets:\n`);
      for (const d of list.slice(0, 25)) {
        console.log(`  ${d.datasetID}\n    ${d.title}\n    dims: ${d.ddsUrl}\n`);
      }
      console.log('Open a .dds URL to read the exact dimension order and variable names,');
      console.log('then set MODEL_DATASET_ID, MODEL_VARIABLES and MODEL_DIMENSIONS in .env');
    })
    .catch((e) => {
      console.error('Discovery failed:', e.message);
      process.exit(1);
    });
}
