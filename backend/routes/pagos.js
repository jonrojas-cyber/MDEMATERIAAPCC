const express = require("express");
const store = require("../data-store");

const router = express.Router();

router.get("/", (req, res) => {
  const recepciones = store.readAll("recepciones");
  const proveedores = store.readAll("proveedores");

  const porProveedor = {};
  recepciones.forEach((r) => {
    if (!porProveedor[r.proveedor_id]) {
      porProveedor[r.proveedor_id] = {
        proveedor_id: r.proveedor_id,
        importe_pendiente: 0,
        albaranes_pendientes: 0,
        recepciones: [],
      };
    }
    porProveedor[r.proveedor_id].importe_pendiente += r.pendiente_pago;
    if (r.estado !== "Pagado") porProveedor[r.proveedor_id].albaranes_pendientes += 1;
    porProveedor[r.proveedor_id].recepciones.push(r);
  });

  const resultado = Object.values(porProveedor)
    .map((p) => {
      const proveedor = proveedores.find((x) => x.id === p.proveedor_id);
      return {
        ...p,
        proveedor_nombre: proveedor ? proveedor.nombre : p.proveedor_id,
        importe_pendiente: Math.round(p.importe_pendiente * 100) / 100,
        estado: p.importe_pendiente > 0 ? "Pendiente" : "Pagado",
      };
    })
    .filter((p) => p.importe_pendiente > 0);

  res.json(resultado);
});

router.post("/:proveedorId/marcar-pagado", (req, res) => {
  const recepciones = store.readAll("recepciones");
  let actualizadas = 0;
  recepciones.forEach((r) => {
    if (r.proveedor_id === req.params.proveedorId && r.pendiente_pago > 0) {
      r.pendiente_pago = 0;
      r.estado = "Pagado";
      actualizadas++;
    }
  });
  store.writeAll("recepciones", recepciones);
  res.json({ actualizadas });
});

module.exports = router;
