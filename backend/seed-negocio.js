// SIEMBRA DEL NEGOCIO (idempotente): gastos fijos reales + préstamos.
// La app traía costes de ejemplo (Alquiler 550, Gestoría 180, Luz 220, Agua 60…).
// Aquí se ponen los valores REALES del local (upsert por id) y se añaden Lara y
// los préstamos. Editable luego en Costes fijos / Deuda. Como seed-cafe: se
// ejecuta una vez (flag en `config`) y respeta lo que edites después.

const store = require("./data-store");

const BATCHES = [
  {
    flag: "negocio_seed_v3_costes",
    entity: "fixed_costs",
    // upsert: si el id existe se ACTUALIZA a estos valores; si no, se inserta.
    upserts: [
      { id: "fc-alquiler", name: "Alquiler del local", category: "Alquiler", amount: 665.50, vat: 21, periodicity: "monthly", active: true, notes: "550 € + IVA los 5 primeros años; a partir del 6º año 1.100 € + IVA" },
      { id: "fc-gestoria", name: "Asesoría / gestoría", category: "Gestoría", amount: 150, vat: 21, periodicity: "monthly", active: true },
      { id: "fc-luz", name: "Luz", category: "Luz", amount: 300, vat: 21, periodicity: "monthly", active: true },
      { id: "fc-agua", name: "Agua", category: "Agua", amount: 25, vat: 10, periodicity: "monthly", active: true, notes: "≈50 € cada 2 meses (25 €/mes prorrateado)" },
      { id: "fc-lara", name: "Salario Lara (con SS y gestor)", category: "Personal", amount: 1800, vat: 0, periodicity: "monthly", active: true, notes: "≈1.550 € convenio + retenciones + 30 €/nómina (gestor)" },
    ],
  },
  {
    flag: "negocio_seed_v2_prestamos",
    entity: "debts",
    inserts: [
      { id: "debt-0892", name: "Préstamo *0892", lender: "Banco", type: "loan", initial_amount: 40000, outstanding_amount: 36830.19, interest_rate: 0, monthly_payment: 480.93, start_date: null, end_date: "2035-04-30", status: "activa", notes: "Cuadro del banco (2 de 4)", creado_en: new Date().toISOString() },
      { id: "debt-7186", name: "Préstamo *7186", lender: "Banco", type: "loan", initial_amount: 20000, outstanding_amount: 19521.05, interest_rate: 0, monthly_payment: 227.10, start_date: null, end_date: "2036-02-29", status: "activa", notes: "Cuadro del banco (4 de 4)", creado_en: new Date().toISOString() },
    ],
  },
];

async function seedNegocio() {
  try {
    const cfg = store.readAll("config") || [];
    const hechos = new Set(cfg.filter((c) => c && c.id).map((c) => c.id));
    let tocados = 0, ranAny = false;
    for (const b of BATCHES) {
      if (hechos.has(b.flag)) continue;
      (b.upserts || []).forEach((rec) => {
        if (store.findById(b.entity, rec.id)) { store.update(b.entity, rec.id, rec); }
        else { store.insert(b.entity, { ...rec, creado_en: new Date().toISOString() }); }
        tocados++;
      });
      (b.inserts || []).forEach((it) => { if (!store.findById(b.entity, it.id)) { store.insert(b.entity, it); tocados++; } });
      store.insert("config", { id: b.flag, hecho: true, fecha: new Date().toISOString() });
      ranAny = true;
    }
    if (ranAny) { await store.flush(); console.log(`Seed negocio · ${tocados} registros.`); }
  } catch (e) {
    console.error("No se pudo sembrar el negocio:", e.message);
  }
}

module.exports = { seedNegocio };
