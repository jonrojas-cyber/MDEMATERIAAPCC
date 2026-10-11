// Utilidades de seguridad de Control M (sin dependencias externas).
//  · tokenIgual: comparación de secretos en tiempo constante.
//  · cabeceras: cabeceras de seguridad + CSP compatible con la SPA inline.
//  · limitadorFallos: freno de fuerza bruta por IP contando SOLO los fallos
//    (los aciertos no cuentan → no molesta al uso legítimo ni a los tests).
const crypto = require("crypto");

function tokenIgual(a, b) {
  const x = Buffer.from(String(a == null ? "" : a), "utf8");
  const y = Buffer.from(String(b == null ? "" : b), "utf8");
  if (x.length !== y.length) return false;
  try { return crypto.timingSafeEqual(x, y); } catch (e) { return false; }
}

// IP del cliente teniendo en cuenta el proxy (Render añade X-Forwarded-For).
// Requiere app.set("trust proxy", true) para que req.ip sea fiable.
function ipDe(req) {
  const xff = (req.headers && req.headers["x-forwarded-for"]) || "";
  return (xff.split(",")[0] || "").trim() || req.ip || (req.socket && req.socket.remoteAddress) || "desconocida";
}

// Cabeceras de seguridad para toda respuesta. La SPA es un único index.html con
// scripts y estilos EN LÍNEA, así que la CSP permite 'unsafe-inline' (quitarlo
// exigiría trocear el fichero; se hará por fases). Aun así bloquea object/base,
// restringe orígenes y el encuadre en iframes.
function cabeceras(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "manifest-src 'self'",
      "worker-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; ")
  );
  next();
}

// Limitador de FALLOS por IP. No persiste (memoria del proceso): un reinicio lo
// resetea, aceptable para un freno de fuerza bruta.
function creaLimitadorFallos({ max = 30, ventanaMs = 15 * 60 * 1000 } = {}) {
  const porIp = new Map(); // ip -> { n, hasta }
  function estado(req) {
    const ip = ipDe(req);
    const e = porIp.get(ip);
    if (e && Date.now() > e.hasta) { porIp.delete(ip); return null; }
    return e || null;
  }
  return {
    // Segundos que quedan de bloqueo (0 = no bloqueado).
    bloqueado(req) {
      const e = estado(req);
      return e && e.n >= max ? Math.ceil((e.hasta - Date.now()) / 1000) : 0;
    },
    registraFallo(req) {
      const ip = ipDe(req);
      const e = estado(req) || { n: 0, hasta: Date.now() + ventanaMs };
      e.n += 1; e.hasta = Date.now() + ventanaMs;
      porIp.set(ip, e);
    },
    registraExito(req) { porIp.delete(ipDe(req)); },
    _reset() { porIp.clear(); },
  };
}

// Instancia COMPARTIDA para autenticación por PIN (login y fichaje): así un
// atacante no esquiva el freno repartiendo intentos entre las dos puertas.
const limitadorAuth = creaLimitadorFallos({ max: Number(process.env.AUTH_MAX_FALLOS) || 30 });

module.exports = { tokenIgual, ipDe, cabeceras, creaLimitadorFallos, limitadorAuth };
