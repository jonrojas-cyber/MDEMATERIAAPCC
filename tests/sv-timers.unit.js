// Temporizadores sous-vide (bloque 07 · pwa.1/pwa.2).
//  · init() DISPARA los temporizadores vencidos durante una caída (aviso
//    atrasado), en vez de descartarlos en silencio (riesgo alimentario).
//  · reprograma los que aún no han vencido.
//  · el push de "retira" sale con urgencia alta y TTL corto (no llega caduco).
// Ejecutar: node tests/sv-timers.unit.js
const assert = require("assert");
const store = require("../backend/data-store");
const push = require("../backend/push");

let fallos = 0;
async function test(n, fn) { try { await fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

// Captura de pushes en vez de enviarlos de verdad.
const enviados = [];
push.enviarATodos = async (payload, opciones) => { enviados.push({ payload, opciones }); return { enviados: 1 }; };

// data-store en memoria (solo config, que es lo que usa sv-timers).
const db = { config: [] };
store.findById = (n, id) => (db[n] || []).find((x) => x.id === id) || null;
store.insert = (n, o) => { (db[n] = db[n] || []).push(o); return o; };
store.update = (n, id, p) => { const x = (db[n] || []).find((y) => y.id === id); if (x) Object.assign(x, p); return x; };
store.readAll = (n) => (db[n] || (db[n] = []));
store.flush = async () => {};

const svt = require("../backend/sv-timers");

(async () => {
  console.log("temporizadores sous-vide · recuperación tras caída");

  await test("init dispara el vencido (atrasado) y conserva el futuro", async () => {
    const ahora = Date.now();
    db.config = [{ id: "sv_timers", valor: [
      { id: "viejo", label: "Costillar", fireAt: ahora - 20 * 60000 }, // venció hace 20 min
      { id: "nuevo", label: "Panceta", fireAt: ahora + 60 * 60000 },   // vence en 1 h
    ] }];
    enviados.length = 0;
    await svt.init();
    // Se disparó exactamente el vencido, como atrasado y urgente.
    assert.strictEqual(enviados.length, 1, "un solo aviso (el vencido)");
    assert.ok(enviados[0].payload.atrasado === true, "marcado como atrasado");
    assert.ok(/retraso/i.test(enviados[0].payload.title), "el título avisa del retraso");
    assert.strictEqual(enviados[0].opciones.urgency, "high", "urgencia alta");
    assert.strictEqual(enviados[0].opciones.ttl, 3600, "TTL corto (1 h)");
    // El futuro se conserva en la lista; el vencido se ha consumido.
    const quedan = svt.leer();
    assert.strictEqual(quedan.length, 1, "queda 1 temporizador");
    assert.strictEqual(quedan[0].id, "nuevo", "queda el futuro, no el vencido");
  });

  await test("sin vencidos, init no dispara nada y conserva los futuros", async () => {
    const ahora = Date.now();
    db.config = [{ id: "sv_timers", valor: [{ id: "f1", label: "X", fireAt: ahora + 3600000 }] }];
    enviados.length = 0;
    await svt.init();
    assert.strictEqual(enviados.length, 0, "ningún aviso");
    assert.strictEqual(svt.leer().length, 1, "el futuro sigue");
  });

  if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
  console.log("  todo en verde");
})();
