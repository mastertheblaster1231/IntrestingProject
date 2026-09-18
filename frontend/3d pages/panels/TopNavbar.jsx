import React, { useState, useEffect, useCallback } from 'react';
import { useLiveTime } from '../hooks/useLiveTime.js';
import { useOceanStore } from '../useOceanStore.js';
import { useComparisonStore, REGION_NAMES } from '../useComparisonStore.js';
/**
 * TopNavbar — React version of the ocean top navigation bar.
 * Contains: Back to Globe, Zone indicator, Role switcher,
 * Temporal playback, MHW alert, and action tool buttons.
 */
export function TopNavbar() {
  const [role, setRole] = useState('forecaster');
  const [timeOffset, setTimeOffset] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoneText, setZoneText] = useState('0m · Sunlight Zone (Epipelagic)');
  const [zoneDotColor, setZoneDotColor] = useState('#ffe042');
  const [mhwStatus, setMhwStatus] = useState('Normal');

  const selectedTimestamp = useOceanStore((state) => state.selectedTimestamp);

  // Comparison Store
  const toggleSearch = useComparisonStore((s) => s.toggleSearch);
  const isSearchOpen = useComparisonStore((s) => s.isSearchOpen);
  const addRegion = useComparisonStore((s) => s.addRegion);
  const [searchInput, setSearchInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredRegions = REGION_NAMES.filter(
    (name) => name.toLowerCase().includes(searchInput.toLowerCase())
  );

  const handleSelectRegion = (name) => {
    addRegion(name);
    setSearchInput('');
    setShowDropdown(false);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && filteredRegions.length > 0) {
      handleSelectRegion(filteredRegions[0]);
    }
  };
  // Live ticking IST clock for the timeline date display
  const liveTime = useLiveTime();

  // Sync zone from OCEAN_STATE
  useEffect(() => {
    const interval = setInterval(() => {
      if (window.OCEAN_STATE) {
        const depth = window.OCEAN_STATE.currentDepth || 0;
        let text, color;
        if (depth <= 200) {
          text = `${Math.round(depth)}m · Sunlight Zone (Epipelagic)`;
          color = '#ffe042';
        } else if (depth <= 1000) {
          text = `${Math.round(depth)}m · Twilight Zone (Mesopelagic)`;
          color = '#38bdf8';
        } else if (depth <= 3000) {
          text = `${Math.round(depth)}m · Midnight Zone (Bathypelagic)`;
          color = '#6366f1';
        } else {
          text = `${Math.round(depth)}m · Abyssal Zone (Hadal)`;
          color = '#1e1b4b';
        }
        setZoneText(text);
        setZoneDotColor(color);
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handleTimeChange = useCallback((e) => {
    const val = parseInt(e.target.value);
    setTimeOffset(val);
    // Notify OCEAN_STATE if available
    if (window.OCEAN_STATE) {
      window.OCEAN_STATE.timeOffsetHours = val;
    }
  }, []);

  const handlePlayToggle = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const handleStepBack = useCallback(() => {
    setTimeOffset(prev => Math.max(-72, prev - 6));
  }, []);

  const handleStepForward = useCallback(() => {
    setTimeOffset(prev => Math.min(72, prev + 6));
  }, []);

  const handleTransitionBack = useCallback((e) => {
    e.preventDefault();
    // Trigger the existing transition function if available
    if (window.transitionBackToGlobe) {
      window.transitionBackToGlobe(e);
    } else {
      window.location.href = '/index.html';
    }
  }, []);

  const handleSnapshot = useCallback(() => {
    if (window.captureOceanSnapshot) {
      window.captureOceanSnapshot();
    }
  }, []);

  const [solarTimeName, setSolarTimeName] = useState('Daylight');

  const handleCycleEnvironment = useCallback(() => {
    if (window.cycleSolarTime) {
      window.cycleSolarTime();
    }
  }, []);

  return (
    <nav className="ocean-navbar">
      {/* Left cluster: Brand & Globe Back */}
      <div className="navbar-cluster">
        {/* Brand */}
        <div className="nav-brand">
          <div className="nav-brand__icon">
            <svg viewBox="0 0 28 28" width="26" height="26">
              <path d="M 4 10 C 8 7, 14 13, 24 10" fill="none" stroke="#00e5ff" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M 4 15 C 8 12, 14 18, 24 15" fill="none" stroke="#00b4d8" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
              <path d="M 4 20 C 8 17, 14 23, 24 20" fill="none" stroke="#0077b6" strokeWidth="1.8" strokeLinecap="round" opacity="0.6" />
            </svg>
          </div>
          <div className="nav-brand__text">
            <div className="nav-brand__title">Last Ocean</div>
            <div className="nav-brand__sub">INCOIS | Ocean Valley</div>
          </div>
        </div>

        <a
          href="/index.html"
          className="nav-back-btn"
          onClick={handleTransitionBack}
          title="Return to 3D Earth Globe"
        >
          <span>← Globe</span>
        </a>
      </div>


      {/* Right cluster: Timeline & Environment Controls */}
      <div className="navbar-cluster">
        {/* Compare Button & Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '16px' }}>
          <button className="nav-compare-btn" onClick={toggleSearch} title="Compare Regions">
            <span>+ Compare</span>
          </button>
          
          {isSearchOpen && (
            <div className="nav-search-container">
              <input
                type="text"
                className="nav-search-input"
                placeholder="Search region..."
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setShowDropdown(e.target.value.length > 0);
                }}
                onFocus={() => setShowDropdown(searchInput.length > 0)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                onKeyDown={handleSearchKeyDown}
                autoFocus
              />
              {showDropdown && filteredRegions.length > 0 && (
                <div className="nav-search-dropdown">
                  {filteredRegions.map((name) => (
                    <div
                      key={name}
                      className="nav-search-option"
                      onClick={() => handleSelectRegion(name)}
                    >
                      {name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>




        {/* Environment Cycle Button */}
        <button
          className="nav-environment-btn"
          onClick={handleCycleEnvironment}
          title="Cycle Solar Environment & Daylight"
        >
          <span style={{ fontSize: '1rem' }}>☀️</span>
          <div style={{ textAlign: 'left', lineHeight: 1.1 }}>
            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>Environment</div>
            <div style={{ fontSize: '0.66rem', color: 'var(--accent-amber-bright)', fontWeight: 600 }}>{solarTimeName}</div>
          </div>
        </button>

        {/* Snapshot Quick Action */}
        <button className="nav-action-btn" onClick={handleSnapshot} title="Capture Screenshot">
          📸
        </button>
      </div>
    </nav>
  );
}

export default TopNavbar;
