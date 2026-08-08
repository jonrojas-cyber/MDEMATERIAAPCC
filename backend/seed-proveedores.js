// SIEMBRA DE PROVEEDORES REALES (idempotente, por lotes con flag en `config`).
// La fundadora va dando sus proveedores y productos reales con sus albaranes.
// Cada lote se aplica UNA vez (flag) y hace UPSERT: si el registro existe se
// actualiza a estos valores, si no se inserta. Así un lote nuevo (flag nuevo)
// corrige lo ya sembrado en producción, y lo que edites después queda intacto
// (el lote no se vuelve a ejecutar).

const store = require("./data-store");

// Materia fresca de frutería (se pesa en gramos). coste_medio en €/g.
function fruta(id, nombre, lote, kgNetos, precioKg, vida) {
  const g = Math.round(kgNetos * 1000);
  return {
    id, nombre, unidad: "g", proveedor_id: "prov-fruteria",
    coste_medio: Math.round((precioKg / 1000) * 1e6) / 1e6,
    disponibilidad_actual: g,
    stock_minimo: Math.round(g * 0.3),   // punto de pedido de partida (ajustable)
    stock_ideal: g,                      // «lleno» de referencia = lo que entró
    ubicacion: "Cámara producción",
    vida_util_horas: vida,
    lote_proveedor: lote,                // trazabilidad del albarán (APPCC)
  };
}

const BATCHES = [
  {
    // Proveedor ① · Málaga Costa Fruit SL — albarán 12377/A6 (08/08/2026).
    // 10 artículos con precio real (€/kg) y stock real (K. Netos → g).
    flag: "proveedores_seed_v2_costa_fruit",
    proveedor: {
      id: "prov-fruteria",
      nombre: "Málaga Costa Fruit SL",
      contacto: "",
      cif: "B-01751502",
      direccion: "Avda. del Sur, 21 · 29738 Moclinejo (Málaga)",
      email: "malagacostafruit@gmail.com",
      whatsapp: "+34 636 79 59 00",
      telefono2: "+34 650 22 59 40",
      dias_reparto: ["Por confirmar"],
      productos_asociados: [
        "mat-fru-lima", "mat-fru-pomelo", "mat-fru-naranja", "mat-fru-kaffir",
        "mat-fru-romero", "mat-fru-hierbabuena", "mat-fru-jengibre",
        "mat-fru-tomate", "mat-fru-aguacate", "mat-fru-nectarina",
      ],
    },
    materias: [
      //     id                 nombre                        lote            kg    €/kg   vida(h)
      fruta("mat-fru-lima",       "Lima Extra",                "32.123.115285", 4.80, 3.75, 168),
      fruta("mat-fru-pomelo",     "Pomelo Rojo",               "373.23.114945", 6.00, 1.89, 168),
      fruta("mat-fru-naranja",    "Naranja de zumo (exportación)", "414.30.115008", 15.00, 1.25, 240),
      fruta("mat-fru-kaffir",     "Hoja de lima kaffir",       "334.28.114495", 4.00, 11.50, 96),
      fruta("mat-fru-romero",     "Romero (manojo)",           "87.96.114817",  2.00, 1.55, 168),
      fruta("mat-fru-hierbabuena","Hierbabuena La Piedra",     "366.96.115373", 10.00, 1.65, 72),
      fruta("mat-fru-jengibre",   "Jengibre",                  "4.28.114598",   0.60, 2.95, 336),
      fruta("mat-fru-tomate",     "Tomate castellano",         "70.30.115069",  3.20, 2.95, 120),
      fruta("mat-fru-aguacate",   "Aguacate Trops Extra",      "650.28.114762", 3.90, 4.95, 120),
      fruta("mat-fru-nectarina",  "Nectarina",                 "634.28.114398", 4.30, 1.95, 96),
    ],
  },
];

// Aplica los lotes pendientes sobre el store dado (inyectable para tests).
// UPSERT por id: update si existe, insert si no. Idempotente por flag.
function aplicar(st) {
  const cfg = st.readAll("config") || [];
  const hechos = new Set(cfg.filter((c) => c && c.id).map((c) => c.id));
  let tocados = 0, ranAny = false;
  for (const b of BATCHES) {
    if (hechos.has(b.flag)) continue;
    if (b.proveedor) {
      if (st.findById("proveedores", b.proveedor.id)) st.update("proveedores", b.proveedor.id, b.proveedor);
      else st.insert("proveedores", b.proveedor);
      tocados++;
    }
    (b.materias || []).forEach((m) => {
      if (st.findById("materias", m.id)) st.update("materias", m.id, m);
      else st.insert("materias", m);
      tocados++;
    });
    st.insert("config", { id: b.flag, hecho: true, fecha: new Date().toISOString() });
    ranAny = true;
  }
  return { tocados, ranAny };
}

async function seedProveedores() {
  try {
    const { tocados, ranAny } = aplicar(store);
    if (ranAny) { await store.flush(); console.log(`Seed proveedores · ${tocados} registros.`); }
  } catch (e) {
    console.error("No se pudo sembrar los proveedores:", e.message);
  }
}

module.exports = { seedProveedores, aplicar, BATCHES };
