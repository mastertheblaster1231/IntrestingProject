path = r'c:\Users\siddh\Desktop\SIHProject\MainProjectFiles\ocean.html'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

target1 = """        <!-- 📊 Data Quality -->
        <div class="desc-metric-row" data-param="quality">
          <span class="desc-lbl">
            <span>📊 Data Quality</span>
            <span class="info-circle-btn" data-glossary="quality" title="Quality Control QC Flag Definition">ⓘ</span>
          </span>
          <span class="desc-val quality-badge" id="descQuality">GOOD</span>
        </div>
      </div>"""

replacement1 = """        <!-- 📊 Data Quality -->
        <div class="desc-metric-row" data-param="quality">
          <span class="desc-lbl">
            <span>📊 Data Quality</span>
            <span class="info-circle-btn" data-glossary="quality" title="Quality Control QC Flag Definition">ⓘ</span>
          </span>
          <span class="desc-val quality-badge" id="descQuality">GOOD</span>
        </div>

        <div class="desc-sub-divider"></div>

        <!-- 🌊 UNESCO Potential Density -->
        <div class="desc-metric-row" data-param="density">
          <span class="desc-lbl">
            <span>🌊 Potential Density</span>
            <span class="info-circle-btn" data-glossary="density" title="UNESCO EOS-80 Seawater Density">ⓘ</span>
          </span>
          <span class="desc-val" id="descDensity" style="color: #38bdf8;">1026.4 kg/m³</span>
        </div>

        <!-- 🔊 Sound Speed -->
        <div class="desc-metric-row" data-param="sound_speed">
          <span class="desc-lbl">
            <span>🔊 Sound Speed</span>
            <span class="info-circle-btn" data-glossary="sound_speed" title="Chen & Millero Seawater Sound Speed">ⓘ</span>
          </span>
          <span class="desc-val" id="descSoundSpeed" style="color: #38bdf8;">1540.2 m/s</span>
        </div>

        <!-- ☀️ Downwelling PAR -->
        <div class="desc-metric-row" data-param="par">
          <span class="desc-lbl">
            <span>☀️ Downwelling PAR</span>
            <span class="info-circle-btn" data-glossary="par" title="Photosynthetically Active Radiation">ⓘ</span>
          </span>
          <span class="desc-val" id="descPar" style="color: #fbbf24;">1420 μmol/m²·s</span>
        </div>

        <!-- 🧪 CDOM -->
        <div class="desc-metric-row" data-param="cdom">
          <span class="desc-lbl">
            <span>🧪 CDOM</span>
            <span class="info-circle-btn" data-glossary="cdom" title="Chromophoric Dissolved Organic Matter">ⓘ</span>
          </span>
          <span class="desc-val" id="descCdom" style="color: #c084fc;">1.45 ppb</span>
        </div>
      </div>"""

target2 = """          <div class="mission-item">
            <span class="mission-lbl">Battery</span>
            <span class="mission-val battery-val" id="descBattery">82%</span>
          </div>
        </div>"""

replacement2 = """          <div class="mission-item">
            <span class="mission-lbl">Battery</span>
            <span class="mission-val battery-val" id="descBattery">82%</span>
          </div>
          <div class="mission-item">
            <span class="mission-lbl">Bladder</span>
            <span class="mission-val" id="descBladder" style="color: #4ade80;">450 cc</span>
          </div>
          <div class="mission-item">
            <span class="mission-lbl">Vacuum</span>
            <span class="mission-val" id="descVacuum" style="color: #38bdf8;">8.5 inHg</span>
          </div>
          <div class="mission-item">
            <span class="mission-lbl">Phase</span>
            <span class="mission-val" id="descDivePhase" style="color: #a78bfa; font-size: 0.65rem;">Surface</span>
          </div>
        </div>"""

text_norm = text.replace('\r\n', '\n')
target1_norm = target1.replace('\r\n', '\n')
replacement1_norm = replacement1.replace('\r\n', '\n')
target2_norm = target2.replace('\r\n', '\n')
replacement2_norm = replacement2.replace('\r\n', '\n')

if target1_norm in text_norm and target2_norm in text_norm:
    text_norm = text_norm.replace(target1_norm, replacement1_norm, 1)
    text_norm = text_norm.replace(target2_norm, replacement2_norm, 1)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text_norm)
    print("SUCCESS")
else:
    print("TARGET NOT FOUND:", target1_norm in text_norm, target2_norm in text_norm)
