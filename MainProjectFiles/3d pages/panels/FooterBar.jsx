import React from 'react';

/**
 * FooterBar — INCOIS branding footer with quick links.
 * Compact single-row strip at the bottom of the dashboard.
 */
export function FooterBar() {
  return (
    <footer className="ocean-footer">
      <div className="footer-brand">
        <span className="footer-brand__logo">INCOIS</span>
        <span>Indian National Centre for Ocean Information Services</span>
      </div>

      <div className="footer-links">
        <span className="footer-link">🌊 Better Forecasts</span>
        <span className="footer-link">🛡️ Safer Oceans</span>
        <span className="footer-link">🐟 Sustainable Fisheries</span>
        <span className="footer-link">🌍 Climate Resilience</span>
        <span className="footer-link">🔬 Science for All</span>
      </div>
    </footer>
  );
}

export default FooterBar;
