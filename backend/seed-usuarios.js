// SIEMBRA DE USUARIOS (idempotente, por flag): cambios de cuentas pedidos por la
// fundadora. Los PIN se guardan HASHEADOS (scrypt). El rol "equipo" nunca ve
// negocio (dinero/costes/márgenes): lo filtra el middleware por segmento.
//
// v2: PIN de Mónica -> 5234 · alta de Daniel como trabajador (equipo).
// El PIN se puede cambiar luego en la app; aquí solo se deja el inicial.

const store = require("./data-store");
const auth = require("./auth");

const FLAG = "usuarios_seed_v2_moni5234_daniel";

// Aplica sobre el store dado (inyectable para tests). Idempotente por flag.
function aplicar(st) {
  const cfg = st.readAll("config") || [];
  if (cfg.some((c) => c && c.id === FLAG)) return { ranAny: false, tocados: 0 };

  let tocados = 0;
  const users = st.readAll("usuarios");

  // 1) PIN de Mónica -> 5234 (sigue siendo admin: control total del negocio).
  const moni = users.find((u) => u.key === "Moni" || u.id === "Moni");
  if (moni) { st.update("usuarios", moni.id, { pin_hash: auth.hashPin("5234"), pin_temporal: false }); tocados++; }

  // 2) Daniel como TRABAJADOR (equipo): recetas, pedidos, inventario, APPCC…; nada
  //    de negocio. PIN inicial 4444 (temporal, cambiable en la app).
  if (!users.some((u) => u.key === "Daniel" || u.id === "Daniel")) {
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

module.exports = { seedUsuarios, aplicar, FLAG };
