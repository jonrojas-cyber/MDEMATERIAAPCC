// CARTA DIGITAL PÚBLICA · m de materia
// Página que abre el cliente al escanear el QR de la mesa. Misma estética que la
// app de grifos y Control M: olivo oscuro, Courier, minúsculas, imagotipo |||.
// SOLO muestra lo que ve el cliente (nombre, descripción, precio de venta):
// nunca coste ni margen. La fuente de datos es el mismo almacén de productos.

const store = require("./data-store");

// Orden y nombre visible de las categorías (las que no estén aquí van al final).
const ORDEN_CAT = [
  ["café", "cafés"],
  ["matcha", "matcha"],
  ["cold brew", "cold brew"],
  ["burbujas", "burbujas"],
  ["zumos", "zumos"],
  ["infusiones", "infusiones"],
  ["dulce", "dulce"],
  ["comida", "comida"],
];

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function precio(n) {
  const v = Number(n) || 0;
  return v.toFixed(2).replace(".", ",") + " €";
}

function agrupar(productos) {
  const mapa = new Map();
  productos.forEach((p) => {
    const cat = String(p.categoria || "otros").trim().toLowerCase();
    if (!mapa.has(cat)) mapa.set(cat, []);
    mapa.get(cat).push(p);
  });
  // Ordena las categorías por ORDEN_CAT y deja el resto al final (alfabético).
  const claves = [...mapa.keys()];
  const orden = ORDEN_CAT.map((c) => c[0]);
  claves.sort((a, b) => {
    const ia = orden.indexOf(a), ib = orden.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  const nombreDe = (k) => {
    const m = ORDEN_CAT.find((c) => c[0] === k);
    return m ? m[1] : k;
  };
  return claves.map((k) => ({
    clave: k,
    nombre: nombreDe(k),
    items: mapa.get(k).sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "")),
  }));
}

function renderCartaPublicaHTML() {
  const productos = store
    .readAll("productos")
    .filter((p) => p.activo !== false && Number(p.precio_venta) > 0);
  const grupos = agrupar(productos);

  const secciones = grupos
    .map((g) => {
      const items = g.items
        .map((p) => {
          const desc = p.descripcion
            ? `<div class="it-desc">${esc(p.descripcion)}</div>`
            : "";
          return `<div class="item">
            <div class="it-head">
              <span class="it-name">${esc(p.nombre)}</span>
              <span class="it-dots"></span>
              <span class="it-price">${precio(p.precio_venta)}</span>
            </div>
            ${desc}
          </div>`;
        })
        .join("");
      return `<section class="cat">
        <h2>${esc(g.nombre)}</h2>
        ${items}
      </section>`;
    })
    .join("");

  const vacio = grupos.length
    ? ""
    : `<p class="empty">carta en preparación.</p>`;

  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#2A332B">
<title>m de materia · carta</title>
<style>
@font-face{font-family:'Courier Prime';font-style:normal;font-weight:400;font-display:swap;src:url('/fonts/CourierPrime-Regular.woff2') format('woff2');}
@font-face{font-family:'Courier Prime';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/CourierPrime-Bold.woff2') format('woff2');}
:root{
  --bg:#2A332B; --ink:#F5F4EF; --sage:#A7B96E; --muted:#C7CABF;
  --line:rgba(236,234,227,.20); --hair:rgba(236,234,227,.12);
  --font:'Courier Prime','Courier New',monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg);color:var(--ink);font-family:var(--font);-webkit-font-smoothing:antialiased;}
body{padding:34px 22px 60px;line-height:1.5;font-size:15px;}
.wrap{max-width:620px;margin:0 auto;}
/* ── cabecera con imagotipo ||| ── */
header{display:flex;flex-direction:column;align-items:center;text-align:center;padding:12px 0 26px;}
.mark{display:flex;gap:7px;align-items:flex-end;height:40px;margin-bottom:20px;}
.mark i{width:9px;height:40px;background:var(--sage);border-radius:4.5px;display:block;}
h1{font-size:34px;font-weight:700;letter-spacing:.01em;}
.sub{font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:var(--muted);margin-top:8px;}
.rule{height:1.5px;background:var(--ink);margin:8px auto 30px;max-width:620px;}
/* ── categorías ── */
.cat{margin-bottom:34px;}
.cat h2{font-size:13px;font-weight:700;letter-spacing:.26em;text-transform:uppercase;color:var(--sage);
  padding-bottom:10px;margin-bottom:14px;border-bottom:1px solid var(--line);}
.item{padding:11px 0;border-bottom:1px solid var(--hair);}
.item:last-child{border-bottom:none;}
.it-head{display:flex;align-items:baseline;gap:8px;}
.it-name{font-weight:700;font-size:16px;}
.it-dots{flex:1;border-bottom:1px dotted var(--line);transform:translateY(-3px);}
.it-price{font-weight:700;color:var(--sage);white-space:nowrap;font-variant-numeric:tabular-nums;}
.it-desc{font-size:12.5px;color:var(--muted);margin-top:3px;max-width:80%;}
.empty{color:var(--muted);text-align:center;padding:40px 0;}
footer{text-align:center;color:var(--muted);font-size:10px;letter-spacing:.24em;text-transform:uppercase;
  margin-top:36px;padding-top:22px;border-top:1px solid var(--line);}
</style></head>
<body><div class="wrap">
  <header>
    <div class="mark"><i></i><i></i><i></i></div>
    <h1>m de materia</h1>
    <div class="sub">carta</div>
  </header>
  <div class="rule"></div>
  ${secciones}${vacio}
  <footer>el palo · pedregalejo · málaga</footer>
</div></body></html>`;
}

// Página de impresión del QR (para el cartelito de la mesa). Muestra el imagotipo,
// el QR grande hacia la carta y la URL, en la estética de marca.
function renderQRCarterHTML(urlCarta, qrSrc) {
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>m de materia · QR carta</title>
<style>
@font-face{font-family:'Courier Prime';font-weight:400;src:url('/fonts/CourierPrime-Regular.woff2') format('woff2');}
@font-face{font-family:'Courier Prime';font-weight:700;src:url('/fonts/CourierPrime-Bold.woff2') format('woff2');}
:root{--bg:#2A332B;--ink:#F5F4EF;--sage:#A7B96E;--muted:#C7CABF;--font:'Courier Prime','Courier New',monospace;}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg);color:var(--ink);font-family:var(--font);}
.card{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;padding:40px 24px;text-align:center;}
.mark{display:flex;gap:8px;align-items:flex-end;height:44px;}
.mark i{width:10px;height:44px;background:var(--sage);border-radius:5px;display:block;}
h1{font-size:30px;font-weight:700;}
.sub{font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--muted);}
.qr{background:#F5F4EF;padding:18px;border-radius:6px;}
.qr img{display:block;width:260px;height:260px;}
.cta{font-size:14px;letter-spacing:.06em;}
.url{font-size:11px;color:var(--muted);word-break:break-all;max-width:360px;}
@media print{html,body{background:#fff;color:#000;}.qr{background:#fff;} .mark i{background:#2A332B;} h1,.cta{color:#000;} .sub,.url{color:#555;}}
</style></head>
<body><div class="card">
  <div class="mark"><i></i><i></i><i></i></div>
  <h1>m de materia</h1>
  <div class="sub">carta · pide desde la mesa</div>
  <div class="qr"><img src="${esc(qrSrc)}" alt="QR carta"></div>
  <div class="cta">escanea para ver la carta</div>
  <div class="url">${esc(urlCarta)}</div>
</div></body></html>`;
}

module.exports = { renderCartaPublicaHTML, renderQRCarterHTML };
