// Conector Ágora → Control M · resiliencia: ante 401/403/503 LANZA error (para
// que el bucle reintente), NUNCA mata el proceso. Ejecutar: node tests/conector.unit.js
const assert = require("assert");
const http = require("http");
const C = require("../conector-agora/conector");

let fallos = 0;
async function test(n, fn) { try { await fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

// Servidor de prueba: devuelve el status/carga que le digamos por ruta.
function servidor(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, "127.0.0.1", () => resolve({ s, base: `http://127.0.0.1:${s.address().port}` }));
  });
}

(async () => {
  console.log("conector Ágora (resiliencia)");

  // requiere el módulo SIN arrancar el bucle (guard require.main).
  await test("expone las funciones y no arranca main al requerirlo", () => {
    ["cargarConfig", "pedir", "leerDeAgora", "empujarAControlM", "sincronizar"].forEach((k) => assert.strictEqual(typeof C[k], "function", "existe " + k));
  });

  await test("Ágora 401 LANZA error (no mata el proceso)", async () => {
    const { s, base } = await servidor((req, res) => { res.writeHead(401); res.end("no auth"); });
    let lanzo = false;
    try { await C.leerDeAgora({ agora_base: base, agora_token: "x", filtro: "Invoices" }); }
    catch (e) { lanzo = true; assert.ok(/401/.test(e.message)); }
    s.close();
    assert.ok(lanzo, "debe lanzar, no salir");
    assert.ok(process.exitCode === undefined || process.exitCode === 0, "el proceso sigue vivo");
  });

  await test("Ágora 200 devuelve el cuerpo JSON", async () => {
    const { s, base } = await servidor((req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ Invoices: [] })); });
    const body = await C.leerDeAgora({ agora_base: base, agora_token: "x", filtro: "Invoices" });
    s.close();
    assert.deepStrictEqual(body, { Invoices: [] });
  });

  await test("Control M 401 y 503 LANZAN error (se reintenta)", async () => {
    for (const code of [401, 503]) {
      const { s, base } = await servidor((req, res) => { res.writeHead(code); res.end("x"); });
      let lanzo = false;
      try { await C.empujarAControlM({ controlm_base: base, conector_token: "t" }, { documents: {} }); }
      catch (e) { lanzo = true; }
      s.close();
      assert.ok(lanzo, `debe lanzar en ${code}, no salir`);
    }
    assert.ok(process.exitCode === undefined || process.exitCode === 0, "el proceso sigue vivo");
  });

  if (fallos) { console.error(`\n${fallos} fallo(s) en conector`); process.exit(1); }
  console.log("  conector OK");
})();
