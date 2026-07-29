// CIERRE DE CAJA · arqueo diario y conciliación Ágora / efectivo / tarjetas.
//
// No crea una segunda integración con Ágora: AGREGA las ventas que la integración
// existente ya importó (entidad "ventas", fuente "agora") por día/local. El
// desglose de cobros (efectivo/tarjeta) NO lo expone el importador de Ágora, así
// que esos campos se marcan "no disponible en Ágora" y el responsable copia del
// Z de Ágora los totales de efectivo/tarjeta (campos "según Ágora").
//
// Conciliación (fuente única de la aritmética del cierre):
//   efectivo_esperado = fondo + ventas_efectivo(Ágora) + ingresos − pagos_efectivo
//                       − retiradas − devoluciones_efectivo
//   descuadre_efectivo = contado − efectivo_esperado
//   descuadre_tarjetas = Σ datáfonos − tarjetas(Ágora)
//   descuadre_total    = descuadre_efectivo + descuadre_tarjetas + descuadre_otros
// El estado sale de la tolerancia configurable.

const store = require("./data-store");

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// Denominaciones de euro (valor en €) para el arqueo por monedas y billetes.
const DENOMINACIONES = [0.01, 0.02, 0.05, 0.10, 0.20, 0.50, 1, 2, 5, 10, 20, 50, 100, 200];

const ESTADOS = ["pendiente", "revisando", "cuadrado", "validado", "cerrado", "incidencia"];

const TIPOS_MOVIMIENTO = [
  "pago_proveedor", "compra_urgente", "retirada", "ingreso", "devolucion",
  "adelanto", "gasto_autorizado", "cambio_entregado", "otro",
];

const TIPOS_INCIDENCIA = [
  "error_cambio", "pago_no_registrado", "cobro_no_registrado", "ticket_pendiente",
  "ticket_anulado", "propina_mal_imputada", "diferencia_datafono", "devolucion_no_registrada",
  "retirada_no_registrada", "invitacion_no_autorizada", "error_sync_agora", "otra",
];

// ── CONFIGURACIÓN (tolerancias, datáfonos, otros métodos) ───────────────────
function configDefault() {
  return {
    tolerancia_cuadrado: 1,   // 0..1 € → cuadrado
    tolerancia_revisar: 5,    // 1,01..5 € → revisar; > → incidencia obligatoria
    turnos: ["Mañana", "Tarde", "Partido"],
    datafonos: [
      { id: "df-principal", nombre: "Datáfono principal", numero: "" },
    ],
    otros_metodos: [
      { id: "om-bizum", nombre: "Bizum" },
      { id: "om-transferencia", nombre: "Transferencia" },
      { id: "om-vales", nombre: "Vales" },
    ],
  };
}
function leerConfig() {
  const c = store.findById("config", "cierre_caja");
  return { ...configDefault(), ...(c && c.valor ? c.valor : {}) };
}
function guardarConfig(patch) {
  const actual = leerConfig();
  const valor = { ...actual, ...(patch || {}) };
  const existe = store.findById("config", "cierre_caja");
  if (existe) store.update("config", "cierre_caja", { valor });
  else store.insert("config", { id: "cierre_caja", valor });
  return valor;
}

// ── AGREGACIÓN DE ÁGORA (desde ventas ya importadas · idempotente) ──────────
// Devuelve lo que la integración actual SÍ da y lista explícita de lo que NO.
function agregarAgora(fecha, localId = "principal") {
  const dia = String(fecha).slice(0, 10);
  const ventas = store.readAll("ventas").filter((v) => {
    if (v.fuente && v.fuente !== "agora") return false;
    return String(v.fecha).slice(0, 10) === dia;
  });
  let venta = 0, unidades = 0;
  const tickets = new Set();
  const porProducto = {};
  ventas.forEach((v) => {
    venta += num(v.importe);
    unidades += num(v.cantidad);
    if (v.doc_clave) tickets.add(v.doc_clave);
    const k = v.producto || v.producto_id || "—";
    porProducto[k] = (porProducto[k] || 0) + num(v.importe);
  });
  const nTickets = tickets.size || (ventas.length ? 1 : 0);
  return {
    venta_neta: eur(venta),          // el importador solo trae el importe de línea
    venta_bruta: eur(venta),         // = neta (sin desglose de descuentos en la integración)
    tickets: nTickets,
    ticket_medio: nTickets ? eur(venta / nTickets) : 0,
    unidades: eur(unidades),
    por_producto: Object.entries(porProducto).map(([k, v]) => ({ producto: k, importe: eur(v) }))
      .sort((a, b) => b.importe - a.importe).slice(0, 30),
    lineas_venta: ventas.length,
    // Campos que la integración actual de Ágora NO expone (no se inventan):
    no_disponible: [
      "descuentos", "invitaciones", "anulaciones", "devoluciones", "iva_desglosado",
      "cobros_efectivo", "cobros_tarjeta", "cobros_otros", "propinas",
      "ventas_por_caja", "ventas_por_empleado", "tickets_abiertos", "tickets_pendientes",
      "tickets_anulados", "operaciones_post_cierre", "diferencias_entre_terminales",
      "aperturas_cajon", "retiradas_agora", "clientes",
    ],
  };
}

// ── ARQUEO (monedas y billetes) → total contado ────────────────────────────
function arqueoTotal(arqueo) {
  if (!arqueo || typeof arqueo !== "object") return 0;
  let t = 0;
  DENOMINACIONES.forEach((d) => { t += num(arqueo[String(d)]) * d; });
  return eur(t);
}

// Total de efectivo contado: el arqueo manda si tiene unidades; si no, el importe directo.
function contadoDe(cierre) {
  const ef = cierre.efectivo || {};
  const arqueo = ef.arqueo || {};
  const hayArqueo = DENOMINACIONES.some((d) => num(arqueo[String(d)]) > 0);
  return hayArqueo ? arqueoTotal(arqueo) : eur(ef.contado);
}

// Suma de movimientos de un tipo que afectan al efectivo.
function sumaMov(cierre, tipos) {
  return eur((cierre.movimientos || [])
    .filter((m) => m.afecta_efectivo && tipos.includes(m.tipo))
    .reduce((s, m) => s + num(m.importe), 0));
}

// ── CONCILIACIÓN ────────────────────────────────────────────────────────────
function conciliar(cierre, config = null) {
  const cfg = config || leerConfig();
  const ef = cierre.efectivo || {};
  const am = cierre.agora_manual || {};   // totales que el responsable copia del Z de Ágora

  const contado = contadoDe(cierre);
  const pagosEf = sumaMov(cierre, ["pago_proveedor", "compra_urgente", "gasto_autorizado", "adelanto", "otro", "cambio_entregado"]);
  const devolEf = sumaMov(cierre, ["devolucion"]);
  const retiradasMov = sumaMov(cierre, ["retirada"]);
  const ingresosMov = sumaMov(cierre, ["ingreso"]);
  const retiradas = eur(num(ef.retiradas) + retiradasMov);
  const ingresos = eur(num(ef.ingresos) + ingresosMov);
  const ventasEfAgora = num(am.ventas_efectivo);

  const efectivoEsperado = eur(num(ef.fondo_inicial) + ventasEfAgora + ingresos - pagosEf - retiradas - devolEf);
  const descuadreEfectivo = eur(contado - efectivoEsperado);

  const tarjetasDatafonos = eur((cierre.tarjetas || []).reduce((s, t) => s + num(t.total), 0));
  const tarjetasAgora = num(am.ventas_tarjeta);
  const descuadreTarjetas = eur(tarjetasDatafonos - tarjetasAgora);

  const otrosTotal = eur((cierre.otros || []).reduce((s, o) => s + num(o.importe), 0));
  const otrosAgora = num(am.ventas_otros);
  const descuadreOtros = am.ventas_otros != null ? eur(otrosTotal - otrosAgora) : 0;

  const descuadreTotal = eur(descuadreEfectivo + descuadreTarjetas + descuadreOtros);
  const abs = Math.abs(descuadreTotal);
  const tolC = num(cfg.tolerancia_cuadrado), tolR = num(cfg.tolerancia_revisar);
  let clasificacion;
  if (abs <= tolC) clasificacion = "cuadrado";
  else if (abs <= tolR) clasificacion = "revisar";
  else clasificacion = "incidencia";

  return {
    contado, efectivo_esperado: efectivoEsperado, descuadre_efectivo: descuadreEfectivo,
    pagos_efectivo: pagosEf, devoluciones_efectivo: devolEf, retiradas, ingresos,
    ventas_efectivo_agora: eur(ventasEfAgora),
    tarjetas_datafonos: tarjetasDatafonos, tarjetas_agora: eur(tarjetasAgora), descuadre_tarjetas: descuadreTarjetas,
    otros_total: otrosTotal, descuadre_otros: descuadreOtros,
    descuadre_total: descuadreTotal, descuadre_abs: eur(abs),
    clasificacion,                            // cuadrado | revisar | incidencia
    requiere_incidencia: clasificacion === "incidencia",
    tolerancia: { cuadrado: tolC, revisar: tolR },
    efectivo_a_dejar: eur(num(ef.fondo_siguiente)), efectivo_a_banco: eur(num(ef.a_caja_fuerte)),
    propinas_efectivo: eur(num(ef.propinas_efectivo)),
  };
}

// Resultado visual grande (uno de los estados de resultado).
function resultadoVisual(cierre, con) {
  if (cierre.estado === "cerrado") return con.requiere_incidencia && !cierre.incidencia ? "descuadre detectado" : "cierre validado";
  if (cierre.estado === "validado") return "cierre validado";
  if (faltanObligatorios(cierre).length) return "datos incompletos";
  if (con.clasificacion === "cuadrado") return "cierre correcto";
  if (con.clasificacion === "revisar") return "revisar cierre";
  return "descuadre detectado";
}

// Campos obligatorios mínimos para poder cerrar.
function faltanObligatorios(cierre) {
  const faltan = [];
  const ef = cierre.efectivo || {};
  if (!(cierre.responsable_key)) faltan.push("responsable");
  if (!(cierre.turno)) faltan.push("turno");
  if (contadoDe(cierre) <= 0 && num(ef.contado) <= 0) faltan.push("efectivo contado");
  if (!cierre.agora || cierre.agora.sincronizado_en == null) faltan.push("sincronizar con Ágora");
  const con = conciliar(cierre);
  if (con.requiere_incidencia && !(cierre.incidencia && cierre.incidencia.tipo)) faltan.push("incidencia obligatoria por descuadre");
  return faltan;
}

// Decora un cierre para respuesta: añade conciliación y resultado calculados.
function decorar(cierre, config = null) {
  const con = conciliar(cierre, config);
  return { ...cierre, conciliacion: con, resultado: resultadoVisual(cierre, con), faltan: faltanObligatorios(cierre) };
}

module.exports = {
  eur, DENOMINACIONES, ESTADOS, TIPOS_MOVIMIENTO, TIPOS_INCIDENCIA,
  configDefault, leerConfig, guardarConfig,
  agregarAgora, arqueoTotal, contadoDe, conciliar, resultadoVisual, faltanObligatorios, decorar,
};
