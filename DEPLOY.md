# DEPLOY · Control M — despliegue de la remediación "reloj suizo"

**Estado:** preparado y revisable. **NO publicado.** No ejecutes §5 (push a `main`) hasta
que Mónica lo autorice y hayas completado §1–§3. Rama de trabajo:
`claude/jolly-franklin-3j3eg4` (tip `8df1b4b`). Base actual de producción: `main e686037`.

---

## 0. Qué se publica (resumen)

- Se lleva a `main` **exactamente el árbol del tip de la rama** (`8df1b4b`): toda la
  remediación (bloques 01–11 + rigor R1–R6 + correcciones C1–C9).
- **No revierte nada de `main`.** Comprobado: `git cherry HEAD origin/main` da **113
  "-" y 0 "+"** → los 113 commits de `main` ya están (patch-equivalentes) dentro de la
  rama. La rama es un **superconjunto funcional** de `main`.
- Validado en el árbol exacto de despliegue: **lint OK · 528 unitarios · 102 e2e** en verde.
- **No ejecuta ninguna migración de datos.** No toca históricos de ventas.

---

## 1. Commit exacto que se publicará (y su verificación)

El despliegue es un **merge de 2 padres** (`main` + tip de la rama) cuyo árbol es
**idéntico** al tip `8df1b4b`. Ya se ensayó en local en la rama `deploy-preview`
(commit de ejemplo `fb218a6`; el SHA real variará al rehacerlo, pero el **árbol es
determinista** y se verifica). Pruebas hechas:

```
git merge-base --is-ancestor e686037 8df1b4b   # NO: divergen (por eso es merge, no ff)
git cherry 8df1b4b origin/main | grep -c '^+'    # 0  → la rama contiene todo lo de main
git diff --quiet <merge> 8df1b4b && echo IGUAL   # IGUAL → árbol publicado == tip rama
```

> Por qué merge y no `reset`/`push --force`: `main` tiene 113 commits que la rama no
> tiene como SHA (son cherry-picks); un reset los borraría del historial. El merge los
> **conserva** y publica el árbol correcto.

---

## 2. Inspección de la configuración REAL de producción (NO presuponer nada)

> No se presupone que falte PostgreSQL ni JWT_SECRET: su estado es **desconocido desde
> aquí** (sin acceso a Render). Primero inspecciona; no sustituyas la base existente.
> Desde este entorno la app de Render es inalcanzable (proxy 403), así que estos pasos
> los haces tú en el panel. **No pegues secretos en el chat.**

En **Render → tu servicio (Control M) → pestaña _Environment_**, anota si EXISTEN (no su valor):
- `DATABASE_URL` → ¿hay PostgreSQL? (si existe, **se conserva**; no crear otra encima).
- `JWT_SECRET` → ¿definido? (si no, las sesiones se reinician en cada despliegue).
- `REQUIRE_DB` → ¿fuerza exigir BD?
- `CORS_ORIGINS`, `RENDER_EXTERNAL_URL` → orígenes permitidos.
- VAPID (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`) y `AVISOS_TOKEN` → avisos push.
- `RESEND_*` → entrada de ventas por email.

Y con el servicio en marcha, abre en el navegador (sin secretos, solo lectura):
- `…/api/salud` → dice `almacen` (`postgres`/`json`), `persistencia`
  (`persistente`/`efimera`), `modo_datos` (`real`/`aislado`) y `version`.
- **Instancias:** Render → _Settings → Scaling_ → nº de instancias. Si es **> 1**,
  está activa la condición de `agora.6` (idempotencia multi-réplica): anótalo, no
  bloquea el despliegue pero conviene saberlo.
- **Conector Ágora:** en la app (admin) → el aviso/estado del conector TPV, o
  `…/api/ventas/agora-estado`.

**Decisión:** si NO hay PostgreSQL y se decide introducirlo, hazlo **después** del
backup (§3) y **preservando** los datos actuales; nunca conectar una base vacía sobre
la instalación existente.

---

## 3. Backup REAL recuperable + preparación de la reversión (antes de desplegar)

**Backup (según el modo real visto en §2):**
- Si **PostgreSQL**: `pg_dump "<DATABASE_URL>" > control-m-$(fecha).sql` a un destino
  **persistente fuera del contenedor** (tu equipo / almacenamiento externo).
- Si **JSON en disco**: `BACKUP_DIR=/ruta/persistente node scripts/backup.js`
  (lee el modo real; crea un snapshot con recuentos e importes).

**Verifica que el backup se restaura** en un entorno **AISLADO** (no toca prod):
```
CONTROL_M_DATA_DIR=/tmp/verif DATABASE_URL="" node scripts/restore.js <snapshot> 
```
Debe decir `✓ cuadra con el snapshot original` y recuentos correctos. (Mecanismo ya
probado en local: backup 110 filas → restore aislado 110 filas, cuadra.) **Sin backup
restaurable verificado, no se continúa.**

**Reversión del CÓDIGO (prepárala ANTES):** el punto de retorno es `main e686037`.
- Reversión limpia tras el merge: `git revert -m 1 <sha-del-merge> && git push origin main`
  (Render redespliega la versión anterior).
- Alternativa (si procede y nadie más ha empujado): `git reset --hard e686037 && git push --force-with-lease origin main`.
- **No hay reversión de datos** que gestionar: esta entrega no migra datos. Si en el
  futuro la hubiera, el backup de este paso es la red.

---

## 4. Si te falta acceso para un paso (instrucciones de panel)

- **Inalcanzable desde este entorno:** la app de Render responde 403 por la política de
  red del entorno de trabajo. Todo lo de producción se hace desde el panel de Render
  con tu cuenta.
- **Variables de entorno:** Render → servicio → _Environment_ → _Add/Edit_. Tras
  guardar, Render redespliega. **No compartas los valores por chat.**
- **Escalado / instancias:** Render → _Settings → Scaling_.
- **Logs / healthcheck:** Render → _Logs_; configura el health check a `/api/listo`.

---

## 5. Despliegue (ejecutar SOLO con autorización, en este orden)

```
# GATE de seguridad: confirmar que la rama SIGUE conteniendo todo lo de main
git fetch origin
git checkout claude/jolly-franklin-3j3eg4
test "$(git cherry HEAD origin/main | grep -c '^+')" = "0" \
  && echo "OK: la rama es superconjunto de main" \
  || { echo "STOP: main tiene commits que la rama NO tiene; reconciliar antes de seguir"; }

# Validar el árbol que se publicará
CI=true npm test            # lint + unit + e2e, todo en verde

# Merge que conserva el historial de main y publica el árbol de la rama
git checkout main
git pull --ff-only origin main
git merge --no-ff claude/jolly-franklin-3j3eg4 -m "Deploy reloj-suizo: remediación 01-11 + rigor + C1-C9"
git checkout claude/jolly-franklin-3j3eg4 -- .   # resolver conflictos al árbol de la rama
git add -A
git diff --cached --quiet claude/jolly-franklin-3j3eg4 && echo "árbol de despliegue == tip rama ✓" || echo "STOP: revisar"
git commit --no-edit
git diff --quiet HEAD claude/jolly-franklin-3j3eg4 && echo "verificado ✓"

# (opcional pero recomendado) re-validar el árbol ya fusionado
CI=true npm test

# Publicar → Render despliega al recibir el push a main
git push origin main
```

> Si el GATE imprime STOP, **no despliegues**: significa que `main` ganó trabajo que la
> rama no tiene y resolver "al árbol de la rama" lo borraría. Reconciliar primero.

---

## 6. Comprobación POSTERIOR al despliegue

Hay un script de **solo lectura** (no escribe en prod). Pásale secretos por entorno,
nunca por chat:

```
BASE_URL=https://<tu-app>.onrender.com \
ADMIN_USER=Moni ADMIN_PIN=**** EQUIPO_USER=Lara EQUIPO_PIN=**** \
EXPECTED_VERSION=<sha corto que acabas de desplegar> \
node scripts/post-deploy-check.js
```

Comprueba automáticamente:
1. **Versión efectiva** (`/api/salud`.version == la desplegada; si no, el deploy no tomó).
2. **Readiness** (`/api/listo` listo=true, db_ok).
3. **Permisos admin/equipo** (regla 2): el equipo NO ve `coste*`/`margen*`/`precio_compra`…
   en `/api/financiero`, `/api/carta`, `/api/inicio` (o recibe 403).
4. **Sincronización** con Ágora (última sync + estado del conector).
5. **Temporizadores** sous-vide (el endpoint responde).
6. **Consistencia financiera** (ventas del día coherentes entre inicio y financiero;
   si no las extrae solo, pide revisarlas a mano) + portada CEO responde.

**A mano (no se scriptea para no escribir en prod):**
7. **Guardado durable:** crea una nota/cambio pequeño, **reinicia** el servicio en
   Render y confirma que PERSISTE. En `postgres` debe sobrevivir; en `efimera` NO
   (señal de que falta `DATABASE_URL`). Revisa que `persistenceInfo.divergencias` esté vacío.

Salud/readiness por sí solos **no** validan la app: lo válido es 1–7 completos.

---

## 7. Lo que este despliegue NO resuelve (independiente, lo avisa el informe)

"0 abiertos" en la matriz **no** significa "todo resuelto". Quedan, por separado:
- **Cuadre 1055 (Control M) vs 1035 (Ágora):** necesita tu export real del día. Se
  explica documento a documento; **no se alteran históricos** para forzar el cuadre.
- **Descuento GLOBAL de documento de Ágora (resto de agora.5):** necesita una muestra
  real con ese campo para repartirlo por línea. Hoy se SEÑALA, no se inventa.
- **Revisión visual de colores (frontend.7):** unificar los ~476 hex requiere revisión
  visual por tema (claro/oscuro); no se hace a ciegas.
- **Decisiones de escalado** (rendimiento.3, agora.6): dependen de volumen/instancias.

Detalle y estado por hallazgo: **CONTROL-CORRECCIONES.md**. Procedimiento y pendientes
externos: **INFORME-CIERRE-CONTROL-M.md**.
