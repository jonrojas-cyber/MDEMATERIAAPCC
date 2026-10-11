// Configuración de los tests E2E. Arranca el servidor real (backend/server.js)
// en el puerto 4001 y corre los specs de ./tests contra él.
const { defineConfig, devices } = require("@playwright/test");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Zona horaria del negocio (Málaga) también en los tests (motor-fechas.3).
process.env.TZ = process.env.TZ || "Europe/Madrid";

const PORT = process.env.PORT || 4001;
const BASE = `http://localhost:${PORT}`;

// DATA_DIR aislado para e2e: el servidor de pruebas NO escribe en backend/data
// (los fixtures versionados). Se siembra solo desde las semillas al arrancar.
const E2E_DATA_DIR = process.env.CONTROL_M_DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "cm-e2e-"));

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node backend/server.js",
    url: `${BASE}/api/salud`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { PORT: String(PORT), CONTROL_M_DATA_DIR: E2E_DATA_DIR, TZ: process.env.TZ || "Europe/Madrid" },
  },
});
