// OCR de albaranes con Claude (visión). Lee la foto de un albarán y extrae
// proveedor, líneas e importe en datos estructurados para rellenar la recepción.
//
// Requiere ANTHROPIC_API_KEY en el entorno. Si no está configurada, la app sigue
// funcionando: la pantalla de recepción permite adjuntar la foto y rellenar a mano.

let Anthropic = null;
try {
  Anthropic = require("@anthropic-ai/sdk");
} catch (e) {
  Anthropic = null; // SDK no instalado: modo sin OCR
}

const MODELO = process.env.OCR_MODEL || "claude-opus-4-8";

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

// Extrae los datos del albarán a partir de una imagen en base64.
async function extraerAlbaran(base64, mediaType) {
  if (!disponible()) {
    const err = new Error("OCR no configurado (define ANTHROPIC_API_KEY)");
    err.code = "OCR_NO_CONFIG";
    throw err;
  }

  const client = new Anthropic(); // toma ANTHROPIC_API_KEY del entorno

  const response = await client.messages.create({
    model: MODELO,
    max_tokens: 1500,
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
              "Si un dato no es legible, deja la cadena vacía o 0.",
          },
        ],
      },
    ],
  });

  const texto = (response.content || []).find((b) => b.type === "text");
  if (!texto) throw new Error("No se pudo leer el albarán");
  return JSON.parse(texto.text);
}

module.exports = { disponible, extraerAlbaran };
