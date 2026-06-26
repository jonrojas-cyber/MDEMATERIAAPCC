// OCR de albaranes con Claude (visión). Lee la foto de un albarán y extrae
// proveedor, líneas e importe en datos estructurados para rellenar la recepción.
//
// El emparejado de cada línea con la materia del almacén se hace FUERA de aquí
// (en la ruta /escanear), para no recargar la lectura ni empeorar el OCR.
//
// Requiere ANTHROPIC_API_KEY en el entorno. Si no está configurada, la app sigue
// funcionando: la pantalla de recepción permite adjuntar la foto y rellenar a mano.

let Anthropic = null;
try {
  Anthropic = require("@anthropic-ai/sdk");
} catch (e) {
  Anthropic = null; // SDK no instalado: modo sin OCR
}

// Modelo de lectura. Por defecto Sonnet: visión muy buena para albaranes y
// MUCHO más rápido que Opus, lo que evita que la petición se corte por tiempo
// en servidores modestos (Render). Se puede cambiar con OCR_MODEL.
const MODELO = process.env.OCR_MODEL || "claude-sonnet-4-6";

function disponible() {
  return !!(Anthropic && process.env.ANTHROPIC_API_KEY);
}

// Esquema de salida estructurada para el albarán.
const ESQUEMA = {
  type: "object",
  properties: {
    proveedor: { type: "string", description: "Nombre del proveedor/emisor del albarán" },
    fecha: { type: "string", description: "Fecha del albarán en formato YYYY-MM-DD si es legible, si no cadena vacía" },
    importe_total: { type: "number", description: "Importe total del albarán en euros" },
    lineas: {
      type: "array",
      description: "Líneas de producto del albarán",
      items: {
        type: "object",
        properties: {
          descripcion: { type: "string" },
          cantidad: { type: "number" },
          precio_unitario: { type: "number" },
          importe: { type: "number" },
        },
        required: ["descripcion", "cantidad", "importe"],
        additionalProperties: false,
      },
    },
  },
  required: ["proveedor", "fecha", "importe_total", "lineas"],
  additionalProperties: false,
};

// Interpreta el JSON de la respuesta de forma tolerante: admite que venga limpio,
// envuelto en ```json ... ``` o con algo de texto alrededor.
function parseJsonTolerante(txt) {
  if (!txt) return null;
  let s = String(txt).trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(s);
  } catch (_) {}
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i !== -1 && j !== -1 && j > i) {
    try {
      return JSON.parse(s.slice(i, j + 1));
    } catch (_) {}
  }
  return null;
}

// Extrae los datos del albarán a partir de una imagen en base64.
async function extraerAlbaran(base64, mediaType) {
  if (!disponible()) {
    const err = new Error("OCR no configurado (define ANTHROPIC_API_KEY)");
    err.code = "OCR_NO_CONFIG";
    throw err;
  }

  // timeout/maxRetries cortos: si el modelo tarda demasiado, fallamos rápido con
  // un mensaje claro en vez de dejar la petición colgada hasta que el proxy la corte.
  const client = new Anthropic({ timeout: 60000, maxRetries: 1 });

  let response;
  try {
    response = await client.messages.create({
      model: MODELO,
      max_tokens: 2000,
      output_config: { format: { type: "json_schema", schema: ESQUEMA } },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType || "image/jpeg", data: base64 },
            },
            {
              type: "text",
              text:
                "Esto es la foto de un albarán de un proveedor de hostelería. " +
                "Extrae el proveedor, la fecha, el importe total y las líneas de producto " +
                "(descripción, cantidad, precio unitario e importe). Importes en euros con punto decimal. " +
                "Si un dato no es legible, deja la cadena vacía o 0. " +
                "Responde ÚNICAMENTE con el objeto JSON, sin texto adicional ni markdown.",
            },
          ],
        },
      ],
    });
  } catch (e) {
    // Errores de red/tiempo del propio modelo: mensaje claro (nunca vacío).
    const msg = e && e.message ? e.message : "";
    if (/timeout|ETIMEDOUT|ECONNRESET|aborted/i.test(msg)) {
      throw new Error("El lector tardó demasiado. Repite con una foto más cercana y con buena luz.");
    }
    throw new Error("El lector no respondió: " + (msg || "error de conexión"));
  }

  const texto = (response.content || []).find((b) => b.type === "text");
  const datos = texto ? parseJsonTolerante(texto.text) : null;
  if (!datos) throw new Error("No se pudo leer el albarán");
  return datos;
}

module.exports = { disponible, extraerAlbaran };
