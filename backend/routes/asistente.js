// Asistente de voz / chat de Control M. Un AGENTE de Claude que opera SOBRE LA PROPIA
// API de la app: puede CONSULTAR cualquier dato y EJECUTAR acciones seguras, siempre
// COMO EL USUARIO que habla. Las llamadas internas reusan la misma cadena de auth y el
// guardián de economía, así que el rol y la regla "el equipo nunca ve dinero" se aplican
// solos: si el equipo pide el P&L, la llamada interna recibe 403 y el agente lo explica.
//
// Reusa @anthropic-ai/sdk + ANTHROPIC_API_KEY (lo mismo que el lector de albaranes). Si
// no hay clave, la app sigue: el asistente responde "no configurado" y no rompe nada.

const express = require("express");
const router = express.Router();

let Anthropic = null;
try { Anthropic = require("@anthropic-ai/sdk"); } catch (e) { Anthropic = null; }

// Sonnet: buen razonamiento y herramientas, rápido y barato para un asistente interactivo.
const MODELO = process.env.ASISTENTE_MODEL || "claude-sonnet-4-6";
const MAX_PASOS = 8; // tope de iteraciones de herramientas por pregunta (evita bucles)

function disponible() { return !!(Anthropic && process.env.ANTHROPIC_API_KEY); }

// ── Seguridad del puente interno ─────────────────────────────────────────────
// El agente solo puede tocar la propia API (/api/*), nunca otro host ni el propio
// asistente (recursión) ni el login. DELETE jamás. Las acciones destructivas por
// POST/PUT están vetadas. Todo lo demás, el rol real del usuario lo limita.
const PREFIJO = "/api/";
const RUTAS_VETADAS = [
  "/api/asistente",   // nada de recursión
  "/api/auth",        // nada de tocar sesión/PIN
];
// Acciones destructivas o masivas: fuera del alcance del asistente (se hacen a mano).
const ACCION_VETADA = /(eliminar|borrar|limpieza|backup|restore|restaurar|importar|purgar|reset|migrac)/i;

function rutaInterna(ruta) {
  // Devuelve la ruta saneada (solo path + query de /api/*) o null si no es válida.
  if (typeof ruta !== "string") return null;
  let r = ruta.trim();
  if (!r.startsWith(PREFIJO)) return null;        // solo la propia API
  if (r.includes("://") || r.startsWith("//")) return null; // nada de host externo
  if (/\s/.test(r)) return null;
  // Normaliza: quita fragmentos y dobles barras sospechosas.
  if (r.includes("..")) return null;
  const base = r.split("?")[0];
  if (RUTAS_VETADAS.some((v) => base === v || base.startsWith(v + "/"))) return null;
  return r;
}

function accionPermitida(metodo, ruta) {
  const m = String(metodo || "").toUpperCase();
  if (m !== "POST" && m !== "PUT") return { ok: false, motivo: "Solo puedo hacer acciones de alta/edición (no borrados)." };
  const base = String(ruta || "").split("?")[0];
  if (ACCION_VETADA.test(base)) return { ok: false, motivo: "Esa acción es sensible y hay que hacerla a mano desde su pantalla." };
  return { ok: true };
}

// Llama a la propia API por HTTP interno, reusando el token del usuario (mismo rol y
// filtrado de dinero que cualquier petición suya). Devuelve { status, data }.
async function llamarApi({ metodo, ruta, cuerpo, authorization }) {
  const r = rutaInterna(ruta);
  if (!r) return { status: 400, data: { error: "Ruta no permitida." } };
  const base = `http://127.0.0.1:${process.env.PORT || 4001}`;
  const opts = { method: String(metodo || "GET").toUpperCase(), headers: {} };
  if (authorization) opts.headers.Authorization = authorization;
  if (opts.method !== "GET" && cuerpo != null) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
  }
  try {
    const resp = await fetch(base + r, opts);
    let data = null;
    const txt = await resp.text();
    try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
    return { status: resp.status, data };
  } catch (e) {
    return { status: 502, data: { error: "No se pudo consultar: " + (e.message || "error interno") } };
  }
}

// Recorta un resultado grande para no inflar el contexto del modelo.
function recorta(x, max = 6000) {
  let s = typeof x === "string" ? x : JSON.stringify(x);
  if (s == null) s = "null";
  return s.length > max ? s.slice(0, max) + `\n…(recortado, ${s.length} caracteres)` : s;
}

// ── Herramientas que ve el modelo ────────────────────────────────────────────
const TOOLS = [
  {
    name: "consultar_datos",
    description:
      "Consulta (GET) cualquier dato de la app por su ruta de API para responder una pregunta. " +
      "Devuelve el JSON de ese endpoint. Ejemplos de rutas útiles: " +
      "/api/cuenta-resultados (P&L del mes, incluye pronóstico de cierre), /api/financiero (día·mes·año con EBITDA), " +
      "/api/cierre-mes (informe de cierre mensual), /api/mermas/resumen?rango=mes (coste de mermas), " +
      "/api/mermas?hoy=1 (mermas de hoy), /api/pedidos (pedidos y propuestas), /api/pedidos/sugerencias (qué hay que pedir), " +
      "/api/materias (almacén/stock), /api/proveedores, /api/ventas, /api/dashboard (portada de dirección), " +
      "/api/business-health, /api/auditoria-foodcost (food cost real). Si un endpoint devuelve 403, es que el rol del " +
      "usuario no puede verlo (datos de dinero son solo de dirección): díselo con naturalidad, no inventes el dato.",
    input_schema: {
      type: "object",
      properties: { ruta: { type: "string", description: "Ruta de API que empieza por /api/ (puede llevar ?query)." } },
      required: ["ruta"],
    },
  },
  {
    name: "ejecutar_accion",
    description:
      "Ejecuta una acción de alta o edición en la app (POST o PUT) EN NOMBRE DEL USUARIO. Úsalo para, por ejemplo, " +
      "apuntar una merma (POST /api/mermas con {ref|nombre, cantidad, unidad, motivo}) o crear un pedido/propuesta " +
      "(POST /api/pedidos con {proveedor_id, lineas}). ANTES de ejecutar, confirma con el usuario lo que vas a hacer y " +
      "pásalo con confirmado=true solo cuando el usuario lo haya confirmado (o la orden sea inequívoca). Antes de apuntar " +
      "una merma, busca el producto con consultar_datos (p. ej. /api/materias o /api/mermas/motivos para el motivo exacto). " +
      "No puedo borrar ni hacer acciones masivas/sensibles.",
    input_schema: {
      type: "object",
      properties: {
        metodo: { type: "string", enum: ["POST", "PUT"] },
        ruta: { type: "string", description: "Ruta de API (/api/…)." },
        cuerpo: { type: "object", description: "Cuerpo JSON de la acción." },
        confirmado: { type: "boolean", description: "true solo si el usuario ya confirmó la acción." },
        resumen: { type: "string", description: "Resumen en una frase de lo que hace la acción (para confirmar)." },
      },
      required: ["metodo", "ruta", "confirmado"],
    },
  },
];

function sistema(rol) {
  const esAdmin = rol === "admin";
  return (
    "Eres el asistente de voz de «m de materia», una cafetería de especialidad y matcha en Málaga. " +
    "Hablas español, cercano y MUY conciso (respuestas de voz: 1-3 frases). Ayudas con la gestión diaria del negocio " +
    "usando las herramientas para leer datos y ejecutar acciones en la propia app. " +
    "El usuario es " + (esAdmin ? "DIRECCIÓN (acceso total, incluido el dinero)." : "EQUIPO (NO ve coste, precio ni margen: esos datos son solo de dirección).") + " " +
    "Reglas: 1) No inventes datos ni importes: si no lo sabes, consúltalo con una herramienta; si un endpoint da 403, dilo " +
    "(es de dirección) y no te lo inventes. 2) Antes de ejecutar una acción que cambie algo, resume lo que harás y pide " +
    "confirmación; ejecuta con confirmado=true solo tras el 'sí' del usuario (o si la orden ya es explícita e inequívoca, " +
    "p. ej. 'apunta una merma de 1 croissant por caída'). 3) Para apuntar una merma, primero localiza el producto y el " +
    "motivo correctos con consultar_datos (/api/materias, /api/mermas/motivos). 4) Da cifras claras y redondeadas. " +
    "5) Si algo no se puede hacer por voz (borrados, acciones sensibles, hacer una foto de albarán), dilo y explica dónde se hace."
  );
}

// Convierte el historial del cliente [{rol,texto}] a mensajes de Claude.
function aMensajes(historial, texto) {
  const msgs = [];
  (Array.isArray(historial) ? historial : []).slice(-10).forEach((h) => {
    const role = h && h.rol === "assistant" ? "assistant" : "user";
    const t = h && typeof h.texto === "string" ? h.texto : "";
    if (t) msgs.push({ role, content: t });
  });
  msgs.push({ role: "user", content: String(texto || "") });
  return msgs;
}

router.post("/", express.json({ limit: "1mb" }), async (req, res) => {
  if (!disponible()) {
    return res.status(503).json({ error: "El asistente de voz no está configurado en este entorno (falta ANTHROPIC_API_KEY).", code: "IA_NO_CONFIG" });
  }
  const texto = (req.body && req.body.texto) || "";
  if (!String(texto).trim()) return res.status(400).json({ error: "Dime qué necesitas." });

  const authorization = req.headers.authorization || "";
  const rol = (req.user && req.user.rol) || "equipo";
  const client = new Anthropic({ timeout: 60000, maxRetries: 1 });
  const messages = aMensajes(req.body.historial, texto);
  const pasos = []; // traza de lo que hizo (para la UI y la auditoría ligera)

  try {
    for (let i = 0; i < MAX_PASOS; i++) {
      const resp = await client.messages.create({
        model: MODELO,
        max_tokens: 1200,
        system: sistema(rol),
        tools: TOOLS,
        messages,
      });
      messages.push({ role: "assistant", content: resp.content });

      if (resp.stop_reason !== "tool_use") {
        const txt = (resp.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        return res.json({ respuesta: txt || "Hecho.", pasos });
      }

      // Ejecuta cada herramienta pedida y devuelve los resultados al modelo.
      const toolResults = [];
      for (const b of resp.content || []) {
        if (b.type !== "tool_use") continue;
        let out;
        if (b.name === "consultar_datos") {
          const r = await llamarApi({ metodo: "GET", ruta: (b.input || {}).ruta, authorization });
          pasos.push({ tipo: "consulta", ruta: (b.input || {}).ruta, status: r.status });
          out = recorta(r.data);
        } else if (b.name === "ejecutar_accion") {
          const inp = b.input || {};
          const permit = accionPermitida(inp.metodo, inp.ruta);
          if (!permit.ok) {
            out = JSON.stringify({ ok: false, motivo: permit.motivo });
          } else if (!inp.confirmado) {
            // El modelo debe pedir confirmación al usuario antes de actuar.
            out = JSON.stringify({ necesita_confirmacion: true, resumen: inp.resumen || "", nota: "Pide confirmación al usuario y repite con confirmado=true." });
          } else {
            const r = await llamarApi({ metodo: inp.metodo, ruta: inp.ruta, cuerpo: inp.cuerpo, authorization });
            pasos.push({ tipo: "accion", metodo: inp.metodo, ruta: inp.ruta, status: r.status });
            out = recorta(r.data);
          }
        } else {
          out = JSON.stringify({ error: "Herramienta desconocida." });
        }
        toolResults.push({ type: "tool_result", tool_use_id: b.id, content: out });
      }
      messages.push({ role: "user", content: toolResults });
    }
    // Se agotaron los pasos sin respuesta final.
    return res.json({ respuesta: "He consultado varias cosas pero no he podido cerrar la respuesta. ¿Puedes concretar un poco más?", pasos });
  } catch (e) {
    const msg = e && e.message ? e.message : "";
    if (/timeout|ETIMEDOUT|ECONNRESET|aborted/i.test(msg)) {
      return res.status(504).json({ error: "El asistente tardó demasiado. Inténtalo otra vez." });
    }
    return res.status(500).json({ error: "El asistente no pudo responder: " + (msg || "error") });
  }
});

module.exports = router;
// Exports para pruebas unitarias (seguridad del puente, sin llamar al modelo).
module.exports.disponible = disponible;
module.exports.rutaInterna = rutaInterna;
module.exports.accionPermitida = accionPermitida;
