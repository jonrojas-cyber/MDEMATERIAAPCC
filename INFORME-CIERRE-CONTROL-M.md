# INFORME DE CIERRE · Control M (plan "reloj suizo")

**Fecha:** 2026-10-11 · **Rama:** `claude/jolly-franklin-3j3eg4` · **Base de código previa:** `main e686037`.
Ejecución del plan de corrección (PROMPT 00 + bloques 01–11) sobre los 79 hallazgos de `AUDITORIA-MILIMETRO-2026-10.md`.

> **Honestidad primero:** no tengo acceso a producción (el proxy de salida bloquea `controlm-mdemateria.onrender.com`, 403, comprobado). Por eso **nada se declara "verificado en vivo"**, y el despliegue a producción **queda pendiente de tu autorización** (ver §5). Todo lo de abajo está **probado en local** (lint + unitarios + 102 e2e en verde) y **subido a la rama**, no desplegado.

## 1. Estado de los 79 hallazgos (detalle en CONTROL-CORRECCIONES.md)

| Estado | Nº | Qué significa |
|---|---|---|
| corregido + probado | 42 | Arreglado, con test, suite en verde en local |
| parcial + probado | 4 | Mejora entregada con test; queda una parte mayor |
| parcial | 6 | Mitigado; pendiente de completar |
| diferido | 2 | Decisión consciente de NO hacerlo ahora (riesgo de hacerlo a medias) |
| no confirmado | 2 | Necesita una muestra real de Ágora / producción |
| abierto | 23 | Sobre todo rendimiento y UX de severidad media/baja, documentados |

## 2. Qué se ha arreglado, por bloque (commits)

| Bloque | Commit | Entregado |
|---|---|---|
| 00 | `bb68a68` | Matriz de control de los 79 hallazgos |
| 01 | `9a6784e` | Datos de test aislados (los fixtures ya no se tocan), backup/restore verificado, arranque que no cae en silencio a disco efímero, `npm ci` en CI |
| 02 | `389dfcf` | Cabeceras+CSP, CORS cerrado, freno de fuerza bruta (login+fichaje), tokens en tiempo constante, 58 sinks de error escapados |
| 03 | `065676a` | IDs únicos, escritura atómica, JSON corrupto no se traga, `flush` propaga fallos, cierre ordenado SIGTERM, 404/errores JSON, readiness |
| 04 | `02d0101` | La "limpieza de duplicados" ya **no borra ventas reales** (regla 1:1); cron de CSV idempotente |
| 05 | `4086f53` | **Una sola convención de IVA** (neto/neto); coste y margen € por producto cuadran con el P&L (los %, invariantes, no cambian); fijos pueden netear el IVA deducible sin migración ciega |
| 06 | `0d02b1f` | Fronteras de fecha en **hora de Málaga** (DST nativo); comparativos sin desbordar; integridad referencial de stock |
| 07 | `593ee6e` | Temporizador sous-vide: el "retira" **ya no se pierde** si el server duerme (aviso atrasado); push urgente con TTL corto |
| 08 | `2314e59` | Memoización correcta del coste; arnés de medición local |
| 09 | `2607c60` | Botones legibles (contraste), errores de red en español, Service Worker con app-shell offline (sin cachear /api), foco de teclado |
| 10 | `42288d9` | Lint sin dependencias (sintaxis + funciones duplicadas), runner blindado, test de la regla nº2 sobre todas las rutas de dinero |
| 11 | (este) | Cuadre de solo lectura Ágora⇄Control M + este informe |

## 3. Decisiones conscientes (lo que NO se ha tocado, a propósito)

- **Token en localStorage → cookies httpOnly (seguridad.9):** NO migrado. Hacerlo a medias (sin CSRF, flags y compatibilidad PWA/conector) es peor que no hacerlo. Diferido.
- **Dedupe por contenido en Ágora (agora.1/importarVentas):** NO se añade. Colapsar ventas por firma borra ventas reales idénticas (el bug que arregla el Bloque 04). La conciliación lo SEÑALA y se resuelve con evidencia documental.
- **Netear los costes fijos a ciegas (dinero.1):** NO. El motor ya SABE netear el IVA deducible, pero por defecto no cambia ningún número hasta que clasifiques cada coste como "con IVA / sin IVA" — así no reinterpreto datos que no puedo verificar.
- **Cambios de rendimiento arquitectónicos (rendimiento.1-4,6-8):** NO a ciegas. Requieren medir en el hosting real (no invento benchmarks). Queda el arnés `scripts/bench.js` y la lista en CONTROL-CORRECCIONES.md.

## 4. El descuadre 1055 (Control M) vs 1035 (Ágora) — cómo cerrarlo con datos reales

No puedo determinarlo desde aquí (sin acceso a producción ni a tu export de Ágora). Procedimiento **accionable, de solo lectura**:

1. En el PC del conector, exporta de Ágora **sin alterar nada**:
   `GET http://SERVIDOR:8984/api/export/?filter=Invoices,DeliveryNotes,SalesOrders&include-processed=true` (cabecera `Api-Token`), **sin** llamar luego a `/api/doc/processed`. Guarda el JSON.
2. Pásalo por la herramienta nueva: `node scripts/cuadre-agora.js <export.json> 2026-10-DD`.
   Te dará, para ese día: facturas, albaranes, **pedidos excluidos**, **devoluciones**, ventas brutas y un aviso de **posible doble conteo albarán+factura**.
3. Compáralo con Control M del mismo día: `GET /api/ventas/conciliacion?dia=2026-10-DD` (admin), que trae el desglose `por_tipo`.
4. La diferencia se explicará por una de tres cosas, y el cuadre te dice cuál: (i) IVA (titular bruto vs base neta), (ii) pedidos/devoluciones, (iii) albarán+factura de la misma venta. **Ninguna cifra se ajusta a mano para forzar la igualdad.**

## 5. Despliegue — listo, pendiente de tu visto bueno

**Preparado:** lint + unitarios + 102 e2e en verde; backup/restore probado en aislamiento (`scripts/backup.js` / `scripts/restore.js`); commits explícitos por bloque; el arranque valida la persistencia.

**Por qué no lo he desplegado solo:** es un cambio amplio (11 bloques) sobre tu sistema **en vivo** de dinero, toca el motor financiero, y **no puedo verificarlo en producción desde aquí**. Desplegar algo así a tu negocio sin que puedas verlo antes y sin poder comprobarlo en vivo sería imprudente. Cuando digas, el despliegue sigue el flujo autorizado del proyecto (cherry-pick a `main` → push → Render), y **se marcará "publicado / no verificado en vivo"** hasta que alguien con acceso compruebe `GET /api/salud` (trae la versión) y `/api/listo`.

**Reversión:** cada bloque es un commit aislado; se puede revertir individualmente. **El código se revierte con git; una migración de datos NO** — por eso esta entrega no ejecuta ninguna migración de datos reales (solo añade capacidades y validaciones). El backup previo al despliegue es la red de seguridad.

## 6. Copia de seguridad y recuperación

- **Mecanismo entregado:** `scripts/backup.js` (snapshot coherente tras `flush`, fuera del disco efímero, acceso restringido) y `scripts/restore.js` (restaura en entorno aislado, verifica filas/claves/totales, cuadra con el snapshot). Funciona en modo JSON y PostgreSQL. **No hay endpoint HTTP público de export.**
- **Pendiente de activar (requiere acceso al entorno):** destino persistente (p. ej. `BACKUP_DIR` fuera del contenedor o `pg_dump` del proveedor) + frecuencia/retención/responsable. Antes de cualquier migración futura de datos reales: backup + prueba de restauración en entorno independiente.

## 7. Checklist breve de incidentes (operación diaria)

- **No guarda / "no se ha guardado":** mira `GET /api/listo` (`db_ok`). En modo JSON sobre Render el disco es efímero → conecta PostgreSQL (`DATABASE_URL`) para no perder datos.
- **Conector Ágora caído:** el latido y la alarma ya existen; revisa `GET /api/agora-estado`. Reenviar es seguro (idempotente por documento).
- **Cuadre con Ágora:** §4.
- **Stock raro:** `materias_faltantes` en el resumen de sincronización señala escandallos rotos; un ingrediente inexistente ya NO descuenta en silencio.
- **Temporizador sous-vide:** si el server durmió, al volver dispara el "retira" **atrasado** (no se pierde). Requiere avisos push activos en el dispositivo.

## 8. Riesgos que quedan fuera de esta entrega

- Verificación **en vivo** (producción inaccesible desde aquí).
- Rendimiento a escala real (medición en Render pendiente; `rendimiento.1-4,6-8` abiertos).
- UX/accesibilidad completa (`frontend.2` total, `frontend.5/6/7`), e2e troceado (`tests.10`), semántica de columnas del export CSV de Ágora (`motor-fechas.1/2`), persistencia de VAPID/suscripciones (`pwa.3`, atada a PostgreSQL).

> **No se proclama "reloj suizo" hasta que las verificaciones reales pendientes (cuadre con tu export + comprobación en vivo tras desplegar) estén cerradas.**
