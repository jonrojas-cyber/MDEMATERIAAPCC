// SIEMBRA DE LA ROTACIÓN DE TURNOS (idempotente por flag + id estable).
// Transcrita EXACTA de las dos hojas "M de materia · Horario de equipo"
// (7 sep → 15 nov 2026), verificada: Dani 200 h, Lara 200 h, Jon 160 h por ciclo.
//
// Cada semana se codifica Lun..Dom con el código de turno de cada persona:
//   A=Apertura 07-15 · C=Cierre 09-17 · P=Apoyo 10-14 · R=Vuelta 11-17 · D=Descanso
// El expansor crea un turno por (persona, fecha) con su horario y función. Id
// estable `tur-<ini>-<fecha>` → re-sembrar no duplica; borrar uno no lo respawnea.

const store = require("./data-store");
const { TURNO_DEF } = require("./turnos");

// [lunes, { persona: "LMXJVSD" }] · 7 códigos Lun..Dom.
const SEMANAS = [
  ["2026-09-07", { Daniel: "CCAAAAD", Lara: "DDCCCCD", Jon: "AAPPPPD" }],
  ["2026-09-14", { Daniel: "DDCCCCD", Lara: "CCAAAAD", Jon: "AAPPPPD" }],
  ["2026-09-21", { Daniel: "DCACACD", Lara: "CDCACAD", Jon: "AAPPPPD" }],
  ["2026-09-28", { Daniel: "CCCCCCD", Lara: "DDAAAAD", Jon: "AAPPPPD" }],
  ["2026-10-05", { Daniel: "DDAAAAD", Lara: "CCCCCCD", Jon: "AAPPPPD" }],
  ["2026-10-12", { Daniel: "CCAAAAD", Lara: "DDRCCCD", Jon: "AAPPPPD" }],
  ["2026-10-19", { Daniel: "DDRCCCD", Lara: "CCAAAAD", Jon: "AAPPPPD" }],
  ["2026-10-26", { Daniel: "CDCACAD", Lara: "DCACACD", Jon: "AAPPPPD" }],
  ["2026-11-02", { Daniel: "CCACCCD", Lara: "DDRAAAD", Jon: "AAPPPPD" }],
  ["2026-11-09", { Daniel: "DDRAAAD", Lara: "CCACCCD", Jon: "AAPPPPD" }],
];

const FLAG = "turnos_seed_rotacion_v1";
const INI = { Daniel: "dan", Lara: "lar", Jon: "jon" };

function fechaMas(lunes, i) {
  return new Date(lunes + "T12:00:00Z").getTime() + i * 86400000;
}

// Expande las semanas a filas de turno (puro, para tests).
function filas() {
  const out = [];
  SEMANAS.forEach(([lunes, personas]) => {
    Object.entries(personas).forEach(([persona, codigos]) => {
      codigos.split("").forEach((cod, i) => {
        const def = TURNO_DEF[cod];
        if (!def) return; // D = descanso: no crea turno
        const fecha = new Date(fechaMas(lunes, i)).toISOString().slice(0, 10);
        out.push({
          id: `tur-${INI[persona] || persona.toLowerCase().slice(0, 3)}-${fecha}`,
          persona, fecha, inicio: def.inicio, fin: def.fin, funcion: def.funcion, codigo: cod, local_id: "principal",
        });
      });
    });
  });
  return out;
}

function aplicar(st) {
  const cfg = st.readAll("config") || [];
  if (cfg.some((c) => c && c.id === FLAG)) return { ranAny: false, creados: 0 };
  let creados = 0;
  filas().forEach((row) => {
    if (st.findById("turnos", row.id)) st.update("turnos", row.id, row);
    else { st.insert("turnos", { ...row, creado_en: new Date().toISOString() }); creados++; }
  });
  st.insert("config", { id: FLAG, hecho: true, creados, fecha: new Date().toISOString() });
  return { ranAny: true, creados };
}

async function seedTurnos() {
  try {
    const { ranAny, creados } = aplicar(store);
    if (ranAny) { await store.flush(); console.log(`Seed turnos · ${creados} turnos de la rotación cargados.`); }
  } catch (e) { console.error("No se pudo sembrar la rotación de turnos:", e.message); }
}

module.exports = { seedTurnos, aplicar, filas, SEMANAS, FLAG };
