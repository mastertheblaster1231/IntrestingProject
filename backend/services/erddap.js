import fetch from 'node-fetch';
import https from 'https';

// Agent for handling regional government SSL certificates (e.g. incois.gov.in)
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

/**
 * Shared ERDDAP client.
 *
 * Everything that talks to an ERDDAP server goes through here so that URL
 * encoding, timeouts, retries and response parsing are done once and correctly.
 *
 * ERDDAP has two protocols with different URL grammar:
 *   tabledap  -> rows of point observations.  ?var1,var2&constraint&function()
 *   griddap   -> gridded arrays.              ?var[(time)][(depth)][(lat):(lat)]
 * Both return the same JSON envelope, so parseTable() works for either.
 */

export const ERDDAP_TIMEOUT_MS = parseInt(process.env.ERDDAP_TIMEOUT_MS || '60000', 10); // public ERDDAP (was 30000)

/**
 * ERDDAP's query grammar uses  &  =  >  <  ,  structurally, so we cannot run
 * encodeURIComponent over the whole query string. We encode each value only.
 */
export const C = {
  /** numeric or relative-time lower bound:  time>=now-45days  */
  ge: (variable, value) => `${variable}%3E=${encodeURIComponent(String(value))}`,
  /** numeric or relative-time upper bound */
  le: (variable, value) => `${variable}%3C=${encodeURIComponent(String(value))}`,
  /** string equality — ERDDAP requires the value in double quotes */
  eqStr: (variable, value) => `${variable}=${encodeURIComponent(`"${value}"`)}`,
  /** numeric equality */
  eqNum: (variable, value) => `${variable}=${encodeURIComponent(String(value))}`,
  /** regex match, e.g. regex('temp_qc', '[12]') for good-quality flags only */
  regex: (variable, pattern) => `${variable}=~${encodeURIComponent(`"${pattern}"`)}`,
  /**
   * Server-side function. orderByMax("platform_number,time") groups by
   * platform_number and returns the row with the largest time for each group —
   * exactly one current row per float.
   */
  fn: (name, arg) => `${name}%28${encodeURIComponent(`"${arg}"`)}%29`,
};

/**
 * ERDDAP relative time must be spelled out: now-45days, not now-45d.
 * The abbreviated form is rejected by the server.
 */
export const relativeDays = (days) => `now-${Math.max(1, Math.round(days))}days`;

/**
 * Build a tabledap URL.
 * @param {string} base   e.g. https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.json
 * @param {string[]} variables  columns to return
 * @param {string[]} constraints  pre-encoded strings from C.*
 */
export function buildTableUrl(base, variables, constraints = []) {
  return `${base}?${variables.join(',')}${constraints.length ? '&' + constraints.join('&') : ''}`;
}

/**
 * Build a griddap URL. Dimension order MUST match the dataset's own order —
 * check <dataset>.dds before using this.
 * Brackets are percent-encoded (%5B and %5D) so Tomcat/RFC 7230 does not reject them.
 * @param {Array<[number|string, number|string]|[string]>} ranges
 *        one entry per dimension. [a, b] -> [(a):(b)], [a] -> [(a)]
 */
export function buildGridUrl(base, variable, ranges) {
  const brackets = ranges
    .map((r) => (r.length === 1 ? `%5B(${encodeURIComponent(r[0])})%5D` : `%5B(${encodeURIComponent(r[0])}):(${encodeURIComponent(r[1])})%5D`))
    .join('');
  return `${base}?${encodeURIComponent(variable)}${brackets}`;
}

/**
 * Fetch JSON from ERDDAP with timeout, retry on 429/timeout, and useful errors.
 * Throws on failure. Callers decide what an unavailable source means —
 * this layer never invents a value.
 */
export async function fetchErddapJson(url, { retries = 1, timeoutMs = ERDDAP_TIMEOUT_MS } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        agent: url.startsWith('https') ? httpsAgent : undefined,
      });

      if (!res.ok) {
        // 404 from ERDDAP usually means "unrecognized variable" or "no matching
        // data" — surface the body, it explains which.
        const body = await res.text().catch(() => '');
        const detail = body.slice(0, 300).replace(/\s+/g, ' ').trim();
        
        if (res.status === 404 && detail.includes('no matching results')) {
          return { table: { columnNames: [], columnTypes: [], rows: [] } };
        }

        lastError = new Error(`ERDDAP ${res.status} for ${url} :: ${detail}`);

        if (res.status === 429 && attempt < retries) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        // 404 with "Your query produced no matching results" is not an error
        // condition worth retrying.
        throw lastError;
      }

      return await res.json();
    } catch (err) {
      lastError = err;
      const aborted = err.name === 'AbortError';
      if (attempt < retries && aborted) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw new Error(
        aborted ? `ERDDAP timeout after ${timeoutMs}ms: ${url}` : lastError.message
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

/**
 * ERDDAP JSON is column-oriented, NOT an array of objects:
 *   { table: { columnNames: [...], columnTypes: [...], rows: [[...], ...] } }
 * This turns it into plain objects keyed by column name.
 * Returns [] when the query matched nothing.
 */
export function parseTable(json) {
  const table = json?.table;
  if (!table?.columnNames || !Array.isArray(table.rows)) return [];

  const names = table.columnNames;
  return table.rows.map((row) => {
    const obj = {};
    for (let i = 0; i < names.length; i++) obj[names[i]] = row[i];
    return obj;
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Argo floats dive in discrete cycles roughly 10 days apart, not continuously.
 * "Historical data at timestamp X" cannot mean "the exact reading at X" — it
 * means "the nearest real cycle to X". This builds an absolute ERDDAP time
 * window around a requested timestamp so a nearby cycle can be found, rather
 * than pretending a continuous time series exists.
 *
 * When atTime is omitted, falls back to the existing relative-days behaviour
 * used for live views.
 */
export function buildTimeConstraints(atTime, days, windowDays) {
  if (!atTime) return [C.ge('time', relativeDays(days))];

  const center = new Date(atTime);
  if (Number.isNaN(center.getTime())) {
    throw Object.assign(new Error(`Invalid time value: ${atTime}`), { code: 'BAD_INPUT' });
  }
  const start = new Date(center.getTime() - windowDays * 86400000).toISOString();
  const end = new Date(center.getTime() + windowDays * 86400000).toISOString();
  return [C.ge('time', start), C.le('time', end)];
}

/**
 * Picks a cycle_number from a set of rows.
 * atTime omitted -> the latest cycle (live view).
 * atTime given    -> the cycle whose own time is nearest atTime.
 */
export function pickCycle(rows, atTime) {
  if (!atTime) {
    return Math.max(...rows.map((r) => Number(r.cycle_number) || 0));
  }
  const target = new Date(atTime).getTime();
  const timeByCycle = new Map();
  for (const r of rows) {
    const c = Number(r.cycle_number) || 0;
    if (!timeByCycle.has(c)) timeByCycle.set(c, r.time);
  }
  let best = null;
  let bestDiff = Infinity;
  for (const [cycle, t] of timeByCycle) {
    const diff = Math.abs(new Date(t).getTime() - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = cycle;
    }
  }
  return best;
}

/**
 * Small in-memory TTL cache with request de-duplication, so ten browser tabs
 * hitting the same float produce one upstream request.
 */
export function createCache(ttlMs = 5 * 60 * 1000) {
  const store = new Map();
  const inflight = new Map();

  return {
    async wrap(key, producer) {
      const hit = store.get(key);
      if (hit && Date.now() < hit.expiry) return hit.value;
      if (inflight.has(key)) return inflight.get(key);

      const promise = (async () => {
        const value = await producer();
        store.set(key, { value, expiry: Date.now() + ttlMs });
        return value;
      })();

      inflight.set(key, promise);
      try {
        return await promise;
      } finally {
        inflight.delete(key);
      }
    },
    clear: () => store.clear(),
    get size() {
      return store.size;
    },
  };
}
