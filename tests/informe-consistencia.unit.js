// Informe semanal de consistencia: lógica (sobre el data-store aislado) y
// puerta HTTP real (503 sin token configurado, 401 con token malo, 200 bueno).
// Ejecutar: node tests/informe-consistencia.unit.js
const assert = require("assert");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const store = require("../backend/data-store");
const informe = require("../backend/informe-consistencia");

let fallos = 0;
async function test(n, fn) { try { await fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

const AHORA = new Date("2026-10-19T10:00:00Z").getTime();
const hace = (h) => new Date(AHORA - h * 3600000).toISOString();

function seed() {
  store.writeAll("materias", [
    { id: "m1", nombre: "Matcha", unidad: "g", disponibilidad_actual: 40, stock_minimo: 200 },
    { id: "m2", nombre: "Leche", unidad: "ml", disponibilidad_actual: 5000, stock_minimo: 1000 },
    { id: "m3", nombre: "Limón", unidad: "g", disponibilidad_actual: -10, stock_minimo: 0 },
  ]);
  store.writeAll("recetas", [{ id: "r1", nombre: "Cold brew" }]);
  store.writeAll("preparaciones", [
    { id: "p1", receta_id: "r1", estado: "Finalizada", creada_en: hace(30) },
    { id: "p2", receta_id: "r1", estado: "En curso", creada_en: hace(50), pasos: [1, 2, 3], paso_actual: 1, responsable: "Lara" },
  ]);
  store.writeAll("lotes", [
    { id: "l1", receta_id: "r1", codigo: "CB-1", producido_en: hace(80), caduca_en: hace(8), cantidad_restante: 500, estado: "Correcto" },
    { id: "l2", receta_id: "r1", codigo: "CB-2", producido_en: hace(20), caduca_en: new Date(AHORA + 5 * 3600000).toISOString(), cantidad_restante: 900, estado: "Correcto" },
    { id: "l3", receta_id: "r1", codigo: "CB-0", producido_en: hace(400), caduca_en: hace(300), cantidad_restante: 0, estado: "Fuera de servicio" },
  ]);
  store.writeAll("lotes_produccion", [
    { id: "lp1", tipo: "burbujas", producto: "Burbujas Origen", litros: 16, fecha: hace(24) },
    { id: "lp2", tipo: "burbujas", producto: "Burbujas Origen", litros: 5, fecha: hace(48) },
    { id: "lp3", tipo: "burbujas", producto: "Burbujas Origen", litros: 5, fecha: hace(24 * 10) },
  ]);
  store.writeAll("revisiones", [
    { id: "v1", tipo: "Temperatura cámara", estado: "Correcto", fecha: hace(2) },
    { id: "v2", tipo: "Temperatura cámara", estado: "Fuera del rango esperado", accion_correctiva: "", fecha: hace(26) },
  ]);
  store.writeAll("ajustes", [
    { id: "a1", tipo_objetivo: "materia", objetivo_id: "m2", motivo: "caducidad", coste_estimado: 1.2, fecha: hace(5) },
    { id: "a2", tipo_objetivo: "materia", objetivo_id: "m2", objetivo_nombre: "Leche", motivo: "caducidad", coste_estimado: 0.8, fecha: hace(10) },
    { id: "a3", tipo_objetivo: "materia", objetivo_id: "m1", motivo: "error", coste_estimado: 9, fecha: hace(24 * 9) },
  ]);
  store.writeAll("apertura", []);
  store.writeAll("inventarios", []);
  store.writeAll("incidencias", [
    { id: "i1", titulo: "Grifo 2 gotea", categoria: "equipo", prioridad: "alta", estado: "abierta", fecha: hace(12) },
    { id: "i2", titulo: "Ya resuelta", estado: "resuelta", fecha: hace(12) },
  ]);
}

(async () => {
  console.log("informe-consistencia · lógica");
  seed();
  const r = informe.generar(store, { ahora: AHORA, dias: 7 });

  await test("periodo de 7 días en zona Málaga", () => {
    assert.strictEqual(r.periodo.dias, 7);
    assert.strictEqual(r.periodo.zona, "Europe/Madrid");
    assert.strictEqual(r.rutinas.length, 7);
  });
  await test("producción: preparaciones y atascos", () => {
    assert.strictEqual(r.produccion.preparaciones_iniciadas, 2);
    assert.strictEqual(r.produccion.preparaciones_finalizadas, 1);
    assert.strictEqual(r.produccion.preparaciones_atascadas.length, 1);
    assert.strictEqual(r.produccion.preparaciones_atascadas[0].paso, "1/3");
  });
  await test("barriles del periodo por producto (excluye fuera de rango)", () => {
    const o = r.produccion.lotes_barril_por_producto["Burbujas Origen"];
    assert.deepStrictEqual([o.lotes, o.litros], [2, 21]);
  });
  await test("trazabilidad: caducado en servicio y caducan en 24h", () => {
    assert.strictEqual(r.trazabilidad.lotes_activos, 2);
    assert.deepStrictEqual(r.trazabilidad.caducados_en_servicio.map((l) => l.codigo), ["CB-1"]);
    assert.strictEqual(r.trazabilidad.caducan_en_24h, 1);
  });
  await test("APPCC: fuera de rango sin acción correctiva", () => {
    assert.strictEqual(r.appcc.revisiones, 2);
    assert.strictEqual(r.appcc.fuera_de_rango, 1);
    assert.strictEqual(r.appcc.fuera_de_rango_sin_accion, 1);
    assert.ok(r.appcc.dias_sin_revision.length >= 4);
  });
  await test("mermas: solo el periodo, agrupadas por motivo y producto", () => {
    assert.strictEqual(r.mermas.registros, 2);
    assert.strictEqual(r.mermas.coste_total_eur, 2);
    assert.strictEqual(r.mermas.por_motivo[0].nombre, "caducidad");
    assert.deepStrictEqual(r.mermas.top_productos, [{ nombre: "Leche", n: 2, coste_eur: 2 }]);
  });
  await test("stock: bajo mínimo, negativo y sin mínimo", () => {
    assert.deepStrictEqual(r.stock.bajo_minimo.map((m) => m.nombre), ["Matcha"]);
    assert.deepStrictEqual(r.stock.negativo, ["Limón"]);
    assert.strictEqual(r.stock.materias_sin_minimo, 1);
  });
  await test("incidencias: solo las no resueltas", () => {
    assert.deepStrictEqual(r.incidencias_abiertas.map((i) => i.titulo), ["Grifo 2 gotea"]);
  });
  await test("no expone ventas ni tesorería", () => {
    const s = JSON.stringify(r);
    for (const k of ["ventas", "importe", "tesoreria", "treasury", "balance"]) assert.ok(!s.includes(`"${k}`), k);
  });

  console.log("informe-consistencia · puerta HTTP");
  const PORT = 4098;
  const BASE = `http://127.0.0.1:${PORT}`;
  const arrancar = (extra) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-inf-"));
    const env = { ...process.env, PORT: String(PORT), CONTROL_M_DATA_DIR: dir, DATABASE_URL: "", TZ: "Europe/Madrid", ...extra };
    delete env.INFORME_CONSISTENCIA_TOKEN;
    Object.assign(env, extra);
    return spawn(process.execPath, ["backend/server.js"], { cwd: path.join(__dirname, ".."), env, stdio: "ignore" });
  };
  const esperar = async () => {
    for (let i = 0; i < 80; i++) {
      try { const x = await fetch(BASE + "/api/salud"); if (x.ok) return; } catch (e) {}
      await new Promise((ok) => setTimeout(ok, 200));
    }
    throw new Error("el servidor de prueba no arrancó a tiempo");
  };
  const parar = (srv) => new Promise((ok) => { srv.once("exit", ok); srv.kill(); });

  let srv = arrancar({});
  try {
    await esperar();
    await test("sin token configurado → 503", async () => {
      const x = await fetch(BASE + "/informe/consistencia?token=loquesea");
      assert.strictEqual(x.status, 503);
    });
  } finally { await parar(srv); }

  srv = arrancar({ INFORME_CONSISTENCIA_TOKEN: "secreto-de-prueba-123" });
  try {
    await esperar();
    await test("token incorrecto o ausente → 401", async () => {
      assert.strictEqual((await fetch(BASE + "/informe/consistencia")).status, 401);
      assert.strictEqual((await fetch(BASE + "/informe/consistencia?token=malo")).status, 401);
    });
    await test("token correcto (query o cabecera) → 200 con informe y sin caché", async () => {
      const a = await fetch(BASE + "/informe/consistencia?token=secreto-de-prueba-123");
      assert.strictEqual(a.status, 200);
      assert.strictEqual(a.headers.get("cache-control"), "no-store");
      const j = await a.json();
      assert.ok(j.periodo && j.produccion && j.appcc && j.stock);
      const b = await fetch(BASE + "/informe/consistencia?dias=14", { headers: { "X-Informe-Token": "secreto-de-prueba-123" } });
      assert.strictEqual((await b.json()).periodo.dias, 14);
    });
  } finally { await parar(srv); }

  if (fallos) { console.error(`\n✗ ${fallos} fallo(s)`); process.exit(1); }
  console.log("✓ informe-consistencia OK");
})();
