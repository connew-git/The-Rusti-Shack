// Three genuine, hand-implemented statistical forecasting models for the
// Rusti Shack back office. No LLM-generated numbers — every value comes out
// of the math below. Dual-mode: attaches to window in the browser and
// exports for Node so the logic can be unit-tested (see scripts/test-forecast.js).
//
// All three take a numeric series (monthly revenue, oldest→newest) and a
// horizon h, and return { fitted, forecast, lower, upper } where forecast/
// lower/upper have length h. Confidence bands widen with horizon via the
// residual standard deviation scaled by sqrt(step).
//
// Models:
//   holtWinters    — additive triple exponential smoothing (level+trend+season)
//   linearSeasonal — OLS trend + monthly seasonal dummies
//   sarimaLite     — fixed-order ARIMA(1,0,0)(0,1,0)_12 (seasonal difference + AR1)

(function (root) {
  'use strict';

  var SEASON = 12;      // monthly data
  var Z = 1.28;         // ~80% normal band (widens with horizon below)

  function mean(a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; }
  function stdev(a) {
    if (a.length < 2) return 0;
    var m = mean(a);
    return Math.sqrt(a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1));
  }

  // Band from residual std, widening as sqrt(step) into the forecast.
  function bands(forecast, resid) {
    var sigma = stdev(resid);
    var lower = [], upper = [];
    for (var i = 0; i < forecast.length; i++) {
      var w = Z * sigma * Math.sqrt(i + 1);
      lower.push(forecast[i] - w);
      upper.push(forecast[i] + w);
    }
    return { lower: lower, upper: upper };
  }

  // ── 1. HOLT-WINTERS (additive) ─────────────────────────────────────────
  function holtWintersOnce(y, m, alpha, beta, gamma, h) {
    var n = y.length;
    // Init level & trend from the first two full seasons.
    var season1 = y.slice(0, m), season2 = y.slice(m, 2 * m);
    var level = mean(season1);
    var trend = (mean(season2) - mean(season1)) / m;
    // Init seasonals as deviation of each of the first m points from level.
    var seas = [];
    for (var i = 0; i < m; i++) seas[i] = y[i] - level;

    var fitted = [];
    for (var t = 0; t < n; t++) {
      var si = t % m;
      var prevLevel = level;
      var f = level + trend + seas[si];   // one-step-ahead fit for period t
      fitted.push(f);
      level = alpha * (y[t] - seas[si]) + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
      seas[si] = gamma * (y[t] - level) + (1 - gamma) * seas[si];
    }

    var forecast = [];
    for (var k = 1; k <= h; k++) {
      forecast.push(level + k * trend + seas[(n + k - 1) % m]);
    }
    return { fitted: fitted, forecast: forecast };
  }

  function holtWinters(y, h) {
    if (y.length < 2 * SEASON) return null; // need two seasons to initialise
    // Coarse grid search on (alpha,beta,gamma) minimising in-sample SSE.
    var grid = [0.05, 0.15, 0.3, 0.5, 0.7];
    var best = null;
    for (var a = 0; a < grid.length; a++)
      for (var b = 0; b < grid.length; b++)
        for (var g = 0; g < grid.length; g++) {
          var r = holtWintersOnce(y, SEASON, grid[a], grid[b], grid[g], h);
          var sse = 0;
          // Skip the first season when scoring (warm-up).
          for (var t = SEASON; t < y.length; t++) { var e = y[t] - r.fitted[t]; sse += e * e; }
          if (!best || sse < best.sse) best = { sse: sse, r: r };
        }
    var resid = [];
    for (var t2 = SEASON; t2 < y.length; t2++) resid.push(y[t2] - best.r.fitted[t2]);
    var band = bands(best.r.forecast, resid);
    return { fitted: best.r.fitted, forecast: best.r.forecast, lower: band.lower, upper: band.upper };
  }

  // ── 2. LINEAR REGRESSION + SEASONAL DUMMIES ────────────────────────────
  // Design row: [1, t, m1..m11] (December is the reference month, folded
  // into the intercept). Solved by Gaussian elimination on the normal
  // equations (X'X)b = X'y.
  function linearSeasonal(y, h, startMonthIndex) {
    var n = y.length;
    if (n < SEASON + 2) return null;
    var p = 2 + (SEASON - 1); // intercept + trend + 11 dummies
    var sm = startMonthIndex || 0;

    function row(t) {
      var r = new Array(p).fill(0);
      r[0] = 1; r[1] = t;
      var month = (sm + t) % SEASON;      // 0..11
      if (month < SEASON - 1) r[2 + month] = 1; // month 11 = reference
      return r;
    }

    // Normal equations
    var XtX = []; for (var i = 0; i < p; i++) XtX.push(new Array(p).fill(0));
    var Xty = new Array(p).fill(0);
    for (var t = 0; t < n; t++) {
      var r = row(t);
      for (var i2 = 0; i2 < p; i2++) {
        Xty[i2] += r[i2] * y[t];
        for (var j = 0; j < p; j++) XtX[i2][j] += r[i2] * r[j];
      }
    }
    var beta = solve(XtX, Xty);
    if (!beta) return null;

    function predict(t) {
      var r = row(t), v = 0;
      for (var i = 0; i < p; i++) v += r[i] * beta[i];
      return v;
    }
    var fitted = [], resid = [];
    for (var t3 = 0; t3 < n; t3++) { var f = predict(t3); fitted.push(f); resid.push(y[t3] - f); }
    var forecast = [];
    for (var k = 1; k <= h; k++) forecast.push(predict(n - 1 + k));
    var band = bands(forecast, resid);
    return { fitted: fitted, forecast: forecast, lower: band.lower, upper: band.upper, coefficients: beta };
  }

  // Gaussian elimination with partial pivoting. Returns null if singular.
  function solve(A, b) {
    var n = b.length;
    var M = A.map(function (row, i) { return row.slice().concat(b[i]); });
    for (var col = 0; col < n; col++) {
      var piv = col;
      for (var r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (Math.abs(M[piv][col]) < 1e-12) return null;
      var tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
      for (var r2 = 0; r2 < n; r2++) {
        if (r2 === col) continue;
        var factor = M[r2][col] / M[col][col];
        for (var c = col; c <= n; c++) M[r2][c] -= factor * M[col][c];
      }
    }
    var x = new Array(n);
    for (var i = 0; i < n; i++) x[i] = M[i][n] / M[i][i];
    return x;
  }

  // ── 3. SARIMA-LITE : ARIMA(1,0,0)(0,1,0)_12 ────────────────────────────
  // Seasonal-difference the series (z_t = y_t - y_{t-12}) to remove the
  // yearly pattern, fit an AR(1) on z by lag-1 least squares, forecast z
  // recursively, then un-difference back onto the seasonal level.
  function sarimaLite(y, h) {
    var n = y.length;
    if (n < 2 * SEASON) return null;

    var z = [];                       // seasonally differenced series
    for (var t = SEASON; t < n; t++) z.push(y[t] - y[t - SEASON]);
    if (z.length < 2) return null;

    // AR(1) coefficient phi = Σ z_t·z_{t-1} / Σ z_{t-1}^2
    var num = 0, den = 0;
    for (var i = 1; i < z.length; i++) { num += z[i] * z[i - 1]; den += z[i - 1] * z[i - 1]; }
    var phi = den > 0 ? num / den : 0;
    if (phi > 0.98) phi = 0.98; if (phi < -0.98) phi = -0.98;

    // In-sample fit for residuals (on original scale).
    var fitted = [];
    for (var t2 = 0; t2 < n; t2++) {
      if (t2 < SEASON + 1) { fitted.push(y[t2]); continue; }
      var zPrev = y[t2 - 1] - y[t2 - 1 - SEASON];
      fitted.push(y[t2 - SEASON] + phi * zPrev);
    }
    var resid = [];
    for (var t3 = SEASON + 1; t3 < n; t3++) resid.push(y[t3] - fitted[t3]);

    // Recursive forecast.
    var hist = y.slice();
    var zLast = z[z.length - 1];
    var forecast = [];
    for (var k = 1; k <= h; k++) {
      var zHat = phi * zLast;
      var yHat = hist[hist.length - SEASON] + zHat;
      forecast.push(yHat);
      hist.push(yHat);
      zLast = zHat;
    }
    var band = bands(forecast, resid);
    return { fitted: fitted, forecast: forecast, lower: band.lower, upper: band.upper, phi: phi };
  }

  var api = {
    holtWinters: holtWinters,
    linearSeasonal: linearSeasonal,
    sarimaLite: sarimaLite,
    _internal: { mean: mean, stdev: stdev, solve: solve, SEASON: SEASON },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Forecast = api;
})(typeof window !== 'undefined' ? window : globalThis);
