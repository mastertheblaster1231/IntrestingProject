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
  async getFloatData(stationInfo) {
    const id = typeof stationInfo === "string" ? stationInfo : stationInfo.id;
    const baseInfo = typeof stationInfo === "object" ? stationInfo : { id };
    
    // Deterministic WMO ID (e.g. 2902345, 2902346...)
    const wmoId = baseInfo.wmoId || (2902340 + (this._getNumericIndex(id) % 900));
    
    const lat = baseInfo.lat !== undefined ? baseInfo.lat : 12.35;
    const lon = baseInfo.lon !== undefined ? baseInfo.lon : 78.62;
    const sea = baseInfo.sea || "Indian Ocean (Equatorial Basin)";
    const stationCode = baseInfo.code || `AD${id.replace(/\D/g, "") || "07"}`;
    const buoyType = baseInfo.type || "APEX Profiling Float";

    // Surface temperature & salinity variation based on latitude & basin
    const randTemp = this._pseudoRandom(`${id}_temp`);
    const randSal = this._pseudoRandom(`${id}_sal`);

    const isA7 = id === "A7" || baseInfo.code === "CB01" || wmoId === 2902351;

    // Tropical/subtropical ocean surface temperatures:
    // For A7 (#2902351): exactly 28.3 °C and 34.3 PSU as requested
    const surfaceTemp = isA7 ? 28.3 : parseFloat((27.5 + randTemp * 2.3).toFixed(1));
    const surfaceSalinity = isA7 ? 34.3 : parseFloat((34.2 + randSal * 1.3).toFixed(1));
    const surfaceOxygen = isA7 ? 198 : Math.round(190 + randTemp * 22);
    const surfaceChlorophyll = isA7 ? 0.42 : parseFloat((0.35 + randSal * 0.28).toFixed(2));
    const currentSpeed = isA7 ? 0.42 : parseFloat((0.30 + randTemp * 0.32).toFixed(2));
    const currentDir = isA7 ? "NE" : ["NE", "ENE", "E", "ESE", "SE", "NW"][Math.floor(randSal * 6)];
    const cycleNum = isA7 ? 147 : (100 + Math.floor(this._pseudoRandom(`${id}_cycle`) * 80));
    const lastProfile = isA7 ? "18 min ago" : `${12 + Math.floor(randTemp * 35)} min ago`;
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
      // Mixed layer (0-50m): nearly isothermal
      // Thermocline (100-1000m): rapid exponential drop
      // Abyss (>1000m): asymptotic approach to ~2.0 - 2.8°C
      let temp;
      if (depth <= 50) {
        temp = surfaceTemp - (depth / 50) * 0.3;
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

      // 3. Dissolved Oxygen (OMZ minimum between 300m and 800m):
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

      // 4. Chlorophyll-a (photic zone decay):
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

    // Past 5 surfacing cycle GPS fixes for trajectory visualization
    const trajectoryHistory = [
      { cycle: cycleNum, lat: lat, lon: lon, date: "Today, 18 min ago", temp: surfaceTemp, speed: currentSpeed },
      { cycle: cycleNum - 1, lat: lat - 0.08, lon: lon - 0.09, date: "10 days ago", temp: parseFloat((surfaceTemp - 0.2).toFixed(1)), speed: 0.38 },
      { cycle: cycleNum - 2, lat: lat - 0.15, lon: lon - 0.17, date: "20 days ago", temp: parseFloat((surfaceTemp + 0.1).toFixed(1)), speed: 0.44 },
      { cycle: cycleNum - 3, lat: lat - 0.24, lon: lon - 0.26, date: "30 days ago", temp: parseFloat((surfaceTemp - 0.3).toFixed(1)), speed: 0.35 },
      { cycle: cycleNum - 4, lat: lat - 0.31, lon: lon - 0.34, date: "40 days ago", temp: parseFloat((surfaceTemp).toFixed(1)), speed: 0.40 }
    ];

    const lastDate = new Date();
    const day = lastDate.getUTCDate();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[lastDate.getUTCMonth()];
    const year = lastDate.getUTCFullYear();
    const hours = String(lastDate.getUTCHours()).padStart(2, "0");
    const mins = String(lastDate.getUTCMinutes()).padStart(2, "0");
    const lastObservationFormatted = `${day} ${month} ${year}, ${hours}:${mins} UTC`;

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

  async getFloatData(stationInfo) {
    const id = typeof stationInfo === "string" ? stationInfo : (stationInfo.wmoId || stationInfo.code || stationInfo.id);
    
    if (this.cache.has(id)) {
      return this.cache.get(id);
    }

    try {
      const headers = { "Content-Type": "application/json" };
      if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;

      const response = await fetch(`${this.apiBaseUrl}/floats/${encodeURIComponent(id)}/latest`, {
        method: "GET",
        headers
      });

      if (!response.ok) {
        throw new Error(`API responded with HTTP ${response.status}`);
      }

      const data = await response.json();
      this.cache.set(id, data);
      return data;
    } catch (err) {
      console.warn(`[ApiArgoProvider] Live API fetch failed for float ${id}, falling back to procedural mock:`, err);
      // Graceful fallback to procedural generator
      const fallbackProvider = new ProceduralArgoProvider();
      return await fallbackProvider.getFloatData(stationInfo);
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
   * Retrieves float and station details
   * @param {Object|string} stationOrId
   */
  async getFloatDetails(stationOrId) {
    let data;
    if (this.activeSource === "api" && this.apiProvider) {
      data = await this.apiProvider.getFloatData(stationOrId);
    } else {
      data = await this.proceduralProvider.getFloatData(stationOrId);
    }
    // Attach scientific parameter glossary for dynamic UI tooltips
    if (!data.parameterGlossary) {
      data.parameterGlossary = this.glossary;
    }
    return data;
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
// ⚓ ARGO & OON STATIONS REGISTRY
// ============================================================================
export const ARGO_STATIONS = [
  {
    id: "A1",
    wmoId: 2902345,
    code: "AD07",
    lat: 12.35,
    lon: 78.62,
    sea: "Indian Ocean (Equatorial Basin)",
    type: "APEX Profiling Float",
  },
  {
    id: "A2",
    wmoId: 2902346,
    code: "AD08",
    lat: 12.0,
    lon: 68.5,
    sea: "Arabian Sea (Central Basin)",
    type: "Omni Meteorological Buoy",
  },
  {
    id: "A3",
    wmoId: 2902347,
    code: "CB02",
    altCode: "CALVAL / AD10",
    lat: 10.3,
    lon: 72.5,
    sea: "Lakshadweep (Agatti / Kavaratti)",
    type: "Coastal & CalVal Buoy",
  },
  {
    id: "A4",
    wmoId: 2902348,
    code: "AD09",
    lat: 8.2,
    lon: 73.3,
    sea: "South Lakshadweep / Minicoy Channel",
    type: "Deep Ocean Buoy",
  },
  {
    id: "A5",
    wmoId: 2902349,
    code: "CB06",
    lat: 13.1,
    lon: 80.3,
    sea: "Bay of Bengal (Off Chennai)",
    type: "Coastal Moored Buoy",
  },
  {
    id: "A6",
    wmoId: 2902350,
    code: "BD13",
    lat: 14.0,
    lon: 87.0,
    sea: "Bay of Bengal (Central Basin)",
    type: "Deep Sea Meteorological Buoy",
  },
  {
    id: "A7",
    wmoId: 2902351,
    code: "CB01",
    lat: 11.6,
    lon: 92.5,
    sea: "Andaman Sea (Port Blair)",
    type: "Coastal Observation Buoy",
  },
  {
    id: "A8",
    wmoId: 2902352,
    code: "BD12",
    lat: 10.5,
    lon: 94.0,
    sea: "South Andaman Sea",
    type: "Deep Sea Moored Buoy",
  },
];

export function getStationById(id) {
  if (!id) return ARGO_STATIONS[0];
  const cleanId = String(id).trim().toUpperCase();
  return ARGO_STATIONS.find(
    (s) => s.id.toUpperCase() === cleanId || 
           s.code.toUpperCase() === cleanId || 
           String(s.wmoId) === cleanId
  ) || ARGO_STATIONS[0];
}
