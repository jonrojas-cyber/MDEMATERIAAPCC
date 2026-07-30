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
  try {
    await push.enviarATodos({
      title: "⏰ Retira: " + t.label,
      body: "Tiempo cumplido. Retira el producto del sous-vide.",
      tag: t.id, url: "/",
    });
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
// Al arrancar: reprograma los que aún no han vencido; descarta los caducados.
function init() {
  const now = Date.now();
  const vivos = leer().filter((t) => t.fireAt > now);
  guardar(vivos);
  vivos.forEach(agendar);
}

module.exports = { programar, cancelar, init, leer };
