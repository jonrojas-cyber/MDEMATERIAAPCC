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

// HTML de una etiqueta térmica de 62x30mm para la Phomemo D520BT.
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
  @page { size: 62mm 30mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 62mm; height: 30mm; }
  body { font-family: 'Courier Prime', 'Courier New', monospace; color: #000; background: #fff; }
  .label { width: 62mm; height: 30mm; padding: 1.5mm; display: flex; gap: 1.5mm; align-items: stretch; }
  .datos { flex: 1; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
  .nombre { font-size: 10px; font-weight: 700; line-height: 1.05; }
  .linea { font-size: 7px; line-height: 1.2; }
  .linea b { font-size: 7px; }
  .codigo { font-size: 8.5px; font-weight: 700; letter-spacing: 0.5px; }
  .qr { width: 25mm; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .qr img { width: 24mm; height: 24mm; }
  .qr span { font-size: 6px; margin-top: 0.3mm; }
  @media screen { body { background: #ddd; padding: 10px; } .label { box-shadow: 0 0 0 1px #999; background:#fff; } .toolbar{font-family:sans-serif;margin-bottom:8px;} }
  @media print { .toolbar { display: none; } }
</style></head>
<body>
  <div class="toolbar"><button onclick="window.print()">Imprimir</button> — Tamaño 62×30mm · Phomemo D520BT</div>
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

// Página pública de FICHA DE LOTE: es lo que se abre al escanear el QR de la
// pegatina. Muestra toda la trazabilidad del lote (producto, fechas, cantidad,
// estado, ubicación, responsable e ingredientes), legible en el móvil.
function renderFichaLoteHTML({ lote, receta, materias, responsable }) {
  const indice = {};
  (materias || []).forEach((m) => (indice[m.id] = m));
  const nombre = escapeHTML(receta ? receta.nombre : lote.receta_id);
  const unidad = receta ? receta.unidad : "";

  const caducado = lote.caduca_en && new Date(lote.caduca_en) < new Date();
  const ingredientes = (receta && Array.isArray(receta.ingredientes) ? receta.ingredientes : [])
    .map((ing) => {
      const m = indice[ing.materia_id];
      return `<li>${escapeHTML(m ? m.nombre : ing.materia_id)} — ${escapeHTML(ing.cantidad)} ${escapeHTML(m ? m.unidad : "")}</li>`;
    })
    .join("");
  const pasos = (receta && Array.isArray(receta.pasos_proceso) ? receta.pasos_proceso : [])
    .map((p) => `<li>${escapeHTML(p)}</li>`)
    .join("");

  const fila = (etq, val) => `<div class="row"><span class="k">${etq}</span><span class="v">${val}</span></div>`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lote ${escapeHTML(lote.codigo)}</title>
<style>
  body{font-family:'Courier Prime','Courier New',monospace;background:#F0EBE0;color:#111009;margin:0;padding:18px;}
  .doc{max-width:560px;margin:0 auto;background:#fff;border:1px solid #d8d0bf;border-radius:10px;padding:20px;}
  h1{font-size:19px;margin:0 0 2px;} .sub{font-size:11px;color:#5C6145;letter-spacing:.12em;text-transform:uppercase;margin-bottom:14px;}
  .codigo{font-size:15px;font-weight:700;letter-spacing:1px;margin:2px 0 14px;}
  .estado{display:inline-block;font-size:11px;padding:3px 10px;border-radius:20px;font-weight:700;margin-bottom:10px;}
  .ok{background:#e7efe0;color:#3e4534;} .bad{background:#f4e3da;color:#9C5A2E;}
  .row{display:flex;justify-content:space-between;gap:12px;font-size:13px;padding:7px 0;border-bottom:1px solid #f0e9da;}
  .row .k{color:#5C6145;} .row .v{text-align:right;font-weight:700;}
  .alerta{background:#f4e3da;color:#9C5A2E;font-size:12px;font-weight:700;padding:8px 10px;border-radius:6px;margin:10px 0;text-align:center;}
  h2{font-size:12px;color:#5C6145;text-transform:uppercase;letter-spacing:.08em;margin:16px 0 6px;}
  ul{margin:0;padding-left:18px;font-size:12.5px;line-height:1.5;}
</style></head><body><div class="doc">
  <h1>${nombre}</h1>
  <div class="sub">m de materia · Ficha de lote</div>
  <div class="codigo">${escapeHTML(lote.codigo)}</div>
  <span class="estado ${caducado ? "bad" : "ok"}">${caducado ? "Caducado" : escapeHTML(lote.estado || "—")}</span>
  ${caducado ? `<div class="alerta">⚠ Fuera de fecha de consumo · no usar</div>` : ""}
  ${fila("Producido", fechaCorta(lote.producido_en))}
  ${fila("Consumir antes", fechaCorta(lote.caduca_en))}
  ${fila("Cantidad inicial", `${escapeHTML(lote.cantidad_inicial)} ${escapeHTML(unidad)}`)}
  ${lote.cantidad_restante != null ? fila("Restante", `${escapeHTML(lote.cantidad_restante)} ${escapeHTML(unidad)}`) : ""}
  ${lote.ubicacion ? fila("Ubicación", escapeHTML(lote.ubicacion)) : ""}
  ${fila("Responsable", escapeHTML(responsable || lote.responsable || "—"))}
  ${receta && receta.vida_util_horas ? fila("Vida útil", `${escapeHTML(receta.vida_util_horas)} h`) : ""}
  ${ingredientes ? `<h2>Ingredientes</h2><ul>${ingredientes}</ul>` : ""}
  ${pasos ? `<h2>Proceso</h2><ul>${pasos}</ul>` : ""}
</div></body></html>`;
}

module.exports = {
  createLabel,
  registrarImpresion,
  guardarHistorial,
  renderEtiquetaHTML,
  renderFichaLoteHTML,
  generateQRCode,
  urlFichaLote,
};
