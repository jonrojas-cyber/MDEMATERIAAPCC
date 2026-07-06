// ALTA AUTOMÁTICA DESDE ALBARÁN · al escanear un albarán, resuelve el proveedor
// (lo busca por CIF/nombre y, si no existe, lo crea) y da de alta las materias
// que aún no están en el almacén, clasificándolas en su categoría (macro→sub) y
// con su unidad de consumo. Reutiliza el clasificador y las unidades: no duplica
// reglas de negocio. El emparejado línea↔materia por palabras vive en la ruta.

const store = require("./data-store");
const { clasificar } = require("./clasificador");
const { dimension } = require("./unidades");

// Unidad de consumo canónica según la dimensión de la unidad del albarán:
// masa→g, volumen→ml, conteo/desconocida→ud.
function unidadConsumoDe(unidadAlbaran) {
  const d = dimension(unidadAlbaran);
  if (!d) return "ud";
  return d.base === "masa" ? "g" : d.base === "volumen" ? "ml" : "ud";
}

// ¿La línea es un producto real (y no un concepto de factura: portes, IVA, dto…)?
function esLineaProducto(desc) {
  const d = String(desc || "").trim();
  if (d.length < 3) return false;
  if (/^(portes?|transporte|env[ií]o|iva|i\.?v\.?a\.?|rec\.? ?equiv|recargo|dto|descuento|base imponible|total|subtotal|abono|retenci[oó]n)\b/i.test(d)) return false;
  return true;
}

// Normaliza un nombre para emparejar: minúsculas, sin acentos, sin forma jurídica
// (SL/SA/SLU…) ni puntuación. "Cafés García, S.L." ≡ "CAFES GARCIA".
function normNombre(s) {
  return String(s || "")
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\b(s\.?l\.?u?|s\.?a\.?|s\.?c\.?|s\.?l\.?n\.?e|cb|sociedad limitada|sociedad anonima)\b/g, "")
    .replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
}

// Busca un proveedor existente por CIF (exacto) o por nombre (uno contiene al otro).
function buscarProveedor(datos, proveedores) {
  const cif = String(datos.proveedor_cif || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (cif) {
    const porCif = proveedores.find((p) => String(p.cif || "").replace(/[^a-z0-9]/gi, "").toUpperCase() === cif);
    if (porCif) return porCif;
  }
  const n = normNombre(datos.proveedor);
  if (!n) return null;
  return proveedores.find((p) => { const pn = normNombre(p.nombre); return pn && (n.includes(pn) || pn.includes(n)); }) || null;
}

// Alta de un proveedor con los datos leídos de la cabecera del albarán.
function crearProveedorDesdeOCR(datos) {
  const tel = String(datos.proveedor_telefono || "").trim();
  const nuevo = {
    id: store.nextId("prov", "proveedores"),
    nombre: String(datos.proveedor || "").trim(),
    contacto: "",
    telefono: tel,
    email: String(datos.proveedor_email || "").trim(),
    direccion: String(datos.proveedor_direccion || "").trim(),
    cif: String(datos.proveedor_cif || "").trim(),
    categoria: "Otros",
    estado: "Activo",
    notas: "Alta automática al escanear un albarán.",
    foto_url: null,
    whatsapp: tel,
    dias_reparto: [],
    productos_asociados: [],
    origen: "albaran_auto",
    creado_en: new Date().toISOString(),
  };
  store.insert("proveedores", nuevo);
  return nuevo;
}

// Alta de una materia a partir de una línea de albarán: la clasifica en su
// categoría (macro→sub) y le pone la unidad de consumo correcta. Stock 0: el
// stock entra al ACEPTAR la recepción (flujo existente).
function crearMateriaDesdeLinea(linea, provId) {
  const nombre = String(linea.descripcion || "").trim();
  const { macro, sub } = clasificar(nombre);
  const unidad = unidadConsumoDe(linea.unidad);
  const cant = Number(linea.cantidad) || 0;
  const importe = Number(linea.importe) || 0;
  const coste = cant > 0 && importe > 0 ? Math.round((importe / cant) * 10000) / 10000 : 0;
  const nueva = {
    id: store.nextId("mat", "materias"),
    nombre,
    macro, subcategoria: sub,
    unidad,
    unidad_compra: linea.unidad || "",
    disponibilidad_actual: 0,
    stock_minimo: 0,
    coste_medio: coste,
    precio_compra: coste,
    proveedor_id: provId || null,
    local_id: "principal",
    origen: "albaran_auto",
    creado_en: new Date().toISOString(),
  };
  store.insert("materias", nueva);
  return nueva;
}

module.exports = {
  unidadConsumoDe, esLineaProducto, normNombre, buscarProveedor,
  crearProveedorDesdeOCR, crearMateriaDesdeLinea,
};
