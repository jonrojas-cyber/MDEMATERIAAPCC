// SIEMBRA DE PROVEEDORES REALES (idempotente, por lotes con flag en `config`).
// La fundadora va dando sus proveedores y productos reales con sus albaranes.
// Cada lote se aplica UNA vez (flag) y hace UPSERT: si el registro existe se
// actualiza a estos valores, si no se inserta. Así un lote nuevo (flag nuevo)
// corrige lo ya sembrado en producción, y lo que edites después queda intacto
// (el lote no se vuelve a ejecutar).

const store = require("./data-store");

// Artículo de compra «Pendiente de completar»: se registra el nombre y el
// proveedor pero NO se inventan precio, IVA, formato ni contenido (la fundadora
// los completa después). Se marca con estado para que la app avise "Falta
// completar la tarifa" y no se use en escandallos hasta estar completo.
function articuloPendiente(id, proveedor_id, nombre, categoria) {
  return {
    id, proveedor_id, nombre,
    categoria: categoria || "Otros",
    estado: "Pendiente de completar",
    formato: "",                 // sin inventar
    cantidad_formato: 0,
    precio_sin_iva: 0,
    iva: null,                   // sin inventar el tipo de IVA
    precio_con_iva: 0,
    precio_unitario_real: 0,
    foto_url: null,
    codigo_interno: "",
    referencia_proveedor: "",
    stock_minimo: 0,
    stock_ideal: 0,
    caducidad_habitual: "",
    alergenos: [],
    notas: "",
    creado_en: new Date().toISOString(),
  };
}

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
  {
    // Proveedores iniciales de la pizarra (② charcutería/lácteos, ③ panadería) +
    // reconciliación de la frutería ya existente. Datos marcados «(por confirmar)»
    // NO son definitivos. Los artículos se crean «Pendiente de completar»: sin
    // precio/IVA/formato inventados, para que la app pida completarlos y NO se
    // vinculan todavía a recetas ni producciones.
    flag: "proveedores_seed_v3_iniciales",
    proveedores: [
      {
        // ① Charcutería y lácteos — «Juanma de Bravo» (nombre por confirmar).
        id: "prov-charcuteria",
        nombre: "Juanma (por confirmar)",
        razon_social: "",
        nif_cif: "44652877 (por confirmar)",   // puede faltarle la letra
        categoria: "Charcutería",
        contacto: "Juanma",
        telefono: "627 175 427",
        telefono_pedidos: "627 175 427",
        whatsapp: "627 175 427",
        email: "",
        direccion: "",
        forma_pago: "Bizum",                    // dato sensible → solo admin
        bizum: "655 428 703",                   // dato sensible → solo admin
        estado: "Activo",
        observaciones: "Alimentación · charcutería y lácteos. Datos por confirmar con el proveedor.",
        productos_asociados: [],
        creado_en: new Date().toISOString(),
      },
      {
        // ③ Panadería — Pan con Alma y Pasión, S.L.
        id: "prov-panaderia",
        nombre: "Pan con Alma y Pasión, S.L.",
        razon_social: "Pan con Alma y Pasión, S.L.",
        nif_cif: "B40821753 (por confirmar)",
        categoria: "Panadería",
        contacto: "Sheila",
        telefono: "638 883 040",
        telefono_pedidos: "638 883 040",
        whatsapp: "638 883 040",
        email: "",
        direccion: "",
        estado: "Activo",
        observaciones: "Panadería. Datos por confirmar con el proveedor.",
        productos_asociados: [],
        creado_en: new Date().toISOString(),
      },
    ],
    // Reconciliación (no se duplica): la frutería de la pizarra (tel 630 217 646)
    // es el proveedor de fruta ya sembrado (Málaga Costa Fruit SL). Solo se le
    // añade ese teléfono de pedidos como «por confirmar», sin tocar el resto.
    proveedores_patch: [
      { id: "prov-fruteria", patch: { telefono_pedidos: "630 217 646 (por confirmar)" } },
    ],
    // Artículos «Pendiente de completar». La frutería ya tiene Tomate, Aguacate,
    // Nectarina y Lima como materias del albarán (no se duplican): solo se añade
    // el que falta (Rúcula).
    articulos: [
      articuloPendiente("cpr-charc-jamon",    "prov-charcuteria", "Jamón braseado",    "Charcutería"),
      articuloPendiente("cpr-charc-mortadela","prov-charcuteria", "Mortadela italiana","Charcutería"),
      articuloPendiente("cpr-charc-quesocrema","prov-charcuteria","Queso crema",        "Leche"),
      articuloPendiente("cpr-pan-centeno",    "prov-panaderia",   "Pan de centeno",    "Panadería"),
      articuloPendiente("cpr-pan-espelta",    "prov-panaderia",   "Tosta de espelta",  "Panadería"),
      articuloPendiente("cpr-fru-rucula",     "prov-fruteria",    "Rúcula",            "Fruta y verdura"),
    ],
  },
  {
    // Corrección desde la foto de la pizarra: el proveedor ① es «Jamonería Isa
    // Brava» (no «Juanma») y su NIF escrito es 44652877. Parche idempotente
    // (v3 ya corrió en producción y no se re-ejecuta): fusiona solo estos campos.
    flag: "proveedores_seed_v4_correccion_nombres",
    proveedores_patch: [
      {
        id: "prov-charcuteria",
        patch: {
          nombre: "Jamonería Isa Brava",
          razon_social: "Jamonería Isa Brava",
          nif_cif: "44652877",   // según la pizarra (puede faltarle la letra)
        },
      },
    ],
  },
];

// Aplica los lotes pendientes sobre el store dado (inyectable para tests).
// UPSERT por id: update si existe, insert si no. Idempotente por flag.
function aplicar(st) {
  const cfg = st.readAll("config") || [];
  const hechos = new Set(cfg.filter((c) => c && c.id).map((c) => c.id));
  let tocados = 0, ranAny = false;
  const upsert = (entidad, row) => {
    if (st.findById(entidad, row.id)) st.update(entidad, row.id, row);
    else st.insert(entidad, row);
    tocados++;
  };
  for (const b of BATCHES) {
    if (hechos.has(b.flag)) continue;
    // Proveedor único (lotes antiguos) o lista de proveedores (lotes nuevos).
    if (b.proveedor) upsert("proveedores", b.proveedor);
    (b.proveedores || []).forEach((p) => upsert("proveedores", p));
    // Parches parciales: fusionan campos sin sobrescribir el resto (reconciliación).
    (b.proveedores_patch || []).forEach(({ id, patch }) => {
      if (st.findById("proveedores", id)) { st.update("proveedores", id, patch); tocados++; }
    });
    // Materias del albarán (con precio/stock real).
    (b.materias || []).forEach((m) => upsert("materias", m));
    // Artículos de compra «Pendiente de completar».
    (b.articulos || []).forEach((a) => upsert("compras_productos", a));
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
