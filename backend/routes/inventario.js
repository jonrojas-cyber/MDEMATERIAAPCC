const express = require("express");
const store = require("../data-store");

const router = express.Router();

// INVENTARIO FÍSICO vs TEÓRICO.
// El sistema sabe cuánto DEBERÍA haber (disponibilidad_actual, movido por ventas,
// recepciones y mermas). El recuento físico dice cuánto HAY de verdad. La
// diferencia es el "descuadre" de almacén: robo, mermas no registradas, errores.
// Al aplicar el conteo, el stock teórico se ajusta al real y queda el movimiento.

function eur(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// GET /api/inventario — materias para contar (teórico + coste) + histórico de conteos.
router.get("/", (req, res) => {
  const materias = store.readAll("materias");
  const items = materias
    .map((m) => ({
      materia_id: m.id,
      nombre: m.nombre,
      unidad: m.unidad || "",
      ubicacion: m.ubicacion || "",
      teorico: Math.round((Number(m.disponibilidad_actual) || 0) * 100) / 100,
      coste_medio: Number(m.coste_medio) || 0,
    }))
    .sort((a, b) => (a.ubicacion || "").localeCompare(b.ubicacion || "") || a.nombre.localeCompare(b.nombre));
  const historico = store.readAll("inventarios").slice().reverse().slice(0, 20);
  res.json({ materias: items, historico });
});

// POST /api/inventario/conteo — aplica un recuento físico.
// body: { conteos: [{ materia_id, fisico }], responsable, observacion }
router.post("/conteo", async (req, res) => {
  const body = req.body || {};
  const conteos = Array.isArray(body.conteos) ? body.conteos : [];
  if (!conteos.length) return res.status(400).json({ error: "No hay ninguna materia contada." });

  const materias = store.readAll("materias");
  const idx = {};
  materias.forEach((m) => (idx[m.id] = m));
  const nowISO = new Date().toISOString();
  const responsable = String(body.responsable || "Sin asignar");

  const lineas = [];
  const movimientos = [];
  conteos.forEach((c) => {
    const m = idx[c.materia_id];
    if (!m) return;
    const fisicoRaw = typeof c.fisico === "string" ? Number(c.fisico.replace(",", ".")) : Number(c.fisico);
    if (!Number.isFinite(fisicoRaw) || fisicoRaw < 0) return; // sin conteo válido = no se toca
    const fisico = Math.round(fisicoRaw * 100) / 100;
    const teorico = Math.round((Number(m.disponibilidad_actual) || 0) * 100) / 100;
    const diferencia = Math.round((fisico - teorico) * 100) / 100;
    const valor = eur(diferencia * (Number(m.coste_medio) || 0));
    lineas.push({
      materia_id: m.id, nombre: m.nombre, unidad: m.unidad || "",
      teorico, fisico, diferencia, valor_diferencia: valor,
    });
    if (diferencia !== 0) {
      m.disponibilidad_actual = fisico;
      movimientos.push({
        id: store.nextId("mov", "stock_movements"),
        source: "inventario", source_ref: "",
        materia_id: m.id, delta: diferencia, unidad: m.unidad || "",
        reason: "inventario", producto: "", created_at: nowISO, created_by: responsable,
      });
    }
  });

  if (!lineas.length) return res.status(400).json({ error: "Ninguna cantidad contada es válida." });

  const conDescuadre = lineas.filter((l) => l.diferencia !== 0);
  const descuadreEur = eur(lineas.reduce((s, l) => s + l.valor_diferencia, 0));
  const inventario = {
    id: store.nextId("inv", "inventarios"),
    fecha: nowISO,
    responsable,
    observacion: String(body.observacion || ""),
    total_lineas: lineas.length,
    lineas_con_descuadre: conDescuadre.length,
    descuadre_eur: descuadreEur,
    merma_oculta_eur: eur(lineas.filter((l) => l.diferencia < 0).reduce((s, l) => s + l.valor_diferencia, 0)),
    lineas,
  };

  movimientos.forEach((mv) => store.insert("stock_movements", mv));
  store.writeAll("materias", materias);
  store.insert("inventarios", inventario);
  require("../auditoria").registrar(req, {
    accion: "inventario_fisico",
    entidad: "inventarios",
    entidad_id: inventario.id,
    resumen: `Recuento físico: ${conDescuadre.length}/${lineas.length} con descuadre · ${descuadreEur.toFixed(2)} €`,
    meta: { descuadre_eur: descuadreEur, lineas_con_descuadre: conDescuadre.length },
  });
  await store.flush();
  res.status(201).json(inventario);
});

// GET /api/inventario/:id — detalle de un recuento.
router.get("/:id", (req, res) => {
  const inv = store.findById("inventarios", req.params.id);
  if (!inv) return res.status(404).json({ error: "Recuento no encontrado" });
  res.json(inv);
});

module.exports = router;
