// Mermas · analítica. Ejecutar: node tests/mermas-analytics.unit.js
const assert = require("assert");
const A = require("../backend/mermas-analytics");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("mermas · analítica");

test("vacío → ceros y sin anomalías", () => {
  const a = A.analizar([], {});
  assert.strictEqual(a.total, 0);
  assert.strictEqual(a.n, 0);
  assert.deepStrictEqual(a.anomalias, []);
  assert.deepStrictEqual(a.top_productos, []);
});

test("agrega por motivo/grupo, evitable % y top productos ordenados por €", () => {
  const recs = [
    { objetivo_nombre: "Jamón", coste_estimado: 20, motivo: "Caducado", grupo: "caducidad", cantidad: 300, unidad: "g", fecha: "2026-10-01T10:00:00Z" },
    { objetivo_nombre: "Jamón", coste_estimado: 4, motivo: "Caducado", grupo: "caducidad", cantidad: 60, unidad: "g", fecha: "2026-10-02T10:00:00Z" },
    { objetivo_nombre: "Croissant", coste_estimado: 2, motivo: "Caído al suelo", grupo: "accidente", cantidad: 1, unidad: "ud", fecha: "2026-10-02T11:00:00Z" },
  ];
  const a = A.analizar(recs, {});
  assert.strictEqual(a.total, 26);
  assert.strictEqual(a.n, 3);
  assert.strictEqual(a.por_grupo["caducidad"], 24);
  assert.strictEqual(a.por_grupo["accidente"], 2);
  assert.strictEqual(a.evitable_eur, 2);              // solo accidente es evitable
  assert.strictEqual(a.evitable_pct, Math.round((2 / 26) * 100));
  assert.strictEqual(a.top_productos[0].producto, "Jamón");
  assert.strictEqual(a.top_productos[0].eur, 24);
  assert.strictEqual(a.top_productos[0].veces, 2);
  assert.strictEqual(a.serie_diaria.length, 2);       // 01 y 02 de octubre
});

test("anomalía CONCENTRACIÓN: un producto acapara >35% del coste", () => {
  const recs = [
    { objetivo_nombre: "Jamón", coste_estimado: 20, motivo: "Caducado", grupo: "caducidad", fecha: "2026-10-01T10:00:00Z" },
    { objetivo_nombre: "Pan", coste_estimado: 3, motivo: "Mal estado", grupo: "calidad", fecha: "2026-10-01T11:00:00Z" },
  ];
  const a = A.analizar(recs, {});
  assert.ok(a.anomalias.some((x) => x.tipo === "concentracion"), "debe detectar concentración");
});

test("anomalía REPETICIÓN: mismo producto mermado 4+ veces", () => {
  const recs = [];
  for (let i = 0; i < 4; i++) recs.push({ objetivo_nombre: "Croissant", coste_estimado: 1, motivo: "Caído al suelo", grupo: "accidente", fecha: "2026-10-0" + (i + 1) + "T10:00:00Z" });
  const a = A.analizar(recs, {});
  assert.ok(a.anomalias.some((x) => x.tipo === "repeticion"), "debe detectar repetición");
});

test("anomalía EVITABLE: >50% del coste es evitable", () => {
  const recs = [
    { objetivo_nombre: "A", coste_estimado: 6, motivo: "Mal elaborado", grupo: "elaboración", fecha: "2026-10-01T10:00:00Z" },
    { objetivo_nombre: "B", coste_estimado: 6, motivo: "Caído al suelo", grupo: "accidente", fecha: "2026-10-02T10:00:00Z" },
    { objetivo_nombre: "C", coste_estimado: 2, motivo: "Caducado", grupo: "caducidad", fecha: "2026-10-03T10:00:00Z" },
  ];
  const a = A.analizar(recs, {});
  assert.ok(a.evitable_pct >= 50);
  assert.ok(a.anomalias.some((x) => x.tipo === "evitable"), "debe avisar de evitable alto");
});

if (fallos) { console.error(`\n${fallos} fallo(s) en mermas analítica`); process.exit(1); }
console.log("  mermas analítica OK");
