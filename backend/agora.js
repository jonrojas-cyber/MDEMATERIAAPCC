// Integración con Ágora TPV.
//
// Ágora no ofrece una API REST pública de tiempo real; exporta datos (Excel/CSV)
// y hace un envío diario a su plataforma. Por eso integramos por CSV: se importa
// el export de ventas de Ágora y se descuenta automáticamente el stock de
// materias según el escandallo de cada producto.

const fs = require("fs");
const store = require("./data-store");

// Detecta el delimitador (; típico en Excel español, o ,) y parsea el CSV.
function parseCSV(texto) {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lineas.length) return [];
  const delim = (lineas[0].match(/;/g) || []).length >= (lineas[0].match(/,/g) || []).length ? ";" : ",";
  const cabecera = lineas[0].split(delim).map((c) => c.trim().toLowerCase());
  return lineas.slice(1).map((linea) => {
    const celdas = linea.split(delim);
    const fila = {};
    cabecera.forEach((col, i) => (fila[col] = (celdas[i] || "").trim()));
    return fila;
  });
}

function buscarCampo(fila, nombres) {
  for (const n of nombres) {
    if (fila[n] != null && fila[n] !== "") return fila[n];
  }
  return null;
}

function num(v) {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : parseFloat(v) || 0;
}

// Importa ventas desde el texto CSV de Ágora. Descuenta stock de materias según
// el escandallo de cada producto y registra cada venta. Devuelve un resumen.
function importarVentas(texto, fuente = "csv") {
  const filas = parseCSV(texto);
  const productos = store.readAll("productos");
  const materias = store.readAll("materias");
  const ventas = store.readAll("ventas");

  const idxProd = {};
  productos.forEach((p) => {
    if (p.clave) idxProd[p.clave.toLowerCase()] = p;
    if (p.nombre) idxProd[p.nombre.toLowerCase()] = p;
    if (p.id) idxProd[p.id.toLowerCase()] = p;
  });
  const idxMat = {};
  materias.forEach((m) => (idxMat[m.id] = m));

  let importadas = 0;
  const noReconocidos = [];

  filas.forEach((fila) => {
    const nombre = buscarCampo(fila, ["producto", "articulo", "artículo", "nombre", "descripcion", "descripción"]);
    const cantidad = num(buscarCampo(fila, ["cantidad", "uds", "unidades", "qty"])) || 1;
    const importe = num(buscarCampo(fila, ["importe", "total", "precio", "pvp"]));
    const fecha = buscarCampo(fila, ["fecha", "hora", "fechahora", "fecha_hora"]) || new Date().toISOString();
    if (!nombre) return;

    const producto = idxProd[String(nombre).toLowerCase()];
    if (!producto) {
      noReconocidos.push(nombre);
      return;
    }

    // Descontar stock de materias según el escandallo.
    (producto.ingredientes || []).forEach((ing) => {
      const m = idxMat[ing.materia_id];
      if (m) {
        m.disponibilidad_actual = Math.max(0, Math.round((m.disponibilidad_actual - ing.cantidad * cantidad) * 100) / 100);
      }
    });

    ventas.push({
      id: store.nextId("ven", "ventas"),
      producto_id: producto.id,
      producto: producto.nombre,
      cantidad,
      importe,
      fecha,
      fuente,
      importado_en: new Date().toISOString(),
    });
    importadas += cantidad;
  });

  store.writeAll("materias", materias);
  store.writeAll("ventas", ventas);

  const resumen = {
    fuente,
    lineas: filas.length,
    ventas_importadas: importadas,
    productos_no_reconocidos: [...new Set(noReconocidos)],
    cuando: new Date().toISOString(),
  };
  registrarSync(resumen);
  return resumen;
}

function registrarSync(resumen) {
  store.insert("sincronizaciones", { id: store.nextId("syn", "sincronizaciones"), ...resumen });
}

function ultimaSync() {
  const syncs = store.readAll("sincronizaciones");
  if (!syncs.length) return null;
  return syncs[syncs.length - 1];
}

// Tarea horaria: si hay un CSV configurado (AGORA_CSV_PATH), lo importa.
function cronImport() {
  const path = process.env.AGORA_CSV_PATH;
  if (!path) return; // sin fuente configurada, no hace nada
  try {
    if (!fs.existsSync(path)) return;
    const texto = fs.readFileSync(path, "utf-8");
    const r = importarVentas(texto, "cron");
    console.log(`Ágora cron: ${r.ventas_importadas} ventas importadas desde ${path}`);
  } catch (e) {
    console.error("Ágora cron error:", e.message);
  }
}

module.exports = { parseCSV, importarVentas, ultimaSync, cronImport };
