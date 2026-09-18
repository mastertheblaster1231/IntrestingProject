/**
 * argoBackendService.js — BGC Argo Data Fetcher for 3D Telemetry
 * Communicates with the Python FastAPI Backend
 */

import { apiUrl } from './api.js';

let fetchController = null;

/**
 * Fetches BGC Argo telemetry from the backend at a specific depth
 * Includes request cancellation to debounce rapid depth-slider events.
 */
export async function fetchArgoDepthSlice(platformNumber = '2902251', depth = 2.0, timestamp = null) {
  if (fetchController) {
    fetchController.abort();
  }
  fetchController = new AbortController();

  // Primary endpoint + alias fallback chain — fixes 404 when only Python or only Node backend is running
  const endpoints = [
    apiUrl(`/api/argo/depth-slice?platform_number=${encodeURIComponent(platformNumber)}&depth=${depth}`),
    apiUrl(`/api/depth-slice?platform_number=${encodeURIComponent(platformNumber)}&depth=${depth}`),
  ];

  for (const baseUrl of endpoints) {
    let url = baseUrl;
    if (timestamp) url += `&timestamp=${encodeURIComponent(timestamp)}`;

    try {
      const response = await fetch(url, { signal: fetchController.signal });
      if (!response.ok) {
        // Try next alias endpoint before throwing
        if (response.status === 404 && baseUrl !== endpoints[endpoints.length - 1]) continue;
        throw new Error(`Backend responded with HTTP ${response.status}`);
      }
      const data = await response.json();
      fetchController = null;
      return data;
    } catch (error) {
      if (error.name === 'AbortError') return null;
      // If this was the last endpoint in the chain, fail explicitly
      if (baseUrl === endpoints[endpoints.length - 1]) {
        console.warn('[argoBackendService] All depth-slice endpoints failed:', error.message);
        fetchController = null;
        return null;
      }
      // otherwise try next endpoint
      continue;
    }
  }
  fetchController = null;
  return null;
}
