const QRCode = require("qrcode");
const store = require("./data-store");

// URL base pública usada dentro del QR. En producción (Render) la rellena
// el propio servidor a partir del host de la petición; en local cae a localhost.
function urlFichaLote(req, loteId) {
  const host = req ? `${req.protocol}://${req.get("host")}` : "http://localhost:4001";
  return `${host}/lote/${loteId}`;
}

// URL de la ficha de una PRODUCCIÓN genérica (etiqueta sin lote guardado). Los
// datos viajan en el propio QR (nombre, elaborado, vida útil, responsable) y la
// ficha calcula el tiempo en vivo. Así se etiqueta cualquier cosa que preparas
// sin tener que darla de alta como receta.
function urlFichaPrep(req, q) {
  const host = req ? `${req.protocol}://${req.get("host")}` : "http://localhost:4001";
  const usp = new URLSearchParams();
  ["n", "c", "v", "r", "p", "code", "et", "est"].forEach((k) => { if (q[k] != null && q[k] !== "") usp.set(k, q[k]); });
  return `${host}/p?${usp.toString()}`;
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

const { partes: partesMadrid } = require("./tz");

function fechaCorta(iso) {
  if (!iso) return "—";
  const p = partesMadrid(iso);
  if (!p) return "—";
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

// Fecha compacta para la etiqueta: "16.07 · 14:30" (estilo boticario, sin
// barras). Sólo presentación; no toca fechaCorta que usa la ficha pública.
function fechaSello(iso) {
  if (!iso) return "—";
  const p = partesMadrid(iso);
  if (!p) return "—";
  return `${p.day}.${p.month} · ${p.hour}:${p.minute}`;
}

// HTML de una etiqueta térmica de 62x30mm para la Phomemo D520BT.
// Diseño "boticario m de materia": marco, título en mayúsculas + subtítulo, una
// regla, los datos de fecha, la cantidad en vertical a la derecha y la coletilla
// legal abajo. El QR de trazabilidad (vida útil en vivo) va en la columna
// izquierda. Negro puro sobre blanco para que la térmica salga nítida.
async function renderEtiquetaHTML(req, { lote, receta, responsable, autoprint, qrUrl, venceLabel, cantidad }) {
  const qrTexto = qrUrl || urlFichaLote(req, lote.id);
  const qrDataUrl = await generateQRCode(qrTexto);
  const nombreRaw = String((receta ? receta.nombre : lote.receta_id) || "");
  // El nombre se parte en TÍTULO · subtítulo (como "COLD BREW / tembo tembo").
  const partes = nombreRaw.split(" · ");
  const titulo = escapeHTML(partes[0] || "");
  const subtitulo = escapeHTML(partes.slice(1).join(" · "));
  const cant = escapeHTML(cantidad || "");
  const vence = escapeHTML((venceLabel || "consumir antes")).toLowerCase();
  const resp = escapeHTML((responsable || "").trim()).toLowerCase();

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Etiqueta ${escapeHTML(lote.codigo)}</title>
<style>
  @page { size: 62mm 30mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 62mm; height: 30mm; overflow: hidden; }
  body { font-family: 'Courier Prime', 'Courier New', monospace; color: #000; background: #fff; -webkit-font-smoothing: none; }
  .label { width: 62mm; height: 30mm; border: 0.35mm solid #000; display: flex; align-items: stretch; page-break-inside: avoid; }
  /* Columna QR (izquierda). */
  .qr { width: 16mm; flex: 0 0 16mm; border-right: 0.3mm solid #000; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1mm 0.6mm; }
  .qr img { width: 12.5mm; height: 12.5mm; display: block; image-rendering: pixelated; background: #fff; }
  .qr .code { font-size: 6px; font-weight: 700; letter-spacing: 0.5px; margin-top: 0.9mm; text-align: center; line-height: 1.05; word-break: break-all; }
  /* Columna principal. */
  .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .top { flex: 1; padding: 1.5mm 1.8mm 0.8mm; display: flex; flex-direction: column; min-width: 0; }
  .titulo-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 1.5mm; }
  .titulo { font-size: 10px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase; line-height: 1.05;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .mark { display: flex; align-items: flex-end; gap: 0.4mm; flex: 0 0 auto; margin-top: 0.4mm; }
  .mark i { display: block; width: 0.4mm; height: 2.4mm; background: #000; }
  .mark i:nth-child(2) { height: 3mm; }
  .subtitulo { font-size: 7.5px; text-transform: lowercase; letter-spacing: 0.3px; margin-top: 0.5mm;
               white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rule { border-top: 0.2mm solid #000; margin: 1mm 0 0.9mm; }
  .fecha { font-size: 7px; letter-spacing: 0.2px; text-transform: lowercase; line-height: 1.4; white-space: nowrap; }
  .fecha b { font-weight: 700; }
  .fecha.vence b { font-size: 8.5px; }
  .prueba { font-size: 6px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;
            border: 0.2mm solid #000; padding: 0.2mm 1mm; display: inline-block; margin-top: 0.6mm; align-self: flex-start; }
  .foot { border-top: 0.3mm solid #000; padding: 0.9mm 1.8mm; }
  .legal { font-size: 5px; letter-spacing: 0.2px; text-transform: uppercase; line-height: 1.3; }
  /* Columna cantidad (derecha), en vertical. */
  .cant { width: 5.5mm; flex: 0 0 5.5mm; border-left: 0.3mm solid #000; display: flex; align-items: center; justify-content: center; }
  .cant span { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 8px; font-weight: 700; letter-spacing: 0.8px; text-transform: lowercase; white-space: nowrap; }
  @media screen { body { background: #ddd; padding: 14px; } .label { box-shadow: 0 0 0 1px #999; background:#fff; }
    .toolbar{font-family:sans-serif;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
    .toolbar button{font-family:inherit;font-size:14px;font-weight:600;padding:11px 16px;border-radius:10px;border:1px solid #333;cursor:pointer;}
    .toolbar .primary{background:#2a332b;color:#fff;border-color:#2a332b;}
    .toolbar .ghost{background:#fff;color:#333;}
    .toolbar .hint{font-size:11px;color:#666;flex-basis:100%;} }
  @media print { .toolbar { display: none; } }
</style></head>
<body>
  <div class="toolbar">
    <button class="primary" onclick="compartirLabelife()">📤 Imprimir en Labelife</button>
    <button class="ghost" onclick="descargarEtiqueta()">⬇️ Guardar PNG</button>
    <button class="ghost" onclick="window.print()">🖨️ Navegador</button>
    <span class="hint">Toca «Imprimir en Labelife» → elige <b>Labelife</b> en el menú de compartir → imprime en la Phomemo D520BT (62×30 mm).</span>
  </div>
  <div class="label">
    <div class="qr">
      <img src="${qrDataUrl}" alt="QR">
      <div class="code">${escapeHTML(lote.codigo)}</div>
    </div>
    <div class="main">
      <div class="top">
        <div class="titulo-row">
          <div class="titulo">${titulo}</div>
          <span class="mark" aria-hidden="true"><i></i><i></i><i></i></span>
        </div>
        ${subtitulo ? `<div class="subtitulo">${subtitulo}</div>` : ""}
        <div class="rule"></div>
        <div class="fecha">elaborado · <b>${fechaSello(lote.producido_en)}</b></div>
        <div class="fecha vence">${vence} · <b>${fechaSello(lote.caduca_en)}</b></div>
        ${resp ? `<div class="fecha">resp · ${resp}</div>` : ""}
        ${lote.prueba ? `<div class="prueba">${escapeHTML(lote.prueba)}</div>` : ""}
      </div>
      <div class="foot">
        <div class="legal">Elaborado con ingredientes de origen natural. Sin colorantes. Sin conservantes.</div>
      </div>
    </div>
    ${cant ? `<div class="cant"><span>${cant}</span></div>` : ""}
  </div>
  <script>
  (function(){
    var CODE = ${JSON.stringify(lote.codigo || "etiqueta")};
    // Rasteriza la .label a PNG al tamaño real (≈203 dpi) para que Labelife la
    // imprima nítida. Usa SVG+foreignObject con el CSS embebido (sin librerías).
    function labelToPng(){
      return new Promise(function(resolve, reject){
        var el = document.querySelector('.label');
        var w = el.offsetWidth, h = el.offsetHeight, S = 3;
        var css = ''; document.querySelectorAll('style').forEach(function(s){ css += s.textContent; });
        var xml = new XMLSerializer().serializeToString(el);
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="'+(w*S)+'" height="'+(h*S)+'">'
          + '<foreignObject x="0" y="0" width="'+(w*S)+'" height="'+(h*S)+'">'
          + '<div xmlns="http://www.w3.org/1999/xhtml" style="transform:scale('+S+');transform-origin:top left;width:'+w+'px;height:'+h+'px;background:#fff;">'
          + '<style>'+css+'</style>' + xml + '</div>'
          + '</foreignObject></svg>';
        var img = new Image();
        img.onload = function(){
          var c = document.createElement('canvas'); c.width = Math.round(w*S); c.height = Math.round(h*S);
          var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,c.width,c.height);
          ctx.drawImage(img, 0, 0);
          c.toBlob(function(b){ b ? resolve(b) : reject(new Error('imagen vacía')); }, 'image/png');
        };
        img.onerror = function(){ reject(new Error('no se pudo dibujar la etiqueta')); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      });
    }
    function descargar(blob){
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'etiqueta-' + CODE + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
    }
    window.descargarEtiqueta = function(){ labelToPng().then(descargar).catch(function(e){ alert('No se pudo generar la imagen: ' + e.message); }); };
    window.compartirLabelife = function(){
      labelToPng().then(function(blob){
        var file = new File([blob], 'etiqueta-' + CODE + '.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          return navigator.share({ files: [file], title: 'Etiqueta ' + CODE, text: 'Etiqueta m de materia · ' + CODE });
        }
        descargar(blob); // sin compartir con ficheros (p. ej. escritorio): baja el PNG para abrirlo en Labelife
      }).catch(function(e){ if (e && e.name !== 'AbortError') alert('No se pudo compartir: ' + e.message); });
    };
  })();
  </script>
  ${autoprint ? "<script>window.addEventListener('load',function(){var b=document.querySelector('.toolbar .primary'); if(b) b.focus();});</script>" : ""}
</body></html>`;
}

// Página pública de FICHA DE LOTE: es lo que se abre al escanear el QR de la
// pegatina. Muestra la vida útil EN TIEMPO REAL (cuenta atrás viva, barra y
// color según riesgo) más toda la trazabilidad del lote. El QR no guarda un
// dato estático: lleva a esta vista dinámica, que recalcula con la hora actual.
function renderFichaLoteHTML({ lote, receta, materias, responsable, venceLabel }) {
  const indice = {};
  (materias || []).forEach((m) => (indice[m.id] = m));
  const nombre = escapeHTML(receta ? receta.nombre : lote.receta_id);
  const unidad = receta ? receta.unidad : "";

  const bloqueado = ["Fuera de servicio", "Bloqueado", "No apto", "Rechazado"].includes(lote.estado);
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
  // Datos que el reloj en vivo del navegador necesita (ISO + bloqueo).
  const cfg = JSON.stringify({
    producido: lote.producido_en || null,
    caduca: lote.caduca_en || null,
    bloqueado: !!bloqueado,
  });

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lote ${escapeHTML(lote.codigo)}</title>
<style>
  :root{ --crema:#F0EBE0; --tinta:#1a1813; --olive:#5C6145; --suave:#8a8470; }
  *{box-sizing:border-box;}
  body{font-family:'Courier Prime','Courier New',monospace;background:var(--crema);color:var(--tinta);margin:0;padding:22px 18px;-webkit-font-smoothing:antialiased;}
  .doc{max-width:520px;margin:0 auto;}
  .marca{font-size:10px;color:var(--olive);letter-spacing:.28em;text-transform:uppercase;text-align:center;margin-bottom:22px;}
  h1{font-size:23px;font-weight:700;margin:0 0 4px;text-align:center;line-height:1.15;}
  .codigo{font-size:13px;letter-spacing:1.5px;color:var(--suave);text-align:center;margin-bottom:26px;}
  /* Bloque de vida útil en vivo */
  .vida{border-radius:16px;padding:24px 20px;text-align:center;transition:background .4s;margin-bottom:8px;}
  .estado-txt{font-size:12px;letter-spacing:.18em;text-transform:uppercase;font-weight:700;margin-bottom:14px;}
  .cuenta{display:flex;justify-content:center;gap:14px;margin:4px 0 18px;}
  .cuenta .u{min-width:58px;}
  .cuenta .n{font-size:40px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;}
  .cuenta .l{font-size:10px;letter-spacing:.1em;text-transform:uppercase;margin-top:6px;opacity:.7;}
  .frase{font-size:15px;font-weight:700;margin-top:4px;}
  .barra{height:9px;border-radius:6px;background:rgba(0,0,0,.10);overflow:hidden;margin-top:18px;}
  .barra > i{display:block;height:100%;width:100%;border-radius:6px;transition:width .5s, background .4s;}
  /* Paletas por estado */
  .ok{background:#e7efe0;color:#34402b;} .ok .barra>i{background:#5C6145;}
  .amber{background:#f6ecd5;color:#7a5a1e;} .amber .barra>i{background:#c79a3a;}
  .rojo{background:#f3ddd2;color:#9C3A1E;} .rojo .barra>i{background:#b5462a;}
  .negro{background:#23211c;color:#f0ebe0;} .negro .barra>i{background:#000;}
  .rows{background:#fff;border:1px solid #e3dccb;border-radius:14px;padding:6px 16px;margin-top:18px;}
  .row{display:flex;justify-content:space-between;gap:12px;font-size:13px;padding:10px 0;border-bottom:1px solid #f0e9da;}
  .row:last-child{border-bottom:0;} .row .k{color:var(--olive);} .row .v{text-align:right;font-weight:700;}
  h2{font-size:11px;color:var(--olive);text-transform:uppercase;letter-spacing:.12em;margin:22px 0 8px;}
  ul{margin:0;padding-left:18px;font-size:12.5px;line-height:1.6;}
  .pie{text-align:center;font-size:10px;color:var(--suave);margin-top:26px;letter-spacing:.05em;}
</style></head><body><div class="doc">
  <div class="marca">m de materia · trazabilidad</div>
  <h1>${nombre}</h1>
  <div class="codigo">${escapeHTML(lote.codigo)}</div>
  ${lote.prueba ? `<div style="text-align:center;margin:0 0 16px;"><span style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:var(--olive);border:1px solid var(--olive);border-radius:6px;padding:5px 12px;display:inline-block;">${escapeHTML(lote.prueba)}</span></div>` : ""}

  <div class="vida" id="vida">
    <div class="estado-txt" id="estado">Calculando…</div>
    <div class="cuenta" id="cuenta">
      <div class="u"><div class="n" id="d">–</div><div class="l">días</div></div>
      <div class="u"><div class="n" id="h">–</div><div class="l">horas</div></div>
      <div class="u"><div class="n" id="m">–</div><div class="l">min</div></div>
    </div>
    <div class="frase" id="frase"></div>
    <div class="barra"><i id="barra"></i></div>
  </div>

  <div class="rows">
    ${fila("Producido", fechaCorta(lote.producido_en))}
    ${fila(venceLabel || "Consumir antes", fechaCorta(lote.caduca_en))}
    ${fila("Cantidad inicial", `${escapeHTML(lote.cantidad_inicial)} ${escapeHTML(unidad)}`)}
    ${lote.cantidad_restante != null ? fila("Restante", `${escapeHTML(lote.cantidad_restante)} ${escapeHTML(unidad)}`) : ""}
    ${lote.ubicacion ? fila("Ubicación", escapeHTML(lote.ubicacion)) : ""}
    ${fila("Responsable", escapeHTML(responsable || lote.responsable || "—"))}
    ${receta && receta.vida_util_horas ? fila("Vida útil total", `${escapeHTML(receta.vida_util_horas)} h`) : ""}
  </div>
  ${ingredientes ? `<h2>Ingredientes</h2><ul>${ingredientes}</ul>` : ""}
  ${pasos ? `<h2>Proceso</h2><ul>${pasos}</ul>` : ""}
  <div class="pie">Vida útil calculada en tiempo real · m de materia</div>
</div>
<script>
(function(){
  var cfg = ${cfg};
  var vida=document.getElementById("vida"), estado=document.getElementById("estado"),
      frase=document.getElementById("frase"), barra=document.getElementById("barra"),
      cuenta=document.getElementById("cuenta");
  var prod = cfg.producido ? new Date(cfg.producido).getTime() : null;
  var cad  = cfg.caduca   ? new Date(cfg.caduca).getTime()   : null;
  function set(cls, txt, fr){ vida.className="vida "+cls; estado.textContent=txt; frase.textContent=fr||""; }
  function tick(){
    var now = Date.now();
    if(cfg.bloqueado){ set("negro","Bloqueado","Este lote no debe usarse"); cuenta.style.opacity=".35"; barra.style.width="0%"; return; }
    if(!cad){ set("ok","Sin fecha de caducidad","Revisa la ficha del lote"); cuenta.style.opacity=".35"; barra.style.width="0%"; return; }
    var rest = cad - now;
    if(rest <= 0){
      set("negro","Caducado","Este lote ya no debe usarse");
      document.getElementById("d").textContent="0"; document.getElementById("h").textContent="0"; document.getElementById("m").textContent="0";
      barra.style.width="100%"; return;
    }
    var total = (prod && cad>prod) ? (cad - prod) : null;
    var pct = total ? Math.max(0, Math.min(1, rest/total)) : 1;
    var d = Math.floor(rest/86400000), h = Math.floor((rest%86400000)/3600000), m = Math.floor((rest%3600000)/60000);
    document.getElementById("d").textContent=d;
    document.getElementById("h").textContent=h;
    document.getElementById("m").textContent=m;
    barra.style.width=(pct*100).toFixed(1)+"%";
    cuenta.style.opacity="1";
    // Ámbar en el último cuarto de vida o si quedan menos de 6 h.
    if(pct < 0.25 || rest < 6*3600000){
      var humano = d>0 ? d+" d "+h+" h" : (h>0 ? h+" h "+m+" min" : m+" min");
      set("amber","Próximo a caducar","Quedan "+humano+" de vida útil");
    } else {
      set("ok","Correcto","En vida útil");
    }
  }
  tick(); setInterval(tick, 1000);
})();
</script>
</body></html>`;
}

module.exports = {
  createLabel,
  registrarImpresion,
  guardarHistorial,
  renderEtiquetaHTML,
  renderFichaLoteHTML,
  generateQRCode,
  urlFichaLote,
  urlFichaPrep,
};
