// SINCRONIZACIÓN DE PRODUCTOS DESDE ÁGORA
// ─────────────────────────────────────────────────────────────────────────────
// Hoy Ágora llega por el CONECTOR (export de ventas) y por IMPORT CSV; no hay una
// API de catálogo de productos en uso. Este módulo implementa "Actualizar
// productos desde Ágora" a partir del EXPORT DE PRODUCTOS de Ágora (CSV/Excel→CSV).
//
// Principios (según el encargo):
//  · La CLAVE para evitar duplicados es el IDENTIFICADOR ÚNICO de Ágora (agora_id).
//  · Si un producto de la app no tiene agora_id, se intenta casar por NOMBRE
//    NORMALIZADO (sin mayúsculas/espacios/tildes). Solo si es inequívoco.
//  · Nunca se fusionan dos productos distintos por nombres parecidos: si hay duda,
//    se marcan "pendiente de revisar" y se listan en el informe (revisión manual).
//  · Los campos PROPIOS de APPCC viven en otra entidad (appcc_fichas) y NO se tocan.
//  · Los productos que ya no están / quedan inactivos en Ágora NO se borran: se
//    marcan inactivo (se conservan historial y lotes).
//  · Arquitectura lista para una API oficial futura: basta alimentar `filas` desde
//    la API en vez del CSV; el resto no cambia.

// Normalización para COMPARAR (no para mostrar): ignora mayúsculas, tildes,
// espacios dobles/extremos y símbolos irrelevantes.
function norm(s) {
  return String(s == null ? "" : s)
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// Parser CSV tolerante (delimitador ; o ,). Devuelve filas como objetos por cabecera.
function parseCSV(texto) {
  const lineas = String(texto || "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lineas.length) return [];
  const delim = (lineas[0].match(/;/g) || []).length >= (lineas[0].match(/,/g) || []).length ? ";" : ",";
  const split = (l) => {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === delim) { out.push(cur); cur = ""; } else cur += c;
    }
    out.push(cur); return out.map((x) => x.trim());
  };
  const cab = split(lineas[0]).map((h) => norm(h));
  return lineas.slice(1).map((l) => {
    const celdas = split(l); const o = {};
    cab.forEach((h, i) => { o[h] = celdas[i] != null ? celdas[i] : ""; });
    return o;
  });
}

function campo(fila, nombres) {
  for (const n of nombres) { const k = norm(n); if (fila[k] != null && fila[k] !== "") return fila[k]; }
  return "";
}
function aBool(v, def) {
  const s = norm(v);
  if (["1", "si", "true", "activo", "s", "x", "yes"].includes(s)) return true;
  if (["0", "no", "false", "inactivo", "baja"].includes(s)) return false;
  return def;
}
function aNum(v) { const n = parseFloat(String(v).replace(/[^0-9,.-]/g, "").replace(",", ".")); return isNaN(n) ? null : n; }

// Extrae los campos de Ágora de una fila (mapeo tolerante de cabeceras ES).
function filaAgora(fila) {
  const agora_id = campo(fila, ["id", "idarticulo", "id articulo", "codigo articulo", "articulo id", "guid", "referencia interna", "id agora", "idagora"]);
  const nombre = campo(fila, ["nombre", "descripcion", "articulo", "nombre articulo", "producto", "nombre comercial"]);
  if (!nombre && !agora_id) return null;
  return {
    agora_id: String(agora_id || "").trim(),
    nombre: String(nombre || "").trim(),
    familia: campo(fila, ["familia", "family"]) || null,
    subfamilia: campo(fila, ["subfamilia", "subfamily"]) || null,
    codigo: campo(fila, ["codigo", "code", "referencia", "ref"]) || null,
    codigo_barras: campo(fila, ["codigo de barras", "codigo barras", "ean", "barcode", "codbarras"]) || null,
    unidad_venta: campo(fila, ["unidad", "unidad de venta", "formato", "ud venta"]) || null,
    activo: aBool(campo(fila, ["activo", "estado", "active", "alta"]), true),
    precio: aNum(campo(fila, ["precio", "pvp", "precio venta", "price"])),
    actualizado: campo(fila, ["fecha", "actualizado", "ultima actualizacion", "modificado", "fecha modificacion"]) || null,
  };
}

// Campos que SÍ gobierna Ágora (se actualizan). El resto del producto (ingredientes,
// precio_venta propio, categoría de carta…) y la ficha APPCC NO se tocan.
const CAMPOS_AGORA = ["nombre", "familia", "subfamilia", "codigo", "codigo_barras", "unidad_venta", "precio_agora", "activo_agora", "actualizado_agora", "agora_id"];

// Motor puro. productos = copia de los productos de la app. filas = del CSV.
// Devuelve { productos: [actualizados...], upserts:[...], informe }.
function sincronizar(productos, filasCsv, opts) {
  opts = opts || {};
  const now = opts.now || new Date().toISOString();
  const filas = (filasCsv || []).map(filaAgora).filter(Boolean);

  // Índices de los productos actuales.
  const porAgoraId = new Map();
  const porNombre = new Map(); // norm(nombre) -> [productos]
  productos.forEach((p) => {
    if (p.agora_id) porAgoraId.set(String(p.agora_id), p);
    const k = norm(p.nombre); if (!k) return;
    if (!porNombre.has(k)) porNombre.set(k, []);
    porNombre.get(k).push(p);
  });

  const informe = { nuevos: [], actualizados: [], sin_cambios: [], posibles_duplicados: [], desactivados: [], errores: [], fecha: now, usuario: opts.usuario || "", total_csv: filas.length };
  const upserts = []; // productos a insertar/actualizar
  const vistosAgoraId = new Set();
  const vistosNombreCsv = new Map(); // detecta 2 filas CSV con mismo nombre normalizado

  filas.forEach((f) => {
    try {
      const kn = norm(f.nombre);
      // Duplicado DENTRO del propio CSV (dos filas, mismo nombre, distinto id).
      if (kn) {
        if (vistosNombreCsv.has(kn) && vistosNombreCsv.get(kn) !== f.agora_id) {
          informe.posibles_duplicados.push({ nombre: f.nombre, agora_id: f.agora_id, motivo: "dos filas en Ágora con el mismo nombre" });
        }
        vistosNombreCsv.set(kn, f.agora_id);
      }
      if (f.agora_id) vistosAgoraId.add(String(f.agora_id));

      // 1) Casar por agora_id (clave principal).
      let p = f.agora_id ? porAgoraId.get(String(f.agora_id)) : null;
      let via = "id";
      // 2) Si no, por nombre normalizado inequívoco (y el producto no tiene otro agora_id).
      if (!p && kn && porNombre.has(kn)) {
        const cand = porNombre.get(kn).filter((x) => !x.agora_id || x.agora_id === f.agora_id);
        if (cand.length === 1) { p = cand[0]; via = "nombre"; }
        else if (cand.length > 1) {
          informe.posibles_duplicados.push({ nombre: f.nombre, agora_id: f.agora_id, motivo: "varios productos en la app con ese nombre" });
        }
      }

      const campos = {
        nombre: f.nombre || (p && p.nombre),
        familia: f.familia, subfamilia: f.subfamilia, codigo: f.codigo, codigo_barras: f.codigo_barras,
        unidad_venta: f.unidad_venta, precio_agora: f.precio, activo_agora: f.activo,
        actualizado_agora: f.actualizado || now, agora_id: f.agora_id || (p && p.agora_id) || null,
        origen_agora: true,
      };

      if (!p) {
        // Nuevo producto desde Ágora.
        const id = "prod-agora-" + (f.agora_id ? String(f.agora_id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32) : norm(f.nombre).replace(/\s+/g, "-").slice(0, 40));
        const nuevo = { id, clave: f.nombre, nombre: f.nombre, categoria: f.familia || "Ágora", activo: true, ingredientes: [], ...campos, creado_en: now };
        upserts.push(nuevo);
        informe.nuevos.push({ id, nombre: f.nombre, agora_id: f.agora_id });
      } else {
        // Actualiza SOLO los campos de Ágora (nunca ingredientes/PVP propio/APPCC).
        const cambios = {};
        CAMPOS_AGORA.forEach((c) => { if (campos[c] !== undefined && campos[c] !== p[c]) cambios[c] = campos[c]; });
        if (p.activo === false && f.activo) cambios.activo = true; // reactivar si vuelve en Ágora
        if (Object.keys(cambios).length) {
          upserts.push({ ...p, ...cambios });
          informe.actualizados.push({ id: p.id, nombre: campos.nombre, agora_id: campos.agora_id, via, campos: Object.keys(cambios) });
        } else {
          informe.sin_cambios.push({ id: p.id, nombre: p.nombre });
        }
      }
    } catch (e) { informe.errores.push({ fila: f && f.nombre, error: e.message }); }
  });

  // Productos de Ágora que YA NO vienen en el CSV → marcar inactivo (no borrar).
  productos.forEach((p) => {
    if (!p.agora_id || vistosAgoraId.has(String(p.agora_id))) return;
    if (p.activo_agora === false && p.activo === false) return; // ya estaba inactivo
    upserts.push({ ...p, activo_agora: false, activo: false, baja_agora_en: now });
    informe.desactivados.push({ id: p.id, nombre: p.nombre, agora_id: p.agora_id });
  });

  return { upserts, informe };
}

// Estado de sincronización de un producto (para mostrar en la app).
function estadoProducto(p, ficha) {
  if (p.activo_agora === false || p.activo === false) return "inactivo";        // inactivo en Ágora
  if (!p.agora_id && !p.origen_agora && !String(p.id).startsWith("prod-agora")) return "manual"; // creado a mano
  const vida = ficha && ficha.vida_util_dias != null;
  if (!vida) return "appcc_incompleta";
  return "listo";
}

module.exports = { norm, parseCSV, filaAgora, sincronizar, estadoProducto, CAMPOS_AGORA };
