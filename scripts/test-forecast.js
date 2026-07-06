// Unit test for forecast.js — validates the three models against a synthetic
// monthly series with a KNOWN trend + seasonal pattern, so we can confirm the
// math behaves before wiring the dashboard UI. Run: node scripts/test-forecast.js

const F = require('../forecast.js');

// Build 5 years (60 months) of: base + slope*t + seasonal[month] + tiny noise.
// Seasonal peak in month index 0 (say January) and trough mid-year — arbitrary
// but fixed so we can check the models recover the shape.
const SEASONAL = [4000, 3000, 2500, 1500, 500, -1500, -3000, -3500, -2500, -1000, 1000, 2500];
const BASE = 20000, SLOPE = 120;
let seed = 42;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed / 0x7fffffff - 0.5) * 400; }

const y = [];
for (let t = 0; t < 60; t++) y.push(BASE + SLOPE * t + SEASONAL[t % 12] + rnd());

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
}

function validateShape(label, res, h) {
  console.log('\n' + label);
  if (!res) { check(label + ' returned a result', false, 'got null'); return; }
  check('fitted length = 60', res.fitted.length === 60, 'got ' + res.fitted.length);
  check('forecast length = ' + h, res.forecast.length === h, 'got ' + res.forecast.length);
  check('all forecast values finite', res.forecast.every(Number.isFinite));
  check('all band values finite', res.lower.every(Number.isFinite) && res.upper.every(Number.isFinite));
  check('lower < upper everywhere', res.forecast.every(function (_, i) { return res.lower[i] < res.upper[i]; }));
  check('band widens with horizon',
    (res.upper[h - 1] - res.lower[h - 1]) > (res.upper[0] - res.lower[0]),
    'first=' + (res.upper[0] - res.lower[0]).toFixed(0) + ' last=' + (res.upper[h - 1] - res.lower[h - 1]).toFixed(0));

  // With a clean upward trend, the next 12 months should exceed the last 12 actuals on average.
  const lastYearMean = y.slice(-12).reduce(function (s, x) { return s + x; }, 0) / 12;
  const fcMean = res.forecast.slice(0, 12).reduce(function (s, x) { return s + x; }, 0) / 12;
  check('forecast continues upward trend', fcMean > lastYearMean,
    'lastYearMean=' + lastYearMean.toFixed(0) + ' fcMean=' + fcMean.toFixed(0));
  // Sanity: not absurd (within 3x the max seen).
  check('forecast not absurd', res.forecast.every(function (v) { return v > 0 && v < 3 * Math.max.apply(null, y); }));
}

console.log('=== forecast.js model validation ===');
validateShape('Holt-Winters', F.holtWinters(y, 12), 12);
validateShape('Linear + seasonal dummies', F.linearSeasonal(y, 12, 0), 12);
validateShape('SARIMA-lite', F.sarimaLite(y, 12), 12);

// Seasonal recovery: for the linear model, next-January (index where (0+t)%12==0)
// should be among the higher forecast months, matching the seasonal peak.
const lin = F.linearSeasonal(y, 12, 0);
if (lin) {
  const janForecast = lin.forecast[(12 - (60 % 12)) % 12 === 0 ? 11 : (12 - (60 % 12)) - 1];
  // Simpler: month index of each forecast step; peak seasonal is month 0.
  const monthsAhead = lin.forecast.map(function (_, k) { return (0 + 60 + k) % 12; });
  const peakStep = monthsAhead.indexOf(0);
  const troughStep = monthsAhead.indexOf(7); // month 7 is the trough (-3500)
  console.log('\nSeasonal recovery (linear)');
  check('peak-month forecast > trough-month forecast',
    peakStep >= 0 && troughStep >= 0 && lin.forecast[peakStep] > lin.forecast[troughStep],
    'peak=' + (peakStep >= 0 ? lin.forecast[peakStep].toFixed(0) : 'n/a') + ' trough=' + (troughStep >= 0 ? lin.forecast[troughStep].toFixed(0) : 'n/a'));
}

// Edge: too-short series returns null.
console.log('\nEdge cases');
check('holtWinters null on <2 seasons', F.holtWinters(y.slice(0, 20), 12) === null);
check('sarimaLite null on <2 seasons', F.sarimaLite(y.slice(0, 20), 12) === null);
check('linearSeasonal null on tiny series', F.linearSeasonal(y.slice(0, 10), 12, 0) === null);

console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail === 0 ? 0 : 1);
