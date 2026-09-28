// SIEMBRA · Análisis del mes de septiembre 2026 (idempotente por flag).
// Snapshot generado desde el "Análisis de Ventas" real de Ágora (1–28 sep):
// 12.484,81 € netos, 1.902 tickets, mix por familia y patrón por día de semana.
// Cuando el conector esté al día, la pantalla puede recalcular desde "ventas".

const store = require("./data-store");
const SNAP = require("./seed-data/analisis-mes-2026-09.json");

const FLAG = "analisis_mes_seed_v1_sept2026";

function aplicar(st) {
  const cfg = st.readAll("config") || [];
  if (cfg.some((c) => c && c.id === FLAG)) return { ranAny: false };
  if (st.findById("analisis_mes", SNAP.id)) st.update("analisis_mes", SNAP.id, SNAP);
  else st.insert("analisis_mes", SNAP);
  st.insert("config", { id: FLAG, hecho: true, fecha: new Date().toISOString() });
  return { ranAny: true };
}

async function seedAnalisisMes() {
  try {
    const r = aplicar(store);
    if (r.ranAny) { await store.flush(); console.log("Seed análisis del mes · snapshot 2026-09 cargado."); }
  } catch (e) { console.error("No se pudo sembrar el análisis del mes:", e.message); }
}

module.exports = { seedAnalisisMes, aplicar, SNAP, FLAG };
