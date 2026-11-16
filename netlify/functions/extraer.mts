import type { Config } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const PROMPT = `Esta foto es una hoja manuscrita del formulario "REGISTRO DE FECHAS DE FABRICACIÓN DE GOTEROS" (normalmente "MÁQUINA 3").
Columnas impresas de la tabla, de izquierda a derecha:
1. Descripción gotero (p. ej. "AMNON PC/AS 2,2", "AMNON AS 1.6", "TOP DRIP 1.6", "TOP PC AS 2.2 L/H")
2. Fecha en que se echa caja goteros a insertadora (fecha)
3. Hora en que se echa caja goteros a insertadora (hora HH:MM)
4. Fecha fabricación gotero (Assembly Date)
5. Lote / hora fabricación (JAIN, p. ej. "260383 J") o número de ATTENTION con posición y operario (ISRAEL, p. ej. "10-4-318R")
A veces a la derecha aparece un número rodeado con un círculo seguido de "cajas": es el número de cajas.

Reglas:
- Ignora la fila impresa de "Ejemplo" y la cabecera.
- Extrae TODAS las filas manuscritas con algún dato, de arriba a abajo. Ignora filas vacías y filas completamente tachadas.
- Las marcas de repetición ("—", "-", "〃", "''", "11", "ídem") significan "igual que la fila anterior": sustitúyelas por el valor de la fila anterior de esa columna.
- Normaliza fechas a DD/MM/AAAA (años de 2 dígitos → 20AA). Normaliza horas a HH:MM.
- Si una fila tiene la fecha de fabricación y la hora intercambiadas de columna, colócalas en su campo correcto.
- Escribe la descripción en mayúsculas y limpia (p. ej. "AMNON AS 1.6", "TOP DRIP 2.2").
- Si un valor es dudoso o ilegible, pon tu mejor lectura y explica brevemente la duda en "observaciones". Deja "observaciones" vacío si la fila se lee bien (no anotes que se copiaron valores por marcas de repetición).
- Lee con atención el encabezado de la hoja: "maquina" debe ser solo el identificador de la máquina que aparece en él (p. ej. "MÁQUINA 3" → "3"). Si no aparece, deja cadena vacía.
- "hoja" es el número escrito a mano arriba a la izquierda de la página (p. ej. "214"), si existe.
Devuelve el resultado llamando a la herramienta guardar_registro.`;

const tool: Anthropic.Tool = {
  name: "guardar_registro",
  description: "Guarda las filas extraídas de la hoja de registro",
  input_schema: {
    type: "object",
    properties: {
      maquina: { type: "string", description: "Máquina indicada en la cabecera, p. ej. '3'" },
      hoja: { type: "string", description: "Número de hoja manuscrito, o cadena vacía" },
      filas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            descripcion: { type: "string" },
            fechaInsertadora: { type: "string", description: "DD/MM/AAAA" },
            hora: { type: "string", description: "HH:MM" },
            fechaFabricacion: { type: "string", description: "DD/MM/AAAA" },
            attention: { type: "string", description: "Lote JAIN o ATTENTION-posición-operario" },
            cajas: { type: ["integer", "null"] },
            observaciones: { type: "string" },
          },
          required: ["descripcion", "fechaInsertadora", "hora", "fechaFabricacion", "attention", "cajas", "observaciones"],
        },
      },
    },
    required: ["maquina", "hoja", "filas"],
  },
};

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { image } = (await req.json()) as { image?: string };
  const match = image?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) return Response.json({ error: "Imagen no válida" }, { status: 400 });

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 8000,
      tools: [tool],
      tool_choice: { type: "auto" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: match[1] as "image/jpeg", data: match[2] },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    const block = message.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      return Response.json({ error: "No se pudieron leer datos de la foto" }, { status: 422 });
    }
    return Response.json(block.input);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Error al analizar la foto. Inténtalo de nuevo." }, { status: 502 });
  }
};

export const config: Config = { path: "/api/extraer" };
