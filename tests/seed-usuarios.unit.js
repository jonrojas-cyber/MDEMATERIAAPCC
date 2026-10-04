// Siembra de usuarios: cambia el PIN de Mónica a 5234 y da de alta a Daniel como
// trabajador (equipo). Ejecutar: node tests/seed-usuarios.unit.js
const assert = require("assert");
const crypto = require("crypto");
const { aplicar, aplicarJonAcceso, FLAG, FLAG_V5 } = require("../backend/seed-usuarios");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

// Verifica un PIN contra un hash "scrypt$salt$hex" (igual que auth.verificarPin).
function pinOk(pin, hash) {
  const [alg, salt, h] = String(hash || "").split("$");
  if (alg !== "scrypt" || !salt || !h) return false;
  const calc = crypto.scryptSync(String(pin), salt, 32).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(calc, "hex"), Buffer.from(h, "hex"));
}

function fakeStore(data) {
  return {
    readAll: (e) => data[e] || [],
    findById: (e, id) => (data[e] || []).find((r) => r.id === id) || null,
    insert: (e, r) => { (data[e] = data[e] || []).push(r); return r; },
    update: (e, id, patch) => { const r = (data[e] || []).find((x) => x.id === id); if (r) Object.assign(r, patch); return r; },
    _data: data,
  };
}

console.log("seed de usuarios");

function baseUsuarios() {
  return [
    { id: "Jon", key: "Jon", nombre: "Jon", rol: "admin", pin_hash: "scrypt$aa$bb" },
    { id: "Moni", key: "Moni", nombre: "Mónica", rol: "admin", pin_hash: "scrypt$aa$bb" },
  ];
}

test("Jon y Mónica -> 5234, ambos admin (acceso total)", () => {
  const data = { usuarios: baseUsuarios(), config: [] };
  const st = fakeStore(data);
  const r = aplicar(st);
  assert.ok(r.ranAny);
  const jon = data.usuarios.find((u) => u.id === "Jon");
  assert.strictEqual(jon.rol, "admin");
  assert.ok(pinOk("5234", jon.pin_hash), "Jon valida con 5234");
  const moni = data.usuarios.find((u) => u.id === "Moni");
  assert.strictEqual(moni.rol, "admin");                 // sigue con control total
  assert.ok(pinOk("5234", moni.pin_hash), "Mónica también 5234");
});

test("da de alta a Daniel como trabajador (equipo), no admin", () => {
  const data = { usuarios: baseUsuarios(), config: [] };
  const st = fakeStore(data);
  aplicar(st);
  const dani = data.usuarios.find((u) => u.id === "Daniel");
  assert.ok(dani, "Daniel existe");
  assert.strictEqual(dani.rol, "equipo");                // NUNCA ve negocio
  assert.strictEqual(dani.local_id, "principal");
  assert.ok(pinOk("4444", dani.pin_hash), "PIN inicial de Daniel");
});

test("es idempotente por flag y no duplica a Daniel", () => {
  const data = { usuarios: baseUsuarios(), config: [] };
  const st = fakeStore(data);
  aplicar(st);
  const r2 = aplicar(st);
  assert.strictEqual(r2.ranAny, false);
  assert.strictEqual(data.usuarios.filter((u) => u.id === "Daniel").length, 1);
  assert.ok(data.config.some((c) => c.id === FLAG));
});

test("v5 blinda a Jon aunque esté como 'equipo' con el nombre en otra variante", () => {
  const data = { usuarios: [
    { id: "u3", key: "jon", nombre: "Jonatan Rojas", rol: "equipo", pin_hash: "scrypt$cc$dd" }, // minúscula + apellido
    { id: "Moni", key: "Moni", nombre: "Mónica", rol: "admin", pin_hash: "scrypt$aa$bb" },
  ], config: [] };
  const st = fakeStore(data);
  aplicar(st);
  const jon = data.usuarios.find((u) => u.id === "u3");
  assert.strictEqual(jon.rol, "admin");                       // ya ve todo
  assert.strictEqual(jon.pin_hash, "scrypt$cc$dd");           // no se le pisa el PIN que ya tenía
});

test("v5 crea a Jon admin si no existe ninguna cuenta suya", () => {
  const data = { usuarios: [{ id: "Moni", key: "Moni", nombre: "Mónica", rol: "admin", pin_hash: "scrypt$aa$bb" }], config: [] };
  const st = fakeStore(data);
  aplicar(st);
  const jon = data.usuarios.find((u) => /jon/i.test(u.nombre) || /jon/i.test(u.key));
  assert.ok(jon, "Jon fue creado");
  assert.strictEqual(jon.rol, "admin");
  assert.ok(pinOk("5234", jon.pin_hash), "PIN inicial 5234 para que pueda entrar");
  assert.strictEqual(jon.pin_temporal, true);
});

test("v5 es idempotente (segunda pasada no vuelve a tocar a Jon) y marca su flag", () => {
  const data = { usuarios: baseUsuarios(), config: [] };
  const st = fakeStore(data);
  aplicar(st);
  const r = aplicarJonAcceso(st);
  assert.strictEqual(r.ranAny, false);
  assert.ok(data.config.some((c) => c.id === FLAG_V5));
  assert.strictEqual(data.usuarios.filter((u) => u.id === "Jon").length, 1); // no duplica
});

if (fallos) { console.error(`\n${fallos} fallo(s) en seed-usuarios`); process.exit(1); }
console.log("  seed-usuarios OK");
