// Vuelca el precio de Compras (compras_productos) al coste de la materia.
// Ejecutar: node tests/coste-desde-compras.unit.js
const assert = require("assert");
const cc = require("../backend/coste-desde-compras");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("coste desde compras");

function fakeStore(seed) {
  const d = JSON.parse(JSON.stringify(seed || {}));
  return {
    readAll: (e) => d[e] || (d[e] = []),
    update: (e, id, patch) => { const r = (d[e] || []).find((x) => x.id === id); if (r) Object.assign(r, patch); return r; },
    findById: (e, id) => (d[e] || []).find((x) => x.id === id) || null,
    flush: async () => {}, _d: d,
  };
}

test("kg → €/g: Azúcar 1 kg a 1,20 € ⇒ 0,0012 €/g (enlaza por nombre)", () => {
  const st = fakeStore({
    materias: [{ id: "mat-lim-azucar", nombre: "Azúcar", unidad: "g", coste_medio: 0, pendiente_coste: true }],
    compras_productos: [{ id: "a1", nombre: "Azúcar", formato: "kg", cantidad_formato: 1, precio_sin_iva: 1.0909, iva: 10 }], // conIVA ≈ 1.20
  });
  cc.aplicar(st);
  const m = st.findById("materias", "mat-lim-azucar");
  assert.ok(Math.abs(m.coste_medio - 0.0012) < 1e-6, "coste=" + m.coste_medio);
  assert.strictEqual(m.pendiente_coste, false);
});

test("litro → €/ml; enlaza por materia_id aunque el nombre no coincida", () => {
  const st = fakeStore({
    materias: [{ id: "mat-x", nombre: "Leche entera pasteurizada", unidad: "ml", coste_medio: 0 }],
    compras_productos: [{ id: "a1", nombre: "Leche brick", formato: "litro", cantidad_formato: 1, precio_con_iva: 1.0, materia_id: "mat-x" }],
  });
  cc.aplicar(st);
  assert.ok(Math.abs(st.findById("materias", "mat-x").coste_medio - 0.001) < 1e-9);
});

test("contenido_base manda sobre el formato (saco 25 kg con contenido_base en g)", () => {
  const st = fakeStore({
    materias: [{ id: "m", nombre: "Harina", unidad: "g", coste_medio: 0 }],
    compras_productos: [{ id: "a1", nombre: "Harina", formato: "saco", cantidad_formato: 1, precio_con_iva: 25, contenido_base: 25000 }],
  });
  cc.aplicar(st);
  assert.strictEqual(st.findById("materias", "m").coste_medio, 0.001); // 25 / 25000
});

test("no pisa un coste ya establecido", () => {
  const st = fakeStore({
    materias: [{ id: "m", nombre: "Café", unidad: "g", coste_medio: 0.02 }],
    compras_productos: [{ id: "a1", nombre: "Café", formato: "kg", cantidad_formato: 1, precio_con_iva: 50 }], // 0.05 €/g
  });
  cc.aplicar(st);
  assert.strictEqual(st.findById("materias", "m").coste_medio, 0.02); // intacto
});

test("formato no convertible sin contenido_base: no inventa coste", () => {
  const st = fakeStore({
    materias: [{ id: "m", nombre: "Cajas varias", unidad: "g", coste_medio: 0 }],
    compras_productos: [{ id: "a1", nombre: "Cajas varias", formato: "caja", cantidad_formato: 1, precio_con_iva: 10 }],
  });
  cc.aplicar(st);
  assert.strictEqual(st.findById("materias", "m").coste_medio, 0); // sigue pendiente
});

if (fallos) { console.error(`\n${fallos} fallo(s) en coste desde compras`); process.exit(1); }
console.log("  coste desde compras OK");
