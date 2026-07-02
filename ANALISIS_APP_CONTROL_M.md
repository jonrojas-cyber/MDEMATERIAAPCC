# Control M · Producción — Documento completo para análisis externo

> **Objetivo de este documento:** describir de forma exhaustiva **qué es y qué hace**
> la aplicación, su arquitectura, su modelo de datos, su API, sus pantallas, su
> sistema de diseño y su estado actual, para que un analista externo (p. ej. ChatGPT)
> pueda proponer mejoras concretas de producto, UX, arquitectura y negocio.
>
> Al final hay una sección **"Preguntas para el analista"** con lo que más nos interesa.

---

## 1. Resumen ejecutivo

**Control M · Producción** es el sistema operativo de una cafetería de especialidad
—**"m de materia"** (Málaga)—. Es una app web pensada para dos perfiles:

- **Trabajador (modo operación):** rutina de apertura/cierre, producción del día,
  temperaturas APPCC, recepción de albaranes, inventario, mermas.
- **Propietario (modo control):** panel de "dónde está mi dinero", márgenes,
  mermas, descuadres, inteligencia de negocio.

**Norte del producto:** *"máxima rentabilidad con mínimo esfuerzo cognitivo"*.
Objetivo comercial: convertirlo en un producto **vendible a otros locales** de
hostelería, de forma que al usarlo digan *"cómo he podido sobrevivir sin esto"*.

**Contexto de usuarios reales:** 2 administradores (Jon y Mónica) y 1 trabajadora (Lara).

---

## 2. Arquitectura técnica

### Stack
- **Backend:** Node.js + Express. Sin framework de frontend.
- **Frontend:** un **único fichero** `frontend/index.html` (~5.000 líneas) con
  HTML + CSS (`<style>`) + JS (`<script>`) embebidos. SPA artesanal, sin build.
- **Persistencia dual:**
  - Por defecto: ficheros **JSON** en `backend/data/*.json` (una "tabla" por fichero).
  - Producción: **PostgreSQL** si existe `DATABASE_URL` (misma API, misma lógica).
  - Capa de abstracción única: `backend/data-store.js` (CRUD por fila, `flush()`, `transaction()`).
- **Despliegue:** Render (deploy hook al hacer push a `main`).
- **Integración TPV:** conector local (Node sin dependencias) que empuja las ventas
  del TPV **Ágora** al endpoint `/agora/ingest` con un token (`X-Connector-Token`).

### Estructura de carpetas
```
backend/
  server.js            # arranque Express + montaje de rutas
  data-store.js        # capa de datos (JSON o PostgreSQL)
  db.js                # driver PostgreSQL
  routes/*.js          # 26 routers (uno por dominio)
  <módulos de dominio>.js   # lógica reutilizable (ver §4)
  data/*.json          # datos semilla / persistencia efímera
frontend/
  index.html           # toda la app cliente
tests/
  *.unit.js            # 6 suites unitarias (node assert)
  e2e.spec.js          # 26 tests Playwright end-to-end
```

### Principios de diseño de código
- **Fuente única de la verdad para el dinero:** `backend/costing.js`. Todo cálculo
  de coste, margen, food cost, valor de stock y valor de producción sale de ahí.
  Lo consumen `carta.js`, `inicio.js`, `decisiones.js`, `analitica.js`, `insights.js`.
- **Clasificación de materias centralizada:** `backend/clasificador.js` (taxonomía,
  macros, reglas por expresión regular sobre el nombre).
- **Umbrales de stock centralizados:** `backend/umbral.js` (punto de pedido,
  estado de stock, cantidad sugerida).
- **Sin duplicar funciones:** política explícita de no repetir lógica entre pantallas.

---

## 3. Modelo de datos (27 entidades)

Cada entidad es un fichero JSON (o tabla PostgreSQL). Listado y propósito:

| Entidad | Propósito |
|---|---|
| `materias` | Materia prima e inventario (stock, coste medio, ubicación, mín/ideal, unidad, vida útil). |
| `productos` | Carta: recetas de venta con ingredientes (escandallo), PVP, margen objetivo, alérgenos, versión, vida útil, foto. |
| `recetas` | Recetas de **producción interna** (elaboraciones que reponen materias). Campo `produce_materia_id`. |
| `lotes` | Lotes producidos con trazabilidad, caducidad, cantidad restante, estado. |
| `preparaciones` | Órdenes de producción (en curso / finalizada). |
| `revisiones` | Registros APPCC: temperaturas de 5 neveras/congeladores + limpieza, con estado y acción correctiva. |
| `ajustes` | Mermas con taxonomía de motivo (caducidad, error de preparación, rotura, sobreproducción, devolución, prueba I+D). |
| `inventarios` | Recuentos físicos vs teórico (descuadre de almacén, merma oculta). |
| `proveedores` | Proveedores. |
| `compras_productos` | Productos de compra por proveedor (precio con/sin IVA, unidad de compra, conversión a unidad de consumo). |
| `precios_historico` | Histórico de cambios de precio pactado (con motivo, responsable, documento). |
| `recepciones` | Entradas de mercancía (albarán escaneado por OCR, cotejo, estados). |
| `pedidos` | Pedidos a proveedores (crear, enviar, recibir). |
| `pagos` / `justificantes` | Pagos a proveedores y justificantes (email). |
| `etiquetas` / `impresiones` | Etiquetas de lote (QR de trazabilidad), historial de impresión. |
| `ventas` | Ventas importadas de Ágora (producto, cantidad, importe, fecha, doc). |
| `docs_agora` | Documentos de Ágora procesados/bloqueados (idempotencia por GlobalId/Serie+Número). |
| `sincronizaciones` | Registro de sincronizaciones del conector. |
| `stock_movements` | **Libro de movimientos de stock** (el stock no cambia sin dejar movimiento). |
| `consumos` | Consumo diario por materia (para punto de pedido). |
| `recetario_cafe` | Recetas de calibración de café por tipo (dosis, molienda, tiempo). Ej.: Colombia 32s, Brasil 28s. |
| `apertura` | Checklist de apertura y cierre por día. |
| `revisiones` | (ver arriba) |
| `usuarios` | Cuentas con PIN **hasheado**. Roles: `admin` / equipo. |
| `auditoria` | Registro de acciones críticas (quién, qué, cuándo). |
| `config` | Configuración del local (nombre, dirección, responsable APPCC, VAPID keys…). |
| `push_subs` | Suscripciones a notificaciones push (web push / VAPID). |

**Regla de oro del stock:** ninguna variación de `disponibilidad_actual` ocurre sin
un registro en `stock_movements` (venta, recepción, merma, inventario, producción).

---

## 4. Módulos de dominio (backend)

| Módulo | Responsabilidad |
|---|---|
| `costing.js` | **Motor único de dinero:** coste de escandallo/receta, coste por unidad, margen de producto, margen medio de carta, food cost, valor de stock, valor de producción, coste de mermas, tamaños de lote. |
| `clasificador.js` | Taxonomía de materias (macros + subcategorías) y reglas de clasificación por nombre. |
| `umbral.js` | Punto de pedido, estado de stock (crítico / por pedir / correcto), cantidad sugerida. |
| `unidades.js` | Conversión de unidades (masa/volumen/conteo métricos) + factor de unidad de compra→consumo. Detecta la unidad del albarán y convierte. |
| `compras.js` | Sugerencias de compra **agrupadas por proveedor** (no por producto). |
| `prevision.js` | **Motor de previsión de demanda por día de la semana** (aprende de las ventas; más semanas = más datos). Cruza demanda estimada con stock actual y recomienda qué producir. |
| `decisiones.js` | **Centro de decisiones ("Tareas"):** acciones, riesgos y oportunidades del momento + KPIs inmediatos. Los pedidos NO entran como tareas (van al aviso diario de las 16:00). |
| `analitica.js` | **Panel del propietario:** KPIs, valor de almacén por categoría, mermas por día/motivo/producto, top productos por venta/beneficio, compras por proveedor, balance producido/vendido/tirado, descuadre de inventario. |
| `insights.js` | **Inteligencia del negocio:** frases accionables solo si hay señal real (merma concentrada, merma al alza, subida de precio de proveedor, merma oculta, producto de bajo margen). |
| `agora.js` | Ingesta de ventas de Ágora (estructura Invoice→InvoiceItems→Lines), descuento de stock por escandallo, idempotencia. |
| `auditoria.js` | Registro de acciones críticas. |
| `avisos.js` / `push.js` | Notificaciones (web push / VAPID) — pedidos y caducidades. |
| `mailer.js` | Envío de emails (justificantes de pago). |
| `ocr.js` | OCR de albaranes (escaneo y enderezado de imagen). |
| `pdf.js` | Generación de PDF (archivo trimestral de albaranes para gestoría). |
| `label-service.js` | Servicio de etiquetas de lote (QR). |
| `consumo.js` | Cálculo de consumo diario por materia. |
| `autonomia.js` | (lógica de automatización/autonomía del sistema). |
| `auth.js` | Login por PIN hasheado, cambio de PIN, bloqueo por intentos, roles. |

---

## 5. API HTTP (endpoints)

> Todos bajo `/api`. Autenticación por token (JWT) salvo `/salud` y `/auth/login`.
> Rutas de solo-admin marcadas donde aplica (p. ej. edición de carta, analítica).

**Salud / Auth**
```
GET  /salud
POST /auth/login          POST /auth/cambiar-pin       GET /auth/me
```
**Inicio / Decisiones / Previsión / Analítica**
```
GET /inicio               GET /decisiones              GET /prevision
GET /analitica            (admin · incluye insights)
```
**Carta / Recetas**
```
GET /carta                GET /carta/alergenos         GET /carta/:id
POST /carta               PUT /carta/:id               DELETE /carta/:id   (admin)
GET /recetas              GET /recetas/:id
```
**Materia / Almacén / Inventario**
```
GET /materias/arbol       GET /materias                GET /materias/:id
POST /materias            PATCH /materias/:id
GET /inventario           POST /inventario/conteo      GET /inventario/:id
```
**Producción / Lotes / Etiquetas**
```
GET /preparaciones        POST /preparaciones/calcular POST /preparaciones
POST /preparaciones/:id/confirmar-paso   POST /preparaciones/:id/finalizar
GET /lotes  GET /lotes/:id  PATCH /lotes/:id
POST /lotes/:id/consumo   POST /lotes/:id/dar-de-baja
GET /etiquetas  GET /etiquetas/historial  GET /etiquetas/lote/:loteId
POST /etiquetas/:id/reimprimir
```
**APPCC (temperaturas/limpieza) + export inspección**
```
GET /revisiones/tipos     GET /revisiones              POST /revisiones/registrar
GET /revisiones/registro  (documento para Sanidad)     POST /revisiones/:id/resolver
```
**Compras / Proveedores / Recepción / Pedidos / Pagos**
```
GET /proveedores  GET /proveedores/meta  GET/POST/PUT /proveedores[/:id]
GET /compras-productos[...]  POST/PUT/DELETE  GET /compras-productos/:id/historico
GET /recepciones  POST /recepciones/escanear  POST /recepciones/cotejar
POST /recepciones  POST /recepciones/:id/estado  POST /recepciones/:id/confirmar
GET /recepciones/ocr-estado  GET /recepciones/trimestres  GET /recepciones/trimestre/:year/:q/pdf
GET /pedidos  GET /pedidos/sugerencias  POST /pedidos  POST /pedidos/:id/enviado
GET /pagos  GET /pagos/justificantes[/:id]  POST /pagos/justificantes/:id/email
POST /pagos/:proveedorId/marcar-pagado
```
**Mermas / Calendario / Apertura / Recetario café / Avisos / Ventas / Auditoría**
```
GET /ajustes/motivos  GET /ajustes  POST /ajustes
GET /calendario
GET /apertura  POST /apertura/toggle       (rutina=apertura|cierre)
GET/POST/PUT/DELETE /recetario-cafe[/:id]
GET/PUT /avisos  POST /avisos/suscribir|desuscribir|probar
POST /ventas/importar  POST /ventas/agora-import  GET /ventas
GET /ventas/sincronizacion  GET /ventas/agora-estado
GET /auditoria
GET /reportes/semana  GET /reportes/stock
```

---

## 6. Pantallas y flujos (frontend)

### Rutina de apertura (lo primero al entrar)
Al meter el PIN, la app saluda según la hora (*Buenos días/Buenas tardes/Buenas noches*),
por nombre, con **"Bienvenido a materia"** y una **frase motivacional diaria** que resalta
una cualidad de esa persona. Luego una **lista ordenada de tareas de arranque**:
1. Encender luces
2. Café para despertar
3. **Calibrar cafés** (recetario: Colombia 32s dcha, Brasil 28s izq)
4. **Temperaturas de neveras (APPCC)** — 5 equipos: Nevera sistema on tap, Nevera cocina,
   Congelador cocina, Nevera almacén, Congelador almacén
5. Controlar fechas de caducidad
6. Sacar carros de herramientas
7. Producción necesaria del día
8. Limpieza (suelo, mesas, herramienta)
9. Montar terraza
10. Playlist
11. **8:00 · Abrir puertas** — *"¡que empiece la función!"*

Existe también la **rutina de cierre** (aparece por la tarde).
Al profundizar en una tarea de apertura, "volver" regresa a **la lista de apertura**,
no a donde vive la tarea.

### Dashboard (home) — 4 bloques 2×2 sin scroll
`ALERTAS` (Tareas) · `PRODUCCIÓN` · `MATERIA` (submenú) · `APPCC` (hub).
Botones cuadrados como la portada. Para admin: acceso a **"Panel del propietario ·
dónde está mi dinero"** e **"Informes y configuración"**.

### Pantallas (funciones `irA_*`)
```
Tareas/decisiones · Preparaciones (producción) · Carta y márgenes ·
Almacén (macro→sub→ficha) · Inventario físico · Recepción · Proveedores ·
Productos por proveedor · Precio pactado · Pedidos · Pagos · Lotes ·
Etiquetas · Temperaturas APPCC · Registro APPCC para Sanidad · Ajustes/mermas ·
Calendario anual · Recetario de café · Previsión de demanda · Panel del propietario ·
Análisis · Ventas/Ágora · Archivo de albaranes · Avisos · Auditoría · Manual ·
Resumen del día · Apertura · Cierre
```

### Aviso diario de compras (16:00)
Los pedidos **no** salen en Tareas. Cada día a las 16:00 se genera una alerta que
dice qué falta o de qué vamos justos, **clasificada por proveedor** (no por producto).

---

## 7. Sistema de diseño

- **Monocromo por decisión de producto.** Todos los colores de tinta
  (`--ink/--olive/--warn/--ok/--alert/--gold`) son el mismo: `#2A332B`.
  Fondos: `--cream #ECEAE3`, `--paper #F1EFE9`. Texto atenuado `--muted #82857A`.
  Líneas `--line #B4AE9B`.
- **La severidad NO se comunica por color/tono**, sino por **peso tipográfico,
  posición y jerarquía**. Excepción única: un rojo (`#b5462a`) para alertas de
  seguridad alimentaria (caducado/no apto).
- **Tipografía:** `'Courier New', monospace` — estética "sistema rtd 01".
- **Submenús:** rejilla cuadrada que **llena la pantalla sin scroll**, botones
  cuadrados como la portada.
- Transiciones de pantalla tipo push (translateX), overlays de ficha `position: fixed`.

---

## 8. Integraciones

- **Ágora (TPV):** conector local Node → `/agora/ingest` (token). Estructura real de
  factura anidada Invoice→InvoiceItems→Lines. Al vender, descuenta stock por escandallo.
  Idempotente por documento. El emparejamiento producto Ágora ↔ Control M es por **nombre exacto**.
- **PostgreSQL:** vía `DATABASE_URL`; misma API que JSON.
- **Web Push (VAPID):** avisos de pedidos y caducidades.
- **Email:** justificantes de pago.
- **OCR:** escaneo y enderezado de albaranes; detección de unidad y conversión.
- **PDF:** archivo trimestral de albaranes para la gestoría; export APPCC imprimible.

---

## 9. Inteligencia y automatización

- **Previsión por día de la semana:** aprende la demanda media de cada día a partir
  del histórico de ventas; cuantas más semanas, más fiable. Cruza demanda estimada
  con stock actual → **recomienda qué producir** para llegar a la venta estimada.
- **Centro de decisiones:** prioriza acciones (crítico/importante/info), riesgos y
  oportunidades (sobrestock, caducidad próxima → promoción).
- **Insights ("Lo que deberías saber"):** solo hablan si hay señal real:
  - "Estás tirando demasiado {producto}" (merma concentrada ≥35% del total).
  - "Tu merma ha subido un {X}% esta semana" (semana vs semana previa).
  - "{producto} subió un {X}%" (subida de precio de proveedor ≥5%).
  - "El último recuento reveló {X}€ de merma oculta" (descuadre de inventario).
  - "{producto} vende mucho pero deja poco margen" (<50% con volumen alto).
- **Inventario físico vs teórico:** cuenta real → ajusta stock → registra descuadre y
  **merma oculta** (lo que falta sin estar registrado como merma: robo, roturas, errores).

---

## 10. Testing

- **6 suites unitarias** (node assert): persistencia, Ágora, unidades, calendario,
  compras, previsión, insights.
- **26 tests E2E** (Playwright) contra el servidor real: login/seguridad, dashboard,
  navegación, APPCC, inventario, panel, carta, recepción, proveedores, escáner, etc.
- Los tests mutan `backend/data/*.json`; se revierten tras ejecutar.

---

## 11. Seguridad y cumplimiento

- PIN **hasheado**, bloqueo por intentos fallidos, roles admin/equipo.
- **Auditoría** de acciones críticas.
- Rutas sensibles solo-admin (edición de carta, analítica del propietario).
- Escapado (`esc()`) en los puntos de inyección del frontend; anti doble-submit.
- **APPCC:** registro de temperaturas con rangos legales y acción correctiva;
  export imprimible para inspección de Sanidad; **alérgenos** según Reglamento UE 1169/2011.

---

## 12. Estado actual y trabajo pendiente conocido

**Hecho recientemente (todo probado y desplegado):** Recetas Pro (alérgenos/versión/
vida útil/foto), export APPCC para Sanidad, inventario físico vs teórico, descuadre en
el panel del propietario, capa de insights, limpieza de un endpoint duplicado.

**Pendiente / decisiones abiertas:**
- **Multi-local (`local_id` en todas las entidades)** para vender a cadenas. Es un
  cambio estructural grande; hoy el producto está pensado para un local.
- Enriquecer el modelo de `materias` (más metadatos: familia, stock físico, etc.).
- Capturar de Ágora el **método de pago y descuentos** (los datos existen, no se guardan aún).
- Posible unificación total de `/inicio` y `/decisiones` en un único servicio de estado.

---

## 13. Preguntas para el analista (lo que más nos interesa)

1. **Producto/UX:** ¿Qué fricciones ves en los flujos (apertura, producción,
   recepción, inventario) para un trabajador con prisa en barra? ¿Qué quitarías o
   simplificarías para reducir carga cognitiva?
2. **Vendibilidad:** Si tuvieras que venderlo a otro café de especialidad, ¿qué
   3 funciones le harían decir "esto lo necesito ya" y cuáles sobran o distraen?
3. **Arquitectura:** Un frontend de ~5.000 líneas en un solo HTML sin build:
   ¿merece la pena modularizar? ¿Cuándo y cómo, sin sobre-ingeniería?
4. **Datos/inteligencia:** ¿Qué otros *insights* accionables de alto valor podríamos
   derivar de los datos que ya tenemos (ventas, mermas, precios, inventario)?
5. **Multi-local:** ¿Recomiendas abordarlo ya o esperar a un cliente de cadena
   concreto? Si sí, ¿estrategia de migración de las 27 entidades con menor riesgo?
6. **Riesgos:** ¿Qué puntos débiles ves en persistencia, seguridad, idempotencia de
   Ágora, o en el emparejamiento por nombre exacto producto Ágora↔Control M?
7. **Pricing/negocio:** modelo de precio sugerido (SaaS por local, por volumen…) y
   qué métricas deberíamos medir para demostrar el ROI al cliente.

---

*Documento generado automáticamente a partir del código fuente actual del repositorio.
Refleja el estado real de la app en el momento de exportarlo.*
