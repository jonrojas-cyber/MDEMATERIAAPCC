// LIMPIEZA DE DATOS DE PRUEBA (una sola vez, en producción).
//
// Al desplegar por primera vez, los fixtures JSON del repo sembraron Postgres con
// datos de EJEMPLO (proveedores, materias, recetas, lotes y productos de prueba).
// La fundadora los da por no-existentes: irá metiendo los proveedores y productos
// reales. Aquí se retiran SOLO esos registros por su id exacto de la semilla
// original; cualquier cosa creada por el usuario (otro id) queda intacta.
//
// Lo REAL NO está en estas listas y por tanto NUNCA se toca: los cafés
// (prod-cafe-*), sus materias (mat-cafe-*/mat-leche-*), los costes fijos, los
// préstamos, la carta code-defined (matcha/burbujas/spritz/comida) y MBDS.

const DEMO = {
  productos:   ["prod-001", "prod-002", "prod-003", "prod-004", "prod-005", "prod-006"],
  proveedores: ["prov-001", "prov-002", "prov-003", "prov-004", "prov-005", "prov-006", "prov-007", "prov-008", "prov-009"],
  recetas:     ["rec-001", "rec-002", "rec-003", "rec-004"],
  lotes:       ["lote-001", "lote-002", "lote-003", "lote-004", "lote-005", "lote-006"],
  materias:    Array.from({ length: 23 }, (_, i) => "mat-" + String(i + 1).padStart(3, "0")),
};

// Retira los datos de prueba a través del store dado (inyectable para tests).
function limpiarDemo(st) {
  const S = {
    prod: new Set(DEMO.productos), prov: new Set(DEMO.proveedores),
    rec: new Set(DEMO.recetas), lote: new Set(DEMO.lotes), mat: new Set(DEMO.materias),
  };
  let n = 0;
  const quitar = (ent, pred) => {
    (st.readAll(ent) || []).slice().forEach((r) => {
      if (r && r.id != null && pred(r)) { st.remove(ent, r.id); n++; }
    });
  };
  // 1) Dependientes que referencian el grafo demo (lotes/recetas/proveedores/…).
  quitar("ajustes",           (r) => S.lote.has(r.objetivo_id) || S.prod.has(r.objetivo_id));
  quitar("impresiones",       (r) => S.lote.has(r.lote_id));
  quitar("consumos",          (r) => S.lote.has(r.lote_id) || S.rec.has(r.receta_id));
  quitar("stock_movements",   (r) => S.lote.has(r.lote_id) || S.prod.has(r.producto_id) || S.mat.has(r.materia_id));
  quitar("precios_historico", (r) => S.prod.has(r.producto_id));
  quitar("compras_productos", (r) => S.prov.has(r.proveedor_id) || S.prod.has(r.producto_id));
  quitar("pedidos",           (r) => S.prov.has(r.proveedor_id));
  quitar("recepciones",       (r) => S.prov.has(r.proveedor_id));
  quitar("inventarios",       (r) => Array.isArray(r.lineas) && r.lineas.some((l) => S.mat.has(l.materia_id)));
  // 2) Entidades principales, por id exacto de la semilla.
  quitar("productos",   (r) => S.prod.has(r.id));
  quitar("proveedores", (r) => S.prov.has(r.id));
  quitar("recetas",     (r) => S.rec.has(r.id));
  quitar("lotes",       (r) => S.lote.has(r.id));
  quitar("materias",    (r) => S.mat.has(r.id));
  return n;
}

module.exports = { limpiarDemo, DEMO };
