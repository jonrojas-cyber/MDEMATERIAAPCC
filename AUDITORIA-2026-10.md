# Auditoría de Control M · octubre 2026

Auditoría exhaustiva en 8 dimensiones (dinero y reglas de negocio, seguridad y
autorización, integridad de datos, motor financiero y fechas, frontend/UX/accesibilidad,
PWA/push/offline, rendimiento y tests/CI). Cada dimensión la revisó un auditor a fondo
sobre el código real; los hallazgos **críticos y altos están verificados a mano** uno a uno.

---

## Veredicto en una línea

La app está **sorprendentemente bien construida** para su tamaño (motor de dinero
centralizado, 68 tests unit + 101 e2e, autenticación sólida con PIN hasheado y JWT,
service worker correcto). Pero arrastra **una fuga grave de la regla innegociable nº2**
(el equipo recibe coste/precio/margen desde el backend), **incoherencias de dinero**
(IVA bruto/neto, dos food costs) y varios **riesgos de datos/fiabilidad** que conviene
cerrar antes de que crezca el volumen.

---

## Plan de ataque recomendado (por orden)

| Bloque | Qué | Por qué primero | Esfuerzo |
|---|---|---|---|
| **1. Blindar el dinero (regla nº2)** | Filtrar coste/precio/margen en el backend para el rol equipo + test que lo impida | Viola la regla permanente de la fundadora; hoy cualquier empleado lo ve con DevTools | M |
| **2. Config de producción (Render)** | Verificar `DATABASE_URL`, `JWT_SECRET`, `VAPID_*`, `NODE_ENV=production` | Si falta algo aquí, hay pérdida de datos / avisos muertos / sesiones caídas | S (config) |
| **3. Bugs de dinero y fechas** | Unificar IVA (una sola base), arreglar tickets del cierre, hora de Málaga en la previsión | Cifras que la fundadora mira a diario y hoy no cuadran | M |
| **4. Fiabilidad** | Sous-vide que no se pierda, escritura atómica, flush al apagar | Seguridad alimentaria + no perder cierres/ventas en un deploy | M |
| **5. UX/accesibilidad** | Contraste del botón primario y badges del Lab, offline en español | Legibilidad de la acción principal en la tablet del local | S |
| **6. Escala (cuando haya meses de datos)** | Insertar solo lo nuevo (no reescribir toda la tabla), caché del dashboard, compresión | Hoy va fino; con 1 año de ventas se vuelve lento | M/L |

---

## 🔴 CRÍTICOS

### C1 · El equipo ve coste, precio y margen desde el backend (regla innegociable nº2) — **VERIFICADO**
La regla dice que el rol `equipo` **nunca** ve coste/precio de coste/margen, y que se
filtra en el front **y** en el backend. En el backend **no se filtra** en varias rutas a
las que el equipo sí entra (`EQUIPO_ALLOWED`): el ocultamiento con `mbdsEsAdmin()` en el
front es solo cosmético — con la sesión de Lara (PIN 2222) y el inspector del navegador se
lee todo en claro.

- `routes/inicio.js` — la **primera pantalla** de cualquier empleado trae `kpis` con
  `margen_medio_carta`, `valor_stock_total`, `coste_produccion_hoy`, `coste_mermas_hoy`
  (líneas 43, 55‑61) y `valor_stock_actual` por materia (línea 140). Sin ningún chequeo de rol.
- `routes/materias.js` — `decorate()` hace spread `...m` que arrastra `coste_medio`,
  `precio_compra`, `precio_pactado` y añade `valor_stock_actual` (líneas 41‑54); GET `/`,
  `/arbol` y `/:id` sin gate. **Además POST `/` y PATCH `/:id` no tienen `soloAdmin`**: el
  equipo puede **crear y editar precios de compra**.
- `routes/carta.js` — GET devuelve `coste`, `margen_bruto`, `margen_euros`, `food_cost`,
  `precio_recomendado`, escenarios de food cost (sin gate; `soloAdmin` solo cubre escribir).
- `routes/recetas.js`, `routes/preparaciones.js`, `routes/decisiones.js` — filtran
  `coste_estimado` / € de merma / valor de stock al equipo.

**Contraste:** `mbds.js` (`sinEconomia()`) y `mermas.js` sí lo hacen bien — el patrón existe,
pero se aplica caso a caso en vez de por diseño.

**Impacto:** cualquiera del equipo ve el coste de cada materia prima, el margen de cada
producto y el valor del almacén. Es exactamente lo que la regla prohíbe, y abre la puerta a
filtrar márgenes o manipular costes.

**Arreglo:** un helper compartido `sinEconomia(payload, req.user)` aplicado a la salida de
**toda** ruta de `EQUIPO_ALLOWED` (strip de `coste*`, `precio_compra/pactado`, `margen*`,
`food_cost*`, `valor_stock*`, `precio_recomendado`). Gate `soloAdmin` a POST/PATCH de materias.
**Test** que, con token de equipo, falle si la respuesta contiene esas claves. · Esfuerzo **M**.

### C2 · Persistencia efímera: sin `DATABASE_URL` se pierden TODOS los datos en cada deploy — **VERIFICAR EN RENDER**
`init()` cae a ficheros JSON sobre el disco efímero de Render si no hay BD, y el fail-closed
es opcional (`REQUIRE_DB=1`). Si producción no tiene `DATABASE_URL`, cada push a `main`
borra ventas, cierres, inventario y pedidos y vuelve al seed de git.

**Impacto:** pérdida total y silenciosa de los datos reales del café en cada despliegue.

**Arreglo:** confirmar en el panel de Render que `DATABASE_URL` está puesto (muy probable que
sí, porque el histórico persiste) y poner `REQUIRE_DB=1` para fallar en vez de arrancar en
efímero. · Esfuerzo **S** (configuración). *Dato: no tengo acceso a tu Render para comprobarlo.*

---

## 🟠 ALTOS

### A1 · Incoherencia de IVA: ventas en bruto contra coste neto, y dos food costs distintos — **VERIFICADO**
El P&L (`financials.js`) suma ventas en **bruto** (con IVA) pero resta coste de materia en
**neto** (`costing.costeProducto`), mientras la carta y el detalle del cierre usan coste
**con IVA** (`costing.margenProducto`). Resultado: el **beneficio/EBITDA/margen están
sobrestimados** (se queda el IVA repercutido como si fuera ingreso) y la **misma app muestra
dos food costs distintos** para el mismo mes (el de portada ~10% más bajo que el de la ficha
de producto). Roza la regla nº1 (una sola fuente de verdad).

**Arreglo:** fijar **una** convención — recomendado todo el P&L en **neto/neto** (usar
`v.importe_neto` cuando exista) y dejar el "con IVA" solo para caja/tesorería — y derivar
ambas vistas de **una** función de coste. Es una decisión de criterio contable: **conviene
que la valides tú**. · Esfuerzo **M/L**.

### A2 · Previsión del día inflada: hora UTC del servidor contra horario de Málaga — **VERIFICADO**
`fracDia` usa `getHours()` (el server corre en UTC; no se fija `TZ`) y lo divide por la
jornada local 8–16. En verano (UTC+2), a las 12:00 de Málaga calcula 10 → 25% de jornada en
vez de 50%, y la **"previsión de cierre" sale ~2× inflada** y nunca llega al 100%. Afecta a
`prevision_cierre`, `ritmo_necesario`, la conclusión del día y `ventas_por_hora`. *(Toca
justo el "cierre previsto a las 16:00" que ajustamos hace poco: el criterio era bueno, pero
la hora está en UTC.)*

**Arreglo:** usar `tz.partes(now)` (ya existe, con test) para la hora local en toda la
proyección. · Esfuerzo **S**.

### A3 · El aviso del temporizador sous-vide se pierde si el server dormía al vencer — **VERIFICADO**
`sv-timers.init()` hace `filter(t => t.fireAt > now)` y `guardar(vivos)`: **descarta y borra**
los temporizadores ya vencidos. El único planificador es un `setTimeout` en memoria que muere
cuando Render duerme el proceso (~15 min sin tráfico). Si un sous-vide vence mientras duerme,
el aviso "retira el producto" **nunca llega**.

**Impacto:** producto sobrecocido o fuera de curva de seguridad alimentaria, sin ninguna señal.

**Arreglo mínimo:** en `init()` no filtrar ni borrar; `leer().forEach(agendar)` (agendar ya
dispara los de ms≤0). Fiabilidad real: disparador externo por-temporizador o proceso always-on. · **S/M**.

### A4 · El backend entrega 200 "guardado" aunque la escritura a Postgres falle — **VERIFICADO (lectura)**
En modo BD, `writeAll/insert/update` **encolan** y responden antes de confirmar; `flush()`
usa `allSettled` (nunca rechaza) y varias rutas responden sin `flush`. No hay handler de
`SIGTERM`, así que en cada deploy Render corta y descarta lo que quede en cola. Un `.json`
truncado por un corte se lee como **array vacío** sin avisar.

**Impacto:** "materia creada / pedido guardado" que no se guardó; una colección puede quedar a
cero y el sistema lo toma como "no hay datos" (P&L, conciliación).

**Arreglo:** escritura atómica (`.tmp` + `rename`), `process.on('SIGTERM', flush)`, `await
flush()` antes de responder en rutas de escritura, y que un fallo de BD devuelva 5xx (no 200). · **M**.

### A5 · Botón primario y badges del Lab ilegibles (texto oscuro sobre fondo oscuro) — **VERIFICADO**
La regla ganadora pone `.btn-primary { background: var(--olive); color:#23281E }`, pero al
repintar la marca `--olive` pasó a grafito `#45443D`: texto `#23281E` sobre `#45443D` ≈ **1.5:1**
(WCAG pide 4.5:1). Afecta al botón de acción de **cada** pantalla (Guardar, Recibir, Cerrar
caja, Sincronizar…). Los badges "Aprobado"/"En carta" del Lab tienen el mismo problema (~1.7–2.7:1).

**Arreglo:** texto claro (`var(--cream)`) sobre el grafito, unificar las 3 definiciones en
conflicto de `.btn-primary`, y color de badge según luminancia del fondo. Test de contraste en CI. · **S**.

### A6 · Los ids de `stock_movements` colisionan en inserciones por lote — **VERIFICADO (lectura)**
`nextId = prefijo-(len+1)-(ms)`: al acumular movimientos y insertarlos todos al final, la
longitud no cambia durante el bucle → mismos ids salvo los ms. En Postgres el upsert es
`ON CONFLICT DO UPDATE` → el segundo movimiento **pisa** al primero y el asiento se **pierde**.
Rompe "el stock no cambia sin movimiento" (conciliación y merma oculta dan cifras falsas).

**Arreglo:** ids a prueba de lotes (`crypto.randomUUID` o secuencia real de BD), o insertar dentro del bucle. · **M**.

### A7 · Reloj de fichaje como oráculo de PIN sin bloqueo (fuerza bruta → admin)
`POST /fichaje/fichar` llama a `verificarPin` **sin** incrementar intentos ni respetar el
bloqueo. Los PIN son de 4 dígitos (10.000) y son los mismos del login. Desde la tablet
siempre abierta se pueden probar los 10.000 hasta sacar el PIN de admin y luego entrar.

**Arreglo:** aplicar el mismo bloqueo/rate-limit a `verificarPin`, y a medio plazo PIN de 6
dígitos o desacoplar fichaje de login. · **M**. *(Confianza media: requiere acceso a la tablet.)*

### A8 · Huecos de test en las reglas innegociables
No hay **ningún** test que compruebe que el equipo **no** recibe dinero en `mbds`/`mermas`
(única barrera: `sinEconomia`), ni cobertura 403 para ~8 rutas de dinero (`ebitda`,
`analitica`, `targets`, `integraciones`, `mermas/resumen`…). Un refactor podría abrir el
margen al equipo y **CI seguiría en verde**.

**Arreglo:** test equipo→sin campos económicos en cada ruta compartida, y un único test que
recorra todas las rutas admin-only esperando 403. · **M**.

### A9 · El dashboard recalcula todo desde cero en cada carga (sin caché), repolleado cada 3 min
`/api/dashboard` hace ~25‑35 escaneos completos de ventas por llamada (parseando `new Date`
por fila), sin caché, y el front lo repolla cada 3 min por sesión. Hoy es instantáneo; con un
año de ventas son millones de parseos por carga, bloqueando el único hilo de Node.

**Arreglo:** caché corta (TTL 60‑120 s), reutilizar un solo `beneficio()` por rango y
memoizar el coste por producto. · **M**.

### A10 · Cada sync del conector reescribe TODA la tabla de ventas (DELETE + re-INSERT)
`agora.importarDocs` termina con `writeAll("ventas", …)` → en Postgres `DELETE FROM ventas`
+ insert fila a fila, aunque solo entren 3 líneas. El propio `db.js` avisa de que eso es solo
para siembra. Con 1 año (~150k líneas) cada sync (cada 15 min) borra y reinserta todo, y un
fallo a mitad deja la tabla de ventas **vacía o parcial**.

**Arreglo:** `insert` solo de las líneas nuevas dentro del bucle (como ya se hace con
`stock_movements`); `replaceAll` solo para seeds. · **S**.

---

## 🟡 MEDIOS

- **Tickets y ticket medio del cierre de mes siempre vacíos** (VERIFICADO): `ticketsEnRango`
  devuelve un número pero `cierre-mes.js:250` lo lee como objeto (`.numero`/`.ticket_medio` →
  `undefined`). Dos KPIs del cierre en blanco siempre. Arreglo **S**.
- **Fronteras de día/semana/mes en UTC, no en Madrid**: entre las 00:00–02:00 locales la
  portada/fichajes/APPCC pueden mostrar el día anterior; la alarma de "conector caído" se
  desfasa 1‑2 h. Hoy es mayormente benigno (las ventas se agrupan por `BusinessDay` de Ágora). Arreglo **M**.
- **`comparativoAnterior('mes')` se desborda al mes siguiente** a fin de meses largos (feb vs
  31‑mar): contamina el "mes anterior" con días del posterior. Ya existe `tramoHastaMismoDia`
  (correcto) usado en otro sitio: hay dos implementaciones MTD, una con bug. Arreglo **S**.
- **Sin cabeceras de seguridad (helmet) y JWT en `localStorage`**: sin CSP/X-Frame-Options/HSTS
  y CORS totalmente abierto; un XSS roba la sesión. Arreglo **S**.
- **Sin rate limiting**: el bloqueo por cuenta permite dejar fuera a la dueña (5 PIN malos de
  "Moni" = 15 min bloqueada); body global de 25 MB abre DoS de memoria. Arreglo **S**.
- **Push muere en silencio tras reinicio sin `VAPID_*` fijo**: se regeneran claves y se vacían
  suscripciones; nadie recibe avisos hasta volver a "Activar" en cada dispositivo. *Verificar
  `VAPID_PUBLIC_KEY/PRIVATE_KEY` en Render.* Arreglo **S** (config).
- **Sin offline real**: el service worker no cachea nada; sin red, 2 min de spinner y error en
  inglés. El temporizador (100% cliente) podría funcionar offline. Arreglo **M**.
- **`index.html` de ~950 KB sin comprimir** (`no-store`): se re-descarga entero en cada
  apertura. Un middleware `compression` lo baja ~75%. Arreglo **S**.
- **Vía heredada `importarVentas` sin idempotencia** sigue viva (fallback + cron horario): si
  `AGORA_CSV_PATH` apunta a un fichero fijo, duplica ventas cada hora. Arreglo **S**.
- **Integridad referencial no validada**: un escandallo con `materia_id` inexistente no
  descuenta nada **en silencio** → stock teórico inflado y avisos de pedido/autonomía falsos. Arreglo **M**.
- **Caché en memoria no compartida**: con 2+ instancias en Render se rompe la idempotencia
  (venta de Ágora contada dos veces). Hoy asume 1 instancia sin garantizarlo. Arreglo **L** (o fijar réplicas=1).
- **Accesibilidad por teclado**: la checklist de apertura/cierre, el calendario de caja y los
  chips de alérgenos son `<div onclick>` sin `role`/`tabindex`/teclado; iconos de barra <44px táctiles. Arreglo **M**.
- **Errores de red crudos en inglés** ("Failed to fetch") en medio de recibir un pedido o
  cerrar caja; sin banner de offline. Arreglo **S**.
- **`esc()` inconsistente**: 58 `${e.message}` sin escapar frente a 25 que sí; `productos_no_reconocidos`
  del CSV sin escapar. Rompe la regla "escapar siempre". Arreglo **M**.
- **Deriva de color**: 147 hex inline conviven con los tokens; varios rojos/verdes de "marca"
  distintos. Inconsistencia visual y riesgo de contraste. Arreglo **M**.
- **Observabilidad pobre**: sin error handler global, sin `unhandledRejection`, logging mínimo
  → diagnosticar un fallo en Render en remoto es casi imposible. Arreglo **M**.
- **Runner de tests frágil**: 68 ficheros enumerados a mano con `&&`; si olvidas añadir uno no
  corre y nadie lo nota. Cambiar a `node --test tests/*.unit.js`. Arreglo **S**.
- **Reset de datos solo ANTES del e2e**, no después: `backend/data` queda sucio y se puede
  commitear sin querer. Apuntar el e2e a un `DATA_DIR` temporal. Arreglo **M**.
- **El push del temporizador sin `TTL`/`urgency`**: un "retira ahora" puede entregarse horas
  tarde si el móvil estaba sin cobertura. Arreglo **S**.

---

## ⚪ BAJOS

- **Intereses de deuda estimados como 30% fijo** de la cuota (número mágico) en el beneficio neto.
- **Notificación duplicada** del temporizador cuando la app está en primer plano (tag local ≠ tag push).
- **Endpoints públicos por id semi-predecible** (`/justificante/:id/pdf` sin sesión) y tokens de
  webhook comparados sin tiempo constante (a diferencia del conector TPV, que sí).
- **Todo el almacén en memoria sin índices por fecha**; `ventas`/`stock_movements` crecen sin
  archivado (RAM mes a mes). Relevante a 1‑2 años.
- **`GET /api/ventas` sin paginar** (devuelve el histórico completo). Hoy sin consumidor caliente.
- **`costeProducto` recursivo sin memoizar** (se recalcula por cada línea en cada escaneo).
- **Código muerto**: `labPanel()` ya no se usa (lo dejamos tras rehacer el Lab).
- **Sin linter**: ESLint (`no-undef`/`no-redeclare`) pillaría colisiones de prefijo en el fichero único.

---

## Lo que está BIEN (para no romperlo)

- Motor de dinero centralizado en `costing.js` (la mayoría deriva de ahí).
- Autenticación: PIN con scrypt + `timingSafeEqual`, JWT con expiración, bloqueo en login,
  modelo de permisos backend **default-deny** (allowlist `EQUIPO_ALLOWED`).
- Service worker con `skipWaiting`+`clients.claim` y `no-store`: **no** hay problema de "app
  vieja cacheada" tras un deploy.
- Cobertura de tests amplia (68 unit + 101 e2e) y sin TODO/FIXME pendientes.
- `periods.js` con `now` inyectable y manejo honesto de `sin_datos`/`null` (sin divisiones por cero).
- Limpieza de suscripciones push muertas (404/410) ya implementada.

---

*Auditoría generada con 8 auditores en paralelo sobre el código real; críticos y altos
verificados a mano. Siguiente paso sugerido: Bloque 1 (blindar el dinero) + Bloque 2
(verificar configuración de Render).*
