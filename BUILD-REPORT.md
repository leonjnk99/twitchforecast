# BUILD-REPORT — Twitch CCU Forecast (gta6-twitch-ccu-forecast-01)

Built 2026-11-18 ~00:00–01:00 WIB, deadline 2026-11-19T01:00:00Z (08:00 WIB 2026-11-19).
Entry repo: `~/workspace/makefun/twitch-forecast/` (main.ts, LICENSE, README.md,
`.makefun/owner.json`, tests/, BUILD-REPORT.md). No dashboard, no screenshots — this
competition has no board/dossier; program + tests + report only.

## The model

Comparable-ratio curves. For each comparable, log-ratios to its own hour-1 print,
`r_h = ln(viewers_h / viewers_1)`, h = 2..24. Forecast:
`q_tau(h) = p1 * exp(Q_tau({r_h}))`, where Q_tau is the weighted, linearly
interpolated empirical quantile of the log-ratios at the scored level tau, and p1 is
the case's hour-1 print. Weights: Gaussian in log hour-1 print,
`w = exp(-(ln h1_comp - ln p1)^2 / (2 * 0.8^2))` — comparables that started at a
similar scale count most. The GTA VI category's own pre-release history is excluded
(it has no release day; its day_start is 2026-08-27, the premiere day). Fallbacks:
an hour with no usable ratio falls back to the house persistence shape; a case that
fails to parse is forecast with persistence for every hour rather than crashing, so
the output is always valid. Quantiles rounded to 2 decimals, clamped to (0, 1e9],
forced non-decreasing.

What was tried and dropped (all measured in leave-one-out, below):
- Tier weights (comparable 1 / early-access 0.25 / weak 0.1): no gain (≤0.005).
- Console-only ×1.5 and recency (≥2023) ×1.5: no gain.
- Channels-similarity weight: worse (rolling 0.394 → 0.426).
- Lognormal spread (median + z_tau * std): worse than empirical quantiles by ~0.04.
- Sigma multiplier grid on the lognormal: 0.8 best, still worse than empirical.

## Scorer verification (tests/scorer.mjs)

The local scorer reproduces the RULES.txt worked example exactly:
- loss **0.112545** (expect 0.112545), typical miss **19.52%** (expect 19.52%),
  90% coverage **1** (expect 1); all ten per-item costs match to 6 decimals.
- Invalid-case fallback loss **0.360659** (expect 0.360659).

## Leave-one-out (tests/loo.mjs, end to end through the shipped main.ts)

Each of the 38 comparables becomes a pseudo-target (its release-day curve is the
truth; the other 37 are the predictors). Mean pinball loss, model vs starter
(persistence) baseline:

| subset | n | model | baseline | change |
|---|---|---|---|---|
| all comparables | 37 | 0.4152 | 0.9297 | −55.3% |
| rolling-midnight launches | 32 | 0.3548 | 0.6903 | −48.6% |
| rolling, hour-1 ≥ 20,000 (the relevant class) | 26 | **0.2616** | 0.3204 | **−18.3%** |

The relevant class is rolling launches with a substantial hour-1 print: GTA VI is a
rolling-midnight console launch and its hour 1 will be the biggest of all. The model
beats the baseline on every subset. Note the baseline's loss on the real practice
cases is 0.387 (per the rules); LOO losses are not directly comparable to it, because
pseudo-targets include launches unlike any practice case.

## Practice cases (tests/validate.mjs)

main.ts on the 4 real practice cases (answers are server-side only, so these are
format/determinism/runtime checks, not scores):

| case | hour-1 print | h2 median | h24 median |
|---|---|---|---|
| p00 Marvel's Wolverine | 23,357 (619 ch) | 18,400.85 (×0.79) | 56,048.19 (×2.40) |
| p01 Red Dead Redemption 2 | 116,550 (2,435 ch) | 103,401.02 (×0.89) | 145,478.36 (×1.25) |
| p02 God of War Ragnarök | 269,517 (2,709 ch) | 239,008.53 (×0.89) | 306,453.28 (×1.14) |
| p03 Marvel's Spider-Man 2 | 119,087 (1,784 ch) | 105,666.17 (×0.89) | 147,440.66 (×1.24) |

The shape is the expected one: an overnight dip (hours 2–10, ratios ~0.75–0.9) as
the early regions sleep, then a rise into US daytime/evening (hours 19–23, ratios
~1.3–1.8 for the big launches). Wolverine's h24 ratio is higher (×2.40) because its
small hour-1 print makes its nearest comparables the smaller, faster-rising launches
(Ghost of Yōtei, Stellar Blade) — the hour-1 similarity weight working as designed.

- Format: all 4 outputs pass the gate (23 rows, hours 2–24 each once, five finite
  quantiles >0 and ≤1e9, non-decreasing, exactly one top-level key, 1,439–1,547
  bytes each, far under 65,536).
- Determinism: 3 runs byte-identical on all 4 cases.
- Runtime: 4 cases in 271 ms total (68 ms/case); single-case runs 181–296 ms,
  cap 8,000 ms.

## Synthetic final-like case

A synthetic h00 (42 comparables, 2,900 minute history points, 48 whole-hour history
rows, hour-1 print 850,000 with 12,000 channels and 60 reads, 1.28 MB case file)
runs in 186 ms and produces a valid 23-row forecast: h2 median 778,409.65 (×0.92),
h24 median 613,809.84 (×0.72) — the big-launch peer group (ELDEN RING, Cyberpunk
2077) is flat to falling by hour 24, which is what the model returns for an 850k
anchor.

## Real practice answers: NOT fetched

Step 4 of the brief (fetch the 4 practice launches' release-day curves from
SullyGnome) was attempted once and skipped: the API answered HTTP 403 with a
Cloudflare challenge page. Per the brief, a blocked fetch is skipped, not worked
around. Validation therefore rests on the leave-one-out results above, not on a
local real-practice score.

## Files

- `main.ts` — the entrypoint (Node 22, stdlib only, offline, deterministic)
- `LICENSE` — MIT, SPDX-License-Identifier: MIT (copied from the kit starter)
- `README.md` — badges + model summary
- `.makefun/owner.json` — `{"wallet": "BmAi2SViEeu3E7xUpbLC313xafftRJuuJWrfjCA3tuJp"}`
- `.gitignore` — out/, scratch/
- `tests/scorer.mjs`, `tests/loo.mjs`, `tests/validate.mjs`
- `BUILD-REPORT.md` — this file

## Risks / notes for the submitter

- The final case's hour-1 print is the one number everything hangs on; the model
  anchors on it and nothing else. If the recorder's hour 1 is thin (few reads),
  the print is still the mean of whatever reads exist, per the rules.
- The model has never seen a launch as big as GTA VI will be; the shape comes from
  the biggest comparables (ELDEN RING 875k, Cyberpunk 2077 852k hour-1 prints) via
  the hour-1 similarity weight, which is the closest available evidence.
- No mention of the house model brand anywhere in the entry (per the brief).
