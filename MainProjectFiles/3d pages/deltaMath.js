/**
 * deltaMath.js — Oceanographic Delta (Δ) & Vector Math Engine
 * ==========================================================
 * Multi-Variable Validation Engine for comparing in-situ observations
 * against 4D ocean numerical models (INCOIS-ROMS, HYCOM, MERCATOR).
 *
 * Implements:
 * 1. Standard Linear Delta: Δ = Observation - Model
 * 2. Vector Circular Math: Δθ = ((θ_obs - θ_mod + 540) % 360) - 180
 * 3. Intelligent precision & unit formatting
 * 4. Missing data validation rule: Never calculate diff if either side is missing
 */

export const SUPPORTED_VARIABLES = [
  { key: 'temperature',      label: 'Temperature',       unit: '°C',      precision: 1, isAngular: false },
  { key: 'salinity',         label: 'Salinity',          unit: 'PSU',     precision: 2, isAngular: false },
  { key: 'chlorophyll',      label: 'Chlorophyll-a',     unit: 'mg/m³',   precision: 2, isAngular: false },
  { key: 'currentSpeed',     label: 'Current Speed',     unit: 'm/s',     precision: 2, isAngular: false },
  { key: 'currentDirection', label: 'Current Direction', unit: '°',       precision: 1, isAngular: true  },
  { key: 'dissolvedOxygen',  label: 'Dissolved Oxygen',  unit: 'µmol/kg', precision: 1, isAngular: false },
];

/**
 * Circular / Angular Difference for directional quantities (Current Direction, Wind, Wave Heading)
 * Prevents 359° vs 1° wrap-around errors (difference is +2°, not -358°).
 *
 * Formula:
 *   Δθ = ((θ_obs - θ_mod + 540) % 360) - 180
 *
 * @param {number|null|undefined} obsDeg   Observed direction (0 - 360°)
 * @param {number|null|undefined} modelDeg Model direction (0 - 360°)
 * @returns {number|null} Signed angular delta in range [-180, +180] or null if missing
 */
export function calculateAngularDelta(obsDeg, modelDeg) {
  if (obsDeg == null || modelDeg == null) return null;
  const o = Number(obsDeg);
  const m = Number(modelDeg);
  if (isNaN(o) || isNaN(m)) return null;

  const diff = ((o - m + 540) % 360) - 180;
  return parseFloat(diff.toFixed(1));
}

/**
 * Standard Linear Delta:
 *   Δ = Observation - Model
 *
 * @param {number|null|undefined} obsVal
 * @param {number|null|undefined} modelVal
 * @param {number} precision Decimal places to round
 * @returns {number|null} Delta or null if either side is missing
 */
export function calculateStandardDelta(obsVal, modelVal, precision = 2) {
  if (obsVal == null || modelVal == null) return null;
  const o = Number(obsVal);
  const m = Number(modelVal);
  if (isNaN(o) || isNaN(m)) return null;

  return parseFloat((o - m).toFixed(precision));
}

/**
 * Generalized Multi-Variable Delta calculator.
 * Dispatches to standard or circular math based on variable type.
 *
 * @param {string} varKey e.g. 'temperature', 'currentDirection'
 * @param {number|null} obsVal
 * @param {number|null} modelVal
 * @returns {number|null}
 */
export function calculateDelta(varKey, obsVal, modelVal) {
  const normKey = normalizeVariableKey(varKey);
  const meta = SUPPORTED_VARIABLES.find((v) => v.key === normKey);

  if (!meta) {
    return calculateStandardDelta(obsVal, modelVal, 2);
  }

  if (meta.isAngular) {
    return calculateAngularDelta(obsVal, modelVal);
  }

  return calculateStandardDelta(obsVal, modelVal, meta.precision);
}

/**
 * Normalizes variable key variations across APIs
 * e.g. 'current_speed' -> 'currentSpeed', 'thetao' -> 'temperature', 'so' -> 'salinity'
 */
export function normalizeVariableKey(key) {
  if (!key) return 'temperature';
  const k = String(key).toLowerCase().replace(/[-_]/g, '');
  if (k.includes('temp') || k === 'thetao') return 'temperature';
  if (k.includes('sal') || k === 'so') return 'salinity';
  if (k.includes('chl') || k.includes('chlor')) return 'chlorophyll';
  if (k.includes('dir') || k.includes('heading')) return 'currentDirection';
  if (k.includes('speed') || k.includes('velocity') || k === 'current') return 'currentSpeed';
  if (k.includes('oxy') || k.includes('o2') || k.includes('doxy')) return 'dissolvedOxygen';
  return key;
}

/**
 * Formats a numerical value with appropriate precision and unit.
 *
 * @param {string} varKey
 * @param {number|null} value
 * @param {boolean} isDelta If true, adds explicit '+' sign for positive values
 * @returns {string} Formatted string, or "—" if value is null
 */
export function formatVariableValue(varKey, value, isDelta = false) {
  if (value == null || isNaN(value)) return '—';
  const num = Number(value);
  const meta = SUPPORTED_VARIABLES.find((v) => v.key === normalizeVariableKey(varKey));
  const precision = meta ? meta.precision : 2;
  const unit = meta ? meta.unit : '';

  const fixed = num.toFixed(precision);
  const prefix = isDelta && num > 0 ? '+' : '';

  return `${prefix}${fixed} ${unit}`.trim();
}

/**
 * Evaluates the status of a variable comparison row.
 * Returns:
 *   - 'VALID'            : Both observation and model exist
 *   - 'MISSING_OBS'      : Observation missing
 *   - 'MISSING_MODEL'    : Model prediction missing
 *   - 'UNAVAILABLE'      : Both sides missing
 */
export function getComparisonStatus(obsVal, modelVal) {
  const hasObs = obsVal != null && !isNaN(obsVal);
  const hasMod = modelVal != null && !isNaN(modelVal);

  if (hasObs && hasMod) return 'VALID';
  if (hasObs && !hasMod) return 'MISSING_MODEL';
  if (!hasObs && hasMod) return 'MISSING_OBS';
  return 'UNAVAILABLE';
}

/**
 * Evaluates agreement rating based on Delta magnitude.
 */
export function getAgreementRating(varKey, delta) {
  if (delta == null || isNaN(delta)) return { label: 'Data Missing', tone: 'missing' };

  const abs = Math.abs(delta);
  const k = normalizeVariableKey(varKey);

  let thresholdGood = 0.3;
  let thresholdWarning = 0.8;

  if (k === 'salinity') {
    thresholdGood = 0.1;
    thresholdWarning = 0.25;
  } else if (k === 'currentDirection') {
    thresholdGood = 10.0;
    thresholdWarning = 30.0;
  } else if (k === 'currentSpeed') {
    thresholdGood = 0.05;
    thresholdWarning = 0.15;
  } else if (k === 'chlorophyll') {
    thresholdGood = 0.08;
    thresholdWarning = 0.25;
  } else if (k === 'dissolvedOxygen') {
    thresholdGood = 8.0;
    thresholdWarning = 25.0;
  }

  if (abs <= thresholdGood) {
    return { label: 'Optimal Match', tone: 'optimal' };
  }
  if (abs <= thresholdWarning) {
    return { label: 'Moderate Bias', tone: 'warning' };
  }
  return { label: delta > 0 ? 'Positive Anomaly' : 'Negative Anomaly', tone: 'anomaly' };
}

/**
 * Standard NetCDF vertical model grid levels (INCOIS-ROMS / HYCOM / CMEMS standard z-levels)
 */
export const STANDARD_MODEL_DEPTHS = [
  0, 5, 10, 15, 20, 30, 50, 75, 100, 125, 150, 200, 250, 300,
  400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400,
  1500, 1750, 2000, 2500, 3000, 3500, 4000
];

/**
 * Depth Alignment & Provenance Resolver.
 * Aligns targetDepth with observation levels and NetCDF model vertical grid levels.
 *
 * @param {number} targetDepth User-requested depth in metres
 * @param {Array<{depth: number}>|null} profileLevels In-situ vertical profile levels if available
 * @param {number|null} fallbackObsDepth In-situ instrument physical depth
 * @returns {{ targetDepth: number, observationDepth: number, modelDepth: number, matchingMethod: string }}
 */
export function alignDepthProvenance(targetDepth, profileLevels = null, fallbackObsDepth = null) {
  const target = Math.max(0, Math.min(4000, Math.round(Number(targetDepth) || 0)));

  // 1. Model grid alignment (find closest standard NetCDF level)
  let closestModel = STANDARD_MODEL_DEPTHS[0];
  let minModelDiff = Math.abs(target - closestModel);
  for (const lvl of STANDARD_MODEL_DEPTHS) {
    const diff = Math.abs(target - lvl);
    if (diff < minModelDiff) {
      minModelDiff = diff;
      closestModel = lvl;
    }
  }

  // 2. Observation depth alignment
  let obsDepth = target;
  let matchingMethod = 'Nearest Valid';

  if (profileLevels && Array.isArray(profileLevels) && profileLevels.length > 0) {
    const minD = profileLevels[0].depth;
    const maxD = profileLevels[profileLevels.length - 1].depth;

    if (target < minD) {
      obsDepth = minD;
      matchingMethod = 'Nearest Valid';
    } else if (target > maxD) {
      obsDepth = maxD;
      matchingMethod = 'Nearest Valid';
    } else {
      // Check if target matches an exact profile level
      const exactMatch = profileLevels.some((p) => p.depth === target);
      if (exactMatch) {
        obsDepth = target;
        matchingMethod = closestModel === target ? 'Exact Match' : 'Nearest Valid';
      } else {
        obsDepth = target;
        matchingMethod = 'Interpolated';
      }
    }
  } else if (fallbackObsDepth != null) {
    obsDepth = Math.round(Number(fallbackObsDepth));
    if (obsDepth === target && closestModel === target) {
      matchingMethod = 'Exact Match';
    } else {
      matchingMethod = 'Nearest Valid';
    }
  }

  return {
    targetDepth: target,
    observationDepth: obsDepth,
    modelDepth: closestModel,
    matchingMethod,
  };
}

/**
 * calculateRealisticObservedProfile
 * ---------------------------------
 * Generates physically accurate, realistic in-situ observation values
 * across all 6 oceanographic parameters at depth `depthM` for a given instrument.
 *
 * Implements:
 * 1. Mixed layer -> Thermocline -> Intermediate -> Abyssal temperature curve
 * 2. Surface freshwater lens -> Arabian Sea Salinity Max (~150m) -> deep halocline
 * 3. Deep Chlorophyll Maximum (DCM peak at 45-65m) -> Euphotic extinction -> Aphotic zone null
 * 4. Surface wind/Ekman current decay with depth
 * 5. Ekman velocity spiral rotation with depth
 * 6. Atmospheric saturation -> Oxycline -> Oxygen Minimum Zone (OMZ minimum at 300-600m) -> Deep ventilation
 */
export function calculateRealisticObservedProfile(depthM, instrumentType = 'argo', baseObs = {}) {
  const d = Math.max(0, Math.min(4000, Number(depthM) || 0));
  const isGlider = instrumentType === 'glider';
  const isCTD = instrumentType === 'ctd';

  // 1. Temperature (°C)
  let temp;
  if (d <= 50) {
    temp = 28.35 - (d / 50) * 0.45;
  } else if (d <= 200) {
    const f = (d - 50) / 150;
    temp = 27.90 - f * (27.90 - 14.50);
  } else if (d <= 1000) {
    temp = 3.8 + (14.50 - 3.8) * Math.exp(-(d - 200) / 320);
  } else {
    temp = 2.1 + (4.65 - 2.1) * Math.exp(-(d - 1000) / 950);
  }

  if (isGlider) {
    temp += 0.18 * Math.sin(d / 36);
  } else if (isCTD) {
    temp -= 0.05;
  }

  // 2. Salinity (PSU)
  let sal;
  if (d <= 30) {
    sal = 34.30 + (d / 30) * 0.15;
  } else if (d <= 150) {
    const f = (d - 30) / 120;
    sal = 34.45 + f * 0.45; // Subsurface Maximum ~34.90 PSU
  } else if (d <= 800) {
    const f = (d - 150) / 650;
    sal = 34.90 - f * 0.25;
  } else {
    sal = 34.65 + ((d - 800) / 1200) * 0.08;
  }

  if (isGlider) {
    sal += 0.08 * Math.sin(d / 42);
  }

  // 3. Chlorophyll-a (mg/m³) — Photic zone only (d <= 120m)
  let chl;
  if (d <= 25) {
    chl = 0.38 + (d / 25) * 0.16;
  } else if (d <= 75) {
    // DCM peak (~0.82 mg/m³ at 50m)
    chl = 0.54 + 0.32 * Math.exp(-Math.pow(d - 50, 2) / 380);
  } else if (d <= 120) {
    chl = 0.45 * Math.exp(-(d - 75) / 24);
  } else {
    // Aphotic zone: null (strictly missing data rule)
    chl = null;
  }

  // 4. Current Speed (m/s)
  let curSpd;
  if (d <= 30) {
    curSpd = 0.40 - (d / 30) * 0.05;
  } else if (d <= 400) {
    curSpd = 0.35 * Math.exp(-(d - 30) / 180);
  } else {
    curSpd = Math.max(0.03, 0.08 * Math.exp(-(d - 400) / 800));
  }

  // 5. Current Direction (°)
  const curDir = (55.0 + d * 0.082) % 360.0;

  // 6. Dissolved Oxygen (µmol/kg)
  let doxy;
  if (d <= 60) {
    doxy = 195.0 - (d / 60) * 22.0;
  } else if (d <= 180) {
    const f = (d - 60) / 120;
    doxy = 173.0 - f * (173.0 - 58.0);
  } else if (d <= 800) {
    const f = (d - 180) / 620;
    doxy = 58.0 - f * 24.0 + 3.5 * Math.sin(d / 120);
  } else {
    const f = (d - 800) / 1200;
    doxy = 38.0 + Math.min(65.0, f * 60.0);
  }

  return {
    temperature: parseFloat(temp.toFixed(2)),
    salinity: parseFloat(sal.toFixed(2)),
    chlorophyll: chl != null ? parseFloat(chl.toFixed(2)) : null,
    currentSpeed: parseFloat(curSpd.toFixed(2)),
    currentDirection: parseFloat(curDir.toFixed(1)),
    dissolvedOxygen: parseFloat(doxy.toFixed(1)),
  };
}

/**
 * calculateRealisticModelProfile
 * ------------------------------
 * Generates physically accurate, depth-dependent 4D NetCDF ocean numerical model
 * prediction values (ROMS / HYCOM / CMEMS) across all 6 parameters at depth `depthM`.
 */
export function calculateRealisticModelProfile(depthM) {
  const d = Math.max(0, Math.min(4000, Number(depthM) || 0));

  // 1. Model Temperature (°C)
  let temp;
  if (d <= 50) {
    temp = 28.00 - (d / 50) * 0.40;
  } else if (d <= 200) {
    const f = (d - 50) / 150;
    temp = 27.60 - f * (27.60 - 15.20);
  } else if (d <= 1000) {
    temp = 3.65 + (15.20 - 3.65) * Math.exp(-(d - 200) / 330);
  } else {
    temp = 2.05 + (4.50 - 2.05) * Math.exp(-(d - 1000) / 980);
  }

  // 2. Model Salinity (PSU)
  let sal;
  if (d <= 30) {
    sal = 34.25 + (d / 30) * 0.18;
  } else if (d <= 150) {
    const f = (d - 30) / 120;
    sal = 34.43 + f * 0.41;
  } else if (d <= 800) {
    const f = (d - 150) / 650;
    sal = 34.84 - f * 0.22;
  } else {
    sal = 34.62 + ((d - 800) / 1200) * 0.10;
  }

  // 3. Model Chlorophyll-a (mg/m³) — null below 120m
  let chl;
  if (d <= 25) {
    chl = 0.35 + (d / 25) * 0.12;
  } else if (d <= 75) {
    chl = 0.47 + 0.25 * Math.exp(-Math.pow(d - 45, 2) / 420);
  } else if (d <= 120) {
    chl = 0.38 * Math.exp(-(d - 75) / 26);
  } else {
    chl = null;
  }

  // 4. Model Current Speed (m/s)
  let curSpd;
  if (d <= 30) {
    curSpd = 0.42 - (d / 30) * 0.06;
  } else if (d <= 400) {
    curSpd = 0.36 * Math.exp(-(d - 30) / 200);
  } else {
    curSpd = Math.max(0.04, 0.09 * Math.exp(-(d - 400) / 850));
  }

  // 5. Model Current Direction (°)
  const curDir = (44.5 + d * 0.072) % 360.0;

  // 6. Model Dissolved Oxygen (µmol/kg)
  let doxy;
  if (d <= 60) {
    doxy = 196.0 - (d / 60) * 20.0;
  } else if (d <= 180) {
    const f = (d - 60) / 120;
    doxy = 176.0 - f * (176.0 - 68.0);
  } else if (d <= 800) {
    const f = (d - 180) / 620;
    doxy = 68.0 - f * 22.0;
  } else {
    const f = (d - 800) / 1200;
    doxy = 46.0 + Math.min(55.0, f * 50.0);
  }

  return {
    temperature: parseFloat(temp.toFixed(2)),
    salinity: parseFloat(sal.toFixed(2)),
    chlorophyll: chl != null ? parseFloat(chl.toFixed(2)) : null,
    currentSpeed: parseFloat(curSpd.toFixed(2)),
    currentDirection: parseFloat(curDir.toFixed(1)),
    dissolvedOxygen: parseFloat(doxy.toFixed(1)),
  };
}

