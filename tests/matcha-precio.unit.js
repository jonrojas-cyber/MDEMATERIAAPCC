// Regla de negocio: TODO el matcha del negocio es el mismo y cuesta 200 €/kg
// = 0,20 €/g. Este test blinda que no vuelva a colarse un coste de matcha por
// debajo de 0,20 en ninguna materia (única fuente de verdad del precio).
// Ejecutar: node tests/matcha-precio.unit.js
const assert = require("assert");
const { BATCHES } = require("../backend/seed-cafe");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("precio del matcha (200 €/kg = 0,20 €/g)");

// Coste FINAL de cada materia tras aplicar en orden los batches de seed-cafe.
function costesFinalesMaterias() {
  const coste = {};
  for (const b of BATCHES) {
    (b.materias || []).forEach((m) => { if (typeof m.coste_medio === "number") coste[m.id] = m.coste_medio; });
    (b.actualizaciones || []).forEach((u) => {
      if (u.entity === "materias" && u.campos && typeof u.campos.coste_medio === "number") coste[u.id] = u.campos.coste_medio;
    });
  }
  return coste;
}

test("el batch de corrección v12 deja mat-matcha y mat-007 a 0,20", () => {
  const v12 = BATCHES.find((b) => b.flag === "cafe_seed_v12_matcha_200");
  assert.ok(v12, "falta el batch cafe_seed_v12_matcha_200");
  const ups = new Map(v12.actualizaciones.map((u) => [u.id, u.campos.coste_medio]));
  assert.strictEqual(ups.get("mat-matcha"), 0.20);
  assert.strictEqual(ups.get("mat-007"), 0.20);
});

test("ninguna materia de matcha queda por debajo de 0,20 €/g", () => {
  const coste = costesFinalesMaterias();
  ["mat-matcha", "mat-007"].forEach((id) => {
    assert.ok(id in coste, "no se ve el coste final de " + id);
    assert.ok(coste[id] >= 0.20 - 1e-9, id + " = " + coste[id] + " (< 0,20)");
  });
});

if (fallos) { console.error(`\n${fallos} fallo(s) en matcha-precio`); process.exit(1); }
console.log("  matcha-precio OK");
