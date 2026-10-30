// Auditoría de food cost por producto vendido: coste real por unidad y por volumen,
// con la fuente y el estado (real / estimado / parcial / sin coste / sin ficha). El
// total CUADRA con el P&L (mismo motor: costeProducto × cantidad + netoDeVenta), y lo
// accionable (sin ficha / sin coste) se ordena primero.
// Ejecutar: node tests/auditoria-foodcost.unit.js

const assert = require("assert");
const store = require("../backend/data-store");
const financials = require("../backend/financials");
const aud = require("../backend/auditoria-foodcost");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }
function cerca(a, b, m) { assert.ok(Math.abs(a - b) < 0.02, `${m} (${a} vs ${b})`); }
function fila(d, nombre) { return d.productos.find((p) => p.nombre === nombre); }

function sembrar() {
  store.writeAll("materias", [
    { id: "m1", nombre: "Café Brasil (espresso)", unidad: "g", coste_medio: 0.0239 },
    { id: "m2", nombre: "Leche fresca", unidad: "ml", coste_medio: 0.001 },
    { id: "m4", nombre: "Agua", unidad: "ud", coste_medio: 0.35 },
  ]);
  store.writeAll("productos", [
    { id: "p1", nombre: "Latte" },                       // receta base × materias → facturas (real)
    { id: "p2", nombre: "Agua" },                         // reventa por pieza → facturas (real)
    { id: "p3", nombre: "Croqueta", coste_materia: 0.50 },// coste declarado → directo (real)
    { id: "p4", nombre: "Tosta rara" },                   // sin receta ni coste → sin_coste
  ]);
  const hoy = new Date().toISOString();
  store.writeAll("ventas", [
    { id: "v1", producto_id: "p1", producto: "Latte", cantidad: 10, importe_neto: 25.00, fecha: hoy },
    { id: "v2", producto_id: "p2", producto: "Agua", cantidad: 5, importe_neto: 7.50, fecha: hoy },
    { id: "v3", producto_id: "p3", producto: "Croqueta", cantidad: 4, importe_neto: 8.00, fecha: hoy },
    { id: "v4", producto_id: "p4", producto: "Tosta rara", cantidad: 3, importe_neto: 9.00, fecha: hoy },
    { id: "v5", producto_id: null, producto: "Chicle", cantidad: 2, importe_neto: 1.00, fecha: hoy }, // no está en catálogo
  ]);
  const t = Date.parse(hoy);
  return { desde: t - 3600000, hasta: t + 3600000 };
}

console.log("auditoría de food cost · coste real por producto vendido");

test("cada producto vendido lleva su coste real por unidad, fuente y estado", () => {
  const r = sembrar();
  const d = aud.auditar(r);
  assert.strictEqual(d.total_productos, 5, "5 productos vendidos (4 del catálogo + 1 sin ficha)");

  const latte = fila(d, "Latte");
  cerca(latte.coste_unit, 0.6502, "latte = 18 g café + 220 ml leche (receta × materias)");
  assert.strictEqual(latte.fuente, "facturas", "latte desde tus facturas");
  assert.strictEqual(latte.estado, "real");
  cerca(latte.coste_total, 6.50, "coste total latte = 10 uds");
  cerca(latte.food_cost_pct, 0.26, "food cost latte = 6,50 / 25,00");

  const agua = fila(d, "Agua");
  cerca(agua.coste_unit, 0.35, "agua por reventa");
  assert.strictEqual(agua.estado, "real");

  const croq = fila(d, "Croqueta");
  cerca(croq.coste_unit, 0.50, "croqueta por coste declarado");
  assert.strictEqual(croq.fuente, "directo");
  assert.strictEqual(croq.estado, "real");

  assert.strictEqual(fila(d, "Tosta rara").estado, "sin_coste", "sin receta → sin coste");
  const chicle = fila(d, "Chicle");
  assert.strictEqual(chicle.estado, "sin_ficha", "no está en el catálogo");
  assert.strictEqual(chicle.en_catalogo, false);
  cerca(chicle.coste_total, 0, "lo que no se puede costear no inventa coste");
});

test("el total CUADRA con el P&L (misma función que la cuenta de resultados)", () => {
  const r = sembrar();
  const d = aud.auditar(r);
  const costing = require("../backend/costing");
  const idxMat = costing.indiceMaterias(store.readAll("materias"));
  const idxProd = financials.indicesProducto();
  const costePnl = Math.round(financials.costeMateriaVendidaEnRango(r, idxMat, idxProd) * 100) / 100;
  const ventasPnl = Math.round(financials.ventasNetasEnRango(r) * 100) / 100;
  cerca(d.coste_materia, costePnl, "coste materia = el del P&L");
  cerca(d.ventas_netas, ventasPnl, "ventas netas = las del P&L");
  cerca(d.ventas_netas, 50.50, "ventas netas totales");
  cerca(d.coste_materia, 10.25, "coste materia total");
  // Food cost REAL sobre lo COSTEADO (real: Latte 25 + Agua 7,5 + Croqueta 8 = 40,5):
  cerca(d.ventas_costeadas, 40.50, "ventas costeadas (real+estimado+parcial)");
  cerca(d.food_cost_pct, 0.253, "food cost real = 10,25 / 40,50 (NO diluido por lo sin costear)");
  // El 'sobre toda la venta' (diluido) se expone aparte, nunca como el real:
  cerca(d.food_cost_pct_total, 0.203, "food cost sobre toda la venta = 10,25 / 50,50");
});

test("devoluciones: unidades netas <= 0 → food cost null; cobertura acotada [0,1]", () => {
  store.writeAll("materias", [
    { id: "m1", nombre: "Café Brasil (espresso)", unidad: "g", coste_medio: 0.0239 },
    { id: "m2", nombre: "Leche fresca", unidad: "ml", coste_medio: 0.001 },
  ]);
  store.writeAll("productos", [{ id: "p1", nombre: "Latte" }]);
  const hoy = new Date().toISOString();
  store.writeAll("ventas", [
    { id: "v1", producto_id: "p1", producto: "Latte", cantidad: 5, importe_neto: 12.5, fecha: hoy },
    { id: "v2", producto_id: "p1", producto: "Latte", cantidad: -5, importe_neto: -6, fecha: hoy }, // devolución
    { id: "v3", producto_id: null, producto: "Snack ajeno", cantidad: -1, importe_neto: -30, fecha: hoy }, // abono sin ficha
  ]);
  const t = Date.parse(hoy);
  const d = aud.auditar({ desde: t - 3600000, hasta: t + 3600000 });
  const latte = fila(d, "Latte");
  assert.strictEqual(latte.unidades, 0, "unidades netas 0 tras la devolución");
  assert.strictEqual(latte.food_cost_pct, null, "net<=0 uds → food cost null (no margen infinito)");
  assert.ok(d.cobertura_real_pct >= 0 && d.cobertura_real_pct <= 1, "cobertura acotada a [0,1] pese a netos negativos");
});

test("nombres de Ágora con espacios/mayúsculas resuelven (no 'sin ficha'); el activo manda", () => {
  store.writeAll("materias", [
    { id: "m1", nombre: "Café Brasil (espresso)", unidad: "g", coste_medio: 0.0239 },
    { id: "m2", nombre: "Leche fresca", unidad: "ml", coste_medio: 0.001 },
  ]);
  store.writeAll("productos", [
    { id: "pArch", nombre: "Brownie", activo: false },     // archivado SIN coste, mismo nombre
    { id: "pAct", nombre: "Brownie", coste_materia: 0.80 }, // activo CON coste
    { id: "p1", nombre: "Latte" },
  ]);
  const hoy = new Date().toISOString();
  store.writeAll("ventas", [
    { id: "v1", producto: " LATTE ", cantidad: 10, importe_neto: 25, fecha: hoy }, // sin id, con espacios/mayúsculas
    { id: "v2", producto: "Brownie", cantidad: 5, importe_neto: 10, fecha: hoy },   // por nombre, duplicado activo/archivado
  ]);
  const t = Date.parse(hoy);
  const d = aud.auditar({ desde: t - 3600000, hasta: t + 3600000 });
  const latte = fila(d, "Latte");
  assert.ok(latte && latte.en_catalogo, "' LATTE ' resuelve al Latte del catálogo (no sin ficha)");
  assert.strictEqual(latte.estado, "real", "con coste real, no sin_coste");
  const brownie = fila(d, "Brownie");
  assert.strictEqual(brownie.estado, "real", "el Brownie ACTIVO (con coste) manda sobre el archivado");
  cerca(brownie.coste_unit, 0.80, "coste del producto activo, no 0 del archivado");
});

test("cobertura real y orden accionable (sin ficha / sin coste primero)", () => {
  const r = sembrar();
  const d = aud.auditar(r);
  // real = Latte(25) + Agua(7,5) + Croqueta(8) = 40,5 sobre 50,5
  cerca(d.cobertura_real_pct, 0.802, "qué % de la facturación tiene coste real");
  assert.strictEqual(d.por_estado.real.productos, 3, "tres productos reales");
  assert.strictEqual(d.por_estado.sin_coste.productos, 1);
  assert.strictEqual(d.por_estado.sin_ficha.productos, 1);
  assert.strictEqual(d.productos[0].estado, "sin_ficha", "lo no costeable, primero (accionable)");
  assert.strictEqual(d.productos[1].estado, "sin_coste", "luego lo que falta fijar");
});

if (fallos) { console.error(`\n${fallos} prueba(s) de la auditoría fallaron`); process.exit(1); }
console.log("\nTodas las pruebas de la auditoría de food cost OK");
