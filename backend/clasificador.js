// Clasificador de materias en la taxonomía del almacén (macro → subcategoría).
// Fuente única: la usan la ruta de materias (árbol/almacén) y la analítica del
// propietario (valor de almacén por categoría). No duplicar esta tabla.

const TAXONOMIA = {
  "Materia Prima": [
    "Café, Matcha y Té",
    "Lácteos y Bebidas Vegetales",
    "Proteínas",
    "Vegetales y Fruta",
    "Panadería y Bollería",
    "Seco y Despensa",
    "Congelado",
  ],
  Elaboraciones: ["Cremas", "Salsas", "Producciones Cocina", "Producciones Barra"],
  "Bebidas Terminadas": ["Refrescos", "Zumos", "RTD M de Materia", "Alcohol"],
  Consumibles: ["Packaging", "Vasos y Tapas", "Etiquetas", "Servilletas", "Material Oficina"],
  "Limpieza y APPCC": ["Químicos", "Desechables", "APPCC", "Uniformidad"],
};
const MACROS = Object.keys(TAXONOMIA);
const DEFECTO = { macro: "Materia Prima", sub: "Seco y Despensa" };

const CLASIFICADOR = [
  [/matcha|t[eé] verde|sencha|hoji|rooibos/i, "Materia Prima", "Café, Matcha y Té"],
  [/caf[eé]|cold ?brew|espresso|tueste|robusta|ar[aá]bica/i, "Materia Prima", "Café, Matcha y Té"],
  [/leche|l[aá]cteo|avena|nata|yogur|bebida vegetal|soja|crema de leche|mantequilla|queso/i, "Materia Prima", "Lácteos y Bebidas Vegetales"],
  [/pollo|ventresca|jam[oó]n|short ?rib|carne|at[uú]n|salm[oó]n|huevo|gamba|bacon|pavo|cerdo|ternera|anchoa/i, "Materia Prima", "Proteínas"],
  [/congelad|helado|hielo/i, "Materia Prima", "Congelado"],
  [/aguacate|tomate|lima|lim[oó]n|hierba|berenjena|encurtido|lechuga|r[uú]cula|pepino|fruta|verdura|cebolla|zanahoria|manzana|pl[aá]tano|fresa/i, "Materia Prima", "Vegetales y Fruta"],
  [/\bpan\b|bollo|masa|bizcocho|galleta|croissant|brioche|focaccia|chapata/i, "Materia Prima", "Panadería y Bollería"],
  [/crema(?! de leche)/i, "Elaboraciones", "Cremas"],
  [/salsa|alioli|mayonesa|pesto|hummus|guacamole|vinagreta|chimichurri/i, "Elaboraciones", "Salsas"],
  [/aove|aceite|\bsal\b|vinagre|az[uú]car|especia|pistacho|fruto seco|harina|arroz|legumbre|conserva|miel|cacao/i, "Materia Prima", "Seco y Despensa"],
  [/refresco|t[oó]nica|soda|cola\b|fanta|aquarius|nestea/i, "Bebidas Terminadas", "Refrescos"],
  [/zumo|n[eé]ctar/i, "Bebidas Terminadas", "Zumos"],
  [/\brtd\b|botella m|lata m/i, "Bebidas Terminadas", "RTD M de Materia"],
  [/vino|cerveza|\bgin\b|\bron\b|vodka|licor|verm[uú]|alcohol|whisky|cava|sidra/i, "Bebidas Terminadas", "Alcohol"],
  [/agua/i, "Bebidas Terminadas", "Refrescos"],
  [/vaso|tapa\b/i, "Consumibles", "Vasos y Tapas"],
  [/etiqueta/i, "Consumibles", "Etiquetas"],
  [/servilleta/i, "Consumibles", "Servilletas"],
  [/film|papel film|bolsa|caja|packaging|envase|bandeja|portavasos/i, "Consumibles", "Packaging"],
  [/boli|folio|oficina|impresora|t[oó]ner|grapa|cinta/i, "Consumibles", "Material Oficina"],
  [/lej[ií]a|desengrasante|desinfect|detergente|qu[ií]mico|sanitiz|abrillantador/i, "Limpieza y APPCC", "Químicos"],
  [/guante|bayeta|papel sec|desechable|estropajo/i, "Limpieza y APPCC", "Desechables"],
  [/appcc|term[oó]metro|registro|control temp|tira ph/i, "Limpieza y APPCC", "APPCC"],
  [/uniforme|delantal|gorro|camiseta|mandil/i, "Limpieza y APPCC", "Uniformidad"],
];

function clasificar(nombre) {
  const n = String(nombre || "");
  for (const [re, macro, sub] of CLASIFICADOR) if (re.test(n)) return { macro, sub };
  return { ...DEFECTO };
}
function categoriaDe(m) {
  if (m.macro && TAXONOMIA[m.macro] && TAXONOMIA[m.macro].includes(m.subcategoria)) {
    return { macro: m.macro, sub: m.subcategoria };
  }
  return clasificar(m.nombre);
}

module.exports = { TAXONOMIA, MACROS, DEFECTO, CLASIFICADOR, clasificar, categoriaDe };
