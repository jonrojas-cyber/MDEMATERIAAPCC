const express = require("express");
const store = require("../data-store");
const { costePorUnidad, tamanosLote } = require("../costing");

const router = express.Router();

function horasRestantes(lote) {
  return (new Date(lote.caduca_en).getTime() - Date.now()) / (1000 * 60 * 60);
}

router.get("/", (req, res) => {
  const materias = store.readAll("materias");
  const recetas = store.readAll("recetas");
  const lotes = store.readAll("lotes");
  const revisiones = store.readAll("revisiones");
  const proveedores = store.readAll("proveedores");
  const preparaciones = store.readAll("preparaciones");

  const lotesVigentes = lotes.filter((l) => horasRestantes(l) > 0);

  const preparar = recetas
    .map((r) => {
      const vigentesDeReceta = lotesVigentes.filter((l) => l.receta_id === r.id);
      const totalRestante = vigentesDeReceta.reduce((sum, l) => sum + l.cantidad_restante, 0);
      const umbral = r.resultado_base * 0.4;
      if (totalRestante >= umbral) return null;
      const opciones = tamanosLote(r);
      return {
        receta_id: r.id,
        nombre: r.nombre,
        disponible_ahora: totalRestante,
        unidad: r.unidad,
        opciones_tamano: opciones.map((t) => ({
          cantidad: t,
          coste_estimado: Math.round(costePorUnidad(r) * t * 100) / 100,
        })),
      };
    })
    .filter(Boolean);

  const pedir = materias
    .filter((m) => m.disponibilidad_actual <= m.stock_minimo)
    .map((m) => {
      const proveedor = proveedores.find((p) => p.id === m.proveedor_id);
      const cantidadSugerida = Math.round((m.stock_ideal - m.disponibilidad_actual) * 100) / 100;
      const mensaje = `Hola ${proveedor ? proveedor.contacto : ""}, necesitamos ${cantidadSugerida} ${m.unidad} de ${m.nombre} para M de Materia.`;
      return {
        materia_id: m.id,
        nombre: m.nombre,
        disponibilidad_actual: m.disponibilidad_actual,
        unidad: m.unidad,
        cantidad_sugerida: cantidadSugerida,
        valor_stock_actual: Math.round(m.disponibilidad_actual * m.coste_medio * 100) / 100,
        proveedor: proveedor ? proveedor.nombre : "Sin proveedor asignado",
        whatsapp: proveedor ? proveedor.whatsapp.replace(/[^0-9+]/g, "") : null,
        mensaje_whatsapp: mensaje,
      };
    });

  const hoy = new Date().toDateString();
  const revisar = revisiones.filter(
    (r) => r.estado !== "Correcto" && new Date(r.fecha).toDateString() === hoy
  );

  const lotesAtencion = lotes
    .filter((l) => {
      const hr = horasRestantes(l);
      return l.estado === "Requiere atención" || l.estado === "Priorizar uso" || (hr > 0 && hr <= 6) || hr <= 0;
    })
    .map((l) => {
      const receta = recetas.find((r) => r.id === l.receta_id);
      return {
        id: l.id,
        codigo: l.codigo,
        nombre: receta ? receta.nombre : l.receta_id,
        estado: l.estado,
        ubicacion: l.ubicacion,
        cantidad_restante: l.cantidad_restante,
        horas_restantes: Math.round(horasRestantes(l) * 10) / 10,
        caducado: horasRestantes(l) <= 0,
      };
    })
    .filter((l) => l.estado !== "Fuera de servicio");

  const enCurso = preparaciones
    .filter((p) => p.estado === "En curso")
    .map((p) => {
      const receta = recetas.find((r) => r.id === p.receta_id);
      return {
        id: p.id,
        nombre: receta ? receta.nombre : p.receta_id,
        cantidad_objetivo: p.cantidad_objetivo,
        unidad: receta ? receta.unidad : "",
        responsable: p.responsable,
        creada_en: p.creada_en,
      };
    });

  let estadoServicio = "Servicio en orden";
  if (revisar.length > 0 || lotesAtencion.length > 0) estadoServicio = "Requiere atención antes del próximo servicio";
  if (pedir.length >= 3) estadoServicio = "Disponibilidad baja en varias materias";

  res.json({
    estado_servicio: estadoServicio,
    preparar,
    pedir,
    revisar,
    lotes_a_vigilar: lotesAtencion,
    en_curso: enCurso,
  });
});

module.exports = router;
