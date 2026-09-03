// Pruebas del Cierre de mes (informe macro + micro).
// Autónomo y determinista: sustituye temporalmente store.readAll para materias,
// productos y ventas con datos sintéticos (no depende del estado en disco ni del
// orden de ejecución) y lo restaura al final. No muta ficheros.
// Ejecutar: node tests/cierre-mes.unit.js

const assert = require("assert");
const store = require("../backend/data-store");
const cierre = require("../backend/cierre-mes");

let fallos = 0;
function test(nombre, fn) { try { fn(); console.log("  ✓ " + nombre); } catch (e) { fallos++; console.error("  ✗ " + nombre + "\n    " + e.message); } }

console.log("cierre de mes · rango, macro y micro");

// ── rangoMes (puro) ─────────────────────────────────────────────────────────
test("rangoMes parsea 'YYYY-MM' y marca mes cerrado vs en curso", () => {
  const now = new Date(2026, 6, 15).getTime(); // 15 jul 2026
  const jun = cierre.rangoMes("2026-06", now);
  assert.strictEqual(jun.label, "2026-06");
  assert.strictEqual(new Date(jun.desde).getMonth(), 5, "junio = mes 5");
  assert.strictEqual(jun.en_curso, false, "junio ya está cerrado en julio");
  const jul = cierre.rangoMes("2026-07", now);
  assert.strictEqual(jul.en_curso, true, "julio está en curso");
  assert.ok(jul.hasta <= now + 1, "el mes en curso no pasa de 'ahora'");
});

test("rangoMes sin argumento usa el mes en curso", () => {
  const now = new Date(2026, 2, 10).getTime(); // 10 mar 2026
  const r = cierre.rangoMes("", now);
  assert.strictEqual(r.label, "2026-03");
  assert.strictEqual(r.en_curso, true);
});

// ── informe con datos sintéticos (materias + productos + ventas) ────────────
const MATERIAS = [
  { id: "m1", nombre: "Pan brioche", coste_medio: 0.5, disponibilidad_actual: 0 },
  { id: "m2", nombre: "Café Brasil", coste_medio: 0.2, disponibilidad_actual: 0 },
];
const PRODUCTOS = [
  { id: "p1", nombre: "Brasa", categoria: "sandwich", precio_venta: 8.5, activo: true, cantidades_estimadas: true, ingredientes: [{ materia_id: "m1", cantidad: 2 }] },
  { id: "p2", nombre: "Espresso Brasil", categoria: "café", precio_venta: 1.6, activo: true, cantidades_estimadas: false, ingredientes: [{ materia_id: "m2", cantidad: 1 }] },
];
const VENTAS = [
  { producto_id: "p1", producto: "Brasa", cantidad: 40, importe: 40 * 8.5, fecha: new Date(2026, 5, 10).toISOString() },   // junio
  { producto_id: "p2", producto: "Espresso Brasil", cantidad: 200, importe: 200 * 1.6, fecha: new Date(2026, 5, 20).toISOString() }, // junio
  { producto_id: "p1", producto: "Brasa", cantidad: 5, importe: 5 * 8.5, fecha: new Date(2026, 6, 2).toISOString() },      // julio (fuera)
];

const readAllOrig = store.readAll;
store.readAll = (name) => {
  if (name === "materias") return MATERIAS;
  if (name === "productos") return PRODUCTOS;
  if (name === "ventas") return VENTAS;
  return readAllOrig(name);
};

try {
  const now = new Date(2026, 6, 15).getTime();
  const inf = cierre.informe("2026-06", now);

  test("el informe es del mes pedido y está cerrado", () => {
    assert.strictEqual(inf.mes, "2026-06");
    assert.strictEqual(inf.estado_mes, "cerrado");
  });

  test("las ventas del mes suman solo lo de junio (excluye julio)", () => {
    assert.strictEqual(inf.macro.pyl.ventas, 40 * 8.5 + 200 * 1.6); // 660
  });

  test("el micro por producto trae unidades correctas y clasificación", () => {
    const items = inf.micro.por_ingreso;
    assert.strictEqual(items.length, 2, "2 productos con venta en junio");
    const b = items.find((x) => x.producto_id === "p1");
    assert.strictEqual(b.unidades, 40, "Brasa: 40 uds en junio (las 5 de julio no cuentan)");
    const clases = ["estrella", "caballo_de_batalla", "enigma", "perro"];
    const totalClasificados = clases.reduce((s, k) => s + inf.micro.ingenieria_menu[k].length, 0);
    assert.strictEqual(totalClasificados, 2, "cada producto vendido cae en un cuadrante");
  });

  test("el food cost por producto se calcula con el escandallo (coste con IVA)", () => {
    const b = inf.micro.por_ingreso.find((x) => x.producto_id === "p1");
    // coste unit Brasa = 2×0,5 = 1,0 neto → ×1,10 IVA = 1,10 €; ingreso unit 8,5.
    assert.ok(b.food_cost_pct > 12 && b.food_cost_pct < 14, `food cost Brasa ~13%, fue ${b.food_cost_pct}`);
  });

  test("el detalle marca escandallos pendientes (Brasa estimado)", () => {
    assert.strictEqual(inf.detalle.escandallos.total, 2);
    assert.ok(inf.detalle.escandallos.pendientes >= 1);
    assert.ok(inf.detalle.escandallos.lista_pendientes.some((x) => x.producto_id === "p1"));
  });

  test("hay avisos y comparativas (mes anterior y año anterior)", () => {
    assert.ok(Array.isArray(inf.avisos) && inf.avisos.length >= 1);
    assert.strictEqual(inf.comparativas.mes_anterior.mes, "2026-05");
    assert.strictEqual(inf.comparativas.anio_anterior.mes, "2025-06");
  });
} finally {
  store.readAll = readAllOrig; // restaurar SIEMPRE
}

if (fallos) { console.error(`\n${fallos} prueba(s) fallida(s)`); process.exit(1); }
console.log("cierre de mes: OK");
