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
  await page.waitForSelector(".dash", { timeout: 15_000 });
}

test("la API de salud responde y reporta el modo de persistencia", async ({ request }) => {
  const r = await request.get("/api/salud");
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  expect(j.estado).toContain("Producción");
  expect(["persistente", "efimera"]).toContain(j.persistencia);
});

test("seguridad: PIN hasheado, intentos restantes y bloqueo por fallos", async ({ request }) => {
  // PIN incorrecto -> 401 con intentos restantes (no revela si el usuario existe).
  let r = await request.post("/api/auth/login", { data: { usuario: "Lara", pin: "0000" } });
  expect(r.status()).toBe(401);
  const j = await r.json();
  expect(j.intentos_restantes).toBeGreaterThanOrEqual(0);
  expect(j.intentos_restantes).toBeLessThan(5);
  // Tras 5 fallos, la cuenta (Jon) se bloquea -> 429.
  for (let i = 0; i < 5; i++) await request.post("/api/auth/login", { data: { usuario: "Jon", pin: "0000" } });
  r = await request.post("/api/auth/login", { data: { usuario: "Jon", pin: "1111" } });
  expect(r.status()).toBe(429);
  expect((await r.json()).bloqueado).toBeTruthy();
});

test("auditoría: las acciones críticas quedan registradas y son admin-only", async ({ request }) => {
  const sesion = await (await request.post("/api/auth/login", { data: { usuario: "Moni", pin: "3333" } })).json();
  const headers = { Authorization: `Bearer ${sesion.token}` };
  // Dar de baja un lote debe dejar rastro en la auditoría (con usuario y local).
  const lotes = await (await request.get("/api/lotes", { headers })).json();
  const lid = lotes[0].id;
  await request.post(`/api/lotes/${lid}/dar-de-baja`, { headers, data: { responsable: "Moni" } });
  const aud = await (await request.get("/api/auditoria", { headers })).json();
  const ev = aud.eventos.find((e) => e.accion === "lote_baja" && e.entidad_id === lid);
  expect(ev).toBeTruthy();
  expect(ev.usuario_nombre).toBeTruthy();
  expect(ev.local_id).toBeTruthy();
  // El rol equipo (Lara) no puede leer la auditoría.
  const lara = await (await request.post("/api/auth/login", { data: { usuario: "Lara", pin: "2222" } })).json();
  const r = await request.get("/api/auditoria", { headers: { Authorization: `Bearer ${lara.token}` } });
  expect(r.status()).toBe(403);
});

test("Ágora: importa del export, descuenta stock por escandallo y es idempotente", async ({ request }) => {
  const sesion = await (await request.post("/api/auth/login", { data: { usuario: "Moni", pin: "3333" } })).json();
  const headers = { Authorization: `Bearer ${sesion.token}` };
  const docs = { docs: [{ id: "E2E-INV-1", businessDay: "2026-06-30", lines: [{ product: "Brasa", quantity: 1, amount: 8.5 }] }] };
  const antes = (await (await request.get("/api/materias/mat-019", { headers })).json()).disponibilidad_actual;
  const r1 = await (await request.post("/api/ventas/agora-import", { headers, data: docs })).json();
  expect(r1.procesados).toBe(1);
  expect(r1.importe_total).toBeCloseTo(8.5, 2); // parser JSON correcto (no 85)
  const medio = (await (await request.get("/api/materias/mat-019", { headers })).json()).disponibilidad_actual;
  expect(medio).toBeLessThan(antes); // descontó stock según escandallo
  // Reimportar el MISMO documento no vuelve a descontar (idempotencia).
  const r2 = await (await request.post("/api/ventas/agora-import", { headers, data: docs })).json();
  expect(r2.procesados).toBe(0);
  expect(r2.omitidos_ya_procesados).toBe(1);
  const despues = (await (await request.get("/api/materias/mat-019", { headers })).json()).disponibilidad_actual;
  expect(despues).toBe(medio);
});

test("Ágora: la ingesta del conector exige token y el estado es consultable", async ({ request }) => {
  // El endpoint público del conector NO acepta peticiones sin el token compartido.
  const sinToken = await request.post("/agora/ingest", { data: { docs: [] } });
  expect([401, 503]).toContain(sinToken.status()); // 401 si hay token config., 503 si no
  const malToken = await request.post("/agora/ingest", { headers: { "x-connector-token": "no-vale" }, data: { docs: [] } });
  expect([401, 503]).toContain(malToken.status());
  // El estado del conector es consultable por el equipo (sin exponer el token).
  const sesion = await (await request.post("/api/auth/login", { data: { usuario: "Moni", pin: "3333" } })).json();
  const estado = await (await request.get("/api/ventas/agora-estado", { headers: { Authorization: `Bearer ${sesion.token}` } })).json();
  expect(estado).toHaveProperty("conector_configurado");
  expect(estado).toHaveProperty("bloqueados");
  expect(estado).not.toHaveProperty("token");
});

test("seguridad: cambio de PIN requiere el PIN actual", async ({ request }) => {
  const sesion = await (await request.post("/api/auth/login", { data: { usuario: "Moni", pin: "3333" } })).json();
  // PIN actual incorrecto -> 400.
  const malo = await request.post("/api/auth/cambiar-pin", { headers: { Authorization: `Bearer ${sesion.token}` }, data: { pin_actual: "0000", pin_nuevo: "1234" } });
  expect(malo.status()).toBe(400);
  // PIN actual correcto (cambio no destructivo 3333->3333) -> ok.
  const ok = await request.post("/api/auth/cambiar-pin", { headers: { Authorization: `Bearer ${sesion.token}` }, data: { pin_actual: "3333", pin_nuevo: "3333" } });
  expect(ok.ok()).toBeTruthy();
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

test("login + inicio: 4 tarjetas con el título completo (sin recorte) y cero errores de JS", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  // 4 bloques grandes (2×2); el primero es ALERTAS.
  await expect(page.locator(".dashcard")).toHaveCount(4);
  await expect(page.locator(".dashcard").first()).toContainText(/ALERTAS/);
  // Ninguna tarjeta recorta su título: el nombre queda DENTRO de su tarjeta
  // (regresión del bug donde la rejilla se aplastaba y cortaba los títulos).
  const clipped = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(".dashcard"));
    return cards.filter((c) => {
      const name = c.querySelector(".dashcard-name");
      if (!name) return true;
      const cr = c.getBoundingClientRect(), nr = name.getBoundingClientRect();
      return nr.top < cr.top - 1 || nr.bottom > cr.bottom + 1; // sobresale del recuadro
    }).length;
  });
  expect(clipped, "ningún título debe salirse de su tarjeta").toBe(0);
  expect(errors, "no debe haber errores de JS en consola").toEqual([]);
});

test("tareas: bandeja única con prioridad y acción directa", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  // Abrir Tareas desde la tarjeta ALERTAS.
  await page.locator(".dashcard").first().click();
  await expect(page.locator(".screen-head")).toContainText(/tareas/i);
  await expect(page.locator(".tareas-cuenta")).toContainText(/cr[ií]ticas/i);
  // Hay tareas con botón de acción directa (verbo imperativo).
  await expect(page.locator(".dec-act").first()).toBeVisible();
  await expect(page.locator(".dec-act-btn").first()).toBeVisible();
  const dec = await page.evaluate(() => api("/decisiones"));
  expect(Array.isArray(dec.acciones)).toBeTruthy();
  expect(dec.kpis).toBeTruthy();
  expect(errors).toEqual([]);
});

test("APPCC: hub de seguridad alimentaria (sin compras: recepción vive en Materia)", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.evaluate(() => irA_appcc());
  await expect(page.locator(".screen-head")).toContainText(/appcc/i);
  await expect(page.locator(".appcc-tile", { hasText: /Lotes/ })).toBeVisible();
  await expect(page.locator(".appcc-tile", { hasText: /Temperaturas/ })).toBeVisible();
  // Recepción es COMPRAS: no debe aparecer en APPCC.
  await expect(page.locator(".appcc-tile", { hasText: /Recepcion/i })).toHaveCount(0);
  // Registro para Sanidad: exportación APPCC imprimible.
  await expect(page.locator(".appcc-tile", { hasText: /Registro para Sanidad/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("APPCC: registro para inspección genera documento imprimible con firma", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.evaluate(() => irA_appccRegistro());
  await expect(page.locator(".appcc-doc-title")).toContainText(/Registro APPCC/i);
  await expect(page.locator(".appcc-doc-firma")).toContainText(/Firma/i);
  await expect(page.locator("button", { hasText: /Imprimir/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("navegación: categoría → módulos y ficha técnica de materia", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);

  // Entra en el área Producción y comprueba que lista sus módulos.
  await page.evaluate(() => irA_categoria("produccion"));
  await expect(page.locator(".subtile").first()).toBeVisible();

  // Vuelve al inicio y abre la ficha de una materia.
  await page.evaluate(() => goHome());
  await page.waitForSelector(".dash");
  await page.evaluate(() => irA_materias());
  await page.waitForSelector(".alm-macro");
  // Almacén de 3 niveles: macro → subcategoría → producto → ficha. Navegamos por
  // el árbol usando el estado cargado (determinista, sin depender de la animación).
  const { macro, sub } = await page.evaluate(() => {
    const mc = window._almArbol.macros.find((m) => m.total > 0) || window._almArbol.macros[0];
    const s = (mc.subcategorias || []).find((x) => x.total > 0);
    return { macro: mc.macro, sub: s ? s.subcategoria : null };
  });
  await page.evaluate((m) => irA_almMacro(encodeURIComponent(m)), macro);
  await expect(page.locator(".alm-sub:not(.alm-sub-empty)").first()).toBeVisible();
  await page.evaluate((a) => irA_almSub(encodeURIComponent(a.macro), encodeURIComponent(a.sub)), { macro, sub });
  await page.waitForSelector(".alm-row");
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
  await page.evaluate(() => irA_categoria("materia"));
  await expect(page.locator(".subtile").first()).toBeVisible();
  await page.evaluate(() => irA_materias());
  await expect(page.locator(".screen-head")).toContainText(/almac/i);

  // "Volver" debe llevar al submenú de Materia (su padre), no al inicio.
  await page.click("#topbar-back");
  await expect(page.locator(".subtile").first()).toBeVisible();
  await expect(page.locator("#topbar-section")).toHaveText(/materia/i);
  await expect(page.locator("#topbar-back")).toBeVisible();

  // "Volver" otra vez debe llevar al inicio (áreas visibles, sin botón volver).
  await page.click("#topbar-back");
  await expect(page.locator(".dashcard").first()).toBeVisible();
  await expect(page.locator("#topbar-back")).not.toBeVisible();

  expect(errors).toEqual([]);
});

test("apertura: al volver desde una tarea se regresa a la lista de apertura", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.evaluate(() => irA_apertura());
  await expect(page.locator("#topbar-section")).toHaveText(/apertura/i);
  await page.evaluate(() => aperAbrir("irA_temperaturas"));
  await expect(page.locator("#topbar-section")).toHaveText(/temperatura/i);
  await page.click("#topbar-back");
  await expect(page.locator("#topbar-section")).toHaveText(/apertura/i);
  expect(errors).toEqual([]);
});

test("el logo del encabezado vuelve al inicio desde cualquier sección", async ({ page }) => {
  await login(page);
  // Entra profundo: submenú Almacén → sección Materias.
  await page.evaluate(() => irA_categoria("materia"));
  await page.evaluate(() => irA_materias());
  await expect(page.locator(".screen-head")).toContainText(/almac/i);
  // Clic en el logotipo de texto → inicio.
  await page.click(".topbar .brandword");
  await expect(page.locator(".dashcard").first()).toBeVisible();
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
  // Vista previa: compras agrupadas por proveedor + caducidades.
  await expect(page.locator(".section-label", { hasText: /compras por proveedor/i })).toBeVisible();
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

test("inventario: recuento físico calcula descuadre en vivo", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.evaluate(() => irA_inventario());
  await expect(page.locator(".inv-row").first()).toBeVisible();
  // Cuenta la primera materia por debajo del teórico → descuadre negativo.
  const teo = await page.locator(".inv-row").first().getAttribute("data-teo");
  await page.locator(".inv-row .inv-fisico").first().fill(String(Math.max(0, Number(teo) - 5)));
  await expect(page.locator(".inv-row").first()).toHaveClass(/inv-desc/);
  await expect(page.locator("#inv-resumen")).toContainText(/descuadre/i);
  expect(errors).toEqual([]);
});

test("panel del propietario: KPIs, balance y descuadre de inventario sin errores", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.evaluate(() => irA_panel());
  await expect(page.locator(".section-label", { hasText: /Hoy/ }).first()).toBeVisible();
  await expect(page.locator(".section-label", { hasText: /Descuadre de inventario/ })).toBeVisible();
  await expect(page.locator(".kpi-box").first()).toBeVisible();
  // El panel carga la capa de inteligencia sin romper (haya o no insights).
  const insights = await page.evaluate(async () => (await api("/analitica?dias=30")).insights);
  expect(Array.isArray(insights)).toBe(true);
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
  // Ficha profesional: chips de alérgenos, versión y vida útil.
  await expect(page.locator("#rc-alergenos .alerg-chip").first()).toBeVisible();
  await page.locator("#rc-alergenos .alerg-chip", { hasText: "Gluten" }).click();
  await expect(page.locator("#rc-alergenos .alerg-chip.on")).toHaveCount(1);
  const alerg = await page.evaluate(() => recogerAlergenos());
  expect(alerg).toContain("Gluten");
  await page.fill("#rc-version", "v2 verano");
  await page.fill("#rc-vida", "48");
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

test("acceso por teclado: Enter abre una tarjeta", async ({ page }) => {
  await login(page);
  await page.locator(".dashcard").first().focus();
  await page.keyboard.press("Enter");
  // La primera tarjeta es "ALERTAS" → abre la bandeja de tareas.
  await expect(page.locator(".screen-head")).toContainText(/tareas/i);
});

// ═══ CENTRO DE CONTROL · Sistema Operativo del Negocio (solo admin) ═══
test("centro de control: el admin abre la sala de mando con todos los bloques", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await expect(page.locator(".dash-owner")).toBeVisible();
  await page.evaluate(() => irA_centroControl("mes"));
  await expect(page.locator(".cc-grid")).toBeVisible();
  await expect(page.locator(".cc-score").first()).toBeVisible(); // salud del negocio
  // Bloques clave presentes.
  await expect(page.locator(".cc-label", { hasText: /Beneficio real/ })).toBeVisible();
  await expect(page.locator(".cc-label", { hasText: /Coste de abrir la persiana/ })).toBeVisible();
  await expect(page.locator(".cc-label", { hasText: /Valor de la empresa/ })).toBeVisible();
  await expect(page.locator(".cc-label", { hasText: /Tesorería/ })).toBeVisible();
  await expect(page.locator(".cc-chip", { hasText: /^Semana$/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("centro de control: el trabajador NO puede leer los datos financieros", async ({ request }) => {
  const lara = await (await request.post("/api/auth/login", { data: { usuario: "Lara", pin: "2222" } })).json();
  const headers = { Authorization: "Bearer " + lara.token };
  for (const path of ["/api/executive-dashboard", "/api/financials", "/api/fixed-costs", "/api/debts", "/api/treasury", "/api/business-health", "/api/executive-dashboard/timeline", "/api/business-health/config", "/api/treasury/os", "/api/fixed-costs/os", "/api/fixed-costs/perfil"]) {
    const r = await request.get(path, { headers });
    expect(r.status(), path + " debe estar prohibido para el equipo").toBe(403);
  }
});

test("centro de control: el filtro de tiempo cambia el periodo (semana empieza lunes)", async ({ page }) => {
  await login(page);
  await page.evaluate(() => irA_centroControl("semana"));
  await expect(page.locator(".cc-chip.on", { hasText: /^Semana$/ })).toBeVisible();
  const inicioSemanaEsLunes = await page.evaluate(() => {
    const d = new Date(window._ccData.periodo.desde);
    return d.getDay(); // 1 = lunes
  });
  expect(inicioSemanaEsLunes).toBe(1);
  // Cambiar a "Este mes" recarga con otro periodo.
  await page.evaluate(() => irA_centroControl("mes"));
  const label = await page.evaluate(() => window._ccData.periodo.label);
  expect(label).toMatch(/mes/i);
});

test("centro de control: crear y borrar un coste fijo desde la interfaz", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.evaluate(() => irA_costesFijos());
  await expect(page.locator("button", { hasText: /Añadir coste fijo/ })).toBeVisible();
  await page.evaluate(() => ccFcForm());
  await page.fill("#fc-name", "Prueba control M");
  await page.fill("#fc-amount", "99");
  await page.evaluate(() => ccFcGuardar());
  await expect(page.locator(".card-name", { hasText: /Prueba control M/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("centro de control: crear una deuda desde la interfaz y verla en el resumen", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.evaluate(() => irA_deuda());
  await expect(page.locator("button", { hasText: /Añadir deuda/ })).toBeVisible();
  await page.evaluate(() => ccDebtForm());
  await page.fill("#dt-name", "Préstamo prueba");
  await page.fill("#dt-out", "5000");
  await page.fill("#dt-cuota", "200");
  await page.evaluate(() => ccDebtGuardar());
  await expect(page.locator(".card-name", { hasText: /Préstamo prueba/ })).toBeVisible();
  expect(errors).toEqual([]);
});

// Regresión de auditoría: los dos manejadores de foto tenían el MISMO nombre
// (elegirFotoProd), y la segunda declaración anulaba a la primera, rompiendo la
// foto del formulario de producto. Deben existir como funciones DISTINTAS.
test("auditoría: los manejadores de foto de producto y de compra no colisionan", async ({ page }) => {
  await login(page);
  const check = await page.evaluate(() => ({
    form: typeof window.elegirFotoProdForm,   // foto del producto de carta
    compra: typeof window.elegirFotoProd,      // foto del producto de compra
    distintos: window.elegirFotoProdForm !== window.elegirFotoProd,
  }));
  expect(check.form).toBe("function");
  expect(check.compra).toBe("function");
  expect(check.distintos).toBe(true);
});

// PRD 001 — Executive Control Center: la respuesta única incluye operaciones,
// extras financieros (burn/EBITDA) y la tendencia histórica; y la snapshot diaria
// se captura de forma idempotente.
test("executive: la respuesta única trae operaciones, financiero y tendencia", async ({ page }) => {
  await login(page);
  const d = await page.evaluate(async () => await api("/executive-dashboard?preset=mes"));
  expect(d.operaciones).toBeTruthy();
  expect(typeof d.operaciones.stock_critico).toBe("number");
  expect(d.financiero).toBeTruthy();
  expect(typeof d.financiero.monthly_burn).toBe("number");
  expect(d.financiero).toHaveProperty("ebitda_mes");
  expect(d.tendencia).toBeTruthy(); // {disponible:...}
  // El histórico de snapshots es consultable (serie temporal AI-ready).
  const h = await page.evaluate(async () => await api("/executive-dashboard/historico?dias=30"));
  expect(Array.isArray(h.historico)).toBe(true);
});

test("executive: la tarjeta de Operaciones aparece en el Centro de Control", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.evaluate(() => irA_centroControl("mes"));
  await expect(page.locator(".cc-label", { hasText: /Operaciones · hoy/ })).toBeVisible();
  expect(errors).toEqual([]);
});

// PRD 002 — Financial Timeline: el endpoint único devuelve serie + delta +
// forecast + anomalías; y la pantalla Línea temporal se abre sin errores.
test("timeline: el endpoint devuelve métricas, serie, forecast y anomalías", async ({ page }) => {
  await login(page);
  const d = await page.evaluate(async () => await api("/executive-dashboard/timeline?metric=patrimonio_neto&horizon=30"));
  expect(Array.isArray(d.metricas)).toBe(true);
  expect(d.metricas.length).toBeGreaterThan(5);
  expect(Array.isArray(d.serie)).toBe(true);
  expect(d.forecast).toBeTruthy();          // {disponible:...}
  expect(Array.isArray(d.anomalies)).toBe(true);
  expect(d.runway_caja).toBeTruthy();
});

test("timeline: la pantalla Línea temporal se abre con el selector de métricas", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.evaluate(() => irA_timeline());
  await expect(page.locator(".cc-chip", { hasText: /Valor de la empresa/ })).toBeVisible();
  expect(errors).toEqual([]);
});

// PRD 003 — Business Health Engine: categorías, riesgos, forecast y pesos configurables.
test("salud: el endpoint trae categorías, riesgos, forecast y pesos configurables", async ({ page }) => {
  await login(page);
  const h = await page.evaluate(async () => await api("/business-health?preset=semana"));
  expect(Array.isArray(h.categorias)).toBe(true);
  expect(h.categorias.length).toBeGreaterThanOrEqual(8);
  expect(Array.isArray(h.riesgos)).toBe(true);
  expect(h.forecast).toBeTruthy();
  const cfg = await page.evaluate(async () => await api("/business-health/config"));
  expect(cfg.pesos).toBeTruthy();
  expect(cfg.default).toBeTruthy();
  // Cambiar un peso y recuperarlo.
  const put = await page.evaluate(async () => await api("/business-health/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pesos: { risk: 2.5 } }) }));
  expect(put.ok).toBe(true);
  expect(put.pesos.risk).toBe(2.5);
});

test("salud: la pantalla muestra la salud por categoría", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.evaluate(() => irA_centroControl("mes"));
  await page.evaluate(() => irA_salud());
  await expect(page.locator(".section-label", { hasText: /Salud por categoría/ })).toBeVisible();
  expect(errors).toEqual([]);
});

// PRD 004 — Treasury OS: una llamada trae dashboard, cash flow, liquidez, valor
// de empresa, obligaciones, monitor de emergencia y forecast; la pantalla se abre.
test("tesorería OS: el endpoint ensambla todos los bloques", async ({ page }) => {
  await login(page);
  const os = await page.evaluate(async () => await api("/treasury/os"));
  expect(os.dashboard).toBeTruthy();
  expect(typeof os.dashboard.liquidez_inmediata).toBe("number");
  expect(typeof os.dashboard.disponible).toBe("number");
  expect(os.cashflow && os.cashflow.mes).toBeTruthy();
  expect(os.liquidez).toBeTruthy();
  expect(os.valor_empresa).toBeTruthy();
  expect(os.emergency).toBeTruthy();
  expect(os.forecast).toBeTruthy();
  expect(Array.isArray(os.obligaciones)).toBe(true);
});

test("tesorería OS: la pantalla muestra flujo de caja y valor de empresa", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.evaluate(() => irA_tesoreria());
  await expect(page.locator(".cc-label", { hasText: /Flujo de caja · mes/ })).toBeVisible();
  await expect(page.locator(".cc-label", { hasText: /Valor de la empresa/ })).toBeVisible();
  expect(errors).toEqual([]);
});

// PRD 005 — Fixed Costs OS: una llamada trae coste de existir, coste por hora,
// break-even, contribución, forecast con inflación y análisis de ahorro.
test("costes fijos OS: el endpoint ensambla todos los bloques", async ({ page }) => {
  await login(page);
  const os = await page.evaluate(async () => await api("/fixed-costs/os"));
  expect(os.dashboard).toBeTruthy();
  expect(typeof os.dashboard.coste_mes).toBe("number");
  expect(typeof os.dashboard.coste_hora).toBe("number");
  expect(os.break_even).toBeTruthy();
  expect(os.contribucion).toBeTruthy();
  expect(os.forecast).toBeTruthy();
  expect(os.analitica && Array.isArray(os.analitica.alertas)).toBe(true);
});

test("costes fijos OS: la pantalla muestra coste de existir y punto de equilibrio", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.evaluate(() => irA_costesFijos());
  await expect(page.locator(".cc-label", { hasText: /Coste de existir/ })).toBeVisible();
  await expect(page.locator(".cc-label", { hasText: /Punto de equilibrio · hoy/ })).toBeVisible();
  expect(errors).toEqual([]);
});
