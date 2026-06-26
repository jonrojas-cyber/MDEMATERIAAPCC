// Notificaciones push al dispositivo (Web Push). Funcionan aunque la app esté
// cerrada y el navegador en segundo plano: el Service Worker recibe el push y
// muestra la notificación del sistema.
//
// Claves VAPID: se toman de VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY si están; si no,
// se generan y se guardan en la entidad "config" (doc id "vapid"). En modo
// efímero (sin Postgres) esas claves y las suscripciones se pierden al reiniciar
// el servidor, por lo que habría que volver a "Activar avisos en este
// dispositivo". Con Postgres o con las claves en variables de entorno, persiste.

const webpush = require("web-push");
const store = require("./data-store");

const SUBJECT = process.env.VAPID_SUBJECT || "mailto:avisos@mdemateria.app";
let keys = null;

function loadKeys() {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const docs = store.readAll("config");
    let doc = docs.find((d) => d.id === "vapid");
    if (!doc || !doc.publicKey || !doc.privateKey) {
      const g = webpush.generateVAPIDKeys();
      doc = { id: "vapid", publicKey: g.publicKey, privateKey: g.privateKey };
      const idx = docs.findIndex((d) => d.id === "vapid");
      if (idx === -1) docs.push(doc);
      else docs[idx] = doc;
      store.writeAll("config", docs);
      console.warn(
        "Push: generadas claves VAPID nuevas. En modo efímero cambian al reiniciar " +
          "(define VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY o conecta Postgres para fijarlas)."
      );
    }
    keys = { publicKey: doc.publicKey, privateKey: doc.privateKey };
  }
  webpush.setVapidDetails(SUBJECT, keys.publicKey, keys.privateKey);
  return keys;
}

function getPublicKey() {
  return loadKeys().publicKey;
}

function listSubs() {
  return store.readAll("push_subs");
}

// Guarda (o actualiza) una suscripción del navegador.
function guardarSub(sub) {
  if (!sub || !sub.endpoint || !sub.keys) throw new Error("Suscripción inválida");
  const subs = store.readAll("push_subs");
  const idx = subs.findIndex((s) => s.endpoint === sub.endpoint);
  const rec = { id: sub.endpoint, endpoint: sub.endpoint, keys: sub.keys, creado_en: new Date().toISOString() };
  if (idx === -1) subs.push(rec);
  else subs[idx] = { ...subs[idx], ...rec };
  store.writeAll("push_subs", subs);
  return { dispositivos: subs.length };
}

function borrarSub(endpoint) {
  const subs = store.readAll("push_subs").filter((s) => s.endpoint !== endpoint);
  store.writeAll("push_subs", subs);
  return { dispositivos: subs.length };
}

// Envía una notificación a todos los dispositivos suscritos. Limpia los muertos.
async function enviarATodos(payload) {
  loadKeys();
  const subs = store.readAll("push_subs");
  if (!subs.length) return { enviados: 0, fallidos: 0, total: 0, eliminados: 0 };
  const data = JSON.stringify(payload);
  let enviados = 0;
  let fallidos = 0;
  const muertos = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, data);
        enviados++;
      } catch (e) {
        fallidos++;
        if (e.statusCode === 404 || e.statusCode === 410) muertos.push(s.endpoint);
      }
    })
  );
  if (muertos.length) {
    store.writeAll(
      "push_subs",
      store.readAll("push_subs").filter((s) => !muertos.includes(s.endpoint))
    );
  }
  return { enviados, fallidos, total: subs.length, eliminados: muertos.length };
}

function disponible() {
  return listSubs().length > 0;
}

module.exports = { getPublicKey, guardarSub, borrarSub, enviarATodos, disponible, listSubs };
