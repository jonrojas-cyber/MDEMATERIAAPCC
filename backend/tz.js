// Zona horaria del negocio (Málaga). El servidor (Render) corre en UTC, así que
// cualquier fecha que se MUESTRA hay que convertirla a Europe/Madrid — que
// maneja solo el cambio verano/invierno (CEST +2 / CET +1). Se guarda en UTC
// (ISO), se muestra en Madrid. Nunca formatear con getHours()/getDate() a pelo.
const TZ = "Europe/Madrid";

// Devuelve las partes de fecha/hora en la zona de Málaga: {year, month, day,
// hour, minute, second} como cadenas de 2 dígitos (year de 4).
function partes(iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat("es-ES", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const o = {};
  for (const p of fmt.formatToParts(d)) if (p.type !== "literal") o[p.type] = p.value;
  if (o.hour === "24") o.hour = "00"; // algunos runtimes devuelven 24 para medianoche
  return o;
}

module.exports = { TZ, partes };
