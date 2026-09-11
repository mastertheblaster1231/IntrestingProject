import React, { useState, useMemo } from 'react';

/**
 * AnalyticsDock — Bottom panel with 5 modular analytics cards.
 * Matches the reference image layout:
 * 1. Depth vs Variable Profile
 * 2. Model vs Observation Comparison
 * 3. Isosurface Visualization
 * 4. Glider Profile
 * 5. Data Provenance
 */
export function AnalyticsDock() {
  return (
    <div className="analytics-dock">
      <div className="analytics-cards">
        <DepthProfileCard />
        <ModelComparisonCard />
        <IsosurfaceCard />
        <GliderProfileCard />
        <DataProvenanceCard />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Card 1: Depth vs Variable Profile
   ────────────────────────────────────────────────────────────── */
function DepthProfileCard() {
  const [activeVar, setActiveVar] = useState('temperature');

  const profileData = useMemo(() => {
    const depths = [0, 50, 100, 200, 500, 1000, 1500, 2000];
    return depths.map(d => {
      let temp, sal;
      if (d <= 50) temp = 28.3 - (d / 50) * 0.4;
      else if (d <= 200) temp = 27.9 - ((d - 50) / 150) * 12.4;
      else temp = 3.8 + 24.5 * Math.exp(-d / 320);
      sal = 34.3 + (d <= 150 ? (d / 150) * 0.55 : 0.55 - ((d - 150) / 650) * 0.35);
      return { depth: d, temp: +temp.toFixed(1), sal: +sal.toFixed(2) };
    });
  }, []);

  const modelData = useMemo(() => {
    return profileData.map(p => ({
      depth: p.depth,
      temp: +(p.temp - 0.3).toFixed(1),
    }));
  }, [profileData]);

  // SVG dimensions
  const w = 180, h = 135;
  const pad = { t: 10, r: 8, b: 20, l: 30 };
  const pw = w - pad.l - pad.r;
  const ph = h - pad.t - pad.b;

  const tempToX = (t) => pad.l + (Math.max(0, Math.min(30, t)) / 30) * pw;
  const depthToY = (d) => pad.t + (Math.min(2000, d) / 2000) * ph;

  const obsPath = profileData.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${tempToX(p.temp).toFixed(1)} ${depthToY(p.depth).toFixed(1)}`
  ).join(' ');

  const modPath = modelData.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${tempToX(p.temp).toFixed(1)} ${depthToY(p.depth).toFixed(1)}`
  ).join(' ');

  return (
    <div className="analytics-card panel-animate-in">
      <div className="analytics-card__header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="analytics-card__number">1</span>
          <span className="analytics-card__title">Depth vs Variable Profile</span>
        </div>
      </div>
      <div className="analytics-card__body">
        <div className="analytics-card__subtitle">Click an instrument to view its profile.</div>
        <div className="card-tabs">
          {['Temperature', 'Salinity', 'Oxygen', 'Chlorophyll'].map(v => (
            <button
              key={v}
              className={`card-tab ${activeVar === v.toLowerCase() ? 'card-tab--active' : ''}`}
              onClick={() => setActiveVar(v.toLowerCase())}
            >
              {v}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Main SVG Curve */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
              {/* X Grid & Axis */}
              {[5, 10, 15, 20, 25, 30].map(t => (
                <g key={t}>
                  <line x1={tempToX(t)} y1={pad.t} x2={tempToX(t)} y2={pad.t + ph}
                    stroke="rgba(255,255,255,0.05)" strokeDasharray="2,2" />
                  <text x={tempToX(t)} y={h - 4} fill="#64748b" fontSize="6.5" fontFamily="var(--font-mono)" textAnchor="middle">
                    {t}
                  </text>
                </g>
              ))}
              {/* Y Grid & Axis */}
              {[0, 500, 1000, 1500, 2000].map(d => (
                <g key={d}>
                  <line x1={pad.l} y1={depthToY(d)} x2={pad.l + pw} y2={depthToY(d)}
                    stroke="rgba(255,255,255,0.05)" strokeDasharray="2,2" />
                  <text x={pad.l - 4} y={depthToY(d) + 2.5} fill="#64748b" fontSize="6.5"
                    fontFamily="var(--font-mono)" textAnchor="end">{d}</text>
                </g>
              ))}

              {/* Sunlight zone band */}
              <rect x={pad.l} y={pad.t} width={pw} height={depthToY(200) - pad.t}
                fill="rgba(0, 229, 255, 0.04)" />

              {/* Model curve (dashed blue) */}
              <path d={modPath} fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="4,2" />
              {/* Observation curve (solid amber) */}
              <path d={obsPath} fill="none" stroke="#ff9436" strokeWidth="2" strokeLinecap="round" />

              {/* Observation data point dots */}
              {profileData.map((p, idx) => (
                <circle key={idx} cx={tempToX(p.temp)} cy={depthToY(p.depth)} r="2.2" fill="#ff9436" stroke="#0b1426" strokeWidth="1" />
              ))}
            </svg>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, fontSize: '0.6rem', color: '#94a3b8', marginTop: 2 }}>
              <span><span style={{ color: '#38bdf8' }}>---</span> Model</span>
              <span><span style={{ color: '#ff9436' }}>—●</span> Argo</span>
            </div>
          </div>

          {/* Right Summary Box */}
          <div style={{
            width: 82,
            padding: '6px 8px',
            background: 'rgba(6, 18, 38, 0.6)',
            borderRadius: 6,
            border: '1px solid var(--panel-border-subtle)',
            fontSize: '0.62rem',
            display: 'flex',
            flexDirection: 'column',
            gap: 4
          }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.58rem' }}>Surface (0 m)</div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Model:</span>
              <span className="text-mono" style={{ color: '#38bdf8' }}>28.0°C</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Argo:</span>
              <span className="text-mono" style={{ color: '#ff9436' }}>28.3°C</span>
            </div>
            <div className="divider-line" style={{ margin: '2px 0' }} />
            <div style={{ color: 'var(--text-muted)', fontSize: '0.58rem' }}>Depth: 500 m</div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Model:</span>
              <span className="text-mono" style={{ color: '#38bdf8' }}>18.2°C</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Argo:</span>
              <span className="text-mono" style={{ color: '#ff9436' }}>18.7°C</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span style={{ color: 'var(--text-muted)' }}>Diff:</span>
              <span className="text-mono text-emerald">+0.3°C</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Card 2: Model vs Observation Comparison
   ────────────────────────────────────────────────────────────── */
function ModelComparisonCard() {
  const [activeVar, setActiveVar] = useState('temperature');

  // Mini comparison curve
  const w = 80, h = 95;
  const pad = { t: 8, r: 6, b: 18, l: 20 };
  const pw = w - pad.l - pad.r;
  const ph = h - pad.t - pad.b;

  const tempToX = (t) => pad.l + ((t - 5) / 25) * pw;
  const depthToY = (d) => pad.t + (d / 2000) * ph;

  const pts = [
    { d: 0, m: 28, a: 28.3 },
    { d: 500, m: 18.2, a: 18.7 },
    { d: 1000, m: 9.5, a: 9.9 },
    { d: 1500, m: 6.2, a: 6.5 },
    { d: 2000, m: 4.1, a: 4.3 }
  ];

  const modD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${tempToX(p.m).toFixed(1)} ${depthToY(p.d).toFixed(1)}`).join(' ');
  const argD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${tempToX(p.a).toFixed(1)} ${depthToY(p.d).toFixed(1)}`).join(' ');

  return (
    <div className="analytics-card panel-animate-in" style={{ animationDelay: '0.05s' }}>
      <div className="analytics-card__header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="analytics-card__number">2</span>
          <span className="analytics-card__title">Model vs Observation Comparison</span>
        </div>
      </div>
      <div className="analytics-card__body">
        <div className="analytics-card__subtitle">Overlay model and observation data.</div>
        <div className="card-tabs">
          {['Temperature', 'Salinity', 'Oxygen'].map(v => (
            <button
              key={v}
              className={`card-tab ${activeVar === v.toLowerCase() ? 'card-tab--active' : ''}`}
              onClick={() => setActiveVar(v.toLowerCase())}
            >
              {v}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
          {/* Left Values Comparison Box */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Temperature @ 500 m</div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{
                padding: '4px 8px',
                background: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flex: 1
              }}>
                <span style={{ color: '#38bdf8', fontSize: '0.62rem' }}>Model</span>
                <span className="text-mono" style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.74rem' }}>12.4°C</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{
                padding: '4px 8px',
                background: 'rgba(255, 148, 54, 0.12)',
                border: '1px solid rgba(255, 148, 54, 0.3)',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flex: 1
              }}>
                <span style={{ color: '#ff9436', fontSize: '0.62rem' }}>Argo</span>
                <span className="text-mono" style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.74rem' }}>12.1°C</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.64rem', padding: '0 2px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Difference</span>
              <span className="text-mono text-emerald" style={{ fontWeight: 700 }}>-0.3°C</span>
            </div>
          </div>

          {/* Right Mini Depth Curve */}
          <div style={{ width: 85, flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, fontSize: '0.55rem', color: '#94a3b8', marginBottom: 2 }}>
              <span><span style={{ color: '#38bdf8' }}>—</span> Model</span>
              <span><span style={{ color: '#ff9436' }}>—●</span> Argo</span>
            </div>
            <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
              {[5, 15, 25].map(t => (
                <text key={t} x={tempToX(t)} y={h - 3} fill="#64748b" fontSize="6" fontFamily="var(--font-mono)" textAnchor="middle">{t}</text>
              ))}
              <text x={w / 2} y={h + 1} fill="#64748b" fontSize="5.5" textAnchor="middle">Temp (°C)</text>
              {[0, 1000, 2000].map(d => (
                <g key={d}>
                  <line x1={pad.l} y1={depthToY(d)} x2={pad.l + pw} y2={depthToY(d)} stroke="rgba(255,255,255,0.05)" />
                  <text x={pad.l - 3} y={depthToY(d) + 2} fill="#64748b" fontSize="5.5" fontFamily="var(--font-mono)" textAnchor="end">{d}</text>
                </g>
              ))}
              <path d={modD} fill="none" stroke="#38bdf8" strokeWidth="1.2" strokeDasharray="3,2" />
              <path d={argD} fill="none" stroke="#ff9436" strokeWidth="1.6" />
              {pts.map((p, idx) => (
                <circle key={idx} cx={tempToX(p.a)} cy={depthToY(p.d)} r="1.8" fill="#ff9436" />
              ))}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Card 3: Isosurface Visualization
   ────────────────────────────────────────────────────────────── */
function IsosurfaceCard() {
  const [isoVar, setIsoVar] = useState('temperature');
  const [isoValue, setIsoValue] = useState(25);
  const [isoOpacity, setIsoOpacity] = useState(60);
  const [showIso, setShowIso] = useState(true);

  return (
    <div className="analytics-card panel-animate-in" style={{ animationDelay: '0.1s' }}>
      <div className="analytics-card__header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="analytics-card__number">3</span>
          <span className="analytics-card__title">Isosurface Visualization</span>
        </div>
      </div>
      <div className="analytics-card__body">
        <div className="analytics-card__subtitle">Show regions with specific values.</div>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          {/* Controls Left */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="slider-row" style={{ marginTop: 2 }}>
              <div className="slider-row__header">
                <span>Variable</span>
              </div>
              <select className="panel-select" value={isoVar} onChange={(e) => setIsoVar(e.target.value)}>
                <option value="temperature">Temperature</option>
                <option value="salinity">Salinity</option>
                <option value="oxygen">Oxygen</option>
              </select>
            </div>

            <div className="slider-row">
              <div className="slider-row__header">
                <span>Value</span>
                <span className="slider-row__value">{isoValue} °C</span>
              </div>
              <input
                type="range" className="panel-slider"
                min="5" max="30" step="1"
                value={isoValue}
                onChange={(e) => setIsoValue(parseInt(e.target.value))}
              />
            </div>

            <div className="slider-row">
              <div className="slider-row__header">
                <span>Opacity</span>
                <span className="slider-row__value">{isoOpacity}%</span>
              </div>
              <input
                type="range" className="panel-slider"
                min="10" max="100" step="5"
                value={isoOpacity}
                onChange={(e) => setIsoOpacity(parseInt(e.target.value))}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>Show Isosurface</span>
              <input
                type="checkbox"
                checked={showIso}
                onChange={() => setShowIso(p => !p)}
                style={{ accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* 3D Envelope Preview Right */}
          <div style={{ width: 85, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: 85,
              height: 68,
              borderRadius: 8,
              border: '1px solid rgba(0, 229, 255, 0.25)',
              background: 'radial-gradient(ellipse at center, rgba(14, 30, 60, 0.9) 0%, rgba(4, 12, 28, 0.95) 100%)',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'inset 0 0 16px rgba(0, 229, 255, 0.1)'
            }}>
              {/* Volumetric grid lines */}
              <div style={{
                position: 'absolute', inset: 4,
                border: '1px dashed rgba(0, 229, 255, 0.2)',
                borderRadius: 4,
              }} />
              {/* Thermal Isosurface Blob Illustration */}
              <svg viewBox="0 0 60 45" style={{ width: '85%', height: '85%', filter: 'drop-shadow(0 0 6px rgba(255, 80, 40, 0.5))' }}>
                <defs>
                  <radialGradient id="isoGrad" cx="45%" cy="40%" r="55%">
                    <stop offset="0%" stopColor="#ff4500" stopOpacity="0.85" />
                    <stop offset="60%" stopColor="#ff8c00" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#00e5ff" stopOpacity="0.2" />
                  </radialGradient>
                </defs>
                <path d="M 12 24 C 8 16, 20 8, 32 10 C 44 12, 54 18, 50 28 C 46 38, 30 36, 22 34 C 14 32, 16 32, 12 24 Z"
                  fill="url(#isoGrad)" stroke="rgba(255, 120, 50, 0.8)" strokeWidth="1" />
                <path d="M 18 22 C 24 16, 38 18, 44 24" fill="none" stroke="rgba(255, 220, 100, 0.6)" strokeWidth="0.8" strokeDasharray="2,2" />
              </svg>
            </div>

            {/* Micro Colorbar below */}
            <div style={{ width: '100%', marginTop: 4 }}>
              <div style={{
                height: 5, borderRadius: 2,
                background: 'linear-gradient(90deg, #0d47a1, #00e5ff, #10b981, #f59e0b, #ef4444)'
              }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.52rem', color: '#64748b', marginTop: 1 }}>
                <span>15</span>
                <span>20</span>
                <span>25</span>
                <span>30</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Card 4: Glider Profile
   ────────────────────────────────────────────────────────────── */
function GliderProfileCard() {
  return (
    <div className="analytics-card panel-animate-in" style={{ animationDelay: '0.15s' }}>
      <div className="analytics-card__header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="analytics-card__number">4</span>
          <span className="analytics-card__title">Glider Profile</span>
        </div>
      </div>
      <div className="analytics-card__body">
        <div className="analytics-card__subtitle">Explore glider mission data.</div>

        <div style={{
          padding: '6px 8px',
          background: 'rgba(6, 18, 38, 0.6)',
          borderRadius: 8,
          border: '1px solid var(--panel-border-subtle)',
          marginTop: 4,
          marginBottom: 6,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: '0.78rem', color: '#f8fafc' }}>Glider #G102</span>
            <span className="telemetry-status-pill" style={{ fontSize: '0.56rem', padding: '2px 6px' }}>ACTIVE</span>
          </div>

          {/* Glider Illustration */}
          <div style={{
            height: 38,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(2, 7, 19, 0.5)',
            borderRadius: 6,
            marginBottom: 6,
            border: '1px solid rgba(0, 229, 255, 0.1)',
            overflow: 'hidden'
          }}>
            <svg viewBox="0 0 160 32" style={{ width: '90%', height: '100%' }}>
              {/* Yellow autonomous glider: fuselage, wings, fin, antenna */}
              {/* Main yellow body */}
              <path d="M 30 16 C 30 11, 45 10, 115 11 C 128 11, 138 14, 142 16 C 138 18, 128 21, 115 21 C 45 22, 30 21, 30 16 Z"
                fill="#f59e0b" stroke="#d97706" strokeWidth="1" />
              {/* Nose cone */}
              <polygon points="142,16 154,16 142,17" fill="#fbbf24" stroke="#d97706" strokeWidth="0.8" />
              {/* Antenna */}
              <line x1="142" y1="16" x2="158" y2="16" stroke="#f8fafc" strokeWidth="0.9" />
              {/* Swept wings */}
              <polygon points="75,13 60,3 70,3 90,13" fill="#fbbf24" stroke="#b45309" strokeWidth="0.8" />
              <polygon points="75,19 60,29 70,29 90,19" fill="#d97706" stroke="#92400e" strokeWidth="0.8" />
              {/* Tail fin rudder */}
              <polygon points="34,14 24,6 30,6 40,14" fill="#fbbf24" stroke="#b45309" strokeWidth="0.8" />
              {/* Status beacon on tail */}
              <circle cx="28" cy="8" r="1.5" fill="#00e5ff" />
              {/* Body markings */}
              <line x1="60" y1="12" x2="60" y2="20" stroke="#78350f" strokeWidth="0.8" />
              <line x1="100" y1="12" x2="100" y2="20" stroke="#78350f" strokeWidth="0.8" />
              <text x="80" y="17" fill="#1e293b" fontSize="4.5" fontFamily="var(--font-mono)" fontWeight="bold">SG-102</text>
            </svg>
          </div>

          <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Mission</span>
              <span className="text-mono" style={{ color: 'var(--text-primary)' }}>Andaman Sea Survey</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Depth Range</span>
              <span className="text-mono" style={{ color: 'var(--text-primary)' }}>0 – 1000 m</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Speed / Direction</span>
              <span className="text-mono" style={{ color: 'var(--text-primary)' }}>0.35 m/s • NE (42°)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Last Observation</span>
              <span className="text-mono" style={{ color: 'var(--text-primary)' }}>09 Sep 2026 17:32 UTC</span>
            </div>
          </div>
        </div>

        <div className="telemetry-actions">
          <button className="telemetry-action-btn" style={{ fontSize: '0.64rem' }}>View Profile</button>
          <button className="telemetry-action-btn" style={{ fontSize: '0.64rem' }}>Trajectory</button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Card 5: Data Provenance
   ────────────────────────────────────────────────────────────── */
function DataProvenanceCard() {
  return (
    <div className="analytics-card panel-animate-in" style={{ animationDelay: '0.2s' }}>
      <div className="analytics-card__header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="analytics-card__number">5</span>
          <span className="analytics-card__title">Data Provenance</span>
        </div>
      </div>
      <div className="analytics-card__body">
        <div className="analytics-card__subtitle">See where the data comes from.</div>

        <table className="prov-table" style={{ marginTop: 4 }}>
          <tbody>
            <tr>
              <td>Variable</td>
              <td style={{ color: '#38bdf8' }}>Temperature</td>
            </tr>
            <tr>
              <td>Instrument</td>
              <td>Argo #2902351</td>
            </tr>
            <tr>
              <td>Depth</td>
              <td>500 m</td>
            </tr>
            <tr>
              <td>Timestamp</td>
              <td>09 Sep 2026 17:42 UTC</td>
            </tr>
            <tr>
              <td>Source</td>
              <td>INCOIS / Argo</td>
            </tr>
            <tr>
              <td>Format</td>
              <td>NetCDF (CF)</td>
            </tr>
            <tr>
              <td>QC Status</td>
              <td><span className="qc-badge qc-badge--good">● Good</span></td>
            </tr>
            <tr>
              <td>Processing</td>
              <td>Quality Controlled</td>
            </tr>
          </tbody>
        </table>

        <div className="divider-line" style={{ margin: '4px 0' }} />
        <div style={{ display: 'flex', gap: 6, fontSize: '0.58rem', justifyContent: 'center' }}>
          <span style={{
            padding: '2px 8px', borderRadius: 4,
            background: 'rgba(0,229,255,0.06)', color: 'var(--accent-cyan-dim)',
            border: '1px solid rgba(0,229,255,0.18)',
          }}>OGC WMS/WCS</span>
          <span style={{
            padding: '2px 8px', borderRadius: 4,
            background: 'rgba(0,229,255,0.06)', color: 'var(--accent-cyan-dim)',
            border: '1px solid rgba(0,229,255,0.18)',
          }}>CF Conventions</span>
        </div>
      </div>
    </div>
  );
}

export default AnalyticsDock;
