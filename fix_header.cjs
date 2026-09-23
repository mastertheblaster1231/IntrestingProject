const fs = require('fs');
const path = 'frontend/3d pages/oceanDataService.js';
let content = fs.readFileSync(path, 'utf8');

// Replace the header section
const oldHeader = `/**
 * Ocean Data Service - Procedural Generator & API Ready Adapter
 * =============================================================
 * Provides physical oceanographic data for Argo Profiling Floats & INCOIS Ocean Observation Buoys.
 * 
 * DESIGNED FOR EASY API EXTENSION:
 * - Switch from procedural fake data to a live REST / GraphQL / ERDDAP API
 *   by implementing or activating \`ApiArgoProvider\`.
 * 
 * PRIMARY SOURCE:  IFREMER GDAC ERDDAP REST API (live JSON endpoint)
 * FALLBACK SOURCE: local real_argo_cache.json (hackathon offline fail-safe)
 * 
 * ERDDAP query strategy:
 *   - Table dataset: ArgoFloats
 *   - Variables: platform_number, time, latitude, longitude, pres, temp, psal
 *   - Filter:    platform_number = "<floatId>" (exact WMO code)
 *   - Ordering:  orderByMax("time") \u2014 returns only the most recent cycle rows
 * 
 * Offline fail-safe guarantees the demo never breaks on throttled hackathon Wi-Fi.
 */

// Force inclusion of ErddapOceanService in bundle (prevents tree-shaking)
// This creates a side effect on globalThis that can't be optimized away
if (typeof globalThis !== 'undefined') {
  globalThis.__ERDDAP_OCEAN_SERVICE__ = ErddapOceanService;
}

export class ArgoDataProvider {`;

const newHeader = `/**
 * Ocean Data Service - Procedural Generator & API Ready Adapter
 * =============================================================
 * Provides physical oceanographic data for Argo Profiling Floats & INCOIS Ocean Observation Buoys.
 * 
 * DESIGNED FOR EASY API EXTENSION:
 * - Switch from procedural fake data to a live REST / GraphQL / ERDDAP API
 *   by implementing or activating \`ApiArgoProvider\`.
 * 
 * PRIMARY SOURCE:  IFREMER GDAC ERDDAP REST API (live JSON endpoint)
 * FALLBACK SOURCE: local real_argo_cache.json (hackathon offline fail-safe)
 * 
 * ERDDAP query strategy:
 *   - Table dataset: ArgoFloats
 *   - Variables: platform_number, time, latitude, longitude, pres, temp, psal
 *   - Filter:    platform_number = "<floatId>" (exact WMO code)
 *   - Ordering:  orderByMax("time") \u2014 returns only the most recent cycle rows
 * 
 * Offline fail-safe guarantees the demo never breaks on throttled hackathon Wi-Fi.
 */

import { ErddapOceanService, erddapOceanService } from "./erddapOceanService.js";

export class ArgoDataProvider {`;

if (content.includes(oldHeader)) {
  content = content.replace(oldHeader, newHeader);
  fs.writeFileSync('frontend/3d pages/oceanDataService.js', content, 'utf8');
  console.log('Replaced header successfully');
} else {
  console.log('Old header not found');
  // Show first 500 chars for debugging
  console.log('First 500 chars:', JSON.stringify(content.slice(0, 500)));
}