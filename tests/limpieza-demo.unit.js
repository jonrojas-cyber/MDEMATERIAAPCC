// Limpieza de datos de prueba: retira SOLO los ids de la semilla original y
// conserva lo real (cafés, materias de café, y cualquier registro con otro id).
// Ejecutar: node tests/limpieza-demo.unit.js
const assert = require("assert");
const { limpiarDemo } = require("../backend/limpieza-demo");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

function fakeStore(data) {
  return {
    readAll: (e) => data[e] || [],
    remove: (e, id) => { data[e] = (data[e] || []).filter((r) => r.id !== id); },
    _data: data,
  };
}

console.log("limpieza de datos de prueba");

test("retira los productos/proveedores/materias/recetas/lotes demo y conserva lo real", () => {
  const data = {
    productos: [
      { id: "prod-001", nombre: "Brasa (demo)" },
      { id: "prod-cafe-esp-bra", nombre: "Espresso Brasil (real)" },
      { id: "prod-usuario-xyz", nombre: "Matcha real creado por Moni" },
    ],
    proveedores: [{ id: "prov-001", nombre: "demo" }, { id: "prov-real-nuevo", nombre: "proveedor real" }],
    materias: [{ id: "mat-001", nombre: "Aguacate demo" }, { id: "mat-cafe-brasil", nombre: "Café real" }],
    recetas: [{ id: "rec-001", nombre: "demo" }],
    lotes: [{ id: "lote-001", receta_id: "rec-001" }],
    ajustes: [{ id: "aju-001", tipo_objetivo: "lote", objetivo_id: "lote-005" }],
    impresiones: [{ id: "imp-001", lote_id: "lote-001" }],
    inventarios: [{ id: "inv-001", lineas: [{ materia_id: "mat-003" }] }],
  };
  const st = fakeStore(data);
  const n = limpiarDemo(st);

  // Demo fuera.
  assert.deepStrictEqual(data.productos.map((p) => p.id).sort(), ["prod-cafe-esp-bra", "prod-usuario-xyz"]);
  assert.deepStrictEqual(data.proveedores.map((p) => p.id), ["prov-real-nuevo"]);
  assert.deepStrictEqual(data.materias.map((m) => m.id), ["mat-cafe-brasil"]);
  assert.strictEqual(data.recetas.length, 0);
  assert.strictEqual(data.lotes.length, 0);
  assert.strictEqual(data.ajustes.length, 0);       // objetivo_id lote-005 (demo)
  assert.strictEqual(data.impresiones.length, 0);   // lote-001 (demo)
  assert.strictEqual(data.inventarios.length, 0);   // recuenta mat-003 (demo)
  assert.ok(n >= 6);
});

test("no toca nada si no hay datos demo (idempotente)", () => {
  const data = { productos: [{ id: "prod-cafe-esp-bra" }], proveedores: [{ id: "prov-real" }] };
  const st = fakeStore(data);
  assert.strictEqual(limpiarDemo(st), 0);
  assert.strictEqual(data.productos.length, 1);
  assert.strictEqual(data.proveedores.length, 1);
});

if (fallos) { console.error(`\n${fallos} fallo(s) en limpieza-demo`); process.exit(1); }
console.log("  limpieza-demo OK");
