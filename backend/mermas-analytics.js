// MERMAS · ANALÍTICA (motor PURO, sin disco)
// ─────────────────────────────────────────────────────────────────────────────
// A partir de los registros de merma (entidad `ajustes`) de un periodo, calcula:
//  · total € y nº de movimientos
//  · desglose por motivo y por grupo
//  · € evitable (accidentes/elaboración/servicio/sobreproducción) y su %
//  · productos más mermados (por € y por nº)
//  · serie diaria (para la gráfica del departamento financiero)
//  · "cosas extrañas": anomalías explicables (picos, concentración, repetición…)
//
// Todo derivado de los datos; nada inventado. El € de cada merma ya viene calculado
// por costing.js al registrarla (coste_estimado), que es la única fuente del dinero.

// Grupos que consideramos EVITABLES (fallo operativo que se puede reducir).
const GRUPOS_EVITABLES = ["accidente", "elaboración", "servicio", "sobreproducción"];
const GRUPOS_INTENCIONADOS = ["cortesía", "i+d", "personal"]; // coste "a propósito"

function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function diaISO(iso) { try { return new Date(iso).toISOString().slice(0, 10); } catch (e) { return null; } }

function analizar(mermas, opts) {
  opts = opts || {};
  const lista = (mermas || []).filter((m) => m && m.fecha);
  const total = r2(lista.reduce((s, m) => s + (Number(m.coste_estimado) || 0), 0));
  const n = lista.length;

  const por_motivo = {}, por_grupo = {};
  lista.forEach((m) => {
    const c = Number(m.coste_estimado) || 0;
    por_motivo[m.motivo || "otro"] = r2((por_motivo[m.motivo || "otro"] || 0) + c);
    const g = m.grupo || "otros";
    por_grupo[g] = r2((por_grupo[g] || 0) + c);
  });
  const evitable_eur = r2(GRUPOS_EVITABLES.reduce((s, g) => s + (por_grupo[g] || 0), 0));
  const evitable_pct = total > 0 ? Math.round((evitable_eur / total) * 100) : 0;
  const intencionado_eur = r2(GRUPOS_INTENCIONADOS.reduce((s, g) => s + (por_grupo[g] || 0), 0));

  // Productos más mermados (por nombre). € y nº de veces y cantidad suelta.
  const prodMap = {};
  lista.forEach((m) => {
    const key = (m.objetivo_nombre || m.producto || m.objetivo_id || "—");
    if (!prodMap[key]) prodMap[key] = { producto: key, eur: 0, veces: 0, unidades: {} };
    prodMap[key].eur = r2(prodMap[key].eur + (Number(m.coste_estimado) || 0));
    prodMap[key].veces += 1;
    const u = m.unidad || "";
    prodMap[key].unidades[u] = r2((prodMap[key].unidades[u] || 0) + (Number(m.cantidad) || 0));
  });
  const top_productos = Object.values(prodMap)
    .map((p) => ({ producto: p.producto, eur: p.eur, veces: p.veces,
      cantidad_txt: Object.keys(p.unidades).map((u) => `${p.unidades[u]} ${u}`.trim()).join(" · ") }))
    .sort((a, b) => b.eur - a.eur || b.veces - a.veces)
    .slice(0, 10);

  // Serie diaria (coste y nº por día) dentro de la ventana [desde, hasta].
  const diaMap = {};
  lista.forEach((m) => { const d = diaISO(m.fecha); if (!d) return; if (!diaMap[d]) diaMap[d] = { fecha: d, total: 0, n: 0 }; diaMap[d].total = r2(diaMap[d].total + (Number(m.coste_estimado) || 0)); diaMap[d].n += 1; });
  const serie_diaria = Object.values(diaMap).sort((a, b) => a.fecha.localeCompare(b.fecha));

  const anomalias = detectarAnomalias({ lista, total, por_motivo, por_grupo, top_productos, serie_diaria, evitable_pct });

  return {
    total, n, por_motivo, por_grupo,
    evitable_eur, evitable_pct, intencionado_eur,
    top_productos, serie_diaria, anomalias,
    dias_con_merma: serie_diaria.length,
  };
}

// "Cosas extrañas": cada anomalía es explicable y accionable. severidad: alert/warn/info.
function detectarAnomalias({ lista, total, por_motivo, por_grupo, top_productos, serie_diaria, evitable_pct }) {
  const out = [];
  if (!lista.length) return out;

  // 1) DÍA PICO: un día cuyo coste supera mucho a la media diaria.
  if (serie_diaria.length >= 3) {
    const vals = serie_diaria.map((d) => d.total);
    const media = vals.reduce((s, x) => s + x, 0) / vals.length;
    const desv = Math.sqrt(vals.reduce((s, x) => s + (x - media) * (x - media), 0) / vals.length);
    serie_diaria.forEach((d) => {
      if (d.total >= media + 2 * desv && d.total >= Math.max(5, media * 1.8) && desv > 0) {
        out.push({ tipo: "dia_pico", severidad: "alert", valor: d.total,
          texto: `El ${fechaCorta(d.fecha)} la merma fue ${eur(d.total)} (${d.n} movimiento${d.n === 1 ? "" : "s"}), muy por encima de la media de ${eur(media)}/día. Revisa qué pasó ese día.` });
      }
    });
  }

  // 2) CONCENTRACIÓN: el producto top acumula gran parte del coste.
  if (total > 0 && top_productos.length) {
    const t = top_productos[0];
    const pct = Math.round((t.eur / total) * 100);
    if (pct >= 35 && t.eur >= 5) {
      out.push({ tipo: "concentracion", severidad: "warn", valor: t.eur,
        texto: `“${t.producto}” concentra el ${pct}% de la merma (${eur(t.eur)}). Mira compra, conservación o porción de ese producto.` });
    }
  }

  // 3) REPETICIÓN: un producto mermado muchas veces (problema sistemático).
  top_productos.forEach((p) => {
    if (p.veces >= 4) out.push({ tipo: "repeticion", severidad: "warn", valor: p.veces,
      texto: `“${p.producto}” se ha mermado ${p.veces} veces en el periodo. Repetirse tanto suele ser un fallo de proceso, no mala suerte.` });
  });

  // 4) EVITABLE ALTO: mucha merma por accidentes/elaboración/servicio.
  if (evitable_pct >= 50 && total >= 10) {
    out.push({ tipo: "evitable", severidad: "warn", valor: evitable_pct,
      texto: `El ${evitable_pct}% de la merma es EVITABLE (accidentes, mal elaborado, errores de comanda, sobreproducción). Ahí está el ahorro fácil.` });
  }

  // 5) MOTIVO DOMINANTE: un solo motivo se lleva la mayor parte.
  if (total > 0) {
    const motEnt = Object.entries(por_motivo).sort((a, b) => b[1] - a[1])[0];
    if (motEnt && motEnt[1] / total >= 0.4 && motEnt[1] >= 5) {
      out.push({ tipo: "motivo_dominante", severidad: "info", valor: motEnt[1],
        texto: `El motivo “${motEnt[0]}” supone el ${Math.round((motEnt[1] / total) * 100)}% del coste de merma. Es el foco número uno.` });
    }
  }

  // 6) MERMA PUNTUAL ALTA: un único movimiento de valor alto (p90 y mínimo).
  const costes = lista.map((m) => Number(m.coste_estimado) || 0).filter((c) => c > 0).sort((a, b) => a - b);
  if (costes.length >= 5) {
    const p90 = costes[Math.floor(costes.length * 0.9)];
    lista.forEach((m) => {
      const c = Number(m.coste_estimado) || 0;
      if (c >= p90 && c >= 8) out.push({ tipo: "merma_alta", severidad: "info", valor: c,
        texto: `Merma puntual grande: “${m.objetivo_nombre || m.producto}” por ${eur(c)} (${m.motivo || "sin motivo"}). ¿Fue un lote entero?` });
    });
  }

  // Orden: alert → warn → info, y por valor. Máximo 8 (no saturar).
  const sev = { alert: 0, warn: 1, info: 2 };
  return out.sort((a, b) => (sev[a.severidad] - sev[b.severidad]) || (b.valor || 0) - (a.valor || 0)).slice(0, 8);
}

function eur(n) { return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace(".", ",") + " €"; }
function fechaCorta(iso) { try { const d = new Date(iso + "T12:00:00"); return d.toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "2-digit" }); } catch (e) { return iso; } }

module.exports = { analizar, detectarAnomalias, GRUPOS_EVITABLES, GRUPOS_INTENCIONADOS };
