import React, { useMemo } from 'react';
import { useOceanStore } from '../useOceanStore.js';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * DateTimePicker.jsx — Compact Glassmorphism Temporal Hyperslab Controller
 * =======================================================================
 * Allows the user to change Month, Day, and Time (HH:MM) to time-travel through
 * ocean numerical models and in-situ observations.
 *
 * Drives deterministic diurnal solar physics across all sensors and residuals.
 */
export function DateTimePicker({ compact = false, className = '', style = {} }) {
  const selectedTimestamp = useOceanStore((state) => state.selectedTimestamp);
  const setSelectedTimestamp = useOceanStore((state) => state.setSelectedTimestamp);

  const currentDate = useMemo(() => {
    const d = new Date(selectedTimestamp || Date.now());
    return isNaN(d.getTime()) ? new Date() : d;
  }, [selectedTimestamp]);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth(); // 0 - 11
  const currentDay = currentDate.getDate(); // 1 - 31
  const currentHours = currentDate.getHours(); // 0 - 23
  const currentMinutes = currentDate.getMinutes(); // 0 - 59

  // Calculate diurnal solar phase label based on current hour
  const decimalHour = currentHours + currentMinutes / 60.0;
  const solarPhase = useMemo(() => {
    if (decimalHour >= 5.0 && decimalHour < 7.5) {
      return { label: '🌅 Dawn (Solar Heating Begins)', color: '#f59e0b', tag: 'Dawn' };
    }
    if (decimalHour >= 7.5 && decimalHour < 12.0) {
      return { label: '☀️ Morning Solar Insolation', color: '#fbbf24', tag: 'Morning' };
    }
    if (decimalHour >= 12.0 && decimalHour < 15.0) {
      return { label: '🔥 Solar Noon (Max SST +0.4°C)', color: '#f97316', tag: 'Solar Peak' };
    }
    if (decimalHour >= 15.0 && decimalHour < 18.0) {
      return { label: '🌿 Afternoon Photosynthesis (Max O₂)', color: '#10b981', tag: 'Peak O₂' };
    }
    if (decimalHour >= 18.0 && decimalHour < 20.0) {
      return { label: '🌇 Dusk Transition & Twilight', color: '#a855f7', tag: 'Dusk' };
    }
    return { label: '🌙 Night Radiative Cooling (Min Temp @ 02:00)', color: '#38bdf8', tag: 'Night Min' };
  }, [decimalHour]);

  // Update temporal coordinate helper
  const updateDatePart = (changes) => {
    const next = new Date(currentDate.getTime());
    if (changes.year !== undefined) next.setFullYear(changes.year);
    if (changes.month !== undefined) next.setMonth(changes.month);
    if (changes.day !== undefined) {
      // Clamp day to maximum days in month
      const maxDays = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(maxDays, Math.max(1, changes.day)));
    }
    if (changes.hours !== undefined) next.setHours(changes.hours);
    if (changes.minutes !== undefined) next.setMinutes(changes.minutes);
    setSelectedTimestamp(next.toISOString());
  };

  const handleQuickPreset = (hours, minutes = 0) => {
    updateDatePart({ hours, minutes });
  };

  const handleNow = () => {
    setSelectedTimestamp(new Date().toISOString());
  };

  const daysInCurrentMonth = useMemo(() => {
    return new Date(currentYear, currentMonth + 1, 0).getDate();
  }, [currentYear, currentMonth]);

  const daysArray = Array.from({ length: daysInCurrentMonth }, (_, i) => i + 1);
  const hoursArray = Array.from({ length: 24 }, (_, i) => i);
  const minutesArray = [0, 15, 30, 45];

  return (
    <div
      className={`glass-date-time-picker ${className}`}
      style={{
        background: 'rgba(3, 14, 33, 0.88)',
        backdropFilter: 'blur(18px) saturate(180%)',
        WebkitBackdropFilter: 'blur(18px) saturate(180%)',
        border: '1px solid rgba(0, 229, 255, 0.32)',
        borderRadius: '12px',
        padding: compact ? '8px 10px' : '10px 14px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.55), 0 0 16px rgba(0, 229, 255, 0.12)',
        color: '#e2e8f0',
        fontFamily: 'var(--font-primary, "Outfit", sans-serif)',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? '6px' : '8px',
        ...style,
      }}
    >
      {/* Top Header Strip: Title + Diurnal Phase Tag */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.9rem' }}>⏱️</span>
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#00f0ff',
            }}
          >
            Timeline
          </span>
        </div>

        {/* Dynamic Diurnal Solar Status Badge */}
        <span
          style={{
            fontSize: '0.58rem',
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: '10px',
            background: `${solarPhase.color}1a`,
            color: solarPhase.color,
            border: `1px solid ${solarPhase.color}55`,
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
          title={solarPhase.label}
        >
          <span>●</span>
          <span>{solarPhase.tag}</span>
        </span>
      </div>

      {/* Main Selectors Strip: Month | Day | HH : MM */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '6px',
          alignItems: 'center',
        }}
      >
        {/* Month Dropdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label style={{ fontSize: '0.52rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
            Month
          </label>
          <select
            value={currentMonth}
            onChange={(e) => updateDatePart({ month: Number(e.target.value) })}
            style={selectStyle}
          >
            {MONTH_NAMES.map((name, idx) => (
              <option key={name} value={idx} style={optionStyle}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {/* Day Dropdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label style={{ fontSize: '0.52rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
            Day
          </label>
          <select
            value={currentDay}
            onChange={(e) => updateDatePart({ day: Number(e.target.value) })}
            style={selectStyle}
          >
            {daysArray.map((d) => (
              <option key={d} value={d} style={optionStyle}>
                {String(d).padStart(2, '0')}
              </option>
            ))}
          </select>
        </div>

        {/* Hour Dropdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label style={{ fontSize: '0.52rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
            Hour
          </label>
          <select
            value={currentHours}
            onChange={(e) => updateDatePart({ hours: Number(e.target.value) })}
            style={{ ...selectStyle, color: '#fbbf24', fontWeight: 700 }}
          >
            {hoursArray.map((h) => (
              <option key={h} value={h} style={optionStyle}>
                {String(h).padStart(2, '0')} h
              </option>
            ))}
          </select>
        </div>

        {/* Minute Dropdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label style={{ fontSize: '0.52rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
            Min
          </label>
          <select
            value={minutesArray.includes(currentMinutes) ? currentMinutes : 0}
            onChange={(e) => updateDatePart({ minutes: Number(e.target.value) })}
            style={{ ...selectStyle, color: '#fbbf24', fontWeight: 700 }}
          >
            {minutesArray.map((m) => (
              <option key={m} value={m} style={optionStyle}>
                :{String(m).padStart(2, '0')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Quick Diurnal Presets Bar: Solar Noon, 02:00 Min, Now */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 2 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => handleQuickPreset(2, 0)}
            style={presetBtnStyle(currentHours === 2)}
            title="02:00 — Minimum Sea Surface Temp (-0.4°C Cooling)"
          >
            🌙 02:00 Min
          </button>
          <button
            type="button"
            onClick={() => handleQuickPreset(14, 0)}
            style={presetBtnStyle(currentHours === 14)}
            title="14:00 — Solar Noon Peak Heating (+0.4°C Warming)"
          >
            ☀️ 14:00 Max
          </button>
          <button
            type="button"
            onClick={() => handleQuickPreset(16, 30)}
            style={presetBtnStyle(currentHours === 16)}
            title="16:30 — Peak Photosynthetic Oxygen Production"
          >
            🌿 16:30 O₂
          </button>
        </div>

        <button
          type="button"
          onClick={handleNow}
          style={{
            ...presetBtnStyle(false),
            background: 'rgba(0, 229, 255, 0.15)',
            border: '1px solid rgba(0, 229, 255, 0.4)',
            color: '#00f0ff',
            fontWeight: 700,
          }}
          title="Reset to current local device clock"
        >
          ⏱ Now
        </button>
      </div>
    </div>
  );
}

const selectStyle = {
  background: 'rgba(8, 25, 54, 0.85)',
  border: '1px solid rgba(0, 229, 255, 0.28)',
  borderRadius: '6px',
  color: '#f8fafc',
  padding: '4px 6px',
  fontSize: '0.72rem',
  fontFamily: 'Space Mono, monospace',
  cursor: 'pointer',
  outline: 'none',
  width: '100%',
};

const optionStyle = {
  background: '#041026',
  color: '#e2e8f0',
};

const presetBtnStyle = (isActive) => ({
  background: isActive ? 'rgba(251, 191, 36, 0.22)' : 'rgba(255, 255, 255, 0.05)',
  border: isActive ? '1px solid rgba(251, 191, 36, 0.5)' : '1px solid rgba(255, 255, 255, 0.12)',
  color: isActive ? '#fbbf24' : '#94a3b8',
  borderRadius: '5px',
  padding: '2px 6px',
  fontSize: '0.58rem',
  fontWeight: isActive ? 700 : 500,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  fontFamily: 'inherit',
});

export default DateTimePicker;
