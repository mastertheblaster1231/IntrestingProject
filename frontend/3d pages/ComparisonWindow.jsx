import React, { useState, useEffect } from 'react';
import { useComparisonStore, REGION_NAMES } from './useComparisonStore.js';
import { RegionPanel } from './RegionPanel.jsx';
import './ComparisonWindow.css';

export function ComparisonWindow() {
  const isComparisonOpen = useComparisonStore((s) => s.isComparisonOpen);
  const closeComparison = useComparisonStore((s) => s.closeComparison);
  const regions = useComparisonStore((s) => s.regions);
  const addRegion = useComparisonStore((s) => s.addRegion);
  const removeRegion = useComparisonStore((s) => s.removeRegion);
  const activeRegionId = useComparisonStore((s) => s.activeRegionId);
  const setActiveRegion = useComparisonStore((s) => s.setActiveRegion);

  const [searchInput, setSearchInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // Close with escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isComparisonOpen) {
        closeComparison();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isComparisonOpen, closeComparison]);

  if (!isComparisonOpen) return null;

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

  return (
    <div className="comparison-overlay">
      <div className="comparison-header">
        <div className="comparison-title">
          <span>📊</span> Multi-Region Ocean Data Comparison
        </div>
        <div className="comparison-add-bar">
          <div className="nav-search-container">
            <input
              type="text"
              className="comparison-add-input"
              placeholder="Add another region (e.g. Red Sea)..."
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setShowDropdown(e.target.value.length > 0);
              }}
              onFocus={() => setShowDropdown(searchInput.length > 0)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              onKeyDown={handleSearchKeyDown}
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
          <button className="comparison-close-btn" onClick={closeComparison} title="Close Comparison">
            &times;
          </button>
        </div>
      </div>

      <div className="comparison-tab-bar">
        {regions.map((r) => (
          <div
            key={r.id}
            className={`comparison-tab ${activeRegionId === r.id ? 'active' : ''}`}
            onClick={() => setActiveRegion(r.id)}
          >
            <span>📍 {r.name}</span>
            <button
              className="comparison-tab-close"
              onClick={(e) => {
                e.stopPropagation();
                removeRegion(r.id);
              }}
            >
              &times;
            </button>
          </div>
        ))}
        {regions.length === 0 && (
          <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            No regions active. Use the search bar above to add one.
          </div>
        )}
      </div>

      <div className="comparison-body">
        {regions.map((r) => (
          <RegionPanel key={r.id} region={r} />
        ))}
      </div>
    </div>
  );
}
