// Tests E2E de Control M · m de materia.
// Cubren: salud de la API, login con PIN, render del inicio sin errores de JS,
// navegación a categoría y apertura de la ficha técnica de una materia, además
// de comprobaciones básicas de accesibilidad por teclado.
const { test, expect } = require("@playwright/test");

// Inicia sesión como Mónica (admin, PIN 3333) y espera el inicio cargado.
async function login(page) {
  await page.goto("/");
  await page.waitForSelector("#ubtn-Moni", { timeout: 30_000 });
  await page.click("#ubtn-Moni");
  await page.waitForSelector("#pin-wrap", { state: "visible" });
  // Teclado numérico en pantalla: pulsa los dígitos del PIN (3333).
  for (const d of "3333") {
    await page.locator(".pin-key", { hasText: new RegExp("^" + d + "$") }).click();
  }
  await page.waitForSelector(".home-nav", { timeout: 15_000 });
}

test("la API de salud responde y reporta el modo de persistencia", async ({ request }) => {
  const r = await request.get("/api/salud");
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  expect(j.estado).toContain("Producción");
  expect(["persistente", "efimera"]).toContain(j.persistencia);
});

test("login: teclado numérico en pantalla (puntos, borrar y PIN incorrecto)", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("#ubtn-Moni");
  await page.click("#ubtn-Moni");
  await page.waitForSelector("#pin-wrap", { state: "visible" });
  // Pulsar dos dígitos enciende dos puntos.
  await page.locator(".pin-key", { hasText: /^1$/ }).click();
  await page.locator(".pin-key", { hasText: /^2$/ }).click();
  await expect(page.locator("#pin-dots .pin-dot.on")).toHaveCount(2);
  // Borrar deja uno.
  await page.locator(".pin-key-ghost").click();
  await expect(page.locator("#pin-dots .pin-dot.on")).toHaveCount(1);
  // PIN incorrecto (9999) muestra mensaje y resetea.
  await page.locator(".pin-key-ghost").click();
  for (const d of "9999") await page.locator(".pin-key", { hasText: new RegExp("^" + d + "$") }).click();
  await expect(page.locator("#pin-err")).toContainText(/incorrecto/i);
  await expect(page.locator("#pin-dots .pin-dot.on")).toHaveCount(0);
});

test("login + inicio: centro de mando con 5 áreas y cero errores de JS", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  // Las 5 áreas (Control · Producción · Almacén · Compras · Negocio) para admin.
  await expect(page.locator(".navchip")).toHaveCount(5);
  // Son botones nativos (operables por teclado).
  await expect(page.locator(".navchip").first()).toHaveJSProperty("tagName", "BUTTON");
  expect(errors, "no debe haber errores de JS en consola").toEqual([]);
});

test("centro de decisiones: acciones priorizadas con acción directa", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  // La home es un centro de mando: muestra "Qué hacer ahora".
  await expect(page.locator(".qha")).toBeVisible();
  await page.evaluate(() => irA_decisiones());
  await expect(page.locator(".screen-head")).toContainText(/decisiones/i);
  // Hay acciones con botón de acción directa.
  await expect(page.locator(".dec-act").first()).toBeVisible();
  await expect(page.locator(".dec-act-btn").first()).toBeVisible();
  // La API de decisiones devuelve estructura de mando.
  const dec = await page.evaluate(() => api("/decisiones"));
  expect(Array.isArray(dec.acciones)).toBeTruthy();
  expect(dec.resumen).toBeTruthy();
  expect(errors).toEqual([]);
});

test("navegación: categoría → módulos y ficha técnica de materia", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);

  // Entra en el área Producción y comprueba que lista sus módulos.
  await page.evaluate(() => irA_categoria("produccion"));
  await expect(page.locator(".modrow").first()).toBeVisible();

  // Vuelve al inicio y abre la ficha de una materia.
  await page.evaluate(() => goHome());
  await page.waitForSelector(".home-nav");
  await page.evaluate(() => irA_materias());
  // Almacén de 3 niveles: macro → subcategoría → producto → ficha.
  await page.locator(".alm-macro").first().click();
  await page.locator(".alm-sub:not(.alm-sub-empty)").first().click();
  await page.locator(".alm-row").first().click();
  await expect(page.locator(".ficha-overlay")).toBeVisible();
  await expect(page.locator(".ficha-name")).toBeVisible();

  expect(errors).toEqual([]);
});

test("volver: desde una sección regresa a su submenú y luego al inicio", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);

  // Inicio → submenú Almacén → sección Materias (su padre es Almacén).
  await page.evaluate(() => irA_categoria("almacen"));
  await expect(page.locator(".modrow").first()).toBeVisible();
  await page.evaluate(() => irA_materias());
  await expect(page.locator(".screen-head")).toContainText(/almac/i);

  // "Volver" debe llevar al submenú de Almacén (no al inicio).
  await page.click("#topbar-back");
  await expect(page.locator(".modrow").first()).toBeVisible();
  await expect(page.locator("#topbar-section")).toHaveText(/almac/i);
  await expect(page.locator("#topbar-back")).toBeVisible();

  // "Volver" otra vez debe llevar al inicio (áreas visibles, sin botón volver).
  await page.click("#topbar-back");
  await expect(page.locator(".navchip").first()).toBeVisible();
  await expect(page.locator("#topbar-back")).not.toBeVisible();

  expect(errors).toEqual([]);
});

test("el logo del encabezado vuelve al inicio desde cualquier sección", async ({ page }) => {
  await login(page);
  // Entra profundo: submenú Almacén → sección Materias.
  await page.evaluate(() => irA_categoria("almacen"));
  await page.evaluate(() => irA_materias());
  await expect(page.locator(".screen-head")).toContainText(/almac/i);
  // Clic en el logotipo de texto → inicio.
  await page.click(".topbar .brandword");
  await expect(page.locator(".navchip").first()).toBeVisible();
  await expect(page.locator("#topbar-back")).not.toBeVisible();
});

test("avisos: la pantalla carga con activación de dispositivo, config y vista previa", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page); // Moni es admin
  await page.evaluate(() => irA_avisos());
  // Configuración (hora, plazo de caducidad, activar/desactivar global).
  await expect(page.locator("#av-hora")).toBeVisible();
  await expect(page.locator("#av-cad")).toBeVisible();
  await expect(page.locator("#av-activo")).toBeVisible();
  // Botón de guardar y de prueba.
  await expect(page.locator("button", { hasText: /Guardar/ })).toBeVisible();
  await expect(page.locator("button", { hasText: /aviso de prueba/i })).toBeVisible();
  // Vista previa (tarjetas de pedidos y caducidades).
  await expect(page.locator(".card-name", { hasText: /conviene pedir/i })).toBeVisible();
  await expect(page.locator(".card-name", { hasText: /caducar/i })).toBeVisible();
  expect(errors).toEqual([]);
});

test("proveedores: abre el formulario de alta con todos los campos", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page); // Moni es admin
  await page.evaluate(() => irA_proveedores());
  await expect(page.locator("button", { hasText: /Agregar proveedor/ })).toBeVisible();
  await page.evaluate(() => formProveedor());
  for (const id of ["#pv-nombre", "#pv-cat", "#pv-contacto", "#pv-tel", "#pv-email", "#pv-estado", "#pv-notas"]) {
    await expect(page.locator(id)).toBeVisible();
  }
  // Sin nombre: muestra aviso amable (no crea).
  await page.evaluate(() => guardarProveedor(null));
  await expect(page.locator("#pv-msg")).toContainText(/Rev[ií]salo/i);
  expect(errors).toEqual([]);
});

test("productos por proveedor: formulario con cálculo de IVA y unitario", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  // Entra en los productos del primer proveedor.
  const provId = await page.evaluate(async () => (await api("/proveedores"))[0].id);
  await page.evaluate((id) => irA_productosProveedor(id), provId);
  await expect(page.locator("button", { hasText: /Agregar producto/ })).toBeVisible();
  await page.evaluate((id) => formProductoCompra(id), provId);
  await page.fill("#cp-cant", "6");
  await page.fill("#cp-siniva", "12");
  await page.fill("#cp-iva", "10");
  await page.dispatchEvent("#cp-iva", "input");
  // El cálculo en vivo muestra precio con IVA y unitario.
  await expect(page.locator("#cp-calc")).toContainText("13.20"); // 12 + 10% IVA
  await expect(page.locator("#cp-calc")).toContainText("2.2000"); // 13.20 / 6 unidades
  expect(errors).toEqual([]);
});

test("precio pactado: cambiar precio registra histórico con motivo", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  // Crea un producto vía API y abre su pantalla de precio.
  const ids = await page.evaluate(async () => {
    const prov = (await api("/proveedores"))[0];
    const p = await api("/compras-productos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proveedor_id: prov.id, nombre: "Test precio", formato: "kg", cantidad_formato: 1, precio_sin_iva: 10, iva: 10 }),
    });
    return { provId: prov.id, prodId: p.id };
  });
  await page.evaluate((x) => irA_precioProducto(x.prodId, x.provId), ids);
  await expect(page.locator("#pr-nuevo")).toBeVisible();
  await expect(page.locator(".card-name", { hasText: /Precio pactado actual/i })).toBeVisible();
  // Cambia el precio con motivo y comprueba que aparece en el histórico.
  await page.fill("#pr-nuevo", "13");
  await page.fill("#pr-motivo", "Subida test");
  await page.evaluate(() => guardarCambioPrecio(null));
  await expect(page.locator(".card-meta", { hasText: /Subida test/i })).toBeVisible();
  // Limpieza: borra el producto de prueba.
  await page.evaluate((x) => api("/compras-productos/" + x.prodId, { method: "DELETE" }), ids);
  expect(errors).toEqual([]);
});

test("almacén: jerarquía de 3 niveles, búsqueda global y semáforo de stock", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.evaluate(() => irA_materias());
  // Nivel 1: macrocategorías + búsqueda global.
  await expect(page.locator(".alm-macro").first()).toBeVisible();
  await expect(page.locator("#alm-q")).toBeVisible();
  // Búsqueda global instantánea encuentra resultados con semáforo.
  await page.fill("#alm-q", "matcha");
  await expect(page.locator("#alm-search .alm-row").first()).toBeVisible();
  await expect(page.locator("#alm-search .alm-dot").first()).toBeVisible();
  // Limpiar la búsqueda restaura las macrocategorías.
  await page.fill("#alm-q", "");
  await expect(page.locator(".alm-macro").first()).toBeVisible();
  // Nivel 2 → 3: macro → subcategoría con productos → lista con filtros.
  await page.locator(".alm-macro").first().click();
  await page.locator(".alm-sub:not(.alm-sub-empty)").first().click();
  await expect(page.locator("#alm-subq")).toBeVisible();
  await expect(page.locator(".chip", { hasText: /Crítico/ })).toBeVisible();
  await expect(page.locator("#alm-sublist .alm-row").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("recepción: campos de lote/caducidad y tres estados", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  // Crea una recepción pendiente vía API.
  const rid = await page.evaluate(async () => {
    const prov = (await api("/proveedores"))[0];
    const r = await api("/recepciones", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proveedor_id: prov.id, importe_total: 10, lote_proveedor: "L-TEST", caducidad: "01/01/2027", lineas: [] }),
    });
    return r.id;
  });
  await page.evaluate(() => irA_recepcion());
  await expect(page.locator("#rcp-lote")).toBeVisible();
  await expect(page.locator("#rcp-cad")).toBeVisible();
  await expect(page.locator("button", { hasText: /Foto del producto/ })).toBeVisible();
  await expect(page.locator("button", { hasText: /^Aceptar$/ }).first()).toBeVisible();
  await expect(page.locator("button", { hasText: /Con incidencia/ }).first()).toBeVisible();
  await expect(page.locator("button", { hasText: /Rechazar/ }).first()).toBeVisible();
  // Limpieza: resolver la recepción de prueba.
  await page.evaluate((id) => api("/recepciones/" + id + "/estado", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "Rechazado" }) }), rid);
  expect(errors).toEqual([]);
});

test("recetas: editor calcula escandallo y PVP recomendado en vivo", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.evaluate(() => irA_carta());
  await expect(page.locator("button", { hasText: /Crear receta/ })).toBeVisible();
  await page.evaluate(() => formReceta());
  await expect(page.locator("#rc-nombre")).toBeVisible();
  // Elige la primera materia y pon cantidad → el panel calcula coste y PVP recomendado.
  await page.selectOption(".rc-mat", { index: 1 });
  await page.fill(".rc-cant", "100");
  await page.fill("#rc-margen", "70");
  await page.dispatchEvent("#rc-margen", "input");
  await expect(page.locator("#rc-calc")).toContainText(/Coste del escandallo/i);
  await expect(page.locator("#rc-calc")).toContainText(/PVP recomendado/i);
  // "Usar PVP recomendado" copia el precio sugerido.
  await page.evaluate(() => usarPvp());
  const precio = await page.inputValue("#rc-precio");
  expect(Number(precio)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("escáner de documento: endereza y devuelve una imagen procesada", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  const result = await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 320; c.height = 220;
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 320, 220);
    ctx.fillStyle = "#000"; ctx.font = "20px sans-serif"; ctx.fillText("ALBARAN", 40, 110);
    const url = c.toDataURL("image/jpeg", 0.9);
    const p = abrirEditorDoc(url);           // abre el editor (overlay) y devuelve promesa
    await new Promise((r) => setTimeout(r, 60));
    document.getElementById("doc-ok").click(); // aplica recorte + enderezado
    const out = await p;
    return { ok: typeof out === "string" && out.startsWith("data:image/jpeg"), cambia: out !== url };
  });
  expect(result.ok).toBeTruthy();
  expect(result.cambia).toBeTruthy();
  expect(errors).toEqual([]);
});

test("acceso por teclado: Enter abre un área", async ({ page }) => {
  await login(page);
  await page.locator(".navchip").first().focus();
  await page.keyboard.press("Enter");
  // La primera área es "Control" → abre su submenú.
  await expect(page.locator(".screen-head")).toContainText(/control/i);
});
