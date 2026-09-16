import React from 'react';
import { useOceanStore } from '../useOceanStore.js';

export function ColorBars() {
  const activeVariable = useOceanStore((state) => state.activeVariable);

  if (!activeVariable) return null;

  let title = '';
  let gradient = '';
  let labels = [];

  switch (activeVariable) {
    case 'temperature':
      title = 'Temperature (°C)';
      // Beautiful teal to green to yellow to orange to red to deep red
      gradient = 'linear-gradient(to right, #00b4d8, #06d6a0, #ffd166, #ff9f1c, #ef476f, #9d0208)';
      labels = ['26°C', '27°C', '28°C', '29°C', '30°C', '31°C+'];
      break;
    case 'salinity':
      title = 'Sea-surface salinity [PSU]';
      // Pink -> Purple -> Blue -> Cyan -> Green -> Yellow -> Orange -> Red -> Peach
      gradient = 'linear-gradient(to right, #f4b4f4, #b266ff, #3b82f6, #06b6d4, #4ade80, #facc15, #f97316, #ef4444, #fcd34d)';
      labels = ['31', '32', '33', '34', '35', '36', '37', '38', '39'];
      break;
    case 'chlorophyll':
      title = 'Chlorophyll Concentration (mg / m³)';
      // Dark purple -> Blue -> Cyan -> Green -> Yellow -> Orange -> Red
      gradient = 'linear-gradient(to right, #3b006b, #0000ff, #00ffff, #00ff00, #ffff00, #ff7f00, #ff0000)';
      labels = ['<0.05', '0.1', '0.3', '1', '2', '4>5'];
      break;
    default:
      return null;
  }

  return (
    <div 
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(3, 16, 42, 0.85)',
        border: '1px solid rgba(0, 229, 255, 0.3)',
        borderRadius: '8px',
        padding: '10px 14px',
        width: '100%',
        maxWidth: '350px',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ fontSize: '0.7rem', color: '#e2e8f0', fontWeight: 700, marginBottom: '8px', letterSpacing: '0.5px' }}>
        {title}
      </div>
      
      <div style={{
        width: '100%',
        height: '14px',
        background: gradient,
        borderRadius: '10px',
        marginBottom: '6px',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)'
      }} />

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.65rem',
        color: '#94a3b8',
        fontFamily: 'Space Mono, monospace',
        fontWeight: 600
      }}>
        {labels.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
    </div>
  );
}
