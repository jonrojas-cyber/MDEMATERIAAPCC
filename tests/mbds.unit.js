// MBDS · motor de cálculo, validación y corrección. Ejecutar: node tests/mbds.unit.js
const assert = require("assert");
const eng = require("../backend/mbds-engine");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

const ING = [
  { id: "alb", nombre: "Albaricoque", brix: 12, ph: 3.5, abv: 0, coste: 4 },
  { id: "azu", nombre: "Azúcar", brix: 100, ph: 7, abv: 0, coste: 1 },
  { id: "mal", nombre: "Ácido málico", brix: 0, ph: 2.0, abv: 0, coste: 20 },
  { id: "cit", nombre: "Ácido cítrico", brix: 0, ph: 2.2, abv: 0, coste: 18 },
  { id: "tar", nombre: "Ácido tartárico", brix: 0, ph: 2.5, abv: 0, coste: 22 },
  { id: "sal", nombre: "Sal", brix: 0, ph: 7, abv: 0, coste: 1, funcion_sensorial: "Salinidad" },
  { id: "agua", nombre: "Agua", brix: 0, ph: 7, abv: 0, coste: 0 },
  { id: "aperol", nombre: "Aperol", brix: 20, ph: 3.5, abv: 11, coste: 12 },
  { id: "esp", nombre: "Espumoso malagueño", brix: 1.5, ph: 3.2, abv: 11.5, coste: 6 },
];

console.log("MBDS · motor de laboratorio");

test("cordial: perfil ácido respeta 60/25/15 y calcula coste/brix/pH", () => {
  const cordial = { ingredientes: [
    { ingrediente_id: "alb", cantidad: 500 }, { ingrediente_id: "azu", cantidad: 300 },
    { ingrediente_id: "mal", cantidad: 12 }, { ingrediente_id: "cit", cantidad: 5 }, { ingrediente_id: "tar", cantidad: 3 },
    { ingrediente_id: "sal", cantidad: 0.8 }, { ingrediente_id: "agua", cantidad: 200 },
  ], rendimiento_ml: 900 };
  const c = eng.calcularCordial(cordial, ING);
  assert.strictEqual(c.perfil_acido.malico, 60, "málico 60%");
  assert.strictEqual(c.perfil_acido.citrico, 25, "cítrico 25%");
  assert.strictEqual(c.perfil_acido.tartarico, 15, "tartárico 15%");
  assert.ok(c.coste_total > 0 && c.coste_por_litro > 0, "coste calculado");
  assert.ok(c.ph > 2 && c.ph < 7, "pH de mezcla en rango físico");
  assert.ok(c.salinidad > 0, "salinidad calculada desde la sal");
});

test("bebida: ABV ponderado por volumen y coste por servicio", () => {
  const cordialCalc = { brix: 8, ph: 3.2, salinidad: 0.1, coste_por_litro: 3 };
  const bebida = { cordial_ml: 300, cordial_abv: 0, componentes: [
    { ingrediente_id: "aperol", ml: 150 }, { ingrediente_id: "esp", ml: 450 }, { ingrediente_id: "agua", ml: 100 },
  ], volumen_total: 1000, co2: 5.8, servicio_ml: 200, pvp: 12 };
  const b = eng.calcularBebida(bebida, cordialCalc, ING);
  // ABV = (150*11 + 450*11.5)/1000 = (1650+5175)/1000 = 6.825
  assert.ok(Math.abs(b.abv - 6.83) < 0.05, "ABV ≈ 6.83: " + b.abv);
  assert.strictEqual(b.servicios, 5, "1000ml / 200 = 5 servicios");
  assert.ok(b.coste_por_servicio > 0, "coste por servicio");
  assert.ok(b.food_cost_pct != null && b.margen_pct != null, "food cost y margen con PVP dado");
  assert.ok(b.pvp_recomendado > 0, "PVP recomendado desde food cost objetivo");
});

test("validación: 'Materia Apta' solo si todo cumple; explica los fallos", () => {
  const bien = { ph: 3.18, brix: 8.1, abv: 7.5, salinidad: 0.10 };
  const rBien = eng.validar(bien, { drinkability: 9, persistencia: 8, salivacion: 9, dulzor: 4 }, true);
  assert.strictEqual(rBien.apta, true, "todo en rango → apta");
  const mal = { ph: 3.40, brix: 9.0, abv: 7.5, salinidad: 0.10 };
  const rMal = eng.validar(mal, { drinkability: 6, persistencia: 8, salivacion: 9, dulzor: 7 }, true);
  assert.strictEqual(rMal.apta, false, "fuera de rango → no apta");
  assert.ok(rMal.fallos.length >= 3, "detecta pH, brix, dulzor, drinkability");
  assert.ok(rMal.checks.every((c) => c.ok || c.solucion), "cada fallo trae una solución (nunca error a secas)");
});

test("corrección: propone acciones concretas según el problema", () => {
  const c = eng.corregir({ ph: 3.40, brix: 9.0, abv: 7.5, salinidad: 0.10 }, { dulzor: 7, drinkability: 6, persistencia: 6 });
  const problemas = c.map((x) => x.problema).join(" | ");
  assert.ok(/dulce/i.test(problemas), "detecta dulzor");
  assert.ok(/plana/i.test(problemas), "detecta plana (pH alto)");
  assert.ok(c.every((x) => Array.isArray(x.acciones) && x.acciones.length), "cada problema trae acciones");
});

test("0.0 comparte ADN: sin alcohol no se valida el ABV", () => {
  const r = eng.validar({ ph: 3.18, brix: 8.1, abv: 0, salinidad: 0.10 }, { drinkability: 9, persistencia: 8, salivacion: 9, dulzor: 4 }, false);
  assert.ok(!r.checks.some((c) => c.clave === "abv"), "la 0.0 no exige rango de alcohol");
  assert.strictEqual(r.apta, true);
});

if (fallos) { console.error(`\n${fallos} prueba(s) de MBDS fallaron`); process.exit(1); }
console.log("\nTodas las pruebas de MBDS OK");
