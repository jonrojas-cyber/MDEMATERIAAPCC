# Control M · Producción

Sistema operativo de producción y rentabilidad para **M de Materia** (cafetería
de especialidad, El Palo/Pedregalejo, Málaga). Filosofía: **no pensar, ejecutar**
— cada pantalla responde a una sola pregunta: *¿qué hago ahora?*

Backend Node.js/Express + frontend de una sola página (sin frameworks).
Persistencia en **PostgreSQL** (con fallback a ficheros JSON en local).

---

## Arrancar en local

```bash
cd backend
npm install
npm start
```

Levanta `http://localhost:4001`. Sin `DATABASE_URL` usa los JSON de `backend/data/`
(no se pierde nada en local). Con `DATABASE_URL` definido usa PostgreSQL.

### Variables de entorno

| Variable | Para qué |
|----------|----------|
| `PORT` | Puerto (por defecto 4001) |
| `DATABASE_URL` | Cadena de conexión PostgreSQL. Si está, persiste ahí. |
| `JWT_SECRET` | Clave de firma de los tokens. **Definir en producción.** |
| `AGORA_CSV_PATH` | Ruta a un CSV de ventas de Ágora para el cron horario (opcional). |
| `ANTHROPIC_API_KEY` | Activa el OCR de albaranes (lectura de la foto con IA). Sin ella, se adjunta la foto y se rellena a mano. |
| `OCR_MODEL` | Modelo de visión para el OCR (por defecto `claude-opus-4-8`). |
| `RESEND_API_KEY` | Activa el envío automático del justificante por email (servicio Resend). |
| `RESEND_FROM` | Remitente del email (ej. `M de Materia <pagos@tudominio.com>`). |
| `REQUIRE_DB` | Si vale `1` y `NODE_ENV=production`, el servidor **no arranca sin `DATABASE_URL`** (evita perder datos en disco efímero por error). |

> Sin `DATABASE_URL` los datos viven en ficheros JSON sobre disco efímero
> (en Render se pierden al reiniciar). El arranque avisa por consola, la API
> `GET /api/salud` devuelve `"persistencia": "efimera"` y el inicio muestra un
> aviso. Para producción, define `DATABASE_URL`.

## Tests E2E

```bash
npm install              # dependencias de test (Playwright) en la raíz
npm install --prefix backend
npx playwright install chromium
npm test                 # arranca el servidor y corre los specs de ./tests
```

Se ejecutan también en cada push/PR mediante GitHub Actions (`.github/workflows/ci.yml`).

## Usuarios y acceso

Autenticación **JWT** (12 h). Los PIN viven en el backend (`auth.js`), no en el
frontend.

| Usuario | PIN | Rol | Ve |
|---------|-----|-----|----|
| Jon | 1111 | admin | Todo |
| Mónica | 3333 | admin | Todo |
| Lara | 2222 | equipo | Solo operativa (preparaciones, lotes, revisiones, ajustes) |

## Módulos

1. **Inicio** — estado del servicio, KPIs (producción, mermas, valor stock,
   margen de carta), recomendaciones de preparación (JIT), pedidos, revisiones,
   lotes a vigilar y sincronización con Ágora.
2. **Preparaciones** — asistente paso a paso, cálculo de ingredientes, cierre
   que descuenta materias y crea el lote.
3. **Lotes** — control, baja por caducidad, **impresión de etiqueta** (Phomemo).
4. **Materias** — stock, coste medio, mínimos.
5. **Revisiones** — registros del día y acciones correctivas.
6. **Ajustes** — mermas con coste estimado.
7. **Proveedores** · **Recepción** · **Pagos** — compras y pagos por proveedor.
8. **Carta y márgenes** — escandallos: coste, margen y rentabilidad por producto.
9. **Análisis** — reportes de día/semana/stock con gráficos en CSS puro.
10. **Manual** — la forma de hacer las cosas.

## API REST

Todo bajo `/api`. Requiere `Authorization: Bearer <token>` salvo `/api/salud`,
`/api/auth/*` y la página pública de etiqueta.

```
POST /api/auth/login           { usuario, pin } -> { token, usuario }
GET  /api/auth/me

GET  /api/inicio               dashboard (KPIs, JIT, Ágora)
GET  /api/materias             /:id, PATCH /:id
GET  /api/recetas              /:id
GET  /api/lotes                /:id, PATCH /:id
POST /api/lotes/:id/consumo    registra consumo real (JIT)
POST /api/lotes/:id/dar-de-baja
GET  /api/preparaciones        POST /calcular, POST /, /:id/confirmar-paso, /:id/finalizar
GET  /api/revisiones           /tipos, POST /registrar, /:id/resolver
GET  /api/ajustes              /motivos, POST /
GET  /api/proveedores          /:id
GET  /api/recepciones          POST /, /:id/confirmar
GET  /api/pagos                POST /:proveedorId/marcar-pagado
GET  /api/etiquetas            /lote/:loteId, /historial, POST /:id/reimprimir
GET  /api/carta                /:id   (escandallos, coste, margen, rentabilidad)
GET  /api/reportes/dia?fecha=  /semana, /stock
POST /api/ventas/importar      CSV de Ágora (descuenta stock)
GET  /api/ventas               /sincronizacion

GET  /etiqueta/lote/:loteId    página imprimible 62x40mm (pública)
GET  /api/salud                (pública)
```

## Producción JIT (just-in-time)

Cada uso de un lote se registra como **consumo** con timestamp. Con eso se calcula
la **velocidad de consumo** por receta (unidades/hora, últimos 7 días) y se
recomienda preparar cuando *horas de stock < vida útil × 0.5*. El dashboard
muestra: *"Aguacate M — quedan 4.2 horas de stock al ritmo actual"*. Sin
histórico suficiente cae al umbral fijo del 40 %.

## Etiquetas Phomemo D520BT

Etiquetas térmicas de **62 × 40 mm** con QR. Desde **Lotes → Imprimir etiqueta**.
Guía de emparejado y configuración: [`docs/PHOMEMO-D520BT.md`](docs/PHOMEMO-D520BT.md).

## Integración con Ágora (TPV)

Ágora no expone API REST pública en tiempo real; exporta CSV/Excel. Se importa su
CSV de ventas (`POST /api/ventas/importar`), que **descuenta el stock de materias
automáticamente** según el escandallo. Un **cron horario** importa `AGORA_CSV_PATH`
si está configurado. El dashboard muestra la última sincronización.

## Persistencia (PostgreSQL)

`db.js` crea una tabla JSONB por entidad (materias, recetas, lotes, preparaciones,
revisiones, ajustes, proveedores, recepciones, etiquetas, productos, ventas,
impresiones, consumos, sincronizaciones). Al arrancar contra una base vacía,
siembra desde los JSON. La API no cambia: las rutas siguen usando objetos JS.

## Despliegue en Railway

El repo está listo (`railway.json`, `nixpacks.toml`). Pasos:

1. En Railway: **New Project → Deploy from GitHub repo** → este repositorio.
2. **Add → Database → PostgreSQL** (Railway inyecta `DATABASE_URL` solo).
3. En el servicio, variables: `JWT_SECRET` (una cadena larga aleatoria).
4. Deploy. La URL pública la da Railway en **Settings → Networking**.

## Pendiente de confirmar por M

Los escandallos de la carta usan **cantidades y costes estimados** (marcados
`estimado` en la app) para *short rib, berenjena, labneh, miso, tahini* y los
gramajes de cada producto. Al pasar los valores reales, los márgenes serán
exactos.
