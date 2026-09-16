import React from 'react';
import { TelemetryPanel } from './TelemetryPanel.jsx';

/**
 * RightPanel.jsx — Re-exports TelemetryPanel for backward compatibility.
 */
export function RightPanel() {
  return (
    <div className="relative z-[100] overflow-visible w-full h-full">
      <TelemetryPanel />
    </div>
  );
}

export default RightPanel;

