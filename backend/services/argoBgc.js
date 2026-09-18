import {
  C,
  buildTableUrl,
  createCache,
  fetchErddapJson,
  parseTable,
  relativeDays,
} from './erddap.js';
import { availability, round, sanitizeWithQc } from './sanitize.js';

const BGC_BASE =
  process.env.ERDDAP_BGC_BASE ||
  'https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats-synthetic-BGC.json';

const profileCache = createCache(5 * 60 * 1000);

/**
 * Vertical BGC profile for one float: the most recent complete cycle.
 * Contains oxygen, chlorophyll, backscatter, etc.
 */
export async function fetchBgcProfile(platformNumber, { days = 365, maxPres = 2100 } = {}) {
  const pid = String(platformNumber).replace(/^argo-/i, '').trim();

  return profileCache.wrap(`bgc:${pid}:${days}:${maxPres}`, async () => {
    const url = buildTableUrl(
      BGC_BASE,
      [
        'platform_number',
        'cycle_number',
        'time',
        'latitude',
        'longitude',
        'pres',
        'temp',
        'psal',
        'doxy',
        'chla',
        'bbp700',
        'cdom',
        'pres_qc',
        'temp_qc',
        'psal_qc',
        'doxy_qc',
        'chla_qc',
        'bbp700_qc',
        'cdom_qc'
      ],
      [
        C.eqStr('platform_number', pid),
        C.ge('time', relativeDays(days)),
        C.le('pres', maxPres),
      ]
    );

    const rows = parseTable(await fetchErddapJson(url));
    if (rows.length === 0) {
      throw new Error(`No BGC Argo data for float ${pid} in the last ${days} days`);
    }

    // Keep only the latest dive.
    const latestCycle = Math.max(...rows.map((r) => Number(r.cycle_number) || 0));
    const cycleRows = rows.filter((r) => Number(r.cycle_number) === latestCycle);

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
          doxy: round(sanitizeWithQc('doxy', r), 3),
          chla: round(sanitizeWithQc('chla', r), 3),
          bbp700: round(sanitizeWithQc('bbp700', r), 5),
          cdom: round(sanitizeWithQc('cdom', r), 3)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.depth - b.depth);

    if (levels.length === 0) {
      throw new Error(`Float ${pid} cycle ${latestCycle} has no levels that pass QC`);
    }

    const withPosition = cycleRows.find(
      (r) => r.latitude !== null && r.longitude !== null
    );

    return {
      platform_number: pid,
      cycle_number: latestCycle,
      time: cycleRows[0]?.time ?? null,
      lat: withPosition ? round(Number(withPosition.latitude), 4) : null,
      lon: withPosition ? round(Number(withPosition.longitude), 4) : null,
      levels,
      available: availability(levels, ['temp', 'psal', 'doxy', 'chla', 'bbp700', 'cdom']),
      source: 'ifremer-erddap-bgc',
    };
  });
}

/**
 * Find recent BGC floats in the region. BGC floats are rarer than core floats.
 */
export async function findBgcFloats({
  latMin = -10,
  latMax = 30,
  lonMin = 45,
  lonMax = 100,
  days = 180,
} = {}) {
  const url = buildTableUrl(
    BGC_BASE,
    ['platform_number', 'time', 'latitude', 'longitude'],
    [
      C.ge('time', relativeDays(days)),
      C.ge('latitude', latMin),
      C.le('latitude', latMax),
      C.ge('longitude', lonMin),
      C.le('longitude', lonMax),
      C.le('pres', 10),
      'distinct()',
    ]
  );
  return parseTable(await fetchErddapJson(url));
}

const isMain = typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('argoBgc.js');
if (isMain) {
  const arg = process.argv[2];
  if (!arg) {
    console.log('Searching for recent BGC floats near India...');
    findBgcFloats()
      .then(rows => {
        if (rows.length === 0) {
          console.log('No BGC floats found recently in this bounding box.');
          return;
        }
        console.log(`Found ${rows.length} floats. Sample:`);
        const unique = [...new Set(rows.map(r => r.platform_number))];
        for (const p of unique.slice(0, 5)) {
          console.log(`  - ${p}`);
        }
        console.log('\nRun: node backend/services/argoBgc.js <platform_number>');
      })
      .catch(e => {
        console.error('Search failed:', e.message);
        process.exit(1);
      });
  } else {
    console.log(`Fetching BGC profile for float ${arg}...`);
    fetchBgcProfile(arg)
      .then(res => {
        console.log(`\nPlatform: ${res.platform_number}`);
        console.log(`Time: ${res.time}`);
        console.log(`Location: ${res.lat}, ${res.lon}`);
        console.log('\nAvailability Map:');
        console.log(res.available);
        console.log('\nTop 5 Levels:');
        console.table(res.levels.slice(0, 5));
      })
      .catch(e => {
        console.error('Fetch failed:', e.message);
        process.exit(1);
      });
  }
}
