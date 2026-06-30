const express = require("express");
const store = require("../data-store");

const router = express.Router();

function decorate(lote) {
  const recetas = store.readAll("recetas");
  const receta = recetas.find((r) => r.id === lote.receta_id);
  const ahora = new Date();
  const caduca = new Date(lote.caduca_en);
  const horasRestantes = (caduca.getTime() - ahora.getTime()) / (1000 * 60 * 60);
  return {
    ...lote,
    nombre: receta ? receta.nombre : lote.receta_id,
    horas_restantes: Math.round(horasRestantes * 10) / 10,
    caduca_pronto: horasRestantes <= 6 && horasRestantes > 0,
    caducado: horasRestantes <= 0,
  };
}

router.get("/", (req, res) => {
  const lotes = store.readAll("lotes").map(decorate);
  res.json(lotes);
});

router.get("/:id", (req, res) => {
  const lote = store.findById("lotes", req.params.id);
  if (!lote) return res.status(404).json({ error: "Lote no encontrado" });
  res.json(decorate(lote));
});

router.patch("/:id", (req, res) => {
  const updated = store.update("lotes", req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: "Lote no encontrado" });
  res.json(decorate(updated));
});

// Registra consumo real de un lote (uso en servicio) con timestamp.
// Descuenta de cantidad_restante y guarda un consumo para el cálculo JIT.
router.post("/:id/consumo", (req, res) => {
  const lote = store.findById("lotes", req.params.id);
  if (!lote) return res.status(404).json({ error: "Lote no encontrado" });

  const cantidad = Number(req.body && req.body.cantidad);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return res.status(400).json({ error: "Indica una cantidad de consumo válida" });
  }

  const consumida = Math.min(cantidad, lote.cantidad_restante);
  const restante = Math.round((lote.cantidad_restante - consumida) * 100) / 100;

  store.insert("consumos", {
    id: store.nextId("con", "consumos"),
    lote_id: lote.id,
    receta_id: lote.receta_id,
    cantidad: consumida,
    origen: (req.body && req.body.origen) || "manual",
    timestamp: new Date().toISOString(),
  });

  const patch = { cantidad_restante: restante };
  if (restante === 0) patch.estado = "Fuera de servicio";
  const actualizado = store.update("lotes", req.params.id, patch);
  res.json(decorate(actualizado));
});

router.post("/:id/dar-de-baja", (req, res) => {
  const lote = store.findById("lotes", req.params.id);
  if (!lote) return res.status(404).json({ error: "Lote no encontrado" });

  const recetas = store.readAll("recetas");
  const receta = recetas.find((r) => r.id === lote.receta_id);
  const costePorUnidad = require("../costing").costePorUnidad;
  const coste = receta ? Math.round(costePorUnidad(receta) * lote.cantidad_restante * 100) / 100 : 0;

  if (lote.cantidad_restante > 0) {
    store.insert("ajustes", {
      id: store.nextId("aju", "ajustes"),
      tipo_objetivo: "lote",
      objetivo_id: lote.id,
      cantidad: lote.cantidad_restante,
      motivo: "fuera de vida útil",
      coste_estimado: coste,
      responsable: (req.body && req.body.responsable) || "Sin asignar",
      observacion: `Baja automática del lote ${lote.codigo} al superar su vida útil`,
      fecha: new Date().toISOString(),
    });
  }

  const actualizado = store.update("lotes", req.params.id, {
    estado: "Fuera de servicio",
    cantidad_restante: 0,
  });
  require("../auditoria").registrar(req, {
    accion: "lote_baja",
    entidad: "lotes",
    entidad_id: lote.id,
    resumen: `Baja del lote ${lote.codigo}${lote.cantidad_restante > 0 ? ` (${lote.cantidad_restante} de merma, ${coste.toFixed(2)} €)` : ""}`,
    meta: { codigo: lote.codigo, cantidad_baja: lote.cantidad_restante, coste },
  });
  res.json(decorate(actualizado));
});

module.exports = router;
