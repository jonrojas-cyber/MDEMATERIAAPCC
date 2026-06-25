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

app.get("/api/salud", (req, res) => {
  res.json({ estado: "Control M · Producción en marcha", hora: new Date().toISOString() });
});

// Sirve el frontend estático (single-file app)
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.listen(PORT, () => {
  console.log(`Control M · Producción escuchando en http://localhost:${PORT}`);
});
