// Service Worker de m de materia · Control M.
// Recibe las notificaciones push y las muestra como notificación del sistema,
// aunque la app esté cerrada. Al pulsarla, abre/enfoca la app.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Handler de fetch mínimo (passthrough puro): NO cachea nada, así que la app
// sigue cargando siempre la última versión en vivo, igual que hasta ahora. Su
// único fin es cumplir el criterio de instalabilidad de Android/Chrome: con un
// service worker que escucha 'fetch', la web se instala como app real (WebAPK)
// y el icono deja de llevar el sello de Chrome.
self.addEventListener("fetch", () => {});

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
  event.waitUntil(self.registration.showNotification(title, options));
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
