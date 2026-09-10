import{A as e,B as t,D as n,F as r,G as i,H as a,J as o,K as s,N as c,O as l,R as u,S as d,T as f,V as p,W as m,Y as h,a as g,c as _,d as v,f as y,h as b,i as ee,j as te,l as ne,n as x,o as re,q as ie,r as ae,w as oe}from"./oceanDataService-CLVl5NGP.js";var se=`/assets/8k_earth_daymap-gpFvjAck.jpg`,S={maxScale:.8,minScale:.09,zoomOutDistance:4.5,zoomInDistance:1.85,zoomCurvePower:2},C=new p;C.background=new y(132883);var w=1.5,T=new r(60,window.innerWidth/window.innerHeight,.1,1e3);T.position.set(.9,.8,-4);var E=new ee({antialias:!0,powerPreference:`high-performance`});E.setSize(window.innerWidth,window.innerHeight),E.setPixelRatio(Math.min(window.devicePixelRatio,2)),E.toneMapping=4,E.toneMappingExposure=1.1,document.body.appendChild(E.domElement);var D=new ae(T,E.domElement);D.enableDamping=!0,D.dampingFactor=.05,D.minDistance=1.8,D.maxDistance=8;var O=new re(3);O.visible=!1,C.add(O);var ce=new g(16777215,1.15);C.add(ce);var k=new b(16777215,1.85);k.position.set(5,4,-4),C.add(k);var A=new b(4227327,.85);A.position.set(-5,-2,4),C.add(A);var j=new ie().load(se,e=>{e.needsUpdate=!0});j.colorSpace=t,j.anisotropy=Math.min(E.capabilities.getMaxAnisotropy(),16),j.minFilter=l,j.magFilter=n,j.generateMipmaps=!0;var le=new m(w,128,96),ue=new c({map:j,roughness:.65,metalness:.05}),M=new e(le,ue);C.add(M);var N=new a({vertexShader:`
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`,fragmentShader:`
  uniform float uTime;
  uniform vec3 uSunDirection;
  uniform float uFogDensity;
  uniform vec3 uFogColor;
  uniform vec3 uSunColor;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  // Optimized GPU 3D Simplex noise
  vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.52;
    vec3 shift = vec3(100.0);
    for (int i = 0; i < 4; ++i) {
      v += a * snoise(p);
      p = p * 2.05 + shift;
      a *= 0.48;
    }
    return v;
  }

  void main() {
    vec3 norm = normalize(vNormal);
    vec3 worldNorm = normalize(vWorldPosition);

    // Coordinate for planetary fog & clouds
    vec3 coord = worldNorm * 2.7;

    // Atmospheric circulation drift vectors
    vec3 drift1 = vec3(uTime * 0.011, uTime * 0.005, uTime * 0.008);
    vec3 drift2 = vec3(-uTime * 0.007, uTime * 0.012, -uTime * 0.006);

    float n1 = fbm(coord + drift1);
    float n2 = fbm(coord * 2.15 + drift2);

    float compositeNoise = n1 * 0.65 + n2 * 0.35;
    // Smooth threshold creates realistic ocean mist and swirling cloud formations
    float density = smoothstep(0.06, 0.54, compositeNoise + 0.12);

    // Sun directional diffuse lighting
    float sunDot = dot(norm, normalize(uSunDirection));
    float sunDiffuse = clamp(sunDot * 0.75 + 0.25, 0.0, 1.0);

    // Cloud color: soft luminous white illuminated by sun, with cool cyan-azure ambient tint
    vec3 finalColor = mix(uFogColor, uSunColor, sunDiffuse * 0.88);

    // Soft feathered alpha: leaves the underlying 8K Earth terrain razor-sharp while providing realistic fog
    float finalAlpha = clamp(density * uFogDensity * (0.35 + 0.65 * sunDiffuse), 0.0, 0.48);

    gl_FragColor = vec4(finalColor, finalAlpha);
  }
`,uniforms:{uTime:{value:0},uSunDirection:{value:k.position.clone().normalize()},uFogDensity:{value:.42},uFogColor:{value:new y(10544895)},uSunColor:{value:new y(16777215)}},transparent:!0,depthWrite:!1,blending:1}),de=new m(w*1.008,96,64),P=new e(de,N);P.raycast=()=>{},C.add(P);var F=new a({vertexShader:`
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`,fragmentShader:`
  uniform vec3 uSunDirection;
  uniform vec3 uDayAtmosphereColor;
  uniform vec3 uTwilightColor;
  uniform float uAtmospherePower;
  uniform float uAtmosphereIntensity;
  uniform float uTime;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    vec3 norm = normalize(vNormal);

    // Inverted Fresnel: highest at the grazing edge of the globe
    float rim = 1.0 - max(0.0, dot(viewDir, norm));
    float halo = pow(rim, uAtmospherePower) * uAtmosphereIntensity;

    // Sun directional alignment
    vec3 worldNorm = normalize(vWorldPosition);
    float sunDot = dot(worldNorm, normalize(uSunDirection));
    float sunFactor = smoothstep(-0.25, 0.45, sunDot);

    // Color transition from warm twilight amber at dusk line to brilliant azure in sunlight
    vec3 haloColor = mix(uTwilightColor, uDayAtmosphereColor, smoothstep(-0.1, 0.3, sunDot));

    // Subtle atmospheric shimmer
    float shimmer = 1.0 + 0.03 * sin(uTime * 1.8 + vWorldPosition.y * 3.5);

    float alpha = clamp(halo * (sunFactor * 0.85 + 0.15) * shimmer, 0.0, 0.92);

    gl_FragColor = vec4(haloColor, alpha);
  }
`,uniforms:{uTime:{value:0},uSunDirection:{value:k.position.clone().normalize()},uDayAtmosphereColor:{value:new y(39423)},uTwilightColor:{value:new y(16739125)},uAtmospherePower:{value:3.2},uAtmosphereIntensity:{value:1.85}},transparent:!0,depthWrite:!1,blending:2}),fe=new m(w*1.022,96,64),I=new e(fe,F);I.raycast=()=>{},C.add(I);var L=[{id:`A1`,wmoId:2902345,code:`AD07`,lat:12.35,lon:78.62,sea:`Indian Ocean (Equatorial Basin)`,type:`APEX Profiling Float`},{id:`A2`,wmoId:2902346,code:`AD08`,lat:12,lon:68.5,sea:`Arabian Sea (Central Basin)`,type:`Omni Meteorological Buoy`},{id:`A3`,wmoId:2902347,code:`CB02`,altCode:`CALVAL / AD10`,lat:10.3,lon:72.5,sea:`Lakshadweep (Agatti / Kavaratti)`,type:`Coastal & CalVal Buoy`},{id:`A4`,wmoId:2902348,code:`AD09`,lat:8.2,lon:73.3,sea:`South Lakshadweep / Minicoy Channel`,type:`Deep Ocean Buoy`},{id:`A5`,wmoId:2902349,code:`CB06`,lat:13.1,lon:80.3,sea:`Bay of Bengal (Chennai Offshore)`,type:`Coastal Moored Buoy`},{id:`A6`,wmoId:2902350,code:`BD13`,lat:14,lon:87,sea:`Bay of Bengal (Central Basin)`,type:`Deep Sea Meteorological Buoy`},{id:`A7`,wmoId:2902351,code:`CB01`,lat:11.6,lon:92.5,sea:`Andaman Sea (Port Blair)`,type:`Coastal Observation Buoy`},{id:`A8`,wmoId:2902352,code:`BD12`,lat:10.5,lon:94,sea:`South Andaman Sea`,type:`Deep Sea Moored Buoy`}];function R(e,t,n){let r=(t+180)/360*2*Math.PI,i=(90-e)*(Math.PI/180),a=-n*Math.cos(r)*Math.sin(i),o=n*Math.cos(i),s=n*Math.sin(r)*Math.sin(i);return new h(a,o,s)}function pe(e,t=w){let n=e.clone().normalize(),r=90-Math.acos(Math.max(-1,Math.min(1,n.y)))*(180/Math.PI),i=Math.atan2(n.z,-n.x)*(180/Math.PI)-180;for(;i<-180;)i+=360;for(;i>180;)i-=360;return{lat:r,lon:i}}function me(e,t){let n=document.createElement(`canvas`);n.width=256,n.height=256;let r=n.getContext(`2d`);r.clearRect(0,0,n.width,n.height),r.font=`76px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`,r.textAlign=`center`,r.textBaseline=`middle`,r.shadowColor=`rgba(0, 240, 255, 0.85)`,r.shadowBlur=14,r.fillText(`⚓`,128,76),r.shadowBlur=6,r.shadowColor=`rgba(0, 0, 0, 0.85)`,r.fillStyle=`rgba(6, 18, 38, 0.92)`,r.beginPath(),r.roundRect(70,138,116,44,10),r.fill(),r.strokeStyle=`#00e5ff`,r.lineWidth=2.5,r.stroke(),r.shadowBlur=0,r.fillStyle=`#ffffff`,r.font=`bold 22px "Segoe UI", Inter, sans-serif`,r.fillText(e,128,155),r.fillStyle=`#64d2ff`,r.font=`bold 12px "Segoe UI", Inter, sans-serif`,r.fillText(t,128,171);let a=new ne(n);a.needsUpdate=!0;let o=new s({map:a,transparent:!0,depthTest:!1}),c=new i(o);return c.scale.set(S.maxScale,S.maxScale,1),c}var z=new d;C.add(z);var B=[],V=[],H=null,U=null;L.forEach(t=>{let n=R(t.lat,t.lon,w),r=R(t.lat,t.lon,1.6400000000000001),i=t.id===`A3`?16743168:61695,a=new m(.022,16,16),o=new te({color:i}),s=new e(a,o);s.position.copy(n),s.userData={id:t.id,defaultColor:i},z.add(s),V.push(s);let c=new _().setFromPoints([n,r]),l=new f({color:61695,transparent:!0,opacity:.75,linewidth:2}),u=new oe(c,l);z.add(u);let d=me(t.id,t.code);d.position.copy(r),d.userData=t,z.add(d),B.push(d)});var W=null;function G(e,t=new h(0,0,0),n=900){W={startPos:T.position.clone(),endPos:e.clone(),startLookAt:D.target.clone(),endLookAt:t.clone(),startTime:performance.now(),duration:n}}function K(e){let t=document.getElementById(`profileChartSvg`);if(!t)return;let n=e=>15+e/2e3*130,r=e=>40+(e-0)/36*250,i=e=>40+(e-32)/4.5*250,a=``;[0,500,1e3,1500,2e3].forEach(e=>{let t=n(e);a+=`<line x1="40" y1="${t}" x2="290" y2="${t}" stroke="rgba(255,255,255,0.07)" stroke-dasharray="2,2"/>`,a+=`<text x="34" y="${t+3}" fill="#6b7c93" font-size="9" text-anchor="end" font-family="'Space Mono', monospace">${e}</text>`}),a+=`<line x1="40" y1="15" x2="40" y2="145" stroke="rgba(255,255,255,0.15)"/>`,a+=`<line x1="40" y1="145" x2="290" y2="145" stroke="rgba(255,255,255,0.15)"/>`,[0,10,20,30].forEach(e=>{let t=r(e);a+=`<line x1="${t}" y1="145" x2="${t}" y2="149" stroke="#ff7a00" stroke-width="1.2"/>`,a+=`<text x="${t}" y="159" fill="#ff9436" font-size="8.5" text-anchor="middle" font-family="'Space Mono', monospace">${e}</text>`}),[32,34,36].forEach(e=>{let t=i(e);a+=`<text x="${t}" y="171" fill="#38bdf8" font-size="8.5" text-anchor="middle" font-family="'Space Mono', monospace">${e}</text>`});let o=``,s=``,c=``;e.forEach((e,t)=>{let a=n(e.depthMeters),l=r(e.temperatureC),u=i(e.salinityPSU);t===0?(o+=`M ${l} ${a}`,s+=`M ${u} ${a}`):(o+=` L ${l} ${a}`,s+=` L ${u} ${a}`),c+=`
      <circle cx="${l}" cy="${a}" r="3.2" fill="#ff7a00" stroke="#020713" stroke-width="1.5" class="chart-point" data-type="Temp" data-val="${e.temperatureC}°C" data-depth="${e.depthMeters}m" />
      <circle cx="${u}" cy="${a}" r="3.2" fill="#38bdf8" stroke="#020713" stroke-width="1.5" class="chart-point" data-type="Salinity" data-val="${e.salinityPSU} PSU" data-depth="${e.depthMeters}m" />
    `}),t.innerHTML=`
    ${a}
    <path d="${o}" fill="none" stroke="#ff7a00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    <path d="${s}" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    ${c}
  `,t.querySelectorAll(`.chart-point`).forEach(e=>{e.addEventListener(`mouseenter`,t=>{let n=e.getAttribute(`data-type`),r=e.getAttribute(`data-val`),i=e.getAttribute(`data-depth`);e.setAttribute(`r`,`5.5`);let a=document.getElementById(`chartMiniTip`);a&&(a.textContent=`${n}: ${r} @ ${i}`,a.style.opacity=`1`)}),e.addEventListener(`mouseleave`,()=>{e.setAttribute(`r`,`3.2`);let t=document.getElementById(`chartMiniTip`);t&&(t.style.opacity=`0`)})})}function q(e){U=e;let t=document.getElementById(`argoFloatId`),n=document.getElementById(`argoStatusPill`);t&&(t.textContent=e.floatId),n&&(n.textContent=e.status);let r=document.getElementById(`argoValLocation`),i=document.getElementById(`argoValLastObs`),a=document.getElementById(`argoValMaxDepth`),o=document.getElementById(`argoValMeasurements`);r&&(r.textContent=e.locationFormatted),i&&(i.textContent=e.lastObservation),a&&(a.textContent=`${e.maxDepthMeters} m`),o&&(o.textContent=e.measurements);let s=document.getElementById(`argoSurfaceTemp`),c=document.getElementById(`argoSurfaceSalinity`);s&&(s.textContent=`${e.latestObservation.temperatureC} °C`),c&&(c.textContent=`${e.latestObservation.salinityPSU} PSU`),K(e.verticalProfile);let l=document.getElementById(`argoProfileTableBody`);l&&(l.innerHTML=e.verticalProfile.map(e=>`
        <tr>
          <td>${e.depthMeters} m</td>
          <td style="color:#ff9436;">${e.temperatureC.toFixed(2)} °C</td>
          <td style="color:#38bdf8;">${e.salinityPSU.toFixed(2)}</td>
          <td>${e.pressureDbar} dbar</td>
          <td>${e.densitySigmaTheta}</td>
        </tr>
      `).join(``));let u=document.getElementById(`argoCycleNum`),d=document.getElementById(`argoBattery`),f=document.getElementById(`argoTransmission`);u&&(u.textContent=`Cycle #${e.cycleNumber}`),d&&(d.textContent=e.batteryVoltage),f&&(f.textContent=e.transmissionStatus);let p=document.getElementById(`argoSeaBasin`),m=document.getElementById(`argoExactCoords`),h=document.getElementById(`argoDriftSpeed`),g=document.getElementById(`argoDistance24h`);p&&(p.textContent=e.coordinates.seaBasin),m&&(m.textContent=`${e.coordinates.lat.toFixed(4)}°N, ${e.coordinates.lon.toFixed(4)}°E`),h&&(h.textContent=`${e.drift.speedKnots} kts @ ${e.drift.bearingDegrees}°`),g&&(g.textContent=`${e.drift.estimatedDistance24hKm} km / 24h`);let _=document.getElementById(`argoRawJsonView`),v=document.getElementById(`argoApiEndpoint`);_&&(_.textContent=JSON.stringify(e,null,2)),v&&(v.textContent=e.apiMetadata.apiEndpointTemplate);let y=document.getElementById(`argoFloatPanel`);y&&y.classList.add(`visible`)}async function J(e){H=e,window.selectedStationId=e,V.forEach(t=>{t.userData.id===e?t.material.color.setHex(65382):t.material.color.setHex(t.userData.defaultColor)}),document.querySelectorAll(`.station-card`).forEach(t=>{t.getAttribute(`data-id`)===e?(t.classList.add(`active`),t.scrollIntoView({behavior:`smooth`,block:`nearest`})):t.classList.remove(`active`)});let t=L.find(t=>t.id===e)||{id:e};q(await x.getFloatDetails(t))}function Y(e){let t=document.getElementById(`transitionOverlay`);t&&t.classList.add(`active`),setTimeout(()=>{window.location.href=`/ocean.html?id=${encodeURIComponent(e||H||`A1`)}`},380)}window.transitionToOcean=Y;var X=new u,Z=new o,Q=document.getElementById(`tooltip`);function he(e){Z.x=e.clientX/window.innerWidth*2-1,Z.y=-(e.clientY/window.innerHeight)*2+1,X.setFromCamera(Z,T);let t=X.intersectObjects(B);if(t.length>0){document.body.style.cursor=`pointer`;let n=t[0].object.userData;Q&&(Q.style.display=`block`,Q.style.left=`${e.clientX+16}px`,Q.style.top=`${e.clientY-24}px`,Q.innerHTML=`
        <div class="tooltip-header">⚓ ${n.id} - ${n.code}</div>
        <div class="tooltip-body">
          <div><strong>Basin:</strong> ${n.sea}</div>
          <div><strong>Lat/Lon:</strong> ${n.lat.toFixed(2)}°N, ${n.lon.toFixed(2)}°E</div>
          <div><strong>Type:</strong> ${n.type}</div>
          <div style="margin-top:4px; color:#00ff66;">✦ Click to inspect Argo Float vertical profile</div>
        </div>
      `)}else document.body.style.cursor=`default`,Q&&(Q.style.display=`none`)}function ge(e){if(e.target.closest&&e.target.closest(`.hud-sidebar, .hud-header, .sidebar-toggle-btn, .argo-float-panel, .globe-nav-controls`))return;Z.x=e.clientX/window.innerWidth*2-1,Z.y=-(e.clientY/window.innerHeight)*2+1,X.setFromCamera(Z,T);let t=X.intersectObjects(B);if(t.length>0){let e=t[0].object.userData;J(e.id),Y(e.id);return}let n=X.intersectObject(M);if(n.length>0){let e=n[0].point,t=pe(e,w),r=null,i=1/0;if(L.forEach(e=>{let n=Math.hypot(e.lat-t.lat,e.lon-t.lon);n<i&&(i=n,r=e)}),r&&i<18)J(r.id);else{let e={id:`SURF`,wmoId:29e5+Math.floor(Math.abs(t.lat*100)+Math.abs(t.lon*100)),code:`LOC`,lat:t.lat,lon:t.lon,sea:t.lat>0?t.lon<77?`Arabian Sea`:`Bay of Bengal`:`Equatorial Indian Ocean`,type:`Ocean Profile Probe`};x.getFloatDetails(e).then(q)}}}window.addEventListener(`pointermove`,he),window.addEventListener(`click`,ge),window.focusOnPoint=function(e){J(e);let t=L.find(t=>t.id===e);if(!t)return;let n=T.position.distanceTo(D.target),r=Math.min(n,2.6);G(R(t.lat,t.lon,1).normalize().multiplyScalar(r),new h(0,0,0),600)},window.navResetNorth=function(){W=null;let e=T.position.distanceTo(D.target);G(new h(0,e*.25,-e*.968),new h(0,0,0),600)},window.navZoomIn=function(){W=null;let e=T.position.clone().sub(D.target),t=e.length(),n=Math.max(D.minDistance,t*.76);e.setLength(n),T.position.copy(D.target).add(e),D.update()},window.navZoomOut=function(){W=null;let e=T.position.clone().sub(D.target),t=e.length(),n=Math.min(D.maxDistance,t*1.3);e.setLength(n),T.position.copy(D.target).add(e),D.update()},window.navCenterView=function(){W=null;let e=T.position.distanceTo(D.target);G(new h(.9,.8,-4).normalize().multiplyScalar(e),new h(0,0,0),600)},window.closeArgoFloatPanel=function(){let e=document.getElementById(`argoFloatPanel`);e&&e.classList.remove(`visible`)},window.switchArgoTab=function(e){document.querySelectorAll(`.argo-tab-btn`).forEach(t=>{t.classList.toggle(`active`,t.getAttribute(`data-tab`)===e)}),document.querySelectorAll(`.argo-tab-pane`).forEach(t=>{t.classList.toggle(`active`,t.id===`tab-${e}`)})},window.copyRawDataJson=function(){U&&navigator.clipboard.writeText(JSON.stringify(U,null,2)).then(()=>{let e=document.getElementById(`copyJsonBtn`);if(e){let t=e.textContent;e.textContent=`Copied! ✓`,setTimeout(()=>e.textContent=t,2e3)}})},window.addEventListener(`resize`,()=>{T.aspect=window.innerWidth/window.innerHeight,T.updateProjectionMatrix(),E.setSize(window.innerWidth,window.innerHeight),E.setPixelRatio(Math.min(window.devicePixelRatio,2))});var _e=new v;function $(){requestAnimationFrame($);let e=_e.getElapsedTime();if(W){let e=performance.now()-W.startTime,t=Math.min(1,e/W.duration),n=t<.5?4*t*t*t:1-(-2*t+2)**3/2;T.position.lerpVectors(W.startPos,W.endPos,n),D.target.lerpVectors(W.startLookAt,W.endLookAt,n),t>=1&&(W=null)}let t=T.position.distanceTo(D.target),n=S,r=Math.max(0,Math.min(1,(t-n.zoomInDistance)/(n.zoomOutDistance-n.zoomInDistance))),i=n.minScale+r**+n.zoomCurvePower*(n.maxScale-n.minScale);B.forEach(e=>{e.scale.set(i,i,1)});let a=1+.28*Math.sin(e*4),o=Math.max(.45,Math.min(1,t/3.8));V.forEach(e=>{let t=e.userData.id===H?1.5:1,n=a*o*t;e.scale.set(n,n,n)}),N&&N.uniforms&&(N.uniforms.uTime.value=e),F&&F.uniforms&&(F.uniforms.uTime.value=e),P&&(P.rotation.y+=1e-4),D.update(),E.render(C,T)}$(),setTimeout(()=>{J(`A1`)},400);