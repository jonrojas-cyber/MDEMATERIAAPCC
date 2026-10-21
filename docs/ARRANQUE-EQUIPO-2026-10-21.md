# Arranque del equipo · semana del 19 al 24 de octubre de 2026

Objetivo: trabajar diariamente con registros confirmados y contrastar las cifras
críticas con el negocio real. Esta revisión no certifica todavía producción.

## Correcciones de esta entrega

- Apertura/cierre: un fallo de carga se muestra como error; no se presenta como una
  checklist vacía. No se marca una tarea hasta recibir confirmación del servidor.
  Si el resultado del guardado es incierto, se exige recargar antes de continuar.
- APPCC: una medición vacía no se convierte en 0 °C. Se acepta coma decimal,
  se rechazan valores no numéricos/no finitos, se identifica al usuario de la
  sesión y se espera la persistencia antes de responder con éxito.
- Tres pruebas de regresión HTTP/navegador cubren estos fallos.

## Evidencia de producción obtenida (solo lectura)

El 21 de octubre `/api/salud` de `controlm-mdemateria.onrender.com` respondió:
versión `a8a878772a11`, modo real, almacén PostgreSQL, persistencia persistente.
Esto confirma lo que declara el servicio; no acredita backup restaurable,
guardado tras reinicio, importación de ventas ni conciliación económica.

## Antes de publicar

1. Disponer de acceso de escritura al repositorio.
2. Seguir las comprobaciones de configuración, backup y restauración de
   `DEPLOY.md` contra la instalación actual. Sus SHA y la rama de remediación
   son históricos: no ejecutar el merge antiguo ni sobrescribir el árbol actual.
3. Ejecutar `CI=true npm test` sobre el árbol que se va a publicar.
4. Publicar conservando los datos existentes y verificar la nueva versión.

## Implantación propuesta

| Momento | Responsable | Comprobación |
| --- | --- | --- |
| Antes del primer turno | Dirección | Usuarios activos y PIN privados; roles correctos; cuadrante real; catálogo y stock inicial contrastados |
| Primer turno acompañado | Dirección + equipo | Apertura, temperaturas medidas, una producción con lote/etiqueta, una recepción y una merma reales |
| Primer cierre | Dirección + equipo | Cierre operativo; arqueo real; ventas de Ágora importadas una sola vez y documentos bloqueados identificados |
| Día siguiente | Dirección | Los registros siguen presentes; contrastar ventas y caja con TPV y stock con un recuento físico |
| Cada cierre de la semana | Dirección | Resolver discrepancias concretas y registrar incidencias antes de usar las cifras para decidir compras o rentabilidad |

No crear operaciones ficticias en producción para completar esta tabla. Registrar
operaciones reales supervisadas. Las pruebas automáticas usan datos aislados.

## Condición de arranque verificado

El equipo completa el circuito sin ayuda, los registros sobreviven a reinicios,
los roles protegen los datos económicos y las cifras críticas cuadran con Ágora,
caja e inventario real. Un resultado de tests en verde por sí solo no cumple esto.
