const express = require("express");
const store = require("../data-store");
const cc = require("../cierre-caja");
const auditoria = require("../auditoria");

const router = express.Router();
const jsonGrande = express.json({ limit: "12mb" }); // fotos de justificantes en base64

function esAdmin(req) { return req.user && req.user.rol === "admin"; }
function soloAdmin(req, res) {
  if (!esAdmin(req)) { res.status(403).json({ error: "Solo dirección/administración." }); return false; }
  return true;
}
function dispositivo(req) { return String(req.headers["user-agent"] || "").slice(0, 200); }
function ahora() { return new Date().toISOString(); }
function horaHM() { const d = new Date(); return d.toISOString().slice(11, 16); }

// Versión ligera para listados (sin fotos de movimientos).
function slim(c) {
  const con = cc.conciliar(c);
  return {
    id: c.id, codigo: c.codigo || null, fecha: c.fecha, local_id: c.local_id, turno: c.turno,
    responsable_nombre: c.responsable_nombre, estado: c.estado,
    venta_neta: c.agora ? c.agora.venta_neta : 0,
    efectivo: con.contado, tarjetas: con.tarjetas_datafonos,
    pagos: con.pagos_efectivo, propinas: con.propinas_efectivo,
    descuadre: con.descuadre_total, hora_cierre: c.hora_cierre || null,
    validado_por: c.validado_por || null, cerrado_en: c.cerrado_en || null,
  };
}

// ── CONFIGURACIÓN ───────────────────────────────────────────────────────────
router.get("/config", (req, res) => res.json(cc.leerConfig()));
router.put("/config", jsonGrande, async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const valor = cc.guardarConfig(req.body || {});
  auditoria.registrar(req, { accion: "cierre_config", entidad: "config", entidad_id: "cierre_caja", resumen: "Configuración de cierre de caja actualizada" });
  await store.flush();
  res.json(valor);
});

// ── ANALÍTICA ───────────────────────────────────────────────────────────────
router.get("/analitica", (req, res) => {
  const cierres = store.readAll("cierres_caja");
  const cerrados = cierres.filter((c) => c.estado === "cerrado" || c.estado === "validado" || c.estado === "incidencia");
  const conDes = cerrados.map((c) => ({ c, con: cc.conciliar(c) }));
  const suma = (f) => conDes.reduce((s, x) => s + f(x), 0);
  const nInc = conDes.filter((x) => x.con.requiere_incidencia).length;
  // Descuadre medio por responsable.
  const porResp = {};
  conDes.forEach(({ c, con }) => {
    const k = c.responsable_nombre || c.responsable_key || "—";
    if (!porResp[k]) porResp[k] = { responsable: k, cierres: 0, descuadre: 0 };
    porResp[k].cierres++; porResp[k].descuadre += con.descuadre_total;
  });
  res.json({
    cierres_total: cerrados.length,
    descuadre_acumulado: cc.eur(suma((x) => x.con.descuadre_total)),
    descuadre_efectivo: cc.eur(suma((x) => x.con.descuadre_efectivo)),
    descuadre_tarjetas: cc.eur(suma((x) => x.con.descuadre_tarjetas)),
    cierres_incorrectos: nInc,
    cierres_reabiertos: cierres.filter((c) => (c.historial || []).some((h) => h.accion === "reabrir")).length,
    por_responsable: Object.values(porResp).map((r) => ({ ...r, descuadre: cc.eur(r.descuadre), descuadre_medio: cc.eur(r.descuadre / r.cierres) })),
    ventas_efectivo_vs_tarjeta: {
      efectivo: cc.eur(suma((x) => x.con.contado)),
      tarjeta: cc.eur(suma((x) => x.con.tarjetas_datafonos)),
    },
  });
});

// ── LISTADO / HISTÓRICO (con filtros) ───────────────────────────────────────
router.get("/", (req, res) => {
  const { desde, hasta, local, turno, responsable, estado, con_descuadre } = req.query || {};
  let items = store.readAll("cierres_caja").slice().reverse();
  if (desde) items = items.filter((c) => c.fecha >= desde);
  if (hasta) items = items.filter((c) => c.fecha <= hasta);
  if (local) items = items.filter((c) => (c.local_id || "principal") === local);
  if (turno) items = items.filter((c) => c.turno === turno);
  if (responsable) items = items.filter((c) => (c.responsable_nombre || "").toLowerCase().includes(String(responsable).toLowerCase()));
  if (estado) items = items.filter((c) => c.estado === estado);
  let out = items.map(slim);
  if (con_descuadre === "1" || con_descuadre === "true") out = out.filter((c) => Math.abs(c.descuadre) > 0.001);
  res.json(out);
});

// ── CREAR / RECUPERAR (idempotente por fecha+local+turno) ───────────────────
router.post("/", jsonGrande, async (req, res) => {
  const { fecha, local_id = "principal", turno = "" } = req.body || {};
  const dia = String(fecha || ahora()).slice(0, 10);
  const existente = store.readAll("cierres_caja").find(
    (c) => c.fecha === dia && (c.local_id || "principal") === local_id && (c.turno || "") === (turno || "")
  );
  if (existente) return res.json(cc.decorar(existente));
  const nuevo = {
    id: store.nextId("cc", "cierres_caja"),
    fecha: dia, local_id, turno,
    responsable_key: (req.user && req.user.key) || null,
    responsable_nombre: (req.user && req.user.nombre) || null,
    hora_apertura: horaHM(), hora_cierre: null,
    estado: "pendiente",
    agora: null, agora_manual: {},
    efectivo: { fondo_inicial: 0, contado: 0, retiradas: 0, ingresos: 0, propinas_efectivo: 0, fondo_siguiente: 0, a_caja_fuerte: 0, arqueo: {} },
    tarjetas: (cc.leerConfig().datafonos || []).map((d) => ({ datafono_id: d.id, nombre: d.nombre, total: 0, operaciones: 0, comisiones: null, obs: "" })),
    otros: [], propinas: { tarjeta: 0, efectivo: 0 }, movimientos: [],
    incidencia: null, version: 1, historial: [],
    creado_en: ahora(), creado_por: (req.user && req.user.nombre) || "—",
  };
  store.insert("cierres_caja", nuevo);
  auditoria.registrar(req, { accion: "cierre_abrir", entidad: "cierres_caja", entidad_id: nuevo.id, resumen: `Cierre abierto ${dia} · ${turno || "turno único"}` });
  await store.flush();
  res.status(201).json(cc.decorar(nuevo));
});

router.get("/:id", (req, res) => {
  const c = store.findById("cierres_caja", req.params.id);
  if (!c) return res.status(404).json({ error: "Cierre no encontrado" });
  res.json(cc.decorar(c));
});

function bloqueadoSiCerrado(c, res) {
  if (c.estado === "cerrado" || c.estado === "validado") { res.status(409).json({ error: "El cierre está cerrado. Reábrelo para editar (solo dirección)." }); return true; }
  return false;
}

// ── SINCRONIZAR CON ÁGORA (idempotente: re-agrega, no duplica) ──────────────
router.post("/:id/sincronizar", jsonGrande, async (req, res) => {
  const c = store.findById("cierres_caja", req.params.id);
  if (!c) return res.status(404).json({ error: "Cierre no encontrado" });
  if (bloqueadoSiCerrado(c, res)) return;
  try {
    const prev = c.agora && c.agora.lineas_venta;
    const datos = cc.agregarAgora(c.fecha, c.local_id);
    const nuevas = prev != null && datos.lineas_venta > prev ? (datos.lineas_venta - prev) : 0;
    const agora = {
      ...datos, sincronizado_en: ahora(),
      sincronizado_por: (req.user && req.user.nombre) || "—",
      resultado: `${datos.lineas_venta} líneas · ${datos.tickets} tickets · ${datos.venta_neta} €`,
      error: null, nuevas_operaciones: nuevas,
    };
    const upd = store.update("cierres_caja", c.id, { agora, estado: c.estado === "pendiente" ? "revisando" : c.estado });
    auditoria.registrar(req, { accion: "cierre_sincronizar", entidad: "cierres_caja", entidad_id: c.id, resumen: `Sincronizado con Ágora: ${agora.resultado}`, meta: { nuevas_operaciones: nuevas } });
    await store.flush();
    res.json(cc.decorar(upd));
  } catch (e) {
    store.update("cierres_caja", c.id, { agora: { ...(c.agora || {}), error: e.message, sincronizado_en: ahora() } });
    await store.flush();
    res.status(500).json({ error: "No se pudo sincronizar con Ágora: " + e.message });
  }
});

// ── GUARDAR BORRADOR (efectivo, tarjetas, otros, agora_manual, propinas) ────
router.post("/:id/guardar", jsonGrande, async (req, res) => {
  const c = store.findById("cierres_caja", req.params.id);
  if (!c) return res.status(404).json({ error: "Cierre no encontrado" });
  if (bloqueadoSiCerrado(c, res)) return;
  const b = req.body || {};
  const patch = {};
  ["efectivo", "tarjetas", "otros", "agora_manual", "propinas", "incidencia"].forEach((k) => { if (b[k] !== undefined) patch[k] = b[k]; });
  if (b.turno !== undefined) patch.turno = b.turno;
  if (b.hora_cierre !== undefined) patch.hora_cierre = b.hora_cierre;
  patch.actualizado_en = ahora();
  const upd = store.update("cierres_caja", c.id, patch);
  await store.flush();
  res.json(cc.decorar(upd));
});

// ── MOVIMIENTOS (pagos y salidas de caja) ───────────────────────────────────
router.post("/:id/movimiento", jsonGrande, async (req, res) => {
  const c = store.findById("cierres_caja", req.params.id);
  if (!c) return res.status(404).json({ error: "Cierre no encontrado" });
  if (bloqueadoSiCerrado(c, res)) return;
  const b = req.body || {};
  if (!cc.TIPOS_MOVIMIENTO.includes(b.tipo)) return res.status(400).json({ error: "Tipo de movimiento no válido." });
  if (!(Number(b.importe) > 0)) return res.status(400).json({ error: "Indica un importe válido." });
  const mov = {
    id: store.nextId("mov", "cierres_caja") + "-m",
    fecha: b.fecha || c.fecha, hora: b.hora || horaHM(),
    tipo: b.tipo, proveedor_id: b.proveedor_id || null, concepto: String(b.concepto || "").trim(),
    importe: Math.round(Number(b.importe) * 100) / 100, metodo: b.metodo || "efectivo",
    realiza: b.realiza || (req.user && req.user.nombre) || "—", autoriza: b.autoriza || "",
    doc_ref: String(b.doc_ref || "").trim(), obs: String(b.obs || "").trim(),
    afecta_efectivo: b.afecta_efectivo !== false && (b.metodo || "efectivo") === "efectivo",
    foto: b.foto || null, creado_en: ahora(),
  };
  const movimientos = (c.movimientos || []).concat(mov);
  const upd = store.update("cierres_caja", c.id, { movimientos });
  auditoria.registrar(req, { accion: "cierre_movimiento", entidad: "cierres_caja", entidad_id: c.id, resumen: `${b.tipo} ${mov.importe} € · ${mov.concepto || (mov.proveedor_id || "")}`, meta: { proveedor_id: mov.proveedor_id, doc_ref: mov.doc_ref } });
  await store.flush();
  res.json(cc.decorar(upd));
});
router.delete("/:id/movimiento/:mid", async (req, res) => {
  const c = store.findById("cierres_caja", req.params.id);
  if (!c) return res.status(404).json({ error: "Cierre no encontrado" });
  if (bloqueadoSiCerrado(c, res)) return;
  const movimientos = (c.movimientos || []).filter((m) => m.id !== req.params.mid);
  const upd = store.update("cierres_caja", c.id, { movimientos });
  await store.flush();
  res.json(cc.decorar(upd));
});

// ── REVISAR (validaciones, sin cerrar) ──────────────────────────────────────
router.post("/:id/revisar", async (req, res) => {
  const c = store.findById("cierres_caja", req.params.id);
  if (!c) return res.status(404).json({ error: "Cierre no encontrado" });
  const con = cc.conciliar(c);
  const faltan = cc.faltanObligatorios(c);
  const estado = faltan.length ? "revisando" : (con.clasificacion === "cuadrado" ? "cuadrado" : "revisando");
  const upd = store.update("cierres_caja", c.id, { estado });
  await store.flush();
  res.json({ ...cc.decorar(upd), faltan });
});

// ── VALIDAR (solo admin) ────────────────────────────────────────────────────
router.post("/:id/validar", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const c = store.findById("cierres_caja", req.params.id);
  if (!c) return res.status(404).json({ error: "Cierre no encontrado" });
  if (c.estado !== "cerrado") return res.status(409).json({ error: "Solo se valida un cierre ya cerrado." });
  const historial = (c.historial || []).concat({ accion: "validar", usuario: req.user.nombre, fecha: ahora() });
  const upd = store.update("cierres_caja", c.id, { estado: "validado", validado_por: req.user.nombre, validado_en: ahora(), historial });
  auditoria.registrar(req, { accion: "cierre_validar", entidad: "cierres_caja", entidad_id: c.id, resumen: `Cierre ${c.codigo || c.id} validado` });
  await store.flush();
  res.json(cc.decorar(upd));
});

// ── CERRAR CAJA (definitivo) ────────────────────────────────────────────────
router.post("/:id/cerrar", jsonGrande, async (req, res) => {
  const c = store.findById("cierres_caja", req.params.id);
  if (!c) return res.status(404).json({ error: "Cierre no encontrado" });
  if (c.estado === "cerrado" || c.estado === "validado") return res.status(409).json({ error: "El cierre ya está cerrado." });
  // 2) Re-sincronizar con Ágora y detectar operaciones nuevas.
  const datos = cc.agregarAgora(c.fecha, c.local_id);
  const prev = c.agora && c.agora.lineas_venta;
  const nuevas = prev != null && datos.lineas_venta > prev ? datos.lineas_venta - prev : 0;
  const agora = { ...datos, sincronizado_en: ahora(), sincronizado_por: (req.user && req.user.nombre) || "—", resultado: `${datos.lineas_venta} líneas · ${datos.tickets} tickets`, error: null, nuevas_operaciones: nuevas };
  const cierreTmp = { ...c, agora };
  // 1) Campos obligatorios.
  const faltan = cc.faltanObligatorios(cierreTmp);
  if (faltan.length) return res.status(422).json({ error: "Faltan datos para cerrar.", faltan, agora, nuevas_operaciones: nuevas });
  const con = cc.conciliar(cierreTmp);
  const estado = con.requiere_incidencia ? "incidencia" : "cerrado";
  const codigo = `CC-${c.fecha.replace(/-/g, "")}-${(c.turno || "U").slice(0, 1).toUpperCase()}-${String(store.readAll("cierres_caja").filter((x) => x.codigo).length + 1).padStart(3, "0")}`;
  const historial = (c.historial || []).concat({ accion: "cerrar", usuario: (req.user && req.user.nombre) || "—", fecha: ahora(), descuadre: con.descuadre_total });
  const upd = store.update("cierres_caja", c.id, {
    agora, estado: estado === "incidencia" ? "incidencia" : "cerrado",
    codigo, hora_cierre: c.hora_cierre || horaHM(),
    conciliacion_final: con, cerrado_en: ahora(), cerrado_por: (req.user && req.user.nombre) || "—",
    dispositivo: dispositivo(req), ip: (req.ip || req.headers["x-forwarded-for"] || "").toString().slice(0, 60),
    historial,
  });
  auditoria.registrar(req, { accion: "cierre_cerrar", entidad: "cierres_caja", entidad_id: c.id, resumen: `Cierre ${codigo} · descuadre ${con.descuadre_total} € · ${estado}`, meta: { descuadre: con.descuadre_total, estado, dispositivo: dispositivo(req) } });
  await store.flush();
  res.json({ ...cc.decorar(upd), nuevas_operaciones: nuevas });
});

// ── REABRIR (solo admin · exige motivo) ─────────────────────────────────────
router.post("/:id/reabrir", jsonGrande, async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const c = store.findById("cierres_caja", req.params.id);
  if (!c) return res.status(404).json({ error: "Cierre no encontrado" });
  const motivo = String((req.body && req.body.motivo) || "").trim();
  if (!motivo) return res.status(400).json({ error: "El motivo de reapertura es obligatorio." });
  const historial = (c.historial || []).concat({ accion: "reabrir", usuario: req.user.nombre, fecha: ahora(), motivo });
  const upd = store.update("cierres_caja", c.id, { estado: "revisando", reabierto_en: ahora(), reabierto_por: req.user.nombre, reabierto_motivo: motivo, version: (c.version || 1) + 1, historial });
  auditoria.registrar(req, { accion: "cierre_reabrir", entidad: "cierres_caja", entidad_id: c.id, resumen: `Cierre ${c.codigo || c.id} reabierto · ${motivo}`, meta: { motivo, version: upd.version } });
  await store.flush();
  res.json(cc.decorar(upd));
});

module.exports = router;
