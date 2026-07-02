# Control M · Documentación

**Version:** 0.1.0
**Status:** Draft
**Last Updated:** 2026-07-02

Este directorio contiene toda la documentación profesional de **Control M**, el
Sistema Operativo del Negocio para hostelería. La documentación es la fuente única
de verdad del producto: qué es, por qué existe, cómo está construido y hacia dónde va.

## Cómo está organizada

| Carpeta | Propósito |
|---|---|
| **CONTROL_M_BIBLE/** | La "biblia" canónica y versionada del producto: visión, filosofía, ADN de negocio, biblia de UX, reglas de desarrollo, y la especificación de cada motor (financiero, inventario, producción, compras, inteligencia, copiloto) y de cada estándar (datos, API, base de datos, seguridad, testing, multi-local, enterprise, roadmap). Es la referencia maestra; el resto de carpetas la desarrollan en detalle. |
| **PRODUCT/** | Especificaciones de producto: user stories, briefs de funcionalidades, PRDs, flujos de usuario, criterios de aceptación. El "qué" y el "para quién". |
| **ARCHITECTURE/** | Arquitectura del sistema: mapa de módulos, flujo de datos, límites entre capas, decisiones estructurales, diagramas. El "cómo encaja todo". |
| **DATABASE/** | Modelo de datos: entidades, relaciones, esquema, semillas, estrategia de persistencia dual (JSON / PostgreSQL) y migraciones. |
| **API/** | Referencia de la API HTTP: endpoints, contratos, autenticación y roles, formatos de petición/respuesta, ejemplos y versionado. |
| **DESIGN/** | Sistema de diseño: principios visuales (monocromo), tipografía, componentes, patrones de UI, accesibilidad y guía de estética. |
| **AI/** | Capa de inteligencia: previsión de demanda, insights de negocio, copiloto financiero, salud del negocio y sus modelos, señales y umbrales. |
| **ROADMAP/** | Planes por fases, hitos, prioridades y horizonte de producto. |
| **DECISIONS/** | Registros de decisiones de arquitectura (ADR): decisiones relevantes, contexto, alternativas consideradas y consecuencias. |

## Convenciones

- Cada documento lleva **Version**, **Status** (`Draft` · `In Review` · `Stable` ·
  `Deprecated`), **Last Updated**, **Purpose**, **Dependencies** y una **Table of
  Contents**.
- El idioma de la documentación puede ser español o inglés; la **interfaz de la
  aplicación es siempre en español**.
- La `CONTROL_M_BIBLE/` es la referencia maestra: si algo entra en conflicto,
  manda la biblia.

## Índice de la biblia

La estructura oficial la define [`CONTROL_M_BIBLE/MASTER_PLAN.md`](./CONTROL_M_BIBLE/MASTER_PLAN.md).
La biblia se organiza en cinco volúmenes:

- **Volume I · Foundation (00–07):** Vision, Why Control M Exists, Product Philosophy,
  Business DNA, Company Principles, UX Bible, Development Rules, Decision Framework.
  _Apéndices (08–09): What We Will Never Build, Excellence and Permanence._
- **Volume II · Product (10–18):** Executive Control Center, Worker Experience,
  Owner Experience, Financial / Inventory / Production / Purchasing Engines,
  Business Intelligence, AI Copilot.
- **Volume III · Design (20–24):** Design System, UI Rules, Motion, Copywriting, Accessibility.
- **Volume IV · Engineering (30–35):** Architecture, Database, API Standards, Security,
  Testing, Performance.
- **Volume V · Future (40–45):** Multi Location, Franchise, Enterprise, Marketplace,
  AI Future, Product Roadmap.

**Estado del contenido:** oficiales v1.0 → 00, 02, 03, 04, 06 y los apéndices 08–09.
El resto son plantillas de especificación listas para completar.
