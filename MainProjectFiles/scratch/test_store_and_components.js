// Verification script for Zustand store isolated coordinates and slider logic
import { useOceanStore } from '../3d pages/useOceanStore.js';

console.log('--- Testing Isolated Instrument Coordinates in Zustand Store ---');

const store = useOceanStore.getState();

// 1. Initial State Verification
console.log('1. Initial instruments:');
console.log(store.instruments);

if (!store.instruments['argo-2902351'] || !store.instruments['glider-slocum-04'] || !store.instruments['ctd-rosette-01']) {
  console.error('FAIL: Missing instruments keys');
  process.exit(1);
}
console.log('PASS: Initial instruments keys present');

// 2. Select Slocum Glider
console.log('\n2. Selecting glider-slocum-04:');
store.selectInstrument('glider-slocum-04');
const afterSelect = useOceanStore.getState();
console.log('Active Instrument:', afterSelect.activeInstrument?.id);
console.log('Active Depth:', afterSelect.activeInstrumentDepth);
console.log('Active Horizontal:', afterSelect.activeInstrumentHorizontal);

if (afterSelect.activeInstrument?.id !== 'glider-slocum-04') {
  console.error('FAIL: Slocum glider was not set as activeInstrument');
  process.exit(1);
}
console.log('PASS: Slocum glider selected');

// 3. Move Depth Slider to 1500m
console.log('\n3. Dragging Depth Slider to 1500m:');
store.setActiveInstrumentDepth(1500);
const afterDepth = useOceanStore.getState();
console.log('Slocum Glider depth:', afterDepth.instruments['glider-slocum-04'].depth);
console.log('Argo Float depth:', afterDepth.instruments['argo-2902351'].depth);

if (afterDepth.instruments['glider-slocum-04'].depth !== 1500) {
  console.error('FAIL: Slocum depth was not updated to 1500');
  process.exit(1);
}
if (afterDepth.instruments['argo-2902351'].depth !== 15) {
  console.error('FAIL: Argo Float depth mutated when Glider was selected! Expected 15, got:', afterDepth.instruments['argo-2902351'].depth);
  process.exit(1);
}
console.log('PASS: Slocum depth is 1500m and Argo Float depth remains strictly isolated at 15m!');

// 4. Move Transect Slider to 42.5 km
console.log('\n4. Dragging Transect Slider to 42.5 km:');
store.setActiveInstrumentTransect(42.5);
const afterTransect = useOceanStore.getState();
console.log('Slocum Glider transectDistance:', afterTransect.instruments['glider-slocum-04'].transectDistance);
console.log('Active Instrument Horizontal:', afterTransect.activeInstrumentHorizontal);

if (afterTransect.instruments['glider-slocum-04'].transectDistance !== 42.5) {
  console.error('FAIL: Slocum transectDistance was not updated to 42.5');
  process.exit(1);
}
console.log('PASS: Slocum transectDistance is 42.5 km!');

// 5. Select Argo Float and verify its depth remains 15
console.log('\n5. Selecting argo-2902351:');
store.selectInstrument('argo-2902351');
const afterArgoSelect = useOceanStore.getState();
console.log('Active Instrument:', afterArgoSelect.activeInstrument?.id);
console.log('Argo Float depth:', afterArgoSelect.instruments['argo-2902351'].depth);
console.log('Slocum Glider depth:', afterArgoSelect.instruments['glider-slocum-04'].depth);

if (afterArgoSelect.instruments['argo-2902351'].depth !== 15) {
  console.error('FAIL: Argo depth is not 15');
  process.exit(1);
}
if (afterArgoSelect.instruments['glider-slocum-04'].depth !== 1500) {
  console.error('FAIL: Slocum depth lost its value');
  process.exit(1);
}

// 6. Move Argo Depth to 850m
console.log('\n6. Dragging Argo Depth to 850m:');
store.setActiveInstrumentDepth(850);
const afterArgoDepth = useOceanStore.getState();
console.log('Argo Float depth:', afterArgoDepth.instruments['argo-2902351'].depth);
console.log('Slocum Glider depth:', afterArgoDepth.instruments['glider-slocum-04'].depth);

if (afterArgoDepth.instruments['argo-2902351'].depth !== 850) {
  console.error('FAIL: Argo depth was not updated to 850');
  process.exit(1);
}
if (afterArgoDepth.instruments['glider-slocum-04'].depth !== 1500) {
  console.error('FAIL: Slocum depth mutated when Argo was selected!');
  process.exit(1);
}
console.log('PASS: Argo Float depth is 850m while Glider depth remains strictly preserved at 1500m!');

console.log('\n ALL TESTS PASSED SUCCESSFULLY! ZERO CROSS-INSTRUMENT MUTATION DETECTED.');
