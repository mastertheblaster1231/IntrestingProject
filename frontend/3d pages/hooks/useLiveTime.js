import { useState, useEffect } from 'react';

/**
 * useLiveTime — Live IST Clock Hook
 * ===================================
 * Returns a formatted IST timestamp string that ticks every second.
 *
 * Format: "11 Sep 2026, 08:52:29 PM IST"
 *
 * Uses Intl.DateTimeFormat with timeZone: 'Asia/Kolkata' for accurate IST.
 * If the browser's Intl implementation fails, falls back to a manual
 * UTC+5:30 offset calculation so the dashboard never shows a stale clock.
 *
 * @returns {string} Live-updating IST timestamp string
 */
export function useLiveTime() {
  const [timeStr, setTimeStr] = useState(() => formatIST(new Date()));

  useEffect(() => {
    // Tick every 1000ms
    const intervalId = setInterval(() => {
      setTimeStr(formatIST(new Date()));
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  return timeStr;
}

// ─── FORMATTER ───────────────────────────────────────────────────────────────

/**
 * formatIST
 * ---------
 * Formats a Date object into a human-readable IST string.
 *
 * Primary path: Intl.DateTimeFormat with 'Asia/Kolkata' timezone.
 * Fallback path: Manual UTC+5:30 offset if Intl throws.
 *
 * @param {Date} date
 * @returns {string} e.g. "11 Sep 2026, 08:52:29 PM IST"
 */
function formatIST(date) {
  try {
    // Primary: Intl.DateTimeFormat — the reliable cross-browser path
    const formatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day:      '2-digit',
      month:    'short',
      year:     'numeric',
      hour:     '2-digit',
      minute:   '2-digit',
      second:   '2-digit',
      hour12:   true,
    });

    const parts = formatter.formatToParts(date);
    const p = {};
    for (const { type, value } of parts) {
      p[type] = value;
    }

    // Assemble: "11 Sep 2026, 08:52:29 PM IST"
    return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}:${p.second} ${(p.dayPeriod || 'PM').toUpperCase()} IST`;

  } catch (_intlError) {
    // ── FALLBACK: Manual UTC+5:30 offset ─────────────────────────────────
    // This branch fires only if the browser's Intl engine is broken or
    // 'Asia/Kolkata' is not in its timezone database (extremely rare).
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +5:30 in milliseconds
    const istDate = new Date(date.getTime() + IST_OFFSET_MS + date.getTimezoneOffset() * 60 * 1000);

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const day    = String(istDate.getDate()).padStart(2, '0');
    const month  = months[istDate.getMonth()];
    const year   = istDate.getFullYear();

    let hours   = istDate.getHours();
    const ampm  = hours >= 12 ? 'PM' : 'AM';
    hours       = hours % 12 || 12;

    const hh = String(hours).padStart(2, '0');
    const mm = String(istDate.getMinutes()).padStart(2, '0');
    const ss = String(istDate.getSeconds()).padStart(2, '0');

    return `${day} ${month} ${year}, ${hh}:${mm}:${ss} ${ampm} IST`;
  }
}

export default useLiveTime;
