// Alta automática desde albarán: emparejado/creación de proveedor y de materias
// en su categoría. Ejecutar: node tests/albaran-intake.unit.js (revertir data después).

const assert = require("assert");
const store = require("../backend/data-store");
const intake = require("../backend/albaran-intake");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

function limpiar() { ["proveedores", "materias"].forEach((e) => store.writeAll(e, [])); }

console.log("alta automática desde albarán · proveedor + materias por categoría");

test("unidad de consumo: masa→g, volumen→ml, conteo/otros→ud", () => {
  assert.strictEqual(intake.unidadConsumoDe("kg"), "g");
  assert.strictEqual(intake.unidadConsumoDe("L"), "ml");
  assert.strictEqual(intake.unidadConsumoDe("caja"), "ud");
  assert.strictEqual(intake.unidadConsumoDe(""), "ud");
});

test("líneas que NO son producto (portes, IVA, descuento, total) se descartan", () => {
  assert.strictEqual(intake.esLineaProducto("Portes"), false);
  assert.strictEqual(intake.esLineaProducto("I.V.A. 21%"), false);
  assert.strictEqual(intake.esLineaProducto("Descuento pronto pago"), false);
  assert.strictEqual(intake.esLineaProducto("TOTAL"), false);
  assert.strictEqual(intake.esLineaProducto("Leche entera 1L"), true);
});

test("buscarProveedor empareja por CIF aunque el nombre cambie", () => {
  limpiar();
  store.writeAll("proveedores", [{ id: "p1", nombre: "Cafés García SL", cif: "B12345678" }]);
  const p = intake.buscarProveedor({ proveedor: "GARCIA DISTRIBUCIONES", proveedor_cif: "B-12345678" }, store.readAll("proveedores"));
  assert.ok(p && p.id === "p1", "empareja por CIF");
});

test("buscarProveedor empareja por nombre ignorando forma jurídica y acentos", () => {
  limpiar();
  store.writeAll("proveedores", [{ id: "p1", nombre: "Cafés García", cif: "" }]);
  const p = intake.buscarProveedor({ proveedor: "CAFES GARCIA, S.L.", proveedor_cif: "" }, store.readAll("proveedores"));
  assert.ok(p && p.id === "p1", "empareja por nombre normalizado");
  const q = intake.buscarProveedor({ proveedor: "Panadería Ruiz", proveedor_cif: "" }, store.readAll("proveedores"));
  assert.strictEqual(q, null, "no empareja proveedores distintos");
});

test("crearProveedorDesdeOCR crea el proveedor con los datos de la cabecera", () => {
  limpiar();
  const p = intake.crearProveedorDesdeOCR({
    proveedor: "Lácteos del Sur SL", proveedor_cif: "B99887766",
    proveedor_telefono: "952000111", proveedor_email: "pedidos@lacteos.es", proveedor_direccion: "C/ Mayor 1, Málaga",
  });
  assert.ok(p.id, "tiene id");
  assert.strictEqual(p.cif, "B99887766");
  assert.strictEqual(p.telefono, "952000111");
  assert.strictEqual(p.whatsapp, "952000111");
  assert.strictEqual(p.email, "pedidos@lacteos.es");
  assert.strictEqual(p.estado, "Activo");
  assert.strictEqual(p.origen, "albaran_auto");
  assert.ok(store.findById("proveedores", p.id), "queda guardado");
});

test("crearMateriaDesdeLinea clasifica en la categoría correcta y pone unidad de consumo", () => {
  limpiar();
  // Leche → Lácteos y Bebidas Vegetales, unidad ml (compra en L).
  const leche = intake.crearMateriaDesdeLinea({ descripcion: "Leche entera", unidad: "L", cantidad: 12000, importe: 12 }, "p1");
  assert.strictEqual(leche.macro, "Materia Prima");
  assert.strictEqual(leche.subcategoria, "Lácteos y Bebidas Vegetales");
  assert.strictEqual(leche.unidad, "ml");
  assert.strictEqual(leche.proveedor_id, "p1");
  assert.strictEqual(leche.disponibilidad_actual, 0, "el stock entra al aceptar la recepción");
  assert.ok(leche.coste_medio > 0, "coste por unidad de consumo calculado");
  // Café → Café, Matcha y Té.
  const cafe = intake.crearMateriaDesdeLinea({ descripcion: "Café en grano Brasil", unidad: "kg", cantidad: 5000, importe: 40 }, "p1");
  assert.strictEqual(cafe.subcategoria, "Café, Matcha y Té");
  assert.strictEqual(cafe.unidad, "g");
  // Sin regla conocida → categoría por defecto (Seco y Despensa), unidad ud.
  const raro = intake.crearMateriaDesdeLinea({ descripcion: "Producto misterioso XYZ", unidad: "", cantidad: 3, importe: 9 }, "p1");
  assert.strictEqual(raro.macro, "Materia Prima");
  assert.strictEqual(raro.subcategoria, "Seco y Despensa");
  assert.strictEqual(raro.unidad, "ud");
});

if (fallos) { console.error(`\n${fallos} prueba(s) de alta automática fallaron`); process.exit(1); }
console.log("\nTodas las pruebas de alta automática desde albarán OK");
