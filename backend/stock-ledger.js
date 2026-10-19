// LIBRO DE STOCK ÚNICO · el stock NO cambia sin un asiento en el libro.
// ─────────────────────────────────────────────────────────────────────────────
// Problema que resuelve (auditoría · inventario): `disponibilidad_actual` se movía
// desde varios sitios (ventas, recepciones, mermas, ajustes, recuentos) pero el
// libro `stock_movements` solo registraba las ventas y el recuento físico. Entradas
// y mermas lo saltaban → el saldo y el libro divergían y nada era auditable.
//
// Fuente única de verdad del MOVIMIENTO: `aplicar()` es el ÚNICO camino que mueve
// `disponibilidad_actual` dejando a la vez su asiento (quién, cuándo, por qué). Así:
//   · cada entrada/salida queda en el libro (auditable, reconstruible el "por qué");
//   · las salidas que exceden el stock NO se ocultan: se registra el `faltante`
//     (lo que no se pudo descontar) y se marca `negativo`, visible en la
//     reconciliación — antes se recortaba a 0 en silencio y tapaba el descuadre.
//
// Decisión (CTO): `disponibilidad_actual` sigue siendo el SALDO VIVO autoritativo
// (no reescribo historia ni recomputo el saldo desde un libro que aún no cubre el
// stock inicial — eso rompería portada/capital/food cost que ya funcionan). El libro
// pasa a ser COMPLETO de aquí en adelante, y `reconciliar()` expone faltantes,
// cobertura del libro y flujo por materia, sin afirmar de más.
//
// La VALORACIÓN (coste_medio) NO se toca aquí: es otra fuente única (costing.js) y
// se cambia a PMP/FIFO cuando se carguen las compras reales (Fase C), no al vuelo.

function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// Razones canónicas del libro (el "por qué" de cada asiento).
const RAZONES = ["compra", "venta", "merma", "inventario", "produccion", "traspaso", "ajuste"];

// Aplica un movimiento de stock: mueve el saldo de la materia (salvo que el
// llamador ya lo haya movido, aplicarSaldo:false) y SIEMPRE deja el asiento.
//   mov = { materia_id, delta, reason, source?, source_ref?, unidad?, producto?,
//           created_by?, created_at? }
//   · delta > 0 entrada · delta < 0 salida.
//   · En salidas, el saldo no baja de 0: lo que no se pudo descontar queda como
//     `faltante` en el asiento (stock teórico negativo señalado, no oculto).
// Devuelve { saldo_anterior, saldo, delta_efectivo, faltante, asiento }.
function aplicar(store, mov, opts) {
  opts = opts || {};
  const aplicarSaldo = opts.aplicarSaldo !== false;
  const materia = store.findById("materias", mov.materia_id);
  const saldoAnterior = materia ? (Number(materia.disponibilidad_actual) || 0) : 0;
  const deltaPedido = r2(mov.delta);
  let deltaEfectivo = deltaPedido;
  let faltante = 0;

  if (aplicarSaldo && materia) {
    let nuevo = r2(saldoAnterior + deltaPedido);
    if (nuevo < 0) {
      // Salida mayor que el stock: se vacía a 0 y se registra el faltante (el
      // descuadre real) en lugar de taparlo con un recorte silencioso.
      faltante = r2(-nuevo);
      deltaEfectivo = r2(-saldoAnterior);
      nuevo = 0;
    }
    store.update("materias", mov.materia_id, { disponibilidad_actual: nuevo });
  }

  const asiento = {
    id: store.nextId("mov", "stock_movements"),
    materia_id: mov.materia_id,
    // El asiento guarda el delta EFECTIVO (lo que de verdad movió el saldo), para
    // que el libro cuadre con el saldo vivo de aquí en adelante; el faltante va aparte.
    delta: aplicarSaldo ? deltaEfectivo : deltaPedido,
    unidad: mov.unidad || (materia && materia.unidad) || "",
    reason: RAZONES.includes(mov.reason) ? mov.reason : "ajuste",
    source: mov.source || mov.reason || "ajuste",
    source_ref: mov.source_ref || "",
    producto: mov.producto || "",
    created_at: mov.created_at || new Date().toISOString(),
    created_by: mov.created_by || "sistema",
  };
  if (faltante > 0) { asiento.faltante = faltante; asiento.negativo = true; }
  store.insert("stock_movements", asiento);

  const saldo = aplicarSaldo && materia ? r2(saldoAnterior + deltaEfectivo) : saldoAnterior;
  return { saldo_anterior: r2(saldoAnterior), saldo, delta_efectivo: deltaEfectivo, faltante, asiento };
}

// Asiento SIN mover el saldo: para llamadores que ya movieron `disponibilidad_actual`
// (p. ej. la recepción, que además fija precio_compra/coste_medio en el mismo paso).
function asiento(store, mov) {
  return aplicar(store, mov, { aplicarSaldo: false });
}

// Movimientos de una materia, del más reciente al más antiguo, con saldo corrido
// hacia atrás desde el saldo actual (para pintar el libro auditable).
function movimientosDe(store, materiaId, limite) {
  const materia = store.findById("materias", materiaId);
  const saldoActual = materia ? r2(materia.disponibilidad_actual) : 0;
  const movs = (store.readAll("stock_movements") || [])
    .filter((m) => m.materia_id === materiaId)
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  let saldo = saldoActual;
  const out = movs.map((m) => {
    const fila = {
      id: m.id, fecha: m.created_at, reason: m.reason, source: m.source || "",
      source_ref: m.source_ref || "", delta: r2(m.delta), unidad: m.unidad || "",
      producto: m.producto || "", responsable: m.created_by || "",
      faltante: m.faltante ? r2(m.faltante) : 0, saldo_tras: saldo,
    };
    saldo = r2(saldo - r2(m.delta)); // deshace este movimiento → saldo previo
    return fila;
  });
  return { materia_id: materiaId, nombre: materia ? materia.nombre : materiaId, saldo_actual: saldoActual, n: out.length, movimientos: limite ? out.slice(0, limite) : out };
}

// Flujo del libro en un periodo: entradas/salidas/mermas en unidades y €.
function flujo(store, desdeISO, hastaISO) {
  const materias = store.readAll("materias") || [];
  const coste = {}; materias.forEach((m) => (coste[m.id] = Number(m.coste_medio) || 0));
  const dentro = (iso) => {
    const t = String(iso || "").slice(0, 10);
    return (!desdeISO || t >= String(desdeISO).slice(0, 10)) && (!hastaISO || t <= String(hastaISO).slice(0, 10));
  };
  let entradas = 0, salidas = 0, mermas = 0, entradasEur = 0, salidasEur = 0, mermasEur = 0, n = 0;
  (store.readAll("stock_movements") || []).forEach((m) => {
    if (!dentro(m.created_at)) return;
    n++;
    const d = r2(m.delta); const c = coste[m.materia_id] || 0;
    if (d > 0) { entradas += d; entradasEur += d * c; }
    else { salidas += -d; salidasEur += -d * c; }
    if (m.reason === "merma") { mermas += -d; mermasEur += -d * c; }
  });
  return {
    n, entradas: r2(entradas), salidas: r2(salidas), mermas: r2(mermas),
    entradas_eur: r2(entradasEur), salidas_eur: r2(salidasEur), mermas_eur: r2(mermasEur),
  };
}

// Reconciliación de almacén: por materia, saldo vivo + lo que el libro registra
// (entradas/salidas/mermas/faltantes) y banderas de descuadre. HONESTO: reporta la
// cobertura del libro (materias con/sin asiento) y los faltantes (salidas que
// excedieron el stock, ahora visibles); no afirma "suma del libro == saldo" para el
// stock anterior al libro, porque el saldo inicial nunca quedó asentado.
function reconciliar(store) {
  const materias = store.readAll("materias") || [];
  const por = {};
  (store.readAll("stock_movements") || []).forEach((m) => {
    const g = (por[m.materia_id] = por[m.materia_id] || { n: 0, entradas: 0, salidas: 0, mermas: 0, faltante: 0 });
    const d = r2(m.delta); g.n++;
    if (d > 0) g.entradas += d; else g.salidas += -d;
    if (m.reason === "merma") g.mermas += -d;
    if (m.faltante) g.faltante += r2(m.faltante);
  });
  const items = materias.map((m) => {
    const g = por[m.id] || { n: 0, entradas: 0, salidas: 0, mermas: 0, faltante: 0 };
    const c = Number(m.coste_medio) || 0;
    return {
      materia_id: m.id, nombre: m.nombre, unidad: m.unidad || "",
      saldo: r2(m.disponibilidad_actual), movimientos: g.n,
      entradas: r2(g.entradas), salidas: r2(g.salidas), mermas: r2(g.mermas),
      faltante_uds: r2(g.faltante), faltante_eur: r2(g.faltante * c),
      con_libro: g.n > 0, teorico_negativo: g.faltante > 0,
    };
  });
  const faltanteEur = r2(items.reduce((s, i) => s + i.faltante_eur, 0));
  return {
    n_materias: items.length,
    con_libro: items.filter((i) => i.con_libro).length,
    sin_libro: items.filter((i) => !i.con_libro).length,
    con_faltante: items.filter((i) => i.teorico_negativo).length,
    faltante_total_eur: faltanteEur,
    items: items.sort((a, b) => b.faltante_eur - a.faltante_eur || b.movimientos - a.movimientos),
  };
}

module.exports = { aplicar, asiento, movimientosDe, flujo, reconciliar, RAZONES };
