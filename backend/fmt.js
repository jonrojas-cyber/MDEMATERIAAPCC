// Formato numérico · fuente ÚNICA de redondeo de dinero y porcentajes (dinero.9).
// Antes cada módulo redondeaba los % a su manera: cuenta-resultados y financials a
// ENTERO (Math.round(x*100)), financiero y analisis-diario a 1 DECIMAL
// (Math.round(x*1000)/10). El MISMO ratio salía con precisión distinta según la
// pantalla. Aquí se fija una sola convención (1 decimal) y todos la consumen.

// Euros con 2 decimales.
function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// Un RATIO (0..1, p. ej. 0,266) a porcentaje con 1 decimal (26,6). null → null.
function pct1(n) { return n == null ? null : Math.round(Number(n) * 1000) / 10; }

// n sobre base, a porcentaje con 1 decimal. base<=0 → null (no se divide por 0).
function pctDe(n, base) { return base > 0 ? Math.round((Number(n) / base) * 1000) / 10 : null; }

module.exports = { eur, pct1, pctDe };
