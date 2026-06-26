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
          descripcion: { type: "string", description: "Descripción tal cual aparece en el albarán" },
          cantidad: { type: "number" },
          precio_unitario: { type: "number" },
          importe: { type: "number" },
          materia: {
            type: "string",
            description:
              "Nombre EXACTO de la materia del catálogo del almacén que corresponde a esta línea " +
              "(cópialo literalmente de la lista que se te da). Cadena vacía si ninguna encaja con claridad.",
          },
        },
        required: ["descripcion", "cantidad", "importe"],
        additionalProperties: false,
      },
    },
  },
  required: ["proveedor", "fecha", "importe_total", "lineas"],
  additionalProperties: false,
};

// Extrae los datos del albarán a partir de una imagen en base64. Si se pasa el
// catálogo de materias del almacén, la IA empareja cada línea con su materia.
async function extraerAlbaran(base64, mediaType, catalogo) {
  if (!disponible()) {
    const err = new Error("OCR no configurado (define ANTHROPIC_API_KEY)");
    err.code = "OCR_NO_CONFIG";
    throw err;
  }

  const client = new Anthropic(); // toma ANTHROPIC_API_KEY del entorno

  const nombres = Array.isArray(catalogo) ? catalogo.filter(Boolean) : [];
  const bloqueCatalogo = nombres.length
    ? "\n\nCatálogo de materias del almacén (empareja cada línea con la materia que corresponda, " +
      "copiando su nombre EXACTO en el campo \"materia\"; usa el sentido común con abreviaturas, " +
      "plurales, formatos, marcas y sinónimos —p. ej. 'AGUACATE HASS 5KG' → 'Aguacate M'—; " +
      "si ninguna encaja con claridad, deja \"materia\" vacío):\n- " +
      nombres.join("\n- ")
    : "";

  const response = await client.messages.create({
    model: MODELO,
    // Margen amplio: un albarán con muchas líneas + el catálogo puede ser largo;
    // si se queda corto, el JSON llega cortado y no se puede parsear.
    max_tokens: 8000,
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
              "Si un dato no es legible, deja la cadena vacía o 0." +
              bloqueCatalogo,
          },
        ],
      },
    ],
  });

  const texto = (response.content || []).find((b) => b.type === "text");
  if (!texto) {
    if (response.stop_reason === "refusal") throw new Error("La IA no pudo procesar esta imagen. Prueba con otra foto más nítida.");
    throw new Error("No se pudo leer el albarán (respuesta vacía)");
  }
  try {
    return JSON.parse(texto.text);
  } catch (e) {
    if (response.stop_reason === "max_tokens") {
      throw new Error("El albarán tiene demasiadas líneas para leerlo de una vez. Hazle una foto más cercana o por partes.");
    }
    throw new Error("La lectura no devolvió datos válidos. Inténtalo otra vez con una foto más nítida.");
  }
}

module.exports = { disponible, extraerAlbaran };
