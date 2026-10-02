// Catálogo de etiquetas de producción: siembra idempotente + slug.
// Ejecutar: node tests/etiquetas-catalogo.unit.js
const assert = require("assert");
const seed = require("../backend/seed-etiquetas");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

function fakeStore(data) {
  return {
    readAll: (e) => data[e] || [],
    findById: (e, id) => (data[e] || []).find((r) => r.id === id) || null,
    insert: (e, r) => { (data[e] = data[e] || []).push(r); return r; },
    update: (e, id, patch) => { const r = (data[e] || []).find((x) => x.id === id); if (r) Object.assign(r, patch); return r; },
  };
}

console.log("catálogo de etiquetas");

test("slug normaliza acentos y símbolos", () => {
  assert.strictEqual(seed.slug("Limonada Naranja · pomelo · albahaca"), "etc-limonada-naranja-pomelo-albahaca");
  assert.strictEqual(seed.slug("Súper Juice de limón"), "etc-super-juice-de-limon");
});

test("siembra preparaciones internas SIN inventar vida útil, idempotente", () => {
  const data = { config: [], etiquetas_catalogo: [] };
  const st = fakeStore(data);
  const r = seed.aplicar(st);
  assert.ok(r.ranAny);
  assert.ok(data.etiquetas_catalogo.length >= 8, "items=" + data.etiquetas_catalogo.length);
  // Regla clave: la vida útil NO se inventa en el seed → vida_dias null.
  data.etiquetas_catalogo.forEach((c) => {
    assert.ok(c.nombre && c.categoria, "item inválido: " + JSON.stringify(c));
    assert.strictEqual(c.vida_dias, null, "vida inventada en " + c.nombre);
  });
  // Solo preparaciones internas (lo que NO está en Ágora ni como receta).
  const nombres = data.etiquetas_catalogo.map((c) => c.nombre);
  ["Super juice de lima", "Agua de romero (concentrado)", "Óleo saccharum", "Dukkah"].forEach((n) => {
    assert.ok(nombres.includes(n), "falta " + n);
  });
  // No debe meter productos que ya vienen de Ágora/recetas (evita duplicar).
  ["Limonada Equilibrio", "Cold brew", "Salsa M"].forEach((n) => {
    assert.ok(!nombres.includes(n), "no debería sembrar (ya existe): " + n);
  });
  // Idempotente.
  const r2 = seed.aplicar(st);
  assert.strictEqual(r2.ranAny, false);
});

if (fallos) { console.error(`\n${fallos} fallo(s) en catálogo de etiquetas`); process.exit(1); }
console.log("  catálogo de etiquetas OK");
