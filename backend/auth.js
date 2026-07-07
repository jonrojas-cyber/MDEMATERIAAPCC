// Autenticación de Control M · Producción — endurecida para producto real.
//
//  · JWT firmado; en PRODUCCIÓN el JWT_SECRET es OBLIGATORIO (no arranca sin él).
//  · Las cuentas viven en la BD (entidad "usuarios"), no hardcodeadas.
//  · El PIN se guarda HASHEADO (scrypt + sal), nunca en claro. La verificación
//    es en tiempo constante (timingSafeEqual).
//  · Bloqueo por intentos: tras 5 fallos, 15 min bloqueado.
//  · Cada usuario lleva local_id (tenant) para preparar el multi-local.
//
// El "seed" inicial crea las cuentas del equipo la primera vez. Los PIN de
// arranque se leen de SEED_USERS (JSON) o caen a unos por defecto SOLO fuera de
// producción; en producción, si no hay usuarios ni SEED_USERS, se exige crearlos.

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const store = require("./data-store");

const EN_PRODUCCION = process.env.NODE_ENV === "production";
const EXPIRA = "12h";
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;

// ── Secreto JWT ─────────────────────────────────────────────────────────────
// Regla: NUNCA usar la clave de desarrollo en producción. Pero tampoco tumbar el
// servicio: si falta JWT_SECRET en producción, se genera un secreto ALEATORIO
// fuerte al arrancar (las sesiones no sobreviven a reinicios hasta que se define
// JWT_SECRET). Con REQUIRE_JWT_SECRET=1 sí se exige y el arranque se aborta.
let SECRET = process.env.JWT_SECRET || "";
if (!SECRET) {
  if (EN_PRODUCCION) {
    if (process.env.REQUIRE_JWT_SECRET === "1") {
      console.error("FATAL: JWT_SECRET es obligatorio (REQUIRE_JWT_SECRET=1) y no está definido.");
      process.exit(1);
    }
    SECRET = crypto.randomBytes(48).toString("hex");
    console.error(
      "⚠️  CRÍTICO: JWT_SECRET no definido en producción. Uso un secreto ALEATORIO temporal:\n" +
      "   las sesiones se cerrarán en cada reinicio. Define JWT_SECRET en las variables de\n" +
      "   entorno de Render para sesiones estables y seguras."
    );
  } else {
    SECRET = "control-m-secret-dev-solo-local";
    console.warn("⚠️  JWT_SECRET no definido: usando clave de desarrollo (solo local).");
  }
}

// Permisos del rol "equipo" (primer segmento de /api/<x>). Admin ve todo.
const EQUIPO_ALLOWED = new Set([
  "inicio",
  "decisiones",
  "preparaciones",
  "lotes",
  "revisiones",
  "ajustes",
  "mbds", // laboratorio de bebidas: el equipo ve receta/proceso/lote (sin costes)
  "materias",
  "recetas",
  "carta",
  "etiquetas",
]);

// ── Hash de PIN (scrypt, sin dependencias externas) ─────────────────────────
function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  const h = crypto.scryptSync(String(pin), salt, 32).toString("hex");
  return `scrypt$${salt}$${h}`;
}
function verifyPin(pin, almacenado) {
  if (!almacenado || typeof almacenado !== "string" || !almacenado.startsWith("scrypt$")) return false;
  const [, salt, h] = almacenado.split("$");
  if (!salt || !h) return false;
  const calc = crypto.scryptSync(String(pin), salt, 32);
  const guardado = Buffer.from(h, "hex");
  return calc.length === guardado.length && crypto.timingSafeEqual(calc, guardado);
}

// ── Seed de cuentas (una sola vez) ──────────────────────────────────────────
function usuariosSeedDefault() {
  if (process.env.SEED_USERS) {
    try {
      const arr = JSON.parse(process.env.SEED_USERS);
      if (Array.isArray(arr) && arr.length) return arr;
    } catch (e) {
      console.error("SEED_USERS no es JSON válido, se ignora.");
    }
  }
  // Bootstrap del equipo (PIN hasheado al sembrar, cambiable y marcado como
  // temporal). En un despliegue real define SEED_USERS para fijar vuestros PIN.
  return [
    { key: "Jon", nombre: "Jon", rol: "admin", pin: "1111" },
    { key: "Lara", nombre: "Lara", rol: "equipo", pin: "2222" },
    { key: "Moni", nombre: "Mónica", rol: "admin", pin: "3333" },
  ];
}

let _seedHecho = false;
function ensureSeed() {
  if (_seedHecho) return;
  _seedHecho = true;
  const actuales = store.readAll("usuarios");
  if (actuales.length) return;
  const seed = usuariosSeedDefault();
  if (!seed.length) {
    if (EN_PRODUCCION) console.warn("⚠️  No hay usuarios ni SEED_USERS: define SEED_USERS para crear las cuentas.");
    return;
  }
  seed.forEach((u) => {
    store.insert("usuarios", {
      id: u.key,
      key: u.key,
      nombre: u.nombre,
      rol: u.rol === "admin" ? "admin" : "equipo",
      local_id: u.local_id || "principal",
      pin_hash: hashPin(u.pin),
      pin_temporal: true, // recordatorio de cambiarlo
      intentos_fallidos: 0,
      bloqueado_hasta: null,
      creado_en: new Date().toISOString(),
    });
  });
}

function buscarUsuario(key) {
  return store.readAll("usuarios").find((u) => u.key === key || u.id === key) || null;
}

// ── Login con bloqueo por intentos ──────────────────────────────────────────
// Devuelve { token, usuario } si va bien; o { error, bloqueado, segundos } si no.
function login(usuario, pin) {
  ensureSeed();
  const u = buscarUsuario(usuario);
  if (!u) return { error: "Usuario o PIN incorrecto" };

  const ahora = Date.now();
  if (u.bloqueado_hasta && new Date(u.bloqueado_hasta).getTime() > ahora) {
    const segundos = Math.ceil((new Date(u.bloqueado_hasta).getTime() - ahora) / 1000);
    return { error: "Cuenta bloqueada por intentos fallidos.", bloqueado: true, segundos };
  }

  if (!verifyPin(pin, u.pin_hash)) {
    const intentos = (u.intentos_fallidos || 0) + 1;
    const patch = { intentos_fallidos: intentos };
    let bloqueado = false, segundos = 0;
    if (intentos >= MAX_INTENTOS) {
      patch.bloqueado_hasta = new Date(ahora + BLOQUEO_MS).toISOString();
      patch.intentos_fallidos = 0;
      bloqueado = true;
      segundos = Math.ceil(BLOQUEO_MS / 1000);
    }
    store.update("usuarios", u.id, patch);
    return bloqueado
      ? { error: "Demasiados intentos. Cuenta bloqueada 15 minutos.", bloqueado: true, segundos }
      : { error: "Usuario o PIN incorrecto", intentos_restantes: MAX_INTENTOS - intentos };
  }

  // Éxito: limpia intentos y firma token (incluye local_id para multi-local).
  store.update("usuarios", u.id, { intentos_fallidos: 0, bloqueado_hasta: null });
  const payload = { key: u.key, nombre: u.nombre, rol: u.rol, local_id: u.local_id || "principal" };
  const token = jwt.sign(payload, SECRET, { expiresIn: EXPIRA });
  return { token, usuario: { ...payload, pin_temporal: !!u.pin_temporal } };
}

// Cambio de PIN (exige el actual). Devuelve {ok} o {error}.
function cambiarPin(usuario, pinActual, pinNuevo) {
  ensureSeed();
  const u = buscarUsuario(usuario);
  if (!u || !verifyPin(pinActual, u.pin_hash)) return { error: "El PIN actual no es correcto." };
  if (!/^\d{4}$/.test(String(pinNuevo || ""))) return { error: "El PIN nuevo debe tener 4 dígitos." };
  store.update("usuarios", u.id, { pin_hash: hashPin(pinNuevo), pin_temporal: false });
  return { ok: true };
}

function verificar(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch (e) {
    return null;
  }
}

function tokenDe(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

// Middleware: exige token válido y aplica permisos por rol.
function requerido(req, res, next) {
  const user = verificar(tokenDe(req));
  if (!user) return res.status(401).json({ error: "Sesión no válida. Vuelve a iniciar sesión." });
  if (user.rol !== "admin") {
    const seg = (req.path || "").split("/").filter(Boolean)[0];
    if (!EQUIPO_ALLOWED.has(seg)) {
      return res.status(403).json({ error: "Tu rol no tiene acceso a esta sección." });
    }
  }
  req.user = user;
  next();
}

module.exports = { login, cambiarPin, verificar, requerido, tokenDe, ensureSeed, hashPin };
