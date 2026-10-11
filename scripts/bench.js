#!/usr/bin/env node
// Arnés de MEDICIÓN local del motor financiero (bloque 08). No es un test: mide
// p50/p95 de financials.beneficio sobre un dataset sintético de ~un mes. Sirve
// para comparar antes/después de una optimización con números reales (no inventados).
// Uso: node scripts/bench.js [nVentas] [nProductos] [repeticiones]
// OJO: mide ESTE hardware (local/CI), no el de Render. La medición en producción
// queda pendiente (requiere acceso al hosting real).
const store = require(require("path").join(__dirname, "..", "backend", "data-store"));

const N = Number(process.argv[2]) || 5000;
const P = Number(process.argv[3]) || 60;
const REP = Number(process.argv[4]) || 30;

// Dataset sintético: P productos con escandallo encadenado, N ventas en el mes.
const materias = [];
for (let i = 0; i < 40; i++) materias.push({ id: "m" + i, nombre: "mat" + i, coste_medio: 0.1 + (i % 7) * 0.05, unidad: "g" });
const productos = [];
for (let i = 0; i < P; i++) {
  productos.push({
    id: "p" + i, nombre: "prod" + i, precio_venta: 2 + (i % 10), iva: 0.1, activo: true,
    ingredientes: [{ materia_id: "m" + (i % 40), cantidad: 1 + (i % 5) }, { materia_id: "m" + ((i + 3) % 40), cantidad: 2 }],
  });
}
const base = Date.parse("2026-10-01T08:00:00");
const ventas = [];
for (let i = 0; i < N; i++) {
  const p = productos[i % P];
  ventas.push({ id: "v" + i, producto_id: p.id, producto: p.nombre, cantidad: 1, importe: p.precio_venta, importe_neto: p.precio_venta / 1.1, fecha: new Date(base + i * 60000).toISOString(), fuente: "agora" });
}
const db = { ventas, productos, materias, recetas: [], preparaciones: [], fixed_costs: [], staff_finance: [], debts: [], variable_costs: [], ajustes: [], config: [] };
store.readAll = (n) => (db[n] || (db[n] = []));
store.findById = (n, id) => (db[n] || []).find((x) => x.id === id) || null;

const financials = require("../backend/financials");
const r = { desde: base, hasta: base + 31 * 86400000 };

// Calentamiento + medición.
financials.beneficio(r);
const t = [];
for (let i = 0; i < REP; i++) { const a = process.hrtime.bigint(); financials.beneficio(r); t.push(Number(process.hrtime.bigint() - a) / 1e6); }
t.sort((a, b) => a - b);
const p = (q) => t[Math.min(t.length - 1, Math.floor(q * t.length))];
console.log(`beneficio() · ${N} ventas · ${P} productos · ${REP} reps (hardware LOCAL, no Render)`);
console.log(`  p50=${p(0.5).toFixed(1)}ms  p95=${p(0.95).toFixed(1)}ms  min=${t[0].toFixed(1)}ms  max=${t[t.length - 1].toFixed(1)}ms`);
