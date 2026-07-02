# PRD 004 — Treasury Operating System · Implementation Report

**Version:** 1.0
**Status:** Delivered (v104)
**Date:** 2026-07-02
**Author:** Lead Architect / CTO
**Builds on:** PRD 001–003 (Snapshots, Timeline/Forecast, Health).

## Business Problem Solved

Owners knew "money in the bank". Control M now runs the whole treasury: where every
euro is, how much is **available** vs **committed**, how many days the business
survives, its liquidity ratio and business value, and **what will happen** — plus an
Emergency Monitor that flags cash problems *before they become visible*.

## Engine Map (reused where it existed, built where it didn't)

| PRD engine | Implementation |
|---|---|
| TreasuryEngine | `treasury-os.js` (assembler, one call) |
| LiquidityEngine | `treasury.liquidezAvanzada` (working capital, ratio, reserve, burn) **new** |
| CashFlowEngine | `cashflow.js` (inflows/outflows/net, trend, rolling avg) **new** |
| BusinessValueEngine | `financials.patrimonioNeto` + `forecast` + goodwill-ready |
| RecurringExpenseEngine | `fixed-costs.js` (existing) |
| TreasuryForecastEngine | `forecast.js` (existing) |
| Emergency Monitor | `treasury-os.emergencyMonitor` **new** |

## What This Increment Added

1. **CashFlowEngine (`cashflow.js`)** — real inflows (sales + executed collections) vs
   outflows (purchases + executed payments + prorated fixed costs + labor), per
   day/week/month/year, with net, month-over-month trend and 30-day rolling average.
   Composes existing engines — no new money math.
2. **LiquidityEngine (`treasury.liquidezAvanzada`)** — **working capital** (current
   assets − current liabilities), **liquidity ratio**, **emergency reserve** vs the
   configurable `reserva_caja` target, **safety margin**, **burn** and months of buffer.
3. **Emergency Monitor** — simulates the running balance against upcoming payments and
   flags the exact event that would push cash **negative**, with a risk level and a
   concrete action. (Validated: a €5,000 payment in 3 days → "riesgo alto".)
4. **Treasury OS assembler (`treasury-os.js`)** — one response with dashboard KPIs
   (cash, bank, available, committed, AR, AP, taxes, inventory, assets, debt, equity,
   business value, runway, liquidity ratio, working capital, reserve, burn), cash flow,
   liquidity, business value (+30/90-day forecast + goodwill slot), recurring
   obligations, emergency monitor and a 7–365-day treasury forecast.

## Architecture / Refactors

- **No duplicated money logic:** everything composes `costing.js` → `financials.js`.
- **Cycles avoided:** `treasury.liquidezAvanzada` lazily requires financials/debts/
  targets (financials already requires treasury).
- Old `GET /treasury` kept for compatibility; `GET /treasury/os` is the new one-call OS.

## API

- New `GET /api/treasury/os` (admin-only) — the full Treasury Operating System.

## UI

`irA_tesoreria` upgraded from a cash summary into the Treasury OS: emergency banner
(only when at risk), liquidity headline (available/committed/runway), a 2×2 of
cash-flow / business value / liquidity ratio / burn, taxes, recurring obligations,
accounts + movements CRUD, upcoming payments/collections. Spanish, monochrome, 5s.

## Security

Treasury and its OS are admin-only (segment outside `EQUIPO_ALLOWED` + guard;
worker-403 E2E extended to `/treasury/os`). Manager/enterprise granularity ready.

## Tests

- `treasury.unit.js` (4): cash-flow math, liquidity (working capital/ratio/reserve),
  emergency negative-event detection, OS assembly.
- E2E: `/treasury/os` shape, worker 403, treasury screen renders.
- **40 E2E + 12 unit suites green, zero regressions.**

## Self-Audit — The Control M Standard

1. ✔ Business value — the owner never wonders "can I afford this?"; the Emergency
   Monitor answers before the problem is visible.
2. ✔ Architecture improved — clean engine split; assembler is the single call.
3. ✔ No duplicated logic — composes existing engines; money still from `costing.js`.
4. ✔ UI simple — one screen, 5-second rule; details expandable.
5. ✔ Worker fast/unaffected — treasury admin-only (403 tests green).
6. ✔ Owner more intelligent — available vs committed, cash flow, working capital,
   emergency monitor, business-value forecast.
7. ✔ Financials centralized — single source of truth preserved.
8. ✔ Scalability — `local_id`, snapshot-based timeline, forecast horizons, goodwill slot.
9. ✔ Tests updated — new unit suite + 2 E2E + worker-403 extended.
10. ✔ Existing functionality intact — 40 E2E green.

## Risks & Next

- Cash-flow treats sales as immediate cash (true for a café); add settlement timing
  for card/deferred payments when needed.
- Wire executed inflows/outflows into the snapshot so the cash-flow timeline is fully
  historical (today it recomputes from events).
- Next: treasury scenarios ("if I hire / buy the machine / take the loan"), and feed
  the Emergency Monitor into the executive copilot as a top-priority alert.
