# Verificación previa a la corrección — AUDITORIA-MILIMETRO-2026-10

**Fecha:** 2026-10-11 · **Alcance:** solo lectura. No se ha modificado código ni datos de la app.
**Qué he verificado:** el código actual del repositorio (rama de trabajo y `main`), contrastado hallazgo por hallazgo.
**Qué NO he podido verificar:** el sitio en vivo (Render). El proxy de salida bloquea `controlm-mdemateria.onrender.com` (CONNECT 403, comprobado). Por tanto, lo que digo del entorno en vivo es **deducción documentada**, no verificado, y así lo marco.

---

## 1. Instrucciones de gobierno aplicables

### CLAUDE.md (única fuente de instrucciones del repo)
- **Mandato:** el asistente actúa como CTO y Director de Producto; decide producto/arquitectura/implementación (lo más simple que cumpla), lo documenta en una línea; **solo pregunta cuando es matemáticamente imposible continuar sin ese dato**; entrega funcionalidades terminadas (desarrolladas, tests en verde y desplegadas), nunca cuestionarios.
- **Reglas de negocio innegociables:**
  1. **Una sola fuente de verdad para el dinero.** Nunca duplicar cálculos de coste/precio; derivar de un único sitio.
  2. **El rol `equipo` nunca ve coste, precio de coste ni margen.** Se filtra con `mbdsEsAdmin()` en front y con `req.user.rol==="admin"` en las rutas.
  3. **No se despliega si no pasan las validaciones** (`CI=true npm test`).
- **Stack:** Node/Express; `backend/data-store.js` (JSON en disco o PostgreSQL vía `DATABASE_URL`); rutas en `backend/routes/`. Front: SPA de un fichero `frontend/index.html`. PWA: `manifest.webmanifest`, `sw.js`, web-push (`backend/push.js`, VAPID).
- **Test/deploy:** `CI=true npm test` (unit + Playwright). Reset de datos con `git checkout HEAD -- backend/data/` antes y después. Deploy: commit en rama → push → `git checkout main` → `git pull` → `git cherry-pick -x HEAD@{1}` → `git push origin main` (Render despliega al hacer push a main).
- **Convenciones:** prefijos de función por módulo (`lim*`/`bur*`, `spz*`, `lab*`, `cja*`, `svt*`, `pwz-`); comprobar que un prefijo nuevo no colisiona; **escapar siempre el contenido dinámico con `esc()`**.

### AGENTS.md
**No existe** ningún `AGENTS.md` en el repositorio (búsqueda en todo el árbol, excluyendo `node_modules`). La única fuente de instrucciones es `CLAUDE.md`.

---

## 2. Rama, último commit y versión desplegada

| Dato | Valor |
|---|---|
| Rama de trabajo | `claude/jolly-franklin-3j3eg4` |
| Último commit de la rama | `97a9572` (2026-10-11) — "Auditoría al milímetro (octubre 2026): documento autocontenido…" |
| `main` local y `origin/main` | `e686037` (2026-10-10) — "Cuadre con Ágora: no contar pedidos como ventas + restar devoluciones" |
| Diferencia real de contenido rama ↔ `main` | **Solo 2 ficheros**: `AUDITORIA-2026-10.md` y `AUDITORIA-MILIMETRO-2026-10.md` (2.019 líneas de documentación). **Cero diferencias de código.** |

**Lectura:** todas las correcciones de código de esta sesión ya están en `main` (`e686037`). La rama de trabajo solo añade los documentos de auditoría (no se hace *cherry-pick* de docs a `main`, por eso no se despliegan). El árbol de trabajo está limpio.

**Versión desplegada:** el despliegue se dispara con `.github/workflows/deploy.yml` (push a `main` → `POST` al Deploy Hook de Render del servicio `controlm-mdemateria`). Por tanto, la versión que *debería* estar en vivo corresponde al contenido de `main` = `e686037`. **No puedo confirmar que el servicio en vivo esté efectivamente ejecutando ese commit** (sin acceso a Render desde aquí). Para confirmarlo hace falta mirar el panel de Render (Events/Deploys) o un endpoint de salud del sitio.

---

## 3. Tabla de hallazgos (agrupados y contrastados con el código actual)

Los 79 hallazgos del documento se agrupan en ~31 problemas únicos. Estados: **CORREGIDO** / **ABIERTO** (ambos verificados en el código de hoy) · **NO CONFIRMADO** (no verificable sin producción, o no re-verificado línea a línea en esta tarea).

### A. Dinero (reglas nº 1 y nº 2)

| # | Problema (agrupa) | Estado | Evidencia en código actual | Pruebas existentes |
|---|---|---|---|---|
| G1 | **IVA asimétrico en el P&L**: ventas en neto pero costes fijos en bruto | **ABIERTO** | `financials.js:143` `const fijos = eur(seg.otros)` (bruto) junto a ventas con `netoDeVenta`; `fixed-costs.js:35` nunca lee `fc.vat` | `pyl-neto.unit.js` (cubre ventas netas; **no** comprueba que los fijos se neteen → brecha) |
| G2 | **Margen por producto en bruto** vs P&L en neto (~10% de desajuste) | **ABIERTO** | `costing.js:93` `coste = round(costeNeto*(1+iva))` // "coste CON IVA" | `costing-elaboracion.unit.js` (no fija la base de IVA) |
| G3 | **Doble descuento de IVA** en Cuenta de resultados cuando el origen es cierre guardado / análisis de mes | **ABIERTO** (interacción con el cambio de IVA de esta sesión) | `analisis-mes` guarda `snap.neto` (ya neto) en config `ventas_mes_*`; `cuenta-resultados.js:135-139` lo trata como **bruto** y vuelve a hacer `ventasBruto/(1+IVA)` → neto ÷ 1,10 | `cuenta-resultados.unit.js` + `analisis-mes.unit.js` existen pero **no se cruzan** |
| G4 | **Tres motores de food-cost/coste con bases distintas** | **PARCIAL** | `analisis-diario` ya usa `financials.netoDeVenta` (neto, corregido); `costing` sigue con IVA (G2) | `consistencia-pantallas.unit.js`, `analisis-diario.unit.js` |
| G5 | **Punto de equilibrio con bases mezcladas** (ventas vs costes IVA) | **NO CONFIRMADO** (depende de G1/G2; no re-verificado `break-even.js` línea a línea) | — | — |
| G6 | Ágora: **pedidos (SalesOrder) contados como ventas** | **CORREGIDO** | `agora.js`: se omite `salesorder/pedido/comanda` → `pedidos_omitidos` | `agora-cuadre.unit.js` (caso 1) |
| G7 | Ágora: **devoluciones (cantidad negativa) descartadas** | **CORREGIDO** | `agora.js`: `signo = cantidad<0?-1:1`; la devolución resta y repone stock | `agora-cuadre.unit.js` (casos 2-3) |
| G8 | **Doble conteo albarán + factura** (mismo documento en dos tipos) | **ABIERTO** (no auto-dedup. deliberado: borraría ventas reales) | `agora.js`: la clave de negocio es serie+número **dentro de un tipo**; no cruza DeliveryNote↔Invoice | — |
| G9 | **"Quitar duplicados" colapsa ventas idénticas reales** | **ABIERTO · crítico** | `conciliacion-ventas.js`: agrupa por firma; si hay ≥2 tipos conserva `ordenado[0]` y **elimina el resto** → infracuenta si había 2 ventas legítimas iguales | `conciliacion-ventas.unit.js` (falta caso de ventas idénticas legítimas) |
| G10 | **Ruta de importación antigua (`importarVentas`) aún accesible** + cron horario | **ABIERTO** | `routes/ventas.js:33` (fallback manual); `server.js:505` `setInterval` horario si `AGORA_CSV_PATH` | `migracion-ventas-dup.unit.js` (parcial) |
| G11 | **Discrepancia 1055 (Control M) vs 1035 (Ágora)** del día concreto | **NO CONFIRMADO** (sin acceso a producción) | Candidatos: pedidos/devoluciones (ya corregido en ingesta), G8, o distinto corte horario/zona. Requiere tu export de Conciliación `por_tipo` del día | — |

### B. Regla nº 2 (el equipo no ve dinero)

| # | Problema | Estado | Evidencia | Pruebas |
|---|---|---|---|---|
| G23 | Middleware que **filtra claves económicas** para no-admin | **CORREGIDO** | `economia-guard.js` montado en `server.js:329` (`app.use("/api", …filtrarRespuestas)`); borra por patrones (`coste`, `precio_*`, `margen`, `food_cost`, `beneficio`, `ebitda`, `rentabilidad`, `escenarios`…) | `economia-guard.unit.js` |
| | *Matiz:* el filtro va por **patrón de clave**. Cualquier clave económica nueva fuera del patrón se escaparía → mantener la lista al día y añadir test al crear campos. | | | |

### C. Fiabilidad y datos

| # | Problema | Estado | Evidencia | Pruebas |
|---|---|---|---|---|
| G12 | **Escrituras no atómicas** (riesgo de fichero corrupto si el proceso cae) | **ABIERTO** | `data-store.js`: `fs.writeFileSync` directo (sin temp+rename) | `persistence.unit.js` (no cubre atomicidad) |
| G13 | **JSON inválido → `[]`**: pérdida silenciosa de datos al leer | **ABIERTO** | `data-store.js`: `readFile` con `catch` que devuelve `[]` | — |
| G14 | **`flush` nunca rechaza** (`Promise.allSettled`) → API responde 200 sin confirmar escritura (modo DB) | **ABIERTO** | `data-store.js` `flush` | — |
| G15 | **Sin manejador `SIGTERM`/`beforeExit`** → en Render (que duerme/reinicia) se pierde la cola de escritura | **ABIERTO** | No hay `process.on(...)` en `backend/` | — |
| G16 | **`nextId` colisiona en lotes** (mismo milisegundo) → ids duplicados (p. ej. `stock_movements`) | **ABIERTO** | `data-store.js`: `nextId = ${prefix}-${pad3(len+1)}-${ms}` | — |
| G17 | **Sous-vide: `init()` borra los temporizadores ya vencidos** → si el server durmió, se pierde el aviso de "retirar" | **ABIERTO · crítico (seguridad alimentaria)** | `sv-timers.js`: `const vivos = leer().filter(t => t.fireAt > now); guardar(vivos)` | — |
| G18 | **`replaceAll` = DELETE + INSERT** (ventana de tabla vacía) | **ABIERTO** | `db.js`: `DELETE FROM ${t}` seguido de inserción | — |
| G19 | **Integridad referencial:** venta de materia inexistente se ignora en silencio | **ABIERTO (menor)** | `agora.js:289` `if (!m) return;` | — |

### D. Seguridad

| # | Problema | Estado | Evidencia | Pruebas |
|---|---|---|---|---|
| G20 | **JWT:** secreto de desarrollo fijo cuando NO es producción; en prod se genera aleatorio (invalida sesiones en cada reinicio) | **ABIERTO (matiz)** | `auth.js:42` | — |
| G21 | **Oráculo de PIN en fichaje** (no comparte el bloqueo del login) | **ABIERTO** | `fichaje.js:47` usa `verificarPin` sin lockout | — |
| G22 | **Sin `helmet`, sin rate-limit, sin `compression`; CORS abierto; body 25 MB** | **ABIERTO** | `server.js` | — |

### E. Periodos / zona horaria

| # | Problema | Estado | Evidencia | Pruebas |
|---|---|---|---|---|
| G28 | **Cortes de día/semana/mes con hora local del proceso (UTC) en vez de Europe/Madrid** | **PARCIAL** | `tz.js` añade `horaDecimal`/`fechaLocal` (Madrid) y `dashboard-ceo` lo usa (corregido); `periods.js` sigue con `new Date(y,m,d)` locales → posible desfase de 1-2 h en el corte de día | `tz.unit.js` |
| G27 | **Comparativo "mes anterior" puede desbordar fin de mes** | **NO CONFIRMADO** (coherente con `periods.js` usando `addMonths`; no re-verificado el desbordamiento exacto) | `periods.js` | — |
| G29 | **Intereses estimados = 30% fijo de la cuota** (heurística, no dato real) | **ABIERTO (menor)** | `financials.js:152` `*0.3` | — |

### F. UX / PWA (Bloque 4, pendiente)

| # | Problema | Estado | Evidencia | Pruebas |
|---|---|---|---|---|
| G24 | **Contraste del botón primario insuficiente** (#23281E sobre #45443D ≈ 1,5:1) | **ABIERTO** | `index.html:1561` `.btn-primary{background:var(--olive)…;color:#23281E}` con `--olive=#45443D` | — |
| G25 | **`sw.js` sin precache** → sin modo offline; errores de red sin traducir | **ABIERTO** | `sw.js:13` `addEventListener("fetch", () => {})` (passthrough) | — |
| G26 | **Dashboard sin caché + re-sondeo cada 3 min** → recálculo en cada GET | **ABIERTO (menor)** | `routes/dashboard.js:12`; front `180000 ms` | — |

### G. Calidad / proceso

| # | Problema | Estado | Evidencia | Pruebas |
|---|---|---|---|---|
| G30 | **Sin ESLint; suite de tests encadenada a mano** (`&&`, un fallo corta el resto); reset de datos solo entre unit y e2e | **ABIERTO (menor)** | No hay `.eslintrc`; `package.json` `test:unit` = cadena de `node …&& node …` | — |
| G31 | **`esc()` aplicado de forma inconsistente** al contenido dinámico | **ABIERTO (a revisar)** | ~58 usos de `` `${e.message}` `` frente a 25 con `esc(e.message)`. *Nota honesta:* el conteo bruto mezcla front y backend; no todos son XSS (muchos son logs de servidor). Requiere revisión fina caso por caso | — |

**Resumen de estado:** CORREGIDO y verificado → G6, G7, G23 (y parcial G4/G28). ABIERTO y verificado → G1, G2, G3, G8, G9, G10, G12–G22, G24–G26, G29–G31. NO CONFIRMADO (necesita producción o verificación adicional) → G5, G11, G27.

---

## 4. Arquitectura real de producción (sin secretos)

> No tengo acceso al entorno en vivo (proxy bloquea Render con 403). Lo siguiente se **deduce del repositorio**; marco entre corchetes lo que es deducción.

- **Alojamiento:** Render, servicio `controlm-mdemateria`. Despliegue por GitHub Actions (`.github/workflows/deploy.yml`) que llama al **Deploy Hook** de Render en cada push a `main`. [El Deploy Hook se guarda como secreto de repo `RENDER_DEPLOY_HOOK_URL`; no se muestra su valor y no aparece en el código.] También hay `railway.json` y `nixpacks.toml` en el repo (configuración alternativa/heredada de Railway/Nixpacks).
- **Persistencia:** `backend/data-store.js` con **doble modo**: ficheros JSON en disco (`backend/data/*.json`) **o** PostgreSQL si existe `DATABASE_URL` (`backend/db.js`). [Qué modo corre en vivo depende de si Render tiene `DATABASE_URL` configurada — no verificable desde aquí. En plan gratuito de Render el disco es efímero, por lo que el modo JSON en disco perdería datos entre reinicios; si hay Postgres, persiste.]
- **Número de instancias:** [deducción: una sola instancia. El código usa estado en memoria/caché y `setInterval` para el cron de import; con varias instancias habría cron duplicado y caché incoherente. Compatible con plan único/gratuito de Render, que además duerme el servicio por inactividad.] No verificable sin el panel de Render.
- **Integración Ágora:** conector local (`conector-agora/conector.js`) que corre en un PC de la cafetería. Lee del servidor de Ágora `GET http://SERVIDOR:8984/api/export/?filter=Invoices,DeliveryNotes,SalesOrders&include-processed=false` (cabecera `Api-Token`), envía los documentos a Control M (`backend/agora.js` → `importarDocs`) y confirma con `POST /api/doc/processed` para no reenviarlos. Alternativa por email (`facturas-email.js`/`resend-inbound.js`) y latido/alarma de conector caído. [Tokens/URLs reales viven en `conector-agora/config.json` del PC y en variables de entorno de Render; no se muestran.]
- **Copias de seguridad:** **no hay ninguna rutina de backup en el código** (ni export programado, ni snapshot de `backend/data`, ni `pg_dump`). [Si la persistencia en vivo es Postgres de Render, existiría el backup que ofrezca el plan de Render; si es JSON en disco efímero, no hay copia. No verificable desde aquí.] **Recomendación para la fase de corrección:** añadir un export diario de solo lectura como red de seguridad.

---

## 5. Cómo obtener una exportación de solo lectura para conciliar un día de Ágora con Control M

Objetivo: comparar, para **una misma fecha**, lo que dice Ágora y lo que muestra cada pantalla financiera de Control M, **sin alterar nada** (sin marcar documentos como procesados).

**A) Export de Ágora (solo lectura — clave: `include-processed=true` y NO llamar a `/processed`):**
```
GET http://SERVIDOR:8984/api/export/?filter=Invoices,DeliveryNotes,SalesOrders&include-processed=true
Cabecera: Api-Token: <token del conector>   (no reproducir el valor aquí)
```
Esto devuelve **todos** los documentos del periodo (también los ya procesados) sin confirmarlos, así que no modifica el estado de Ágora. Para el cuadre del día, filtrar por `BusinessDay = <fecha>` y sumar:
- **Facturas (Invoices)** = ventas cerradas.
- **Devoluciones** = líneas con cantidad negativa → **restan**.
- **Pedidos (SalesOrders)** = **no** son venta → **excluir**.
- Distinguir **importe con IVA** vs **neto** por línea.

**B) Lo que muestra Control M (endpoints de solo lectura, como admin):**
| Pantalla | Endpoint | Para el cuadre |
|---|---|---|
| Conciliación de ventas | `GET /api/ventas/conciliacion?dia=<fecha>` | desglose `por_tipo` (factura/albarán/pedido/devolución) — **la clave para explicar el 1055 vs 1035** |
| Estado de sincronización | `GET /api/agora-estado` y `/api/sincronizacion` | último import, documentos omitidos |
| Portada / Dashboard | `GET /api/dashboard` | "ventas hoy" (bruto) y "resultado del día" |
| Análisis diario | `GET /api/analisis-diario?fecha=<fecha>` | ventas (bruto y neto), food cost, margen |
| Resumen financiero | `GET /api/financiero` | cascada EBITDA día/mes/año |
| Cuenta de resultados | `GET /api/cuenta-resultados?mes=<AAAA-MM>` | ingresos netos y resultado |

**C) Procedimiento de cuadre (una sola vez, para la fecha en disputa):**
1. Lanzar el export (A) con `include-processed=true` y guardar el JSON (solo lectura).
2. Sumar en Ágora: Facturas − Devoluciones, excluyendo Pedidos; anotar total **con IVA** y **neto**.
3. Pedir a Control M los 6 endpoints (B) para la **misma fecha y hora de corte**.
4. Comparar línea a línea: la diferencia debería explicarse por (i) IVA, (ii) pedidos/devoluciones, o (iii) G8/G9 (albarán+factura o deduplicado). El `por_tipo` de `/api/ventas/conciliacion` lo dirá sin ambigüedad.

> Aún no puedo ejecutar esto por ti porque requiere el token del conector y acceso a la red local de la cafetería / al sitio en vivo (ambos fuera de mi alcance desde aquí). Cuando me pases el JSON del `por_tipo` del día, cierro el 1055 vs 1035 con números, no con hipótesis.

---

## 6. Declaración de alcance (honestidad)

- **Acceso a producción:** **NO tengo.** El proxy de salida bloquea `controlm-mdemateria.onrender.com` (403, comprobado). Todo lo del entorno en vivo (instancias, modo de persistencia real, estado del último deploy, backups de Render) es **deducción del repositorio**, marcada como tal, no verificado.
- **Lo verificado** es el **código del repositorio a día de hoy** (rama `claude/jolly-franklin-3j3eg4` y `main` `e686037`), citando fichero y línea.
- **No he presentado como verificado nada que solo deduzca.** Los hallazgos G5, G11 y G27 quedan como **NO CONFIRMADO** a propósito.
- **No he modificado código ni datos de la app** en esta tarea (árbol de trabajo limpio; este documento es el único añadido).
