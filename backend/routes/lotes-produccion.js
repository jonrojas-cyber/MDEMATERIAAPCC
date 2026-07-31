const express = require("express");
const store = require("../data-store");

const router = express.Router();

// Lotes de producción de Burbujas y Spritz: cuando se prebachea el lote final se
// registra AQUÍ, con la HORA EXACTA sellada por el servidor (no manipulable desde
// el cliente) y los litros producidos. Trazabilidad simple y propia — no toca el
// sistema de lotes por receta (que exige receta_id y no encaja con Burbujas).

// Código legible: BUR/SPZ + fecha + secuencia del día. Ej. BUR-20260731-003.
function nuevoCodigo(tipo, ahora) {
  const pre = tipo === "spritz" ? "SPZ" : "BUR";
  const dia = ahora.toISOString().slice(0, 10).replace(/-/g, "");
  const delDia = store.readAll("lotes_produccion").filter((l) => (l.codigo || "").startsWith(`${pre}-${dia}`)).length;
  return `${pre}-${dia}-${String(delDia + 1).padStart(3, "0")}`;
}

router.get("/", (req, res) => {
  const lotes = store.readAll("lotes_produccion").slice().sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  res.json(lotes);
});

router.post("/", async (req, res) => {
  const b = req.body || {};
  const tipo = b.tipo === "spritz" ? "spritz" : "burbujas";
  const litros = Number(b.litros);
  if (!(litros > 0)) return res.status(400).json({ error: "Indica los litros producidos del lote." });
  const ahora = new Date();
  const lote = {
    id: store.nextId("lp", "lotes_produccion"),
    codigo: nuevoCodigo(tipo, ahora),
    tipo,
    receta: String(b.rk || b.receta || "").slice(0, 40),
    producto: String(b.producto || "").slice(0, 120),
    litros: Math.round(litros * 100) / 100,
    responsable: String(b.responsable || "").slice(0, 80),
    fecha: ahora.toISOString(),          // HORA EXACTA sellada en el servidor
  };
  store.insert("lotes_produccion", lote);
  try {
    require("../auditoria").registrar(req, {
      accion: "lote_produccion", entidad: "lotes_produccion", entidad_id: lote.id,
      resumen: `Lote de producción ${lote.codigo} · ${lote.producto} · ${lote.litros} L`,
      meta: { codigo: lote.codigo, litros: lote.litros, fecha: lote.fecha },
    });
  } catch (e) {}
  await store.flush();
  res.json(lote);
});

module.exports = router;
