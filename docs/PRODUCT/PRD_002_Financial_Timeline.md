# PRD 002 — Financial Timeline, Forecast & Anomaly · Implementation Report

**Version:** 1.0
**Status:** Delivered (v102)
**Date:** 2026-07-02
**Author:** Lead Architect / CTO
**Builds on:** PRD 001 (Snapshot Engine).

## Business Problem Solved

Owners understood *today* but not *trends* or *the future*. Control M now answers
automatically: is my cash improving, how fast is debt falling, is business value
growing, **when will I run out of cash**, what if sales fall 10%, how much will I
have in N days — and flags **anomalies** before they become losses.

## New Engines (all read the snapshot series — no duplicated money logic)

1. **FinancialTimelineEngine + DeltaEngine (`timeline.js`)** — one catalogue of 13
   metrics (stock vs flow), `serie()`, and `delta()` with day/week/month/year
   comparisons (windowed sums for flows, point deltas for stocks), 7/30-day moving
   averages, least-squares trend, growth velocity and acceleration. Single source
   of all timeline math.
2. **ForecastEngine (`forecast.js`)** — linear-regression projection with **R²
   confidence**, horizons **7/30/90/180/365**, **cash runway-to-zero** ("when will
   I run out of cash?"), and **what-if scenarios** ("sales −10%"). Pluggable
   `modelo` arg — an ML model can replace the projection without touching the API/UI.
3. **AnomalyEngine (`anomaly.js`)** — z-score detection over the series (daily value
   for flows, day-to-day change for stocks) for cash drops, inventory growth, profit
   collapse, waste spikes, labor increases and revenue swings. Each anomaly carries
   **severity, confidence, explanation and a suggested action**; handles the
   flat-baseline edge case (a spike over a perfectly stable base is a strong anomaly).

## Intelligence Wired into the Copilot

The executive copilot now speaks predictively: *"Al ritmo actual te quedarás sin
caja en 19 días (aprox. 2026-07-09)"* and *"Merma anormalmente alta — revisa
caducidades y sobreproducción."* Both reference measurable data and end in an action.

## API

- New `GET /api/executive-dashboard/timeline?metric=&horizon=&dias=` (admin-only):
  one optimized call → `metricas`, `serie`, `delta`, `forecast`, `horizontes`,
  `runway_caja`, `anomalies`.
- Executive response gains `inteligencia: { runway_forecast, anomalias }`.

## UI — Executive Timeline

New screen (`irA_timeline`): **one chart, many metrics** (metric selector chips),
**solid history + dashed forecast + red anomaly dots**, horizon selector, forecast
headline, cash-runway warning, delta summary and anomaly list. Monochrome, Spanish,
5-second rule. Empty state until snapshots accumulate.

## Snapshot Schema Enrichment (normalized)

Added daily facts: `fixed_cost_dia`, `variable_cost_dia`, `margen_dia`,
`updated_at`, `forecast_reference` (ML placeholder). Weekly/monthly/yearly profit
are **derived by the Timeline** from the daily series rather than denormalized per
row — the correct normalization ("Normalize where appropriate", per the PRD).

## Performance

Reading ≤400 JSON rows + regression is sub-millisecond. For PostgreSQL at scale,
add indexes `financial_snapshots(local_id, date)`, `(date)`, `(local_id, created_at)`
and range-partition by `local_id`/year for enterprise (documented for the SQL path).

## Files

- **New:** `backend/timeline.js`, `backend/forecast.js`, `backend/anomaly.js`,
  `tests/timeline.unit.js`, this report.
- **Modified:** `backend/snapshot-engine.js` (schema), `backend/executive-dashboard.js`
  (intelligence block + copilot ctx), `backend/routes/executive-dashboard.js`
  (`/timeline`), `backend/copilot.js` (forecast/anomaly insights),
  `frontend/index.html` (Timeline screen + chart), `tests/e2e.spec.js`, `package.json`.

## Tests

- `timeline.unit.js` (7): delta trend/velocity, flow windowed sums, forecast R²,
  cash runway-to-zero, scenario, anomaly detection, no-false-positives.
- E2E: `/timeline` shape, worker **403**, timeline screen renders.
- **36 E2E + 10 unit suites green, zero regressions.**

## Self-Audit — The Control M Standard

1. ✔ Business value — past/present/future + predictive cash warning + anomalies.
2. ✔ Architecture — 3 single-responsibility engines; timeline is the one source of
   delta/series math; forecast/anomaly compose it.
3. ✔ No duplicated logic — all read snapshots; money still from `costing.js`.
4. ✔ UI simple — one chart, selectable metrics, 5-second rule.
5. ✔ Worker fast/unaffected — timeline admin-only (403 test green).
6. ✔ Owner more intelligent — forecasts, scenarios, anomalies, runway.
7. ✔ Financials centralized — unchanged single source of truth.
8. ✔ Scalability — `local_id` throughout; pluggable ML model; index/partition plan.
9. ✔ Tests updated — new unit suite + 2 E2E + worker-403 extended.
10. ✔ Existing functionality intact — 36 E2E green.

## Risks & Next

- Forecast is linear; good for short horizons, weaker for seasonality → next:
  seasonal/rolling model behind the same `modelo` interface.
- Anomaly thresholds are fixed z=2/2.5/3 → make per-metric configurable.
- Render horizon comparison and scenario controls directly in the Timeline UI.
- Feed the timeline/forecast/anomalies to a future AI narrative ("what changed, why,
  what's next") — architecture already exposes all inputs in one call.
