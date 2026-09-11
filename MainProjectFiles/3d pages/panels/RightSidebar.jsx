import React from 'react';
import { TelemetryPanel } from './TelemetryPanel.jsx';

/**
 * RightSidebar.jsx — Re-exports TelemetryPanel for backward compatibility.
 */
export function RightSidebar() {
  return (
    <div className="relative z-[100] overflow-visible w-full h-full">
      <TelemetryPanel />
    </div>
  );
}

export default RightSidebar;
