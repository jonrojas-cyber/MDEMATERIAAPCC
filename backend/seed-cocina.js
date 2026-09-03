// SIEMBRA DE LA CARTA DE COCINA (idempotente, por lotes con flag).
//
// Igual que seed-cafe: los ficheros JSON solo siembran una tabla vacía; en
// producción materias/productos/recetas ya tienen datos, así que estos se
// insertan explícitamente al arrancar SI FALTAN (create-if-missing, sin pisar
// lo que edites o borres). Funciona tanto en modo Postgres como en JSON.
//
// Gramajes REALES aportados por cocina (Mónica/Lara). Los COSTES van pendientes
// (0) hasta que entren las facturas por Recepción: el food cost se completa solo.
// Los PVP también van a 0 (pendientes) hasta fijarlos en Carta.

// Peso nominal de un "molinillo" (sal/pimienta) — asunción documentada, coste
// despreciable; se puede afinar en la ficha de cada producto.
const GRINDER_SAL = 0.4;
const GRINDER_PIM = 0.3;

// Materias nuevas (coste pendiente). unidad "g" salvo panes/croissant ("ud").
const M = (id, nombre, unidad, categoria) => ({
  id, nombre, unidad, categoria, coste_medio: 0, disponibilidad_actual: 0,
  ubicacion: "Cocina", pendiente_coste: true,
});

const MATERIAS = [
  // Panes y base
  M("mat-coc-pan", "Pan (chapata/rústico)", "ud", "Panadería"),
  M("mat-coc-pan-centeno", "Pan de centeno", "ud", "Panadería"),
  M("mat-coc-croissant", "Croissant", "ud", "Panadería"),
  // Charcutería y quesos
  M("mat-coc-jamon", "Jamón", "g", "Charcutería"),
  M("mat-coc-jamon-braseado", "Jamón braseado", "g", "Charcutería"),
  M("mat-coc-mortadela", "Mortadela", "g", "Charcutería"),
  M("mat-coc-edam", "Edam", "g", "Quesos"),
  M("mat-coc-payoyo", "Payoyo", "g", "Quesos"),
  M("mat-coc-burrata", "Burrata", "g", "Quesos"),
  M("mat-coc-feta", "Feta", "g", "Quesos"),
  // Frescos
  M("mat-coc-rucula", "Rúcula", "g", "Verdura"),
  M("mat-coc-tomate", "Tomate", "g", "Verdura"),
  M("mat-coc-aguacate", "Aguacate", "g", "Verdura"),
  M("mat-coc-higo", "Higo", "g", "Fruta"),
  M("mat-coc-lima", "Lima", "g", "Fruta"),
  // Despensa
  M("mat-coc-aceite", "Aceite de oliva", "g", "Despensa"),
  M("mat-coc-sal", "Sal", "g", "Despensa"),
  M("mat-coc-pimienta", "Pimienta", "g", "Despensa"),
  M("mat-coc-ajo", "Ajo", "g", "Despensa"),
  M("mat-coc-semillas", "Semillas (mezcla)", "g", "Despensa"),
  M("mat-coc-chimichurri", "Chimichurri", "g", "Salsas"),
  M("mat-coc-crema-pistacho", "Crema de pistacho", "g", "Despensa"),
  M("mat-coc-dulce-leche", "Dulce de leche", "g", "Despensa"),
  // Ingredientes de las elaboraciones
  M("mat-coc-queso-crema", "Queso crema", "g", "Lácteos"),
  M("mat-coc-yogur", "Yogur", "g", "Lácteos"),
  M("mat-coc-ricota", "Ricota", "g", "Lácteos"),
  M("mat-coc-agave", "Agave", "g", "Despensa"),
  M("mat-coc-mayonesa", "Mayonesa (base)", "g", "Salsas"),
  M("mat-coc-trufa", "Trufa", "g", "Despensa"),
  // Materias PRODUCIDAS por elaboración (coste se derivará de su receta al costear)
  M("mat-coc-salsa-m", "Salsa M (elaboración)", "g", "Elaboración"),
  M("mat-coc-mayo-trufa", "Mayonesa de trufa (elaboración)", "g", "Elaboración"),
];

// Elaboraciones (recetas que PRODUCEN una materia).
const RECETAS = [
  {
    id: "rec-coc-salsa-m", nombre: "Salsa M", resultado_base: 2217, unidad: "g",
    vida_util_horas: 120, produce_materia_id: "mat-coc-salsa-m",
    tamanos_lote: [1108, 2216], pasos_proceso: ["Triturar todo hasta textura homogénea", "Reservar en frío"],
    ingredientes: [
      { materia_id: "mat-coc-queso-crema", cantidad: 883 },
      { materia_id: "mat-coc-yogur", cantidad: 971 },
      { materia_id: "mat-coc-ricota", cantidad: 265 },
      { materia_id: "mat-coc-agave", cantidad: 89 },
      { materia_id: "mat-coc-sal", cantidad: 6 },
      { materia_id: "mat-coc-pimienta", cantidad: 1.5 },
      { materia_id: "mat-coc-ajo", cantidad: 1.5 },
    ],
  },
  {
    id: "rec-coc-mayo-trufa", nombre: "Mayonesa de trufa", resultado_base: 550, unidad: "g",
    vida_util_horas: 120, produce_materia_id: "mat-coc-mayo-trufa",
    tamanos_lote: [550, 1100], pasos_proceso: ["Mezclar mayonesa con trufa (10%)", "Reservar en frío"],
    ingredientes: [
      { materia_id: "mat-coc-mayonesa", cantidad: 500 },
      { materia_id: "mat-coc-trufa", cantidad: 50 },
    ],
  },
];

const P = (id, clave, nombre, categoria, ingredientes) => ({
  id, clave, nombre, categoria, descripcion: "", precio_venta: 0, activo: true,
  cantidades_estimadas: false, pendiente_pvp: true, ingredientes,
});

const PRODUCTOS = [
  // CRUNCH (sándwiches, pan entero)
  P("prod-crunch-origen", "Crunch Origen", "Crunch · Origen", "sandwich", [
    { materia_id: "mat-coc-pan", cantidad: 1 },
    { materia_id: "mat-coc-jamon", cantidad: 65 },
    { materia_id: "mat-coc-edam", cantidad: 40 },
    { materia_id: "mat-coc-payoyo", cantidad: 10 },
    { materia_id: "mat-coc-sal", cantidad: GRINDER_SAL },
    { materia_id: "mat-coc-pimienta", cantidad: GRINDER_PIM },
    { materia_id: "mat-coc-aceite", cantidad: 2 },
  ]),
  P("prod-crunch-equilibrio", "Crunch Equilibrio", "Crunch · Equilibrio", "sandwich", [
    { materia_id: "mat-coc-pan", cantidad: 1 },
    { materia_id: "mat-coc-edam", cantidad: 30 },
    { materia_id: "mat-coc-payoyo", cantidad: 80 },
    { materia_id: "mat-coc-rucula", cantidad: 3 },
    { materia_id: "mat-coc-chimichurri", cantidad: 12 },
    { materia_id: "mat-coc-aceite", cantidad: 2 },
    { materia_id: "mat-coc-pimienta", cantidad: GRINDER_PIM },
  ]),
  P("prod-crunch-coleccion", "Crunch Colección", "Crunch · Colección", "sandwich", [
    { materia_id: "mat-coc-pan", cantidad: 1 },
    { materia_id: "mat-coc-mortadela", cantidad: 55 },
    { materia_id: "mat-coc-burrata", cantidad: 20 },
    { materia_id: "mat-coc-rucula", cantidad: 3 },
    { materia_id: "mat-coc-edam", cantidad: 20 },
    { materia_id: "mat-coc-mayo-trufa", cantidad: 12 },
  ]),
  // TOSTAS (medio pan)
  P("prod-tosta-origen", "Tosta Origen", "Tosta · Origen", "tosta", [
    { materia_id: "mat-coc-pan", cantidad: 0.5 },
    { materia_id: "mat-coc-aceite", cantidad: 5 },
    { materia_id: "mat-coc-tomate", cantidad: 85 },
    { materia_id: "mat-coc-pimienta", cantidad: GRINDER_PIM },
    { materia_id: "mat-coc-sal", cantidad: GRINDER_SAL },
  ]),
  P("prod-tosta-equilibrio", "Tosta Equilibrio", "Tosta · Equilibrio", "tosta", [
    { materia_id: "mat-coc-pan", cantidad: 0.5 },
    { materia_id: "mat-coc-salsa-m", cantidad: 30 },
    { materia_id: "mat-coc-aguacate", cantidad: 140 },
    { materia_id: "mat-coc-feta", cantidad: 8 },
    { materia_id: "mat-coc-aceite", cantidad: 1 },
    { materia_id: "mat-coc-semillas", cantidad: 4 },
    { materia_id: "mat-coc-pimienta", cantidad: GRINDER_PIM },
    { materia_id: "mat-coc-sal", cantidad: GRINDER_SAL },
    { materia_id: "mat-coc-lima", cantidad: 14 },
  ]),
  P("prod-tosta-coleccion", "Tosta Colección", "Tosta · Colección", "tosta", [
    { materia_id: "mat-coc-pan-centeno", cantidad: 0.5 },
    { materia_id: "mat-coc-higo", cantidad: 54 },
    { materia_id: "mat-coc-salsa-m", cantidad: 30 },
    { materia_id: "mat-coc-semillas", cantidad: 2 },
    { materia_id: "mat-coc-aceite", cantidad: 1 },
    { materia_id: "mat-coc-sal", cantidad: GRINDER_SAL },
    { materia_id: "mat-coc-pimienta", cantidad: GRINDER_PIM },
  ]),
  // CROISSANTS
  P("prod-croissant-pistacho", "Croissant pistacho", "Croissant · Pistacho", "reposteria", [
    { materia_id: "mat-coc-croissant", cantidad: 1 },
    { materia_id: "mat-coc-crema-pistacho", cantidad: 34.5 },
    { materia_id: "mat-coc-dulce-leche", cantidad: 30 },
  ]),
  P("prod-croissant-jyq", "Croissant jamón y queso", "Croissant · Jamón y queso", "reposteria", [
    { materia_id: "mat-coc-croissant", cantidad: 1 },
    { materia_id: "mat-coc-edam", cantidad: 10 },
    { materia_id: "mat-coc-jamon-braseado", cantidad: 30 },
  ]),
];

const BATCHES = [
  { flag: "cocina_seed_v1", materias: MATERIAS, recetas: RECETAS, productos: PRODUCTOS },
];

// Aplica los lotes pendientes sobre un store (real o inyectado en tests).
function aplicar(store) {
  const cfg = store.readAll("config") || [];
  const hechos = new Set(cfg.filter((c) => c && c.id).map((c) => c.id));
  let insertados = 0, ranAny = false;
  for (const b of BATCHES) {
    if (hechos.has(b.flag)) continue;
    (b.materias || []).forEach((m) => { if (!store.findById("materias", m.id)) { store.insert("materias", m); insertados++; } });
    (b.recetas || []).forEach((r) => { if (!store.findById("recetas", r.id)) { store.insert("recetas", { ...r, creado_en: new Date().toISOString() }); insertados++; } });
    (b.productos || []).forEach((p) => { if (!store.findById("productos", p.id)) { store.insert("productos", { ...p, creado_en: new Date().toISOString() }); insertados++; } });
    store.insert("config", { id: b.flag, hecho: true, fecha: new Date().toISOString() });
    ranAny = true;
  }
  return { ranAny, insertados };
}

async function seedCocina() {
  const store = require("./data-store");
  try {
    const { ranAny, insertados } = aplicar(store);
    if (ranAny) { await store.flush(); console.log(`Seed carta de cocina · ${insertados} registros nuevos.`); }
  } catch (e) {
    console.error("No se pudo sembrar la carta de cocina:", e.message);
  }
}

module.exports = { seedCocina, aplicar, MATERIAS, RECETAS, PRODUCTOS };
