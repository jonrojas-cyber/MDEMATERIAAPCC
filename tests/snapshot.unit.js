// Prueba del Snapshot Engine (capa histórica AI-ready del Centro de Control).
// Ejecutar: node tests/snapshot.unit.js  (revertir backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");
const snap = require("../backend/snapshot-engine");

let fallos = 0;
function test(nombre, fn) { return fn().then(() => console.log("  ✓ " + nombre)).catch((e) => { fallos++; console.error("  ✗ " + nombre + "\n    " + e.message); }); }

const NOW = new Date(2026, 6, 2, 14, 0, 0).getTime();
const DAY = 86400000;

(async () => {
  console.log("snapshot-engine · serie histórica del negocio");

  // Escenario mínimo y determinista.
  store.writeAll("financial_snapshots", []);
  store.writeAll("materias", [{ id: "m1", nombre: "Café", unidad: "g", disponibilidad_actual: 1000, coste_medio: 0.02, stock_minimo: 100 }]);
  store.writeAll("productos", []);
  store.writeAll("ventas", []);
  store.writeAll("ajustes", []);
  store.writeAll("debts", []);
  store.writeAll("financial_accounts", [{ id: "a1", name: "Banco", type: "banco", balance: 5000, active: true }]);
  store.writeAll("fixed_costs", []);
  store.writeAll("staff_finance", []);
  store.writeAll("assets", []);

  await test("captura un snapshot del día con métricas clave", async () => {
    const { snapshot, nuevo } = await snap.capturarDiario(NOW);
    assert.strictEqual(nuevo, true, "el primer snapshot del día es nuevo");
    assert.ok(snapshot.fecha === "2026-07-02", "fecha ymd correcta: " + snapshot.fecha);
    assert.ok(snapshot.local_id === "principal", "ownership presente (local_id)");
    assert.ok(snapshot.creado_en, "timestamp presente");
    assert.ok(typeof snapshot.salud === "number", "salud numérica");
    assert.ok(typeof snapshot.patrimonio_neto === "number", "patrimonio numérico");
  });

  await test("es idempotente: dos capturas el mismo día = un solo registro", async () => {
    const dup = await snap.capturarDiario(NOW);
    assert.strictEqual(dup.nuevo, false, "la segunda captura del día NO es nueva");
    assert.strictEqual(snap.historico(90).length, 1, "solo un registro por día");
  });

  await test("la tendencia compara el último snapshot con ~7 días atrás", async () => {
    // Inserta un snapshot de hace 7 días con menor patrimonio.
    store.insert("financial_snapshots", {
      id: "snap-principal-2026-06-25", local_id: "principal", fecha: "2026-06-25",
      creado_en: new Date(NOW - 7 * DAY).toISOString(), salud: 40, patrimonio_neto: 4000, ventas_dia: 0,
    });
    const tnd = snap.tendencia(NOW);
    assert.strictEqual(tnd.disponible, true);
    assert.ok(tnd.semana.patrimonio_neto, "hay comparativo semanal de patrimonio");
    assert.ok(tnd.semana.patrimonio_neto.abs > 0, "el patrimonio creció respecto a hace 7 días");
  });

  await test("historico devuelve la serie ordenada por fecha ascendente", async () => {
    const serie = snap.historico(90);
    for (let i = 1; i < serie.length; i++) assert.ok(serie[i - 1].fecha <= serie[i].fecha, "orden ascendente");
    assert.ok(serie.length >= 2, "al menos dos snapshots en la serie");
  });

  if (fallos) { console.error(`\n${fallos} prueba(s) de snapshot fallaron`); process.exit(1); }
  console.log("\nTodas las pruebas de snapshot OK");
})();
