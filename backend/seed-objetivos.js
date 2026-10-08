// SIEMBRA DE OBJETIVOS (idempotente, por TIPO): metas de referencia de hostelería
// para que el resumen financiero marque en verde/ámbar/rojo desde el primer día.
// Solo inserta un objetivo si NO existe ya uno ACTIVO de ese tipo (así nunca pisa
// ni duplica los que la fundadora haya puesto/editado a mano). Editable en Objetivos.
//
// Referencias (café de especialidad, % sobre ventas netas):
//   food cost 27 · personal 30 · PRIME COST 65 (materia+personal) · fijos 15 · EBITDA 20

const store = require("./data-store");

const DEFAULTS = [
  { tipo: "food_cost", label: "Food cost", valor: 27, unidad: "pct", periodo: "mes" },
  { tipo: "coste_laboral", label: "Coste de personal", valor: 30, unidad: "pct", periodo: "mes" },
  { tipo: "prime_cost", label: "Prime cost (materia + personal)", valor: 65, unidad: "pct", periodo: "mes" },
  { tipo: "gastos_fijos", label: "Costes fijos", valor: 15, unidad: "pct", periodo: "mes" },
  { tipo: "ebitda", label: "EBITDA", valor: 20, unidad: "pct", periodo: "mes" },
];

async function seedObjetivos() {
  try {
    const existentes = store.readAll("business_targets") || [];
    const tiposActivos = new Set(existentes.filter((t) => t && t.activo !== false && t.tipo).map((t) => t.tipo));
    let n = 0;
    DEFAULTS.forEach((d) => {
      if (tiposActivos.has(d.tipo)) return;          // ya hay uno de ese tipo: no tocar
      const id = `tgt-${d.tipo.replace(/_/g, "-")}`;
      if (store.findById("business_targets", id)) return; // ya sembrado antes
      store.insert("business_targets", Object.assign({ id, activo: true, creado_en: new Date().toISOString(), origen: "seed_objetivos_v1" }, d));
      n++;
    });
    if (n) { await store.flush(); console.log(`Seed objetivos · ${n} metas de referencia.`); }
  } catch (e) {
    console.error("No se pudo sembrar objetivos:", e.message);
  }
}

module.exports = { seedObjetivos, DEFAULTS };
