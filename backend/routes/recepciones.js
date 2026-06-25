const express = require("express");
const store = require("../data-store");
const ocr = require("../ocr");

const router = express.Router();

// Cuerpo grande para la imagen del albarán (base64).
const jsonGrande = express.json({ limit: "12mb" });

// Versión ligera (sin la foto en base64) para listados.
function slim(r) {
  const { foto_albaran_url, ...resto } = r;
  return { ...resto, tiene_foto: !!foto_albaran_url };
}

router.get("/", (req, res) => {
  res.json(store.readAll("recepciones").map(slim));
});

router.get("/ocr-estado", (req, res) => {
  res.json({ disponible: ocr.disponible() });
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
    const datos = await ocr.extraerAlbaran(base64, media_type);

    // Intentar emparejar el proveedor por nombre con los existentes.
    const proveedores = store.readAll("proveedores");
    const norm = (s) => String(s || "").toLowerCase().trim();
    const match = proveedores.find((p) => norm(p.nombre) && norm(datos.proveedor).includes(norm(p.nombre)));

    // Emparejar cada línea con una materia del almacén (por nombre) para sugerir
    // qué cargar al stock. El usuario lo revisa antes de confirmar.
    const materias = store.readAll("materias");
    const lineas = (datos.lineas || []).map((l) => {
      const d = norm(l.descripcion);
      const m = materias.find((x) => {
        const n = norm(x.nombre);
        return n && (d.includes(n) || n.includes(d));
      });
      return {
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
        importe: l.importe,
        materia_id: m ? m.id : null,
        materia_unidad: m ? m.unidad : null,
      };
    });

    res.json({ ...datos, lineas, proveedor_id: match ? match.id : null });
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

// Entrada de recepción (manual o tras escanear). Admite foto, líneas y pedido.
router.post("/", jsonGrande, (req, res) => {
  const { proveedor_id, importe_total, foto_albaran, lineas, pedido_id } = req.body;
  if (!proveedor_id) return res.status(400).json({ error: "Indica el proveedor de la recepción" });
  const recepcion = {
    id: store.nextId("rcp", "recepciones"),
    proveedor_id,
    pedido_id: pedido_id || null,
    fecha: new Date().toISOString(),
    foto_albaran_url: foto_albaran || null,
    lineas: Array.isArray(lineas) ? lineas : [],
    estado: "Pendiente de confirmar",
    importe_total: importe_total || 0,
    pendiente_pago: importe_total || 0,
  };
  store.insert("recepciones", recepcion);
  res.status(201).json(recepcion);
});

router.post("/:id/confirmar", (req, res) => {
  const recepcion = store.findById("recepciones", req.params.id);
  if (!recepcion) return res.status(404).json({ error: "Recepción no encontrada" });

  // Cargar al almacén las líneas con materia asignada (una sola vez).
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

  // Si la recepción venía de un pedido, marcarlo como recibido.
  if (recepcion.pedido_id) {
    store.update("pedidos", recepcion.pedido_id, { estado: "recibido", recibido_en: new Date().toISOString() });
  }

  const actualizada = store.update("recepciones", req.params.id, {
    estado: "Confirmada",
    stock_aplicado: true,
  });
  res.json({ ...actualizada, stock_cargado: aplicado });
});

module.exports = router;
