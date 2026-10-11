// Fuerza la zona horaria del NEGOCIO (Málaga) ANTES de cualquier uso de Date.
// Debe requerirse lo primero en todo punto de entrada (server, cron, scripts).
//
// Por qué INCONDICIONAL (motor-fechas.3): Render —y la mayoría de contenedores—
// arrancan en UTC. Si dejáramos el TZ heredado, la aritmética NATIVA de fechas de
// periods.js (inicio de día/mes, lunes de la semana) calcularía las fronteras en
// UTC y una venta de las 00:30 de Madrid caería en el día ANTERIOR. Por eso se
// fuerza Madrid aunque el proceso venga en UTC; solo un override EXPLÍCITO del
// operador (CONTROL_M_TZ) lo cambia —no el TZ genérico, que Render pone a UTC—.
// Node aplica el cambio al vuelo (llama a tzset en la siguiente operación de Date),
// así que fijarlo aquí basta para todo el proceso.
//
// Contrato: qué resuelve el TZ del proceso y qué requiere lógica propia
//  · process.env.TZ = Europe/Madrid → la aritmética NATIVA de Date (periods.js:
//    startOfDay/startOfMonth/startOfWeek/addMonths…) opera en hora de Madrid, con
//    el cambio verano/invierno (CEST +2 / CET +1) YA resuelto por el sistema: los
//    días de DST duran 23 h (29-mar) o 25 h (25-oct) sin código extra.
//  · Lo que NO depende de esto: FORMATEAR o AGRUPAR por día local se hace con
//    backend/tz.js (Intl + timeZone explícito), que da el día de Madrid aunque el
//    TZ del proceso estuviese mal. Es la defensa en profundidad: periods.js asume
//    Madrid (lo garantiza este módulo); tz.js no asume nada y lo impone.
const BIZ_TZ = process.env.CONTROL_M_TZ || "Europe/Madrid";
process.env.TZ = BIZ_TZ;

module.exports = { BIZ_TZ };
