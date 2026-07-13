// BÚSQUEDA GENERAL · un solo cuadro que encuentra cualquier cosa por nombre y
// te dice TODO lo relacionado: dónde está (almacén), a qué precio, de qué
// proveedor, y si vive en el laboratorio. No recalcula dinero: lee lo ya
// guardado (coste medio, precios pactados). El equipo no ve importes.

const express = require("express");
const store = require("../data-store");

const router = express.Router();

// Normaliza para comparar: minúsculas y sin acentos.
function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function esAdmin(req) { return req.user && req.user.rol === "admin"; }
function eur(n, u) { return `${(Number(n) || 0).toFixed(4)} €${u ? "/" + u : ""}`; }

router.get("/", (req, res) => {
  const q = norm(req.query.q);
  if (q.length < 1) return res.json({ q: "", total: 0, grupos: [] });
  const admin = esAdmin(req);

  const provs = store.readAll("proveedores");
  const provNombre = (id) => { const p = provs.find((x) => x.id === id); return p ? p.nombre : null; };

  // ── Materia (nombre) → dónde está, stock, proveedor y coste (admin) ──
  const materias = store.readAll("materias")
    .filter((m) => norm(m.nombre).includes(q))
    .slice(0, 24)
    .map((m) => ({
      tipo: "materia", id: m.id, nombre: m.nombre,
      detalle: [
        m.ubicacion ? `almacén: ${m.ubicacion}` : null,
        `stock ${m.disponibilidad_actual != null ? m.disponibilidad_actual : 0} ${m.unidad || ""}`.trim(),
        provNombre(m.proveedor_id) ? `prov: ${provNombre(m.proveedor_id)}` : null,
      ].filter(Boolean).join(" · "),
      precio: admin && m.coste_medio != null ? eur(m.coste_medio, m.unidad || "ud") : null,
      handler: "verMateria", args: m.id,
    }));

  // ── Precios · artículos catalogados por proveedor (nombre del artículo) ──
  const articulos = [];
  provs.forEach((p) => {
    (p.productos_asociados || []).forEach((a) => {
      const nom = a.nombre || a.materia_nombre || "";
      if (nom && norm(nom).includes(q)) {
        articulos.push({
          tipo: "precio", id: p.id, nombre: nom,
          detalle: `proveedor: ${p.nombre}`,
          precio: admin && a.precio != null ? eur(a.precio) : null,
          handler: "irA_productosProveedor", args: p.id,
        });
      }
    });
  });

  // ── Proveedores (por nombre) ──
  const proveedores = provs
    .filter((p) => norm(p.nombre).includes(q))
    .slice(0, 12)
    .map((p) => ({
      tipo: "proveedor", id: p.id, nombre: p.nombre,
      detalle: p.whatsapp ? `whatsapp · ${p.whatsapp}` : "proveedor",
      handler: "irA_productosProveedor", args: p.id,
    }));

  // ── Laboratorio · ingredientes, cordiales y bebidas ──
  const lab = [];
  store.readAll("mbds_ingredientes").filter((i) => norm(i.nombre).includes(q)).slice(0, 12)
    .forEach((i) => lab.push({
      tipo: "lab", subtipo: "ingrediente", id: i.id, nombre: i.nombre,
      detalle: [i.categoria, i.funcion_sensorial].filter(Boolean).join(" · ") || "biblioteca sensorial",
      precio: admin && i.coste != null ? eur(i.coste) : null,
      handler: "irA_mbdsBiblioteca", args: null,
    }));
  store.readAll("mbds_cordiales").filter((c) => norm(c.nombre).includes(q)).slice(0, 12)
    .forEach((c) => lab.push({ tipo: "lab", subtipo: "cordial", id: c.id, nombre: c.nombre, detalle: "cordial", handler: "irA_mbdsCordiales", args: null }));
  store.readAll("mbds_bebidas").filter((b) => norm(b.nombre).includes(q)).slice(0, 12)
    .forEach((b) => lab.push({ tipo: "lab", subtipo: "bebida", id: b.id, nombre: b.nombre, detalle: [b.familia, b.version].filter(Boolean).join(" · ") || "bebida", handler: "verBebidaMBDS", args: b.id }));

  const grupos = [
    { clave: "materia", titulo: "Materia · almacén", items: materias },
    { clave: "precio", titulo: "Precios · proveedores", items: articulos.slice(0, 24) },
    { clave: "proveedor", titulo: "Proveedores", items: proveedores },
    { clave: "lab", titulo: "Laboratorio", items: lab },
  ].filter((g) => g.items.length);

  const total = grupos.reduce((n, g) => n + g.items.length, 0);
  res.json({ q: req.query.q, total, grupos });
});

module.exports = router;
