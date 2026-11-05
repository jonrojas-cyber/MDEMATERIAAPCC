// EQUIPO · datos económicos del personal y coste laboral. Si aún no hay datos de
// RRHH, degrada con elegancia: deriva un censo mínimo de las cuentas de usuario y
// devuelve coste 0 con un aviso de "faltan datos", en vez de romper.

const store = require("./data-store");

const ESTADOS = ["trabajando", "libre", "vacaciones", "baja"];
const COEF_EMPRESA = 1.32; // compat histórica: SS empresa por defecto ~32% (= COEF_EMPRESA − 1)
const SS_EMPRESA_PCT_DEFECTO = COEF_EMPRESA - 1; // 0,32
// SS a cargo del TRABAJADOR (se descuenta de su bruto). ~6,47% (contingencias comunes
// 4,7% + desempleo 1,55% + formación 0,1% + MEI 0,12%). Es un valor por defecto editable:
// lo exacto se toma de la nómina real que mete dirección.
const SS_TRABAJADOR_PCT_DEFECTO = 0.0647;

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }
// Normaliza un porcentaje: admite 30 (→0,30) o 0,30. Negativo/no numérico → por defecto.
function pct(v, def) { if (v == null || v === "") return def; v = Number(v); if (!Number.isFinite(v) || v < 0) return def; return v > 1 ? v / 100 : v; }

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
  const usuarios = store.readAll("usuarios").filter((u) => u.rol);
  // FUSIÓN (no sustitución): datos reales de staff_finance + usuarios SIN ficha añadidos
  // como coste 0 (sin_datos). Así, meter el sueldo de una persona NUNCA borra a las demás
  // del censo de coste laboral (evita infravalorar el P&L).
  const vistos = new Set();
  sf.forEach((s) => { if (s.id) vistos.add(s.id); if (s.usuario_key) vistos.add(s.usuario_key); });
  const equipo = sf.slice();
  usuarios.forEach((u) => {
    if (vistos.has(u.id) || vistos.has(u.key)) return;
    equipo.push({ id: u.id || u.key, usuario_key: u.key, nombre: u.nombre || u.key, rol: u.rol, coste_hora: 0, horas_semana: 0, estado: "trabajando", activo: true, sin_datos: true });
  });
  return { fuente: sf.length ? "staff_finance" : (usuarios.length ? "usuarios" : "vacio"), equipo };
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

// Desglose de la NÓMINA mensual de un empleado (la foto de una paga): del bruto se
// restan la SS del trabajador y la retención de IRPF (porcentajes tomados de la nómina
// real) para dar el NETO. Además, el coste para la empresa (bruto + SS empresa + gestor).
// Fuente única del desglose salarial (que el panel y el asistente reutilizan).
function desgloseNomina(s) {
  s = s || {};
  const bruto = eur(Number(s.salario_bruto_mensual) || 0);
  const ssTrabPct = pct(s.ss_trabajador_pct, SS_TRABAJADOR_PCT_DEFECTO);
  const irpfPct = pct(s.irpf_pct, 0);
  const ssEmpPct = ssEmpresaPct(s);
  const ssTrab = eur(bruto * ssTrabPct);
  const irpf = eur(bruto * irpfPct);
  const otras = eur(Number(s.otras_deducciones) || 0);
  const neto = eur(bruto - ssTrab - irpf - otras);
  const ssEmp = eur(bruto * ssEmpPct);
  const gestor = eur(Number(s.gestor_mensual) || 0);
  const pagas = Number(s.num_pagas) > 0 ? Number(s.num_pagas) : 12;
  return {
    id: s.id || s.usuario_key || null,
    nombre: s.nombre || s.id || "",
    rol: s.rol || "",
    activo: s.activo !== false,
    salario_bruto_mensual: bruto,
    num_pagas: pagas,
    bruto_anual: eur(bruto * pagas),
    ss_trabajador: ssTrab,
    ss_trabajador_pct: ssTrabPct,
    irpf: irpf,
    irpf_pct: irpfPct,
    otras_deducciones: otras,
    neto_mensual: neto,
    ss_empresa: ssEmp,
    ss_empresa_pct: ssEmpPct,
    gestor_mensual: gestor,
    coste_empresa_mensual: eur(bruto + ssEmp + gestor),
    coste_empresa_anual: eur((bruto * pagas) + (ssEmp * pagas) + gestor * 12),
    sin_datos: !(bruto > 0),
  };
}

module.exports = { ESTADOS, COEF_EMPRESA, SS_EMPRESA_PCT_DEFECTO, SS_TRABAJADOR_PCT_DEFECTO, pct, ssEmpresaPct, costeAnualEmpleado, costeDiarioEmpleado, censo, costeEnRango, costeDiarioTotal, resumen, desgloseNomina, eur };
