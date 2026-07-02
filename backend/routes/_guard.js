// Guard de defensa en profundidad: aunque el middleware `requerido` ya bloquea a
// los no-admin en los segmentos financieros, cada ruta lo reafirma para no
// exponer dinero por error si cambia el mapa de permisos.
function soloAdmin(req, res) {
  if (!req.user || req.user.rol !== "admin") {
    res.status(403).json({ error: "Solo el propietario tiene acceso a esta sección." });
    return false;
  }
  return true;
}
module.exports = { soloAdmin };
