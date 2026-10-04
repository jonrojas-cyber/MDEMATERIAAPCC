// Vuelca el precio de Compras (compras_productos) al coste de la materia.
// Ejecutar: node tests/coste-desde-compras.unit.js
const assert = require("assert");
const cc = require("../backend/coste-desde-compras");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("coste desde compras");

function fakeStore(seed) {
  const d = JSON.parse(JSON.stringify(seed || {})); const s = {};
  return {
    readAll: (e) => d[e] || (d[e] = []),
    insert: (e, r) => { (d[e] || (d[e] = [])).push(r); return r; },
    update: (e, id, patch) => { const r = (d[e] || []).find((x) => x.id === id); if (r) Object.assign(r, patch); return r; },
    findById: (e, id) => (d[e] || []).find((x) => x.id === id) || null,
    nextId: (p, e) => { s[e] = (s[e] || 0) + 1; return `${p}_${s[e]}`; },
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

test("food cost vivo: el coste sigue al último precio de compra y registra variante", () => {
  const st = fakeStore({
    materias: [{ id: "m", nombre: "Café", unidad: "g", coste_medio: 0.02 }],
    compras_productos: [{ id: "a1", nombre: "Café", formato: "kg", cantidad_formato: 1, precio_con_iva: 50 }], // 0.05 €/g
    precios_historico: [],
  });
  cc.aplicar(st);
  assert.strictEqual(st.findById("materias", "m").coste_medio, 0.05); // actualizado al último precio
  const h = st.readAll("precios_historico");
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].precio_anterior, 0.02);
  assert.strictEqual(h[0].precio_nuevo, 0.05);
});

test("no toca las elaboraciones (materias que produce una receta)", () => {
  const st = fakeStore({
    materias: [{ id: "mat-salsa", nombre: "Salsa M", unidad: "g", coste_medio: 0 }],
    recetas: [{ id: "r1", nombre: "Salsa M", produce_materia_id: "mat-salsa", ingredientes: [] }],
    compras_productos: [{ id: "a1", nombre: "Salsa M", formato: "kg", cantidad_formato: 1, precio_con_iva: 10 }],
  });
  cc.aplicar(st);
  assert.strictEqual(st.findById("materias", "mat-salsa").coste_medio, 0); // intacto (lo calcula el motor)
});

test("fruta entera → piel/zumo por rendimiento (la receta usa piel; se compra la fruta)", () => {
  const st = fakeStore({
    materias: [
      { id: "mat-lim-piel-lima", nombre: "Piel de lima", unidad: "g", coste_medio: 0 },
      { id: "mat-lim-zumo-naranja", nombre: "Zumo de naranja", unidad: "g", coste_medio: 0 },
    ],
    compras_productos: [
      { id: "a1", nombre: "Limas Mercadona", formato: "kg", cantidad_formato: 1, precio_con_iva: 2.0 }, // 0,002 €/g lima
      { id: "a2", nombre: "Naranja de zumo", formato: "kg", cantidad_formato: 1, precio_con_iva: 1.1 }, // 0,0011 €/g
    ],
    precios_historico: [],
  });
  cc.aplicar(st);
  assert.strictEqual(st.findById("materias", "mat-lim-piel-lima").coste_medio, 0.016);   // 0,002 × 8
  assert.ok(Math.abs(st.findById("materias", "mat-lim-zumo-naranja").coste_medio - 0.00242) < 1e-6); // 0,0011 × 2,2
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
