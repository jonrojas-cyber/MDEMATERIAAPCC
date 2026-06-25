// Configuración de los tests E2E. Arranca el servidor real (backend/server.js)
// en el puerto 4001 y corre los specs de ./tests contra él.
const { defineConfig, devices } = require("@playwright/test");

const PORT = process.env.PORT || 4001;
const BASE = `http://localhost:${PORT}`;

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
    env: { PORT: String(PORT) },
  },
});
