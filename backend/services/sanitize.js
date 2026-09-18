/**
 * Quality control for Argo values.
 *
 * Argo publishes raw sensor output including failures. The BGC dataset metadata
 * shows chla reaching 33553 mg/m3 and doxy reaching 3.8e7 umol/kg from broken
 * sensors, and _FillValue is 99999.0. If any of those reach the Three.js colour
 * scale, normalisation against the max flattens every real value to one colour
 * and the ocean renders as a blank sheet.
 *
 * Two independent defences:
 *   1. QC flags  — Argo's own assessment of each measurement
 *   2. Physical ranges — a value can pass QC and still be nonsense
 */

/**
 * Argo QC flags (reference table 2):
 *   1 good | 2 probably good | 3 probably bad | 4 bad
 *   5 changed | 8 interpolated | 9 missing
 * We accept 1, 2 and 5. 8 (interpolated) is excluded because we want measured
 * values only — interpolation is our job, not something to inherit silently.
 */
const GOOD_QC = new Set(['1', '2', '5']);

/** Realistic ranges for the Indian Ocean / Arabian Sea / Bay of Bengal. */
export const RANGES = {
  pres: [0, 2100],      // decibar, ~= metres
  depth: [0, 2100],
  temp: [-2, 35],       // degC
  psal: [30, 40],       // PSU
  doxy: [0, 350],       // umol/kg — the Arabian Sea OMZ genuinely reaches ~0
  chla: [0, 5],         // mg/m3
  bbp700: [0, 0.01],    // m-1
  cdom: [0, 10],        // ppb
  nitrate: [0, 45],     // umol/kg
};

const FILL_VALUE = 99999;

/**
 * Returns a finite number, or null. Never a substitute, default or guess —
 * a rejected reading is absent, not replaced.
 */
export function sanitize(variable, value) {
  if (value === null || value === undefined) return null;

  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) >= FILL_VALUE) return null;

  const range = RANGES[variable];
  if (range && (n < range[0] || n > range[1])) return null;

  return n;
}

/** True when the Argo QC flag marks this reading as usable. */
export function qcOk(flag) {
  if (flag === null || flag === undefined) return true; // absent flag: defer to range check
  return GOOD_QC.has(String(flag).trim());
}

/**
 * Apply QC flag and range check together.
 *
 * Important: do NOT push QC filtering into the ERDDAP query when you are
 * requesting several variables at once. A server-side constraint like
 * &doxy_qc=~"[12]" drops the whole ROW, which throws away perfectly good temp
 * and psal from any float that carries no oxygen sensor. Filter per value here
 * instead.
 */
export function sanitizeWithQc(variable, row) {
  if (!qcOk(row[`${variable}_qc`])) return null;
  return sanitize(variable, row[variable]);
}

/** Round to a sane number of decimals for transport. */
export function round(value, decimals = 2) {
  if (value === null || value === undefined) return null;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * Build the `available` map for a set of levels: true when at least one level
 * holds a real value for that variable. false means the float carries no such
 * sensor, which is normal — most Argo floats measure only pressure,
 * temperature and salinity.
 */
export function availability(levels, variables) {
  const out = {};
  for (const v of variables) {
    out[v] = levels.some((l) => l[v] !== null && l[v] !== undefined);
  }
  return out;
}
