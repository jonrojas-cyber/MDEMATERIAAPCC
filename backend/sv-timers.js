// TEMPORIZADORES DE PRODUCCIÓN con AVISO PUSH programado.
// Cuando el responsable arranca un temporizador de sous-vide, se programa aquí un
// push a la hora de fin: el service worker muestra "retira [producto]" AUNQUE la
// app esté cerrada o en segundo plano. Se persiste en config para reprogramarlo
// si el servidor reinicia. Reutiliza push.js (web-push) — no hay canal nuevo.

const store = require("./data-store");
const push = require("./push");

const jobs = new Map(); // id -> Timeout

function leer() {
  const c = store.findById("config", "sv_timers");
  return c && Array.isArray(c.valor) ? c.valor : [];
}
function guardar(lista) {
  const e = store.findById("config", "sv_timers");
  if (e) store.update("config", "sv_timers", { valor: lista });
  else store.insert("config", { id: "sv_timers", valor: lista });
}

async function disparar(t) {
  jobs.delete(t.id);
  guardar(leer().filter((x) => x.id !== t.id));
  try { await store.flush(); } catch (e) {}
  const retrasoMin = t.atrasado ? Math.max(0, Math.round((Date.now() - t.fireAt) / 60000)) : 0;
  try {
    await push.enviarATodos(
      {
        title: (t.atrasado ? "⚠️ RETIRA (con retraso): " : "⏰ Retira: ") + t.label,
        body: t.atrasado
          ? `El tiempo se cumplió hace ${retrasoMin} min mientras el sistema estaba en pausa. Revisa y retira el producto del sous-vide.`
          : "Tiempo cumplido. Retira el producto del sous-vide.",
        tag: t.id, url: "/", atrasado: !!t.atrasado,
      },
      // TTL corto + urgencia alta: un "retira" no debe llegar caduco días después (pwa.2).
      { urgency: "high", ttl: 3600, topic: t.id }
    );
  } catch (e) {}
}
function agendar(t) {
  const ms = t.fireAt - Date.now();
  if (ms <= 0) { disparar(t); return; }
  const to = setTimeout(() => disparar(t), Math.min(ms, 2147483000)); // cap de setTimeout
  if (to.unref) to.unref();
  jobs.set(t.id, to);
}
async function programar(label, minutos) {
  const id = "svp" + Date.now() + Math.floor(Math.random() * 1000);
  const t = {
    id,
    label: String(label || "producción").slice(0, 80),
    fireAt: Date.now() + Math.max(0, Number(minutos) || 0) * 60000,
  };
  guardar(leer().concat(t));
  try { await store.flush(); } catch (e) {}
  agendar(t);
  return t;
}
async function cancelar(id) {
  const to = jobs.get(id);
  if (to) { clearTimeout(to); jobs.delete(id); }
  guardar(leer().filter((x) => x.id !== id));
  try { await store.flush(); } catch (e) {}
}
// Al arrancar: reprograma los que aún no han vencido y DISPARA los que vencieron
// mientras el servidor estaba caído/dormido, como aviso ATRASADO. Antes se
// descartaban en silencio y el "retira" se perdía — riesgo alimentario (pwa.1).
function init() {
  const now = Date.now();
  const lista = leer();
  const vivos = lista.filter((t) => t.fireAt > now);
  const vencidos = lista.filter((t) => t.fireAt <= now);
  guardar(vivos); // los vencidos se eliminan de la lista al dispararse (en disparar)
  vivos.forEach(agendar);
  // Devuelve la promesa de los disparos atrasados (útil en tests; en el arranque
  // no se espera, se dispara y sigue).
  return Promise.all(vencidos.map((t) => disparar({ ...t, atrasado: true })));
}

module.exports = { programar, cancelar, init, leer };
