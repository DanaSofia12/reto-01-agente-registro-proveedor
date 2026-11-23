import OpenAI from "openai"
import {
  conTimeout,
  ErrorProveedor,
  type LlamadaHerramienta,
  type Mensaje,
  type ProveedorLLM,
  type RespuestaLLM,
} from "./adapter.ts"

/**
 * Segunda implementación del adaptador.
 *
 * Existe para demostrar que la abstracción no es decorativa: el ciclo del
 * agente no distingue entre esta y la de Anthropic. El formato de tool calling
 * es distinto (`function` con argumentos serializados en string frente a
 * bloques `tool_use` con objeto), y toda esa diferencia queda contenida aquí.
 */

type MensajeOpenAI = OpenAI.Chat.Completions.ChatCompletionMessageParam

function aMensajesOpenAI(sistema: string, mensajes: readonly Mensaje[]): MensajeOpenAI[] {
  const salida: MensajeOpenAI[] = [{ role: "system", content: sistema }]

  for (const mensaje of mensajes) {
    if (mensaje.rol === "usuario") {
      salida.push({ role: "user", content: mensaje.texto })
      continue
    }
    if (mensaje.rol === "asistente") {
      salida.push({
        role: "assistant",
        content: mensaje.texto === "" ? null : mensaje.texto,
        tool_calls:
          mensaje.llamadas.length === 0
            ? undefined
            : mensaje.llamadas.map((l) => ({
                id: l.id,
                type: "function" as const,
                function: { name: l.nombre, arguments: JSON.stringify(l.argumentos ?? {}) },
              })),
      })
      continue
    }
    for (const resultado of mensaje.resultados) {
      salida.push({ role: "tool", tool_call_id: resultado.id, content: resultado.contenido })
    }
  }

  return salida
}

function parsearArgumentos(crudo: string): unknown {
  try {
    return JSON.parse(crudo === "" ? "{}" : crudo)
  } catch {
    // El registro valida con zod después, así que un JSON roto se convierte en
    // un error de validación que el modelo puede corregir.
    return {}
  }
}

function traducirError(causa: unknown): ErrorProveedor {
  if (causa instanceof ErrorProveedor) return causa
  if (causa instanceof OpenAI.APIError) {
    const estado = causa.status ?? 0
    if (estado === 401) {
      return new ErrorProveedor(
        "la clave del proveedor de modelo no es válida. Revisa OPENAI_API_KEY en el entorno del servidor",
        false,
        { cause: causa },
      )
    }
    if (estado === 429) {
      return new ErrorProveedor(
        "el proveedor está limitando las peticiones. Intenta de nuevo",
        true,
        {
          cause: causa,
        },
      )
    }
    if (estado >= 500) {
      return new ErrorProveedor("el proveedor tuvo un problema temporal. Intenta de nuevo", true, {
        cause: causa,
      })
    }
    return new ErrorProveedor(`el proveedor rechazó la petición: ${causa.message}`, false, {
      cause: causa,
    })
  }
  return new ErrorProveedor("no se pudo contactar al proveedor de modelo", true, { cause: causa })
}

export function crearProveedorOpenAI(modelo: string, apiKey: string): ProveedorLLM {
  const cliente = new OpenAI({ apiKey, maxRetries: 2 })

  return {
    nombre: "openai",
    modelo,

    async enviar(mensajes, herramientas, opciones): Promise<RespuestaLLM> {
      try {
        const respuesta = await conTimeout(
          cliente.chat.completions.create({
            model: modelo,
            max_completion_tokens: opciones.maxTokens,
            messages: aMensajesOpenAI(opciones.sistema, mensajes),
            tools: herramientas.map((h) => ({
              type: "function" as const,
              function: { name: h.nombre, description: h.descripcion, parameters: h.esquema },
            })),
          }),
          opciones.timeoutMs,
          "generar la respuesta",
        )

        const eleccion = respuesta.choices[0]?.message
        const llamadas: LlamadaHerramienta[] = (eleccion?.tool_calls ?? [])
          .filter(
            (l): l is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
              l.type === "function",
          )
          .map((l) => ({
            id: l.id,
            nombre: l.function.name,
            argumentos: parsearArgumentos(l.function.arguments),
          }))

        return {
          texto: eleccion?.content ?? "",
          llamadas,
          uso: {
            tokensEntrada: respuesta.usage?.prompt_tokens ?? 0,
            tokensSalida: respuesta.usage?.completion_tokens ?? 0,
            tokensCacheLectura: respuesta.usage?.prompt_tokens_details?.cached_tokens ?? 0,
            tokensCacheEscritura: 0,
          },
        }
      } catch (causa) {
        throw traducirError(causa)
      }
    },
  }
}
