# PRD 003 — Business Health Engine · Implementation Report

**Version:** 1.0
**Status:** Delivered (v103)
**Date:** 2026-07-02
**Author:** Lead Architect / CTO
**Builds on:** PRD 001 (Snapshots), PRD 002 (Timeline/Forecast).

## Business Problem Solved

Owners optimised isolated metrics (sales up, profit up) while the business could be
getting weaker. Control M now answers one question — *how healthy is my company?* —
with a single, explainable, non-editable 0–100 score that balances every critical
area, decomposes into categories, forecasts itself, and surfaces prioritised risks.

## Approach (evolved, not rebuilt)

The existing `business-health.js` (a flat weighted score of 8 signals) was
**refactored into a category engine** while preserving its contract
(`calcular`/`calcularConComparativo` still return `score`, `razones`, `señales`, `delta`).

## What This Increment Added

1. **Category engine.** Ten categories — Financial, Cash Flow, Inventory, Employee,
   Production/APPCC, Purchasing, Growth, Risk, plus **Customer** and **AI Confidence**
   (architecture-ready). Each has its own 0–100 sub-score composed from existing
   engines; the global is their weighted average. Missing data → category excluded
   (never faked). New signals: **Growth** (net-worth trend from snapshots) and
   **Purchasing** (supplier price stability).
2. **Configurable weights (never hardcoded).** Weights live in the new
   `business_health_config` entity with `DEFAULT_PESOS` as fallback. Editable via
   `GET/PUT /business-health/config` (admin-only) and a UI weight editor. A unit
   test proves the weights drive the global (all weight on Risk → global = Risk score).
3. **RiskEngine (`risk.js`).** Cash, debt, inventory, supplier and operational risks,
   each with **probability, impact, priority (=prob×impact), level, explanation and
   action**. Powers the Risk category and the copilot. `saludRiesgo()` = 100 when clear.
4. **Health forecast.** `forecast.proyectar("salud", 30)` projects the score from the
   snapshot `salud` series (30/…/365 horizons available); shown as "previsión a 30 días".
5. **Category history.** The daily snapshot now stores `salud_categorias` — per-category
   evolution for trends and future AI.
6. **Copilot explains drops, not just scores.** *"La salud del negocio bajó 6 puntos,
   hasta 78/100. La causa principal: Inventario (−9). Prioriza el stock lento…"* —
   using `mayor_deterioro` + the top risk's action.
7. **Executive dashboard** carries `salud.categorias`, `salud.riesgos`,
   `mayor_mejora/deterioro` and `inteligencia.salud_forecast`.

## Architecture / Refactors

- **Single source of truth preserved:** all money still from `costing.js`; the health
  engine only composes. Timeline/forecast/anomaly reused (no duplicated deltas).
- **Cycle broken cleanly:** `business-health` lazily requires `risk` and
  `snapshot-engine` inside `calcular()` to avoid a load-time require cycle.
- **Normalized history:** category scores stored per day; aggregates derived.

## Files

- **New:** `backend/risk.js`, `tests/health.unit.js`, this report,
  `backend/data/business_health_config.json`.
- **Modified:** `backend/business-health.js` (category engine + weights),
  `backend/routes/business-health.js` (config + health forecast),
  `backend/snapshot-engine.js` (category history), `backend/executive-dashboard.js`
  (salud_forecast), `backend/copilot.js` (drop explanation), `backend/data-store.js`
  (entity), `frontend/index.html` (category bars, risks, forecast, weight editor),
  `tests/e2e.spec.js`, `package.json`.

## API

- `GET /api/business-health` now returns `categorias`, `riesgos`, `mayor_mejora`,
  `mayor_deterioro`, `forecast`.
- `GET/PUT /api/business-health/config` — configurable weights (admin-only).

## Security

Health and its config are admin-only (segment outside `EQUIPO_ALLOWED` + guard;
worker-403 E2E extended to `/business-health/config`). Manager/enterprise roles
remain compatible for future granularity.

## Tests

- `health.unit.js` (5): category decomposition, **weights drive the global**, risk
  detection with priority/action, zero-risk = 100, health forecast.
- E2E: health response shape, config GET/PUT, worker 403, category screen renders.
- **38 E2E + 11 unit suites green, zero regressions.**

## Self-Audit — The Control M Standard

1. ✔ Business value — one explainable heartbeat + prioritised risks + forecast.
2. ✔ Architecture improved — flat score → category engine; risk extracted to its own module.
3. ✔ No duplicated logic — composes costing/financials/timeline/forecast.
4. ✔ UI simple — category bars + risks, 5-second rule; weight editor tucked away.
5. ✔ Worker fast/unaffected — health admin-only (403 tests green).
6. ✔ Owner more intelligent — categories, risks, drop-cause, health forecast.
7. ✔ Financials centralized — unchanged single source of truth.
8. ✔ Scalability — configurable weights, `local_id` history, Customer/AI slots ready.
9. ✔ Tests updated — new unit suite + 2 E2E + worker-403 extended.
10. ✔ Existing functionality intact — 38 E2E green.

## Risks & Next

- Category sub-scores use fixed shaping constants → expose per-category thresholds
  alongside weights.
- Customer Health needs a data source (reviews/NPS/loyalty) — slot is ready.
- Next: health-forecast scenarios ("health if revenue −15% / labor +X / new location"),
  and an AI narrative combining categories + risks + forecast into "what changed, why,
  what's next" — all inputs already exposed in one call.
