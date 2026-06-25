const express = require("express");
const store = require("../data-store");
const mailer = require("../mailer");

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
    // Sin la foto base64 (pesada); el visor la pide aparte por id.
    porProveedor[r.proveedor_id].recepciones.push({
      id: r.id,
      fecha: r.fecha,
      importe_total: r.importe_total,
      pendiente_pago: r.pendiente_pago,
      estado: r.estado,
      tiene_foto: !!r.foto_albaran_url,
      n_lineas: Array.isArray(r.lineas) ? r.lineas.length : 0,
    });
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

// Historial de justificantes de pago emitidos (más recientes primero).
router.get("/justificantes", (req, res) => {
  res.json(store.readAll("justificantes").slice().reverse());
});

// Un justificante concreto (documento detallado, prueba de pago).
router.get("/justificantes/:id", (req, res) => {
  const j = store.findById("justificantes", req.params.id);
  if (!j) return res.status(404).json({ error: "Justificante no encontrado" });
  res.json(j);
});

// (Re)envía un justificante por email al proveedor.
router.post("/justificantes/:id/email", async (req, res) => {
  const j = store.findById("justificantes", req.params.id);
  if (!j) return res.status(404).json({ error: "Justificante no encontrado" });
  if (!j.proveedor_email) return res.status(400).json({ error: "El proveedor no tiene email" });
  if (!mailer.disponible()) return res.status(503).json({ error: "Email no configurado (RESEND_API_KEY)", code: "EMAIL_NO_CONFIG" });
  try {
    await mailer.enviarEmail({ to: j.proveedor_email, subject: `Justificante de pago ${j.codigo}`, html: mailer.htmlJustificante(j) });
    const upd = store.update("justificantes", j.id, { email_estado: "enviado", email_enviado_en: new Date().toISOString() });
    res.json({ email_estado: "enviado", justificante: upd });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/:proveedorId/marcar-pagado", async (req, res) => {
  const recepciones = store.readAll("recepciones");
  const proveedor = store.findById("proveedores", req.params.proveedorId);

  const albaranes = [];
  let importePagado = 0;
  recepciones.forEach((r) => {
    if (r.proveedor_id === req.params.proveedorId && r.pendiente_pago > 0) {
      albaranes.push({
        recepcion_id: r.id,
        fecha: r.fecha,
        importe_total: r.importe_total,
        importe_pagado: r.pendiente_pago,
      });
      importePagado += r.pendiente_pago;
      r.pendiente_pago = 0;
      r.estado = "Pagado";
    }
  });

  if (!albaranes.length) {
    return res.status(400).json({ error: "Este proveedor no tiene importes pendientes" });
  }

  store.writeAll("recepciones", recepciones);

  const ahora = new Date();
  const justificante = {
    id: store.nextId("just", "justificantes"),
    codigo: `JP-${ahora.toISOString().slice(0, 10).replace(/-/g, "")}-${String(store.readAll("justificantes").length + 1).padStart(3, "0")}`,
    proveedor_id: req.params.proveedorId,
    proveedor_nombre: proveedor ? proveedor.nombre : req.params.proveedorId,
    proveedor_contacto: proveedor ? proveedor.contacto : "",
    proveedor_email: proveedor ? proveedor.email : "",
    proveedor_whatsapp: proveedor ? proveedor.whatsapp : "",
    fecha_pago: ahora.toISOString(),
    usuario: (req.user && req.user.nombre) || "Sin asignar",
    metodo: (req.body && req.body.metodo) || "Transferencia / efectivo",
    importe_pagado: Math.round(importePagado * 100) / 100,
    albaranes,
    email_estado: "no_configurado",
  };

  // Envío automático del justificante por email (si está configurado).
  if (mailer.disponible() && justificante.proveedor_email) {
    try {
      await mailer.enviarEmail({ to: justificante.proveedor_email, subject: `Justificante de pago ${justificante.codigo}`, html: mailer.htmlJustificante(justificante) });
      justificante.email_estado = "enviado";
      justificante.email_enviado_en = ahora.toISOString();
    } catch (e) {
      justificante.email_estado = "error";
      justificante.email_error = e.message;
    }
  }

  store.insert("justificantes", justificante);
  res.json({ actualizadas: albaranes.length, justificante });
});

module.exports = router;
