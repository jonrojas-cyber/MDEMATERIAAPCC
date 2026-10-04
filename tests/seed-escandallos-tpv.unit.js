// Siembra de escandallos del TPV: rellena café 17 g + leche/té/matcha en los
// productos de Ágora que estén vacíos, sin pisar los que ya tienen receta.
// Ejecutar: node tests/seed-escandallos-tpv.unit.js
const assert = require("assert");
const seed = require("../backend/seed-escandallos-tpv");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("escandallos TPV");

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

// Almacén con las materias base y algunos productos del TPV (vacíos) + uno ya hecho.
function store() {
  return fakeStore({
    materias: [
      { id: "mat-cafe-brasil", nombre: "Café Brasil (espresso)", unidad: "g", coste_medio: 0.0239 },
      { id: "mat-018", nombre: "Café (tueste cold brew)", unidad: "g", coste_medio: 0.014 },
      { id: "mat-leche-fresca", nombre: "Leche fresca", unidad: "ml", coste_medio: 0.001 },
      { id: "mat-007", nombre: "Matcha base", unidad: "g", coste_medio: 0.2 },
    ],
    productos: [
      { id: "p1", nombre: "Espresso", categoria: "bebida", ingredientes: [] },
      { id: "p2", nombre: "Latte", categoria: "bebida", ingredientes: [] },
      { id: "p3", nombre: "Coldbrew", categoria: "bebida", ingredientes: [] },
      { id: "p4", nombre: "Earl grey", categoria: "bebida", ingredientes: [] },
      { id: "p5", nombre: "Iced matcha origen", categoria: "bebida", ingredientes: [] },
      { id: "p6", nombre: "Capuccino", categoria: "bebida", ingredientes: [{ materia_id: "x", cantidad: 9 }] }, // YA tiene receta
    ],
    config: [{ id: "seed-prod-agora-v1", hecho: true }], // evita que productos-agora cree el catálogo entero en el test
  });
}

test("café 17 g en espresso; café + 200 ml leche en latte", () => {
  const st = store();
  seed.aplicar(st);
  const esp = st.findById("productos", "p1");
  assert.deepStrictEqual(esp.ingredientes, [{ materia_id: "mat-cafe-brasil", cantidad: 17 }]);
  const latte = st.findById("productos", "p2");
  assert.deepStrictEqual(latte.ingredientes, [{ materia_id: "mat-cafe-brasil", cantidad: 17 }, { materia_id: "mat-leche-fresca", cantidad: 200 }]);
});

test("coldbrew usa su tueste; iced matcha lleva matcha + leche", () => {
  const st = store();
  seed.aplicar(st);
  assert.strictEqual(st.findById("productos", "p3").ingredientes[0].materia_id, "mat-018");
  const im = st.findById("productos", "p5").ingredientes;
  assert.strictEqual(im[0].materia_id, "mat-007");
  assert.strictEqual(im[0].cantidad, 2);
});

test("crea la materia 'Té en bolsa' y pone 1 ud en el té", () => {
  const st = store();
  seed.aplicar(st);
  assert.ok(st.findById("materias", "mat-te-bolsa"));
  assert.deepStrictEqual(st.findById("productos", "p4").ingredientes, [{ materia_id: "mat-te-bolsa", cantidad: 1 }]);
});

test("nunca pisa una receta ya puesta a mano", () => {
  const st = store();
  seed.aplicar(st);
  assert.deepStrictEqual(st.findById("productos", "p6").ingredientes, [{ materia_id: "x", cantidad: 9 }]);
});

test("idempotente: una segunda pasada no rellena nada más", () => {
  const st = store();
  const r1 = seed.aplicar(st);
  const r2 = seed.aplicar(st);
  assert.ok(r1.rellenados >= 5);
  assert.strictEqual(r2.rellenados, 0);
});

test("no enlaza materias inexistentes (ingredientes filtrados)", () => {
  const st = fakeStore({ materias: [{ id: "mat-cafe-brasil", nombre: "Café", unidad: "g" }], productos: [{ id: "p1", nombre: "Latte", ingredientes: [] }], config: [{ id: "seed-prod-agora-v1", hecho: true }] });
  seed.aplicar(st);
  // Falta la leche → solo queda el café (no crea enlaces rotos).
  assert.deepStrictEqual(st.findById("productos", "p1").ingredientes, [{ materia_id: "mat-cafe-brasil", cantidad: 17 }]);
});

if (fallos) { console.error(`\n${fallos} fallo(s) en escandallos TPV`); process.exit(1); }
console.log("  escandallos TPV OK");
