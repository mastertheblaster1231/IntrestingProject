/**
 * Ocean Data Service - Procedural Generator & API Ready Adapter
 * =============================================================
 * Provides physical oceanographic data for Argo Profiling Floats & INCOIS Ocean Observation Buoys.
 * 
 * DESIGNED FOR EASY API EXTENSION:
 * - Switch from procedural fake data to a live REST / GraphQL / ERDDAP API
 *   by implementing or activating `ApiArgoProvider`.
 */

export class ArgoDataProvider {
  /**
   * @param {string} floatId
   * @returns {Promise<Object>} Float complete profile and metadata
   */
  async getFloatData(floatId) {
    throw new Error("Method getFloatData() must be implemented");
  }
}

/**
 * ProceduralArgoProvider
 * Deterministically generates physically plausible oceanographic data:
 * - Thermocline profiles (exponential temperature drop across mixed layer into deep abyss)
 * - Halocline profiles (salinity baseline with subsurface maximum)
 * - Sensor measurements (CTD pressure, conductivity, battery, telemetry)
 * - Trajectory drift vectors
 */
export class ProceduralArgoProvider extends ArgoDataProvider {
  constructor(seedOffset = 42) {
    super();
    this.seedOffset = seedOffset;
  }

  // Deterministic pseudo-random number based on string seed
  _pseudoRandom(seedStr) {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = (hash << 5) - hash + seedStr.charCodeAt(i);
      hash |= 0;
    }
    const x = Math.sin(hash + this.seedOffset) * 10000;
    return x - Math.floor(x);
  }

  /**
   * Generates procedural Argo float data matching the requested station/float ID
   * @param {Object|string} stationInfo - ID or station object { id, code, lat, lon, sea, type }
   */
  /**
   * Generates procedural Argo float data matching the requested station/float ID
   * @param {Object|string} stationInfo - ID or station object { id, code, lat, lon, sea, type }
   * @param {Object} [temporalFilter] - Optional temporal constraints { date: "YYYY-MM-DD", time: "HH:mm", year, cycle }
   */
  async getFloatData(stationInfo, temporalFilter = {}) {
    const id = typeof stationInfo === "string" ? stationInfo : stationInfo.id;
    const baseInfo = typeof stationInfo === "object" ? stationInfo : { id };
    
    // Deterministic WMO ID (e.g. 2902345, 2902346...)
    const wmoId = baseInfo.wmoId || (2902340 + (this._getNumericIndex(id) % 900));
    
    const lat = baseInfo.lat !== undefined ? baseInfo.lat : 12.35;
    const lon = baseInfo.lon !== undefined ? baseInfo.lon : 78.62;
    const sea = baseInfo.sea || "Indian Ocean (Equatorial Basin)";
    const stationCode = baseInfo.code || `AD${id.replace(/\D/g, "") || "07"}`;
    const buoyType = baseInfo.type || "APEX Profiling Float";

    // Parse temporal parameters (Date, Year, Time)
    const isLatest = !temporalFilter.date;
    const reqDate = temporalFilter.date || new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const reqTime = temporalFilter.time || "12:00"; // HH:mm
    const parsedDate = new Date(`${reqDate}T${reqTime}:00Z`);
    const validDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

    const targetMonth = validDate.getUTCMonth(); // 0 to 11
    const targetYear = validDate.getUTCFullYear();
    const targetHour = validDate.getUTCHours();
    const day = validDate.getUTCDate();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthStr = monthNames[targetMonth];
    const hoursStr = String(targetHour).padStart(2, "0");
    const minsStr = String(validDate.getUTCMinutes()).padStart(2, "0");
    const formattedObservation = `${day} ${monthStr} ${targetYear}, ${hoursStr}:${minsStr} UTC`;

    // 1. Seasonal Oceanographic Regime Detection for Indian Ocean / Arabian Sea / Bay of Bengal:
    let seasonalTempAnomaly = 0;
    let seasonalSalAnomaly = 0;
    let seasonalChlMultiplier = 1.0;
    let seasonalCurrentSpeed = 0.42;
    let seasonalCurrentDir = "NE";
    let regimeName = "Post-Monsoon Transition";

    if (targetMonth >= 5 && targetMonth <= 8) {
      // SW Monsoon (Jun-Sep): Heavy monsoonal rain freshening + strong coastal upwelling & bloom
      regimeName = "SW Monsoon Upwelling & Rain Freshening";
      seasonalTempAnomaly = -1.2;
      seasonalSalAnomaly = -1.5; // Fresh surface lens from river discharge & rain
      seasonalChlMultiplier = 2.4; // High phytoplankton bloom
      seasonalCurrentSpeed = 0.65;
      seasonalCurrentDir = "ENE";
    } else if (targetMonth >= 2 && targetMonth <= 4) {
      // Pre-Monsoon (Mar-May): Intense solar heating peak + high evaporation
      regimeName = "Pre-Monsoon Solar Thermal Peak";
      seasonalTempAnomaly = +1.7;
      seasonalSalAnomaly = +0.4;
      seasonalChlMultiplier = 0.65;
      seasonalCurrentSpeed = 0.35;
      seasonalCurrentDir = "E";
    } else if (targetMonth === 10 || targetMonth === 11 || targetMonth === 0 || targetMonth === 1) {
      // Winter Cooling (Nov-Feb): Northern cool winds & convection, reversed currents
      regimeName = "NE Monsoon & Winter Cooling";
      seasonalTempAnomaly = -1.8;
      seasonalSalAnomaly = +0.6;
      seasonalChlMultiplier = 1.15;
      seasonalCurrentSpeed = 0.38;
      seasonalCurrentDir = "WSW";
    } else {
      // October: Post-Monsoon transition
      regimeName = "Post-Monsoon Calm Transition";
      seasonalTempAnomaly = +0.2;
      seasonalSalAnomaly = -0.2;
      seasonalChlMultiplier = 1.1;
      seasonalCurrentSpeed = 0.42;
      seasonalCurrentDir = "NE";
    }

    // Diurnal solar skin heating anomaly (peaks 12:00-14:00 UTC)
    const diurnalTemp = 0.35 * Math.sin(((targetHour - 6) / 24) * 2 * Math.PI);

    // Surface temperature & salinity variation based on latitude & basin
    const randTemp = this._pseudoRandom(`${id}_temp`);
    const randSal = this._pseudoRandom(`${id}_sal`);
    const isA7 = id === "A7" || baseInfo.code === "CB01" || wmoId === 2902351;

    // Apply baseline + seasonal + diurnal variations
    const baseTemp = isA7 ? 28.3 : (27.5 + randTemp * 2.3);
    const baseSal = isA7 ? 34.3 : (34.2 + randSal * 1.3);
    const surfaceTemp = parseFloat(Math.max(22.0, Math.min(32.5, baseTemp + seasonalTempAnomaly + diurnalTemp)).toFixed(1));
    const surfaceSalinity = parseFloat(Math.max(30.0, Math.min(37.0, baseSal + seasonalSalAnomaly)).toFixed(1));
    const surfaceOxygen = Math.round(Math.max(145, Math.min(235, (isA7 ? 198 : (190 + randTemp * 22)) - seasonalTempAnomaly * 6)));
    const surfaceChlorophyll = parseFloat(Math.max(0.05, Math.min(2.8, (isA7 ? 0.42 : (0.35 + randSal * 0.28)) * seasonalChlMultiplier)).toFixed(2));
    const currentSpeed = parseFloat((seasonalCurrentSpeed + (randTemp - 0.5) * 0.08).toFixed(2));
    const currentDir = seasonalCurrentDir;

    // 2. Dynamic Argo Cycle Calculation:
    // Real Argo floats cycle every ~10 days.
    // Baseline reference date: 2024-09-10T12:00:00Z -> Cycle #147
    const baselineMs = new Date("2024-09-10T12:00:00Z").getTime();
    const diffDays = (validDate.getTime() - baselineMs) / (1000 * 86400);
    const cycleOffset = Math.round(diffDays / 10);
    const baseCycle = isA7 ? 147 : (100 + Math.floor(this._pseudoRandom(`${id}_cycle`) * 80));
    const cycleNum = Math.max(1, baseCycle + cycleOffset);
    const lastProfile = isLatest ? "18 min ago" : formattedObservation;
    const batteryPct = isA7 ? 82 : (78 + Math.floor(randSal * 18));

    // Sea basin and sub-region naming
    const seaPrimary = isA7 ? "Andaman Sea" : (baseInfo.sea ? baseInfo.sea.split("(")[0].trim() : "Indian Ocean");
    const seaSecondary = isA7 ? "Port Blair" : (baseInfo.sea && baseInfo.sea.includes("(") ? baseInfo.sea.split("(")[1].replace(")", "").trim() : "Central Basin");

    // Generate physical vertical profile (0 to 2000m)
    const profileLevels = [
      0, 50, 100, 200, 300, 500, 750, 1000, 1250, 1500, 1750, 2000
    ];

    const verticalProfile = profileLevels.map((depth) => {
      // 1. Temperature:
      let temp;
      if (depth <= 50) {
        temp = surfaceTemp - (depth / 50) * 0.35;
      } else if (depth <= 1000) {
        const factor = Math.exp(-depth / 320);
        temp = 3.5 + (surfaceTemp - 3.5) * factor;
      } else {
        const factor = Math.exp(-(depth - 1000) / 800);
        temp = 2.1 + (4.8 - 2.1) * factor * 0.65;
      }
      temp = parseFloat(temp.toFixed(2));

      // 2. Salinity (halocline with subsurface maximum around 150m):
      let sal;
      if (depth <= 150) {
        sal = surfaceSalinity + (depth / 150) * 0.55;
      } else if (depth <= 800) {
        sal = (surfaceSalinity + 0.55) - ((depth - 150) / 650) * 0.35;
      } else {
        sal = 34.75 + ((depth - 800) / 1200) * 0.15;
      }
      sal = parseFloat(sal.toFixed(2));

      // 3. Dissolved Oxygen:
      let o2;
      if (depth <= 60) {
        o2 = surfaceOxygen;
      } else if (depth <= 500) {
        const f = (depth - 60) / 440;
        o2 = Math.round(surfaceOxygen - f * (surfaceOxygen - 56));
      } else if (depth <= 1000) {
        o2 = Math.round(56 + ((depth - 500) / 500) * 32);
      } else {
        o2 = Math.round(88 + ((depth - 1000) / 1000) * 50);
      }

      // 4. Chlorophyll-a:
      let chl;
      if (depth <= 40) {
        chl = surfaceChlorophyll;
      } else if (depth <= 80) {
        chl = parseFloat((surfaceChlorophyll * 1.25 * (1 - (depth - 40) / 55)).toFixed(2));
      } else if (depth <= 150) {
        chl = parseFloat((surfaceChlorophyll * 0.2 * (1 - (depth - 80) / 70)).toFixed(2));
      } else {
        chl = 0.00;
      }

      const pressureDbar = Math.round(depth * 1.008);
      const densitySigma = parseFloat((22.4 + (1 - temp / 30) * 3.8 + (sal - 34.0) * 0.78).toFixed(2));

      return {
        depthMeters: depth,
        temperatureC: temp,
        salinityPSU: sal,
        dissolvedOxygenUmolKg: o2,
        chlorophyllMgM3: chl,
        pressureDbar: pressureDbar,
        densitySigmaTheta: densitySigma
      };
    });

    // Formatting coordinates: e.g. "11.6000° N, 92.5000° E"
    const latStr = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}`;
    const lonStr = `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;
    const locationFormatted = `${latStr}, ${lonStr}`;

    // Past 5 surfacing cycle GPS fixes synchronized with the queried date
    const trajectoryHistory = [
      {
        cycle: cycleNum,
        cycleNumber: cycleNum,
        lat: lat,
        lon: lon,
        date: isLatest ? "Today, 18 min ago" : formattedObservation,
        temp: surfaceTemp,
        tempC: surfaceTemp,
        speed: currentSpeed,
        speedMs: currentSpeed,
        direction: currentDir
      },
      {
        cycle: Math.max(1, cycleNum - 1),
        cycleNumber: Math.max(1, cycleNum - 1),
        lat: parseFloat((lat - 0.08).toFixed(4)),
        lon: parseFloat((lon - 0.09).toFixed(4)),
        date: this._formatOffsetDate(validDate, -10),
        temp: parseFloat((surfaceTemp - 0.2).toFixed(1)),
        tempC: parseFloat((surfaceTemp - 0.2).toFixed(1)),
        speed: parseFloat((currentSpeed * 0.95).toFixed(2)),
        speedMs: parseFloat((currentSpeed * 0.95).toFixed(2)),
        direction: currentDir
      },
      {
        cycle: Math.max(1, cycleNum - 2),
        cycleNumber: Math.max(1, cycleNum - 2),
        lat: parseFloat((lat - 0.15).toFixed(4)),
        lon: parseFloat((lon - 0.17).toFixed(4)),
        date: this._formatOffsetDate(validDate, -20),
        temp: parseFloat((surfaceTemp + 0.1).toFixed(1)),
        tempC: parseFloat((surfaceTemp + 0.1).toFixed(1)),
        speed: parseFloat((currentSpeed * 1.05).toFixed(2)),
        speedMs: parseFloat((currentSpeed * 1.05).toFixed(2)),
        direction: currentDir
      },
      {
        cycle: Math.max(1, cycleNum - 3),
        cycleNumber: Math.max(1, cycleNum - 3),
        lat: parseFloat((lat - 0.24).toFixed(4)),
        lon: parseFloat((lon - 0.26).toFixed(4)),
        date: this._formatOffsetDate(validDate, -30),
        temp: parseFloat((surfaceTemp - 0.3).toFixed(1)),
        tempC: parseFloat((surfaceTemp - 0.3).toFixed(1)),
        speed: parseFloat((currentSpeed * 0.92).toFixed(2)),
        speedMs: parseFloat((currentSpeed * 0.92).toFixed(2)),
        direction: currentDir
      },
      {
        cycle: Math.max(1, cycleNum - 4),
        cycleNumber: Math.max(1, cycleNum - 4),
        lat: parseFloat((lat - 0.31).toFixed(4)),
        lon: parseFloat((lon - 0.34).toFixed(4)),
        date: this._formatOffsetDate(validDate, -40),
        temp: parseFloat((surfaceTemp).toFixed(1)),
        tempC: parseFloat((surfaceTemp).toFixed(1)),
        speed: parseFloat((currentSpeed * 0.98).toFixed(2)),
        speedMs: parseFloat((currentSpeed * 0.98).toFixed(2)),
        direction: currentDir
      }
    ];

    const lastObservationFormatted = formattedObservation;

    return {
      success: true,
      source: "procedural-mock",
      floatId: String(wmoId),
      stationCode: stationCode,
      stationId: id,
      buoyName: `Argo Float #${wmoId}`,
      platformType: buoyType,
      status: "Active",
      statusClass: "active",
      locationFormatted: locationFormatted,
      locationPrimary: seaPrimary,
      locationSecondary: seaSecondary,
      coordinates: {
        lat: lat,
        lon: lon,
        seaBasin: sea,
        seaPrimary: seaPrimary,
        seaSecondary: seaSecondary
      },
      lastObservation: lastObservationFormatted,
      maxDepthMeters: 2000,
      measurements: "Temperature, Salinity, O2, Chl-a",
      // Scientific core parameters
      scientificData: {
        surfaceTempC: surfaceTemp,
        surfaceSalinityPSU: surfaceSalinity,
        dissolvedOxygenUmolKg: surfaceOxygen,
        chlorophyllMgM3: surfaceChlorophyll,
        currentSpeedMs: currentSpeed,
        currentDirection: currentDir,
        currentDisplay: `${currentSpeed} m/s → ${currentDir}`,
        dataQuality: "GOOD",
        qcFlag: 1
      },
      // Mission details
      mission: {
        cycleNumber: cycleNum,
        cycleDisplay: `#${cycleNum}`,
        lastProfileRelative: lastProfile,
        batteryPercent: batteryPct,
        batteryDisplay: `${batteryPct}%`,
        batteryVoltage: "14.1 V",
        telemetryCarrier: "Iridium SBD - 100% OK"
      },
      latestObservation: {
        temperatureC: surfaceTemp,
        salinityPSU: surfaceSalinity,
        dissolvedOxygenUmolKg: surfaceOxygen,
        chlorophyllMgM3: surfaceChlorophyll,
        depthMeters: 0,
        recordedAt: lastObservationFormatted
      },
      verticalProfile: verticalProfile,
      trajectoryHistory: trajectoryHistory,
      temporalInfo: {
        queriedDate: reqDate,
        queriedTime: reqTime,
        queriedTimestamp: validDate.toISOString(),
        year: targetYear,
        month: targetMonth + 1,
        day: day,
        regime: regimeName,
        cycleEstimated: cycleNum,
        isLatest: isLatest
      },
      drift: {
        speedKnots: (currentSpeed * 1.94384).toFixed(2),
        speedMs: currentSpeed,
        direction: currentDir,
        bearingDegrees: 48,
        estimatedDistance24hKm: (currentSpeed * 3.6 * 24).toFixed(1)
      },
      apiMetadata: {
        dataSource: "INCOIS / Argo GDAC Ocean Data Network",
        apiEndpointTemplate: `/api/v1/argo/floats/${wmoId}/cycles/${cycleNum}`,
        wmoPlatformCode: String(wmoId),
        sensorPayload: "Sea-Bird SBE 41CP CTD + SBE 63 Dissolved Oxygen + WET Labs ECO Chl-a",
        qcFlag: "1 (Good Data)",
        retrievalTimestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Evaluates physical ocean properties at ANY arbitrary depth (0 to 4000m)
   * Smoothly interpolates temperature, salinity, oxygen, and chlorophyll
   */
  interpolateAtDepth(floatData, depthMeters) {
    const d = Math.max(0, Math.min(4000, depthMeters));
    const base = floatData.scientificData || {};
    const surfaceT = base.surfaceTempC !== undefined ? base.surfaceTempC : 28.3;
    const surfaceS = base.surfaceSalinityPSU !== undefined ? base.surfaceSalinityPSU : 34.3;
    const surfaceO = base.dissolvedOxygenUmolKg !== undefined ? base.dissolvedOxygenUmolKg : 198;
    const surfaceC = base.chlorophyllMgM3 !== undefined ? base.chlorophyllMgM3 : 0.42;

    // Physical temperature drop
    let temp;
    if (d <= 50) {
      temp = surfaceT - (d / 50) * 0.3;
    } else if (d <= 1000) {
      const factor = Math.exp(-d / 320);
      temp = 3.5 + (surfaceT - 3.5) * factor;
    } else {
      const factor = Math.exp(-(d - 1000) / 900);
      temp = 1.8 + (3.5 - 1.8) * factor;
    }

    // Salinity curve
    let sal;
    if (d <= 150) {
      sal = surfaceS + (d / 150) * 0.55;
    } else if (d <= 800) {
      sal = (surfaceS + 0.55) - ((d - 150) / 650) * 0.35;
    } else {
      sal = 34.75 + ((d - 800) / 3200) * 0.25;
    }

    // Oxygen curve (OMZ minimum ~56 at 500m)
    let o2;
    if (d <= 60) {
      o2 = surfaceO;
    } else if (d <= 500) {
      const f = (d - 60) / 440;
      o2 = Math.round(surfaceO - f * (surfaceO - 56));
    } else if (d <= 1000) {
      o2 = Math.round(56 + ((d - 500) / 500) * 32);
    } else {
      o2 = Math.min(150, Math.round(88 + ((d - 1000) / 3000) * 60));
    }

    // Chlorophyll photic zone decay
    let chl;
    if (d <= 40) {
      chl = surfaceC;
    } else if (d <= 80) {
      chl = Math.max(0, surfaceC * 1.2 * (1 - (d - 40) / 55));
    } else if (d <= 150) {
      chl = Math.max(0, surfaceC * 0.2 * (1 - (d - 80) / 70));
    } else {
      chl = 0.00;
    }

    return {
      depthMeters: d,
      temperatureC: parseFloat(temp.toFixed(1)),
      salinityPSU: parseFloat(sal.toFixed(1)),
      dissolvedOxygenUmolKg: o2,
      chlorophyllMgM3: parseFloat(chl.toFixed(2)),
      pressureDbar: Math.round(d * 1.008),
      densitySigmaTheta: parseFloat((22.4 + (1 - temp / 30) * 3.8 + (sal - 34.0) * 0.78).toFixed(2))
    };
  }

  _formatOffsetDate(baseDate, offsetDays) {
    const d = new Date(baseDate.getTime() + offsetDays * 86400000);
    const day = d.getUTCDate();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[d.getUTCMonth()];
    const year = d.getUTCFullYear();
    const hours = String(d.getUTCHours()).padStart(2, "0");
    const mins = String(d.getUTCMinutes()).padStart(2, "0");
    return `${day} ${month} ${year}, ${hours}:${mins} UTC`;
  }

  _getNumericIndex(id) {
    const num = parseInt(id.replace(/\D/g, ""), 10);
    return isNaN(num) ? 5 : num;
  }
}

/**
 * ApiArgoProvider
 * Real API connector implementation ready for future live deployment.
 * Supports standard REST endpoints or INCOIS / Argo GDAC gateways.
 */
export class ApiArgoProvider extends ArgoDataProvider {
  constructor(apiBaseUrl = "https://incois.gov.in/api/argo", apiKey = null) {
    super();
    this.apiBaseUrl = apiBaseUrl;
    this.apiKey = apiKey;
    this.cache = new Map();
  }

  async getFloatData(stationInfo, temporalFilter = {}) {
    const id = typeof stationInfo === "string" ? stationInfo : (stationInfo.wmoId || stationInfo.code || stationInfo.id);
    const date = temporalFilter.date || "";
    const time = temporalFilter.time || "";
    const cacheKey = `${id}_${date}_${time}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const headers = { "Content-Type": "application/json" };
      if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;

      const queryParams = new URLSearchParams();
      if (date) queryParams.set("date", date);
      if (time) queryParams.set("time", time);
      if (temporalFilter.year) queryParams.set("year", temporalFilter.year);
      if (temporalFilter.cycle) queryParams.set("cycle", temporalFilter.cycle);
      const queryStr = queryParams.toString() ? `?${queryParams.toString()}` : "/latest";

      const response = await fetch(`${this.apiBaseUrl}/floats/${encodeURIComponent(id)}${queryStr}`, {
        method: "GET",
        headers
      });

      if (!response.ok) {
        throw new Error(`API responded with HTTP ${response.status}`);
      }

      const data = await response.json();
      this.cache.set(cacheKey, data);
      return data;
    } catch (err) {
      console.warn(`[ApiArgoProvider] Live API fetch failed for float ${id}, falling back to procedural mock:`, err);
      // Graceful fallback to procedural generator with temporal filter
      const fallbackProvider = new ProceduralArgoProvider();
      return await fallbackProvider.getFloatData(stationInfo, temporalFilter);
    }
  }
}

// ============================================================================
// 📖 SCIENTIFIC PARAMETER GLOSSARY & METRIC DEFINITIONS
// Reusable dictionary for UI explanations, tooltips, and dynamic API overrides
// ============================================================================
export const PARAMETER_GLOSSARY = {
  temperature: {
    key: "temperature",
    name: "Sea Water Temperature",
    symbol: "🌡",
    unit: "°C (Celsius)",
    sensor: "SBE 41CP Thermistor",
    shortDesc: "Thermal heat stored in ocean water layers.",
    whatItMeans: "Water temperature reflects atmospheric solar heating at the surface and ocean heat content. As you descend below the sunlit mixed layer (~50m), the permanent thermocline causes temperature to plunge exponentially from tropical warm water (~28°C) down to near-freezing deep water (~2.0°C) in the abyss.",
    significance: "Crucial indicator of global climate change, marine heatwaves, tropical cyclone fueling, and thermohaline ocean overturning.",
    normalRange: "1.5°C – 31.0°C"
  },
  salinity: {
    key: "salinity",
    name: "Practical Salinity",
    symbol: "💧",
    unit: "PSU (Practical Salinity Units)",
    sensor: "SBE 41CP Conductivity Cell",
    shortDesc: "Concentration of dissolved mineral salts in seawater.",
    whatItMeans: "Practical Salinity measures how salty the water is, computed from electrical conductivity and temperature. 34.3 PSU means approximately 34.3 grams of dissolved mineral salts per kilogram of seawater. Surface salinity fluctuates with heavy monsoon rains and river discharge, while subsurface salinity reaches a maximum around 150m.",
    significance: "Together with temperature, salinity dictates seawater density. Denser water sinks, driving the global oceanic conveyor belt.",
    normalRange: "32.0 – 36.5 PSU"
  },
  depth: {
    key: "depth",
    name: "Hydrostatic Profiling Depth",
    symbol: "📏",
    unit: "m / dbar (Meters / Decibars of pressure)",
    sensor: "Piezoresistive Pressure Transducer",
    shortDesc: "Vertical distance below sea level computed via water column pressure.",
    whatItMeans: "Argo floats use an internal hydraulic bladder to cycle through the water column: drifting at a 1000m 'parking depth' for 9 days, diving to 2000m, and ascending while continuously sampling CTD data before surfacing to transmit telemetry.",
    significance: "Enables 3-dimensional mapping of ocean interior properties rather than just satellite surface scans.",
    normalRange: "0 – 2000m (Standard Argo) / 0 – 6000m (Deep Argo)"
  },
  oxygen: {
    key: "oxygen",
    name: "Dissolved Oxygen (DO)",
    symbol: "🫧",
    unit: "μmol/kg (Micromoles per kilogram of seawater)",
    sensor: "Sea-Bird SBE 63 Optical O2 Sensor",
    shortDesc: "Amount of free molecular oxygen (O₂) gas dissolved in water.",
    whatItMeans: "Dissolved Oxygen is the lifeblood of marine ecosystems. Surface waters are rich in oxygen (~198 μmol/kg) from wave agitation and phytoplankton photosynthesis. Between 200m and 800m, intense bacterial consumption of sinking organic matter creates an Oxygen Minimum Zone (OMZ, ~56 μmol/kg), before deep currents re-oxygenate the abyss.",
    significance: "Tracking marine hypoxia, ocean deoxygenation, and habitat suitability for fish and pelagic species.",
    normalRange: "20 – 240 μmol/kg"
  },
  chlorophyll: {
    key: "chlorophyll",
    name: "Chlorophyll-a Biomass",
    symbol: "🌿",
    unit: "mg/m³ (Milligrams per cubic meter)",
    sensor: "WET Labs ECO Optical Fluorometer",
    shortDesc: "Green photosynthetic pigment inside marine microalgae & phytoplankton.",
    whatItMeans: "Chlorophyll-a serves as a direct proxy for microscopic plant life (phytoplankton) floating in the ocean. Because phytoplankton require sunlight to produce energy, chlorophyll peaks in the photic zone (0–80m) and drops strictly to 0.00 mg/m³ in the dark twilight and midnight zones.",
    significance: "Base of the entire marine food web; critical for carbon sequestration and global oxygen production.",
    normalRange: "0.01 – 2.50 mg/m³ (Photic Zone)"
  },
  current: {
    key: "current",
    name: "Lagrangian Ocean Drift Velocity",
    symbol: "🌊",
    unit: "m/s & Compass Heading (e.g. 0.42 m/s → NE)",
    sensor: "Surface GNSS / Satellite Fix Telemetry",
    shortDesc: "Horizontal speed and directional heading of moving water mass.",
    whatItMeans: "Derived from the float's surface GPS fixes combined with its deep subsurface parking drift vector. Indicates the velocity of major ocean currents such as the North Equatorial Current or Andaman coastal gyres.",
    significance: "Transports heat, nutrients, plankton larvae, and maritime debris across international ocean basins.",
    normalRange: "0.05 – 1.80 m/s"
  },
  quality: {
    key: "quality",
    name: "Argo Quality Control (QC) Flag",
    symbol: "📊",
    unit: "WMO Flagging Standard",
    sensor: "Automated Real-Time QC + Delayed-Mode DMQC",
    shortDesc: "Scientific data integrity and sensor calibration confidence level.",
    whatItMeans: "Every Argo observation passes stringent tests: range checks, spike tests, gradient tests, and density inversion checks. 'GOOD' (Flag 1) certifies that all CTD sensors are within certified manufacturer tolerances with zero corrupted telemetry packets.",
    significance: "Ensures international oceanographers and climate models receive pristine scientific data.",
    normalRange: "Flag 1 (Good), Flag 2 (Probably Good)"
  },
  model_validation: {
    key: "model_validation",
    name: "Model vs. Observation Data Assimilation",
    symbol: "🤖",
    unit: "Observation - Model Residual (O - B)",
    sensor: "INCOIS-ROMS 1/12° & HYCOM Numerical Ocean Circulation Models",
    shortDesc: "Real-time comparison metric validating operational ocean forecast models against in-situ CTD observations.",
    whatItMeans: "Quantifies the innovation residual (Observed value minus Model forecasted value). A near-zero residual confirms that numerical hydrographic equations accurately simulate thermoclines, boundary currents, and salinity fronts.",
    significance: "Crucial for marine navigation safety, tropical cyclone heat potential predictions, and Indian Ocean climate modeling.",
    normalRange: "ΔT within ±0.5°C, ΔS within ±0.15 PSU"
  },
  delta_temp: {
    key: "delta_temp",
    name: "Temperature Forecast Residual (ΔT)",
    symbol: "🌡️",
    unit: "°C (T_obs - T_model)",
    sensor: "Sea-Bird SBE 41CP vs Operational Forecast",
    shortDesc: "Difference between in-situ measured temperature and circulation model prediction.",
    whatItMeans: "Positive ΔT indicates the ocean is warmer than predicted (potential heat wave or thermocline shoaling); negative indicates cooler conditions.",
    significance: "Directly validates tropical cyclone heat potential forecasts.",
    normalRange: "-0.50°C to +0.50°C (Accurate)"
  },
  delta_sal: {
    key: "delta_sal",
    name: "Salinity Forecast Residual (ΔS)",
    symbol: "💧",
    unit: "PSU (S_obs - S_model)",
    sensor: "Inductive Conductivity Cell vs Model Forecast",
    shortDesc: "Difference between in-situ practical salinity and ocean circulation model prediction.",
    whatItMeans: "Positive ΔS reveals higher salinity (evaporation / saline intrusion); negative reveals river runoff freshening or precipitation biases in the atmospheric forcing.",
    significance: "Calibrates halosteric sea level rise and monsoon freshwater plume dispersal.",
    normalRange: "-0.20 to +0.20 PSU (High Fidelity)"
  }
};

/**
 * OceanDataService
 * Central singleton orchestrating data delivery to UI components
 */
class OceanDataServiceManager {
  constructor() {
    this.proceduralProvider = new ProceduralArgoProvider();
    this.apiProvider = null;
    this.activeSource = "procedural"; // 'procedural' | 'api'
    this.glossary = { ...PARAMETER_GLOSSARY };
  }

  /**
   * Configure or switch data provider
   * @param {'procedural'|'api'} sourceMode
   * @param {Object} [config]
   */
  setProvider(sourceMode, config = {}) {
    this.activeSource = sourceMode;
    if (sourceMode === "api") {
      this.apiProvider = new ApiArgoProvider(config.baseUrl, config.apiKey);
    }
  }

  /**
   * Retrieves float and station details with optional temporal query
   * @param {Object|string} stationOrId
   * @param {Object} [temporalFilter] - { date: "YYYY-MM-DD", time: "HH:mm", year, cycle }
   */
  async getFloatDetails(stationOrId, temporalFilter = {}) {
    let data;
    if (this.activeSource === "api" && this.apiProvider) {
      data = await this.apiProvider.getFloatData(stationOrId, temporalFilter);
    } else {
      data = await this.proceduralProvider.getFloatData(stationOrId, temporalFilter);
    }
    // Attach scientific parameter glossary for dynamic UI tooltips
    if (!data.parameterGlossary) {
      data.parameterGlossary = this.glossary;
    }
    return data;
  }

  /**
   * Quick convenience query by date and time
   * @param {Object|string} stationOrId
   * @param {string} dateStr - e.g. "2024-07-22"
   * @param {string} [timeStr] - e.g. "08:30"
   */
  async queryByDateTime(stationOrId, dateStr, timeStr = "12:00") {
    return await this.getFloatDetails(stationOrId, { date: dateStr, time: timeStr });
  }

  interpolateAtDepth(floatData, depthMeters) {
    return this.proceduralProvider.interpolateAtDepth(floatData, depthMeters);
  }

  /**
   * Returns scientific definition for any metric key
   * @param {string} key
   * @param {Object} [customFloatData]
   */
  getGlossary(key, customFloatData = null) {
    if (customFloatData && customFloatData.parameterGlossary && customFloatData.parameterGlossary[key]) {
      return customFloatData.parameterGlossary[key];
    }
    return this.glossary[key] || {
      key,
      name: key,
      symbol: "ℹ️",
      unit: "N/A",
      sensor: "CTD Sensor",
      shortDesc: "Oceanographic measurement parameter.",
      whatItMeans: "Scientific observation recorded by ocean profiling instrumentation.",
      significance: "Used for marine physical oceanography analysis.",
      normalRange: "Standard calibrated range"
    };
  }
}

export const oceanDataService = new OceanDataServiceManager();

// ============================================================================
// ⚓ ARGO & OON STATIONS REGISTRY (10 Observation Stations matching Map)
// ============================================================================
export const ARGO_STATIONS = [
  {
    id: "AD07",
    code: "AD07",
    name: "AD07 - Arabian Sea Deep",
    wmoId: 2300007,
    lat: 15.00,
    lon: 69.00,
    sea: "Arabian Sea (West of Goa)",
    type: "OMNI Deep Sea Meteorological Buoy",
    markerType: "buoy-yellow",
    beaconColor: 0xffea00,
  },
  {
    id: "AD08",
    code: "AD08",
    name: "AD08 - Central Arabian Sea",
    wmoId: 2300008,
    lat: 12.00,
    lon: 68.50,
    sea: "Arabian Sea (Central Deep Basin)",
    type: "OMNI Meteorological Moored Buoy",
    markerType: "buoy-yellow",
    beaconColor: 0xffea00,
  },
  {
    id: "CB02",
    code: "CB02",
    name: "CB02 - Lakshadweep North",
    wmoId: 2300022,
    lat: 10.88,
    lon: 72.20,
    sea: "Lakshadweep (Agatti / Bangaram)",
    type: "Coastal Observation & Coral Reef Buoy",
    markerType: "pin-red",
    beaconColor: 0xff3b30,
  },
  {
    id: "CALVAL",
    code: "CALVAL",
    name: "CALVAL - Kavaratti Site",
    wmoId: 2300023,
    lat: 10.35,
    lon: 72.28,
    sea: "Lakshadweep (Kavaratti Cal/Val)",
    type: "Satellite Radiometry Cal/Val Site",
    markerType: "pin-red",
    beaconColor: 0xff3b30,
  },
  {
    id: "AD10",
    code: "AD10",
    name: "AD10 - South Lakshadweep",
    wmoId: 2300010,
    lat: 9.80,
    lon: 72.75,
    sea: "Lakshadweep (Off Suheli / Kalpeni)",
    type: "OMNI Deep Sea Moored Buoy",
    markerType: "buoy-yellow",
    beaconColor: 0xffea00,
  },
  {
    id: "AD09",
    code: "AD09",
    name: "AD09 - Minicoy Channel",
    wmoId: 2300009,
    lat: 8.25,
    lon: 73.25,
    sea: "Eight Degree Channel / Minicoy",
    type: "Deep Ocean Meteorological Buoy",
    markerType: "buoy-yellow",
    beaconColor: 0xffea00,
  },
  {
    id: "CB06",
    code: "CB06",
    name: "CB06 - Chennai Offshore",
    wmoId: 2300026,
    lat: 13.10,
    lon: 80.30,
    sea: "Bay of Bengal (Chennai Coast)",
    type: "Coastal Moored Observation Station",
    markerType: "pin-grey",
    beaconColor: 0xb0bec5,
  },
  {
    id: "BD13",
    code: "BD13",
    name: "BD13 - Central Bay of Bengal",
    wmoId: 2300013,
    lat: 14.00,
    lon: 87.00,
    sea: "Bay of Bengal (Central Basin)",
    type: "OMNI Deep Sea Meteorological Buoy",
    markerType: "buoy-yellow",
    beaconColor: 0xffea00,
  },
  {
    id: "CB01",
    code: "CB01",
    name: "CB01 - Port Blair / Andaman",
    wmoId: 2300021,
    lat: 11.60,
    lon: 92.50,
    sea: "Andaman Sea (Port Blair Coast)",
    type: "Coastal Observation & Tsunami Buoy",
    markerType: "pin-red",
    beaconColor: 0xff3b30,
  },
  {
    id: "BD12",
    code: "BD12",
    name: "BD12 - South Andaman Sea",
    wmoId: 2300012,
    lat: 10.50,
    lon: 94.00,
    sea: "South Andaman Sea (Nicobar Channel)",
    type: "Deep Sea Moored Meteorological Buoy",
    markerType: "buoy-yellow",
    beaconColor: 0xffea00,
  },
];

export function getStationById(id) {
  if (!id) return ARGO_STATIONS[0];
  const cleanId = String(id).trim().toUpperCase();
  const legacyAliases = {
    A1: "AD07",
    A2: "AD08",
    A3: "CB02",
    A4: "AD09",
    A5: "CB06",
    A6: "BD13",
    A7: "CB01",
    A8: "BD12",
  };
  const targetId = legacyAliases[cleanId] || cleanId;
  return ARGO_STATIONS.find(
    (s) => s.id.toUpperCase() === targetId || 
           s.code.toUpperCase() === targetId || 
           String(s.wmoId) === targetId
  ) || ARGO_STATIONS.find(
    (s) => s.id.toUpperCase() === cleanId || 
           s.code.toUpperCase() === cleanId
  ) || ARGO_STATIONS[0];
}

