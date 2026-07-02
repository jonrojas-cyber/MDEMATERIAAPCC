# PRD 005 — Fixed Costs Operating System · Implementation Report

**Version:** 1.0
**Status:** Delivered (v105)
**Date:** 2026-07-02
**Author:** Lead Architect / CTO
**Builds on:** PRD 001–004 (Snapshots, Timeline/Forecast, Health, Treasury).

## Business Problem Solved

Owners knew *roughly* what they spent each month. Control M now turns every
recurring expense into operational intelligence: how much it costs to **exist**
before selling a coffee (day/week/month/year), how much **every open hour** costs,
how much must be sold to **not lose money** (break-even in €, customers and coffees),
how much sales can fall before **entering losses** (safety margin), what costs will
be **with inflation**, and — most importantly — **where to save**.

## Engine Map (reused where it existed, built where it didn't)

| PRD engine | Implementation |
|---|---|
| FixedCostEngine | `fixed-costs.js` — prorating, hourly cost, inflation projection **(extended)** |
| RecurringExpenseEngine | `fixed-costs.js` recurring set + `treasury-os.obligaciones` (existing) |
| BreakEvenEngine | `break-even.puntoEquilibrio` **new** |
| ContributionMarginEngine | `break-even.contribucion` (composes `costing.margenProducto`) **new** |
| CostForecastEngine | `cost-analytics.forecast` (composes `forecast.js` + inflation) **new** |
| CostAnalyticsEngine | `cost-analytics.alertas / evolucion` **new** |
| FixedCostsOS assembler | `fixed-costs-os.js` (one call) **new** |

## What This Increment Added

1. **Frequencies** — added `biweekly` (14d), `semiannual` (182.5d) and `custom`
   (`custom_days` divisor) to the daily-normalization map. Everything still
   normalizes internally to a **single daily cost** — the one source of truth.
2. **Hourly cost** — `costePorHora` splits the monthly fixed cost across real open
   hours from the **operating profile** (days/week × hours/day): €/hour and €/minute.
3. **BreakEven + Contribution** — contribution ratio of the menu (1 − food cost),
   contribution per product/category, and the live break-even: revenue required
   today/week/month/year = fixed base ÷ contribution ratio, expressed in **euros,
   customers and coffees**, plus the **safety margin** (how far sales can fall).
4. **Cost analytics (AI-ready)** — detects duplicate subscriptions, expired-but-active
   contracts, renegotiable contracts and abnormal cost spikes (z-score on the
   `fixed_cost_dia` snapshot series), each with an **estimated annual saving**.
5. **Cost forecast** — annual projection with per-cost or default **inflation**
   (never hardcoded) plus historical horizons from the snapshot series when present;
   month-vs-month / year-vs-year evolution.
6. **Operating profile** — a configurable singleton (`business_config`): open
   days/week, hours/day, average ticket, average coffee, default inflation.

## Architecture / Refactors

- **No duplicated money logic:** break-even/contribution compose `costing.js`;
  fixed-cost math stays in `fixed-costs.js`; the OS only assembles.
- **Cycles avoided:** `break-even` and `cost-analytics` lazily `require()`
  `financials` / `forecast` / `anomaly` / `snapshot-engine` inside functions.
- Added the `fixed_cost_dia` metric to the **timeline catalogue** so the existing
  Forecast/Anomaly engines can project and watch fixed costs with zero new math.
- Executive Dashboard now carries a `break_even` block; the copilot speaks
  break-even (€ + coffees) and the top **savings opportunity**.

## API

- New `GET /api/fixed-costs/os` (admin-only) — the full Fixed Costs Operating System.
- New `GET`/`PUT /api/fixed-costs/perfil` (admin-only) — operating profile.
- `POST`/`PUT /api/fixed-costs` accept `custom_days` and `inflation_pct`.

## UI

`irA_costesFijos` upgraded from an expense list into the Fixed Costs OS: cost-to-exist
headline (month KPI + day/week/year + €/hour + biggest expense), a break-even card
(revenue/coffees/customers today + safety margin + week/month/year), savings-detected
and inflation KPIs, "where to save", cost by category, "what sustains the business"
(contribution), the editable cost list and an operating-profile editor. The main
Control Center cost card now shows the live break-even. Spanish, monochrome, 5s.

## Security

Fixed costs and the OS are admin-only (segment outside `EQUIPO_ALLOWED` + `soloAdmin`
guard). Worker-403 E2E extended to `/fixed-costs/os` and `/fixed-costs/perfil`.
Manager (operational summaries) vs owner (full visibility) granularity is ready.

## PostgreSQL

`business_config` added to `ENTITIES`; the store abstracts JSON vs PostgreSQL, so the
new singleton and the extended cost fields persist in both without schema surgery.

## Tests

- `fixed-costs.unit.js` (7): frequency normalization (biweekly/semiannual/custom),
  hourly cost, break-even math, negative safety margin, contribution ranking,
  duplicate-subscription detection, OS assembly.
- E2E: `/fixed-costs/os` shape, screen renders (cost-to-exist + break-even),
  worker 403 on `/fixed-costs/os` and `/fixed-costs/perfil`.
- **42 E2E + 13 unit suites green, zero regressions.**

## Self-Audit — The Control M Standard

1. ✔ Business value — the owner never asks "how much does my business cost?"; the
   software already knows, and already knows how to reduce it.
2. ✔ Architecture improved — clean engine split; one assembler call; new metric wired.
3. ✔ No duplicated logic — composes `costing.js`/`fixed-costs.js`; money still single-source.
4. ✔ UI simple — one screen, 5-second rule; profile and CRUD expandable.
5. ✔ Worker fast/unaffected — fixed costs admin-only (403 tests green).
6. ✔ Owner more intelligent — €/hour, break-even in coffees, safety margin, savings.
7. ✔ Financials centralized — single source of truth preserved.
8. ✔ Scalability — `local_id`, snapshot-based cost timeline, forecast horizons,
   inflation architecture (never hardcoded), goodwill/enterprise slots ready.
9. ✔ Tests updated — new unit suite + 2 E2E + worker-403 extended.
10. ✔ Existing functionality intact — 42 E2E green.

## Risks & Next

- Duplicate/unused detection is heuristic (provider/name + end_date); a review queue
  and one-click "dar de baja" would close the loop.
- Cost history depends on daily snapshots accumulating; month/year evolution grows
  richer over time (projection-by-inflation works from day one).
- Next: cost scenarios ("if rent rises 8% / I drop this subscription"), manager-scoped
  operational summaries, and feeding savings opportunities into the executive copilot
  as ranked actions with expected annual impact.
