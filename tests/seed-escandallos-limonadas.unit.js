// Siembra de escandallos de limonadas: crea las materias, deriva la receta por
// vaso (300 ml) y la enlaza a los productos del TPV. Fill-only e idempotente.
// Ejecutar: node tests/seed-escandallos-limonadas.unit.js
const assert = require("assert");
const seed = require("../backend/seed-escandallos-limonadas");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("escandallos limonadas");

function fakeStore(seedData) {
  const d = JSON.parse(JSON.stringify(seedData || {})); const s = {};
  return {
    readAll: (e) => d[e] || (d[e] = []),
    insert: (e, r) => { (d[e] || (d[e] = [])).push(r); return r; },
    update: (e, id, patch) => { const row = (d[e] || []).find((r) => r.id === id); if (row) Object.assign(row, patch); return row; },
    findById: (e, id) => (d[e] || []).find((r) => r.id === id) || null,
    nextId: (p, e) => { s[e] = (s[e] || 0) + 1; return `${p}_${s[e]}`; },
    flush: async () => {}, _d: d,
  };
}

// Config flags puestos → los sub-seeds no crean nada; controlamos los productos.
function store() {
  return fakeStore({
    materias: [{ id: "mat-coc-sal", nombre: "Sal", unidad: "g", coste_medio: 0.001 }], // Sal ya existe → se reutiliza
    productos: [
      { id: "tpv-lim-o", nombre: "Limonada origen", categoria: "bebida", ingredientes: [] },
      { id: "tpv-lim-e", nombre: "Limonada equilibrio", categoria: "bebida", ingredientes: [] },
      { id: "tpv-lim-c", nombre: "Limonada colección", categoria: "bebida", ingredientes: [] },
      { id: "tpv-zumo", nombre: "Zumo materia", categoria: "bebida", ingredientes: [] },
      { id: "tpv-lim-x", nombre: "Limonada origen", categoria: "bebida", ingredientes: [{ materia_id: "y", cantidad: 1 }] }, // ya tiene receta
    ],
    config: [{ id: "seed-prod-agora-v1", hecho: true }],
  });
}

test("crea las materias de limonada y reutiliza la Sal existente", () => {
  const st = store();
  seed.aplicar(st);
  assert.ok(st.findById("materias", "mat-lim-azucar"));
  assert.ok(st.findById("materias", "mat-lim-puree-maracuya"));
  // La sal se reutiliza (no crea mat-lim-sal).
  assert.ok(!st.findById("materias", "mat-lim-sal"));
});

test("escandallo por vaso de 200 ml: azúcar origen = 61 g/L × 0,2 = 12,2 g", () => {
  const st = store();
  seed.aplicar(st);
  const o = st.findById("productos", "tpv-lim-o");
  const azucar = o.ingredientes.find((i) => i.materia_id === "mat-lim-azucar");
  assert.strictEqual(azucar.cantidad, 12.2); // 61 * 0.2
  const sal = o.ingredientes.find((i) => i.materia_id === "mat-coc-sal");
  assert.ok(sal && Math.abs(sal.cantidad - 0.122) < 1e-6); // 0.61 * 0.2, enlazada a la sal existente
});

test("equilibrio lleva puré de maracuyá; colección lleva lapsang; zumo lleva naranja", () => {
  const st = store();
  seed.aplicar(st);
  assert.ok(st.findById("productos", "tpv-lim-e").ingredientes.some((i) => i.materia_id === "mat-lim-puree-maracuya"));
  assert.ok(st.findById("productos", "tpv-lim-c").ingredientes.some((i) => i.materia_id === "mat-lim-lapsang"));
  assert.ok(st.findById("productos", "tpv-zumo").ingredientes.some((i) => i.materia_id === "mat-lim-zumo-naranja"));
});

test("no pisa un producto que ya tenía receta", () => {
  const st = store();
  seed.aplicar(st);
  assert.deepStrictEqual(st.findById("productos", "tpv-lim-x").ingredientes, [{ materia_id: "y", cantidad: 1 }]);
});

test("idempotente: segunda pasada no rellena nada más", () => {
  const st = store();
  const r1 = seed.aplicar(st);
  const r2 = seed.aplicar(st);
  assert.strictEqual(r1.rellenados, 4);
  assert.strictEqual(r2.rellenados, 0);
});

test("recalcula las que sembró el propio seed cuando cambia el vaso (300 → 200)", () => {
  const st = fakeStore({
    materias: [{ id: "mat-lim-azucar", nombre: "Azúcar", unidad: "g", coste_medio: 0 }],
    productos: [{ id: "tpv-lim-o", nombre: "Limonada origen", ingredientes: [{ materia_id: "mat-lim-azucar", cantidad: 18.3 }], escandallo_origen: "seed-limonadas", escandallo_servicio_ml: 300 }],
    config: [{ id: "seed-prod-agora-v1", hecho: true }],
  });
  const r = seed.aplicar(st);
  assert.ok(r.rellenados >= 1);
  const o = st.findById("productos", "tpv-lim-o");
  assert.strictEqual(o.escandallo_servicio_ml, 200);
  assert.strictEqual(o.ingredientes.find((i) => i.materia_id === "mat-lim-azucar").cantidad, 12.2);
});

if (fallos) { console.error(`\n${fallos} fallo(s) en escandallos limonadas`); process.exit(1); }
console.log("  escandallos limonadas OK");
