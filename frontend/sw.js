// Service Worker de m de materia · Control M.
// Recibe las notificaciones push y las muestra como notificación del sistema,
// aunque la app esté cerrada. Al pulsarla, abre/enfoca la app.

// Caché del APP-SHELL para que la app abra sin red (pwa.4). Estrategia:
//   · Navegación (el documento): RED PRIMERO → siempre lo último si hay red; si
//     no hay red, se sirve el shell cacheado (offline). No sacrifica frescura.
//   · Estáticos propios (iconos, fuentes, manifest): caché primero, red de apoyo.
//   · /api, /tpv, /avisos, /facturas, /etiqueta y terceros: NUNCA se cachean
//     (datos, finanzas, admin) — passthrough directo a la red.
const CACHE = "control-m-shell-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

function esDinamico(url) {
  return /^\/(api|tpv|agora|avisos|facturas|etiqueta)(\/|$)/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;                         // solo GET es cacheable
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;          // terceros: passthrough
  if (esDinamico(url)) return;                              // datos/finanzas: nunca caché

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/index.html").then((r) => r || caches.match("/")))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req)
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
          return res;
        })
        .catch(() => hit)
    )
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "m de materia", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "m de materia";
  const options = {
    body: data.body || "",
    tag: data.tag || "avisos",
    renotify: true,
    requireInteraction: true,
    data: { url: data.url || "/" },
  };
  event.waitUntil((async () => {
    // pwa.5: si la app está ABIERTA y a la vista, el aviso de sous-vide ya lo muestra
    // la propia app (svtAlarma). No duplicamos la notificación del sistema para 'sv'
    // cuando hay un cliente enfocado; sí la mostramos si la app está en 2º plano/cerrada.
    if (data.kind === "sv") {
      const clientes = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const enfocado = clientes.find((c) => c.visibilityState === "visible" || c.focused);
      if (enfocado) {
        try { enfocado.postMessage({ tipo: "sv-push", tag: data.tag }); } catch (e) {}
        return; // evitar el duplicado en primer plano
      }
    }
    return self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
