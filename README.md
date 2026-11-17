# Twitch CCU Forecast

[![make.fun · gta6-twitch-ccu-forecast-01](https://make.fun/badge/gta6-twitch-ccu-forecast-01.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![rank](https://make.fun/badge/gta6-twitch-ccu-forecast-01/leonjnk99/twitchforecast/rank.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![reward](https://make.fun/badge/gta6-twitch-ccu-forecast-01/leonjnk99/twitchforecast/reward.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)

Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01) — see the [gta6-twitch-ccu-forecast-01 bounty](https://make.fun/bounty/gta6-twitch-ccu-forecast-01).

A forecaster for Grand Theft Auto VI's launch-day Twitch viewers, hour by hour.
One hour into the release day it reads that hour's viewer count and forecasts hours
2–24 as five quantiles each, for the lowest pinball loss on the log scale.

## How it works

Comparable-ratio curves. For each past big launch, take its release-day hourly
curve and form log-ratios to its own hour-1 print, `r_h = ln(viewers_h / viewers_1)`.
The forecast is the case's own hour-1 print times the empirical quantiles of those
ratios across comparables — the ratios carry the shape, the case's hour-1 print
carries the scale, so a launch bigger than any comparable still extrapolates through
its own anchor.

A launch's shape is set by when its unlock rolls around the world: rolling-midnight
console launches already have most regions playing by 00:00 UTC, so hour 1 is large
and the curve stays flat; simultaneous-global launches have a near-empty hour 1 and
ratios of 100x or more by evening. The two regimes are separated almost entirely by
the size of the hour-1 print, so comparables are weighted by how close their hour-1
print is to the case's, with a Gaussian kernel in log space
(`w = exp(-(ln h1_comp - ln p1)^2 / (2 * 0.8^2))`). Tier, platform and recency
weights were tried in leave-one-out and added nothing, and a channels-similarity
weight made it worse, so they are not used. The only exclusion is the GTA VI
category's own pre-release history, which has no release day.

The spread is the empirical quantiles themselves — no normal assumption, no separate
sigma. They are wide where comparables disagree (late hours) and narrow where they
agree (the overnight lull). See BUILD-REPORT.md for the validation numbers.

## How to run

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Node 22 or later, standard library only, no network. Reads every `<id>.in` in the
input directory and writes `<id>.out` beside it: `{"hours":[{"hour":2,"q":[q05,q25,q50,q75,q95]}, ...]}`,
23 rows, hours 2–24. Deterministic — two runs write identical bytes — and under a
second per case.

## Tests

```sh
node tests/scorer.mjs    # pinball scorer, reproduces the RULES worked example
node tests/loo.mjs       # leave-one-out over the comparables, end to end via main.ts
node tests/validate.mjs  # format, determinism and runtime on the 4 practice cases
```

## Layout

- `main.ts` — the program: case in, forecast out
- `tests/` — scorer, leave-one-out, and format/determinism/runtime checks
- `BUILD-REPORT.md` — model, leave-one-out results, practice-case outputs
