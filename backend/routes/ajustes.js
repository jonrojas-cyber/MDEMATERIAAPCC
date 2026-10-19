const express = require("express");
const store = require("../data-store");
const { costePorUnidad } = require("../costing");
const M = require("../mermas-motivos");
const ledger = require("../stock-ledger");

const router = express.Router();

// Taxonomía de merma ÚNICA: ajustes y mermas comparten el vocabulario de
// `mermas-motivos.js` (motivo + grupo) y su normalización (M.normalizar, que admite
// los strings antiguos de esta ruta). Antes esta ruta tenía su propia lista plana
// ("caducidad", "rotura"…) distinta de la de /mermas y la analítica mezclaba.

// Motivos para la UI: lista plana de etiquetas canónicas (el front pinta un botón
// por string y envía la etiqueta). Mantiene compatibilidad con la pantalla Ajustes.
router.get("/motivos", (req, res) => {
  res.json(M.MERMAS_MOTIVOS.map((m) => m.t));
});

router.get("/", (req, res) => {
  res.json(store.readAll("ajustes").slice().reverse());
});

router.post("/", async (req, res) => {
  const { tipo_objetivo, objetivo_id, motivo, observacion, responsable } = req.body;
  // Cantidad robusta: admite coma decimal y exige un número positivo.
  const cantidad = typeof req.body.cantidad === "string"
    ? Number(req.body.cantidad.replace(",", "."))
    : Number(req.body.cantidad);

  if (!tipo_objetivo || !objetivo_id || !Number.isFinite(cantidad) || cantidad <= 0 || !motivo) {
    return res.status(400).json({ error: "Indica materia o lote, una cantidad válida y el motivo del ajuste" });
  }
  const mot = M.normalizar(motivo);
  if (!mot) {
    return res.status(400).json({ error: "Motivo no reconocido", motivos_disponibles: M.MERMAS_MOTIVOS.map((m) => m.t) });
  }

  let costeEstimado = 0;
  let nombreObjetivo = objetivo_id;
  const ahora = new Date().toISOString();
  const quien = (req.user && req.user.nombre) || responsable || "Sin asignar";

  if (tipo_objetivo === "materia") {
    const materia = store.findById("materias", objetivo_id);
    if (!materia) return res.status(404).json({ error: "Materia no encontrada" });
    costeEstimado = Math.round((Number(materia.coste_medio) || 0) * cantidad * 100) / 100;
    nombreObjetivo = materia.nombre;
    // Baja el stock DEJANDO ASIENTO en el libro (fuente única del movimiento). El
    // faltante, si la salida excede el stock, queda registrado y visible.
    ledger.aplicar(store, {
      materia_id: materia.id, delta: -cantidad, reason: "merma", source: "ajuste",
      unidad: materia.unidad || "", producto: materia.nombre, created_by: quien, created_at: ahora,
    });
  } else if (tipo_objetivo === "lote") {
    const lotes = store.readAll("lotes");
    const lote = lotes.find((l) => l.id === objetivo_id);
    if (!lote) return res.status(404).json({ error: "Lote no encontrado" });
    const receta = store.findById("recetas", lote.receta_id);
    costeEstimado = receta ? Math.round(costePorUnidad(receta) * cantidad * 100) / 100 : 0;
    nombreObjetivo = lote.codigo;
    lote.cantidad_restante = Math.max(0, Math.round((lote.cantidad_restante - cantidad) * 100) / 100);
    if (lote.cantidad_restante === 0) lote.estado = "Fuera de servicio";
    store.writeAll("lotes", lotes);
  } else {
    return res.status(400).json({ error: "tipo_objetivo debe ser 'materia' o 'lote'" });
  }

  const ajuste = {
    id: store.nextId("aju", "ajustes"),
    tipo_objetivo,
    objetivo_id,
    objetivo_nombre: nombreObjetivo,
    cantidad,
    motivo: mot.t,           // etiqueta canónica (taxonomía única)
    grupo: mot.grupo,        // grupo para la analítica (evitable/intencionado…)
    coste_estimado: costeEstimado,
    responsable: quien,
    observacion: observacion || "",
    origen: "ajuste",
    fecha: ahora,
  };
  store.insert("ajustes", ajuste);
  require("../auditoria").registrar(req, {
    accion: "ajuste_stock",
    entidad: tipo_objetivo === "lote" ? "lotes" : "materias",
    entidad_id: objetivo_id,
    resumen: `Ajuste de ${nombreObjetivo || objetivo_id}: ${cantidad} (${mot.t})${costeEstimado ? ` · ${costeEstimado.toFixed(2)} €` : ""}`,
    meta: { cantidad, motivo: mot.k, grupo: mot.grupo, coste_estimado: costeEstimado },
  });
  await store.flush();
  res.status(201).json(ajuste);
});

module.exports = router;
