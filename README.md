# Control M · Producción

Base de la app de producción de M de Materia. Esta primera entrega cubre la
estructura completa de datos y backend, y un frontend funcional para el
módulo **1. Inicio**. El resto de módulos (Preparaciones, Lotes, Materias,
Revisiones, Ajustes, Proveedores, Recepción, Manual) están visibles en la
navegación como "Próximamente" y se incorporan en pasos sucesivos, previa
revisión conjunta.

No hay conexión con Ágora, con el sistema de grifos ni con OCR de albaranes
todavía — son fases posteriores, según lo acordado.

---

## Estructura

```
control-m-produccion/
├── backend/
│   ├── server.js          → servidor Express, expone /api/* y sirve el frontend
│   ├── data-store.js       → lectura/escritura sobre los ficheros JSON (mock DB)
│   ├── routes/
│   │   ├── inicio.js        → agrega estado del servicio, recomendaciones, próximos pasos
│   │   ├── materias.js
│   │   ├── recetas.js
│   │   ├── lotes.js
│   │   ├── preparaciones.js → cálculo de ingredientes, inicio y cierre de preparación
│   │   ├── revisiones.js
│   │   ├── ajustes.js
│   │   ├── proveedores.js
│   │   └── recepciones.js
│   ├── data/                → datos mock en JSON (se actualizan al usar la app)
│   └── package.json
└── frontend/
    └── index.html          → app de una sola página (sin frameworks)
```

## Cómo arrancarla

```bash
cd control-m-produccion/backend
npm install
npm start
```

Esto levanta el servidor en `http://localhost:4001` y sirve el frontend
directamente — no hace falta nada adicional. Abre esa URL en el navegador.

## Qué funciona ya

### Inicio
Lee `/api/inicio`, que calcula en tiempo real:
- **Estado del servicio**: una lectura general según haya revisiones
  pendientes, lotes que requieren atención o disponibilidad baja en varias
  materias a la vez.
- **Preparaciones recomendadas**: cuando lo que queda vigente de una receta
  cae por debajo del 40% de su resultado base.
- **Disponibilidad baja**: materias en o por debajo de su stock mínimo.
- **Lotes que requieren atención**: por estado manual o por caducar en
  menos de 6 horas.
- **Revisiones pendientes**: las del día que no están en estado "Correcto".
- **Próximos pasos**: lista priorizada, redactada en el tono de M (sin
  lenguaje de alarma).

### Preparaciones (backend listo, pendiente de pantalla)
Ya puedes probarlo por API:

```bash
# Calcula ingredientes para una cantidad objetivo, sin crear nada
curl -X POST http://localhost:4001/api/preparaciones/calcular \
  -H "Content-Type: application/json" \
  -d '{"receta_id":"rec-001","cantidad_objetivo":1500}'

# Inicia la preparación (queda "En curso")
curl -X POST http://localhost:4001/api/preparaciones \
  -H "Content-Type: application/json" \
  -d '{"receta_id":"rec-001","cantidad_objetivo":1500,"responsable":"Diego"}'

# Finaliza: descuenta materias y crea el lote automáticamente
curl -X POST http://localhost:4001/api/preparaciones/<id>/finalizar
```

Al finalizar, la app:
1. Descuenta de cada materia la cantidad usada (escalada según la receta).
2. Crea un lote nuevo con código automático (ej. `AGM-190626-B`), cantidad
   inicial y restante igual a la cantidad objetivo, y caducidad calculada
   según la vida útil de la receta.
3. Marca la preparación como "Finalizada" y la vincula al lote creado.

### Resto de módulos
Backend y datos mock ya preparados (rutas `materias`, `lotes`, `revisiones`,
`ajustes`, `proveedores`, `recepciones`), pero sin pantalla todavía. Se
construyen módulo a módulo, en el orden de la navegación, cuando confirmes
que el Inicio funciona como esperas.

## Datos iniciales (mock)

- 16 materias + Agua filtrada y Café como insumos de Matcha base y Cold
  brew (no estaban en el listado original de materias pero son necesarios
  para que esas dos recetas se puedan calcular; si prefieres tratarlas de
  otra forma, lo ajustamos).
- 4 recetas: Aguacate M, Tomate trabajado M, Matcha base, Cold brew.
- 6 lotes activos, con distintos estados para poder ver el Inicio en
  todas sus variantes (Correcto, Priorizar uso, Requiere atención, Fuera
  de servicio).
- 8 proveedores de ejemplo.
- 6 revisiones del día (2 con acción correctiva pendiente, para que el
  panel de "Revisiones pendientes" no esté vacío).
- 2 ajustes de ejemplo.

Todo esto es desechable: en cuanto quieras, lo sustituimos por datos reales
o por una base de datos real (SQLite/Postgres) sin tocar la estructura de
rutas.

## Notas técnicas

- Los datos se guardan en ficheros JSON dentro de `backend/data/`. Cada
  escritura (crear preparación, finalizar, registrar revisión o ajuste)
  se persiste ahí. Es intencionadamente simple para esta fase; migrar a
  una base de datos real no debería requerir tocar el frontend.
- El frontend es HTML/CSS/JS sin dependencias, para que sea fácil de leer,
  modificar y, si hace falta, portar a React más adelante sin arrastrar
  decisiones prematuras.
- Tipografía Courier Prime, fondo crema, negro profundo, verde oliva —
  mismo lenguaje visual que el resto de Control M.

## Siguiente paso

Cuando confirmes que esta base funciona como esperas, seguimos con el
módulo 2 (Preparaciones) en pantalla, manteniendo la misma estructura.
