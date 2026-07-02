// EQUIPO · datos económicos del personal y coste laboral. Si aún no hay datos de
// RRHH, degrada con elegancia: deriva un censo mínimo de las cuentas de usuario y
// devuelve coste 0 con un aviso de "faltan datos", en vez de romper.

const store = require("./data-store");

const ESTADOS = ["trabajando", "libre", "vacaciones", "baja"];
const COEF_EMPRESA = 1.32; // coste empresa ≈ salario bruto + ~32% (SS a cargo empresa)

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// Coste laboral diario de un empleado. Admite dos modelos: por hora (coste_hora +
// horas_semana) o por salario bruto mensual (se le añade el coste de empresa).
function costeDiarioEmpleado(s) {
  const ch = Number(s.coste_hora) || 0;
  const hs = Number(s.horas_semana) || 0;
  if (ch > 0 && hs > 0) return (ch * hs) / 7;
  const sal = Number(s.salario_bruto_mensual) || 0;
  if (sal > 0) return (sal * COEF_EMPRESA) / (365 / 12);
  return 0;
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

module.exports = { ESTADOS, COEF_EMPRESA, costeDiarioEmpleado, censo, costeEnRango, costeDiarioTotal, resumen, eur };
