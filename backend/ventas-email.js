// INGESTA DE VENTAS DE ÁGORA POR CORREO
// ─────────────────────────────────────────────────────────────────────────────
// La vía MÁS SIMPLE de conectar Ágora: sin instalar nada en el local y sin activar
// la API de Ágora. La fundadora (o un envío programado de Ágora) manda el export
// "Análisis de Ventas" (CSV o Excel) al MISMO buzón donde ya reenvía las facturas.
// El webhook de correo entrante (Resend Inbound / Zapier / Make) cae en el mismo
// endpoint /facturas/ingesta; aquí se detecta que el adjunto es un export de VENTAS
// (no una factura) y se importa SOLO, con el MISMO motor que la importación manual
// (ventas-export.importarReemplazando: reemplaza el mes, guarda el neto, idempotente).
//
// Fuente única: cae en las mismas entidades `ventas`/`docs_agora` que la importación
// manual y que el conector en tiempo real. Nada se calcula dos veces.

const ventasExport = require("./ventas-export");

// Un adjunto es "hoja de cálculo" (posible export de ventas) por extensión o tipo.
const RE_HOJA_EXT = /\.(csv|xlsx|xls|tsv)$/i;
const RE_HOJA_MIME = /(csv|excel|spreadsheet|officedocument\.spreadsheet|tab-separated)/i;
// Marca de que el correo trae VENTAS de Ágora (en asunto o en el nombre del fichero).
// Conservador: así una factura en Excel no se confunde con un export de ventas.
const RE_VENTAS = /(venta|análisis de venta|analisis de venta|á?gora|export.*venta)/i;

function esHoja(a) {
  const f = String((a && (a.filename || a.name)) || "");
  const m = String((a && (a.mediaType || a.content_type || a.type)) || "");
  return RE_HOJA_EXT.test(f) || RE_HOJA_MIME.test(m);
}

// ¿Este correo es el export de ventas de Ágora? Debe traer una hoja (CSV/Excel) Y
// una marca de "ventas" en el asunto o en el nombre de algún adjunto.
function esCorreoDeVentas(payload) {
  const p = payload || {};
  const adj = Array.isArray(p.attachments) ? p.attachments : [];
  const hojas = adj.filter(esHoja);
  if (!hojas.length) return false;
  const subject = String(p.subject || "");
  if (RE_VENTAS.test(subject)) return true;
  return hojas.some((a) => RE_VENTAS.test(String((a && (a.filename || a.name)) || "")));
}

function bufDe(a) {
  const raw = (a && (a.base64 || a.content || a.content_b64 || a.data)) || "";
  if (raw && typeof raw === "object" && Array.isArray(raw.data)) return Buffer.from(raw.data);
  const limpio = String(raw).replace(/^data:[^,]+,/, "").replace(/\s+/g, "");
  return Buffer.from(limpio, "base64");
}

// Importa las ventas de TODOS los adjuntos-hoja del correo. Devuelve un resumen.
// No lanza por un adjunto que no parsee: lo cuenta en `ignorados`.
async function ingestar(store, payload) {
  const p = payload || {};
  const hojas = (Array.isArray(p.attachments) ? p.attachments : []).filter(esHoja);
  const agora = require("./agora");
  let procesados = 0, bloqueados = 0, importados_de = 0, lineas = 0;
  const meses = new Set();
  const noVinculados = new Set();
  const ignorados = [];

  for (const a of hojas) {
    try {
      const buf = bufDe(a);
      // 1) Motor "Análisis de Ventas" (día/ticket/producto): reemplaza el/los mes(es).
      const rep = ventasExport.importarReemplazando(store, buf);
      if (rep.docs > 0) {
        const co = rep.resultado || {};
        procesados += co.procesados || 0;
        bloqueados += co.bloqueados || 0;
        lineas += rep.docs;
        (rep.meses || []).forEach((m) => meses.add(m));
        (co.productos_no_vinculados || []).forEach((n) => noVinculados.add(n));
        importados_de++;
        continue;
      }
      // 2) CSV plano (producto;cantidad;importe;fecha) → lector antiguo.
      const txt = buf.toString("utf8");
      if (/[;,]/.test(txt) && /\n/.test(txt)) {
        const r = agora.importarVentas(txt, "email");
        if (r.ventas_importadas > 0) {
          procesados += r.ventas_importadas; importados_de++;
          (r.productos_no_reconocidos || []).forEach((n) => noVinculados.add(n));
          continue;
        }
      }
      ignorados.push(String((a && (a.filename || a.name)) || "adjunto"));
    } catch (e) {
      ignorados.push(String((a && (a.filename || a.name)) || "adjunto") + " (" + e.message + ")");
    }
  }

  if (importados_de > 0 && store.flush) await store.flush();
  return {
    ok: importados_de > 0,
    origen: "email",
    adjuntos: hojas.length,
    importados_de,
    ventas_procesadas: procesados,
    bloqueados,
    lineas,
    meses: [...meses],
    productos_no_vinculados: [...noVinculados],
    ignorados,
    de: p.from || null,
    asunto: p.subject || null,
    cuando: new Date().toISOString(),
  };
}

module.exports = { esCorreoDeVentas, ingestar, esHoja };
