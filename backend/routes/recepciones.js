const express = require("express");
const store = require("../data-store");
const ocr = require("../ocr");

const router = express.Router();

// Cuerpo grande para la imagen del albarán (base64).
const jsonGrande = express.json({ limit: "12mb" });

// Versión ligera (sin las fotos en base64) para listados.
function slim(r) {
  const { foto_albaran_url, foto_producto_url, ...resto } = r;
  return { ...resto, tiene_foto: !!foto_albaran_url, tiene_foto_producto: !!foto_producto_url };
}

// Respaldo de emparejado línea↔materia por solapamiento de palabras (cuando la
// IA no asignó materia). Ignora unidades/palabras de relleno y exige al menos
// una palabra significativa en común.
const STOP = new Set([
  "de","la","el","los","las","con","sin","para","por","kg","kgs","gr","grs","g",
  "l","lt","lts","ml","ud","uds","unidad","unidades","caja","cajas","bote","botes",
  "lata","latas","bolsa","bolsas","pack","palet","bandeja","bandejas","x","und","u",
]);
function palabrasClave(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/[^a-z0-9ñ ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
}
function mejorMateriaPorPalabras(descripcion, materias) {
  const toks = new Set(palabrasClave(descripcion));
  if (!toks.size) return null;
  let mejor = null, mejorScore = 0;
  for (const m of materias) {
    const mt = palabrasClave(m.nombre);
    if (!mt.length) continue;
    let score = 0;
    for (const w of mt) if (toks.has(w)) score += 1;
    // Normaliza un poco por longitud para no premiar nombres muy largos.
    const ratio = score / mt.length;
    const puntos = score + ratio;
    if (score >= 1 && puntos > mejorScore) { mejorScore = puntos; mejor = m; }
  }
  return mejor;
}

router.get("/", (req, res) => {
  res.json(store.readAll("recepciones").map(slim));
});

router.get("/ocr-estado", (req, res) => {
  res.json({ disponible: ocr.disponible() });
});

// Trimestre (año + 1-4) a partir de una fecha.
function trimestreDe(fecha) {
  const d = new Date(fecha);
  return { year: d.getFullYear(), q: Math.floor(d.getMonth() / 3) + 1 };
}
const RANGOS = { 1: "Ene–Mar", 2: "Abr–Jun", 3: "Jul–Sep", 4: "Oct–Dic" };

// Archivo de albaranes agrupado por trimestre (resumen para la gestoría).
router.get("/trimestres", (req, res) => {
  const grupos = {};
  store.readAll("recepciones").forEach((r) => {
    const { year, q } = trimestreDe(r.fecha);
    const key = `${year}-T${q}`;
    if (!grupos[key]) grupos[key] = { year, q, key, label: `T${q} ${year}`, rango: RANGOS[q], count: 0, total: 0, con_foto: 0 };
    grupos[key].count += 1;
    grupos[key].total += r.importe_total || 0;
    if (r.foto_albaran_url) grupos[key].con_foto += 1;
  });
  res.json(
    Object.values(grupos)
      .map((g) => ({ ...g, total: Math.round(g.total * 100) / 100 }))
      .sort((a, b) => b.year - a.year || b.q - a.q)
  );
});

// PDF de un trimestre: portada con resumen + una página por albarán fotografiado.
router.get("/trimestre/:year/:q/pdf", async (req, res) => {
  const year = Number(req.params.year), q = Number(req.params.q);
  const proveedores = store.readAll("proveedores");
  const nombre = (id) => { const p = proveedores.find((x) => x.id === id); return p ? p.nombre : id; };
  const recs = store
    .readAll("recepciones")
    .filter((r) => { const t = trimestreDe(r.fecha); return t.year === year && t.q === q; })
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
    .map((r) => ({ ...r, proveedor_nombre: nombre(r.proveedor_id) }));
  if (!recs.length) return res.status(404).json({ error: "Sin albaranes en ese trimestre" });
  const total = Math.round(recs.reduce((s, r) => s + (r.importe_total || 0), 0) * 100) / 100;
  try {
    const buf = await require("../pdf").albaranesTrimestreBuffer(recs, { label: `T${q} ${year}`, rango: RANGOS[q] || "", total });
    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `inline; filename="albaranes-${year}-T${q}.pdf"`);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Documento digital del albarán: recepción completa (con foto y líneas) + proveedor.
// (Va después de las rutas concretas para no capturar "/ocr-estado".)
router.get("/:id", (req, res) => {
  const r = store.findById("recepciones", req.params.id);
  if (!r) return res.status(404).json({ error: "Recepción no encontrada" });
  const proveedor = store.findById("proveedores", r.proveedor_id);
  res.json({ ...r, proveedor_nombre: proveedor ? proveedor.nombre : r.proveedor_id });
});

// Escanea un albarán: recibe la imagen y devuelve los datos extraídos (sin guardar).
// El usuario los confirma y luego llama a POST / para registrar la recepción.
router.post("/escanear", jsonGrande, async (req, res) => {
  const { imagen, media_type } = req.body || {};
  if (!imagen) return res.status(400).json({ error: "Envía la imagen del albarán (base64)" });
  const base64 = String(imagen).replace(/^data:[^,]+,/, ""); // admite data URL

  try {
    const materias = store.readAll("materias");
    // El OCR solo LEE el albarán (no se le carga con el catálogo, para no
    // empeorar la lectura). El emparejado con la materia se hace aquí.
    const datos = await ocr.extraerAlbaran(base64, media_type);

    // Intentar emparejar el proveedor por nombre con los existentes.
    const proveedores = store.readAll("proveedores");
    const norm = (s) => String(s || "").toLowerCase().trim();
    const match = proveedores.find((p) => norm(p.nombre) && norm(datos.proveedor).includes(norm(p.nombre)));

    // Productos de compra de ese proveedor (para comparar precio con el pactado).
    const provId = match ? match.id : null;
    const comprasProd = provId
      ? store.readAll("compras_productos").filter((p) => p.proveedor_id === provId)
      : [];

    // Emparejar cada línea con una materia del almacén por solapamiento de
    // palabras (más listo que "contiene"): "Tomate triturado lata" ↔ "Tomate trabajado M".
    const avisos_precio = [];
    const lineas = (datos.lineas || []).map((l) => {
      const m = mejorMateriaPorPalabras(l.descripcion, materias);
      const linea = {
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
        importe: l.importe,
        materia_id: m ? m.id : null,
        materia_unidad: m ? m.unidad : null,
      };
      // Comparación con el precio pactado del producto de compra (si lo hay).
      const cp = mejorMateriaPorPalabras(l.descripcion, comprasProd);
      const recibido = Number(l.precio_unitario);
      if (cp && Number.isFinite(recibido) && recibido > 0) {
        const cant = Number(cp.cantidad_formato) || 1;
        const pactadoUnit = cant > 0 ? Number(cp.precio_sin_iva) / cant : Number(cp.precio_sin_iva);
        if (pactadoUnit > 0) {
          const dif = (recibido - pactadoUnit) / pactadoUnit;
          if (Math.abs(dif) >= 0.05) {
            linea.precio_pactado = Math.round(pactadoUnit * 10000) / 10000;
            linea.precio_alerta = true;
            linea.precio_dif_pct = Math.round(dif * 100);
            avisos_precio.push({
              producto: cp.nombre,
              recibido: Math.round(recibido * 10000) / 10000,
              pactado: linea.precio_pactado,
              dif_pct: linea.precio_dif_pct,
              mensaje: `${cp.nombre}: recibido ${recibido.toFixed(4)} € vs pactado ${linea.precio_pactado.toFixed(4)} € (${dif > 0 ? "+" : ""}${linea.precio_dif_pct}%). Este precio no coincide con el precio pactado. Revísalo antes de aceptar.`,
            });
          }
        }
      }
      return linea;
    });

    res.json({ ...datos, lineas, proveedor_id: provId, avisos_precio });
  } catch (e) {
    if (e.code === "OCR_NO_CONFIG") {
      return res.status(503).json({ error: "OCR no configurado. Adjunta la foto y rellena a mano.", code: "OCR_NO_CONFIG" });
    }
    res.status(500).json({ error: "No se pudo leer el albarán: " + e.message });
  }
});

// Coteja las líneas recibidas con el pedido abierto del proveedor y con el
// precio habitual de cada materia. Devuelve avisos de cantidad y de precio.
router.post("/cotejar", jsonGrande, (req, res) => {
  const { proveedor_id, lineas } = req.body || {};
  const materias = store.readAll("materias");
  const matById = {};
  materias.forEach((m) => (matById[m.id] = m));

  const abiertos = store.readAll("pedidos").filter((p) => p.proveedor_id === proveedor_id && p.estado !== "recibido");
  const pedido = abiertos.length ? abiertos[abiertos.length - 1] : null;
  const pedidoLineas = pedido ? pedido.lineas : [];
  const recibidas = (lineas || []).filter((l) => l.materia_id);
  const avisos = [];

  recibidas.forEach((l) => {
    const m = matById[l.materia_id];
    if (!m) return;
    const pl = pedidoLineas.find((x) => x.materia_id === l.materia_id);
    const recCant = Number(l.cantidad) || 0;
    const precio = Number(l.precio_unitario);

    if (pl) {
      const dif = Math.round((recCant - pl.cantidad) * 100) / 100;
      if (Math.abs(dif) > 1e-6) {
        avisos.push({ tipo: "cantidad", nivel: "medio", mensaje: `${m.nombre}: pedido ${pl.cantidad} ${m.unidad}, recibido ${recCant} ${m.unidad} (${dif > 0 ? "+" : ""}${dif})` });
      }
    } else if (pedido) {
      avisos.push({ tipo: "extra", nivel: "medio", mensaje: `${m.nombre}: llega en el albarán pero no estaba en el pedido` });
    }

    const esperado = pl && pl.precio_esperado > 0 ? pl.precio_esperado : m.coste_medio;
    if (Number.isFinite(precio) && precio > 0 && esperado > 0) {
      const dp = (precio - esperado) / esperado;
      if (Math.abs(dp) >= 0.05) {
        avisos.push({ tipo: "precio", nivel: Math.abs(dp) >= 0.15 ? "alto" : "medio", mensaje: `${m.nombre}: precio ${precio.toFixed(4)} € vs ${pl ? "pedido" : "habitual"} ${esperado.toFixed(4)} € (${dp > 0 ? "+" : ""}${Math.round(dp * 100)}%)` });
      }
    }
  });

  pedidoLineas.forEach((pl) => {
    if (!recibidas.find((l) => l.materia_id === pl.materia_id)) {
      avisos.push({ tipo: "falta", nivel: "alto", mensaje: `${pl.nombre}: pedido ${pl.cantidad} ${pl.unidad}, no aparece en el albarán` });
    }
  });

  res.json({ pedido_id: pedido ? pedido.id : null, pedido_codigo: pedido ? pedido.codigo : null, avisos });
});

// Entrada de recepción (manual o tras escanear). Admite fotos, líneas, pedido,
// lote del proveedor y caducidad.
router.post("/", jsonGrande, (req, res) => {
  const { proveedor_id, importe_total, foto_albaran, foto_producto, lineas, pedido_id, lote_proveedor, caducidad } = req.body;
  if (!proveedor_id) return res.status(400).json({ error: "Indica el proveedor de la recepción" });
  const recepcion = {
    id: store.nextId("rcp", "recepciones"),
    proveedor_id,
    pedido_id: pedido_id || null,
    fecha: new Date().toISOString(),
    foto_albaran_url: foto_albaran || null,
    foto_producto_url: foto_producto || null,
    lote_proveedor: lote_proveedor ? String(lote_proveedor).trim() : "",
    caducidad: caducidad ? String(caducidad).trim() : "",
    lineas: Array.isArray(lineas) ? lineas : [],
    estado: "Pendiente de confirmar",
    importe_total: importe_total || 0,
    pendiente_pago: importe_total || 0,
  };
  store.insert("recepciones", recepcion);
  res.status(201).json(recepcion);
});

// Carga al almacén las líneas con materia asignada (una sola vez). Devuelve lo aplicado.
function aplicarStock(recepcion) {
  const aplicado = [];
  if (!recepcion.stock_aplicado && Array.isArray(recepcion.lineas)) {
    const materias = store.readAll("materias");
    recepcion.lineas.forEach((l) => {
      const cant = Number(l.cantidad);
      if (l.materia_id && Number.isFinite(cant) && cant > 0) {
        const m = materias.find((x) => x.id === l.materia_id);
        if (m) {
          m.disponibilidad_actual = Math.round((m.disponibilidad_actual + cant) * 100) / 100;
          aplicado.push({ materia_id: m.id, nombre: m.nombre, cantidad: cant, unidad: m.unidad });
        }
      }
    });
    if (aplicado.length) store.writeAll("materias", materias);
  }
  return aplicado;
}

const ESTADOS_RECEPCION = ["Aceptado", "Aceptado con incidencia", "Rechazado"];

// Resolver una recepción con uno de los tres estados. Aceptado / Aceptado con
// incidencia cargan el stock; Rechazado no toca el almacén.
router.post("/:id/estado", jsonGrande, (req, res) => {
  const recepcion = store.findById("recepciones", req.params.id);
  if (!recepcion) return res.status(404).json({ error: "Recepción no encontrada" });
  const estado = String((req.body && req.body.estado) || "").trim();
  if (!ESTADOS_RECEPCION.includes(estado)) {
    return res.status(400).json({ error: "Estado no válido. Usa Aceptado, Aceptado con incidencia o Rechazado." });
  }
  const aceptada = estado === "Aceptado" || estado === "Aceptado con incidencia";
  const aplicado = aceptada ? aplicarStock(recepcion) : [];

  if (aceptada && recepcion.pedido_id) {
    store.update("pedidos", recepcion.pedido_id, { estado: "recibido", recibido_en: new Date().toISOString() });
  }
  const cambios = { estado, resuelta_en: new Date().toISOString() };
  if (aceptada) cambios.stock_aplicado = true;
  if (req.body && req.body.nota_incidencia != null) cambios.nota_incidencia = String(req.body.nota_incidencia).trim();
  const actualizada = store.update("recepciones", req.params.id, cambios);
  require("../auditoria").registrar(req, {
    accion: estado === "Rechazado" ? "recepcion_rechazada" : "recepcion_aceptada",
    entidad: "recepciones",
    entidad_id: recepcion.id,
    resumen: `Recepción ${recepcion.proveedor_nombre || recepcion.proveedor_id || ""} ${estado.toLowerCase()}${aceptada ? ` · ${aplicado.length} línea(s) al stock` : ""}`,
    meta: { estado, importe_total: recepcion.importe_total, lineas_cargadas: aplicado.length },
  });
  res.json({ ...actualizada, stock_cargado: aplicado });
});

// Compatibilidad: confirmar = Aceptado.
router.post("/:id/confirmar", (req, res) => {
  const recepcion = store.findById("recepciones", req.params.id);
  if (!recepcion) return res.status(404).json({ error: "Recepción no encontrada" });
  const aplicado = aplicarStock(recepcion);
  if (recepcion.pedido_id) {
    store.update("pedidos", recepcion.pedido_id, { estado: "recibido", recibido_en: new Date().toISOString() });
  }
  const actualizada = store.update("recepciones", req.params.id, {
    estado: "Aceptado", resuelta_en: new Date().toISOString(), stock_aplicado: true,
  });
  res.json({ ...actualizada, stock_cargado: aplicado });
});

module.exports = router;
