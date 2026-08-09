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
  @page { size: 90mm 40mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 90mm; height: 40mm; overflow: hidden; }
  body { font-family: 'Courier Prime', 'Courier New', monospace; color: #000; background: #fff; -webkit-font-smoothing: none; }
  .label { width: 90mm; height: 40mm; border: 0.4mm solid #000; display: flex; align-items: stretch; page-break-inside: avoid; }
  /* Columna QR (izquierda). */
  .qr { width: 22mm; flex: 0 0 22mm; border-right: 0.3mm solid #000; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1.6mm 1mm; }
  .qr img { width: 17mm; height: 17mm; display: block; image-rendering: pixelated; background: #fff; }
  .qr .code { font-size: 7.5px; font-weight: 700; letter-spacing: 0.6px; margin-top: 1.3mm; text-align: center; line-height: 1.05; word-break: break-all; }
  /* Columna principal. */
  .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .top { flex: 1; padding: 2.2mm 2.6mm 1.2mm; display: flex; flex-direction: column; min-width: 0; }
  .titulo-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 2mm; }
  .titulo { font-size: 14px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; line-height: 1.05;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .mark { display: flex; align-items: flex-end; gap: 0.6mm; flex: 0 0 auto; margin-top: 0.6mm; }
  .mark i { display: block; width: 0.5mm; height: 3.2mm; background: #000; }
  .mark i:nth-child(2) { height: 4mm; }
  .subtitulo { font-size: 10px; text-transform: lowercase; letter-spacing: 0.3px; margin-top: 0.9mm;
               white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rule { border-top: 0.2mm solid #000; margin: 1.5mm 0 1.3mm; }
  .fecha { font-size: 9px; letter-spacing: 0.2px; text-transform: lowercase; line-height: 1.55; white-space: nowrap; }
  .fecha b { font-weight: 700; }
  .fecha.vence b { font-size: 11.5px; }
  .prueba { font-size: 8px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase;
            border: 0.25mm solid #000; padding: 0.4mm 1.6mm; display: inline-block; margin-top: 1mm; align-self: flex-start; }
  .foot { border-top: 0.3mm solid #000; padding: 1.3mm 2.6mm; }
  .legal { font-size: 6.5px; letter-spacing: 0.2px; text-transform: uppercase; line-height: 1.35; }
  /* Columna cantidad (derecha), en vertical. */
  .cant { width: 7.5mm; flex: 0 0 7.5mm; border-left: 0.3mm solid #000; display: flex; align-items: center; justify-content: center; }
  .cant span { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: lowercase; white-space: nowrap; }
  @media screen { body { background: #ddd; padding: 16px; max-width: 560px; margin: 0 auto; } .label { box-shadow: 0 0 0 1px #999; background:#fff; }
    .toolbar{font-family:sans-serif;margin-bottom:14px;display:flex;flex-wrap:wrap;gap:9px;align-items:center;}
    .toolbar .primary{flex-basis:100%;font-size:18px;font-weight:700;padding:18px 16px;border-radius:14px;border:0;background:#2a332b;color:#fff;cursor:pointer;}
    .toolbar button.ghost{font-family:inherit;font-size:13px;font-weight:600;padding:9px 14px;border-radius:10px;border:1px solid #999;background:#fff;color:#333;cursor:pointer;}
    .toolbar .opt{font-size:12px;color:#444;display:flex;align-items:center;gap:5px;}
    .toolbar .opt input{width:66px;font-size:13px;padding:5px 6px;border:1px solid #999;border-radius:7px;}
    .toolbar .hint{font-size:11.5px;color:#666;flex-basis:100%;line-height:1.4;}
    .btlog{flex-basis:100%;font-family:ui-monospace,monospace;font-size:11px;background:#111;color:#7bd88f;padding:8px 10px;border-radius:8px;max-height:140px;overflow:auto;white-space:pre-wrap;margin:0;display:none;}
    .btlog.on{display:block;} }
  @media print { html, body { width: 90mm; height: 40mm; margin: 0; padding: 0; overflow: hidden; } .toolbar { display: none; } .label { box-shadow: none; margin: 0; } }
</style></head>
<body>
  <div class="toolbar">
    <button class="primary" onclick="btPrint()">🖨️ Imprimir directo (Bluetooth)</button>
    <button class="ghost" onclick="compartirPDF()">📄 PDF 90×40</button>
    <button class="ghost" onclick="window.print()">🖨️ Navegador</button>
    <label class="opt">ancho <input id="btw" type="number" value="720" step="8" min="200" max="1200"> pts</label>
    <span class="hint"><b>Imprimir directo</b> conecta por Bluetooth con la Phomemo D520BT y sale sin pasar por Labelife (Android + Chrome). La 1ª vez eliges la impresora; luego va directa. <b>PDF 90×40</b> te da la etiqueta como PDF a tamaño exacto (imprime sin reescalar). Si algo falla en directo, cópiame el registro de abajo.</span>
    <pre id="btlog" class="btlog"></pre>
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
    function descargar(blob, ext){
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'etiqueta-' + CODE + '.' + (ext || 'pdf');
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
    }
    // Construye un PDF (sin librerías) con una única página de 90×40 mm y la
    // etiqueta como imagen 1-bit a página completa: imprime a tamaño exacto,
    // sin reescalar, en cualquier visor/impresora.
    function buildPdf(mono){
      var W = mono.bytesPerRow * 8, H = mono.height, bits = mono.data;
      var pw = (90/25.4*72).toFixed(3), ph = (40/25.4*72).toFixed(3);  // 255.118 × 113.386 pt
      var enc = new TextEncoder(), chunks = [], off = [], pos = 0;
      function push(x){ var b = (typeof x === 'string') ? enc.encode(x) : x; chunks.push(b); pos += b.length; }
      function mark(n){ off[n] = pos; }
      push("%PDF-1.4\n");
      mark(1); push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
      mark(2); push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
      mark(3); push("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+pw+" "+ph+"] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n");
      var content = "q "+pw+" 0 0 "+ph+" 0 0 cm 0 g /Im0 Do Q\n";
      mark(4); push("4 0 obj\n<< /Length "+content.length+" >>\nstream\n"+content+"endstream\nendobj\n");
      mark(5); push("5 0 obj\n<< /Type /XObject /Subtype /Image /Width "+W+" /Height "+H+" /ImageMask true /BitsPerComponent 1 /Decode [1 0] /Length "+bits.length+" >>\nstream\n");
      push(bits); push("\nendstream\nendobj\n");
      var xrefPos = pos, n = 6, xref = "xref\n0 "+n+"\n0000000000 65535 f \n";
      for(var i=1;i<n;i++){ xref += ("0000000000"+off[i]).slice(-10)+" 00000 n \n"; }
      push(xref);
      push("trailer\n<< /Size "+n+" /Root 1 0 R >>\nstartxref\n"+xrefPos+"\n%%EOF");
      return new Blob(chunks, { type: 'application/pdf' });
    }
    // Pre-genera el PDF (1-bit a ~305 dpi) al cargar, para que al tocar el botón
    // el compartir se lance al instante DENTRO del gesto (fiable en Android).
    var _pdfPromise = null;
    function prepararPdf(){ if (!_pdfPromise) _pdfPromise = rasterMono(720).then(buildPdf); return _pdfPromise; }
    window.addEventListener('load', function(){ setTimeout(function(){ prepararPdf().catch(function(){ _pdfPromise = null; }); }, 60); });
    function conPdf(fn){
      prepararPdf().then(fn).catch(function(e){ _pdfPromise = null; alert('No se pudo generar el PDF: ' + e.message); });
    }
    window.descargarEtiqueta = function(){ conPdf(function(b){ descargar(b, 'pdf'); }); };
    window.compartirPDF = function(){
      conPdf(function(blob){
        var file = new File([blob], 'etiqueta-' + CODE + '.pdf', { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: 'Etiqueta ' + CODE, text: 'Etiqueta m de materia · ' + CODE })
            .catch(function(e){ if (e && e.name !== 'AbortError') descargar(blob, 'pdf'); });
        } else {
          descargar(blob, 'pdf');
        }
      });
    };

    // ── IMPRESIÓN DIRECTA POR BLUETOOTH (sin Labelife) ───────────────────────
    // Rasteriza la etiqueta a 1 bit al ancho del cabezal y la manda por ESC/POS
    // (GS v 0) a la Phomemo D520BT. Reconecta sola tras la 1ª vez (getDevices).
    function log(m){ var el=document.getElementById('btlog'); if(el){ el.classList.add('on'); el.textContent += m + "\n"; el.scrollTop = el.scrollHeight; } }
    var SERVICIOS = [0xff00, 0xff10, 0xffe0, 0x18f0, 0xfff0,
      '0000ff00-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455',
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2'];
    // Rasteriza al ancho pedido (en puntos) y devuelve {bytesPerRow,height,data}.
    function rasterMono(dotsWide){
      return new Promise(function(resolve, reject){
        var el = document.querySelector('.label');
        var w = el.offsetWidth, h = el.offsetHeight;
        // Ancho byte-alineado; ALTO exacto por el físico 90×40 mm (no por el
        // redondeo de píxeles), así el raster es siempre 1 etiqueta: 720×320 a 203 dpi.
        var Wp = Math.round(dotsWide/8)*8, scale = Wp/w, Hp = Math.round(Wp * 40/90);
        var css=''; document.querySelectorAll('style').forEach(function(s){ css += s.textContent; });
        var xml = new XMLSerializer().serializeToString(el);
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="'+Wp+'" height="'+Hp+'">'
          + '<foreignObject x="0" y="0" width="'+Wp+'" height="'+Hp+'">'
          + '<div xmlns="http://www.w3.org/1999/xhtml" style="transform:scale('+scale+');transform-origin:top left;width:'+w+'px;height:'+h+'px;background:#fff;">'
          + '<style>'+css+'</style>' + xml + '</div></foreignObject></svg>';
        var img = new Image();
        img.onload = function(){
          var c = document.createElement('canvas'); c.width = Wp; c.height = Hp;
          var ctx = c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,Wp,Hp); ctx.drawImage(img,0,0);
          var d = ctx.getImageData(0,0,Wp,Hp).data, bpr = Wp/8, out = new Uint8Array(bpr*Hp);
          for(var y=0;y<Hp;y++){ for(var x=0;x<Wp;x++){ var i=(y*Wp+x)*4;
            var lum = d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114;
            if(d[i+3]>128 && lum<128){ out[y*bpr + (x>>3)] |= (0x80 >> (x&7)); } } }
          resolve({ bytesPerRow: bpr, height: Hp, data: out });
        };
        img.onerror = function(){ reject(new Error('rasterizado')); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      });
    }
    function escpos(mono){
      var head = [0x1B,0x40, 0x1D,0x76,0x30,0x00,
        mono.bytesPerRow & 0xff, (mono.bytesPerRow>>8)&0xff, mono.height & 0xff, (mono.height>>8)&0xff];
      var feed = [0x1B,0x64,0x04];              // avanza 4 líneas para poder cortar
      var out = new Uint8Array(head.length + mono.data.length + feed.length);
      out.set(head,0); out.set(mono.data, head.length); out.set(feed, head.length + mono.data.length);
      return out;
    }
    function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
    async function pickDevice(){
      if(navigator.bluetooth.getDevices){ try{ var ds = await navigator.bluetooth.getDevices();
        if(ds && ds.length){ log('impresora recordada: '+(ds[0].name||ds[0].id)); return ds[0]; } }catch(e){} }
      log('elige la impresora…');
      return await navigator.bluetooth.requestDevice({ acceptAllDevices:true, optionalServices: SERVICIOS });
    }
    async function findWritable(server){
      var svcs = await server.getPrimaryServices();
      for(var s=0;s<svcs.length;s++){ var chars = await svcs[s].getCharacteristics();
        for(var c=0;c<chars.length;c++){ var p = chars[c].properties;
          if(p.write || p.writeWithoutResponse){ log('canal: '+chars[c].uuid); return chars[c]; } } }
      throw new Error('sin canal de escritura');
    }
    async function sendChunks(ch, data){
      var CH = 160, wnr = ch.properties.writeWithoutResponse;
      for(var i=0;i<data.length;i+=CH){ var s = data.slice(i, i+CH);
        try { wnr ? await ch.writeValueWithoutResponse(s) : await ch.writeValue(s); }
        catch(e){ await ch.writeValue(s); }      // reintento con respuesta si el canal sin respuesta falla
        await sleep(12); }
    }
    window.btPrint = async function(){
      if(!navigator.bluetooth){ alert('Este navegador no tiene Bluetooth web. Abre la etiqueta en Chrome (Android).'); return; }
      var btn = document.querySelector('.toolbar .primary'); if(btn) btn.disabled = true;
      try{
        var dotsWide = Math.round((parseInt(document.getElementById('btw').value,10) || 720)/8)*8;
        log('conectando…');
        var dev = await pickDevice();
        dev.addEventListener && dev.addEventListener('gattserverdisconnected', function(){ log('desconectada'); });
        var server = await dev.gatt.connect();
        log('conectada a '+(dev.name||'impresora'));
        var ch = await findWritable(server);
        log('rasterizando '+dotsWide+' pts…');
        var mono = await rasterMono(dotsWide);
        log('enviando '+mono.height+' líneas ('+(mono.bytesPerRow*mono.height)+' bytes)…');
        await sendChunks(ch, escpos(mono));
        await sleep(150);
        log('impreso ✓');
      }catch(e){ log('error: '+(e && e.message ? e.message : e)); }
      finally{ if(btn) btn.disabled = false; }
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
