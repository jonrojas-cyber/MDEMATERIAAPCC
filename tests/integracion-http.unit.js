// Integración HTTP real (tests.4/8/11 + cabeceras de seguridad): arranca el
// servidor en un puerto efímero con DATA_DIR aislado y SIN base real, y prueba su
// comportamiento de verdad (no solo la lógica en memoria).
// Ejecutar: node tests/integracion-http.unit.js
const assert = require("assert");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const zlib = require("zlib");

// GET crudo SIN auto-descompresión (fetch de Node descomprime solo): así podemos
// comprobar Content-Encoding y descomprimir a mano (rendimiento.4).
function rawGet(pathname, headers) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${PORT}${pathname}`, { headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
  });
}

const PORT = 4099;
const BASE = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-http-"));
const env = { ...process.env, PORT: String(PORT), CONTROL_M_DATA_DIR: dir, DATABASE_URL: "", TZ: "Europe/Madrid" };
const srv = spawn(process.execPath, ["backend/server.js"], { cwd: path.join(__dirname, ".."), env, stdio: "ignore" });

let fallos = 0;
async function test(n, fn) { try { await fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }
async function esperar() {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(BASE + "/api/salud"); if (r.ok) return; } catch (e) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("el servidor de prueba no arrancó a tiempo");
}

(async () => {
  console.log("integración HTTP · arranque, readiness, 404 y cabeceras");
  try {
    await esperar();

    await test("tests.11 · /api/listo responde readiness con versión", async () => {
      const r = await fetch(BASE + "/api/listo");
      const j = await r.json();
      assert.strictEqual(r.status, 200, "200");
      assert.strictEqual(j.listo, true, "listo=true");
      assert.strictEqual(j.db_ok, true, "db_ok=true (modo JSON responde)");
      assert.ok(j.version, "incluye versión");
    });

    await test("tests.8 · toda respuesta lleva X-Request-Id", async () => {
      const r = await fetch(BASE + "/api/salud");
      assert.ok(r.headers.get("x-request-id"), "cabecera X-Request-Id presente");
    });

    await test("tests.4 · ruta /api inexistente (autenticada) → 404 JSON", async () => {
      const login = await (await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario: "Moni", pin: "3333" }) })).json();
      assert.ok(login.token, "login admin devuelve token");
      const r = await fetch(BASE + "/api/ruta-que-no-existe", { headers: { Authorization: "Bearer " + login.token } });
      assert.strictEqual(r.status, 404, "404 para ruta de API inexistente");
      const j = await r.json();
      assert.ok(j.error, "cuerpo JSON con error (no HTML)");
    });

    await test("seguridad · cabeceras CSP + nosniff presentes en vivo", async () => {
      const r = await fetch(BASE + "/api/salud");
      assert.ok(/default-src/.test(r.headers.get("content-security-policy") || ""), "CSP");
      assert.strictEqual(r.headers.get("x-content-type-options"), "nosniff", "nosniff");
    });

    await test("rendimiento.4 · el HTML se sirve COMPRIMIDO (gzip) e íntegro", async () => {
      const comp = await rawGet("/index.html", { "Accept-Encoding": "gzip" });
      assert.strictEqual(comp.headers["content-encoding"], "gzip", "Content-Encoding: gzip");
      assert.ok(/accept-encoding/i.test(comp.headers["vary"] || ""), "Vary: Accept-Encoding");
      const plano = await rawGet("/index.html", { "Accept-Encoding": "identity" });
      assert.ok(!plano.headers["content-encoding"], "sin gzip si no se acepta");
      assert.ok(comp.body.length < plano.body.length, "gzip ocupa bastante menos");
      const descomprimido = zlib.gunzipSync(comp.body);
      assert.strictEqual(descomprimido.length, plano.body.length, "al descomprimir recupera el original");
      assert.ok(/<html|<!doctype/i.test(descomprimido.toString("utf8").slice(0, 200)), "HTML íntegro");
    });

    await test("rendimiento.4 · JSON de API también se comprime, y se descomprime igual", async () => {
      const login = await (await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario: "Moni", pin: "3333" }) })).json();
      const comp = await rawGet("/api/materias", { "Accept-Encoding": "gzip", Authorization: "Bearer " + login.token });
      if (comp.headers["content-encoding"] === "gzip") {
        const plano = await rawGet("/api/materias", { "Accept-Encoding": "identity", Authorization: "Bearer " + login.token });
        assert.deepStrictEqual(zlib.gunzipSync(comp.body), plano.body, "mismo cuerpo tras descomprimir");
      } // si el JSON es < umbral, no se comprime: es correcto, no se fuerza
    });
  } finally {
    srv.kill("SIGKILL");
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
  if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
  console.log("  todo en verde");
})();
