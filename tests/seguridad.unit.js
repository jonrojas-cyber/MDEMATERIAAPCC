// Seguridad (bloque 02): comparación constante, freno de fuerza bruta por IP y
// cabeceras/CSP. Ejecutar: node tests/seguridad.unit.js
const assert = require("assert");
const seg = require("../backend/seguridad");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

console.log("seguridad · tokens, fuerza bruta y cabeceras");

test("tokenIgual compara en tiempo constante y es seguro con nulos/longitudes", () => {
  assert.strictEqual(seg.tokenIgual("abc123", "abc123"), true);
  assert.strictEqual(seg.tokenIgual("abc123", "abc124"), false);
  assert.strictEqual(seg.tokenIgual("abc", "abcdef"), false, "longitudes distintas");
  assert.strictEqual(seg.tokenIgual(null, ""), true, "null → '' == ''");
  assert.strictEqual(seg.tokenIgual(undefined, "x"), false);
});

test("limitador cuenta SOLO fallos, bloquea al llegar al máximo y libera por acierto", () => {
  const lim = seg.creaLimitadorFallos({ max: 3, ventanaMs: 10_000 });
  const req = { headers: { "x-forwarded-for": "9.9.9.9" }, ip: "9.9.9.9" };
  assert.strictEqual(lim.bloqueado(req), 0, "al inicio no bloquea");
  lim.registraFallo(req); lim.registraFallo(req);
  assert.strictEqual(lim.bloqueado(req), 0, "2 fallos < 3 → no bloquea");
  lim.registraFallo(req);
  assert.ok(lim.bloqueado(req) > 0, "3 fallos → bloqueado");
  lim.registraExito(req);
  assert.strictEqual(lim.bloqueado(req), 0, "un acierto limpia el contador");
});

test("el freno es por IP: una IP bloqueada no afecta a otra", () => {
  const lim = seg.creaLimitadorFallos({ max: 1, ventanaMs: 10_000 });
  const a = { headers: {}, ip: "1.1.1.1" };
  const b = { headers: {}, ip: "2.2.2.2" };
  lim.registraFallo(a);
  assert.ok(lim.bloqueado(a) > 0, "A bloqueada");
  assert.strictEqual(lim.bloqueado(b), 0, "B libre");
});

test("cabeceras() pone CSP, nosniff y X-Frame-Options y continúa", () => {
  const h = {};
  const res = { setHeader: (k, v) => { h[k] = v; } };
  let siguiente = false;
  seg.cabeceras({ headers: {} }, res, () => { siguiente = true; });
  assert.ok(siguiente, "llama a next()");
  assert.ok(/default-src 'self'/.test(h["Content-Security-Policy"]), "CSP con default-src 'self'");
  assert.ok(/object-src 'none'/.test(h["Content-Security-Policy"]), "CSP bloquea object-src");
  assert.strictEqual(h["X-Content-Type-Options"], "nosniff");
  assert.strictEqual(h["X-Frame-Options"], "SAMEORIGIN");
});

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("  todo en verde");
