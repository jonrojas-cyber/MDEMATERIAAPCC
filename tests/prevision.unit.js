// Prueba del motor de previsión por día de la semana.
// Ejecutar: node tests/prevision.unit.js  (revertir backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");
const prevision = require("../backend/prevision");

// Escenario controlado.
store.writeAll("materias", [
  { id: "m1", nombre: "Cold brew", unidad: "g", disponibilidad_actual: 500 },
  { id: "m2", nombre: "Leche avena", unidad: "ml", disponibilidad_actual: 5000 },
]);
store.writeAll("productos", [
  { id: "p1", nombre: "Cold brew nitro", activo: true, ingredientes: [{ materia_id: "m1", cantidad: 200 }] },
]);
store.writeAll("recetas", [
  { id: "r1", nombre: "Cold brew", unidad: "g", resultado_base: 1000, ingredientes: [] },
]);
// Dos sábados (2026-01-03 y 2026-01-10), a mediodía para que el día local sea estable.
store.writeAll("ventas", [
  { id: "v1", producto_id: "p1", producto: "Cold brew nitro", cantidad: 2, fecha: "2026-01-03T12:00:00" },
  { id: "v2", producto_id: "p1", producto: "Cold brew nitro", cantidad: 4, fecha: "2026-01-10T12:00:00" },
]);

const SAB = new Date("2026-01-03T12:00:00").getDay(); // 6 (sábado)

let fallos = 0;
function test(nombre, fn) { try { fn(); console.log("  ✓ " + nombre); } catch (e) { fallos++; console.error("  ✗ " + nombre + "\n    " + e.message); } }

console.log("prevision · demanda por día de la semana");

test("aprende la media del sábado con 2 semanas de datos", () => {
  const est = prevision.estimacionPara(SAB);
  const p = est.find((x) => x.producto_id === "p1");
  assert.ok(p, "hay estimación de Cold brew nitro el sábado");
  assert.strictEqual(p.unidades_estimadas, 3, "media (2+4)/2 = 3");
  assert.strictEqual(p.semanas, 2, "2 semanas observadas (confianza)");
});

test("cruza demanda con stock: qué faltaría el sábado", () => {
  const plan = prevision.planDia(SAB);
  const m1 = plan.materias.find((x) => x.materia_id === "m1");
  assert.ok(m1, "plan de Cold brew (materia)");
  assert.strictEqual(m1.demanda, 600, "3 uds × 200 g = 600 g de demanda");
  assert.strictEqual(m1.disponible, 500, "stock actual 500 g");
  assert.strictEqual(m1.falta, 100, "faltan 100 g para cubrir la estimación");
});

test("recomienda producir la receta que repone esa materia", () => {
  const plan = prevision.planDia(SAB);
  const r = plan.produccion.find((x) => x.receta_id === "r1");
  assert.ok(r, "recomienda producir Cold brew");
  assert.strictEqual(r.producir, 100, "producir los 100 g que faltan");
  assert.strictEqual(r.para_materia, "Cold brew");
});

test("un día sin ventas históricas no inventa demanda", () => {
  const lunes = SAB === 6 ? 1 : 6;
  const plan = prevision.planDia(lunes);
  assert.strictEqual(plan.estimacion.length, 0, "sin estimación el lunes");
  assert.strictEqual(plan.produccion.length, 0, "no recomienda producir sin datos");
});

console.log(fallos ? `\n${fallos} prueba(s) FALLIDA(s)` : "\nTodas las pruebas de previsión OK");
process.exit(fallos ? 1 : 0);
