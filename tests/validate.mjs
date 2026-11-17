// Format / determinism / runtime validation on the 4 real practice cases.
// Runs the shipped main.ts and the starter, checks every output against the gate
// (23 rows, hours 2..24 each once, five finite quantiles >0 and <=1e9, non-decreasing,
// exactly one top-level key, <=65,536 bytes), re-runs main.ts for byte-identical
// outputs, and times one case at a time. Run: node tests/validate.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KIT = '/home/hatch/workspace/makefun/gta6-twitch-ccu-forecast-01-kit/gta6-twitch-ccu-forecast-01-kit';
const scratch = join(ROOT, 'scratch', 'validate');
rmSync(scratch, { recursive: true, force: true });

function runEntry(entry, inputDir, outDir) {
  mkdirSync(outDir, { recursive: true });
  const t0 = process.hrtime.bigint();
  execFileSync('node', [entry], {
    env: { ...process.env, MAKEFUN_INPUT_DIR: inputDir, MAKEFUN_OUTPUT_DIR: outDir },
    stdio: 'pipe',
  });
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

function checkFormat(outPath) {
  const bytes = statSync(outPath).size;
  assert.ok(bytes <= 65536, `${outPath}: ${bytes} bytes > 65,536`);
  const raw = readFileSync(outPath, 'utf8');
  const o = JSON.parse(raw);
  assert.deepStrictEqual(Object.keys(o), ['hours'], `${outPath}: top-level keys ${Object.keys(o)}`);
  assert.strictEqual(o.hours.length, 23, `${outPath}: ${o.hours.length} rows, want 23`);
  const seen = new Set();
  for (const row of o.hours) {
    assert.deepStrictEqual(Object.keys(row).sort(), ['hour', 'q'], `${outPath}: row keys ${Object.keys(row)}`);
    assert.ok(row.hour >= 2 && row.hour <= 24 && !seen.has(row.hour), `${outPath}: bad/duplicate hour ${row.hour}`);
    seen.add(row.hour);
    assert.strictEqual(row.q.length, 5, `${outPath} h${row.hour}: ${row.q.length} quantiles`);
    let prev = 0;
    for (const q of row.q) {
      assert.ok(Number.isFinite(q) && q > 0 && q <= 1e9, `${outPath} h${row.hour}: q=${q}`);
      assert.ok(q >= prev, `${outPath} h${row.hour}: quantiles not non-decreasing`);
      prev = q;
    }
  }
  return o;
}

const inputDir = join(KIT, 'input');
const cases = ['p00', 'p01', 'p02', 'p03'];
const input = {};
for (const id of cases) input[id] = JSON.parse(readFileSync(join(inputDir, `${id}.in`), 'utf8'));

// 1. The model on all 4 practice cases.
const msAll = runEntry(join(ROOT, 'main.ts'), inputDir, join(scratch, 'out-model'));
console.log(`model: 4 cases in ${msAll.toFixed(0)} ms (${(msAll / 4).toFixed(0)} ms/case, cap 8000 ms)`);
const medians = {};
for (const id of cases) {
  const o = checkFormat(join(scratch, 'out-model', `${id}.out`));
  const h1 = input[id].known.find((k) => k.hour === 1).viewers;
  const h2 = o.hours.find((r) => r.hour === 2).q[2];
  const h24 = o.hours.find((r) => r.hour === 24).q[2];
  medians[id] = { h1, h2, h24, r2: h2 / h1, r24: h24 / h1 };
  console.log(`  ${id} ${input[id].game.name}: hour-1 ${h1.toLocaleString()} -> h2 median ${h2.toLocaleString()} (x${(h2 / h1).toFixed(2)}), h24 median ${h24.toLocaleString()} (x${(h24 / h1).toFixed(2)})`);
}

// 2. The starter on the same cases (same format checks; its outputs are the baseline).
runEntry(join(KIT, 'starter', 'main.ts'), inputDir, join(scratch, 'out-base'));
for (const id of cases) checkFormat(join(scratch, 'out-base', `${id}.out`));
console.log('starter: 4 cases, format OK');

// 3. Determinism: run the model twice more into fresh dirs; bytes must match exactly.
runEntry(join(ROOT, 'main.ts'), inputDir, join(scratch, 'out-model-2'));
runEntry(join(ROOT, 'main.ts'), inputDir, join(scratch, 'out-model-3'));
for (const id of cases) {
  const a = readFileSync(join(scratch, 'out-model', `${id}.out`));
  const b = readFileSync(join(scratch, 'out-model-2', `${id}.out`));
  const c = readFileSync(join(scratch, 'out-model-3', `${id}.out`));
  assert.ok(a.equals(b) && a.equals(c), `${id}: runs differ`);
}
console.log('determinism: 3 runs byte-identical on all 4 cases');

// 4. Runtime per case, one case at a time (the grader's shape: one .in per run).
for (const id of cases) {
  const singleIn = join(scratch, `in-${id}`);
  mkdirSync(singleIn, { recursive: true });
  writeFileSync(join(singleIn, `${id}.in`), readFileSync(join(inputDir, `${id}.in`), 'utf8'));
  const ms = runEntry(join(ROOT, 'main.ts'), singleIn, join(scratch, `out-${id}`));
  assert.ok(ms < 8000, `${id}: ${ms} ms over the 8 s cap`);
  console.log(`  ${id}: ${ms.toFixed(0)} ms single-case run (cap 8000 ms)`);
}
console.log('validate: ALL PASS');
