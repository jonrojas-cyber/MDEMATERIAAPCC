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
  await page.waitForSelector("#pin-inp", { state: "visible" });
  await page.fill("#pin-inp", "3333");
  await page.waitForSelector(".cats", { timeout: 15_000 });
}

test("la API de salud responde y reporta el modo de persistencia", async ({ request }) => {
  const r = await request.get("/api/salud");
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  expect(j.estado).toContain("Producción");
  expect(["persistente", "efimera"]).toContain(j.persistencia);
});

test("login + inicio: 4 categorías (admin) y cero errores de JS", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await expect(page.locator(".cat")).toHaveCount(4);
  // Accesibilidad: las tarjetas son operables por teclado (role=button).
  await expect(page.locator(".cat").first()).toHaveAttribute("role", "button");
  await expect(page.locator(".cat").first()).toHaveAttribute("tabindex", "0");
  expect(errors, "no debe haber errores de JS en consola").toEqual([]);
});

test("navegación: categoría → módulos y ficha técnica de materia", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);

  // Entra en la categoría Operación y comprueba que lista sus módulos.
  await page.evaluate(() => irA_categoria("operacion"));
  await expect(page.locator(".modrow").first()).toBeVisible();

  // Vuelve al inicio y abre la ficha de una materia.
  await page.evaluate(() => goHome());
  await page.waitForSelector(".cats");
  await page.evaluate(() => irA_materias());
  await page.locator(".card.clickable").first().click();
  await expect(page.locator(".ficha-overlay")).toBeVisible();
  await expect(page.locator(".ficha-name")).toBeVisible();

  expect(errors).toEqual([]);
});

test("volver: desde una sección regresa a su submenú y luego al inicio", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);

  // Inicio → submenú Operación → sección Materias.
  await page.evaluate(() => irA_categoria("operacion"));
  await expect(page.locator(".modrow").first()).toBeVisible();
  await page.evaluate(() => irA_materias());
  await expect(page.locator(".screen-head")).toContainText(/materias/i);

  // "Volver" debe llevar al submenú de Operación (no al inicio).
  await page.click("#topbar-back");
  await expect(page.locator(".modrow").first()).toBeVisible();
  await expect(page.locator("#topbar-section")).toHaveText(/operación/i);
  await expect(page.locator("#topbar-back")).toBeVisible();

  // "Volver" otra vez debe llevar al inicio (categorías visibles, sin botón volver).
  await page.click("#topbar-back");
  await expect(page.locator(".cat").first()).toBeVisible();
  await expect(page.locator("#topbar-back")).not.toBeVisible();

  expect(errors).toEqual([]);
});

test("el logo del encabezado vuelve al inicio desde cualquier sección", async ({ page }) => {
  await login(page);
  // Entra profundo: submenú Operación → sección Materias.
  await page.evaluate(() => irA_categoria("operacion"));
  await page.evaluate(() => irA_materias());
  await expect(page.locator(".screen-head")).toContainText(/materias/i);
  // Clic en el logotipo de texto → inicio.
  await page.click(".topbar .brandword");
  await expect(page.locator(".cat").first()).toBeVisible();
  await expect(page.locator("#topbar-back")).not.toBeVisible();
});

test("avisos: la pantalla de configuración carga con formulario y vista previa", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page); // Moni es admin
  await page.evaluate(() => irA_avisos());
  // Formulario de configuración.
  await expect(page.locator("#av-email")).toBeVisible();
  await expect(page.locator("#av-hora")).toBeVisible();
  await expect(page.locator("#av-cad")).toBeVisible();
  await expect(page.locator("#av-activo")).toBeVisible();
  // Vista previa (al menos las tarjetas de pedidos y caducidades).
  await expect(page.locator(".card-name", { hasText: /conviene pedir/i })).toBeVisible();
  await expect(page.locator(".card-name", { hasText: /caducar/i })).toBeVisible();
  expect(errors).toEqual([]);
});

test("acceso por teclado: Enter abre una categoría", async ({ page }) => {
  await login(page);
  await page.locator(".cat").first().focus();
  await page.keyboard.press("Enter");
  // La primera tarjeta es "Resumen del día" → abre la pantalla de resumen.
  await expect(page.locator(".screen-head, .cat-title")).toContainText(/resumen/i);
});
