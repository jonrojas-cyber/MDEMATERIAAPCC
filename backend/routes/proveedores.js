const express = require("express");
const store = require("../data-store");

const router = express.Router();

// Cuerpo grande: admite la foto del proveedor (base64).
const jsonGrande = express.json({ limit: "8mb" });

const CATEGORIAS = ["Café", "Matcha", "Pan", "Panadería", "Bollería", "Charcutería", "Packaging", "Leche", "Fruta y verdura", "Limpieza", "Otros"];
const ESTADOS = ["Activo", "Pausado", "Sustituido"];
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

// Datos sensibles (pago/banco): solo el propietario (admin) los ve. El equipo
// (rol `equipo`) nunca ve forma de pago ni Bizum/IBAN — regla de negocio.
const CAMPOS_SENSIBLES = ["forma_pago", "bizum", "bizum_tel", "iban", "datos_bancarios"];
function esAdmin(req) { return !!(req.user && req.user.rol === "admin"); }
function filtrarSensibles(p, req) {
  if (esAdmin(req)) return p;
  const out = { ...p };
  CAMPOS_SENSIBLES.forEach((k) => { delete out[k]; });
  return out;
}

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
  const proveedores = store.readAll("proveedores").map((p) => filtrarSensibles(slim(decorate(p, materias)), req));
  res.json(proveedores);
});

router.get("/meta", (req, res) => {
  res.json({ categorias: CATEGORIAS, estados: ESTADOS, dias: DIAS, es_admin: esAdmin(req) });
});

router.get("/:id", (req, res) => {
  const proveedor = store.findById("proveedores", req.params.id);
  if (!proveedor) return res.status(404).json({ error: "Proveedor no encontrado" });
  res.json(filtrarSensibles(decorate(proveedor, store.readAll("materias")), req));
});

// Campos que el usuario puede fijar al crear/editar.
function camposDe(body, req) {
  const c = {};
  const str = (k) => { if (body[k] != null) c[k] = String(body[k]).trim(); };
  [
    "nombre", "razon_social", "contacto", "telefono", "telefono_pedidos", "email",
    "direccion", "cif", "nif_cif", "categoria", "estado", "notas", "observaciones",
    "hora_limite", "pedido_minimo", "transporte", "foto_url",
  ].forEach(str);
  if (Array.isArray(body.dias_reparto)) c.dias_reparto = body.dias_reparto.filter((d) => DIAS.includes(d));
  if (Array.isArray(body.dias_pedido)) c.dias_pedido = body.dias_pedido.filter((d) => DIAS.includes(d));
  if (Array.isArray(body.dias_entrega)) c.dias_entrega = body.dias_entrega.filter((d) => DIAS.includes(d));
  if (body.whatsapp != null) c.whatsapp = String(body.whatsapp).trim();
  // Campos sensibles: solo un admin puede fijarlos (el equipo ni los envía ni los edita).
  if (esAdmin(req)) CAMPOS_SENSIBLES.forEach((k) => { if (body[k] != null) c[k] = String(body[k]).trim(); });
  if (c.categoria && !CATEGORIAS.includes(c.categoria)) c.categoria = "Otros";
  if (c.estado && !ESTADOS.includes(c.estado)) c.estado = "Activo";
  return c;
}

// Crear proveedor a mano.
router.post("/", jsonGrande, (req, res) => {
  const datos = camposDe(req.body || {}, req);
  if (!datos.nombre) return res.status(400).json({ error: "Indica el nombre del proveedor." });
  const proveedor = {
    id: store.nextId("prov", "proveedores"),
    nombre: datos.nombre,
    razon_social: datos.razon_social || "",
    contacto: datos.contacto || "",
    telefono: datos.telefono || "",
    telefono_pedidos: datos.telefono_pedidos || "",
    email: datos.email || "",
    direccion: datos.direccion || "",
    cif: datos.cif || "",
    nif_cif: datos.nif_cif || datos.cif || "",
    categoria: datos.categoria || "Otros",
    estado: datos.estado || "Activo",
    notas: datos.notas || "",
    observaciones: datos.observaciones || "",
    hora_limite: datos.hora_limite || "",
    pedido_minimo: datos.pedido_minimo || "",
    transporte: datos.transporte || "",
    forma_pago: datos.forma_pago || "",
    bizum: datos.bizum || "",
    bizum_tel: datos.bizum_tel || "",
    foto_url: datos.foto_url || null,
    whatsapp: datos.whatsapp || datos.telefono || "",
    dias_reparto: datos.dias_reparto || [],
    dias_pedido: datos.dias_pedido || [],
    dias_entrega: datos.dias_entrega || [],
    productos_asociados: [],
    creado_en: new Date().toISOString(),
  };
  store.insert("proveedores", proveedor);
  res.status(201).json(filtrarSensibles(proveedor, req));
});

// Editar proveedor.
router.put("/:id", jsonGrande, (req, res) => {
  const existe = store.findById("proveedores", req.params.id);
  if (!existe) return res.status(404).json({ error: "Proveedor no encontrado" });
  const datos = camposDe(req.body || {}, req);
  if (datos.nombre === "") return res.status(400).json({ error: "El nombre no puede quedar vacío." });
  const actualizado = store.update("proveedores", req.params.id, datos);
  res.json(filtrarSensibles(actualizado, req));
});

module.exports = router;
