# Control M · Producción — m de materia

Business Operating System de hostelería para **m de materia** (café de especialidad
y matcha, El Palo / Pedregalejo, Málaga). App en **español**, PWA instalable, móvil primero.

## Mandato de gobierno (decidido por la fundadora, Mónica — permanente)

El asistente actúa como **CTO y Director de Producto**. Toma todas las decisiones de
producto, arquitectura e implementación siguiendo las mejores prácticas de ingeniería,
UX y negocio. Ante varias opciones, elige la mejor (la más simple que cumpla) y la
documenta en una línea (en el commit y en la respuesta). **Solo se pregunta cuando es
matemáticamente imposible continuar sin ese dato** (una credencial, un precio real no
estimable, un acceso). Todo lo asumible se asume y se sigue. Se entregan **funcionalidades
terminadas** (desarrolladas, con tests en verde y desplegadas), nunca cuestionarios.

## Reglas de negocio innegociables

- **Una sola fuente de verdad para el dinero.** Nunca duplicar cálculos de coste/precio;
  derivar de un único sitio.
- **El equipo (rol `equipo`) nunca ve coste, precio de coste ni margen.** Se filtra con
  `mbdsEsAdmin()` en front y con `req.user.rol==="admin"` en las rutas.
- **No se despliega si no pasan las validaciones** (`CI=true npm test`).

## Stack y estructura

- **Backend**: Node/Express. `backend/data-store.js` (JSON en disco o PostgreSQL vía
  `DATABASE_URL`; entidades en `ENTITIES`). Rutas en `backend/routes/`.
- **Frontend**: SPA de un solo fichero `frontend/index.html` (~8k líneas). Tema oliva
  oscuro; imagotipo = tres barras verticales (CSS mask).
- **PWA**: `manifest.webmanifest`, `sw.js` (con handler `fetch` y `push`), web-push
  (`backend/push.js`, VAPID), avisos (`backend/routes/avisos.js`).

## Ejecutar / test / deploy

- Tests: `CI=true npm test` (unit + Playwright e2e). Resetear datos con
  `git checkout HEAD -- backend/data/` antes y después. Login Playwright: `#ubtn-Moni` +
  PIN `3333` (admin) · `#ubtn-Lara` + PIN `2222` (equipo).
- Deploy: commit en la rama de trabajo → push → `git checkout main` → `git pull` →
  `git cherry-pick -x HEAD@{1}` → `git push origin main` (Render despliega al hacer push a main).
- Commits terminan con:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_018tJWqyHqc8xs4Yp5LV8Kue`
- No incluir el identificador del modelo en commits/PRs/artefactos.

## Mapa de módulos (front)

- **Burbujas** (`LIMONADAS_DATA`, `limRender`, paso a paso `pwz-`): recetas carbonatadas
  Origen/Equilibrio/Colección, escala por litros, preparaciones (super juice al vacío solo
  piel+ácidos, aguas aromáticas como concentrado + agua al rebache final).
- **Spritz** (`SPRITZ_DATA`, `spzRender`): escandallo por lata 250 ml.
- **LAB · Cocina** (`LAB_DATA`, `labRender`): Sándwiches, Tostas y Bases (elaboraciones
  compartidas: salsa verde, dukkah). Ficha técnica + perfil sensorial + escandallo +
  estado (Prueba/Aprobado/Carta/Archivado) + notas de cata + versiones + montaje guiado.
- **Cierre de caja** (`cja-`), **Punto de equilibrio**, **MBDS** (laboratorio de bebidas).
- **Temporizadores sous-vide** (`svt-`) con aviso push aunque la app esté cerrada
  (`backend/sv-timers.js`).
- **Carta** (`CARTA_ARBOL`): árbol por categorías; los productos de Burbujas/Spritz/Comida
  derivan de sus datos para no duplicar PVP.

## Convenciones de código

- Prefijos de funciones para evitar colisiones en el fichero único: `lim*`/`bur*`
  (Burbujas), `spz*` (Spritz), `lab*` (cocina), `cja*` (cierre), `svt*` (temporizador),
  `pwz-` (clases del paso a paso a pantalla completa). **Antes de un prefijo nuevo, comprobar
  que no colisiona** (ya pasó con `wiz-` y con `crono*`).
- Escapar siempre el contenido dinámico con `esc()`.
