// CIERRE DE MES · informe macro + micro a nivel "psicópata".
//
// NO recalcula dinero: compone la única fuente de verdad (costing.js) y los
// motores ya existentes (financials, fixed-costs-os, periods). Da la foto
// completa de un mes: P&L, break-even, EBITDA, patrimonio, comparativas y el
// detalle producto a producto (ingeniería de menú) + estado de escandallos.
//
// Admin only: la ruta filtra por rol (el equipo nunca ve coste/precio/margen).

const store = require("./data-store");
const periods = require("./periods");
const costing = require("./costing");
const financials = require("./financials");
const fixedCostsOS = require("./fixed-costs-os");

const DAY = 86400000;
function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function pct(n) { return n == null ? null : Math.round(Number(n) * 10) / 10; }

// Rango de un mes concreto. mesStr = "YYYY-MM" (o vacío → mes en curso).
function rangoMes(mesStr, now = Date.now()) {
  let y, m;
  if (/^\d{4}-\d{2}$/.test(String(mesStr || ""))) {
    [y, m] = mesStr.split("-").map(Number);
    m -= 1;
  } else {
    const d = new Date(now);
    y = d.getFullYear();
    m = d.getMonth();
  }
  const desde = new Date(y, m, 1).getTime();
  const finMes = new Date(y, m + 1, 1).getTime();
  const enCurso = now < finMes;
  return {
    desde,
    // mes en curso → hasta ahora; mes cerrado → mes completo.
    hasta: enCurso ? Math.min(now, finMes) : finMes,
    finMes,
    label: `${y}-${String(m + 1).padStart(2, "0")}`,
    en_curso: enCurso,
  };
}

// Agregado de ventas por producto dentro de un rango (usa costing para el coste).
function porProducto(r, idxMat, productos) {
  const prodById = {};
  const prodByName = {};
  productos.forEach((p) => {
    prodById[p.id] = p;
    if (p.nombre) prodByName[p.nombre.toLowerCase()] = p;
  });
  const acc = {};
  store.readAll("ventas").forEach((v) => {
    const t = new Date(v.fecha).getTime();
    if (!Number.isFinite(t) || t < r.desde || t >= r.hasta) return;
    const p = prodById[v.producto_id] || prodByName[String(v.producto || "").toLowerCase()];
    const key = (p && p.id) || v.producto_id || v.producto || "?";
    const cant = Number(v.cantidad) || 0;
    const importe = Number(v.importe) || 0;
    if (!acc[key]) {
      acc[key] = {
        producto_id: p ? p.id : null,
        nombre: p ? p.nombre : v.producto || key,
        categoria: p ? p.categoria : null,
        unidades: 0,
        ingreso: 0,
        vinculado: !!p,
        escandallo_estimado: p ? p.cantidades_estimadas === true : null,
      };
    }
    // Coste teórico (con IVA de compra) × unidades reales vendidas.
    const costeUnit = p ? costing.margenProducto(p, idxMat).coste : 0;
    acc[key].unidades += cant;
    acc[key].ingreso += importe;
    acc[key]._coste = (acc[key]._coste || 0) + costeUnit * cant;
  });
  return Object.values(acc);
}

// Clasificación de ingeniería de menú (estrella / caballo / enigma / perro).
function clasificar(items) {
  const conVenta = items.filter((x) => x.unidades > 0);
  if (!conVenta.length) return items;
  const totalUnid = conVenta.reduce((s, x) => s + x.unidades, 0);
  const margenMedio = conVenta.reduce((s, x) => s + (x.margen_euros_unit || 0), 0) / conVenta.length;
  const popularidadMedia = (totalUnid / conVenta.length) * 0.7; // regla del 70%
  items.forEach((x) => {
    if (!(x.unidades > 0)) { x.clase = "sin_ventas"; return; }
    const popular = x.unidades >= popularidadMedia;
    const rentable = (x.margen_euros_unit || 0) >= margenMedio;
    x.clase = popular
      ? (rentable ? "estrella" : "caballo_de_batalla")
      : (rentable ? "enigma" : "perro");
  });
  return items;
}

// Suma por clave dentro de un rango (compras, mermas) — importes ya almacenados.
function sumarEnRango(entidad, campoImporte, campoFecha, campoClave, resolverClave) {
  const g = {};
  store.readAll(entidad).forEach((row) => {
    const t = new Date(row[campoFecha]).getTime();
    if (!Number.isFinite(t)) return;
    const label = resolverClave ? resolverClave(row) : (row[campoClave] || "?");
    g[label] = (g[label] || 0) + (Number(row[campoImporte]) || 0);
    row.__t = t;
  });
  return g;
}

function comprasProveedorMes(r) {
  const prov = {};
  store.readAll("proveedores").forEach((p) => (prov[p.id] = p.nombre));
  const g = {};
  store.readAll("recepciones").forEach((rc) => {
    const t = new Date(rc.fecha).getTime();
    if (!Number.isFinite(t) || t < r.desde || t >= r.hasta) return;
    const label = prov[rc.proveedor_id] || rc.proveedor_id || "Sin proveedor";
    g[label] = (g[label] || 0) + (Number(rc.importe_total) || 0);
  });
  return Object.entries(g).map(([label, value]) => ({ label, value: eur(value) })).sort((a, b) => b.value - a.value);
}

function mermasMes(r) {
  const porMotivo = {};
  const porProducto = {};
  let total = 0;
  store.readAll("ajustes").forEach((a) => {
    const t = new Date(a.fecha).getTime();
    if (!Number.isFinite(t) || t < r.desde || t >= r.hasta) return;
    const c = Number(a.coste_estimado) || 0;
    total += c;
    porMotivo[a.motivo || "otro"] = (porMotivo[a.motivo || "otro"] || 0) + c;
    const k = a.objetivo_nombre || a.objetivo_id || "?";
    porProducto[k] = (porProducto[k] || 0) + c;
  });
  const toArr = (o) => Object.entries(o).map(([label, value]) => ({ label, value: eur(value) })).sort((a, b) => b.value - a.value);
  return { total: eur(total), por_motivo: toArr(porMotivo), por_producto: toArr(porProducto).slice(0, 12) };
}

// Estado del escandallo de toda la carta (para el food cost fluctuante).
function estadoEscandallos(idxMat, productos) {
  const items = productos
    .filter((p) => p.activo !== false)
    .map((p) => {
      const ing = p.ingredientes || [];
      const sinCoste = ing.filter((i) => {
        const m = idxMat[i.materia_id];
        return !m || !(Number(m.coste_medio) > 0);
      }).length;
      const mg = costing.margenProducto(p, idxMat);
      let estado = "real";
      if (!ing.length) estado = "sin_escandallo";
      else if (p.cantidades_estimadas === true) estado = "estimado";
      else if (sinCoste > 0) estado = "materias_sin_coste";
      return {
        producto_id: p.id, nombre: p.nombre, categoria: p.categoria,
        estado, n_ingredientes: ing.length, materias_sin_coste: sinCoste,
        food_cost_pct: pct(mg.food_cost * 100), coste: mg.coste, precio: mg.precio,
      };
    });
  const pendientes = items.filter((x) => x.estado !== "real");
  return {
    total: items.length,
    reales: items.filter((x) => x.estado === "real").length,
    pendientes: pendientes.length,
    lista_pendientes: pendientes,
    items,
  };
}

// P&L de un rango con las etiquetas del cierre (reusa financials.beneficio).
function pyl(r, now) {
  const b = financials.beneficio(r, now);
  return {
    ventas: b.ventas,
    coste_materia: b.coste_materia,
    food_cost_pct: b.food_cost_pct,
    coste_laboral: b.coste_laboral,
    coste_laboral_pct: b.coste_laboral_pct,
    gastos_variables: b.gastos_variables,
    gastos_fijos: b.gastos_fijos,
    ebitda: b.beneficio_operativo, // EBITDA-ready (ver financials.js)
    margen_operativo_pct: b.margen_operativo_pct,
    intereses_estimados: b.intereses_estimados,
    beneficio_neto_estimado: b.beneficio_neto_estimado,
  };
}

// ── INFORME COMPLETO ────────────────────────────────────────────────────────
function informe(mesStr, now = Date.now()) {
  const r = rangoMes(mesStr, now);
  const materias = store.readAll("materias");
  const idxMat = costing.indiceMaterias(materias);
  const productos = store.readAll("productos");

  // Comparativas: mes anterior completo y mismo mes del año anterior.
  const [y, m] = r.label.split("-").map(Number);
  const rAnterior = rangoMes(`${new Date(y, m - 2, 1).getFullYear()}-${String(new Date(y, m - 2, 1).getMonth() + 1).padStart(2, "0")}`, now);
  const rAnioAnt = rangoMes(`${y - 1}-${String(m).padStart(2, "0")}`, now);

  const actual = pyl(r, now);
  const anterior = pyl(rAnterior, now);
  const anioAnterior = pyl(rAnioAnt, now);
  const delta = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);

  // Micro por producto + ingeniería de menú.
  const items = porProducto(r, idxMat, productos).map((x) => {
    const coste = eur(x._coste);
    const beneficio = eur(x.ingreso - coste);
    return {
      producto_id: x.producto_id, nombre: x.nombre, categoria: x.categoria,
      unidades: Math.round(x.unidades * 10) / 10,
      ingreso: eur(x.ingreso), coste, beneficio,
      margen_pct: x.ingreso > 0 ? pct((1 - coste / x.ingreso) * 100) : null,
      food_cost_pct: x.ingreso > 0 ? pct((coste / x.ingreso) * 100) : null,
      margen_euros_unit: x.unidades > 0 ? eur(beneficio / x.unidades) : 0,
      vinculado: x.vinculado, escandallo_estimado: x.escandallo_estimado,
    };
  });
  clasificar(items);
  const productosSinVenta = productos
    .filter((p) => p.activo !== false && !items.some((it) => it.producto_id === p.id && it.unidades > 0))
    .map((p) => ({ producto_id: p.id, nombre: p.nombre, categoria: p.categoria }));

  const tickets = financials.ticketsEnRango(r);
  const fcos = fixedCostsOS.sistemaOperativo(now);

  return {
    generado_en: new Date(now).toISOString(),
    mes: r.label,
    rango: { desde: new Date(r.desde).toISOString(), hasta: new Date(r.hasta).toISOString() },
    estado_mes: r.en_curso ? "en_curso" : "cerrado",

    // ── MACRO ──────────────────────────────────────────────────────────────
    macro: {
      pyl: actual,
      tickets: { numero: tickets.numero != null ? tickets.numero : tickets.tickets, ticket_medio: tickets.ticket_medio },
      break_even: {
        equilibrio_mes: fcos.break_even.ingreso_equilibrio_dia != null ? eur(fcos.break_even.ingreso_equilibrio_dia * (fcos.break_even.dias_abiertos_mes || 30)) : null,
        margen_seguridad_pct: fcos.dashboard.margen_seguridad_pct,
        en_perdidas: fcos.dashboard.en_perdidas,
        coste_hora: fcos.dashboard.coste_hora,
      },
      patrimonio_neto: financials.patrimonioNeto(now),
      ahorro_anual_potencial: fcos.dashboard.ahorro_anual_potencial,
    },

    // ── COMPARATIVAS ─────────────────────────────────────────────────────────
    comparativas: {
      mes_anterior: { mes: rAnterior.label, pyl: anterior, delta_ventas_pct: delta(actual.ventas, anterior.ventas), delta_ebitda_pct: delta(actual.ebitda, anterior.ebitda) },
      anio_anterior: { mes: rAnioAnt.label, pyl: anioAnterior, delta_ventas_pct: delta(actual.ventas, anioAnterior.ventas), delta_ebitda_pct: delta(actual.ebitda, anioAnterior.ebitda) },
    },

    // ── MICRO (producto a producto) ─────────────────────────────────────────
    micro: {
      por_ingreso: [...items].sort((a, b) => b.ingreso - a.ingreso),
      por_beneficio: [...items].sort((a, b) => b.beneficio - a.beneficio),
      menor_margen: [...items].filter((x) => x.margen_pct != null).sort((a, b) => a.margen_pct - b.margen_pct),
      ingenieria_menu: {
        estrella: items.filter((x) => x.clase === "estrella"),
        caballo_de_batalla: items.filter((x) => x.clase === "caballo_de_batalla"),
        enigma: items.filter((x) => x.clase === "enigma"),
        perro: items.filter((x) => x.clase === "perro"),
      },
      productos_sin_venta: productosSinVenta,
    },

    // ── DETALLE OPERATIVO ────────────────────────────────────────────────────
    detalle: {
      compras_por_proveedor: comprasProveedorMes(r),
      mermas: mermasMes(r),
      escandallos: estadoEscandallos(idxMat, productos),
    },

    // Avisos: qué mirar (escandallos pendientes, pérdidas, food cost alto).
    avisos: construirAvisos(actual, estadoEscandallos(idxMat, productos)),
  };
}

function construirAvisos(pyl, escandallos) {
  const avisos = [];
  if (escandallos.pendientes > 0) {
    avisos.push({ nivel: "advertencia", texto: `${escandallos.pendientes} producto(s) con escandallo estimado o incompleto: el food cost aún no es 100% real.` });
  }
  if (pyl.food_cost_pct != null && pyl.food_cost_pct > 35) {
    avisos.push({ nivel: "advertencia", texto: `Food cost del mes ${pyl.food_cost_pct}% (objetivo típico ≤ 30-35%).` });
  }
  if (pyl.ebitda != null && pyl.ebitda < 0) {
    avisos.push({ nivel: "critico", texto: `EBITDA del mes en negativo (${pyl.ebitda} €).` });
  }
  if (!avisos.length) avisos.push({ nivel: "ok", texto: "Sin alertas críticas en el cierre." });
  return avisos;
}

// Congela un cierre de mes (foto inmutable) para el histórico.
function cerrar(mesStr, now = Date.now(), usuario = null) {
  const inf = informe(mesStr, now);
  const registro = {
    id: `cierre-${inf.mes}`,
    mes: inf.mes,
    cerrado_en: new Date(now).toISOString(),
    cerrado_por: usuario && usuario.nombre ? usuario.nombre : null,
    informe: inf,
  };
  const existente = store.findById("cierres_mes", registro.id);
  if (existente) store.update("cierres_mes", registro.id, registro);
  else store.insert("cierres_mes", registro);
  return registro;
}

function historial() {
  return store.readAll("cierres_mes")
    .map((c) => ({ id: c.id, mes: c.mes, cerrado_en: c.cerrado_en, cerrado_por: c.cerrado_por, ventas: c.informe && c.informe.macro && c.informe.macro.pyl.ventas, ebitda: c.informe && c.informe.macro && c.informe.macro.pyl.ebitda }))
    .sort((a, b) => (a.mes < b.mes ? 1 : -1));
}

module.exports = { informe, cerrar, historial, rangoMes, eur };
