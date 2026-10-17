// EQUIPO · datos económicos del personal y coste laboral. Si aún no hay datos de
// RRHH, degrada con elegancia: deriva un censo mínimo de las cuentas de usuario y
// devuelve coste 0 con un aviso de "faltan datos", en vez de romper.

const store = require("./data-store");

const ESTADOS = ["trabajando", "libre", "vacaciones", "baja"];
const COEF_EMPRESA = 1.32; // compat histórica: SS empresa por defecto ~32% (= COEF_EMPRESA − 1)
const SS_EMPRESA_PCT_DEFECTO = COEF_EMPRESA - 1; // 0,32

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// SS a cargo de la empresa (fracción) de un empleado. Por empleado (no un 1,32 global):
// campo ss_empresa_pct (admite 30 o 0,30). Por defecto 0,32 para no cambiar los números
// históricos mientras no se declare la SS real de cada nómina.
function ssEmpresaPct(s) {
  let v = s.ss_empresa_pct;
  if (v == null || v === "") return SS_EMPRESA_PCT_DEFECTO;
  v = Number(v);
  if (!Number.isFinite(v) || v < 0) return SS_EMPRESA_PCT_DEFECTO;
  return v > 1 ? v / 100 : v;
}

// Coste laboral ANUAL de empresa de un empleado (devengo real):
//  · por hora: coste_hora × horas_semana × 52;
//  · por salario: bruto mensual × nº de pagas (12 o 14 según convenio) × (1 + SS empresa)
//    + honorarios del gestor por nómina × 12.
// Por defecto 12 pagas y SS 0,32 → idéntico al histórico (bruto×12×1,32) mientras no se
// declare el convenio real. Devengar las pagas extra evita infravalorar el coste (L8).
function costeAnualEmpleado(s) {
  const ch = Number(s.coste_hora) || 0;
  const hs = Number(s.horas_semana) || 0;
  if (ch > 0 && hs > 0) return ch * hs * 52;
  const sal = Number(s.salario_bruto_mensual) || 0;
  if (sal > 0) {
    const pagas = Number(s.num_pagas) > 0 ? Number(s.num_pagas) : 12;
    const gestorMensual = Number(s.gestor_mensual) || 0;
    return sal * pagas * (1 + ssEmpresaPct(s)) + gestorMensual * 12;
  }
  return 0;
}

// Coste laboral diario de un empleado (devengo anual prorrateado a días naturales).
function costeDiarioEmpleado(s) {
  const ch = Number(s.coste_hora) || 0;
  const hs = Number(s.horas_semana) || 0;
  if (ch > 0 && hs > 0) return (ch * hs) / 7; // modelo por hora: inalterado
  return costeAnualEmpleado(s) / 365;
}

// Censo del equipo. Prioriza staff_finance; si está vacío, deriva de usuarios.
function censo() {
  const sf = store.readAll("staff_finance").filter((s) => s.activo !== false);
  if (sf.length) return { fuente: "staff_finance", equipo: sf };
  const usuarios = store.readAll("usuarios").filter((u) => u.rol);
  const derivado = usuarios.map((u) => ({
    id: u.id || u.key, usuario_key: u.key, nombre: u.nombre || u.key, rol: u.rol,
    coste_hora: 0, horas_semana: 0, estado: "trabajando", activo: true, sin_datos: true,
  }));
  return { fuente: derivado.length ? "usuarios" : "vacio", equipo: derivado };
}

// Coste laboral imputable a un rango [desde, hasta).
function costeEnRango(rango) {
  const { equipo } = censo();
  const dias = (rango.hasta - rango.desde) / 86400000;
  const diario = equipo.reduce((s, e) => s + costeDiarioEmpleado(e), 0);
  return eur(diario * dias);
}

function costeDiarioTotal() {
  const { equipo } = censo();
  return eur(equipo.reduce((s, e) => s + costeDiarioEmpleado(e), 0));
}

// Resumen del bloque "Equipo" del dashboard.
function resumen(rango, now = Date.now()) {
  const { fuente, equipo } = censo();
  const cuenta = (estado) => equipo.filter((e) => (e.estado || "trabajando") === estado).length;
  const diario = costeDiarioTotal();
  const dias = rango ? (rango.hasta - rango.desde) / 86400000 : 1;
  const faltanDatos = fuente !== "staff_finance";
  return {
    total_empleados: equipo.length,
    trabajando: cuenta("trabajando"),
    libres: cuenta("libre"),
    vacaciones: cuenta("vacaciones"),
    bajas: cuenta("baja"),
    coste_diario: diario,
    coste_semana: eur(diario * 7),
    coste_mes: eur(diario * (365 / 12)),
    coste_anio: eur(diario * 365),
    coste_periodo: eur(diario * dias),
    coste_hora_medio: equipo.length ? eur(equipo.reduce((s, e) => s + (Number(e.coste_hora) || 0), 0) / equipo.length) : 0,
    faltan_datos: faltanDatos,
    equipo,
  };
}

module.exports = { ESTADOS, COEF_EMPRESA, SS_EMPRESA_PCT_DEFECTO, ssEmpresaPct, costeAnualEmpleado, costeDiarioEmpleado, censo, costeEnRango, costeDiarioTotal, resumen, eur };
