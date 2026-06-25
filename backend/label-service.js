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
  const evento = {
    fecha: new Date().toISOString(),
    usuario: usuario || "Sin asignar",
    impresora: impresora || "Navegador",
  };
  if (!Array.isArray(etiqueta.impresiones)) etiqueta.impresiones = [];
  etiqueta.impresiones.push(evento);
  store.writeAll("etiquetas", etiquetas);
  guardarHistorial({ etiqueta_id: etiquetaId, lote_id: etiqueta.lote_id, ...evento });
  return etiqueta;
}

// Historial de impresiones en su propia entidad (consultable, persistente).
function guardarHistorial(datos) {
  store.insert("impresiones", {
    id: store.nextId("imp", "impresiones"),
    etiqueta_id: datos.etiqueta_id || null,
    lote_id: datos.lote_id || null,
    usuario: datos.usuario || "Sin asignar",
    impresora: datos.impresora || "Navegador",
    fecha: datos.fecha || new Date().toISOString(),
  });
}

function escapeHTML(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function fechaCorta(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// HTML de una etiqueta térmica de 62x40mm para la Phomemo D520BT.
// QR a la derecha, datos a la izquierda. Tipografía 7-9px datos, 11px nombre.
async function renderEtiquetaHTML(req, { lote, receta, responsable, autoprint }) {
  const qrTexto = urlFichaLote(req, lote.id);
  const qrDataUrl = await generateQRCode(qrTexto);
  const nombre = escapeHTML(receta ? receta.nombre : lote.receta_id);
  const unidad = receta ? receta.unidad : "";

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Etiqueta ${escapeHTML(lote.codigo)}</title>
<style>
  @page { size: 62mm 40mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 62mm; height: 40mm; }
  body { font-family: 'Courier Prime', 'Courier New', monospace; color: #000; background: #fff; }
  .label { width: 62mm; height: 40mm; padding: 2mm; display: flex; gap: 2mm; align-items: stretch; }
  .datos { flex: 1; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
  .nombre { font-size: 11px; font-weight: 700; line-height: 1.05; }
  .linea { font-size: 8px; line-height: 1.25; }
  .linea b { font-size: 8px; }
  .codigo { font-size: 9px; font-weight: 700; letter-spacing: 0.5px; }
  .qr { width: 30mm; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .qr img { width: 28mm; height: 28mm; }
  .qr span { font-size: 7px; margin-top: 0.5mm; }
  @media screen { body { background: #ddd; padding: 10px; } .label { box-shadow: 0 0 0 1px #999; background:#fff; } .toolbar{font-family:sans-serif;margin-bottom:8px;} }
  @media print { .toolbar { display: none; } }
</style></head>
<body>
  <div class="toolbar"><button onclick="window.print()">Imprimir</button> — Tamaño 62×40mm · Phomemo D520BT</div>
  <div class="label">
    <div class="datos">
      <div class="nombre">${nombre}</div>
      <div class="codigo">${escapeHTML(lote.codigo)}</div>
      <div class="linea">Prod: ${fechaCorta(lote.producido_en)}</div>
      <div class="linea"><b>Consumir antes:</b> ${fechaCorta(lote.caduca_en)}</div>
      <div class="linea">Cantidad: ${escapeHTML(lote.cantidad_inicial)} ${escapeHTML(unidad)}</div>
      <div class="linea">Resp: ${escapeHTML(responsable || "—")}</div>
    </div>
    <div class="qr">
      <img src="${qrDataUrl}" alt="QR">
      <span>${escapeHTML(lote.codigo)}</span>
    </div>
  </div>
  ${autoprint ? "<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script>" : ""}
</body></html>`;
}

module.exports = {
  createLabel,
  registrarImpresion,
  guardarHistorial,
  renderEtiquetaHTML,
  generateQRCode,
  urlFichaLote,
};
