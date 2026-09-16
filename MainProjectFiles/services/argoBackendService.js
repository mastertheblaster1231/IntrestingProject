/**
 * argoBackendService.js — BGC Argo Data Fetcher for 3D Telemetry
 * Communicates with the Python FastAPI Backend
 */

let fetchController = null;
// Rely on relative path to use Vite proxy locally, and degrade gracefully on production deployments
const BACKEND_URL = '';

/**
 * Fetches BGC Argo telemetry from the backend at a specific depth
 * Includes request cancellation to debounce rapid depth-slider events.
 */
export async function fetchArgoDepthSlice(platformNumber = '2902251', depth = 2.0, timestamp = null) {
  if (fetchController) {
    fetchController.abort();
  }
  fetchController = new AbortController();

  let url = `${BACKEND_URL}/api/argo/depth-slice?platform_number=${encodeURIComponent(platformNumber)}&depth=${depth}`;
  if (timestamp) {
    url += `&timestamp=${encodeURIComponent(timestamp)}`;
  }
  
  try {
    const response = await fetch(url, { signal: fetchController.signal });
    if (!response.ok) {
      throw new Error(`Backend responded with HTTP ${response.status}`);
    }
    const data = await response.json();
    fetchController = null;
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      // Expected when sliding rapidly, suppress error
      return null;
    }
    console.error('[argoBackendService] Error fetching depth-slice:', error);
    throw error;
  }
}
