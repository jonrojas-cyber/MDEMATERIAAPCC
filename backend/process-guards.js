// Red de seguridad a nivel de proceso (tests.2). Extraído de server.js para
// poder probarlo sin arrancar el servidor entero.
//   · unhandledRejection → se REGISTRA (no tumba el proceso): un throw async no
//     capturado ya no mata el servidor en silencio.
//   · uncaughtException  → se registra y se TERMINA ordenadamente (Render
//     reinicia), en vez de seguir con el proceso potencialmente corrupto.
// `onUncaught` es inyectable para los tests (por defecto process.exit).
function instalar({ log = console.error, onUncaught } = {}) {
  const salir = onUncaught || ((code) => process.exit(code));
  const onRej = (reason) => { log("⚠️  Promesa no gestionada:", (reason && reason.stack) || reason); };
  const onExc = (err) => { log("⛔ Excepción no capturada:", (err && err.stack) || err); salir(1); };
  process.on("unhandledRejection", onRej);
  process.on("uncaughtException", onExc);
  return { onRej, onExc };
}

module.exports = { instalar };
