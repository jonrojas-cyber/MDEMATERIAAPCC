// Dossier para asesoría: reúne escandallo + ventas + equilibrio + fijos + créditos
// en un objeto y su Markdown, usando el coste REAL (nunca inventa).
// Ejecutar: node tests/dossier.unit.js
const assert = require("assert");
const D = require("../backend/dossier");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

const materias = [{ id: "mat-cafe", nombre: "Café", coste_medio: 0.02, unidad: "g" }];
const productos = [
  { id: "p-esp", nombre: "Espresso", categoria: "bebida", precio_venta: 1.8, coste_materia: 0.30, activo: true },
  { id: "p-tosta", nombre: "Tosta equilibrio", categoria: "comida", precio_venta: 4.8, coste_materia: 1.20, activo: true },
  { id: "p-agua", nombre: "Agua", categoria: "bebida", precio_venta: 1.0, ingredientes: [], activo: true }, // sin coste
];
const ventas = [
  { id: "v1", producto_id: "p-esp", producto: "Espresso", cantidad: 10, importe: 18, fecha: "2026-09-05T09:00:00Z", fuente: "agora", doc_clave: "T1" },
  { id: "v2", producto_id: "p-tosta", producto: "Tosta equilibrio", cantidad: 5, importe: 24, fecha: "2026-09-05T09:00:00Z", fuente: "agora", doc_clave: "T1" },
  { id: "v3", producto_id: "p-agua", producto: "Agua", cantidad: 4, importe: 4, fecha: "2026-09-05T13:00:00Z", fuente: "agora", doc_clave: "T2" },
  { id: "vX", producto_id: "p-esp", producto: "Espresso", cantidad: 99, importe: 178, fecha: "2020-01-01T09:00:00Z", fuente: "agora", doc_clave: "TX" }, // fuera de rango
];
const base = {
  productos, materias, ventas, recepciones: [], proveedores: [],
  desde: "2026-09-01", hasta: "2026-09-30",
  contribucion: { ratio_contribucion_pct: 68, food_cost_medio_pct: 0.32, por_categoria: [] },
  equilibrio: { disponible: true, base_fija_diaria: 200, ratio_contribucion_pct: 68, ingreso_equilibrio_dia_abierto: 320, ingreso_equilibrio_mes: 8000, ingreso_equilibrio_con_creditos_mes: 9000, margen_seguridad_pct: 12, en_perdidas: false },
  fijos: { mensual: 6140.5, diario: 201.8 }, fijosPorCat: [{ label: "Personal", value: 5000 }],
  creditos: { cuota_mensual_total: 708.03, deuda_total: 56351.24, num_deudas: 2 },
  negocio: { nombre: "m de materia" },
};

console.log("dossier para asesoría");

test("agrega ventas del rango y excluye lo de fuera", () => {
  const d = D.computar(base);
  assert.strictEqual(d.ventas.total, 46);       // 18 + 24 + 4 (no el de 2020)
  assert.strictEqual(d.ventas.tickets, 2);
  assert.ok(d.ventas.por_producto.find((p) => p.producto === "Espresso"));
});

test("cruza el escandallo REAL: beneficio y margen solo donde hay coste", () => {
  const d = D.computar(base);
  const esp = d.ventas.por_producto.find((p) => p.producto === "Espresso");
  assert.strictEqual(esp.coste, 3);             // 0,30 × 10
  assert.strictEqual(esp.beneficio, 15);        // 18 − 3
  const agua = d.ventas.por_producto.find((p) => p.producto === "Agua");
  assert.strictEqual(agua.coste, null);         // sin coste → no inventa
  assert.strictEqual(agua.margen_pct, null);
});

test("carta_escandallo lista todos los activos y marca los sin coste", () => {
  const d = D.computar(base);
  assert.strictEqual(d.carta_escandallo.length, 3);
  assert.deepStrictEqual(d.productos_sin_coste, ["Agua"]);
  const tosta = d.carta_escandallo.find((c) => c.producto === "Tosta equilibrio");
  assert.ok(tosta.tiene_coste && tosta.margen_pct > 0);
});

test("markdown incluye el prompt, el escandallo y el equilibrio", () => {
  const d = D.computar(base);
  const md = D.markdown(d);
  assert.ok(md.includes("PROMPT"));
  assert.ok(md.includes("ESCANDALLO"));
  assert.ok(md.includes("PUNTO DE EQUILIBRIO"));
  assert.ok(md.includes("Tosta equilibrio"));
  assert.ok(md.includes("pend."));            // Agua sin coste aparece como pend.
  assert.ok(md.includes("m de materia"));
});

test("no rompe sin equilibrio/fijos/créditos (secciones opcionales)", () => {
  const d = D.computar({ ...base, equilibrio: null, fijos: null, creditos: null, contribucion: null });
  const md = D.markdown(d);
  assert.ok(md.includes("VENTAS"));
  assert.ok(!md.includes("PUNTO DE EQUILIBRIO"));
});

if (fallos) { console.error(`\n${fallos} fallo(s) en dossier`); process.exit(1); }
console.log("  dossier OK");
