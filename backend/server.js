const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 4001;

app.use(cors());
app.use(express.json());

// Rutas de la API
app.use("/api/inicio", require("./routes/inicio"));
app.use("/api/materias", require("./routes/materias"));
app.use("/api/recetas", require("./routes/recetas"));
app.use("/api/lotes", require("./routes/lotes"));
app.use("/api/preparaciones", require("./routes/preparaciones"));
app.use("/api/revisiones", require("./routes/revisiones"));
app.use("/api/ajustes", require("./routes/ajustes"));
app.use("/api/proveedores", require("./routes/proveedores"));
app.use("/api/recepciones", require("./routes/recepciones"));
app.use("/api/etiquetas", require("./routes/etiquetas"));
app.use("/api/pagos", require("./routes/pagos"));

// Vista imprimible de etiqueta — pensada para abrirse en una pestaña y
// lanzar la impresión del navegador (Ctrl+P / botón), dimensionada para
// etiqueta térmica compacta. La Phomemo D520BT funciona como impresora del
// sistema una vez emparejada; si Windows la reconoce como impresora,
// aparece directamente en el diálogo de impresión.
app.get("/etiqueta/:id", (req, res) => {
  const store = require("./data-store");
  const etiqueta = store.findById("etiquetas", req.params.id);
  if (!etiqueta) return res.status(404).send("<h1>Etiqueta no encontrada</h1>");

  const prod = new Date(etiqueta.fecha_produccion).toLocaleString("es-ES",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"});
  const cons = new Date(etiqueta.fecha_consumo_recomendada).toLocaleString("es-ES",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"});

  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Etiqueta ${etiqueta.codigo_lote}</title>
<link href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap" rel="stylesheet">
<style>
  @page { size: 62mm 40mm; margin: 0; }
  *{ box-sizing:border-box; margin:0; padding:0; }
  body{ font-family:'Courier Prime',monospace; background:#fff; color:#000; }

  .toolbar{
    padding:20px 24px;
    display:flex; align-items:center; gap:12px;
    border-bottom:1px solid #E0DDD4;
  }
  .toolbar button{
    font-family:'Courier Prime',monospace;font-size:13px;
    background:#111009;color:#F0EBE0;border:none;padding:10px 20px;cursor:pointer;
  }
  .toolbar .info{ font-size:11px; color:#888; }
  @media print { .toolbar{ display:none; } }

  /* ETIQUETA */
  .label{
    width:62mm; height:40mm;
    padding:3mm;
    display:flex; flex-direction:row; gap:2mm;
  }
  .label-left{
    flex:1;
    display:flex; flex-direction:column; justify-content:space-between;
    overflow:hidden;
  }
  .label-right{
    width:22mm; flex-shrink:0;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
  }
  .l-nombre{
    font-size:9px; font-weight:700; text-transform:uppercase;
    letter-spacing:0.04em; line-height:1.2;
    border-bottom:0.5pt solid #000; padding-bottom:1.5mm; margin-bottom:1.5mm;
  }
  .l-rows{ display:flex; flex-direction:column; gap:0.8mm; }
  .l-row{ display:flex; flex-direction:column; }
  .l-key{ font-size:5.5px; text-transform:uppercase; letter-spacing:0.08em; color:#555; line-height:1; }
  .l-val{ font-size:7px; font-weight:700; line-height:1.2; }
  .l-lote{ font-size:6px; color:#555; margin-top:auto; padding-top:1mm; }
  .qr{ width:22mm; height:22mm; display:block; }
  .qr-label{ font-size:5px; text-align:center; color:#888; margin-top:1mm; letter-spacing:0.05em; }
</style>
</head>
<body>
<div class="toolbar">
  <button onclick="window.print()">Imprimir etiqueta</button>
  <span class="info">${etiqueta.codigo_lote} · ${etiqueta.nombre_preparacion}</span>
</div>
<div class="label">
  <div class="label-left">
    <div class="l-nombre">${etiqueta.nombre_preparacion}</div>
    <div class="l-rows">
      <div class="l-row">
        <span class="l-key">Producido</span>
        <span class="l-val">${prod}</span>
      </div>
      <div class="l-row">
        <span class="l-key">Consumir antes de</span>
        <span class="l-val">${cons}</span>
      </div>
      <div class="l-row">
        <span class="l-key">Cantidad</span>
        <span class="l-val">${etiqueta.cantidad_inicial} ${etiqueta.unidad}</span>
      </div>
      <div class="l-row">
        <span class="l-key">Responsable</span>
        <span class="l-val">${etiqueta.responsable}</span>
      </div>
    </div>
    <div class="l-lote">${etiqueta.codigo_lote}</div>
  </div>
  <div class="label-right">
    <img class="qr" src="${etiqueta.qr_data_url}" />
    <div class="qr-label">ESCANEAR</div>
  </div>
</div>
</body>
</html>`);
});
app.get("/lote/:id", (req, res) => {
  const store = require("./data-store");
  const lote = store.findById("lotes", req.params.id);
  if (!lote) return res.status(404).send("<h1>Lote no encontrado</h1>");

  const receta = store.findById("recetas", lote.receta_id);
  const ahora = new Date();
  const horasRestantes = Math.round((new Date(lote.caduca_en) - ahora) / (1000 * 60 * 60) * 10) / 10;
  const ajustes = store.readAll("ajustes").filter((a) => a.objetivo_id === lote.id);

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${lote.codigo} · Control M</title>
      <link href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap" rel="stylesheet">
      <style>
        body{font-family:'Courier Prime',monospace;background:#F2EEE4;color:#15140F;padding:24px;max-width:480px;margin:0 auto;}
        h1{font-size:18px;margin-bottom:4px;}
        .meta{font-size:12px;color:#7E7A66;margin-bottom:20px;}
        .fila{display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid #D9D3C2;font-size:13px;}
        .fila:first-of-type{border-top:none;}
        .estado{display:inline-block;margin-top:14px;padding:6px 12px;background:#E4E5D8;border-left:3px solid #6B7353;font-size:12px;}
      </style>
    </head>
    <body>
      <h1>${lote.codigo}</h1>
      <div class="meta">${receta ? receta.nombre : lote.receta_id}</div>
      <div class="fila"><span>Producido</span><span>${new Date(lote.producido_en).toLocaleString("es-ES")}</span></div>
      <div class="fila"><span>Consumir antes de</span><span>${new Date(lote.caduca_en).toLocaleString("es-ES")}</span></div>
      <div class="fila"><span>Cantidad inicial</span><span>${lote.cantidad_inicial} g</span></div>
      <div class="fila"><span>Cantidad restante</span><span>${lote.cantidad_restante} g</span></div>
      <div class="fila"><span>Ubicación</span><span>${lote.ubicacion}</span></div>
      <div class="fila"><span>Horas restantes</span><span>${horasRestantes > 0 ? horasRestantes + " h" : "Fuera de plazo"}</span></div>
      <div class="estado">${lote.estado}</div>
      ${ajustes.length ? `<div class="meta" style="margin-top:18px;">Ajustes registrados: ${ajustes.length}</div>` : ""}
    </body>
    </html>
  `);
});

app.get("/api/salud", (req, res) => {
  res.json({ estado: "Control M · Producción en marcha", hora: new Date().toISOString() });
});

// Sirve el frontend estático desde /public (compatible con Render)
app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Control M · Producción escuchando en http://localhost:${PORT}`);
});
