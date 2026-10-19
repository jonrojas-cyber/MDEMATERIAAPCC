# Auditoría de producto · ¿Se puede vender Control M como SaaS a otras cafeterías de especialidad?

> **Para qué es este documento.** Es una auditoría técnica y de producto de la app "Control M" (el Business Operating System hecho para *m de materia*), orientada a UNA pregunta: **¿qué falta y qué sobra para convertirla en un producto vendible a otras cafeterías de especialidad?** Está pensado para pegarse en ChatGPT (o entregarse a un inversor/CTO) y trabajar sobre él un plan de comercialización.
>
> **Método.** Se auditó el **código real** del repositorio en 8 dimensiones, con evidencia `fichero:línea`. No son opiniones: cada hallazgo apunta al sitio concreto del código. Fecha: 2026-10-19.
>
> **Leyenda de severidad.** `bloqueante` = sin esto no se puede vender ni a una segunda cafetería · `alta` · `media` · `baja`.
> **Leyenda de esfuerzo.** `S` (días) · `M` (1-2 semanas) · `L` (semanas) · `XL` (más de un mes / rediseño).

---

## 1. Veredicto en una frase

**El motor operativo es fuerte; el envoltorio de producto no existe todavía.** Control M resuelve muy bien la operativa diaria de *una* cafetería (food cost, inventario con libro auditable, P&L, tesorería, equipo/turnos/fichaje, APPCC/trazabilidad, conciliación de ventas con el TPV). Pero **hoy es una aplicación mono-cliente cosida a *m de materia***: no hay forma de que dos cafeterías coexistan sin mezclar datos, no hay alta de clientes, no hay cobro, y la identidad (nombre, logo, usuarios, teléfono, IVA, zona horaria) está escrita en el código.

**Nivel de madurez como SaaS: bajo / "prototipo interno avanzado".** No es vendible como SaaS self-service tal cual. **Sí** es vendible, con trabajo acotado, como **piloto "llave en mano" (una instancia por cliente) con la marca despersonalizada** — y ese es el camino natural para financiar la construcción del multi-tenant real.

| Dimensión auditada | Madurez para vender |
|---|---|
| Motor de producto (operativa del café) | **Media** (es el activo) |
| Integraciones / portabilidad de datos | Baja |
| Arquitectura multi-tenant y aislamiento | **Baja (bloqueante)** |
| Configurabilidad vs cableado a la marca | Baja |
| Seguridad, roles y RGPD | Baja |
| Modelo comercial (planes, pago, suscripción) | **Inexistente** |
| Internacionalización y fiscalidad | Baja |
| Operación y escalado como servicio | Baja |

---

## 2. El bloqueante nº 1, que aparece en las 8 dimensiones: **no hay multi-tenant**

Es el hallazgo que repiten, por separado, los ocho análisis. Merece su propia sección porque **condiciona todo lo demás**.

- Los datos se guardan en **colecciones globales por entidad** (una tabla/fichero por "ventas", "materias", "usuarios"…) **sin ninguna columna de cliente/tenant**. El DDL es literalmente `(seq, id, data JSONB, updated_at)` sin tenant (`backend/db.js:48-54`), y la carga lee **todas las filas** a una caché única (`backend/db.js:63-67`, `backend/data-store.js:198-213`).
- Existe un campo `local_id` en el usuario y en el token JWT, **documentado como "preparado para multi-local"**, pero **no filtra ninguna lectura**: las ~146 llamadas `readAll()` de los 36 ficheros de rutas devuelven el universo entero (`backend/routes/ventas.js:67`, `backend/routes/materias.js:65`…). El único middleware de `/api` valida token y rol, **nunca tenant** (`backend/server.js:413`, `backend/auth.js:205-216`).
- Hasta las **notificaciones push se envían a TODOS los dispositivos** sin distinguir café (`backend/push.js:73-103`).

**Consecuencia directa:** si das de alta una segunda cafetería en la misma instancia, **sus ventas, materias, usuarios, cierres y tesorería se mezclarían** con los de la primera. Hoy, servir a N cafeterías obliga a **N despliegues + N bases de datos** → inviable en coste y operación.

> ⚠️ **Matiz crítico (no confundir):** que exista `local_id` NO significa que haya "medio multi-tenant". Es **andamiaje engañoso**: da sensación de multi-local sin aislar nada. Hay que elevarlo a un aislamiento real y **obligatorio** en el punto único de acceso a datos (`backend/data-store.js`), que es justamente lo que hace el refactor viable: un solo choke-point en vez de tocar 36 rutas a mano.

---

## 3. LO QUE FALTA (necesidades para vender)

### 3.1 Bloqueantes (sin esto no hay producto, ni para una segunda cafetería)

| # | Necesidad | Por qué | Esfuerzo | Evidencia |
|---|---|---|---|---|
| B1 | **Multi-tenant: columna de tenant en todas las entidades + filtrado en lecturas/escrituras + middleware de pertenencia** | Sin aislamiento los cafés comparten datos; es ilegal y comercialmente inviable | XL | `backend/db.js:48-54`, `backend/data-store.js:286-315`, `backend/server.js:413` |
| B2 | **Modelo de cuenta/tenant** (entidad `cuentas` con nombre, plan, estado, propietario) | Es el cimiento al que asociar datos y usuarios; `ENTITIES` no tiene concepto de cuenta | L | `backend/data-store.js:36-109` |
| B3 | **Alta / onboarding self-service** (registro → crea cuenta + usuario propietario + arranque vacío) | Un SaaS se vende solo si el cliente se da de alta sin que alguien le cree cuentas a mano | L | único alta hoy = seed fijo `backend/auth.js:97-116`; sin ruta de registro |
| B4 | **Des-cosido de la marca (white-label)**: nombre, logo, tema, textos, usuarios y teléfono deben salir del código a configuración | Un cliente nuevo ve hoy "m de materia", a Jon/Lara/Mónica en el login y el teléfono de la empresa | L | `frontend/index.html:18, 2287, 38`; `manifest.webmanifest`; `backend/cierre-caja.js:43` |
| B5 | **Pasarela de pago + planes + suscripción + super-admin + control de impago** | Sin esto no se cobra ni se suspende a quien no paga; hoy **no existe nada** de billing | L | sin dependencia Stripe/Paddle; sin entidades de plan; `backend/auth.js:47-68` (solo roles de un local) |
| B6 | **Cumplimiento RGPD** (consentimiento, export y borrado por cliente, DPA, retención de datos personales) | Se tratan datos de empleados (nombre, PIN, fichajes, ausencias); **ilegal comercializar en la UE sin esto** | L | 0 coincidencias de rgpd/consentimiento; backup/restore son globales, no por cliente |
| B7 | **IVA / moneda / zona horaria / idioma configurables por cliente** | Hoy está cosido a España (IVA 10% único, €, Europe/Madrid, es-ES); otro café saca P&L y PVP mal | L | `backend/iva.js` (10% fijo), `backend/tz.js:5` (Madrid fijo), 196 usos de `€` en el front |

### 3.2 Alta prioridad (necesarias para un producto competitivo)

- **Soporte de otros TPV además de Ágora** (Square, Lightspeed, Glop, Revo, Hiopos…) mediante una **capa de adaptadores**. Hoy toda la normalización está incrustada en `backend/agora.js`; el motor de abajo es reutilizable, pero no hay interfaz de adaptador. *(L por TPV.)*
- **Captura de ventas propia / alta manual** cuando no hay TPV compatible (hoy la única entrada es importar CSV o el conector de Ágora). *(XL.)*
- **Export / portabilidad de datos** del cliente (ventas, productos, escandallos) en CSV/Excel/JSON. El backup es **solo CLI, sin endpoint** (`backend/backup.js:11-13`) → bloqueo anti-lock-in y RGPD. *(M.)*
- **API pública + webhooks de salida** (hacia gestoría / BI / contabilidad). Hoy las integraciones son solo de entrada. *(L.)*
- **Gestión de usuarios/roles desde la UI** (alta, baja, reseteo de PIN, roles configurables). Hoy se hace por `SEED_USERS` + reinicio. *(M.)*
- **Credencial más fuerte que un PIN de 4 dígitos** (solo 10.000 combinaciones; la única defensa es el rate-limit online), 2FA opcional y recuperación. *(M.)*
- **Backups automáticos por cliente** con rotación y prueba de restauración (hoy manual y global). *(M–L.)*
- **Varios tipos de IVA simultáneos** (10% consumo + 21% retail/alcohol/para llevar). El propio código reconoce que el neteo plano al 10% "fallaba con IVA mixto". *(L.)*
- **Fidelización / CRM de clientes**, **venta online / suscripción de grano**: líneas estándar en especialidad, hoy inexistentes. *(XL cada una — valorar como add-ons.)*
- **Aislamiento de fallos entre clientes** (hoy `uncaughtException` tumba el proceso de todos) y **crons con líder/lock** (hoy `setInterval` en un proceso: con >1 réplica se duplican envíos/importaciones/conciliaciones). *(M–L.)*
- **Migraciones de esquema versionadas**, **monitorización/alertas/logs estructurados**, **límites y rate-limiting por cliente** en toda la API. *(M–L.)*

### 3.3 Media / baja prioridad (madurez de producto)

- Exportables de informes financieros (P&L, inventario valorado, resumen de IVA) a Excel/PDF para la gestoría.
- App de empleado individual (hoy el fichaje es una tablet compartida por PIN) y generación de nómina.
- Cumplimiento fiscal de facturación (Verifactu/TicketBAI/SII, modelos 303/347) — necesario si se posiciona como herramienta fiscal.
- Revocación de sesión en servidor, forzado de HTTPS a nivel de app, token fuera de `localStorage` + CSP sin `unsafe-inline`.
- Panel de estado (status page), SLA y runbook de operación continua.
- Impresión de comanda de cocina y reservas/mesas (no universales en el segmento).

---

## 4. LO QUE SOBRA (cosido a *m de materia* o superfluo para un producto genérico)

Clasificado en **quitar** (no debe existir en el producto), **parametrizar** (pasar a configuración por cliente) u **opcional** (módulo activable).

### 4.1 Quitar
- **Usuarios y PINs reales de personas** (Jon/Lara/Mónica/Daniel con PINs 1111/2222/3333 y 5234/4444, blindaje de Jon como admin) — `backend/auth.js:97-101`, `backend/seed-usuarios.js:38-70`. *Filtra identidades y es un default peligroso.*
- **Salarios y rotación de turnos de personas concretas** (Lara 1800 €, Daniel 2500 €; ciclo 7 sep–15 nov 2026) — `backend/seed-negocio.js:19-39`, `backend/seed-turnos.js:15-28`.
- **Teléfono de la empresa** (`34682250373`) como destino por defecto de cierre de caja y pedidos — `backend/cierre-caja.js:43`, `backend/routes/pedidos.js:105`. *Dejar vacío para no filtrar el número a otro cliente.*
- **Limpiezas/migraciones one-shot** específicas de esta producción — `backend/server.js:607-626`.
- **Constantes de IVA duplicadas en el frontend** (`LAB_IVA_FOOD=0.10`, `/1.10`, `const IVA=0.10`) — `frontend/index.html:5322, 8097, 13358`. *Deben derivar del IVA configurado, no redeclararse.*

### 4.2 Parametrizar (lo más urgente para des-coser la marca)
- **Siembra automática del catálogo REAL de *m de materia*** en cada arranque (cafés Inefable, gramajes de cocina, proveedores reales, productos) → convertir en **seed de DEMO opcional por cliente** — `backend/server.js:567-605`, `backend/seed-*.js`.
- **Identidad de marca**: nombre "m de materia", imagotipo de tres barras (SVG mask), tema oliva/grafito, tipografía Courier, ~165 textos en el front, títulos de PWA/push, marca en PDFs/etiquetas/carta — `frontend/index.html:18, 31-60, 38`, `manifest.webmanifest`, `backend/pdf.js:25`, `backend/push.js:14`. → **config "negocio" + branding por cliente**.
- **Login hardcodeado**: la lista de quién puede entrar se pinta de un objeto JS del front (`const USUARIOS={Jon,Lara,Daniel,Moni}`, `frontend/index.html:2287`), no de la API. → **servir los usuarios del tenant desde el backend**.
- **IVA 10% único**, **zona horaria Madrid**, **locale es-ES**, **moneda €**, **denominaciones de arqueo en euros** → todo a configuración del cliente — `backend/iva.js`, `backend/tz.js:5`, `backend/cierre-caja.js:22-23`.
- **`local_id` = "principal"** propagado como literal por decenas de módulos → debe convertirse en el **tenant real** del solicitante, no desaparecer — `backend/forecast.js:32`, `backend/treasury-os.js:87`, etc.
- **Objetivos de negocio** sembrados con cifras concretas (22.000 € ventas, ticket 6,5 €…), **horario por defecto 8-16h** ("m de materia cierra a las 16:00"), **prefijo de clave del conector `mdm_`**, textos "Ágora" por toda la UI → genéricos o por cliente.

### 4.3 Opcional (módulos activables, no núcleo)
- **MBDS** (laboratorio de diseño de bebidas, catas, lotes de I+D) — `backend/routes/mbds.js`.
- **Burbujas** (limonadas carbonatadas Origen/Equilibrio/Colección, super juice al vacío) — `frontend/index.html:4308`.
- **Spritz** por lata de 250 ml — `frontend/index.html:5030`.
- **Temporizadores sous-vide** con push — `backend/sv-timers.js`.
- **Recetario de cocina propietario** (salsa verde, dukkah, sándwiches/tostas, matcha base) → plantillas iniciales opcionales — `backend/seed-cocina.js`, `LAB_DATA`.

> Estos módulos son parte del **valor diferencial** de m de materia, pero para un café genérico deberían ser **presets activables**, no datos cableados en el núcleo.

---

## 5. Lo que SÍ es un activo (no subestimar)

Para vender, conviene saber qué está sorprendentemente bien y se puede presentar como fortaleza:

- **Ingesta de ventas robusta**: idempotente (por GlobalId / Serie+Número+día), **atómica** (todo-o-nada), bloquea tickets con productos sin vincular (no inventa ventas), separa venta/invitación/devolución/anulación, señala descuentos — `backend/agora.js:237-459`.
- **Libro de stock único y auditable** + reconciliación de almacén + conciliación diaria al céntimo contra el TPV — `backend/stock-ledger.js`, `backend/conciliacion-diaria.js`.
- **Motor de dinero de fuente única**: food cost, P&L/EBITDA, punto de equilibrio, tesorería con conciliación bancaria — `backend/costing.js`, `backend/cuenta-resultados.js`, `backend/treasury.js`.
- **Separación de roles con "guardián económico"**: borra coste/precio/margen de la respuesta a los no-admin de forma recursiva — `backend/economia-guard.js`.
- **Fiabilidad de instancia**: health/readiness, cierre ordenado (SIGTERM con flush), guardado durable con cola y `flush()` que propaga fallos, escritura atómica, transacciones Postgres, blindaje anti-pérdida, CI con gate (lint + unit + e2e) — `backend/server.js`, `backend/data-store.js`, `backend/process-guards.js`.
- **Conector TPV** listo para PC sin IP fija (push saliente, token rotable, latido + alarma de caído) — `backend/tpv-connector.js`.

El trabajo de SaaS **no tira nada de esto**: lo envuelve.

---

## 6. Hoja de ruta propuesta (de piloto a SaaS)

### Fase 0 · Des-coser la marca — *white-label básico* (semanas)
Objetivo: poder desplegar una instancia para un cliente **sin que vea "m de materia"**.
- Mover identidad (nombre, logo, tema, textos, títulos PWA/push) a una config `negocio`.
- Quitar usuarios/PINs/teléfono/salarios reales; login servido desde la API.
- Arreglar configurabilidad real de **IVA, moneda, zona horaria y locale** (incluido `tz.js`, que hoy ignora el override, y las constantes de IVA duplicadas del front).
- Convertir los seeds de m de materia en **demo opcional**, no arranque automático.

### Fase 1 · Vendible a pilotos — *una instancia dedicada por cliente* (semanas)
Objetivo: cerrar 1–3 cafeterías piloto con despliegue propio y limpio.
- Onboarding/alta con catálogo vacío + plantillas demo; gestión de usuarios/roles desde la UI.
- Export de datos (portabilidad) + aviso legal/privacidad + backups automáticos.
- Soporte de **1–2 TPV adicionales** vía adaptador (según el TPV de los pilotos).

### Fase 2 · SaaS self-service — *multi-tenant real* (el gran bloque)
Objetivo: convertirlo en producto que se vende y escala solo.
- **Multi-tenancy**: entidad `cuentas` + columna de tenant + filtrado en el choke-point del `data-store` + middleware de pertenencia + aislamiento de push/config/credenciales por tenant.
- **Alta self-service** + **super-admin** (consola de clientes) + **planes/suscripción + Stripe + control de impago**.
- RGPD completo (consentimiento, export/borrado por cuenta, DPA).

### Fase 3 · Escala e internacional (continuo)
- Crons con líder/lock, memoria (paginación/streaming), migraciones versionadas, monitorización/alertas/status page, rate-limiting por cliente.
- Capa de adaptadores de TPV amplia + API pública/webhooks.
- i18n (multi-idioma), multi-moneda, varios tipos de IVA, cumplimiento fiscal (Verifactu/TicketBAI).

---

## 7. Riesgos de intentar vender tal cual (hoy)

1. **Legal/RGPD (UE):** sin DPA, consentimiento ni borrado por cliente, comercializar con datos de empleados es ilegal.
2. **Privacidad / fuga entre clientes:** sin multi-tenant, un cliente podría ver datos de otro; además se filtran usuarios, PINs, teléfono y catálogo reales de *m de materia*.
3. **Fiscal:** el IVA 10% único da P&L, margen y PVP erróneos a cualquier café con tipos mixtos u otra región.
4. **Comercial/operativo:** "una instancia por cliente" no escala en coste ni soporte; con réplicas, los crons se **duplican** (envíos/importaciones/conciliaciones); sin facturación no hay ingreso recurrente.
5. **Seguridad:** PIN de 4 dígitos como única credencial, token en `localStorage` y CSP con `unsafe-inline`: un XSS roba la sesión, crítico con dinero y datos personales de varios clientes.

---

## 8. Contradicciones y matices detectados (lectura crítica)

- **"Multi-local preparado" ≠ multi-tenant.** El `local_id` existe pero no aísla nada; tratarlo como si fuera media solución es el error a evitar.
- **El "punto único de IVA" no es único:** el frontend duplica el 10% en tres sitios; parametrizar el IVA obliga a tocar también el front.
- **La configurabilidad de zona horaria está a medias:** `tz-init.js` respeta `CONTROL_M_TZ`, pero `tz.js` ignora el override y fija Madrid.
- **En modo JSON, los datos del cliente acabarían en el repositorio de código** (`backend/data/*.json` versionados): para SaaS hay que forzar Postgres por tenant y sacar esos datos del árbol.

---

## 9. Prompt sugerido para ChatGPT

> "Actúa como asesor de producto y arquitecto SaaS. Te paso una auditoría del código de mi app de gestión para cafeterías de especialidad. Quiero vendérsela a otras cafeterías. A partir del documento: (1) valida o discute el veredicto; (2) dame un plan de 3–6 meses con hitos y estimación de esfuerzo para llegar a 3 clientes piloto y luego a SaaS self-service; (3) propón un modelo de precios por plan para hostelería pequeña en España; (4) dime qué construir yo y qué comprar/integrar (pago, RGPD, TPV); (5) señala los 5 riesgos que más pueden hundir la venta y cómo mitigarlos. Sé concreto y prioriza por impacto en ingresos."

---

*Auditoría generada sobre el código real del repositorio (8 dimensiones, con evidencia `fichero:línea`). Las cifras de esfuerzo son orientativas (S: días · M: 1-2 semanas · L: semanas · XL: >1 mes).*
