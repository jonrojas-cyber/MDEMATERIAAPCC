// Prueba de la agregación del calendario anual (sin servidor HTTP).
// Ejecutar: node tests/calendario.unit.js  (revertir backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");

// Datos controlados para 2026.
store.writeAll("recetas", [{ id: "rec-1", nombre: "Brasa" }]);
store.writeAll("proveedores", [{ id: "prov-1", nombre: "Frutas SL" }]);
store.writeAll("lotes", [
  { id: "l1", receta_id: "rec-1", codigo: "BRA-1", cantidad_inicial: 1000, producido_en: "2026-03-10T09:30:00", caduca_en: "2026-03-12T09:30:00", estado: "En servicio" },
]);
store.writeAll("revisiones", [{ id: "rv1", tipo: "Temperatura nevera", valor: 4, estado: "Correcto", responsable: "Jon", fecha: "2026-03-10T08:00:00" }]);
store.writeAll("ajustes", [{ id: "a1", tipo_objetivo: "lote", objetivo_id: "l1", objetivo_nombre: "BRA-1", cantidad: 200, motivo: "merma", coste_estimado: 1.5, fecha: "2026-03-11T20:00:00" }]);
store.writeAll("recepciones", [{ id: "r1", proveedor_id: "prov-1", importe_total: 45, estado: "Aceptado", fecha: "2026-03-05T11:00:00" }]);

// Cargamos el router y llamamos al handler con req/res simulados.
const router = require("../backend/routes/calendario");
function invocar(query) {
  return new Promise((resolve) => {
    const layer = router.stack.find((l) => l.route && l.route.path === "/" && l.route.methods.get);
    layer.route.stack[0].handle({ query }, { json: (data) => resolve(data) });
  });
}

let fallos = 0;
function test(nombre, fn) { return Promise.resolve().then(fn).then(() => console.log("  ✓ " + nombre)).catch((e) => { fallos++; console.error("  ✗ " + nombre + "\n    " + e.message); }); }

(async () => {
  console.log("calendario · agregación anual por día");

  await test("agrupa producción + APPCC por fecha del año pedido", async () => {
    const d = await invocar({ year: "2026" });
    assert.strictEqual(d.year, 2026);
    // 10 de marzo: 1 producción + 1 revisión.
    const d10 = d.dias["2026-03-10"];
    assert.ok(d10 && d10.length === 2, "dos eventos el 2026-03-10");
    assert.ok(d10.some((e) => e.tipo === "produccion"), "hay producción");
    assert.ok(d10.some((e) => e.tipo === "revision"), "hay revisión");
    // caducidad el 12, merma el 11, recepción el 5.
    assert.ok(d.dias["2026-03-12"].some((e) => e.tipo === "caducidad"), "caducidad el 12");
    assert.ok(d.dias["2026-03-11"].some((e) => e.tipo === "merma"), "merma el 11");
    assert.ok(d.dias["2026-03-05"].some((e) => e.tipo === "recepcion"), "recepción el 5");
  });

  await test("resumen mensual: marzo cuenta 1 producción y 4 APPCC", async () => {
    const d = await invocar({ year: "2026" });
    const marzo = d.meses[2];
    assert.strictEqual(marzo.produccion, 1, "1 producción en marzo");
    assert.strictEqual(marzo.appcc, 4, "4 registros APPCC (caduca+revisión+merma+recepción)");
  });

  await test("filtra por año: 2025 no trae los eventos de 2026", async () => {
    const d = await invocar({ year: "2025" });
    assert.strictEqual(Object.keys(d.dias).length, 0, "sin días en 2025");
  });

  console.log(fallos ? `\n${fallos} prueba(s) FALLIDA(s)` : "\nTodas las pruebas de calendario OK");
  process.exit(fallos ? 1 : 0);
})();
