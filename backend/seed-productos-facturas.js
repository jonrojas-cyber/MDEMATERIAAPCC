// SEED · productos por proveedor extraídos de las FACTURAS del 3T 2026 (gestoría).
// ─────────────────────────────────────────────────────────────────────────────
// Enlaza cada producto que aparece en las facturas con su proveedor, como catálogo
// de COMPRA (entidad `compras_productos`), para que el buscador de Pedidos muestre
// la lista real de cada proveedor con su precio. Principios:
//  · No se inventa nada: solo lo que las facturas desglosan (precio sin IVA + IVA).
//  · Idempotente: se aplica una vez (flag en `config`) y cada fila tiene id estable.
//  · Se reaprovechan los proveedores que ya existen (match por CIF tolerante y por
//    nombre sin la forma jurídica); si no, se crea el proveedor (WhatsApp vacío,
//    para que la fundadora lo complete). Nunca se duplica un proveedor existente.
//  · Las facturas-resumen (solo albaranes) no traen productos: su proveedor existe
//    igual, pero sin catálogo (hace falta el albarán para el detalle).
const DATA = require("./seed-data/productos-proveedores-3t2026.json");
const FLAG = "seed_facturas_3t2026_v1";

function norm(s) {
  return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function normNombre(s) {
  // Quita la forma jurídica para comparar nombres de empresa.
  return norm(s).replace(/\b(s l u|s l|s a u|s a|slu|sl|sa|scp|s c|cb|sll|group|grupo|bakery)\b/g, "").replace(/\s+/g, " ").trim();
}
function normCif(s) { return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function cifMatch(a, b) {
  const x = normCif(a), y = normCif(b);
  if (!x || !y || x.length < 7 || y.length < 7) return false;
  return x === y || x.startsWith(y) || y.startsWith(x); // tolera la letra de control que falte
}
function slug(s) { return norm(s).replace(/\s+/g, "-").slice(0, 36); }

function matchProveedor(existentes, p) {
  if (p.cif) { const c = existentes.find((e) => cifMatch(e.cif || e.nif_cif || e.nif, p.cif)); if (c) return c; }
  const n = normNombre(p.nombre), nf = normNombre((p.carpeta || "").replace(/_/g, " "));
  return existentes.find((e) => {
    const en = normNombre(e.nombre || "");
    if (!en) return false;
    return (n && (en === n || (n.length >= 6 && (en.includes(n) || n.includes(en))))) ||
           (nf && (en === nf || (nf.length >= 6 && (en.includes(nf) || nf.includes(en)))));
  });
}

function aplicar(st) {
  if ((st.readAll("config") || []).some((c) => c && c.id === FLAG)) return null; // ya aplicado
  // COPIA: readAll puede devolver el array interno por referencia; si hiciéramos
  // push sobre él, insertaríamos el proveedor dos veces (una el push, otra insert).
  const existentes = (st.readAll("proveedores") || []).slice();
  const ahora = new Date().toISOString();
  let nProv = 0, nProd = 0, nProvCreados = [];

  (DATA.proveedores || []).forEach((p) => {
    let prov = matchProveedor(existentes, p);
    let provId;
    if (prov) {
      provId = prov.id;
      const patch = {};
      if (!prov.cif && !prov.nif_cif && p.cif) patch.cif = p.cif;
      if (!prov.categoria && p.categoria) patch.categoria = p.categoria;
      if (Object.keys(patch).length) st.update("proveedores", provId, patch);
    } else {
      provId = "prov-f-" + slug(p.carpeta);
      if (!st.findById("proveedores", provId)) {
        const nuevo = {
          id: provId, nombre: p.nombre || (p.carpeta || "").replace(/_/g, " "),
          cif: p.cif || "", categoria: p.categoria || "Otros", estado: "Activo",
          whatsapp: "", contacto: "", email: "", dias_reparto: [], productos_asociados: [],
          origen: "factura_3t2026", notas: p.notas || "",
        };
        st.insert("proveedores", nuevo);
        existentes.push(nuevo);
        nProv++; nProvCreados.push(nuevo.nombre);
      }
    }
    (p.productos || []).forEach((prod, i) => {
      if (!prod || !prod.nombre) return;
      const id = "cpr-f-" + slug(p.carpeta) + "-" + String(i + 1).padStart(3, "0");
      if (st.findById("compras_productos", id)) return;
      st.insert("compras_productos", {
        id, proveedor_id: provId, nombre: String(prod.nombre).trim(),
        categoria: p.categoria || "Otros",
        formato: prod.unidad || "ud", cantidad_formato: 1,
        precio_sin_iva: Number(prod.precio_sin_iva) || 0,
        iva: prod.iva_pct != null ? Number(prod.iva_pct) : 10,
        origen: "factura_3t2026", creado_en: ahora, estado: "Completo",
      });
      nProd++;
    });
  });

  st.insert("config", { id: FLAG, aplicado_en: ahora, proveedores_nuevos: nProv, productos: nProd });
  return { proveedores_nuevos: nProv, productos: nProd, nombres: nProvCreados };
}

module.exports = { aplicar, matchProveedor, normNombre, cifMatch, FLAG };
