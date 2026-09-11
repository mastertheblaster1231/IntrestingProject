import React, { useState, useEffect, useCallback } from 'react';

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

  const handleOpenIngest = useCallback(() => {
    if (window.openDataIngestModal) {
      window.openDataIngestModal();
    } else {
      const modal = document.getElementById('dataIngestModal');
      if (modal) {
        modal.classList.add('open');
        modal.style.display = 'flex';
      }
    }
  }, []);

  const getTimeLabel = () => {
    if (timeOffset === 0) return 'Now (0h)';
    return `${timeOffset > 0 ? '+' : ''}${timeOffset}h`;
  };

  const [activeTab, setActiveTab] = useState('3d');
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

      {/* Center cluster: Navigation View Mode Tabs */}
      <div className="navbar-cluster navbar-cluster--center">
        <div className="nav-tabs-group">
          <button
            className={`nav-view-tab ${activeTab === '3d' ? 'nav-view-tab--active' : ''}`}
            onClick={() => setActiveTab('3d')}
          >
            <span>🌐</span>
            <span>3D View</span>
          </button>
          <button
            className={`nav-view-tab ${activeTab === 'map' ? 'nav-view-tab--active' : ''}`}
            onClick={() => {
              setActiveTab('map');
              if (window.location) window.location.href = '/mapview.html';
            }}
          >
            <span>📍</span>
            <span>Map</span>
          </button>
          <button
            className={`nav-view-tab ${activeTab === 'analysis' ? 'nav-view-tab--active' : ''}`}
            onClick={() => {
              setActiveTab('analysis');
              const dock = document.querySelector('.analytics-dock');
              if (dock) dock.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            <span>📊</span>
            <span>Analysis</span>
          </button>
          <button
            className={`nav-view-tab ${activeTab === 'sources' ? 'nav-view-tab--active' : ''}`}
            onClick={() => {
              setActiveTab('sources');
              handleOpenIngest();
            }}
          >
            <span>🗄️</span>
            <span>Data Sources</span>
          </button>
          <button
            className={`nav-view-tab ${activeTab === 'settings' ? 'nav-view-tab--active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <span>⚙️</span>
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* Right cluster: Timeline & Environment Controls */}
      <div className="navbar-cluster">
        {/* Play/Pause */}
        <button className="nav-play-circle" onClick={handlePlayToggle} title={isPlaying ? 'Pause' : 'Play Timeline'}>
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* Timeline bar with time readout */}
        <div className="nav-timeline-bar">
          <div className="nav-timeline-track">
            <input
              type="range"
              className="panel-slider nav-timeline-slider"
              min="-72"
              max="72"
              step="3"
              value={timeOffset}
              onChange={handleTimeChange}
            />
          </div>
          <span className="nav-timeline-date">09 Sep 2026 17:42 UTC</span>
        </div>

        {/* Step buttons */}
        <div className="nav-step-group">
          <button className="nav-step-btn" onClick={handleStepBack} title="Step Back 6h">«</button>
          <button className="nav-step-btn" onClick={handleStepForward} title="Step Forward 6h">»</button>
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
