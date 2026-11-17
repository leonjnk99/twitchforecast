// Leave-one-out validation, end to end through the shipped main.ts.
// Each comparable's release-day curve becomes a pseudo-target: a synthetic case whose
// hour-1 print is that comparable's hour-1 print and whose comparables are the other
// 37 (the GTA VI own-history comparable is never a predictor, and never a target).
// main.ts and the starter are each run once over the whole LOO input dir and scored
// against the pseudo-targets' true curves. Run: node tests/loo.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreCase, baselineForecast } from './scorer.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KIT = '/home/hatch/workspace/makefun/gta6-twitch-ccu-forecast-01-kit/gta6-twitch-ccu-forecast-01-kit';
const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
const scratch = join(ROOT, 'scratch', 'loo');
rmSync(scratch, { recursive: true, force: true });
mkdirSync(join(scratch, 'in'), { recursive: true });

const base = JSON.parse(readFileSync(join(KIT, 'input', 'p00.in'), 'utf8'));
const comps = base.comparables;

function dayCurve(comp) {
  const t0 = Date.parse(comp.day_start);
  const map = new Map();
  for (const p of comp.hourly) map.set(Date.parse(p.from), p.viewers);
  const out = [];
  for (let h = 0; h < 24; h++) {
    const t = t0 + h * 3600e3;
    out.push(map.has(t) ? map.get(t) : null);
  }
  return out;
}
const isOwnHistory = (c) => /grand theft auto vi/i.test(c.name) || /tier:\s*target-history/i.test(c.unlock ?? '');
const isSimultaneous = (c) => {
  const txt = ((c.unlock ?? '') + ' ' + (c.platforms ?? '')).toLowerCase();
  return (/simultaneous|single global|single time/.test(txt) && !/midnight local/.test(txt));
};

// Build one pseudo-target case per comparable.
const targets = [];
for (let j = 0; j < comps.length; j++) {
  const comp = comps[j];
  if (isOwnHistory(comp)) continue;
  const curve = dayCurve(comp);
  const h1 = curve[0];
  if (h1 === null || h1 <= 0) continue;
  const id = `loo${String(targets.length).padStart(2, '0')}`;
  const t0 = Date.parse(comp.day_start);
  const iso = (t) => new Date(t).toISOString().replace('.000Z', 'Z');
  const kase = {
    schema: 'makefun/twitch-ccu-case/v1',
    id,
    game: { name: comp.name, twitch_id: '' },
    day_start: iso(t0),
    checkpoint: iso(t0 + 3600e3),
    levels: LEVELS,
    known: [{ hour: 1, from: iso(t0), until: iso(t0 + 3600e3), viewers: h1, channels: null, reads: 1 }],
    forecast: Array.from({ length: 23 }, (_, i) => ({ hour: i + 2, from: iso(t0 + (i + 1) * 3600e3), until: iso(t0 + (i + 2) * 3600e3) })),
    history: [],
    history_hourly: [],
    streams: null,
    categories_hourly: null,
    comparables: comps.filter((_, k) => k !== j && !isOwnHistory(comps[k])),
    notes: 'LOO pseudo-target built from the practice case comparables',
  };
  writeFileSync(join(scratch, 'in', `${id}.in`), JSON.stringify(kase));
  const truth = {};
  for (let h = 2; h <= 24; h++) truth[h] = curve[h - 1];
  targets.push({ id, name: comp.name, h1, truth, simultaneous: isSimultaneous(comp) });
}
console.log(`LOO: ${targets.length} pseudo-targets`);

// Run the shipped entry and the starter over the same inputs.
const run = (entry, outDir) => {
  mkdirSync(outDir, { recursive: true });
  execFileSync('node', [entry], {
    env: { ...process.env, MAKEFUN_INPUT_DIR: join(scratch, 'in'), MAKEFUN_OUTPUT_DIR: outDir },
    stdio: 'pipe',
  });
};
run(join(ROOT, 'main.ts'), join(scratch, 'out-model'));
run(join(KIT, 'starter', 'main.ts'), join(scratch, 'out-base'));

function summarize(label, outDir, subset) {
  let lossSum = 0;
  let n = 0;
  for (const t of targets) {
    if (subset === 'rolling' && t.simultaneous) continue;
    if (subset === 'rolling-bigh1' && (t.simultaneous || t.h1 < 20000)) continue;
    if (subset === 'simult' && !t.simultaneous) continue;
    const fc = JSON.parse(readFileSync(join(outDir, `${t.id}.out`), 'utf8'));
    lossSum += scoreCase(t.truth, fc).loss;
    n++;
  }
  console.log(`  ${label.padEnd(10)} ${subset.padEnd(13)} mean loss ${(lossSum / n).toFixed(4)} (n=${n})`);
  return lossSum / n;
}
for (const subset of ['all', 'rolling', 'rolling-bigh1']) {
  const m = summarize('model', join(scratch, 'out-model'), subset);
  const b = summarize('baseline', join(scratch, 'out-base'), subset);
  console.log(`  -> ${subset}: model ${m.toFixed(4)} vs baseline ${b.toFixed(4)} (${((1 - m / b) * 100).toFixed(1)}% lower)`);
}
// The relevant class is rolling launches with a substantial hour-1 print (GTA VI's
// hour 1 will be the biggest of all): the model must beat the baseline there.
const mBig = summarize('model', join(scratch, 'out-model'), 'rolling-bigh1');
const bBig = summarize('baseline', join(scratch, 'out-base'), 'rolling-bigh1');
if (!(mBig < bBig)) {
  console.error('LOO FAIL: model does not beat the baseline on rolling big hour-1 launches');
  process.exit(1);
}
console.log('loo: PASS (model beats baseline on the relevant class)');
