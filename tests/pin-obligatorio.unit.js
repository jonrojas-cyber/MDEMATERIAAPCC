// Rotación obligatoria de PIN publicados/triviales/temporales (con datos reales;
// aquí se fuerza con CONTROL_M_FORZAR_PIN=1). Comprueba que la sesión queda
// limitada a cambiar el PIN y que el PIN nuevo no puede ser débil.
// Ejecutar: node tests/pin-obligatorio.unit.js
const assert = require("assert");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

let fallos = 0;
async function test(n, fn) { try { await fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

(async () => {
  console.log("pin-obligatorio · reglas");
  process.env.CONTROL_M_FORZAR_PIN = "1";
  const auth = require("../backend/auth");
  await test("detecta PIN publicados, repetidos y en serie", () => {
    for (const p of ["5234", "4444", "3333", "1111", "0000", "1234", "9876", "4567", "abcd", "12"]) assert.ok(auth.pinDebil(p), p);
    for (const p of ["5826", "7140", "1357", "2468"]) assert.ok(!auth.pinDebil(p), p);
  });

  console.log("pin-obligatorio · HTTP");
  const PORT = 4097;
  const BASE = `http://127.0.0.1:${PORT}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-pin-"));
  const env = { ...process.env, PORT: String(PORT), CONTROL_M_DATA_DIR: dir, DATABASE_URL: "", TZ: "Europe/Madrid", CONTROL_M_FORZAR_PIN: "1" };
  const srv = spawn(process.execPath, ["backend/server.js"], { cwd: path.join(__dirname, ".."), env, stdio: "ignore" });
  const post = (p, body, token) => fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: JSON.stringify(body) });
  const get = (p, token) => fetch(BASE + p, { headers: { Authorization: "Bearer " + token } });
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/api/salud")).ok) break; } catch (e) {} await new Promise((r) => setTimeout(r, 200)); }

    let restringido;
    await test("login con PIN publicado → sesión marcada para cambiarlo", async () => {
      const r = await post("/api/auth/login", { usuario: "Moni", pin: "3333" });
      assert.strictEqual(r.status, 200);
      const j = await r.json();
      assert.strictEqual(j.usuario.cambiar_pin, true);
      restringido = j.token;
    });
    await test("con esa sesión el resto de la API está cerrado (403 cambiar_pin)", async () => {
      const r = await get("/api/materias", restringido);
      assert.strictEqual(r.status, 403);
      assert.strictEqual((await r.json()).cambiar_pin, true);
      assert.strictEqual((await get("/api/auth/me", restringido)).status, 200);
    });
    await test("no acepta un PIN nuevo débil ni igual al actual", async () => {
      assert.strictEqual((await post("/api/auth/cambiar-pin", { pin_actual: "3333", pin_nuevo: "1234" }, restringido)).status, 400);
      assert.strictEqual((await post("/api/auth/cambiar-pin", { pin_actual: "3333", pin_nuevo: "5234" }, restringido)).status, 400);
      assert.strictEqual((await post("/api/auth/cambiar-pin", { pin_actual: "3333", pin_nuevo: "3333" }, restringido)).status, 400);
    });
    let nueva;
    await test("PIN nuevo válido → sesión completa al momento", async () => {
      const r = await post("/api/auth/cambiar-pin", { pin_actual: "3333", pin_nuevo: "5826" }, restringido);
      assert.strictEqual(r.status, 200);
      const j = await r.json();
      assert.ok(j.token && !j.usuario.cambiar_pin);
      nueva = j.token;
      assert.strictEqual((await get("/api/materias", nueva)).status, 200);
    });
    await test("el PIN antiguo ya no entra y el nuevo entra sin restricción", async () => {
      assert.strictEqual((await post("/api/auth/login", { usuario: "Moni", pin: "3333" })).status, 401);
      const j = await (await post("/api/auth/login", { usuario: "Moni", pin: "5826" })).json();
      assert.strictEqual(j.usuario.cambiar_pin, false);
    });
  } finally {
    await new Promise((ok) => { srv.once("exit", ok); srv.kill(); });
  }
  if (fallos) { console.error(`\n✗ ${fallos} fallo(s)`); process.exit(1); }
  console.log("✓ pin-obligatorio OK");
})();
