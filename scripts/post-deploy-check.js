#!/usr/bin/env node
// Comprobación POSTERIOR al despliegue (solo LECTURA; no modifica datos de prod).
// Verifica: versión efectiva, readiness, separación de roles admin/equipo (regla 2),
// estado de persistencia, sincronización con Ágora, temporizadores y consistencia
// de las pantallas financieras. El guardado durable se comprueba a MANO (ver el
// paso 7 del DEPLOY.md) para no escribir en producción desde un script.
//
// Los secretos se pasan por ENTORNO, NUNCA por chat ni por argumentos:
//   BASE_URL=https://tu-app.onrender.com \
//   ADMIN_USER=Moni ADMIN_PIN=**** EQUIPO_USER=Lara EQUIPO_PIN=**** \
//   EXPECTED_VERSION=<sha corto desplegado> \
//   node scripts/post-deploy-check.js
//
// Salida: lista PASS/WARN/FAIL y código de salida != 0 si algo crítico falla.
const BASE = (process.env.BASE_URL || "").replace(/\/+$/, "");
const EXPECTED = (process.env.EXPECTED_VERSION || "").slice(0, 12);
if (!BASE) { console.error("Falta BASE_URL (p. ej. https://tu-app.onrender.com)"); process.exit(2); }

let fail = 0, warn = 0;
const ok = (m) => console.log("  PASS · " + m);
const wn = (m) => { warn++; console.log("  WARN · " + m); };
const ko = (m) => { fail++; console.log("  FAIL · " + m); };

async function get(path, token) {
  const r = await fetch(BASE + path, { headers: token ? { Authorization: "Bearer " + token } : {} });
  let body = null; try { body = await r.json(); } catch (e) {}
  return { status: r.status, body };
}
async function login(usuario, pin) {
  if (!usuario || !pin) return null;
  const r = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario, pin }) });
  const j = await r.json().catch(() => ({}));
  return j && j.token ? j.token : null;
}
// Busca recursivamente claves económicas prohibidas para el equipo (regla 2).
const PROHIB = [/^coste/i, /^precio_(compra|pactado|recomendado)/i, /^margen/i, /^food_cost/i, /^escenarios$/i, /^prime_cost/i, /^ebitda/i];
function buscaEconomia(obj, ruta = "") {
  const hits = [];
  if (Array.isArray(obj)) obj.forEach((v, i) => hits.push(...buscaEconomia(v, ruta + "[" + i + "]")));
  else if (obj && typeof obj === "object") for (const k of Object.keys(obj)) {
    if (PROHIB.some((re) => re.test(k))) hits.push(ruta + "." + k);
    hits.push(...buscaEconomia(obj[k], ruta + "." + k));
  }
  return hits;
}

(async () => {
  console.log("Comprobación post-despliegue · " + BASE + "\n");

  // 1) Versión efectiva + persistencia + modo de datos.
  console.log("1) Versión y salud");
  const salud = await get("/api/salud");
  if (salud.status !== 200 || !salud.body) { ko("/api/salud no responde 200"); }
  else {
    console.log("   versión=" + salud.body.version + " · almacen=" + salud.body.almacen + " · persistencia=" + salud.body.persistencia + " · modo_datos=" + salud.body.modo_datos);
    if (EXPECTED) (salud.body.version === EXPECTED ? ok("versión efectiva == desplegada (" + EXPECTED + ")") : ko("versión efectiva '" + salud.body.version + "' != esperada '" + EXPECTED + "' (el despliegue no tomó)"));
    else wn("define EXPECTED_VERSION para verificar que la versión en vivo == la desplegada");
    if (salud.body.modo_datos && /aislado/.test(salud.body.modo_datos)) ko("modo_datos='aislado': NO está sirviendo datos reales");
    if (salud.body.persistencia === "efimera") wn("persistencia EFÍMERA (JSON): los datos no sobreviven a reinicios → revisa DATABASE_URL (ver DEPLOY.md §2)");
    else ok("persistencia durable (postgres)");
  }

  // 2) Readiness.
  console.log("2) Readiness");
  const listo = await get("/api/listo");
  (listo.status === 200 && listo.body && listo.body.listo) ? ok("/api/listo listo=true db_ok=" + listo.body.db_ok) : ko("/api/listo no está listo (status " + listo.status + ")");

  // 3) Separación de roles (regla 2): el equipo NO ve coste/precio-coste/margen.
  console.log("3) Permisos admin/equipo (regla 2)");
  const tAdmin = await login(process.env.ADMIN_USER, process.env.ADMIN_PIN);
  const tEquipo = await login(process.env.EQUIPO_USER, process.env.EQUIPO_PIN);
  tAdmin ? ok("login admin correcto") : wn("sin login admin (define ADMIN_USER/ADMIN_PIN para comprobar permisos)");
  tEquipo ? ok("login equipo correcto") : wn("sin login equipo (define EQUIPO_USER/EQUIPO_PIN para comprobar la regla 2)");
  if (tEquipo) {
    for (const ep of ["/api/financiero", "/api/carta", "/api/inicio"]) {
      const r = await get(ep, tEquipo);
      if (r.status === 403) { ok("equipo NO puede acceder a " + ep + " (403)"); continue; }
      if (r.status !== 200) { wn(ep + " devolvió " + r.status + " para equipo"); continue; }
      const hits = buscaEconomia(r.body);
      hits.length ? ko("equipo VE campos económicos en " + ep + ": " + hits.slice(0, 5).join(", ")) : ok("equipo no ve dinero en " + ep);
    }
  }

  // 4) Sincronización con Ágora.
  console.log("4) Conector / sincronización");
  if (tAdmin) {
    const sync = await get("/api/ventas/sincronizacion", tAdmin);
    const est = await get("/api/ventas/agora-estado", tAdmin);
    console.log("   última sync: " + JSON.stringify(sync.body));
    if (est.body) console.log("   estado conector: " + JSON.stringify(est.body).slice(0, 300));
    (sync.status === 200) ? ok("endpoint de sincronización responde") : wn("sincronización devolvió " + sync.status);
  } else wn("sin token admin: no se comprueba el conector");

  // 5) Temporizadores sous-vide (lectura).
  console.log("5) Temporizadores sous-vide");
  if (tAdmin) {
    const t = await get("/api/avisos", tAdmin);
    (t.status === 200) ? ok("endpoint de avisos/temporizadores responde (" + (Array.isArray(t.body) ? t.body.length + " activos" : "ok") + ")") : wn("/api/avisos devolvió " + t.status);
  } else wn("sin token admin: no se comprueban temporizadores");

  // 6) Consistencia de pantallas financieras (misma venta del día en varias vistas).
  console.log("6) Consistencia de pantallas financieras");
  if (tAdmin) {
    const ini = await get("/api/inicio", tAdmin);
    const fin = await get("/api/financiero?preset=hoy", tAdmin);
    const num = (o, ks) => { for (const k of ks) { const v = findKey(o, k); if (v != null) return v; } return null; };
    const vIni = num(ini.body, ["ventas_hoy", "ventas_dia", "ingresos_hoy"]);
    const vFin = num(fin.body, ["ventas", "ingresos", "ventas_dia"]);
    console.log("   inicio ventas≈" + vIni + " · financiero ventas≈" + vFin);
    if (vIni != null && vFin != null) (Math.abs(Number(vIni) - Number(vFin)) < 0.02 ? ok("las ventas del día cuadran entre inicio y financiero") : wn("las ventas del día difieren entre pantallas (" + vIni + " vs " + vFin + "): revisar a mano"));
    else wn("no se pudo extraer la cifra de ventas automáticamente: revisar las pantallas a mano (inicio, financiero, dashboard)");
    const dash = await get("/api/dashboard", tAdmin);
    (dash.status === 200) ? ok("/api/dashboard (portada CEO) responde") : wn("/api/dashboard devolvió " + dash.status);
  } else wn("sin token admin: no se comprueba la consistencia financiera");

  function findKey(o, key) {
    if (!o || typeof o !== "object") return null;
    if (Object.prototype.hasOwnProperty.call(o, key)) return o[key];
    for (const k of Object.keys(o)) { const v = findKey(o[k], key); if (v != null) return v; }
    return null;
  }

  console.log("\n7) Guardado durable → comprobación MANUAL (no se escribe en prod desde aquí):");
  console.log("   crea una nota/cambio pequeño, reinicia el servicio en Render y confirma que PERSISTE.");
  console.log("   (en modo postgres debe sobrevivir siempre; en 'efimera' NO sobrevive).");

  console.log("\nResumen: " + fail + " FAIL · " + warn + " WARN");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("Error en la comprobación:", e.message); process.exit(1); });
