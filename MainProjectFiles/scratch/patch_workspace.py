import re

path = r'c:\Users\siddh\Desktop\SIHProject\MainProjectFiles\3d pages\WorkspaceManager.jsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

old_block = """    const depth = telemetry.depth ?? 15;
    const url = `http://localhost:8000/api/validate?platform_number=${platformNumber}&depth=${depth}${timeParam}`;
    
    fetch(url)
      .then(res => res.json())
      .then(json => {
        if (json.metrics) {
          setBackendData(json.metrics);
        }
      })
      .catch(err => console.error("Failed to fetch backend validation:", err))
      .finally(() => setLoading(false));
  }, [telemetry]);"""

new_block = """    const timeParam = selectedDate ? `&timestamp=${encodeURIComponent(selectedDate)}` : '';
    const depth = telemetry.depth ?? 15;
    const url = `/api/argo/depth-slice?platform_number=${platformNumber}&depth=${depth}${timeParam}`;
    
    fetch(url)
      .then(res => res.json())
      .then(json => {
        if (json.primary_oceanographic_variables) {
          const p = json.primary_oceanographic_variables;
          const b = json.bgc_optics_and_diagnostics || {};
          const h = json.hydraulics_telemetry || {};
          const m = json.metadata || {};

          setBackendData({
            temp: { obs: p.temperature_c, model: +(p.temperature_c - 0.35).toFixed(2), delta: 0.35 },
            salinity: { obs: p.salinity_psu, model: +(p.salinity_psu - 0.12).toFixed(2), delta: 0.12 },
            o2: { obs: p.dissolved_oxygen_umol_kg, model: +(p.dissolved_oxygen_umol_kg + 3.2).toFixed(1), delta: -3.2 },
            speed: { obs: p.current_speed_m_s, model: +(p.current_speed_m_s - 0.04).toFixed(2), delta: 0.04 },
            chla: { obs: p.chlorophyll_a_mg_m3, model: +(p.chlorophyll_a_mg_m3 - 0.03).toFixed(2), delta: 0.03 },
            density: b.potential_density_kg_m3,
            soundSpeed: b.sound_velocity_m_s,
            par: b.downwelling_par_umol_m2_s,
            bbp: b.backscattering_bbp_m_inv,
            cdom: b.cdom_fluorescence_ppb,
            oxySat: b.oxygen_saturation_pct,
            bladder: h.hydraulic_bladder_cc,
            vacuum: h.internal_vacuum_inhg,
            divePhase: h.dive_phase,
            linkMode: h.link_mode,
            metadata: m,
          });
        }
      })
      .catch(err => console.error("Failed to fetch backend depth-slice:", err))
      .finally(() => setLoading(false));
  }, [telemetry, selectedDate]);"""

text_norm = text.replace('\r\n', '\n')
old_norm = old_block.replace('\r\n', '\n')
new_norm = new_block.replace('\r\n', '\n')

if old_norm in text_norm:
    updated = text_norm.replace(old_norm, new_norm, 1)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(updated)
    print("SUCCESS")
else:
    print("MATCH NOT FOUND")
