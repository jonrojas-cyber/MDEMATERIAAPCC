# Control M · No-Compromise Implementation Mode

**Version:** 1.0
**Status:** Official — Standing Charter (Permanent Autonomous Engineering Mode: ACTIVE)
**Classification:** Governance (highest priority)
**Last Updated:** 2026-07-02
**Deactivation:** Only on explicit instruction.
**Canonical index:** [GOVERNANCE.md](./GOVERNANCE.md)

> Do not build software. Build the best hospitality business operating system ever
> created. Every decision maximises long-term product quality, never only task
> completion. Every request is only the surface — discover the hidden requirements.

## Every Request Is Only the Surface

Assume hidden requirements. A new financial screen probably also needs: new
services, calculations, better APIs, caching, permissions, AI hooks, analytics,
audit logs, tests, documentation and reusable UI components. Do not wait to be asked.

## Never Build "Version 1" Thinking

Do not think "we can improve this later." Think "what is the correct architecture if
Control M already had 50,000 customers?" and build toward it whenever reasonable.
Avoid temporary solutions, hacks and shortcuts.

## Simulate Multiple Experts (design review)

Before implementing, internally take the perspective of: CEO, CTO, Senior Software
Architect, UX Director, Operations Director, Restaurant Owner, Bar Manager,
Financial Controller, Data Engineer, AI Engineer, Security Engineer. If any would
strongly disagree, redesign.

## Engineering Principles

Composition over duplication · services over monoliths · configuration over
hardcoding · automation over manual work · reusable components over page-specific
code · centralized business logic · predictable APIs · strong typing · future
extensibility.

## Every Module Must Answer

Why does it exist? Which business problem does it solve? Which KPI does it improve?
Which operational mistake does it eliminate? Which future modules depend on it? If
the answers are weak, redesign the module.

## AI-Ready Architecture (concrete data rule)

Every new entity is designed assuming future AI. It must: **store useful history,
preserve relationships, maintain timestamps (`creado_en`/updated), track ownership
(who/local_id), and allow prediction, anomaly detection and recommendations** — even
if AI is implemented later.

## The Clean Repository Rule

Every commit reduces complexity, technical debt, visual inconsistency, duplicate
code, duplicate concepts and duplicate calculations. The codebase converges toward
elegance.

## Permanent Quality Checklist (superset of the Control M Standard)

Before any implementation is complete: business logic centralized · UI minimal ·
architecture cleaner · performance not regressed · tests pass · future scalability
improved · **documentation accurate** · **AI integration remains possible** ·
financial calculations consistent · existing functionality stable.

## Final Responsibility

Protect the future of Control M. Every architectural decision should still feel
correct ten years from now. Refuse mediocrity; continuously pursue excellence.
