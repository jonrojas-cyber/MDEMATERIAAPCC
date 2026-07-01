// Prueba de las sugerencias de compra agrupadas por proveedor + que los pedidos
// YA NO aparecen como tareas en el centro de decisiones.
// Ejecutar: node tests/compras.unit.js  (revertir backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");

store.writeAll("proveedores", [
  { id: "prov-1", nombre: "Frutas SL", whatsapp: "+34 600 111 222" },
  { id: "prov-2", nombre: "Café XYZ", whatsapp: "" },
]);
store.writeAll("materias", [
  { id: "m1", nombre: "Lima", unidad: "g", proveedor_id: "prov-1", disponibilidad_actual: 100, stock_minimo: 200, stock_optimo: 1000 }, // crítico
  { id: "m2", nombre: "Aguacate", unidad: "g", proveedor_id: "prov-1", disponibilidad_actual: 260, stock_minimo: 200, stock_optimo: 1000 }, // por_pedir (≤ 260 punto pedido)
  { id: "m3", nombre: "Café", unidad: "g", proveedor_id: "prov-2", disponibilidad_actual: 50, stock_minimo: 100, stock_optimo: 500 }, // crítico
  { id: "m4", nombre: "Sal", unidad: "g", proveedor_id: "prov-1", disponibilidad_actual: 5000, stock_minimo: 200 }, // correcto → no aparece
]);

const compras = require("../backend/compras");

let fallos = 0;
function test(nombre, fn) { try { fn(); console.log("  ✓ " + nombre); } catch (e) { fallos++; console.error("  ✗ " + nombre + "\n    " + e.message); } }

console.log("compras · sugerencias por proveedor");

test("agrupa por proveedor y excluye lo que está correcto", () => {
  const s = compras.sugerencias();
  assert.strictEqual(s.length, 2, "dos proveedores con faltas");
  const frutas = s.find((g) => g.proveedor === "Frutas SL");
  assert.ok(frutas, "grupo Frutas SL");
  assert.strictEqual(frutas.total_items, 2, "Lima + Aguacate (Sal está correcta, fuera)");
  assert.ok(!frutas.items.some((i) => i.nombre === "Sal"), "Sal no aparece");
});

test("marca críticos y ordena críticos primero", () => {
  const s = compras.sugerencias();
  // Café XYZ tiene 1 crítico; Frutas SL 1 crítico → orden por criticos desc y nombre.
  const frutas = s.find((g) => g.proveedor === "Frutas SL");
  assert.strictEqual(frutas.criticos, 1, "1 crítico en Frutas");
  assert.strictEqual(frutas.items[0].estado, "critico", "el crítico va primero");
  assert.ok(frutas.items[0].cantidad_sugerida > 0, "sugiere cantidad para reponer");
});

test("los pedidos NO salen como tareas en el centro de decisiones", () => {
  store.writeAll("recetas", []); store.writeAll("lotes", []); store.writeAll("preparaciones", []);
  store.writeAll("ajustes", []); store.writeAll("recepciones", []); store.writeAll("consumos", []);
  store.writeAll("productos", []); store.writeAll("ventas", []); store.writeAll("pedidos", []);
  store.writeAll("docs_agora", []);
  const dec = require("../backend/decisiones").construir();
  assert.ok(!(dec.acciones || []).some((a) => a.tipo === "pedido"), "ninguna acción de tipo 'pedido'");
});

console.log(fallos ? `\n${fallos} prueba(s) FALLIDA(s)` : "\nTodas las pruebas de compras OK");
process.exit(fallos ? 1 : 0);
