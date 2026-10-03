// Procesado automático de facturas: lee el PDF (OCR inyectado), crea/empareja
// artículos, registra variantes de precio y avisa de subidas, y completa datos
// del proveedor. Sin tocar stock. Ejecutar: node tests/factura-procesar.unit.js
const assert = require("assert");
const fpp = require("../backend/factura-procesar");

let fallos = 0;
const PRUEBAS = [];
function test(n, fn) { PRUEBAS.push([n, fn]); }

console.log("procesado automático de facturas");

function fakeStore(seed) {
  const d = JSON.parse(JSON.stringify(seed || {})); const s = {};
  return {
    readAll: (e) => d[e] || (d[e] = []),
    insert: (e, r) => { (d[e] || (d[e] = [])).push(r); return r; },
    update: (e, id, patch) => { const row = (d[e] || []).find((r) => r.id === id); if (row) Object.assign(row, patch); return row; },
    findById: (e, id) => (d[e] || []).find((r) => r.id === id) || null,
    nextId: (p, e) => { s[e] = (s[e] || 0) + 1; return `${p}_${s[e]}`; },
    flush: async () => {}, _d: d,
  };
}

// OCR falso: devuelve las líneas y cabecera que se le configuren.
const ocrFab = (datos) => async () => datos;

const DATOS = {
  proveedor: "Malaga Costa Fruit", proveedor_cif: "B29000001", proveedor_telefono: "952111222",
  proveedor_email: "pedidos@mcf.es", proveedor_direccion: "Mercado Mayoristas, Málaga",
  numero_documento: "4705_Z6", fecha: "2026-09-28", importe_total: 143.93,
  lineas: [
    { descripcion: "Tomate rama kg", cantidad: 10, unidad: "kg", precio_unitario: 2.0, importe: 20 },
    { descripcion: "Aguacate hass", cantidad: 5, unidad: "kg", precio_unitario: 6.0, importe: 30 },
    { descripcion: "Portes", cantidad: 1, unidad: "", precio_unitario: 3, importe: 3 }, // concepto, no artículo
  ],
};

test("lee el PDF, crea artículos de las líneas de producto y completa datos del proveedor", async () => {
  const store = fakeStore({ proveedores: [{ id: "p1", nombre: "Malaga Costa Fruit" }], recepciones: [], compras_productos: [], materias: [], precios_historico: [] });
  const rec = { id: "r1", proveedor_id: "p1", tipo_documento: "factura", numero_documento: "4705_Z6", fecha: "2026-09-28T12:00:00Z", documento_pdf_url: "data:application/pdf;base64,AAAA" };
  store.insert("recepciones", rec);
  const out = await fpp.procesarRecepcion(store, rec, { ocrFn: ocrFab(DATOS) });
  assert.strictEqual(out.ok, true);
  // Portes NO es artículo; Tomate y Aguacate sí.
  const arts = store.readAll("compras_productos");
  assert.strictEqual(arts.length, 2, "arts=" + arts.map((a) => a.nombre).join(","));
  assert.ok(arts.find((a) => /tomate/i.test(a.nombre)));
  assert.ok(arts.every((a) => a.origen === "factura_auto"));
  // La recepción queda marcada como procesada con sus líneas.
  const r = store.findById("recepciones", "r1");
  assert.strictEqual(r.procesada, true);
  assert.strictEqual(r.n_lineas, 3);
  assert.strictEqual(r.n_articulos_creados, 2);
  // Datos del proveedor completados desde el PDF (huecos).
  const prov = store.findById("proveedores", "p1");
  assert.strictEqual(prov.cif, "B29000001");
  assert.strictEqual(prov.telefono, "952111222");
  // No toca stock (no hay materias con disponibilidad).
  assert.strictEqual((store.readAll("materias")).length, 0);
});

test("una segunda factura con precio distinto registra la variante y avisa", async () => {
  const store = fakeStore({ proveedores: [{ id: "p1", nombre: "Malaga Costa Fruit", cif: "B29000001" }], recepciones: [], compras_productos: [], materias: [], precios_historico: [] });
  const r1 = { id: "r1", proveedor_id: "p1", tipo_documento: "factura", numero_documento: "A1", fecha: "2026-08-01T12:00:00Z", documento_pdf_url: "data:application/pdf;base64,AA" };
  const r2 = { id: "r2", proveedor_id: "p1", tipo_documento: "factura", numero_documento: "A2", fecha: "2026-09-01T12:00:00Z", documento_pdf_url: "data:application/pdf;base64,AA" };
  store.insert("recepciones", r1); store.insert("recepciones", r2);
  await fpp.procesarRecepcion(store, r1, { ocrFn: ocrFab({ numero_documento: "A1", fecha: "2026-08-01", lineas: [{ descripcion: "Tomate rama", cantidad: 10, unidad: "kg", precio_unitario: 2.0, importe: 20 }] }) });
  // Precio sube de 2.00 a 2.40 (+20%).
  await fpp.procesarRecepcion(store, r2, { ocrFn: ocrFab({ numero_documento: "A2", fecha: "2026-09-01", lineas: [{ descripcion: "Tomate rama", cantidad: 10, unidad: "kg", precio_unitario: 2.4, importe: 24 }] }) });
  // Un solo artículo (se reutiliza), con el precio actualizado al último.
  const arts = store.readAll("compras_productos");
  assert.strictEqual(arts.length, 1);
  assert.strictEqual(arts[0].precio_sin_iva, 2.4);
  // Variante registrada en el histórico y aviso en la 2ª factura.
  const hist = store.readAll("precios_historico");
  assert.strictEqual(hist.length, 1);
  assert.strictEqual(hist[0].precio_anterior, 2);
  assert.strictEqual(hist[0].precio_nuevo, 2.4);
  assert.strictEqual(hist[0].origen, "factura");
  const r2f = store.findById("recepciones", "r2");
  assert.strictEqual(r2f.avisos_precio.length, 1);
  assert.ok(/\+20%/.test(r2f.avisos_precio[0].mensaje));
});

test("un cambio pequeño (<5%) no genera aviso ni variante", async () => {
  const store = fakeStore({ proveedores: [{ id: "p1", nombre: "X" }], recepciones: [], compras_productos: [], materias: [], precios_historico: [] });
  const r1 = { id: "r1", proveedor_id: "p1", tipo_documento: "factura", numero_documento: "A1", fecha: "2026-08-01T12:00:00Z", documento_pdf_url: "data:application/pdf;base64,AA" };
  const r2 = { id: "r2", proveedor_id: "p1", tipo_documento: "factura", numero_documento: "A2", fecha: "2026-09-01T12:00:00Z", documento_pdf_url: "data:application/pdf;base64,AA" };
  store.insert("recepciones", r1); store.insert("recepciones", r2);
  await fpp.procesarRecepcion(store, r1, { ocrFn: ocrFab({ lineas: [{ descripcion: "Leche entera", cantidad: 1, unidad: "L", precio_unitario: 1.0, importe: 1 }] }) });
  await fpp.procesarRecepcion(store, r2, { ocrFn: ocrFab({ lineas: [{ descripcion: "Leche entera", cantidad: 1, unidad: "L", precio_unitario: 1.02, importe: 1.02 }] }) });
  assert.strictEqual(store.readAll("precios_historico").length, 0);
  assert.strictEqual(store.findById("recepciones", "r2").avisos_precio.length, 0);
});

test("enlaza el food cost: rellena coste_medio de una materia emparejada sin coste (sin pisar los que ya tienen)", async () => {
  const store = fakeStore({
    proveedores: [{ id: "p1", nombre: "X" }], recepciones: [], compras_productos: [], precios_historico: [],
    materias: [
      { id: "m_tomate", nombre: "Tomate rama", unidad: "g", coste_medio: 0, pendiente_coste: true },
      { id: "m_aceite", nombre: "Aceite oliva", unidad: "ml", coste_medio: 0.01 }, // ya tiene coste → no se pisa
    ],
  });
  const rec = { id: "r1", proveedor_id: "p1", tipo_documento: "factura", numero_documento: "F1", fecha: "2026-09-01T12:00:00Z", documento_pdf_url: "data:application/pdf;base64,AA" };
  store.insert("recepciones", rec);
  await fpp.procesarRecepcion(store, rec, { ocrFn: ocrFab({ lineas: [
    { descripcion: "Tomate rama", cantidad: 2, unidad: "kg", precio_unitario: 1.5, importe: 3 },  // 3 € / 2000 g = 0.0015 €/g
    { descripcion: "Aceite oliva", cantidad: 1, unidad: "L", precio_unitario: 9, importe: 9 },
  ] }) });
  const tomate = store.findById("materias", "m_tomate");
  assert.strictEqual(tomate.coste_medio, 0.0015); // 3 / 2000 g
  assert.strictEqual(tomate.pendiente_coste, false);
  const aceite = store.findById("materias", "m_aceite");
  assert.strictEqual(aceite.coste_medio, 0.01); // intacto
});

test("facturasPendientes solo cuenta facturas con PDF sin procesar", () => {
  const store = fakeStore({ recepciones: [
    { id: "a", tipo_documento: "factura", documento_pdf_url: "data:...", procesada: false, lineas: [] },
    { id: "b", tipo_documento: "factura", documento_pdf_url: "data:...", procesada: true },
    { id: "c", tipo_documento: "albaran", documento_pdf_url: "data:..." },
    { id: "d", tipo_documento: "factura" }, // sin PDF
  ] });
  const pend = fpp.facturasPendientes(store);
  assert.deepStrictEqual(pend.map((r) => r.id), ["a"]);
});

test("procesarRecepcion exige ocrFn", async () => {
  let lanzo = false;
  try { await fpp.procesarRecepcion(fakeStore(), { id: "x", documento_pdf_url: "d" }, {}); } catch (e) { lanzo = /ocrFn/.test(e.message); }
  assert.ok(lanzo);
});

(async () => {
  for (const [n, fn] of PRUEBAS) {
    try { await fn(); console.log("  ✓ " + n); }
    catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); }
  }
  if (fallos) { console.error(`\n${fallos} fallo(s) en procesado de facturas`); process.exit(1); }
  console.log("  procesado automático de facturas OK");
})();
