const express = require("express");
const store = require("../data-store");
const agora = require("../agora");

const router = express.Router();

// Acepta el CSV como texto plano (text/csv, text/plain) o como JSON { csv }.
const textParser = express.text({ type: ["text/*", "application/csv"], limit: "4mb" });

// POST /api/ventas/importar  (cuerpo: CSV de Ágora, o { csv: "..." })
// Si el fichero es el export "Análisis de Ventas" (día/ticket/producto), se usa el
// MISMO motor que Análisis del mes: REEMPLAZA el mes (sin duplicar), guarda el neto
// y es idempotente. Si es otro formato (CSV plano del conector), cae al lector viejo.
router.post("/importar", textParser, async (req, res) => {
  const csv = typeof req.body === "string" ? req.body : (req.body && req.body.csv) || "";
  if (!csv || !csv.trim()) {
    return res.status(400).json({ error: "Envía el CSV de ventas de Ágora (texto o { csv })" });
  }
  try {
    const ve = require("../ventas-export");
    const buf = Buffer.from(csv, "utf8");
    const rep = ve.importarReemplazando(store, buf);
    if (rep.docs > 0) {
      await store.flush();
      const co = rep.resultado || {};
      return res.json({
        ventas_importadas: co.procesados || 0, lineas: rep.docs,
        bloqueados: co.bloqueados || 0, productos_no_reconocidos: co.productos_no_vinculados || [],
        meses: rep.meses, reemplazado: true,
      });
    }
    // Formato no jerárquico → lector antiguo (conector plano).
    const resumen = agora.importarVentas(csv, "manual");
    await store.flush();
    res.json(resumen);
  } catch (e) {
    res.status(500).json({ error: "No se pudo importar: " + e.message });
  }
});

// POST /api/ventas/agora-import  { docs: [...] }  (export de Ágora vía puente)
// Mapea producto→escandallo, descuenta stock y es IDEMPOTENTE por doc.id.
// Responde con los ids procesados para que el frontend confirme a Ágora
// (POST /api/doc/processed) y deje de reexportarlos.
router.post("/agora-import", express.json({ limit: "8mb" }), async (req, res) => {
  const docs = (req.body && (req.body.docs || req.body.documents || req.body)) || [];
  try {
    const r = agora.importarDocs(docs, { usuario: req.user });
    require("../auditoria").registrar(req, {
      accion: "ventas_agora",
      entidad: "ventas",
      resumen: `Ágora: ${r.procesados} procesado(s), ${r.bloqueados} bloqueado(s), ${r.unidades_vendidas} uds, ${r.importe_total} €`,
      meta: { procesados: r.procesados, bloqueados: r.bloqueados, omitidos: r.omitidos_ya_procesados, no_vinculados: r.productos_no_vinculados },
    });
    await store.flush(); // stock + ventas + docs confirmados antes de responder
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: "No se pudo importar de Ágora: " + e.message });
  }
});

// GET /api/ventas  — ventas importadas (más recientes primero)
router.get("/", (req, res) => {
  res.json(store.readAll("ventas").slice().reverse());
});

// GET /api/ventas/sincronizacion — estado de la última sync con Ágora
router.get("/sincronizacion", (req, res) => {
  res.json(agora.ultimaSync() || { cuando: null });
});

// GET /api/ventas/agora-estado — estado del conector + documentos bloqueados.
router.get("/agora-estado", (req, res) => {
  const docs = store.readAll("docs_agora");
  const bloqueados = docs.filter((d) => d.status === "blocked");
  const no_vinculados = [...new Set(bloqueados.flatMap((d) => d.no_vinculados || []))];
  res.json({
    conector_configurado: !!process.env.AGORA_CONNECTOR_TOKEN,
    ultima_sync: agora.ultimaSync() || null,
    procesados: docs.filter((d) => d.status === "processed").length,
    bloqueados,
    no_vinculados,
  });
});

// GET /api/ventas/conciliacion?dia=YYYY-MM-DD — cuadre con Ágora al céntimo (solo
// admin: total bruto/neto, desglose por tipo de documento, duplicados sospechosos,
// ticket a ticket y precio real por producto vs PVP de carta). Sin ?dia = hoy.
router.get("/conciliacion", (req, res) => {
  const { soloAdmin } = require("./_guard");
  if (!soloAdmin(req, res)) return;
  res.json(require("../conciliacion-ventas").conciliacionDia(req.query.dia));
});

// POST /api/ventas/conciliacion/limpiar-duplicados?dia= — quita el doble conteo
// estructural (albarán/pedido ya facturado) y repone su stock. Solo admin.
router.post("/conciliacion/limpiar-duplicados", express.json(), async (req, res) => {
  const { soloAdmin } = require("./_guard");
  if (!soloAdmin(req, res)) return;
  try {
    const dia = (req.query.dia || (req.body && req.body.dia));
    const r = await require("../conciliacion-ventas").limpiarDuplicados(dia, req.user);
    require("../auditoria").registrar(req, {
      accion: "conciliacion_limpiar", entidad: "ventas",
      resumen: `Conciliación ${r.dia}: ${r.eliminados} línea(s) duplicada(s) quitada(s), ${r.importe_quitado} € · stock repuesto ${r.stock_repuesto}`,
      meta: r,
    });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: "No se pudo limpiar: " + e.message });
  }
});

module.exports = router;
