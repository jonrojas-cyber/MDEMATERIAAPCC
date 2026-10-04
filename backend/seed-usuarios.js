// SIEMBRA DE USUARIOS (idempotente, por flag): cambios de cuentas pedidos por la
// fundadora. Los PIN se guardan HASHEADOS (scrypt). El rol "equipo" nunca ve
// negocio (dinero/costes/márgenes): lo filtra el middleware por segmento.
//
// v2: PIN de Mónica -> 5234 · alta de Daniel como trabajador (equipo).
// El PIN se puede cambiar luego en la app; aquí solo se deja el inicial.

const store = require("./data-store");
const auth = require("./auth");

// v4: Jon y Mónica comparten PIN 5234 (ambos admin, acceso total). Daniel equipo.
//   · Jon    -> PIN 5234, admin.
//   · Mónica -> PIN 5234, admin (a petición suya, igual que Jon).
//   · Daniel -> alta como trabajador (equipo) si no existía.
const FLAG = "usuarios_seed_v4_jon_moni_5234";

// v5: BLINDA que Jon tenga acceso total (admin), pase lo que pase. El emparejado
// de v4 exigía key/id EXACTO "Jon"; si en la BD quedó como "jon", "Jonatan" o con
// otro nombre, no lo ascendía y Jon se quedaba sin ver costes/food cost/P&L. v5
// lo busca de forma tolerante (mayúsculas/acentos/"Jonatan…"), lo pone admin y,
// si no existiera, lo crea admin. Nunca le pisa un PIN que ya tenga.
const FLAG_V5 = "usuarios_seed_v5_jon_acceso_total";

function norm(s) {
  return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}
function esJon(u) {
  return [norm(u && u.key), norm(u && u.id), norm(u && u.nombre)].some((x) => x === "jon" || x.startsWith("jonatan"));
}

// Aplica sobre el store dado (inyectable para tests). Idempotente por flag.
// Corre v4 (cuentas base) y v5 (blindaje de Jon admin), cada una por su flag.
function aplicar(st) {
  const a = aplicarV4(st);
  const b = aplicarJonAcceso(st);
  return { ranAny: a.ranAny || b.ranAny, tocados: a.tocados + b.tocados };
}

function aplicarV4(st) {
  const cfg = st.readAll("config") || [];
  if (cfg.some((c) => c && c.id === FLAG)) return { ranAny: false, tocados: 0 };

  let tocados = 0;
  const users = st.readAll("usuarios");
  const buscar = (k) => users.find((u) => u.key === k || u.id === k);

  // Jon: 5234, admin.
  const jon = buscar("Jon");
  if (jon) { st.update("usuarios", jon.id, { pin_hash: auth.hashPin("5234"), rol: "admin", pin_temporal: false }); tocados++; }

  // Mónica: 5234 (igual que Jon, a petición suya), admin.
  const moni = buscar("Moni");
  if (moni) { st.update("usuarios", moni.id, { pin_hash: auth.hashPin("5234"), rol: "admin", pin_temporal: false }); tocados++; }

  // Daniel como TRABAJADOR (equipo): recetas, pedidos, inventario, APPCC…; nada de
  // negocio. PIN inicial 4444 (temporal, cambiable en la app).
  if (!buscar("Daniel")) {
    st.insert("usuarios", {
      id: "Daniel", key: "Daniel", nombre: "Daniel", rol: "equipo",
      local_id: "principal", pin_hash: auth.hashPin("4444"), pin_temporal: true,
      creado_en: new Date().toISOString(),
    });
    tocados++;
  }

  st.insert("config", { id: FLAG, hecho: true, fecha: new Date().toISOString() });
  return { ranAny: true, tocados };
}

// Garantiza que Jon sea admin (acceso total). Tolerante al nombre; crea la cuenta
// si no existe. No toca su PIN si ya lo tiene (solo le pone uno si le falta).
function aplicarJonAcceso(st) {
  const cfg = st.readAll("config") || [];
  if (cfg.some((c) => c && c.id === FLAG_V5)) return { ranAny: false, tocados: 0 };

  let tocados = 0;
  const jons = (st.readAll("usuarios") || []).filter(esJon);
  if (jons.length) {
    jons.forEach((j) => {
      const patch = { rol: "admin" };
      if (!j.pin_hash) { patch.pin_hash = auth.hashPin("5234"); patch.pin_temporal = true; } // le faltaba PIN
      st.update("usuarios", j.id, patch);
      tocados++;
    });
  } else {
    st.insert("usuarios", {
      id: "Jon", key: "Jon", nombre: "Jon", rol: "admin",
      local_id: "principal", pin_hash: auth.hashPin("5234"), pin_temporal: true,
      creado_en: new Date().toISOString(),
    });
    tocados++;
  }

  st.insert("config", { id: FLAG_V5, hecho: true, fecha: new Date().toISOString() });
  return { ranAny: true, tocados };
}

async function seedUsuarios() {
  try {
    // Solo en producción (Postgres, donde las cuentas ya existen). En dev/tests
    // (ficheros JSON) NO se tocan los PIN: las cuentas por defecto siguen igual.
    if (!store.isUsingDb()) return;
    auth.ensureSeed();                 // garantiza que existan las cuentas base
    const r = aplicar(store);
    if (r.ranAny) { await store.flush(); console.log(`Seed usuarios · ${r.tocados} cambio(s) (PIN Mónica + alta Daniel).`); }
  } catch (e) {
    console.error("No se pudo sembrar usuarios:", e.message);
  }
}

module.exports = { seedUsuarios, aplicar, aplicarV4, aplicarJonAcceso, esJon, FLAG, FLAG_V5 };
