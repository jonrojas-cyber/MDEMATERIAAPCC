// Seguridad del asistente (agente sobre la API). El agente solo puede tocar la propia
// API (/api/*), nunca otro host, ni el login, ni a sí mismo (recursión); DELETE y
// acciones destructivas quedan fuera; las mutaciones son POST/PUT no destructivas. Estas
// pruebas validan el puente SIN llamar al modelo (funciones puras exportadas).
// Ejecutar: node tests/asistente.unit.js

const assert = require("assert");
const asist = require("../backend/routes/asistente");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("asistente · seguridad del puente interno");

test("rutaInterna acepta rutas de la propia API (con query)", () => {
  assert.strictEqual(asist.rutaInterna("/api/mermas?hoy=1"), "/api/mermas?hoy=1");
  assert.ok(asist.rutaInterna("/api/cuenta-resultados"));
  assert.ok(asist.rutaInterna("/api/pedidos/sugerencias"));
});

test("rutaInterna rechaza host externo, protocolo y rutas raras", () => {
  assert.strictEqual(asist.rutaInterna("http://evil.com/api/x"), null, "otro host");
  assert.strictEqual(asist.rutaInterna("//evil.com"), null, "//host");
  assert.strictEqual(asist.rutaInterna("/etc/passwd"), null, "fuera de /api");
  assert.strictEqual(asist.rutaInterna("/api/../secreto"), null, "traversal ..");
  assert.strictEqual(asist.rutaInterna("/api/mermas con espacio"), null, "espacios");
  assert.strictEqual(asist.rutaInterna(42), null, "no string");
});

test("rutaInterna veta el propio asistente (recursión) y el login", () => {
  assert.strictEqual(asist.rutaInterna("/api/asistente"), null);
  assert.strictEqual(asist.rutaInterna("/api/asistente/x"), null);
  assert.strictEqual(asist.rutaInterna("/api/auth/login"), null);
});

test("rutaInterna no se elude con mayúsculas ni con %2e%2e (ruta canónica)", () => {
  // Express enruta sin distinguir mayúsculas → el veto compara en minúscula.
  assert.strictEqual(asist.rutaInterna("/api/ASISTENTE"), null, "mayúsculas");
  assert.strictEqual(asist.rutaInterna("/api/AUTH/login"), null, "login en mayúsculas");
  // fetch normaliza %2e%2e a .. y colapsa el path ANTES de enviar.
  assert.strictEqual(asist.rutaInterna("/api/x/%2e%2e/asistente"), null, "recursión por %2e%2e");
  assert.strictEqual(asist.rutaInterna("/api/x/%2e%2e/auth/login"), null, "login por %2e%2e");
  assert.strictEqual(asist.rutaInterna("/api/../secreto"), null, "sale de /api tras colapsar");
});

test("accionPermitida: solo POST/PUT no destructivos (nada de GET ni DELETE)", () => {
  assert.strictEqual(asist.accionPermitida("GET", "/api/mermas").ok, false, "GET no es acción");
  assert.strictEqual(asist.accionPermitida("DELETE", "/api/recepciones/1").ok, false, "DELETE nunca");
  assert.strictEqual(asist.accionPermitida("POST", "/api/mermas").ok, true, "alta de merma sí");
  assert.strictEqual(asist.accionPermitida("PUT", "/api/proveedores/prov-1").ok, true, "editar sí");
});

test("accionPermitida veta acciones destructivas/masivas/sensibles", () => {
  assert.strictEqual(asist.accionPermitida("POST", "/api/limpieza-catalogo").ok, false);
  assert.strictEqual(asist.accionPermitida("POST", "/api/recepciones/importar-paquete").ok, false);
  assert.strictEqual(asist.accionPermitida("POST", "/api/algo/eliminar").ok, false);
  assert.strictEqual(asist.accionPermitida("POST", "/api/backup").ok, false);
});

test("accionPermitida admite las acciones de equipo por voz (incidencia, ausencia, aviso)", () => {
  assert.strictEqual(asist.accionPermitida("POST", "/api/incidencias").ok, true, "abrir incidencia");
  assert.strictEqual(asist.accionPermitida("POST", "/api/ausencias").ok, true, "pedir ausencia");
  assert.strictEqual(asist.accionPermitida("POST", "/api/tablon").ok, true, "aviso al tablón (el rol lo gatea la ruta)");
  assert.strictEqual(asist.accionPermitida("POST", "/api/pedidos").ok, true, "proponer pedido");
});

test("disponible() es booleano y es false sin ANTHROPIC_API_KEY", () => {
  assert.strictEqual(typeof asist.disponible(), "boolean");
  if (!process.env.ANTHROPIC_API_KEY) assert.strictEqual(asist.disponible(), false);
});

test("transcripción: sttDisponible() refleja OPENAI_API_KEY y extDe() mapea el formato", () => {
  assert.strictEqual(typeof asist.sttDisponible(), "boolean");
  if (!process.env.OPENAI_API_KEY) assert.strictEqual(asist.sttDisponible(), false);
  assert.strictEqual(asist.extDe("audio/webm;codecs=opus"), "webm");
  assert.strictEqual(asist.extDe("audio/mp4"), "mp4");
  assert.strictEqual(asist.extDe("audio/ogg"), "ogg");
  assert.strictEqual(asist.extDe("audio/mpeg"), "mp3");
  assert.strictEqual(asist.extDe(""), "webm");
});

test("POST /transcribir degrada sin clave (503 STT_NO_CONFIG) y valida el audio", () => {
  const router = require("../backend/routes/asistente");
  const layer = router.stack.find((l) => l.route && l.route.path === "/transcribir" && l.route.methods.post);
  assert.ok(layer, "ruta /transcribir no encontrada");
  const h = layer.route.stack[layer.route.stack.length - 1].handle;
  const run = (body) => { const res = { _s: 200, _j: null, status(c){this._s=c;return this;}, json(x){this._j=x;return this;} }; h({ body }, res, () => {}); return res; };
  if (!process.env.OPENAI_API_KEY) {
    const r = run({ audio: "AAAA" });
    assert.strictEqual(r._s, 503, "sin clave → 503");
    assert.strictEqual(r._j.code, "STT_NO_CONFIG");
  }
});

if (fallos) { console.error(`\n${fallos} prueba(s) del asistente fallaron`); process.exit(1); }
console.log("\nTodas las pruebas del asistente OK");
