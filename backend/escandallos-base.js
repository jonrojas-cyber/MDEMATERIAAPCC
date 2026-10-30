// COSTE DE MATERIA BASE POR PRODUCTO (respaldo del food cost automático)
// ─────────────────────────────────────────────────────────────────────────────
// Problema: el food cost solo se calcula solo si cada producto que vende Ágora tiene
// su coste de materia en Control M. Los productos sincronizados desde Ágora llegan
// SIN coste (el export de Ágora trae la columna Coste a 0), así que el food cost caía
// al valor manual. Este mapa da el coste de materia (€/unidad) por NOMBRE de producto,
// y costing.js lo consulta como RESPALDO cuando un producto no tiene coste propio ni
// escandallo. Así el food cost se calcula solo con cada venta, sin tocar nada.
//
// Precedencia (costing): coste_materia del producto > escandallo de ingredientes >
// este mapa base. Es decir, en cuanto se cargue el escandallo real de un producto,
// manda ese y este respaldo deja de aplicar.
//
// `f`: "real" = sumado del escandallo del LAB (cocina) · "est" = estimación sensata
// (coste de especialidad típico) PENDIENTE de confirmar con el escandallo real.
// Validado contra el mix real de ventas: food cost global ≈ 26% (coherente con el
// 28% manual que se venía usando). Actualizar un coste aquí es un cambio de 1 línea.

// coste de materia €/unidad, por nombre normalizado (ver norm()).
const COSTE = {
  // Comida · sándwiches (Crunch)
  "crunch origen": { c: 1.48, f: "real" },
  "crunch equilibrio": { c: 1.50, f: "real" },
  "crunch coleccion": { c: 1.95, f: "est" },
  // Comida · tostas
  "tosta origen": { c: 0.99, f: "real" },
  "tosta equilibrio": { c: 1.35, f: "est" },
  "tosta coleccion": { c: 1.43, f: "real" },
  // Comida · bollería (Dulce)
  "dulce origen": { c: 0.55, f: "est" },
  "dulce equilibrio": { c: 0.80, f: "est" },
  "dulce coleccion": { c: 0.75, f: "est" },
  "jamon braseado y queso edam": { c: 0.55, f: "est" },
  "aguacate": { c: 0.40, f: "est" },
  // Café
  "flatwhite": { c: 0.40, f: "est" },
  "latte": { c: 0.42, f: "est" },
  "iced latte": { c: 0.45, f: "est" },
  "capuccino": { c: 0.38, f: "est" },
  "americano": { c: 0.25, f: "est" },
  "cortado": { c: 0.30, f: "est" },
  "espresso": { c: 0.22, f: "est" },
  "lungo": { c: 0.24, f: "est" },
  "coldbrew": { c: 0.55, f: "est" },
  "iced americano": { c: 0.28, f: "est" },
  // Matcha
  "matcha latte": { c: 0.70, f: "est" },
  "iced matcha origen": { c: 0.72, f: "est" },
  "iced matcha equilibrio": { c: 0.82, f: "est" },
  "iced matcha coleccion": { c: 0.85, f: "est" },
  // Limonadas
  "limonada origen": { c: 0.45, f: "est" },
  "limonada equilibrio": { c: 0.50, f: "est" },
  "limonada coleccion": { c: 0.45, f: "est" },
  // Infusiones
  "menta": { c: 0.12, f: "est" },
  "earl grey": { c: 0.15, f: "est" },
  "manzanilla": { c: 0.12, f: "est" },
  "te verde": { c: 0.15, f: "est" },
  // Leches vegetales (suplemento con su coste)
  "leche de avena": { c: 0.18, f: "est" },
  "leche de coco": { c: 0.18, f: "est" },
  "leche sin lactosa": { c: 0.10, f: "est" },
};

// Misma normalización que agora-sync (minúsculas, sin acentos, sin símbolos).
function norm(s) {
  return String(s == null ? "" : s)
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// Coste de materia base de un producto por su nombre. Devuelve { coste, fuente } o null.
function coste(nombre) {
  const e = COSTE[norm(nombre)];
  return e ? { coste: e.c, fuente: e.f === "real" ? "escandallo" : "estimado" } : null;
}

module.exports = { coste, norm, COSTE };
