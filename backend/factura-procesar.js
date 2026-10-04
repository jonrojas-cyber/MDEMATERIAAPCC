// PROCESADO AUTOMÁTICO DE FACTURAS (sin botones)
// ─────────────────────────────────────────────────────────────────────────────
// Cuando una factura entra con su PDF adjunto (paquete/correo), el servidor la
// LEE sola: extrae las líneas del PDF, empareja/crea los artículos de compra con
// su precio, registra las VARIANTES DE PRECIO en el histórico y AVISA de subidas,
// y completa los datos del proveedor (CIF, teléfono, email, dirección) si faltan.
//
// No toca stock (una factura no da de alta mercancía; eso es el albarán). Deja
// `procesada:true` para no repetir. El procesado corre en segundo plano, encolado
// (una factura cada vez, con pausa), y se dispara solo al importar y al abrir la
// lista de recepciones o la ficha de un proveedor.

const storeDefault = require("./data-store");
const intake = require("./albaran-intake");
const { calcular } = require("./compras-productos-calc");
const { convertir } = require("./unidades");

function r4(n) { return Math.round((Number(n) || 0) * 10000) / 10000; }

// Facturas que faltan por leer: tienen PDF, no están procesadas y aún no tienen
// líneas extraídas.
function facturasPendientes(store) {
  return (store.readAll("recepciones") || []).filter((r) =>
    r.documento_pdf_url && !r.procesada && (r.tipo_documento || "albaran") === "factura" && !(r.lineas && r.lineas.length));
}

// Lee UNA factura y vuelca el resultado en la recepción. `ocrFn` inyectable.
async function procesarRecepcion(store, rec, opts = {}) {
  const ocrFn = opts.ocrFn;
  if (typeof ocrFn !== "function") throw new Error("procesarRecepcion necesita opts.ocrFn");
  if (!rec || !rec.documento_pdf_url) return { saltada: true };

  const uri = String(rec.documento_pdf_url);
  const base64 = uri.includes(",") ? uri.split(",").slice(1).join(",") : uri;
  const datos = await ocrFn({ base64, mediaType: "application/pdf", filename: rec.archivo_original || "factura.pdf" });
  if (!datos) throw new Error("lectura vacía del PDF");

  // Completar datos del proveedor SOLO en los huecos (nunca pisa lo que ya hay).
  if (rec.proveedor_id) {
    const prov = store.findById("proveedores", rec.proveedor_id);
    if (prov) {
      const patch = {};
      const rellena = (k, v) => { if (v && !String(prov[k] == null ? "" : prov[k]).trim()) patch[k] = String(v).trim(); };
      rellena("cif", datos.proveedor_cif);
      rellena("telefono", datos.proveedor_telefono);
      rellena("whatsapp", datos.proveedor_telefono);
      rellena("email", datos.proveedor_email);
      rellena("direccion", datos.proveedor_direccion);
      if (Object.keys(patch).length) { patch.datos_completados_factura = true; store.update("proveedores", prov.id, patch); }
    }
  }

  const materias = store.readAll("materias") || [];
  const articulos = (store.readAll("compras_productos") || []).filter((a) => a.proveedor_id === rec.proveedor_id);
  const avisos = [];

  const lineas = (datos.lineas || []).map((l) => {
    const desc = String(l.descripcion || "").trim();
    const cant = Number(l.cantidad) || 0;
    const imp = Number(l.importe) || 0;
    const observed = Number(l.precio_unitario) > 0 ? Number(l.precio_unitario) : (cant > 0 && imp > 0 ? imp / cant : 0);

    const materia = intake.mejorPorPalabras(desc, materias); // empareja, no crea (stock es Fase 2)
    let art = intake.mejorPorPalabras(desc, articulos);
    let creado = false;

    // Enlaza el FOOD COST desde la factura: si la materia emparejada aún no tiene
    // coste (pendiente), lo fija con esta compra (€ por unidad de consumo), solo
    // si la unidad se puede convertir con seguridad. Nunca pisa un coste ya puesto.
    if (materia && !(Number(materia.coste_medio) > 0) && imp > 0) {
      const conv = convertir(cant, l.unidad, materia);
      if (conv && conv.ok && conv.cantidad > 0) {
        const costeUnit = r4(imp / conv.cantidad);
        if (costeUnit > 0) { store.update("materias", materia.id, { coste_medio: costeUnit, pendiente_coste: false }); materia.coste_medio = costeUnit; }
      }
    }

    if (observed > 0 && intake.esLineaProducto(desc)) {
      if (art) {
        const prev = Number(art.precio_sin_iva) || 0;
        if (prev > 0 && Math.abs(observed - prev) / prev >= 0.05) {
          // Variante de precio: al histórico + aviso + actualiza el precio del artículo.
          store.insert("precios_historico", {
            id: store.nextId("ph", "precios_historico"),
            producto_id: art.id, proveedor_id: rec.proveedor_id || null,
            fecha: rec.fecha || new Date().toISOString(),
            precio_anterior: r4(prev), precio_nuevo: r4(observed),
            motivo: "Factura " + (rec.numero_documento || ""), responsable: "Lectura automática",
            origen: "factura", recepcion_id: rec.id,
          });
          store.update("compras_productos", art.id, calcular({ ...art, precio_sin_iva: r4(observed) }));
          const dif = Math.round(((observed - prev) / prev) * 100);
          avisos.push({ articulo: art.nombre, anterior: r4(prev), nuevo: r4(observed), dif_pct: dif,
            mensaje: `${art.nombre}: ${prev.toFixed(4)} € → ${observed.toFixed(4)} € (${dif > 0 ? "+" : ""}${dif}%)` });
          art = { ...art, precio_sin_iva: r4(observed) };
        }
      } else {
        // Artículo nuevo visto en una factura: se crea (origen factura_auto) para
        // revisar la tarifa. No inventa IVA fino: usa 10% (hostelería) por defecto.
        const nuevo = calcular({
          id: store.nextId("cpr", "compras_productos"),
          proveedor_id: rec.proveedor_id || null, nombre: desc, categoria: "Otros",
          formato: l.unidad || "unidad", cantidad_formato: 1, precio_sin_iva: r4(observed), iva: 10,
          materia_id: materia ? materia.id : null, contenido_base: 0, alergenos: [],
          origen: "factura_auto", creado_en: new Date().toISOString(),
        });
        store.insert("compras_productos", nuevo);
        articulos.push(nuevo);
        art = nuevo; creado = true;
      }
    }

    return {
      descripcion: desc, cantidad_albaran: cant, unidad_detectada: l.unidad || null, cantidad: cant,
      precio_unitario: r4(observed), importe: r4(imp),
      materia_id: materia ? materia.id : null, articulo_id: art ? art.id : null, articulo_creado: creado,
    };
  });

  store.update("recepciones", rec.id, {
    lineas, avisos_precio: avisos, procesada: true, procesada_en: new Date().toISOString(),
    n_lineas: lineas.length, n_articulos_creados: lineas.filter((x) => x.articulo_creado).length,
  });
  return { ok: true, lineas: lineas.length, avisos: avisos.length, articulos_creados: lineas.filter((x) => x.articulo_creado).length };
}

// Cola en segundo plano: procesa las facturas pendientes de una en una, con pausa,
// hasta vaciarlas. Idempotente y no reentrante (un solo bucle a la vez).
let _corriendo = false;
const CONCURRENCIA = 4; // lee varias facturas a la vez (lectura casi instantánea)
function programar(store, ocrFn) {
  store = store || storeDefault;
  let fn = ocrFn;
  if (!fn) { try { const ocr = require("./ocr"); if (!ocr.disponible()) return; fn = ocr.extraerDesdeAdjunto; } catch (e) { return; } }
  if (_corriendo) return;
  _corriendo = true;
  (async () => {
    try {
      // Lee TODAS las facturas pendientes, en tandas paralelas, sin pausas.
      /* eslint-disable no-constant-condition */
      while (true) {
        const pend = facturasPendientes(store);
        if (!pend.length) break;
        const tanda = pend.slice(0, CONCURRENCIA);
        await Promise.all(tanda.map(async (rec) => {
          try { await procesarRecepcion(store, rec, { ocrFn: fn }); }
          catch (e) { store.update("recepciones", rec.id, { procesada: true, proceso_error: e.message || String(e), procesada_en: new Date().toISOString() }); }
        }));
        if (typeof store.flush === "function") { try { await store.flush(); } catch (e) {} }
      }
      // Al terminar de leer, vuelca los precios de compra al coste de las materias
      // (food cost al día) automáticamente, sin abrir nada.
      try { const r = require("./coste-desde-compras").aplicar(store); if (r.fijados && typeof store.flush === "function") await store.flush(); } catch (e) {}
    } catch (e) { /* no-op */ } finally { _corriendo = false; }
  })();
}

module.exports = { procesarRecepcion, facturasPendientes, programar };
