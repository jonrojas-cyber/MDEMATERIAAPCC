// SIEMBRA DE PROVEEDORES REALES (idempotente).
// La fundadora va dando sus proveedores y productos reales uno a uno. Aquí se
// insertan con id estable (no colisiona con la semilla demo, que la limpieza
// retira en producción). Igual que seed-negocio/seed-cafe: corre una vez por
// lote (flag en `config`), en dev y en producción, y respeta lo que edites
// después. Los costes/contactos/días de reparto se rellenan al recibir la
// factura real; de momento quedan a 0 / «por confirmar».

const store = require("./data-store");

// Valores por defecto de una materia fresca de frutería (peso, en gramos).
function fruta(id, nombre, vida_util_horas, ubicacion) {
  return {
    id, nombre, unidad: "g", proveedor_id: "prov-fruteria",
    coste_medio: 0, disponibilidad_actual: 0, stock_minimo: 0, stock_ideal: 0,
    ubicacion: ubicacion || "Cámara producción", vida_util_horas,
  };
}

const BATCHES = [
  {
    // Proveedor ① · Frutería (pizarra de proveedores). 10 materias frescas.
    flag: "proveedores_seed_v1_fruteria",
    proveedor: {
      id: "prov-fruteria", nombre: "Frutería", contacto: "", email: "", whatsapp: "",
      dias_reparto: ["Por confirmar"],
      productos_asociados: [
        "mat-fru-lima", "mat-fru-pomelo", "mat-fru-naranja", "mat-fru-kaffir",
        "mat-fru-romero", "mat-fru-hierbabuena", "mat-fru-jengibre",
        "mat-fru-tomate", "mat-fru-aguacate", "mat-fru-nectarina",
      ],
    },
    materias: [
      fruta("mat-fru-lima", "Lima", 168),
      fruta("mat-fru-pomelo", "Pomelo", 168),
      fruta("mat-fru-naranja", "Naranja", 240),
      fruta("mat-fru-kaffir", "Hoja de lima kaffir", 96),
      fruta("mat-fru-romero", "Romero", 168),
      fruta("mat-fru-hierbabuena", "Hierbabuena La Piedra", 72),
      fruta("mat-fru-jengibre", "Jengibre", 336),
      fruta("mat-fru-tomate", "Tomate", 120),
      fruta("mat-fru-aguacate", "Aguacate", 120),
      fruta("mat-fru-nectarina", "Nectarina", 96),
    ],
  },
];

// Aplica los lotes de siembra sobre el store dado (inyectable para tests).
// Idempotente: si el id ya existe no lo pisa (respeta tus ediciones).
function aplicar(st) {
  const cfg = st.readAll("config") || [];
  const hechos = new Set(cfg.filter((c) => c && c.id).map((c) => c.id));
  let tocados = 0, ranAny = false;
  for (const b of BATCHES) {
    if (hechos.has(b.flag)) continue;
    if (b.proveedor && !st.findById("proveedores", b.proveedor.id)) {
      st.insert("proveedores", b.proveedor); tocados++;
    }
    (b.materias || []).forEach((m) => {
      if (!st.findById("materias", m.id)) { st.insert("materias", m); tocados++; }
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
