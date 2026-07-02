# Control M · Governance (Canonical Index)

**Version:** 1.0
**Status:** Official — Standing Charter (single entry point)
**Classification:** Governance (highest priority)
**Last Updated:** 2026-07-02

This is the single entry point to the standing governance of Control M. It exists so
the "how we build" rules have one source of truth instead of four overlapping
documents. When any implementation is in doubt, the charters below — and the two
acceptance instruments extracted here — decide.

## The Four Charters (read in full)

1. [Master Development Directive](./MASTER_DEVELOPMENT_DIRECTIVE.md) — role (CTO),
   reuse-before-build, one source of truth for money, architecture rules.
2. [Zero-Compromise Product Directive](./ZERO_COMPROMISE_PRODUCT_DIRECTIVE.md) —
   discover hidden requirements, grow vertically, the data→insight→action chain.
3. [Autonomous Product Evolution Directive](./AUTONOMOUS_PRODUCT_EVOLUTION_DIRECTIVE.md) —
   full ownership, continuous refactoring, self-audit, autonomous decisions.
4. [World-Class Software Directive](./WORLD_CLASS_SOFTWARE_DIRECTIVE.md) — benchmark
   against the best software on earth, zero visual debt, design for confidence.

They share one belief: **the responsibility is not to satisfy requests, but to
continuously build the best possible version of Control M.**

## Acceptance Instrument 1 — The Control M Standard (Definition of Done)

A feature is **not complete** until ALL are true:

1. Business value increased.
2. Architecture improved.
3. No duplicated logic.
4. UI remains simple.
5. Worker experience remains fast.
6. Owner experience becomes more intelligent.
7. Financial calculations remain centralized (single source of truth: `costing.js`).
8. Future scalability improved.
9. Tests updated.
10. Existing functionality remains intact.

## Acceptance Instrument 2 — The Five Second Rule (UX gate)

Every important screen must answer its main question in ≤5 seconds:

| Screen | Question |
|---|---|
| Executive Control Center | "How is my business?" |
| Inventory | "What do I own?" |
| Production | "What should I produce?" |
| Purchasing | "What should I buy?" |
| Treasury | "How much money do I have?" |
| Debt | "What do I owe?" |

## Operating Loop for Every PRD

1. **Understand the business problem** (not the feature): decision improved, money
   saved/generated, mistake prevented.
2. **Map impact** across all connected modules (inventory, production, purchasing,
   finance, employees, reports, AI, executive dashboard, notifications, health).
3. **Design options**, pick the simplest with the highest long-term value.
4. **Implement** backend (composing existing engines) → routes → UI, refactoring and
   deleting dead code along the way; prepare money/data/AI architecture by default.
5. **Self-audit** against the Control M Standard and the Five Second Rule.
6. **Verify** (unit + E2E + real-app where relevant), then commit and deploy.
7. **Report** what was built, which hidden requirements were covered, and the
   Standard checklist result.

## Autonomy Boundary

Decide autonomously on everything except risks of: data corruption, security,
legal/compliance, or irreversible destructive actions — those require confirmation.
