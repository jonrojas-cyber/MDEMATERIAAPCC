// datos.7 · Un escandallo con materias SIN coste no debe producir un margen
// aparentemente completo. El coste de las materias desconocidas NO se calcula
// como 0 silencioso: se marca `incompleto` + `materias_sin_coste`, el margen
// queda señalado como parcial y el producto NO arrastra la media de la carta.
//
// Ejecutar: node tests/coste-parcial.unit.js
const assert = require("assert");
const costing = require("../backend/costing");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

console.log("coste · escandallo incompleto = resultado PARCIAL explícito (datos.7)");

// Materias: una con coste real, otra que NO existe (se referencia pero no está
// dada de alta → coste desconocido), y una elaboración (coste_medio 0 pero
// derivable de su receta).
const materias = [
  { id: "m_leche", nombre: "Leche", coste_medio: 0.80, unidad: "l" },
  { id: "m_cafe", nombre: "Café", coste_medio: 20, unidad: "kg" },
  // m_sirope NO está: materia inexistente (coste desconocido).
  { id: "m_salsa", nombre: "Salsa M", coste_medio: 0, unidad: "kg" }, // elaboración
];
const recetas = [
  // La salsa se produce a partir de materias con coste → su coste ES derivable.
  { id: "r_salsa", produce_materia_id: "m_salsa", resultado_base: 1,
    ingredientes: [{ materia_id: "m_leche", cantidad: 0.5 }, { materia_id: "m_cafe", cantidad: 0.1 }] },
];
const idxMat = costing.indiceMaterias(materias);
const idxRec = costing.indiceRecetasProduccion(recetas);

test("materia inexistente → resuelto=false (desconocido, NO 0 real)", () => {
  const d = costing.costeMateriaDetalle("m_sirope", idxMat, idxRec);
  assert.strictEqual(d.resuelto, false, "no se puede costear una materia que no existe");
  assert.strictEqual(d.coste, 0, "entra como 0 en la suma…");
  const dk = costing.costeMateriaDetalle("m_leche", idxMat, idxRec);
  assert.strictEqual(dk.resuelto, true, "…pero una materia con coste real sí resuelve");
});

test("elaboración (coste_medio 0 pero con receta) SÍ resuelve, no es incompleta", () => {
  const d = costing.costeMateriaDetalle("m_salsa", idxMat, idxRec);
  assert.strictEqual(d.resuelto, true, "la salsa se deriva de su receta");
  assert.ok(d.coste > 0, "coste derivado > 0 (0,5·0,80 + 0,1·20 = 2,40)");
  assert.ok(Math.abs(d.coste - 2.40) < 1e-9, "coste de la elaboración exacto");
});

test("escandallo COMPLETO: incompleto=false, sin materias pendientes", () => {
  const d = costing.costeEscandalloDetalle(
    [{ materia_id: "m_leche", cantidad: 0.2 }, { materia_id: "m_salsa", cantidad: 0.05 }], idxMat, idxRec);
  assert.strictEqual(d.incompleto, false);
  assert.deepStrictEqual(d.sin_coste, []);
  assert.ok(d.coste > 0);
});

test("escandallo INCOMPLETO: marca la materia sin coste y NO la cuenta como 0 'completo'", () => {
  const d = costing.costeEscandalloDetalle(
    [{ materia_id: "m_leche", cantidad: 0.2 }, { materia_id: "m_sirope", cantidad: 0.03 }], idxMat, idxRec);
  assert.strictEqual(d.incompleto, true, "hay una materia sin coste");
  assert.deepStrictEqual(d.sin_coste, ["m_sirope"], "se nombra la que falta");
  // El coste refleja SOLO lo conocido (0,2·0,80 = 0,16); el sirope no suma nada,
  // por eso el resultado es PARCIAL y debe señalarse como tal.
  assert.ok(Math.abs(d.coste - 0.16) < 1e-9, "coste parcial = solo lo conocido");
});

test("margenProducto marca incompleto y materias_sin_coste (no un margen cerrado)", () => {
  const prodParcial = { id: "p_partial", nombre: "Latte sirope", precio_venta: 3.30, iva: 0.10,
    ingredientes: [{ materia_id: "m_leche", cantidad: 0.2 }, { materia_id: "m_sirope", cantidad: 0.03 }] };
  const mm = costing.margenProducto(prodParcial, idxMat);
  assert.strictEqual(mm.incompleto, true);
  assert.strictEqual(mm.coste_fiable, false);
  assert.deepStrictEqual(mm.materias_sin_coste, ["m_sirope"]);
});

test("la carta NO promedia el producto incompleto (no infla el margen medio)", () => {
  // Dos productos: uno completo (food cost ~alto real) y otro incompleto cuyo
  // coste infravalorado daría un food cost ridículamente bajo (margen aparente
  // casi total). Si se promediara, subiría el margen medio de forma falsa.
  const completo = { id: "p_ok", nombre: "Café solo", precio_venta: 1.50, iva: 0.10,
    ingredientes: [{ materia_id: "m_cafe", cantidad: 0.02 }] }; // 0,40 coste
  const incompleto = { id: "p_bad", nombre: "Especial sirope", precio_venta: 4.00, iva: 0.10,
    ingredientes: [{ materia_id: "m_sirope", cantidad: 0.05 }] }; // coste 0 → margen aparente ~100%
  const productos = [completo, incompleto];
  const idx = costing.indiceMaterias(materias);

  const costeada = costing.cartaCosteada(productos, idx);
  assert.strictEqual(costeada.length, 1, "solo entra el completo");
  assert.strictEqual(costeada[0].p.id, "p_ok");

  const incompletos = costing.cartaIncompleta(productos, idx);
  assert.strictEqual(incompletos.length, 1, "el incompleto se señala aparte");
  assert.strictEqual(incompletos[0].producto_id, "p_bad");
  assert.deepStrictEqual(incompletos[0].materias_sin_coste, ["m_sirope"]);

  // El food cost medio refleja SOLO el producto costeado (≈ 0,40/(1,50/1,1) = 29,3%),
  // no lo arrastra el falso ~0% del incompleto.
  const fc = costing.foodCostMedioCarta(productos, costing.indiceMaterias(materias));
  assert.ok(fc > 20 && fc < 40, "food cost medio = el del completo (" + fc + "%), no diluido a ~15%");
});

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("  todo en verde");
