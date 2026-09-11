import React from 'react';
import { FleetBar } from '../FleetBar.jsx';

/**
 * SectorFleetBar
 * ==============
 * Sector Fleet bottom navigation bar component for oceanographic visualization dashboard.
 * Encapsulates the 3 primary instruments (Argo profiling float, Slocum glider, and shipboard CTD rosette)
 * with the SECTOR FLEET badge, '+' Add Instrument button, dynamic active state highlighting,
 * and view mode toggles.
 */
export function SectorFleetBar(props) {
  return <FleetBar {...props} />;
}

export default SectorFleetBar;
