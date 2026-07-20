// SIEMBRA DE LA CARTA DE CAFÉ (idempotente, una sola vez).
//
// Los ficheros JSON solo siembran una tabla de Postgres cuando está VACÍA. Como
// materias/productos ya tienen datos en producción, los cafés/leches que se
// añaden al JSON NO llegan a Postgres. Esta siembra los inserta explícitamente
// al arrancar, si faltan, y marca un flag en `config` para no repetirse (así se
// respeta si luego borras o editas algún producto).

const store = require("./data-store");

// La siembra va por LOTES con su flag; cada lote se aplica una sola vez. Así se
// pueden añadir cosas nuevas (leches vegetales, etc.) en despliegues posteriores
// sin re-sembrar ni pisar lo que ya editaste/borraste de lotes anteriores.
const BATCHES = [
  {
    flag: "cafe_seed_v1",
    materias: [
      { id: "mat-cafe-brasil",   nombre: "Café Brasil (espresso)",            unidad: "g",  coste_medio: 0.0239,  categoria: "Café",  ubicacion: "Barra", disponibilidad_actual: 1000 },
      { id: "mat-cafe-etiopia",  nombre: "Café Etiopía (espresso)",           unidad: "g",  coste_medio: 0.0319,  categoria: "Café",  ubicacion: "Barra", disponibilidad_actual: 500 },
      { id: "mat-cafe-coldbrew", nombre: "Café cold brew coco (Quebraditas)", unidad: "g",  coste_medio: 0.07088, categoria: "Café",  ubicacion: "Barra", disponibilidad_actual: 500 },
      { id: "mat-leche-fresca",  nombre: "Leche fresca",                      unidad: "ml", coste_medio: 0.001,   categoria: "Leche", ubicacion: "Barra", disponibilidad_actual: 5000 },
    ],
    productos: [
      { id: "prod-cafe-esp-bra",   clave: "Espresso Brasil",  nombre: "Espresso · Brasil",   categoria: "café", descripcion: "Doble 17 g",                       precio_venta: 1.65, margen_objetivo: 0.75, activo: true, ingredientes: [{ materia_id: "mat-cafe-brasil", cantidad: 17 }] },
      { id: "prod-cafe-esp-eti",   clave: "Espresso Etiopía", nombre: "Espresso · Etiopía",  categoria: "café", descripcion: "Doble 17 g",                       precio_venta: 2.20, margen_objetivo: 0.75, activo: true, ingredientes: [{ materia_id: "mat-cafe-etiopia", cantidad: 17 }] },
      { id: "prod-cafe-leche-bra", clave: "Con leche Brasil", nombre: "Con leche · Brasil",  categoria: "café", descripcion: "Doble 17 g + 160 ml leche fresca", precio_venta: 2.30, margen_objetivo: 0.75, activo: true, ingredientes: [{ materia_id: "mat-cafe-brasil", cantidad: 17 }, { materia_id: "mat-leche-fresca", cantidad: 160 }] },
      { id: "prod-cafe-coldbrew",  clave: "Cold brew coco",   nombre: "Cold brew coco",      categoria: "café", descripcion: "Vaso 200 ml",                      precio_venta: 5.00, margen_objetivo: 0.75, activo: true, ingredientes: [{ materia_id: "mat-cafe-coldbrew", cantidad: 17.5 }] },
    ],
  },
  {
    // Leches vegetales (coco y avena por separado) + sus bebidas, Brasil y Etiopía.
    flag: "cafe_seed_v2_vegetales",
    materias: [
      { id: "mat-leche-coco",  nombre: "Leche coco",  unidad: "ml", coste_medio: 0.00168, categoria: "Leche", ubicacion: "Barra", disponibilidad_actual: 3000 },
      { id: "mat-leche-avena", nombre: "Leche avena", unidad: "ml", coste_medio: 0.00168, categoria: "Leche", ubicacion: "Barra", disponibilidad_actual: 3000 },
    ],
    productos: [
      { id: "prod-cafe-leche-eti",  clave: "Con leche Etiopía",       nombre: "Con leche · Etiopía",       categoria: "café", descripcion: "Doble 17 g + 160 ml leche fresca", precio_venta: 2.85, margen_objetivo: 0.75, activo: true, ingredientes: [{ materia_id: "mat-cafe-etiopia", cantidad: 17 }, { materia_id: "mat-leche-fresca", cantidad: 160 }] },
      { id: "prod-cafe-coco-bra",   clave: "Con leche coco Brasil",   nombre: "Con leche coco · Brasil",   categoria: "café", descripcion: "Doble 17 g + 160 ml coco",         precio_venta: 2.75, margen_objetivo: 0.75, activo: true, ingredientes: [{ materia_id: "mat-cafe-brasil", cantidad: 17 }, { materia_id: "mat-leche-coco", cantidad: 160 }] },
      { id: "prod-cafe-avena-bra",  clave: "Con leche avena Brasil",  nombre: "Con leche avena · Brasil",  categoria: "café", descripcion: "Doble 17 g + 160 ml avena",        precio_venta: 2.75, margen_objetivo: 0.75, activo: true, ingredientes: [{ materia_id: "mat-cafe-brasil", cantidad: 17 }, { materia_id: "mat-leche-avena", cantidad: 160 }] },
      { id: "prod-cafe-coco-eti",   clave: "Con leche coco Etiopía",  nombre: "Con leche coco · Etiopía",  categoria: "café", descripcion: "Doble 17 g + 160 ml coco",         precio_venta: 3.25, margen_objetivo: 0.75, activo: true, ingredientes: [{ materia_id: "mat-cafe-etiopia", cantidad: 17 }, { materia_id: "mat-leche-coco", cantidad: 160 }] },
      { id: "prod-cafe-avena-eti",  clave: "Con leche avena Etiopía", nombre: "Con leche avena · Etiopía", categoria: "café", descripcion: "Doble 17 g + 160 ml avena",        precio_venta: 3.25, margen_objetivo: 0.75, activo: true, ingredientes: [{ materia_id: "mat-cafe-etiopia", cantidad: 17 }, { materia_id: "mat-leche-avena", cantidad: 160 }] },
    ],
  },
];

async function seedCafe() {
  try {
    const cfg = store.readAll("config") || [];
    const hechos = new Set(cfg.filter((c) => c && c.id).map((c) => c.id));
    let insertados = 0, ranAny = false;
    for (const b of BATCHES) {
      if (hechos.has(b.flag)) continue;
      b.materias.forEach((m) => { if (!store.findById("materias", m.id)) { store.insert("materias", m); insertados++; } });
      b.productos.forEach((p) => { if (!store.findById("productos", p.id)) { store.insert("productos", { ...p, creado_en: new Date().toISOString() }); insertados++; } });
      store.insert("config", { id: b.flag, hecho: true, fecha: new Date().toISOString() });
      ranAny = true;
    }
    if (ranAny) { await store.flush(); console.log(`Seed carta de café · ${insertados} registros nuevos.`); }
  } catch (e) {
    console.error("No se pudo sembrar la carta de café:", e.message);
  }
}

module.exports = { seedCafe };
