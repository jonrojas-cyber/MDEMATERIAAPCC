const QRCode = require("qrcode");
const store = require("./data-store");

// URL base pública usada dentro del QR. En producción (Render) la rellena
// el propio servidor a partir del host de la petición; en local cae a localhost.
function urlFichaLote(req, loteId) {
  const host = req ? `${req.protocol}://${req.get("host")}` : "http://localhost:4001";
  return `${host}/lote/${loteId}`;
}

async function generateQRCode(texto) {
  // Devuelve un data URL (PNG en base64) listo para <img src="...">
  return QRCode.toDataURL(texto, { margin: 1, width: 300 });
}

async function createLabel(req, { lote, receta, responsable }) {
  const qrTexto = urlFichaLote(req, lote.id);
  const qrDataUrl = await generateQRCode(qrTexto);

  const etiqueta = {
    id: store.nextId("etq", "etiquetas"),
    lote_id: lote.id,
    nombre_preparacion: receta.nombre,
    codigo_lote: lote.codigo,
    fecha_produccion: lote.producido_en,
    fecha_consumo_recomendada: lote.caduca_en,
    responsable: responsable || "Sin asignar",
    cantidad_inicial: lote.cantidad_inicial,
    unidad: receta.unidad,
    qr_url: qrTexto,
    qr_data_url: qrDataUrl,
    creada_en: new Date().toISOString(),
    impresiones: [],
  };
  store.insert("etiquetas", etiqueta);
  return etiqueta;
}

function registrarImpresion(etiquetaId, { usuario, impresora }) {
  const etiquetas = store.readAll("etiquetas");
  const etiqueta = etiquetas.find((e) => e.id === etiquetaId);
  if (!etiqueta) return null;
  etiqueta.impresiones.push({
    fecha: new Date().toISOString(),
    usuario: usuario || "Sin asignar",
    impresora: impresora || "Navegador",
  });
  store.writeAll("etiquetas", etiquetas);
  return etiqueta;
}

module.exports = { createLabel, registrarImpresion, generateQRCode, urlFichaLote };
