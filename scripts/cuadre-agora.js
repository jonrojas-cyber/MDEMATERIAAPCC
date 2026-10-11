#!/usr/bin/env node
// Cuadre de SOLO LECTURA Ágora ⇄ Control M (bloque 11). Uso:
//   node scripts/cuadre-agora.js <export-agora.json> [YYYY-MM-DD]
// El export se obtiene con include-processed=true y SIN llamar a /processed, así
// NO altera el estado de Ágora. Compara el resultado con /api/ventas/conciliacion.
const fs = require("fs");
const path = require("path");
const { analizarExport } = require(path.join(__dirname, "..", "backend", "cuadre-agora"));

const file = process.argv[2];
const dia = process.argv[3] || null;
if (!file) {
  console.error("Uso: node scripts/cuadre-agora.js <export-agora.json> [YYYY-MM-DD]");
  console.error("  (export con include-processed=true, SIN llamar a /processed → no altera Ágora)");
  process.exit(2);
}
const body = JSON.parse(fs.readFileSync(file, "utf8"));
const r = analizarExport(body, { dia });
console.log(`Cuadre Ágora (solo lectura)${dia ? " · " + dia : ""}`);
for (const d of r.dias) {
  console.log(`  ${d.fecha}: ventas ${d.ventas_brutas}€ (facturas ${d.facturas} + albaranes ${d.albaranes} − devoluciones ${Math.abs(d.devoluciones)}) · pedidos excluidos ${d.pedidos_excluidos}€ · ${d.documentos} docs`);
}
console.log(`  TOTAL ventas brutas ${r.total.ventas_brutas}€ · pedidos excluidos ${r.total.pedidos_excluidos}€ · devoluciones ${r.total.devoluciones}€ · IVA en el export: ${r.iva_detectado ? "sí" : "no"}`);
if (r.posible_doble_conteo.length) console.warn(`  ⚠ posible doble conteo albarán+factura (Serie|Número): ${r.posible_doble_conteo.join(", ")}`);
console.log("  " + r.nota);
