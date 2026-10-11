// Red de seguridad a nivel de proceso (tests.2). Prueba que:
//   · se registran los manejadores unhandledRejection/uncaughtException;
//   · una promesa no gestionada se REGISTRA y NO mata el proceso;
//   · una excepción no capturada termina ordenadamente (código 1).
// Ejecutar: node tests/process-guards.unit.js
const assert = require("assert");
const guards = require("../backend/process-guards");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

console.log("red de seguridad de proceso (tests.2)");

test("instala manejadores; rejection no mata, excepción termina ordenado", () => {
  const rejAntes = process.listenerCount("unhandledRejection");
  const excAntes = process.listenerCount("uncaughtException");
  let exited = null;
  const logs = [];
  const h = guards.instalar({ log: (...a) => logs.push(a.join(" ")), onUncaught: (c) => { exited = c; } });
  try {
    assert.strictEqual(process.listenerCount("unhandledRejection"), rejAntes + 1, "registra unhandledRejection");
    assert.strictEqual(process.listenerCount("uncaughtException"), excAntes + 1, "registra uncaughtException");
    h.onRej(new Error("boom"));
    assert.ok(logs.some((l) => /no gestionada/i.test(l)), "la rejection se registra");
    assert.strictEqual(exited, null, "la rejection NO sale del proceso");
    h.onExc(new Error("fatal"));
    assert.strictEqual(exited, 1, "la excepción termina con código 1");
  } finally {
    process.removeListener("unhandledRejection", h.onRej);
    process.removeListener("uncaughtException", h.onExc);
  }
});

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("  todo en verde");
