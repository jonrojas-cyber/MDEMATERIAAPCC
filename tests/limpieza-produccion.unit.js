// Limpieza de producción: da de baja (reversible) materias y recetas que no
// componen ningún producto vendido, SIN tocar sub-ingredientes que sí se usan.
// Ejecutar: node tests/limpieza-produccion.unit.js
const assert = require("assert");
const L = require("../backend/limpieza-produccion");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

function fakeStore(data) {
  return {
    readAll: (e) => data[e] || [],
    findById: (e, id) => (data[e] || []).find((r) => r.id === id) || null,
    insert: (e, r) => { (data[e] = data[e] || []).push(r); return r; },
    update: (e, id, patch) => { const r = (data[e] || []).find((x) => x.id === id); if (r) Object.assign(r, patch); return r; },
    _data: data,
  };
}

// Escenario: Matcha latte (vendido) usa "matcha base" (elaboración) que a su vez
// usa matcha en polvo + agua. Hay además una materia y una receta de I+D sin uso.
function datos() {
  return {
    productos: [
      { id: "p-matcha", nombre: "Matcha latte", precio_venta: 3.3, activo: true, ingredientes: [{ materia_id: "m-matchabase", cantidad: 30 }, { materia_id: "m-leche", cantidad: 180 }] },
      { id: "p-agora", nombre: "Espresso", precio_venta: 1.8, activo: true, coste_materia: 0.3, ingredientes: [] }, // sin materias: no aporta al keep-set
      { id: "p-archivado", nombre: "Bebida vieja", precio_venta: 0, activo: false, ingredientes: [{ materia_id: "m-experimento" }] }, // NO vendido → no protege nada
    ],
    materias: [
      { id: "m-matchabase", nombre: "Matcha base", activo: true },
      { id: "m-matchapolvo", nombre: "Matcha polvo", activo: true },
      { id: "m-agua", nombre: "Agua filtrada", activo: true },
      { id: "m-leche", nombre: "Leche fresca", activo: true },
      { id: "m-experimento", nombre: "Cordial de yuzu (prueba)", activo: true }, // huérfana
      { id: "m-vieja", nombre: "Sirope descatalogado", activo: true },            // huérfana
    ],
    recetas: [
      { id: "r-matchabase", nombre: "Matcha base", activo: true, produce_materia_id: "m-matchabase", ingredientes: [{ materia_id: "m-matchapolvo", cantidad: 3 }, { materia_id: "m-agua", cantidad: 200 }] },
      { id: "r-idea", nombre: "Kombucha experimental", activo: true, produce_materia_id: "m-experimento", ingredientes: [{ materia_id: "m-vieja" }] }, // I+D sin uso
    ],
  };
}

console.log("limpieza de producción");

test("mantiene la elaboración y TODOS sus sub-ingredientes (cierre transitivo)", () => {
  const p = L.computar(datos());
  ["m-matchabase", "m-leche", "m-matchapolvo", "m-agua"].forEach((id) => assert.ok(p.keepMat.includes(id), "mantiene " + id));
  assert.ok(p.keepRec.includes("r-matchabase"), "mantiene la receta de la elaboración usada");
});

test("da de baja materias y recetas huérfanas (no las usadas)", () => {
  const p = L.computar(datos());
  assert.deepStrictEqual(p.materiasBaja.sort(), ["m-experimento", "m-vieja"]);
  assert.deepStrictEqual(p.recetasBaja.sort(), ["r-idea"]);
  assert.ok(!p.materiasBaja.includes("m-matchabase"), "nunca da de baja un sub-ingrediente en uso");
});

test("un producto ARCHIVADO (activo:false) no protege sus ingredientes", () => {
  const p = L.computar(datos());
  assert.ok(p.materiasBaja.includes("m-experimento"), "el ingrediente de una bebida archivada cae");
});

test("un producto ACTIVO con PVP 0 (add-on gratis) SÍ protege sus ingredientes", () => {
  const d = datos();
  d.productos.push({ id: "p-leche", nombre: "Leche fresca", precio_venta: 0, activo: true, ingredientes: [{ materia_id: "m-vieja" }] });
  const p = L.computar(d);
  assert.ok(!p.materiasBaja.includes("m-vieja"), "un add-on activo sin PVP mantiene su ingrediente");
});

test("aplicar da de baja REVERSIBLE (activo:false + motivo), no borra", () => {
  const d = datos();
  const st = fakeStore(d);
  const r = L.aplicar(st);
  assert.strictEqual(r.materias, 2);
  assert.strictEqual(r.recetas, 1);
  const exp = d.materias.find((m) => m.id === "m-experimento");
  assert.strictEqual(exp.activo, false);
  assert.ok(exp.archivado_motivo);
  assert.strictEqual(d.materias.length, 6, "no se borra ningún registro");
  const base = d.materias.find((m) => m.id === "m-matchabase");
  assert.notStrictEqual(base.activo, false, "lo usado sigue activo");
});

test("es idempotente por flag", () => {
  const d = datos();
  const st = fakeStore(d);
  L.aplicar(st);
  const r2 = L.aplicar(st);
  assert.strictEqual(r2.ranAny, false);
  assert.ok(d.config.some((c) => c.id === L.FLAG));
});

test("enlace por nombre si la receta no rellenó produce_materia_id", () => {
  const d = datos();
  d.recetas[0].produce_materia_id = ""; // Matcha base sin id, pero mismo nombre que la materia
  const p = L.computar(d);
  assert.ok(p.keepRec.includes("r-matchabase"), "la enlaza por nombre normalizado");
  assert.ok(p.keepMat.includes("m-matchapolvo"), "y mantiene sus ingredientes");
});

if (fallos) { console.error(`\n${fallos} fallo(s) en limpieza-produccion`); process.exit(1); }
console.log("  limpieza-produccion OK");
