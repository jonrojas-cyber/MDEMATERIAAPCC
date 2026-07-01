const express = require("express");
const store = require("../data-store");

const router = express.Router();

// Calendario anual: agrega por día todo lo que deja rastro con fecha, para poder
// consultar el histórico de PRODUCCIÓN y de APPCC (trazabilidad) de un vistazo.
//   · producción  → lotes producidos
//   · caducidad   → fecha de caducidad de cada lote
//   · revisión    → controles/temperaturas (APPCC)
//   · merma       → ajustes/bajas (APPCC · incidencias)
//   · recepción   → entradas de proveedor

function ymd(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function hm(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
const APPCC = new Set(["caducidad", "revision", "merma", "recepcion"]);

// GET /api/calendario?year=YYYY  → { year, hoy, dias:{ "YYYY-MM-DD":[ev...] }, meses:[12] }
router.get("/", (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const dias = {};
  const add = (fecha, ev) => {
    const k = ymd(fecha);
    if (!k || Number(k.slice(0, 4)) !== year) return;
    (dias[k] = dias[k] || []).push({ ...ev, fecha: k, hora: hm(fecha) });
  };

  const recN = {}; store.readAll("recetas").forEach((r) => (recN[r.id] = r.nombre));
  const provN = {}; store.readAll("proveedores").forEach((p) => (provN[p.id] = p.nombre));

  store.readAll("lotes").forEach((l) => {
    const nombre = recN[l.receta_id] || l.receta_id;
    if (l.producido_en) add(l.producido_en, { tipo: "produccion", titulo: `Producción · ${nombre}`, detalle: `${l.codigo || ""}${l.cantidad_inicial != null ? ` · ${l.cantidad_inicial}` : ""}`.trim() });
    if (l.caduca_en) add(l.caduca_en, { tipo: "caducidad", titulo: `Caduca · ${nombre}`, detalle: `${l.codigo || ""}` });
  });
  store.readAll("revisiones").forEach((rv) => {
    if (rv.fecha) add(rv.fecha, { tipo: "revision", titulo: `Revisión · ${rv.tipo || ""}`.trim(), detalle: `${rv.valor != null ? rv.valor : ""} ${rv.estado || ""}`.trim(), responsable: rv.responsable || "" });
  });
  store.readAll("ajustes").forEach((a) => {
    if (a.fecha) add(a.fecha, { tipo: "merma", titulo: `Merma/ajuste · ${a.objetivo_nombre || a.objetivo_id || ""}`.trim(), detalle: `${a.cantidad != null ? a.cantidad : ""} · ${a.motivo || ""}${a.coste_estimado ? ` · ${a.coste_estimado} €` : ""}`, responsable: a.responsable || "" });
  });
  store.readAll("recepciones").forEach((r) => {
    if (r.fecha) add(r.fecha, { tipo: "recepcion", titulo: `Recepción · ${provN[r.proveedor_id] || r.proveedor_id || ""}`.trim(), detalle: `${r.importe_total != null ? r.importe_total : 0} € · ${r.estado || ""}` });
  });

  const meses = Array.from({ length: 12 }, (_, m) => ({ mes: m, produccion: 0, appcc: 0, total: 0 }));
  Object.entries(dias).forEach(([k, evs]) => {
    const m = Number(k.slice(5, 7)) - 1;
    evs.forEach((e) => {
      meses[m].total++;
      if (e.tipo === "produccion") meses[m].produccion++;
      else if (APPCC.has(e.tipo)) meses[m].appcc++;
    });
    evs.sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));
  });

  res.json({ year, hoy: ymd(new Date().toISOString()), dias, meses });
});

module.exports = router;
