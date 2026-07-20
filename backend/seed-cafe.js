// SIEMBRA DE LA CARTA DE CAFÉ (idempotente, una sola vez).
//
// Los ficheros JSON solo siembran una tabla de Postgres cuando está VACÍA. Como
// materias/productos ya tienen datos en producción, los cafés/leches que se
// añaden al JSON NO llegan a Postgres. Esta siembra los inserta explícitamente
// al arrancar, si faltan, y marca un flag en `config` para no repetirse (así se
// respeta si luego borras o editas algún producto).

const store = require("./data-store");

const FLAG = "cafe_seed_v1";

// Materias (coste_medio: café €/g, leche €/ml) con los precios de Inefable + leches.
const MATERIAS = [
  { id: "mat-cafe-brasil",   nombre: "Café Brasil (espresso)",              unidad: "g",  coste_medio: 0.0239,  categoria: "Café",  ubicacion: "Barra", disponibilidad_actual: 1000 },
  { id: "mat-cafe-etiopia",  nombre: "Café Etiopía (espresso)",             unidad: "g",  coste_medio: 0.0319,  categoria: "Café",  ubicacion: "Barra", disponibilidad_actual: 500 },
  { id: "mat-cafe-coldbrew", nombre: "Café cold brew coco (Quebraditas)",   unidad: "g",  coste_medio: 0.07088, categoria: "Café",  ubicacion: "Barra", disponibilidad_actual: 500 },
  { id: "mat-leche-fresca",  nombre: "Leche fresca",                        unidad: "ml", coste_medio: 0.001,   categoria: "Leche", ubicacion: "Barra", disponibilidad_actual: 5000 },
  { id: "mat-leche-vegetal", nombre: "Leche coco/avena",                    unidad: "ml", coste_medio: 0.00168, categoria: "Leche", ubicacion: "Barra", disponibilidad_actual: 3000 },
];

// Productos de la carta de café (precio_venta arranca en el escenario 25%, editable).
const PRODUCTOS = [
  { id: "prod-cafe-esp-bra",     clave: "Espresso Brasil",           nombre: "Espresso · Brasil",          categoria: "café", descripcion: "Doble 17 g",                       precio_venta: 1.65, margen_objetivo: 0.75, activo: true, ingredientes: [{ materia_id: "mat-cafe-brasil", cantidad: 17 }] },
  { id: "prod-cafe-esp-eti",     clave: "Espresso Etiopía",          nombre: "Espresso · Etiopía",         categoria: "café", descripcion: "Doble 17 g",                       precio_venta: 2.20, margen_objetivo: 0.75, activo: true, ingredientes: [{ materia_id: "mat-cafe-etiopia", cantidad: 17 }] },
  { id: "prod-cafe-leche-bra",   clave: "Con leche Brasil",          nombre: "Con leche · Brasil",         categoria: "café", descripcion: "Doble 17 g + 160 ml leche fresca", precio_venta: 2.30, margen_objetivo: 0.75, activo: true, ingredientes: [{ materia_id: "mat-cafe-brasil", cantidad: 17 }, { materia_id: "mat-leche-fresca", cantidad: 160 }] },
  { id: "prod-cafe-vegetal-bra", clave: "Con leche vegetal Brasil",  nombre: "Con leche vegetal · Brasil", categoria: "café", descripcion: "Doble 17 g + 160 ml coco/avena",   precio_venta: 2.75, margen_objetivo: 0.75, activo: true, ingredientes: [{ materia_id: "mat-cafe-brasil", cantidad: 17 }, { materia_id: "mat-leche-vegetal", cantidad: 160 }] },
  { id: "prod-cafe-coldbrew",    clave: "Cold brew coco",            nombre: "Cold brew coco",             categoria: "café", descripcion: "Vaso 200 ml",                      precio_venta: 5.00, margen_objetivo: 0.75, activo: true, ingredientes: [{ materia_id: "mat-cafe-coldbrew", cantidad: 17.5 }] },
];

async function seedCafe() {
  try {
    const cfg = store.readAll("config") || [];
    if (cfg.some((c) => c && c.id === FLAG)) return; // ya sembrado

    let insertados = 0;
    MATERIAS.forEach((m) => { if (!store.findById("materias", m.id)) { store.insert("materias", m); insertados++; } });
    PRODUCTOS.forEach((p) => { if (!store.findById("productos", p.id)) { store.insert("productos", { ...p, creado_en: new Date().toISOString() }); insertados++; } });

    store.insert("config", { id: FLAG, hecho: true, fecha: new Date().toISOString() });
    await store.flush();
    console.log(`Seed carta de café aplicado · ${insertados} registros nuevos.`);
  } catch (e) {
    console.error("No se pudo sembrar la carta de café:", e.message);
  }
}

module.exports = { seedCafe };
