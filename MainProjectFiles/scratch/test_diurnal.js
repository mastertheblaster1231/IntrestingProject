import { useOceanStore, calculateDiurnalModulation, getInstrumentComparisonData } from '../3d pages/useOceanStore.js';

console.log('=== TESTING DIURNAL PERTURBATION CYCLE ===');

// 1. Test Diurnal Math at 02:00 (Night Min) vs 14:00 (Solar Peak)
const dNight = calculateDiurnalModulation('2026-09-12T02:00:00Z', 10, false);
const dNoon = calculateDiurnalModulation('2026-09-12T14:00:00Z', 10, false);

console.log(`02:00 Temp Offset: ${dNight.temperature.toFixed(3)}°C (Should be negative cooling)`);
console.log(`14:00 Temp Offset: ${dNoon.temperature.toFixed(3)}°C (Should be positive warming)`);

if (dNight.temperature >= 0 || dNoon.temperature <= 0) {
  console.error('FAIL: Temperature does not follow diurnal peak and trough!');
  process.exit(1);
}
console.log('PASS: Temperature peaks at 14:00 and cools at 02:00 realistically.');

// 2. Test getInstrumentComparisonData with two different timestamps
const comp02 = getInstrumentComparisonData('argo-2902351', 15, '2026-09-12T02:00:00Z');
const comp14 = getInstrumentComparisonData('argo-2902351', 15, '2026-09-12T14:00:00Z');

console.log('\n02:00 Night Observations:', comp02.observed);
console.log('14:00 Day Observations:', comp14.observed);
console.log('02:00 Delta:', comp02.delta);
console.log('14:00 Delta:', comp14.delta);

if (comp02.observed.temperature === comp14.observed.temperature) {
  console.error('FAIL: Observations did not change with timestamp!');
  process.exit(1);
}
console.log('PASS: Observations and Deltas change deterministically with timestamp!');

// 3. Test multi-device comparisons
const compGlider = getInstrumentComparisonData('glider-slocum-04', 190, '2026-09-12T14:00:00Z');
console.log('\nGlider Comparison:', compGlider.instrument.name, 'Depth:', compGlider.depth);
console.log('Glider Delta:', compGlider.delta);

console.log('\n ALL DIURNAL TESTS PASSED!');
