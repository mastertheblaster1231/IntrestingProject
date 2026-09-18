import { useEffect, useState } from 'react';

/**
 * Backend base URL — from frontend/.env VITE_BACKEND_URL.
 * - Local dev: VITE_BACKEND_URL=http://localhost:8000 (direct)
 * - Prod: VITE_BACKEND_URL= (empty) → same-origin /api via Vite proxy / Vercel rewrite
 * Falls back to localhost:8000 for SSR/tests when window is undefined.
 */
import { apiUrl } from '../../services/api.js';

export function useOceanData(selectedFloatId = '2902351', activeDepth = 15) {
  const [isLive, setIsLive] = useState(false);
  const [fleet, setFleet] = useState([]);
  const [validationData, setValidationData] = useState(null);

  // 1. Fetch Fleet Coordinates
  useEffect(() => {
    fetch(apiUrl('/api/fleet'))
      .then((res) => {
        if (!res.ok) throw new Error('API failed');
        return res.json();
      })
      .then((data) => {
        setFleet(data);
        setIsLive(true); // Switch out of Fallback Mode
      })
      .catch((err) => {
        console.warn('Backend unavailable, using fallback', err);
        setIsLive(false);
      });
  }, []);

  // 2. Fetch Validation Matrix on Float or Depth Change
  useEffect(() => {
    fetch(apiUrl(`/api/validation?platform_number=${selectedFloatId}&depth=${activeDepth}`))
      .then((res) => res.json())
      .then((data) => setValidationData(data))
      .catch((err) => console.error(err));
  }, [selectedFloatId, activeDepth]);

  return { isLive, fleet, validationData };
}
