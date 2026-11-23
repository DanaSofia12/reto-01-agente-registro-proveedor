import Anthropic from "@anthropic-ai/sdk"
import {
  conTimeout,
  ErrorProveedor,
  type HerramientaLLM,
  type LlamadaHerramienta,
  type Mensaje,
  type ProveedorLLM,
  type RespuestaLLM,
} from "./adapter.ts"

/**
 * Implementación para Claude.
 *
 * Decisiones que importan y por qué:
 * - El prompt de sistema lleva `cache_control`. El orden de renderizado es
 *   tools -> system -> messages, así que un punto de caché en el último bloque
 *   de system cachea herramientas y prompt juntos: ~4 200 tokens estables que
 *   se repiten en las ~5 llamadas de cada caso, a 10 % del precio de entrada.
 * - Todos los `tool_result` van en UN solo mensaje de usuario. Repartirlos
 *   entre varios le enseña al modelo a dejar de pedir herramientas en paralelo.
 * - Sin `temperature` ni `top_p`: los modelos actuales los rechazan con 400.
 *   El estilo se guía desde `agent/prompt.md`.
 */

type BloqueContenido = Anthropic.Messages.ContentBlockParam

function aMensajesAnthropic(mensajes: readonly Mensaje[]): Anthropic.Messages.MessageParam[] {
  return mensajes.map((mensaje): Anthropic.Messages.MessageParam => {
    if (mensaje.rol === "usuario") {
      return { role: "user", content: mensaje.texto }
    }

    if (mensaje.rol === "asistente") {
      const bloques: BloqueContenido[] = []
      if (mensaje.texto !== "") bloques.push({ type: "text", text: mensaje.texto })
      for (const llamada of mensaje.llamadas) {
        bloques.push({
          type: "tool_use",
          id: llamada.id,
          name: llamada.nombre,
          input: (llamada.argumentos ?? {}) as Record<string, unknown>,
        })
      }
      return { role: "assistant", content: bloques }
    }

    return {
      role: "user",
      content: mensaje.resultados.map((resultado) => ({
        type: "tool_result" as const,
        tool_use_id: resultado.id,
        content: resultado.contenido,
      })),
    }
  })
}

function traducirError(causa: unknown): ErrorProveedor {
  if (causa instanceof ErrorProveedor) return causa

  if (causa instanceof Anthropic.APIError) {
    const estado = causa.status ?? 0
    if (estado === 401) {
      return new ErrorProveedor(
        "la clave del proveedor de modelo no es válida. Revisa ANTHROPIC_API_KEY en el entorno del servidor",
        false,
        { cause: causa },
      )
    }
    if (estado === 429) {
      return new ErrorProveedor(
        "el proveedor de modelo está limitando las peticiones. Intenta de nuevo en unos segundos",
        true,
        { cause: causa },
      )
    }
    if (estado >= 500) {
      return new ErrorProveedor(
        "el proveedor de modelo tuvo un problema temporal. Intenta de nuevo",
        true,
        { cause: causa },
      )
    }
    return new ErrorProveedor(
      `el proveedor de modelo rechazó la petición: ${causa.message}`,
      false,
      {
        cause: causa,
      },
    )
  }

  return new ErrorProveedor("no se pudo contactar al proveedor de modelo", true, { cause: causa })
}

export function crearProveedorAnthropic(modelo: string, apiKey: string): ProveedorLLM {
  const cliente = new Anthropic({ apiKey, maxRetries: 2 })

  return {
    nombre: "anthropic",
    modelo,

    async enviar(mensajes, herramientas, opciones): Promise<RespuestaLLM> {
      try {
        const respuesta = await conTimeout(
          cliente.messages.create({
            model: modelo,
            max_tokens: opciones.maxTokens,
            system: [
              {
                type: "text",
                text: opciones.sistema,
                cache_control: { type: "ephemeral" },
              },
            ],
            tools: herramientas.map((h: HerramientaLLM) => ({
              name: h.nombre,
              description: h.descripcion,
              input_schema: h.esquema as Anthropic.Messages.Tool.InputSchema,
            })),
            messages: aMensajesAnthropic(mensajes),
          }),
          opciones.timeoutMs,
          "generar la respuesta",
        )

        let texto = ""
        const llamadas: LlamadaHerramienta[] = []
        for (const bloque of respuesta.content) {
          if (bloque.type === "text") texto += bloque.text
          if (bloque.type === "tool_use") {
            llamadas.push({ id: bloque.id, nombre: bloque.name, argumentos: bloque.input })
          }
        }

        return {
          texto,
          llamadas,
          uso: {
            tokensEntrada: respuesta.usage.input_tokens,
            tokensSalida: respuesta.usage.output_tokens,
            tokensCacheLectura: respuesta.usage.cache_read_input_tokens ?? 0,
            tokensCacheEscritura: respuesta.usage.cache_creation_input_tokens ?? 0,
          },
        }
      } catch (causa) {
        throw traducirError(causa)
      }
    },
  }
}
