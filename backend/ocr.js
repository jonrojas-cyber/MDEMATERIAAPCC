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
    proveedor: { type: "string", description: "Nombre comercial/fiscal del proveedor o emisor del albarán" },
    proveedor_cif: { type: "string", description: "CIF/NIF del proveedor si aparece (p. ej. B12345678). Si no, cadena vacía." },
    proveedor_telefono: { type: "string", description: "Teléfono del proveedor si aparece. Si no, cadena vacía." },
    proveedor_email: { type: "string", description: "Email del proveedor si aparece. Si no, cadena vacía." },
    proveedor_direccion: { type: "string", description: "Dirección/domicilio fiscal del proveedor si aparece. Si no, cadena vacía." },
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
          unidad: { type: "string", description: "Unidad de medida de la cantidad tal cual aparece: kg, g, L, ml, ud, caja, saco, bandeja… Si no se ve, cadena vacía." },
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
                "Extrae los datos del PROVEEDOR/emisor de la cabecera del albarán: nombre, " +
                "CIF/NIF, teléfono, email y dirección (los que aparezcan; si alguno no se ve, cadena vacía). " +
                "Extrae también la fecha, el importe total y las líneas de producto " +
                "(descripción, cantidad, UNIDAD de medida, precio unitario e importe). " +
                "La UNIDAD es clave: cópiala tal cual aparece (kg, g, L, ml, ud, caja, saco, bandeja, docena…). " +
                "Si la línea indica un formato con peso/volumen (p. ej. 'saco 25 kg', 'garrafa 5 L', 'caja 12 ud'), " +
                "pon en 'unidad' ese detalle completo. Si no se ve la unidad, deja 'unidad' como cadena vacía. " +
                "Importes en euros con punto decimal. Si un dato no es legible, deja la cadena vacía o 0. " +
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

// Extrae los datos de un albarán de VARIAS HOJAS a partir de N imágenes. Las manda
// todas en una sola petición para que el modelo entienda que son el mismo albarán:
// combina todas las líneas, un único proveedor/cabecera y el importe total (el de
// la última hoja / el gran total). Evita duplicar cabeceras repetidas.
async function extraerAlbaranMulti(imagenes, mediaType) {
  if (!disponible()) {
    const err = new Error("OCR no configurado (define ANTHROPIC_API_KEY)");
    err.code = "OCR_NO_CONFIG";
    throw err;
  }
  const fotos = (imagenes || []).filter(Boolean);
  if (fotos.length <= 1) return extraerAlbaran(fotos[0], mediaType);

  const client = new Anthropic({ timeout: 90000, maxRetries: 1 });
  const content = [];
  fotos.forEach((b64, i) => {
    content.push({ type: "text", text: `— Hoja ${i + 1} de ${fotos.length} —` });
    content.push({ type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: b64 } });
  });
  content.push({
    type: "text",
    text:
      `Estas ${fotos.length} fotos son las HOJAS de un MISMO albarán de un proveedor de hostelería. ` +
      "Trátalas como un solo documento: extrae UNA cabecera de proveedor (nombre, CIF, teléfono, email, dirección; " +
      "normalmente en la primera hoja), la fecha, el importe total (el gran total, normalmente en la última hoja) y " +
      "COMBINA en una única lista TODAS las líneas de producto de todas las hojas (descripción, cantidad, UNIDAD de " +
      "medida, precio unitario e importe). No dupliques líneas ni repitas la cabecera. La UNIDAD es clave: cópiala tal " +
      "cual (kg, g, L, ml, ud, caja, saco, bandeja, docena…). Importes en euros con punto decimal. Si un dato no es " +
      "legible, deja cadena vacía o 0. Responde ÚNICAMENTE con el objeto JSON, sin texto adicional ni markdown.",
  });

  let response;
  try {
    response = await client.messages.create({
      model: MODELO,
      max_tokens: 4000,
      output_config: { format: { type: "json_schema", schema: ESQUEMA } },
      messages: [{ role: "user", content }],
    });
  } catch (e) {
    const msg = e && e.message ? e.message : "";
    if (/timeout|ETIMEDOUT|ECONNRESET|aborted/i.test(msg)) {
      throw new Error("El lector tardó demasiado con varias hojas. Prueba con menos hojas o fotos más nítidas.");
    }
    throw new Error("El lector no respondió: " + (msg || "error de conexión"));
  }
  const texto = (response.content || []).find((b) => b.type === "text");
  const datos = texto ? parseJsonTolerante(texto.text) : null;
  if (!datos) throw new Error("No se pudo leer el albarán");
  return datos;
}

module.exports = { disponible, extraerAlbaran, extraerAlbaranMulti };
