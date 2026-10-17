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
  assert.strictEqual(esp.coste, 3);             // 0,30 × 10 (coste neto)
  // Beneficio sobre venta NETA (E5): sin importe_neto en la venta, neto = 18/1,10 = 16,36.
  assert.strictEqual(esp.beneficio, 13.36);     // 16,36 neto − 3
  const agua = d.ventas.por_producto.find((p) => p.producto === "Agua");
  assert.strictEqual(agua.coste, null);         // sin coste → no inventa
  assert.strictEqual(agua.margen_pct, null);
});

test("E5 · margen neto/neto con IVA mixto (coste neto contra venta NETA, no bruta)", () => {
  // Fixture IVA mixto (doc 03): importe=BRUTO, importe_neto=NETO (Base de Ágora).
  const productosMix = [
    { id: "p-cafe", nombre: "Café", categoria: "Cafes", precio_venta: 2.2, coste_materia: 0.44, activo: true },
    { id: "p-sand", nombre: "Sándwich", categoria: "comida", precio_venta: 6.6, coste_materia: 2.0, activo: true },
    { id: "p-bolsa", nombre: "Bolsa 250g", categoria: "retail", precio_venta: 12.1, coste_materia: 5.0, activo: true },
  ];
  const ventasMix = [
    { id: "a", producto_id: "p-cafe", producto: "Café", cantidad: 5000, importe: 11000, importe_neto: 10000, fecha: "2026-09-10T09:00:00Z", fuente: "agora", doc_clave: "T1" },
    { id: "b", producto_id: "p-sand", producto: "Sándwich", cantidad: 1000, importe: 6600, importe_neto: 6000, fecha: "2026-09-10T09:00:00Z", fuente: "agora", doc_clave: "T2" },
    { id: "c", producto_id: "p-bolsa", producto: "Bolsa 250g", cantidad: 200, importe: 2420, importe_neto: 2000, iva: 0.21, fecha: "2026-09-10T09:00:00Z", fuente: "agora", doc_clave: "T3" },
  ];
  const d = D.computar({ ...base, productos: productosMix, ventas: ventasMix });
  assert.strictEqual(d.ventas.total, 20020);     // titular BRUTO intacto
  // Margen agregado NETO/NETO: (18.000 − 5.200)/18.000 = 71% (el bug bruto daba 74%).
  assert.strictEqual(d.ventas.margen_eur, 12800); // 18.000 neto − 5.200 coste (el bug daba 14.820)
  assert.strictEqual(d.ventas.margen_pct, 71);
  const bolsa = d.ventas.por_producto.find((p) => /bolsa/i.test(p.producto));
  assert.strictEqual(bolsa.margen_pct, 50);       // 2.000 neto − 1.000 (el bug bruto daba 59%)
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
