// Autenticación JWT de Control M · Producción.
//
// Los PIN viven AQUÍ (servidor), no en el frontend. El login devuelve un token
// firmado de 12 horas; las rutas protegidas lo exigen en la cabecera
// Authorization: Bearer <token>.

const jwt = require("jsonwebtoken");

const SECRET =
  process.env.JWT_SECRET ||
  "control-m-secret-dev-cambiar-en-produccion"; // ⚠️ define JWT_SECRET en producción
const EXPIRA = "12h";

if (!process.env.JWT_SECRET) {
  console.warn("⚠️  JWT_SECRET no definido: usando clave de desarrollo. Define JWT_SECRET en producción.");
}

// Usuarios del local. Para escalar a varios locales esto pasará a la BD.
const USUARIOS = {
  Jon: { pin: "1111", rol: "admin", nombre: "Jon" },
  Lara: { pin: "2222", rol: "equipo", nombre: "Lara" },
  Moni: { pin: "3333", rol: "admin", nombre: "Mónica" },
};

// Qué puede tocar el rol "equipo" (primer segmento de /api/<x>). Admin ve todo.
const EQUIPO_ALLOWED = new Set([
  "inicio",
  "preparaciones",
  "lotes",
  "revisiones",
  "ajustes",
  "materias", // lectura necesaria para preparaciones/ajustes
  "recetas", // lectura necesaria para preparaciones
  "carta",
  "notificaciones", // ver avisos (la config la protege la propia ruta a admin)
]);

function login(usuario, pin) {
  const u = USUARIOS[usuario];
  if (!u || u.pin !== String(pin)) return null;
  const payload = { key: usuario, nombre: u.nombre, rol: u.rol };
  const token = jwt.sign(payload, SECRET, { expiresIn: EXPIRA });
  return { token, usuario: payload };
}

function verificar(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch (e) {
    return null;
  }
}

// Middleware: exige token válido y aplica permisos por rol.
function requerido(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  const user = token ? verificar(token) : null;
  if (!user) return res.status(401).json({ error: "Sesión no válida. Vuelve a iniciar sesión." });

  if (user.rol !== "admin") {
    // Guard montado en "/api": el primer segmento útil está en req.path (ej. "/inicio").
    const seg = (req.path || "").split("/").filter(Boolean)[0];
    if (!EQUIPO_ALLOWED.has(seg)) {
      return res.status(403).json({ error: "Tu rol no tiene acceso a esta sección." });
    }
  }

  req.user = user;
  next();
}

module.exports = { login, verificar, requerido, USUARIOS };
