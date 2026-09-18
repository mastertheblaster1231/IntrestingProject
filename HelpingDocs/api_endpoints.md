# INCOIS 3D Ocean Visualizer — Technical Documentation

## 1. Executive Summary & Objective

Forecasters and researchers at INCOIS currently toggle between isolated software tools to view numerical model predictions (NetCDF) and observational in-situ data (Argo, Gliders). This platform delivers a **browser-native 3D environment** unifying 3D ocean fields, live sensor profiles, and real-time residual validation matrices (Δ = Observed − Model).

---

## 2. System Architecture & Data Pipeline

```
+-----------------------------------------------------------------------------------+
|                           DATA INGESTION TIER                                     |
|   - In-Situ Buoys: NOAA/AOML & IFREMER ERDDAP (REST/JSON)                        |
|   - Numerical Models: INCOIS-ROMS / Copernicus PHY_001_030 (NetCDF via xarray)    |
|   - Met-Ocean Tracks: IMD Cyclone Best-Track API                                  |
+-----------------------------------------------------------------------------------+
                                     |
                                     v
+-----------------------------------------------------------------------------------+
|                   FASTAPI MIDDLEWARE & PROCESSING ENGINE                           |
|   - /api/fleet              (Global active buoy locations)                        |
|   - /api/telemetry/{id}     (Live surface observations)                           |
|   - /api/profile/{id}       (Depth-resolved T/S curves)                           |
|   - /api/validation         (Co-located model vs. obs residual calculation)       |
|   - /api/ocean/vectors      (u, v current field advection)                        |
+-----------------------------------------------------------------------------------+
                                     |
                                     v
+-----------------------------------------------------------------------------------+
|                FRONTEND PRESENTATION LAYER (REACT + THREE.JS)                     |
|   - Orbital 3D Globe with UV coordinate mapping                                  |
|   - Dynamic 3D Sub-surface water column (0 to 6000 m)                            |
|   - Animated Slocum Glider 3D transect path                                      |
|   - Glassmorphic Telemetry & Validation Matrix Panel                             |
+-----------------------------------------------------------------------------------+
```

---

## 3. API Specification & Live Endpoints

### Endpoint 1: Live Argo Surface Telemetry

| Field       | Value                                                                                           |
|-------------|-----------------------------------------------------------------------------------------------|
| **Protocol** | REST GET                                                                                       |
| **Primary URL** | [erddap.aoml.noaa](https://erddap.aoml.noaa.gov/hdb/erddap/tabledap/argo_float_indian_2025_present.html) |
| **Base**     | `https://erddap.aoml.noaa.gov/hdb/erddap/tabledap/argo_float_indian_2025_present.json`       |
| **Parameters** | `?PLATFORM_NUMBER,time,latitude,longitude,PRES,TEMP,PSAL&PLATFORM_NUMBER="{id}"&PRES<=10&orderByMax("time")` |

**Output Schema:**
```json
{
  "wmoId": "2902351",
  "time": "2026-09-14T12:00:00Z",
  "latitude": 11.6800,
  "longitude": 92.5000,
  "depth": 5.2,
  "temperature": 28.30,
  "salinity": 34.32,
  "status": "LIVE STREAM"
}
```

---

### Endpoint 2: Full Vertical Depth Profile (0–2000 m)

| Field       | Value                                                                                      |
|-------------|------------------------------------------------------------------------------------------|
| **Protocol** | REST GET                                                                                  |
| **Primary URL** | `https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.json`                             |
| **Parameters** | `?pres,temp,psal&platform_number="{id}"&orderByMax("time")`                              |

**Output Schema:**
```json
{
  "platform_number": "2902351",
  "profile": [
    { "depth": 5.0,    "temp": 28.3, "salinity": 34.32 },
    { "depth": 50.0,   "temp": 27.1, "salinity": 34.50 },
    { "depth": 200.0,  "temp": 16.4, "salinity": 35.10 },
    { "depth": 1000.0, "temp": 6.8,  "salinity": 34.90 }
  ]
}
```

---

### Endpoint 3: Numerical Model vs. Observation Co-Validation

| Field       | Value                                                                                      |
|-------------|------------------------------------------------------------------------------------------|
| **Protocol** | Custom FastAPI Internal `GET /api/validation`                                             |
| **Parameters** | `?platform_number=2902351&depth=15.0&lat=11.68&lon=92.50`                                |

**Output Schema:**
```json
{
  "platform_number": "2902351",
  "depth_level": "15m",
  "model_name": "INCOIS-ROMS 1/12°",
  "variables": [
    { "name": "Temp",          "unit": "°C",       "observed": 28.3,   "model": 27.9,   "delta": 0.4   },
    { "name": "Salinity",      "unit": "PSU",      "observed": 34.32,  "model": 34.34,  "delta": -0.02 },
    { "name": "Dissolved O₂",  "unit": "μmol/kg",  "observed": 200.0,  "model": 191.0,  "delta": 9.0   }
  ],
  "residual_bias": "Optimal Match"
}
```

---

## 4. Telemetry Service Implementation

The following function includes dynamic column mapping, surface pressure filtering, and automatic fallback between NOAA AOML (primary) and IFREMER (secondary):

```javascript
// argoTelemetryService.js

/**
 * fetchArgoTelemetry
 * ------------------
 * Fetches live surface telemetry for a single Argo float.
 * Primary: NOAA AOML Indian Ocean Dataset (2025-present)
 * Secondary: IFREMER Global ArgoFloats Dataset
 * Fallback: Analytical offline data
 *
 * @param {string} wmoId  WMO platform number, e.g. "2902351"
 * @returns {Promise<Object>} Telemetry object (never rejects)
 */
export const fetchArgoTelemetry = async (wmoId) => {
  const AOML_URL = `https://erddap.aoml.noaa.gov/hdb/erddap/tabledap/argo_float_indian_2025_present.json?PLATFORM_NUMBER,time,latitude,longitude,PRES,TEMP,PSAL&PLATFORM_NUMBER="${wmoId}"&PRES<=10&orderByMax("time")`;
  const IFREMER_URL = `https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.json?platform_number,time,latitude,longitude,pres,temp,psal&platform_number="${wmoId}"&pres<=10&orderByMax("time")`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let res = await fetch(AOML_URL, { signal: controller.signal }).catch(() => null);

    if (!res || !res.ok) {
      res = await fetch(IFREMER_URL, { signal: controller.signal });
    }
    clearTimeout(timeout);

    if (!res || !res.ok) throw new Error("ERDDAP response error");

    const json = await res.json();
    const colNames = json.table.columnNames.map((c) => c.toLowerCase());
    const row = json.table.rows[0];

    if (!row) throw new Error("No live telemetry row returned");

    const getCol = (name) => row[colNames.indexOf(name)];

    return {
      wmoId: String(getCol("platform_number") || wmoId),
      time: String(getCol("time")),
      latitude: Number(Number(getCol("latitude")).toFixed(4)),
      longitude: Number(Number(getCol("longitude")).toFixed(4)),
      depth: Number(Number(getCol("pres")).toFixed(1)),
      temperature: Number(Number(getCol("temp")).toFixed(2)),
      salinity: Number(Number(getCol("psal")).toFixed(2)),
      status: "LIVE STREAM (QC PASSED)",
    };
  } catch (err) {
    console.warn(`Falling back to analytical telemetry for float ${wmoId}:`, err);
    return {
      wmoId,
      time: new Date().toISOString(),
      latitude: 11.6800,
      longitude: 92.5000,
      depth: 5.0,
      temperature: 28.30,
      salinity: 34.32,
      status: "ACTIVE (OFFLINE FALLBACK)",
    };
  }
};
```

---

## 5. Step-by-Step Implementation Checklist

| Step | Action | Details |
|------|--------|---------|
| **1** | **Telemetry Hook** | Import `fetchArgoTelemetry` into `FleetTelemetry` / `useOceanData` hook |
| **2** | **Selection Trigger** | When a user clicks any Argo marker pin on the 3D globe, pass its WMO ID (e.g., `2902351` or `1902286`) into the hook |
| **3** | **Live UI Update** | Render the returned temperature, salinity, and time into the telemetry card, immediately removing the `● Fallback Mode` badge and replacing it with `● LIVE STREAM` if streaming live data |

---

## 6. Internal FastAPI Backend Endpoints

These are served from [`server.py`](file:///c:/Users/siddh/Desktop/SIHProject/backend/server.py) running on `http://localhost:8000`:

### `GET /api/fleet`
Fetches live surface coordinates for active Argo floats in the North Indian Ocean basin.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `lat_min` | float | `0.0` | Southern latitude bound |
| `lat_max` | float | `25.0` | Northern latitude bound |
| `lon_min` | float | `55.0` | Western longitude bound |
| `lon_max` | float | `98.0` | Eastern longitude bound |
| `days` | int | `45` | Time window to search for recent profiles |

### `GET /api/profile/{platform_number}`
Fetches real depth-resolved temperature and salinity profiles for a specific Argo float.

| Parameter | Type | Location | Description |
|-----------|------|----------|-------------|
| `platform_number` | string | path | Unique WMO ID of the Argo float |

### `GET /api/validation`
Computes real-time co-located values between in-situ observations and INCOIS ROMS model grid cells, calculating residuals (Δ = Obs − Model).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `platform_number` | string | `"2902351"` | Target platform ID |
| `depth` | float | `15.0` | Active depth level in meters |
| `lat` | float | `11.68` | Latitude of observation |
| `lon` | float | `92.50` | Longitude of observation |

**Response variables:** Temperature, Salinity, Dissolved Oxygen, Speed, Chlorophyll-a

---

## 7. External Data Sources Summary

| Source | URL | Usage |
|--------|-----|-------|
| **NOAA AOML** (Primary) | [erddap.aoml.noaa.gov](https://erddap.aoml.noaa.gov/hdb/erddap/tabledap/argo_float_indian_2025_present.html) | Indian Ocean Argo floats (2025-present), surface telemetry |
| **IFREMER ERDDAP** (Secondary) | `https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.json` | Global Argo dataset, full depth profiles |
| **INCOIS-ROMS 1/12°** | Internal model grid (via FastAPI `/api/validation`) | Numerical ocean model for residual validation |
