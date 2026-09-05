// Análisis diario · rayos X de venta + compra de un día (datos reales, cero inventos).
// Ejecutar: node tests/analisis-diario.unit.js
const assert = require("assert");
const A = require("../backend/analisis-diario");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

// Datos de prueba mínimos y realistas.
const materias = [
  { id: "mat-cafe", nombre: "Café", coste_medio: 0.02, unidad: "g", macro: "Café" },
];
const productos = [
  // Con coste real (escandallo directo).
  { id: "p-espresso", nombre: "Espresso", categoria: "bebida", precio_venta: 1.8, coste_materia: 0.30, activo: true },
  // Sin coste (no evaluable en margen).
  { id: "p-agua", nombre: "Agua", categoria: "bebida", precio_venta: 1.0, ingredientes: [], activo: true },
  { id: "p-tosta", nombre: "Tosta origen", categoria: "comida", precio_venta: 3.5, coste_materia: 0.99, activo: true },
];
const ventas = [
  // Día objetivo: 2026-09-05 — 2 tickets.
  { id: "v1", producto_id: "p-espresso", producto: "Espresso", cantidad: 3, importe: 5.4, fecha: "2026-09-05T09:00:00Z", fuente: "agora", doc_clave: "T1" },
  { id: "v2", producto_id: "p-tosta", producto: "Tosta origen", cantidad: 1, importe: 3.5, fecha: "2026-09-05T09:05:00Z", fuente: "agora", doc_clave: "T1" },
  { id: "v3", producto_id: "p-agua", producto: "Agua", cantidad: 2, importe: 2.0, fecha: "2026-09-05T13:00:00Z", fuente: "agora", doc_clave: "T2" },
  // Ayer 2026-09-04.
  { id: "v4", producto_id: "p-espresso", producto: "Espresso", cantidad: 2, importe: 3.6, fecha: "2026-09-04T10:00:00Z", fuente: "agora", doc_clave: "T0" },
  // Otro día ajeno.
  { id: "v5", producto_id: "p-espresso", producto: "Espresso", cantidad: 9, importe: 16.2, fecha: "2026-08-01T10:00:00Z", fuente: "agora", doc_clave: "TX" },
];
const proveedores = [{ id: "prov-1", nombre: "Café del Sur" }];
const recepciones = [
  { id: "r1", proveedor_id: "prov-1", fecha: "2026-09-05", importe_total: 48.4, lineas: [{ materia_id: "mat-cafe", descripcion: "Café", cantidad: 2000, importe: 40 }] },
];
const precios_historico = [
  { fecha: "2026-09-05", producto_id: "cp-cafe", proveedor_id: "prov-1", precio_anterior: 0.018, precio_nuevo: 0.02 },
];
const compras_productos = [{ id: "cp-cafe", nombre: "Café en grano" }];
const equilibrio = { disponible: true, ingreso_equilibrio_dia_abierto: 100, ratio_contribucion_pct: 70, base_fija_diaria: 60 };

const datos = { ventas, productos, materias, recepciones, proveedores, compras_productos, precios_historico, equilibrio };

console.log("análisis diario");

test("agrega la venta del día: total, tickets, ticket medio, unidades", () => {
  const r = A.computar(datos, "2026-09-05");
  assert.strictEqual(r.ventas.total, 10.9);           // 5,4 + 3,5 + 2,0
  assert.strictEqual(r.ventas.tickets, 2);            // T1, T2
  assert.strictEqual(r.ventas.unidades, 6);           // 3 + 1 + 2
  assert.strictEqual(r.ventas.ticket_medio, 5.45);    // 10,9 / 2
  assert.strictEqual(r.dia_semana, "sábado");
});

test("margen del día SOLO sobre lo que tiene coste real (honesto)", () => {
  const r = A.computar(datos, "2026-09-05");
  // Coste = espresso 0,30×3 + tosta 0,99×1 = 0,90 + 0,99 = 1,89. Agua no tiene coste.
  assert.strictEqual(r.ventas.coste_materia, 1.89);
  // Venta con coste conocido = 5,4 + 3,5 = 8,9 → margen = 8,9 − 1,89 = 7,01.
  assert.strictEqual(r.ventas.margen_eur, 7.01);
  // Cobertura de coste = 8,9 / 10,9 = 81,65% → 82%.
  assert.strictEqual(r.ventas.cobertura_coste_pct, 82);
  assert.strictEqual(r.ventas.importe_sin_coste, 2.0);   // el agua
  assert.ok(r.ventas.sin_coste.some((x) => x.producto === "Agua"));
});

test("mix por categoría (bebida vs comida)", () => {
  const r = A.computar(datos, "2026-09-05");
  const beb = r.ventas.por_categoria.find((c) => c.categoria === "bebida");
  const com = r.ventas.por_categoria.find((c) => c.categoria === "comida");
  assert.strictEqual(beb.importe, 7.4);   // espresso 5,4 + agua 2,0
  assert.strictEqual(com.importe, 3.5);   // tosta
});

test("comparativa vs ayer y vs mismo día semana pasada", () => {
  const r = A.computar(datos, "2026-09-05");
  // Ayer 2026-09-04 total = 3,6. Delta = (10,9 − 3,6)/3,6 = 202,8%.
  assert.strictEqual(r.comparativa.vs_ayer.total_ref, 3.6);
  assert.ok(r.comparativa.vs_ayer.total > 200);
  // Semana pasada 2026-08-29: sin ventas → total_ref 0, delta null.
  assert.strictEqual(r.comparativa.vs_semana_pasada.total_ref, 0);
  assert.strictEqual(r.comparativa.vs_semana_pasada.total, null);
});

test("compra del día: total, proveedor, cambios de precio", () => {
  const r = A.computar(datos, "2026-09-05");
  assert.strictEqual(r.compras.recepciones, 1);
  assert.strictEqual(r.compras.total, 48.4);
  assert.strictEqual(r.compras.por_proveedor[0].proveedor, "Café del Sur");
  assert.strictEqual(r.compras.cambios_precio.length, 1);
  assert.strictEqual(r.compras.cambios_precio[0].producto, "Café en grano");
  assert.ok(r.compras.cambios_precio[0].variacion_pct > 0);
});

test("rentabilidad: compara con el punto de equilibrio", () => {
  const r = A.computar(datos, "2026-09-05");
  assert.strictEqual(r.rentabilidad.disponible, true);
  assert.strictEqual(r.rentabilidad.ingreso_equilibrio_dia, 100);
  assert.strictEqual(r.rentabilidad.cubierto, false);   // 10,9 < 100
  assert.strictEqual(r.rentabilidad.cobertura_pct, 11);
});

test("alertas: no cubre equilibrio + venta sin coste + producto estrella", () => {
  const r = A.computar(datos, "2026-09-05");
  assert.ok(r.alertas.some((a) => a.severidad === "critico" && /equilibrio/i.test(a.titulo)));
  assert.ok(r.alertas.some((a) => /estrella/i.test(a.titulo)));
  assert.ok(r.alertas[0].severidad === "critico");      // ordenadas por severidad
});

test("día sin ventas → una sola alerta informativa, sin inventar nada", () => {
  const r = A.computar(datos, "2026-01-01");
  assert.strictEqual(r.ventas.total, 0);
  assert.strictEqual(r.ventas.tickets, 0);
  assert.strictEqual(r.alertas.length, 1);
  assert.ok(/sin ventas/i.test(r.alertas[0].titulo));
});

test("restarDias y nombreDia son correctos (sin desfase de zona)", () => {
  assert.strictEqual(A.restarDias("2026-09-05", 1), "2026-09-04");
  assert.strictEqual(A.restarDias("2026-09-05", 7), "2026-08-29");
  assert.strictEqual(A.nombreDia("2026-09-05"), "sábado");
});

if (fallos) { console.error(`\n${fallos} fallo(s) en analisis-diario`); process.exit(1); }
console.log("  analisis-diario OK");
