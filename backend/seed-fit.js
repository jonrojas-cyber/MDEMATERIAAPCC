// SIEMBRA · LÍNEA FIT (idempotente por flag). Dos bebidas en lata con su
// escandallo real y su receta escalable para producir a lo grande y embotellar.
//
// Ingredientes NUEVOS (coste indicado por la fundadora):
//   · Proteína              28 €/kg      → 0,028 €/g
//   · Agua de coco (Mercadona) 2 €/L     → 0,002 €/ml
//   · Colágeno lima-limón   20 €/350 g   → 0,057142857 €/g
// Reutiliza los que ya existen: café Brasil espresso (mat-cafe-brasil), leche de
// avena (mat-009), matcha (mat-007), agua filtrada (mat-017).
//
// El food cost lo calcula solo costing.costeProducto desde estos ingredientes.

const store = require("./data-store");

const FLAG = "productos_fit_v2";

// Materias nuevas (upsert por id). coste_medio en €/unidad NETO.
const MATERIAS = [
  { id: "mat-proteina", nombre: "Proteína (fit)", categoria: "Fit", unidad: "g", coste_medio: 0.028, disponibilidad_actual: 0, notas: "28 €/kg" },
  { id: "mat-agua-coco", nombre: "Agua de coco", categoria: "Fit", unidad: "ml", coste_medio: 0.002, disponibilidad_actual: 0, notas: "2 €/L (Mercadona)" },
  { id: "mat-colageno-limon", nombre: "Colágeno lima-limón", categoria: "Fit", unidad: "g", coste_medio: 20 / 350, disponibilidad_actual: 0, notas: "bote 350 g = 20 €" },
  { id: "mat-matcha", nombre: "Matcha", categoria: "Matcha", unidad: "g", coste_medio: 0.20, disponibilidad_actual: 0, notas: "200 €/kg" },
];

// Productos con su escandallo (ingredientes = materia_id + cantidad por lata).
const PRODUCTOS = [
  {
    id: "prod-fit-ice-latte",
    nombre: "Ice Latte proteico · lata", clave: "Ice Latte proteico", categoria: "bebida",
    origen: "fit", activo: true, precio_venta: 0, // PVP pendiente de fijar
    ingredientes: [
      { materia_id: "mat-cafe-brasil", cantidad: 34 },   // doble espresso Brasil (17 g × 2)
      { materia_id: "mat-009", cantidad: 160 },           // leche de avena (ml)
      { materia_id: "mat-proteina", cantidad: 10 },       // proteína (g)
    ],
    descripcion: "Línea fit · lata. POR UNIDAD: doble espresso de Brasil (34 g de café), 160 ml de leche de avena, 10 g de proteína. " +
      "ESCALAR Y EMBOTELLAR (× nº de latas): 1) Extrae el doble espresso de cada lata y enfría rápido. 2) En frío, disuelve la proteína en la leche de avena batiendo hasta que no queden grumos. 3) Une el café con la base de leche+proteína y homogeneiza. 4) Enfría a 0-4 °C. 5) Envasa/enlata en frío y cierra. 6) Conserva 0-4 °C. " +
      "Para 50 latas: 1,7 kg de café, 8 L de leche de avena, 500 g de proteína. Food cost ≈ 1,48 €/lata.",
  },
  {
    id: "prod-fit-matcha-colageno",
    nombre: "Matcha colágeno lima-limón · lata", clave: "Matcha colágeno", categoria: "bebida",
    origen: "fit", activo: true, precio_venta: 0,
    ingredientes: [
      { materia_id: "mat-matcha", cantidad: 2 },          // matcha (g) · 200 €/kg
      { materia_id: "mat-017", cantidad: 25 },            // agua filtrada (ml) — coste ~0
      { materia_id: "mat-agua-coco", cantidad: 160 },     // agua de coco (ml)
      { materia_id: "mat-colageno-limon", cantidad: 5 },  // colágeno lima-limón (g)
    ],
    descripcion: "Línea fit · lata. POR UNIDAD: 2 g de matcha, 25 ml de agua filtrada, 160 ml de agua de coco, 5 g de colágeno lima-limón. " +
      "ESCALAR Y EMBOTELLAR (× nº de latas): 1) Bate el matcha con el agua filtrada templada hasta emulsionar (sin grumos). 2) Añade el agua de coco fría y el colágeno y bate hasta disolver del todo. 3) Enfría a 0-4 °C. 4) Envasa/enlata en frío y cierra. 5) Conserva 0-4 °C. " +
      "Para 50 latas: 100 g de matcha, 1,25 L de agua filtrada, 8 L de agua de coco, 250 g de colágeno. Food cost ≈ 1,01 €/lata (matcha 200 €/kg).",
  },
];

function aplicar(st) {
  const cfg = st.readAll("config") || [];
  if (cfg.some((c) => c && c.id === FLAG)) return { ranAny: false, materias: 0, productos: 0 };
  let mats = 0, prods = 0;
  MATERIAS.forEach((m) => {
    if (st.findById("materias", m.id)) st.update("materias", m.id, m);
    else { st.insert("materias", { ...m, creado_en: new Date().toISOString() }); mats++; }
  });
  PRODUCTOS.forEach((p) => {
    if (st.findById("productos", p.id)) st.update("productos", p.id, p);
    else { st.insert("productos", { ...p, creado_en: new Date().toISOString() }); prods++; }
  });
  st.insert("config", { id: FLAG, hecho: true, fecha: new Date().toISOString() });
  return { ranAny: true, materias: mats, productos: prods };
}

async function seedFit() {
  try {
    const r = aplicar(store);
    if (r.ranAny) { await store.flush(); console.log(`Seed línea fit · ${r.productos} productos, ${r.materias} materias.`); }
  } catch (e) { console.error("No se pudo sembrar la línea fit:", e.message); }
}

module.exports = { seedFit, aplicar, MATERIAS, PRODUCTOS, FLAG };
