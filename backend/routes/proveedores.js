const express = require("express");
const store = require("../data-store");

const router = express.Router();

// Cuerpo grande: admite la foto del proveedor (base64).
const jsonGrande = express.json({ limit: "8mb" });

const CATEGORIAS = ["Café", "Matcha", "Pan", "Bollería", "Packaging", "Leche", "Fruta y verdura", "Limpieza", "Otros"];
const ESTADOS = ["Activo", "Pausado", "Sustituido"];

function decorate(p, materias) {
  return {
    ...p,
    productos_nombres: (p.productos_asociados || []).map((id) => {
      const m = materias.find((x) => x.id === id);
      return m ? m.nombre : id;
    }),
  };
}

// Versión ligera para listados (sin la foto en base64, que es pesada).
function slim(p) {
  const { foto_url, ...resto } = p;
  return { ...resto, tiene_foto: !!foto_url };
}

router.get("/", (req, res) => {
  const materias = store.readAll("materias");
  const proveedores = store.readAll("proveedores").map((p) => slim(decorate(p, materias)));
  res.json(proveedores);
});

router.get("/meta", (req, res) => {
  res.json({ categorias: CATEGORIAS, estados: ESTADOS });
});

router.get("/:id", (req, res) => {
  const proveedor = store.findById("proveedores", req.params.id);
  if (!proveedor) return res.status(404).json({ error: "Proveedor no encontrado" });
  res.json(decorate(proveedor, store.readAll("materias")));
});

// Campos que el usuario puede fijar al crear/editar.
function camposDe(body) {
  const c = {};
  const str = (k) => { if (body[k] != null) c[k] = String(body[k]).trim(); };
  ["nombre", "contacto", "telefono", "email", "direccion", "categoria", "estado", "notas", "foto_url"].forEach(str);
  if (body.dias_reparto != null && Array.isArray(body.dias_reparto)) c.dias_reparto = body.dias_reparto;
  if (body.whatsapp != null) c.whatsapp = String(body.whatsapp).trim();
  if (c.categoria && !CATEGORIAS.includes(c.categoria)) c.categoria = "Otros";
  if (c.estado && !ESTADOS.includes(c.estado)) c.estado = "Activo";
  return c;
}

// Crear proveedor a mano.
router.post("/", jsonGrande, (req, res) => {
  const datos = camposDe(req.body || {});
  if (!datos.nombre) return res.status(400).json({ error: "Indica el nombre del proveedor." });
  const proveedor = {
    id: store.nextId("prov", "proveedores"),
    nombre: datos.nombre,
    contacto: datos.contacto || "",
    telefono: datos.telefono || "",
    email: datos.email || "",
    direccion: datos.direccion || "",
    categoria: datos.categoria || "Otros",
    estado: datos.estado || "Activo",
    notas: datos.notas || "",
    foto_url: datos.foto_url || null,
    whatsapp: datos.whatsapp || datos.telefono || "",
    dias_reparto: datos.dias_reparto || [],
    productos_asociados: [],
    creado_en: new Date().toISOString(),
  };
  store.insert("proveedores", proveedor);
  res.status(201).json(proveedor);
});

// Editar proveedor.
router.put("/:id", jsonGrande, (req, res) => {
  const existe = store.findById("proveedores", req.params.id);
  if (!existe) return res.status(404).json({ error: "Proveedor no encontrado" });
  const datos = camposDe(req.body || {});
  if (datos.nombre === "") return res.status(400).json({ error: "El nombre no puede quedar vacío." });
  const actualizado = store.update("proveedores", req.params.id, datos);
  res.json(actualizado);
});

module.exports = router;
