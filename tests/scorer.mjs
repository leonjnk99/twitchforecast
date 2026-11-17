// Pinball scorer for gta6-twitch-ccu-forecast-01, exactly as RULES.txt defines it,
// plus the worked-example test. Run: node tests/scorer.mjs
import { strict as assert } from 'node:assert';

export const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];

/** One item's pinball loss on the log scale: 2 * max(tau*d, (tau-1)*d), d = ln(y) - ln(q). */
export function pinball(y, q, tau) {
  const d = Math.log(Math.max(1, y)) - Math.log(q);
  return 2 * Math.max(tau * d, (tau - 1) * d);
}

/**
 * Score one forecast against one case's printed hours.
 * truth: {hour: viewers} for hours 2..24; forecast: {hours: [{hour, q:[5]}]}.
 * Returns {loss, typicalMissPct, coverage90, n}.
 */
export function scoreCase(truth, forecast) {
  let lossSum = 0;
  let n = 0;
  let absLogSum = 0;
  let hoursScored = 0;
  let covered = 0;
  for (const row of forecast.hours) {
    const y = truth[row.hour];
    if (y === undefined || y === null || y <= 0) continue;
    hoursScored++;
    absLogSum += Math.abs(Math.log(Math.max(1, y)) - Math.log(row.q[2]));
    if (row.q[0] <= y && y <= row.q[4]) covered++;
    for (let j = 0; j < 5; j++) {
      lossSum += pinball(y, row.q[j], LEVELS[j]);
      n++;
    }
  }
  return {
    loss: lossSum / n,
    typicalMissPct: 100 * (Math.exp(absLogSum / hoursScored) - 1),
    coverage90: covered / hoursScored,
    n,
  };
}

/** The house persistence baseline's forecast for a case with hour-1 print p1. */
export function baselineForecast(p1) {
  const Z = [-1.645, -0.674, 0, 0.674, 1.645];
  const hours = [];
  for (let h = 2; h <= 24; h++) {
    hours.push({ hour: h, q: Z.map((z) => Math.max(1, p1 * Math.exp(z * 0.15 * Math.sqrt(h - 1)))) });
  }
  return { hours };
}

// --- Worked example from RULES.txt (must reproduce exactly) ---
// Two hours, both rows [600000, 800000, 900000, 1100000, 1500000]; prints 1,000,000
// and 700,000. Expected: loss 0.112545, typical miss 19.52%, coverage 1.
const row = [600000, 800000, 900000, 1100000, 1500000];
const worked = scoreCase(
  { 2: 1000000, 3: 700000 },
  { hours: [{ hour: 2, q: row }, { hour: 3, q: row }] },
);
assert.ok(Math.abs(worked.loss - 0.112545) < 0.000001, `worked loss ${worked.loss} != 0.112545`);
assert.ok(Math.abs(worked.typicalMissPct - 19.52) < 0.01, `worked miss ${worked.typicalMissPct} != 19.52`);
assert.strictEqual(worked.coverage90, 1, `worked coverage ${worked.coverage90} != 1`);

// Per-item costs from the worked example, first hour (print 1,000,000).
const firstHour = [0.051083, 0.111572, 0.105361, 0.047655, 0.040547];
for (let j = 0; j < 5; j++) {
  const got = pinball(1000000, row[j], LEVELS[j]);
  assert.ok(Math.abs(got - firstHour[j]) < 0.000001, `item ${j}: ${got} != ${firstHour[j]}`);
}
// Second hour (print 700,000).
const secondHour = [0.015415, 0.200297, 0.251314, 0.225993, 0.076214];
for (let j = 0; j < 5; j++) {
  const got = pinball(700000, row[j], LEVELS[j]);
  assert.ok(Math.abs(got - secondHour[j]) < 0.000001, `item ${j}: ${got} != ${secondHour[j]}`);
}

// Invalid-case fallback: every quantile = hour-1 print 1,200,000; expected loss 0.360659.
const invalid = scoreCase(
  { 2: 1000000, 3: 700000 },
  { hours: [{ hour: 2, q: [1200000, 1200000, 1200000, 1200000, 1200000] }, { hour: 3, q: [1200000, 1200000, 1200000, 1200000, 1200000] }] },
);
assert.ok(Math.abs(invalid.loss - 0.360659) < 0.000001, `invalid loss ${invalid.loss} != 0.360659`);

console.log('scorer: worked example loss', worked.loss.toFixed(6), '(expect 0.112545), typical miss',
  worked.typicalMissPct.toFixed(2) + '% (expect 19.52%), coverage', worked.coverage90, '(expect 1)');
console.log('scorer: invalid-case loss', invalid.loss.toFixed(6), '(expect 0.360659)');
console.log('scorer: ALL PASS');
