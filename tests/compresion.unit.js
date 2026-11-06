// Compresión (rendimiento.4): comprime texto/JSON grandes, pero NUNCA las respuestas
// en directo (SSE / streaming). Regresión: el asistente en streaming se quedaba
// "colgado" porque gzip bufferizaba los eventos token a token y no llegaban hasta el
// final. Ejecutar: node tests/compresion.unit.js
const assert = require("assert");
const { middleware } = require("../backend/compresion");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

// res falso: guarda cabeceras (insensible a mayúsculas) y lo que se escribe "al cable".
function fakeRes() {
  const headers = {};
  const raw = []; // lo que de verdad sale (tras la posible compresión)
  const res = {
    headersSent: false,
    _raw: raw,
    getHeader: (k) => headers[String(k).toLowerCase()],
    setHeader: (k, v) => { headers[String(k).toLowerCase()] = v; },
    removeHeader: (k) => { delete headers[String(k).toLowerCase()]; },
    write: (chunk) => { raw.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk)); return true; },
    end: (chunk) => { if (chunk) raw.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk)); return res; },
  };
  res._headers = headers;
  return res;
}
const REQ = { method: "GET", headers: { "accept-encoding": "gzip" } };

console.log("compresión · comprime texto, respeta el streaming en directo");

test("SSE (text/event-stream) NO se comprime: pasa tal cual y al instante", () => {
  const res = fakeRes();
  middleware(REQ, res, () => {});
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  const evento = "event: delta\ndata: {\"t\":\"hola\"}\n\n";
  res.write(evento);
  assert.ok(!res.getHeader("Content-Encoding"), "no debe marcar gzip en un stream SSE");
  assert.strictEqual(res._raw.join(""), evento, "el evento sale literal y de inmediato (no bufferizado)");
});

test("Cache-Control: no-transform desactiva la compresión (señal estándar de streaming)", () => {
  const res = fakeRes();
  middleware(REQ, res, () => {});
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Cache-Control", "no-transform");
  res.write("x".repeat(5000));
  assert.ok(!res.getHeader("Content-Encoding"), "no-transform ⇒ sin gzip");
  assert.strictEqual(res._raw.join("").length, 5000, "sale sin comprimir");
});

test("una respuesta de texto grande SÍ se comprime (gzip + sin Content-Length)", () => {
  const res = fakeRes();
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Length", "5000");
  middleware(REQ, res, () => {});
  res.write("<html>" + "a".repeat(5000) + "</html>");
  assert.strictEqual(res.getHeader("Content-Encoding"), "gzip", "el HTML grande se comprime");
  assert.ok(!res.getHeader("Content-Length"), "longitud desconocida al comprimir ⇒ se quita");
});

test("texto pequeño NO se comprime (no compensa el overhead)", () => {
  const res = fakeRes();
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Length", "100");
  middleware(REQ, res, () => {});
  res.end("{\"ok\":true}");
  assert.ok(!res.getHeader("Content-Encoding"), "por debajo del mínimo, sin gzip");
});

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("  todo en verde");
