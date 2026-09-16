# Live INCOIS 3D Ocean Visualizer API Documentation

This document outlines the API endpoints used to power the Live INCOIS 3D Ocean Visualizer backend and frontend components.

## Internal APIs (FastAPI Backend)

The backend server (`server.py`) provides the following endpoints to the frontend, primarily serving data at `http://localhost:8000`.

### 1. Fleet Coordinates
- **Endpoint:** `GET /api/fleet`
- **Description:** Fetches live, authentic surface coordinates for active Argo floats in the North Indian Ocean basin (Arabian Sea + Bay of Bengal).
- **Query Parameters:**
  - `lat_min` (float): Minimum latitude bound (default `0.0`).
  - `lat_max` (float): Maximum latitude bound (default `25.0`).
  - `lon_min` (float): Minimum longitude bound (default `55.0`).
  - `lon_max` (float): Maximum longitude bound (default `98.0`).
  - `days` (int): Time window in days to search for recent profiles (default `45`).
- **Data Source:** Proxies data from IFREMER ERDDAP. Falls back to static active float data on fetch error.

### 2. Vertical Depth Profile
- **Endpoint:** `GET /api/profile/{platform_number}`
- **Description:** Fetches real depth-resolved temperature and salinity profiles for a specific Argo float.
- **Path Parameters:**
  - `platform_number` (string): The unique ID of the Argo float (e.g., `2902351`).
- **Data Source:** Proxies data from IFREMER ERDDAP up to 90 days in the past. Falls back to an analytical physical thermocline model on fetch error.

### 3. Model vs Observation Validation
- **Endpoint:** `GET /api/validation`
- **Description:** Computes real-time co-located values between in-situ observations and INCOIS ROMS model grid cells, calculating residuals ($\Delta$ = Obs - Model).
- **Query Parameters:**
  - `platform_number` (string): Target platform ID (default `"2902351"`).
  - `depth` (float): Active depth level in meters (default `15.0`).
  - `lat` (float): Latitude of observation (default `11.68`).
  - `lon` (float): Longitude of observation (default `92.50`).
- **Response Data:** Returns observed vs model data for Temperature, Salinity, Dissolved Oxygen, Speed, and Chlorophyll-a.

## External APIs

The FastAPI backend consumes the following external data source to fuel the live stream:

### IFREMER ERDDAP Server
- **Base URL:** `https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.json`
- **Usage:**
  - Used by `/api/fleet` to query active floats based on latitude, longitude, and pressure constraints (`pres<=10` dbar for surface).
  - Used by `/api/profile/{platform_number}` to gather the maximum history for a given float up to a 90-day window (`orderByMax("time")`).
