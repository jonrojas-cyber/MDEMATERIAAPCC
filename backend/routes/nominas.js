// Nóminas / sueldos del equipo. Datos SENSIBLES y personales: SOLO dirección (admin).
// Guarda, por trabajador, las cifras REALES de su nómina (bruto, SS del trabajador, IRPF
// y SS de empresa) y deriva el NETO. No se calcula el IRPF por nuestra cuenta (depende de
// cada persona): dirección mete los porcentajes/cifras de la nómina real y aquí se desglosa.
// El desglose sale de staff-finance.js (fuente única). El equipo NUNCA llega aquí: "nominas"
// no está en EQUIPO_ALLOWED (403 en la capa de auth) y además se re-comprueba el rol.

const express = require("express");
const store = require("../data-store");
const sf = require("../staff-finance");

const router = express.Router();

function soloAdmin(req, res) {
  if (req.user && req.user.rol === "admin") return true;
  res.status(403).json({ error: "Las nóminas y los sueldos son solo de dirección." });
  return false;
}

// Índice de staff_finance por id y por usuario_key (para casar con la cuenta de usuario).
function indiceSF() {
  const idx = {};
  store.readAll("staff_finance").forEach((s) => { if (s.id) idx[s.id] = s; if (s.usuario_key) idx[s.usuario_key] = s; });
  return idx;
}
function filaEmpleado(u, rec) {
  return sf.desgloseNomina({ id: u.id || u.key, usuario_key: u.key, nombre: u.nombre || u.key, rol: u.rol, ...(rec || {}) });
}
function eur2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// Lista de empleados con el desglose de su nómina + totales de la plantilla.
router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  const idx = indiceSF();
  const usuarios = store.readAll("usuarios");
  const filas = usuarios.map((u) => filaEmpleado(u, idx[u.id] || idx[u.key]));
  // staff_finance sin cuenta de usuario asociada (por si los hubiera).
  const idsUsuarios = new Set(usuarios.flatMap((u) => [u.id, u.key]));
  store.readAll("staff_finance")
    .filter((s) => !idsUsuarios.has(s.id) && !idsUsuarios.has(s.usuario_key))
    .forEach((s) => filas.push(sf.desgloseNomina(s)));
  res.json({
    empleados: filas,
    total_bruto_mes: eur2(filas.reduce((a, f) => a + f.salario_bruto_mensual, 0)),
    total_neto_mes: eur2(filas.reduce((a, f) => a + f.neto_mensual, 0)),
    total_coste_empresa_mes: eur2(filas.reduce((a, f) => a + f.coste_empresa_mensual, 0)),
    nota: "Cifras derivadas de los datos introducidos por dirección (porcentajes de la nómina real).",
  });
});

// Desglose de un trabajador.
router.get("/:id", (req, res) => {
  if (!soloAdmin(req, res)) return;
  const idx = indiceSF();
  const u = store.readAll("usuarios").find((x) => x.id === req.params.id || x.key === req.params.id);
  const rec = idx[req.params.id];
  if (!u && !rec) return res.status(404).json({ error: "Trabajador no encontrado" });
  res.json(sf.desgloseNomina({ id: (u && u.id) || req.params.id, usuario_key: u && u.key, nombre: (u && (u.nombre || u.key)) || (rec && rec.nombre), rol: u && u.rol, ...(rec || {}) }));
});

// Campos numéricos que dirección puede fijar (bruto, pagas, % SS trabajador, % IRPF, % SS
// empresa, otras deducciones y honorarios del gestor). Se admiten "1.234,56" y "30" o "0,30".
const CAMPOS_NUM = ["salario_bruto_mensual", "num_pagas", "ss_trabajador_pct", "irpf_pct", "ss_empresa_pct", "otras_deducciones", "gestor_mensual"];
// Admite número JS, "6.47" (punto decimal), "0,30" y "1.234,56" (formato europeo).
function num(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); // europeo: punto = millar, coma = decimal
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

router.put("/:id", express.json(), (req, res) => {
  if (!soloAdmin(req, res)) return;
  const b = req.body || {};
  const u = store.readAll("usuarios").find((x) => x.id === req.params.id || x.key === req.params.id);
  const patch = {
    id: req.params.id,
    usuario_key: u ? u.key : (b.usuario_key || req.params.id),
    nombre: (u && (u.nombre || u.key)) || b.nombre || req.params.id,
    rol: (u && u.rol) || b.rol || "equipo",
    activo: b.activo != null ? !!b.activo : true,
  };
  CAMPOS_NUM.forEach((k) => { const v = num(b[k]); if (v != null) patch[k] = v; });
  const existe = store.findById("staff_finance", req.params.id);
  if (existe) store.update("staff_finance", req.params.id, patch);
  else store.insert("staff_finance", patch);
  try {
    require("../auditoria").registrar(req, {
      accion: "nomina_editada", entidad: "staff_finance", entidad_id: req.params.id,
      resumen: `Nómina actualizada: ${patch.nombre}`, meta: { bruto: patch.salario_bruto_mensual },
    });
  } catch (e) {}
  const guardado = store.findById("staff_finance", req.params.id) || patch;
  res.json(sf.desgloseNomina({ ...guardado, nombre: patch.nombre, rol: patch.rol }));
});

module.exports = router;
module.exports.soloAdmin = soloAdmin;
