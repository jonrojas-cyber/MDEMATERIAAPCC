// Compresión gzip con zlib del core (SIN dependencias nuevas) · rendimiento.4.
// Compacta las respuestas de texto grandes (el index.html de ~950 KB, el JSON de la
// API) cuando el cliente acepta gzip. A nivel de aplicación no había compresión y el
// HTML viaja sin caché (se re-descarga en cada carga), así que comprimirlo ahorra
// mucho ancho de banda en móvil.
//
// Estrategia: se decide en la PRIMERA escritura (antes de volcar cabeceras) según el
// Content-Type y el tamaño; si procede, se quita Content-Length (longitud final
// desconocida → chunked), se marca Content-Encoding: gzip + Vary y se canaliza la
// salida por un stream gzip. Si no procede (ya codificado, binario, o muy pequeño),
// passthrough sin tocar nada.
const zlib = require("zlib");

// Tipos que comprimen bien. Imágenes/pdf/fuentes ya vienen comprimidos → se saltan.
const COMPRIMIBLE = /^(?:text\/|application\/(?:json|javascript|manifest\+json|xml)\b|image\/svg)/i;
const MIN_BYTES = 860; // por debajo, el overhead de gzip no compensa

function middleware(req, res, next) {
  const acepta = String(req.headers["accept-encoding"] || "");
  if (req.method === "HEAD" || !/\bgzip\b/.test(acepta)) return next();

  const _write = res.write.bind(res);
  const _end = res.end.bind(res);
  let gz = null;
  let decidido = false;
  let comprimir = false;

  function decidir() {
    if (decidido) return;
    decidido = true;
    const tipo = String(res.getHeader("Content-Type") || "");
    const yaCodificado = res.getHeader("Content-Encoding");
    const clen = Number(res.getHeader("Content-Length"));
    const pequeno = Number.isFinite(clen) && clen > 0 && clen < MIN_BYTES;
    comprimir = !yaCodificado && COMPRIMIBLE.test(tipo) && !pequeno && !res.headersSent;
    if (!comprimir) return;
    res.removeHeader("Content-Length"); // la longitud comprimida no se conoce aún → chunked
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Vary", "Accept-Encoding");
    gz = zlib.createGzip();
    gz.on("data", (b) => _write(b));
    gz.on("end", () => _end());
    gz.on("error", () => { try { _end(); } catch (e) {} });
  }

  res.write = function (chunk, enc, cb) {
    if (!decidido) decidir();
    if (!comprimir) return _write(chunk, enc, cb);
    if (chunk) gz.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof enc === "string" ? enc : "utf8"));
    if (typeof enc === "function") enc();
    else if (typeof cb === "function") cb();
    return true;
  };

  res.end = function (chunk, enc, cb) {
    if (!decidido) decidir();
    if (!comprimir) return _end(chunk, enc, cb);
    if (chunk && typeof chunk !== "function") {
      gz.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof enc === "string" ? enc : "utf8"));
    }
    const done = typeof chunk === "function" ? chunk : (typeof enc === "function" ? enc : cb);
    gz.end();
    if (typeof done === "function") done();
    return res;
  };

  next();
}

module.exports = { middleware, COMPRIMIBLE, MIN_BYTES };
