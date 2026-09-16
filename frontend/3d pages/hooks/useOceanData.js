import { useEffect, useState } from 'react';

/**
 * Backend base URL — Vite proxy handles /api → 127.0.0.1:8000 in dev.
 * In production, same-origin relative fetch allows Vercel serverless / Render / Railway.
 */
const BACKEND_URL = (typeof window !== 'undefined' && window.location && window.location.origin) ? '' : 'http://localhost:8000';

export function useOceanData(selectedFloatId = '2902351', activeDepth = 15) {
  const [isLive, setIsLive] = useState(false);
  const [fleet, setFleet] = useState([]);
  const [validationData, setValidationData] = useState(null);

  // 1. Fetch Fleet Coordinates
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/fleet`)
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
    fetch(`${BACKEND_URL}/api/validation?platform_number=${selectedFloatId}&depth=${activeDepth}`)
      .then((res) => res.json())
      .then((data) => setValidationData(data))
      .catch((err) => console.error(err));
  }, [selectedFloatId, activeDepth]);

  return { isLive, fleet, validationData };
}
