// Conciliación de almacén: resumen/valor, compra vs consumo, desviación del
// último conteo, productos sin escandallo y escandallos afectados por subidas.
// Ejecutar: node tests/conciliacion.unit.js
const assert = require("assert");
const con = require("../backend/conciliacion");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("conciliación de almacén");

function fakeStore(seed) {
  const d = JSON.parse(JSON.stringify(seed || {}));
  return { readAll: (e) => d[e] || (d[e] = []), findById: (e, id) => (d[e] || []).find((r) => r.id === id) || null };
}

const STORE = fakeStore({
  materias: [
    { id: "m_tomate", nombre: "Tomate", unidad: "g", coste_medio: 0.002, disponibilidad_actual: 5000, stock_minimo: 1000 },
    { id: "m_leche", nombre: "Leche", unidad: "ml", coste_medio: 0.001, disponibilidad_actual: 200, stock_minimo: 1000 }, // bajo mínimo
    { id: "m_cafe", nombre: "Café", unidad: "g", coste_medio: 0, disponibilidad_actual: 3000, stock_minimo: 0 }, // sin coste
  ],
  recepciones: [
    { id: "r1", fecha: "2026-09-10T12:00:00Z", lineas: [{ materia_id: "m_tomate", cantidad: 10000 }, { materia_id: "m_leche", cantidad: 2000 }] },
    { id: "r2", fecha: "2020-01-01T12:00:00Z", lineas: [{ materia_id: "m_tomate", cantidad: 99999 }] }, // fuera de ventana
  ],
  stock_movements: [
    { reason: "venta", materia_id: "m_tomate", delta: -3000, created_at: "2026-09-12T10:00:00Z" },
    { reason: "venta", materia_id: "m_leche", delta: -500, created_at: "2026-09-13T10:00:00Z" },
    { reason: "inventario", materia_id: "m_tomate", delta: -100, created_at: "2026-09-14T10:00:00Z" }, // no cuenta como consumo
  ],
  productos: [
    { id: "p_latte", nombre: "Latte", ingredientes: [{ materia_id: "m_leche", cantidad: 200 }] }, // con escandallo
    { id: "p_tostada", nombre: "Tostada", ingredientes: [] }, // SIN escandallo
    { id: "p_cafe", nombre: "Café solo", coste_materia: 0.15 }, // coste directo → no "sin escandallo"
  ],
  ventas: [
    { producto_id: "p_latte", cantidad: 10, fecha: "2026-09-12" },
    { producto_id: "p_tostada", cantidad: 7, fecha: "2026-09-12" },
    { producto_id: "p_cafe", cantidad: 20, fecha: "2026-09-12" },
  ],
  recetas: [
    { id: "rec_salsa", nombre: "Salsa M", produce_materia_id: "m_salsa", resultado_base: 1000, ingredientes: [{ materia_id: "m_tomate", cantidad: 800 }] },
  ],
  precios_historico: [
    { id: "h1", producto_id: "m_tomate", origen: "recepcion", precio_anterior: 0.0018, precio_nuevo: 0.0024, fecha: "2026-09-10" }, // +33%
    { id: "h2", producto_id: "m_leche", origen: "recepcion", precio_anterior: 0.001, precio_nuevo: 0.00102, fecha: "2026-09-10" }, // +2% (bajo umbral)
  ],
  inventarios: [
    { id: "inv1", fecha: "2026-08-01", responsable: "Moni", total_lineas: 2, lineas_con_descuadre: 1, descuadre_eur: -5, merma_oculta_eur: -5, lineas: [{ materia_id: "m_tomate", diferencia: -50, valor_diferencia: -5 }, { materia_id: "m_leche", diferencia: 0, valor_diferencia: 0 }] },
    { id: "inv2", fecha: "2026-09-15", responsable: "Moni", total_lineas: 2, lineas_con_descuadre: 1, descuadre_eur: -12.5, merma_oculta_eur: -12.5, lineas: [{ materia_id: "m_leche", nombre: "Leche", diferencia: -120, valor_diferencia: -12.5 }] },
  ],
});

test("resumen de almacén: valor teórico y avisos de mínimo / sin coste", () => {
  const r = con.resumenAlmacen(STORE);
  // valor = 5000*0.002 + 200*0.001 + 3000*0 = 10 + 0.2 = 10.2
  assert.strictEqual(r.valor_total, 10.2);
  assert.strictEqual(r.n_bajo_minimo, 1);           // leche
  assert.ok(r.bajo_minimo.find((i) => i.materia_id === "m_leche"));
  assert.strictEqual(r.n_sin_coste, 1);             // café
});

test("compra vs consumo del periodo (ignora lo fuera de ventana y los no-venta)", () => {
  const r = con.compraVsConsumo(STORE, "2026-01-01", "2026-12-31");
  const tomate = r.lineas.find((l) => l.materia_id === "m_tomate");
  assert.strictEqual(tomate.comprado, 10000);   // r2 (2020) excluida
  assert.strictEqual(tomate.consumido, 3000);   // el movimiento "inventario" no cuenta
  assert.strictEqual(tomate.neto, 7000);
  const leche = r.lineas.find((l) => l.materia_id === "m_leche");
  assert.strictEqual(leche.comprado, 2000);
  assert.strictEqual(leche.consumido, 500);
});

test("una FACTURA no cuenta como 'comprado' (solo albaranes mueven stock)", () => {
  const st = fakeStore({
    materias: [{ id: "m_malico", nombre: "Ácido málico", unidad: "g", coste_medio: 0.01 }],
    recepciones: [
      { id: "fa", proveedor_id: "p", tipo_documento: "factura", fecha: "2026-09-10T12:00:00Z", lineas: [{ materia_id: "m_malico", cantidad: 9 }] },
      { id: "al", proveedor_id: "p", tipo_documento: "albaran", fecha: "2026-09-11T12:00:00Z", lineas: [{ materia_id: "m_malico", cantidad: 500 }] },
    ],
    stock_movements: [], productos: [], ventas: [], recetas: [], precios_historico: [], inventarios: [],
  });
  const r = con.compraVsConsumo(st, "2026-01-01", "2026-12-31");
  const l = r.lineas.find((x) => x.materia_id === "m_malico");
  assert.strictEqual(l.comprado, 500); // la factura (9) NO suma; solo el albarán (500)
});

test("desviación: coge el ÚLTIMO recuento y sus peores líneas", () => {
  const d = con.desviacionUltimoInventario(STORE);
  assert.strictEqual(d.id, "inv2");
  assert.strictEqual(d.descuadre_eur, -12.5);
  assert.strictEqual(d.peores[0].materia_id, "m_leche");
});

test("productos vendidos SIN escandallo (causa de descuadre)", () => {
  const r = con.productosSinEscandallo(STORE, "2026-01-01", "2026-12-31");
  // Latte tiene escandallo; Café tiene coste directo; solo Tostada queda.
  assert.strictEqual(r.n, 1);
  assert.strictEqual(r.lista[0].nombre, "Tostada");
  assert.strictEqual(r.lista[0].unidades, 7);
});

test("escandallos afectados: la subida del tomate (+33%) marca Salsa M; la leche (+2%) no", () => {
  const r = con.escandallosAfectados(STORE, "2026-01-01", "2026-12-31", 5);
  assert.strictEqual(r.n, 1);
  assert.strictEqual(r.lista[0].nombre, "Salsa M");
  assert.strictEqual(r.lista[0].culpables[0].ingrediente, "Tomate");
  assert.strictEqual(r.lista[0].culpables[0].pct, 33);
});

test("informe completo trae todas las secciones", () => {
  const inf = con.informe(STORE, { desde: "2026-01-01", hasta: "2026-12-31" });
  assert.ok(inf.resumen && inf.compra_consumo && inf.desviacion && inf.sin_escandallo && inf.escandallos_afectados);
  assert.strictEqual(inf.periodo.desde, "2026-01-01");
});

if (fallos) { console.error(`\n${fallos} fallo(s) en conciliación`); process.exit(1); }
console.log("  conciliación de almacén OK");
