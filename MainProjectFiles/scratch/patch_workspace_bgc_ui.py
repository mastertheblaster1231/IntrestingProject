path = r'c:\Users\siddh\Desktop\SIHProject\MainProjectFiles\3d pages\WorkspaceManager.jsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

target = """      {/* QC & Confidence Footer */}
      <div
        style={{
          marginTop: 8,
          paddingTop: 6,
          borderTop: '1px dashed rgba(0, 229, 255, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.62rem',
        }}
      >
        <span className="qc-badge qc-badge--good" style={{ fontSize: '0.58rem', padding: '1px 6px' }}>
          ● Validated (QC Passed)
        </span>
        <span style={{ color: '#00e5ff', fontFamily: 'Space Mono' }}>
          Residual Bias: {Math.abs(deltaTemp) <= 0.4 ? 'Optimal Match' : 'Moderate'}
        </span>
      </div>"""

replacement = """      {/* BGC Optics & Float Mechanics Strip (FastAPI /api/argo/depth-slice) */}
      {backendData && (backendData.density != null || backendData.soundSpeed != null || backendData.bladder != null) && (
        <div
          style={{
            marginTop: 6,
            padding: '5px 8px',
            background: 'rgba(0, 229, 255, 0.04)',
            borderRadius: 6,
            border: '1px solid rgba(0, 229, 255, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            fontSize: '0.60rem',
            fontFamily: 'var(--ws-font-mono, monospace)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
            <span>🌊 UNESCO Density: <strong style={{ color: '#38bdf8' }}>{backendData.density ?? '--'} kg/m³</strong></span>
            <span>🔊 Sound Speed: <strong style={{ color: '#38bdf8' }}>{backendData.soundSpeed ?? '--'} m/s</strong></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
            <span>☀️ PAR: <strong style={{ color: '#fbbf24' }}>{backendData.par ?? '--'} μmol/m²·s</strong></span>
            <span>🌿 CDOM: <strong style={{ color: '#a78bfa' }}>{backendData.cdom ?? '--'} ppb</strong></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
            <span>🎈 Bladder: <strong style={{ color: '#4ade80' }}>{backendData.bladder ?? '--'} cc</strong></span>
            <span>⚡ Phase: <strong style={{ color: '#4ade80' }}>{backendData.divePhase ?? '--'}</strong></span>
          </div>
        </div>
      )}

      {/* QC & Confidence Footer */}
      <div
        style={{
          marginTop: 8,
          paddingTop: 6,
          borderTop: '1px dashed rgba(0, 229, 255, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.62rem',
        }}
      >
        <span className="qc-badge qc-badge--good" style={{ fontSize: '0.58rem', padding: '1px 6px' }}>
          ● Validated (QC Passed)
        </span>
        <span style={{ color: '#00e5ff', fontFamily: 'Space Mono' }}>
          Residual Bias: {Math.abs(deltaTemp) <= 0.4 ? 'Optimal Match' : 'Moderate'}
        </span>
      </div>"""

text_norm = text.replace('\r\n', '\n')
target_norm = target.replace('\r\n', '\n')
replacement_norm = replacement.replace('\r\n', '\n')

if target_norm in text_norm:
    updated = text_norm.replace(target_norm, replacement_norm, 1)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(updated)
    print("SUCCESS")
else:
    print("TARGET NOT FOUND")
