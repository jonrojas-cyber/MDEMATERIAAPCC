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

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Etiqueta ${etiqueta.codigo_lote}</title>
      <link href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap" rel="stylesheet">
      <style>
        @page { size: 50mm 30mm; margin: 2mm; }
        body{font-family:'Courier Prime',monospace;background:#fff;color:#000;margin:0;padding:0;}
        .etiqueta{width:50mm;padding:2mm;box-sizing:border-box;}
        .nombre{font-size:11px;font-weight:700;text-transform:uppercase;margin-bottom:2px;}
        .linea{font-size:8px;line-height:1.4;}
        .qr{display:block;width:18mm;height:18mm;margin:2mm auto 0;}
        .toolbar{padding:16px;text-align:center;}
        .toolbar button{font-family:'Courier Prime',monospace;font-size:13px;background:#15140F;color:#F2EEE4;border:none;padding:10px 18px;cursor:pointer;}
        @media print { .toolbar{ display:none; } }
      </style>
    </head>
    <body>
      <div class="toolbar"><button onclick="window.print()">Imprimir etiqueta</button></div>
      <div class="etiqueta">
        <div class="nombre">${etiqueta.nombre_preparacion}</div>
        <div class="linea">Lote: ${etiqueta.codigo_lote}</div>
        <div class="linea">Producido: ${new Date(etiqueta.fecha_produccion).toLocaleString("es-ES",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"})}</div>
        <div class="linea">Consumir antes: ${new Date(etiqueta.fecha_consumo_recomendada).toLocaleString("es-ES",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"})}</div>
        <div class="linea">Responsable: ${etiqueta.responsable}</div>
        <div class="linea">Cantidad: ${etiqueta.cantidad_inicial} ${etiqueta.unidad}</div>
        <img class="qr" src="${etiqueta.qr_data_url}" />
      </div>
    </body>
    </html>
  `);
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

// Sirve el frontend estático (single-file app)
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.listen(PORT, () => {
  console.log(`Control M · Producción escuchando en http://localhost:${PORT}`);
});
