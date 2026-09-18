import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { sanitize } from './sanitize.js';

dotenv.config();

const ERDDAP_BGC_BASE = process.env.ERDDAP_BGC_BASE || 'https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats-synthetic-BGC.json';
const ERDDAP_TIMEOUT_MS = parseInt(process.env.ERDDAP_TIMEOUT_MS || '12000', 10);

export async function fetchBgcProfile(platformNumber, { maxPres = 2000, days = 365 } = {}) {
  // Build the ERDDAP URL requesting required columns
  const columns = 'platform_number,cycle_number,time,latitude,longitude,pres,temp,psal,doxy,chla,bbp700,temp_qc,psal_qc,doxy_qc,chla_qc';
  
  // Constrain: platform_number="<id>", time>=now-<days>days, pres<=<maxPres>
  const platformConstraint = `platform_number=%22${encodeURIComponent(platformNumber)}%22`;
  const timeConstraint = `time%3E=now-${days}days`;
  const presConstraint = `pres%3C=${maxPres}`;
  
  // QC constraints: ~"[12]" URL-encoded
  const qcVal = encodeURIComponent('~"[12]"');
  const qcConstraints = `temp_qc=${qcVal}&psal_qc=${qcVal}&doxy_qc=${qcVal}&chla_qc=${qcVal}`;

  const query = `${columns}&${platformConstraint}&${timeConstraint}&${presConstraint}&${qcConstraints}`;
  const url = `${ERDDAP_BGC_BASE}?${query}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ERDDAP_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`ERDDAP fetch failed with status ${res.status}: ${res.statusText} for URL: ${url}`);
    }

    const json = await res.json();
    const table = json?.table;
    if (!table || !table.rows || !table.columnNames) {
      throw new Error('Invalid ERDDAP response format: missing table structure');
    }

    const cols = table.columnNames;
    const rows = table.rows;

    // Parse rows using columnNames.indexOf(name)
    const pIdx = cols.indexOf('platform_number');
    const tIdx = cols.indexOf('time');
    const latIdx = cols.indexOf('latitude');
    const lonIdx = cols.indexOf('longitude');
    
    const presIdx = cols.indexOf('pres');
    const tempIdx = cols.indexOf('temp');
    const psalIdx = cols.indexOf('psal');
    const doxyIdx = cols.indexOf('doxy');
    const chlaIdx = cols.indexOf('chla');
    const bbpIdx = cols.indexOf('bbp700');

    if (presIdx === -1) {
      throw new Error('ERDDAP response missing required "pres" column');
    }

    let lat = null, lon = null, time = null;
    let returnedPlatformNumber = null;

    const levels = [];
    const available = { temp: false, psal: false, doxy: false, chla: false, bbp700: false };

    for (const r of rows) {
      let pres = r[presIdx];
      pres = sanitize('pres', pres);
      // Drop any level where pres is null, >= 99999, or not finite.
      if (pres == null) {
        continue;
      }

      if (latIdx !== -1 && r[latIdx] != null) lat = Number(r[latIdx]);
      if (lonIdx !== -1 && r[lonIdx] != null) lon = Number(r[lonIdx]);
      if (tIdx !== -1 && r[tIdx] != null) time = r[tIdx];
      if (pIdx !== -1 && r[pIdx] != null) returnedPlatformNumber = r[pIdx];

      const level = { pres: Number(pres) };

      if (tempIdx !== -1) {
        const val = sanitize('temp', r[tempIdx]);
        if (val != null) {
          level.temp = val;
          available.temp = true;
        } else {
          level.temp = null;
        }
      }

      if (psalIdx !== -1) {
        const val = sanitize('psal', r[psalIdx]);
        if (val != null) {
          level.psal = val;
          available.psal = true;
        } else {
          level.psal = null;
        }
      }

      if (doxyIdx !== -1) {
        const val = sanitize('doxy', r[doxyIdx]);
        if (val != null) {
          level.doxy = val;
          available.doxy = true;
        } else {
          level.doxy = null;
        }
      }

      if (chlaIdx !== -1) {
        const val = sanitize('chla', r[chlaIdx]);
        if (val != null) {
          level.chla = val;
          available.chla = true;
        } else {
          level.chla = null;
        }
      }

      if (bbpIdx !== -1) {
        const val = sanitize('bbp700', r[bbpIdx]);
        if (val != null) {
          level.bbp700 = val;
          available.bbp700 = true;
        } else {
          level.bbp700 = null;
        }
      }

      levels.push(level);
    }

    if (levels.length === 0) {
      throw new Error(`No valid profile data found for platform ${platformNumber}`);
    }

    return {
      platform_number: returnedPlatformNumber || platformNumber,
      latitude: lat,
      longitude: lon,
      time: time,
      levels,
      available
    };

  } finally {
    clearTimeout(timeoutId);
  }
}

// Verification block
const isMain = typeof process !== 'undefined' && process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isMain) {
  (async () => {
    try {
      const platformNumber = process.argv[2] || '2902267'; // Fallback to a likely valid ID
      console.log(`Fetching BGC profile for float ${platformNumber}...`);
      const result = await fetchBgcProfile(platformNumber);
      console.log('--- First 5 levels ---');
      console.log(result.levels.slice(0, 5));
      console.log('--- Available Map ---');
      console.log(result.available);
      console.log(`\nPlatform: ${result.platform_number}`);
      console.log(`Time: ${result.time}`);
      console.log(`Location: ${result.latitude}, ${result.longitude}`);
      console.log(`Total levels returned: ${result.levels.length}`);
    } catch (e) {
      console.error('Error fetching BGC profile:', e.message);
    }
  })();
}
