import { readFileSync } from "node:fs"
import path from "node:path"
import { config, fechaReferencia } from "../config.ts"
import type { ContextoHerramienta } from "../domain/tipos.ts"
import {
  ErrorProveedor,
  type HerramientaLLM,
  type LlamadaHerramienta,
  type ProveedorLLM,
  type ResultadoHerramienta,
} from "../llm/adapter.ts"
import { buscarHerramienta, HERRAMIENTAS } from "../tools/registro.ts"
import {
  acumularUso,
  esConfirmacion,
  type RegistroLlamada,
  type Sesion,
  tokensConsumidos,
} from "./sesion.ts"

/**
 * El ciclo del agente (§6.3 del PRD).
 *
 * Implementado a mano en vez de con el tool runner del SDK: el reto evalúa
 * explícitamente el bucle, el tope de iteraciones y la confirmación humana, y
 * exige poder explicar cada línea. Delegar eso a una abstracción del SDK
 * regalaría justo lo que se califica. Ver SOLUCION.md, decisión 3.
 */

const HERRAMIENTAS_LLM: readonly HerramientaLLM[] = HERRAMIENTAS.map((h) => ({
  nombre: h.nombre,
  descripcion: h.descripcion,
  esquema: h.esquema,
}))

/** Acciones externas: nunca se ejecutan sin confirmación explícita del turno anterior. */
const ACCIONES_EXTERNAS = new Set(["proveedor_simular_envio"])

/**
 * El prompt de sistema vive en archivos, no en código (§6.1).
 * Se lee una vez al arrancar: el prefijo debe ser idéntico byte a byte en cada
 * petición o el caché de prompt no sirve de nada.
 */
function cargarSistema(raiz: string): string {
  const comportamiento = readFileSync(path.join(raiz, "agent", "prompt.md"), "utf8")
  const conocimiento = readFileSync(
    path.join(raiz, "src", "knowledge", "registro-proveedor.md"),
    "utf8",
  )
  return `${comportamiento}\n\n---\n\n# Conocimiento del proceso\n\n${conocimiento}`
}

export interface ResultadoTurno {
  readonly reply: string
  readonly toolCalls: readonly RegistroLlamada[]
  readonly needsConfirmation: boolean
  readonly sessionId: string
  readonly uso: {
    readonly tokensEntrada: number
    readonly tokensSalida: number
    readonly tokensCacheLectura: number
    readonly tokensSesion: number
  }
  readonly iteraciones: number
}

export interface OpcionesCiclo {
  readonly raiz: string
  readonly proveedor: ProveedorLLM
}

function extraerCaso(argumentos: unknown): string | null {
  if (typeof argumentos !== "object" || argumentos === null) return null
  const caso = (argumentos as { caso?: unknown }).caso
  return typeof caso === "string" ? caso : null
}

function resumirResultado(crudo: string): { ok: boolean; resumen: string; datos: unknown } {
  try {
    const parseado = JSON.parse(crudo) as { ok?: boolean; error?: string; data?: unknown }
    if (parseado.ok === false) {
      return { ok: false, resumen: parseado.error ?? "error", datos: null }
    }
    const datos = parseado.data ?? {}
    const resumen =
      typeof datos === "object" && datos !== null && "ruta" in datos
        ? String((datos as { ruta: unknown }).ruta)
        : "ok"
    return { ok: true, resumen, datos }
  } catch {
    return { ok: false, resumen: "respuesta ilegible de la herramienta", datos: null }
  }
}

export function crearCiclo({ raiz, proveedor }: OpcionesCiclo) {
  const sistema = cargarSistema(raiz)

  return async function ejecutarTurno(sesion: Sesion, mensaje: string): Promise<ResultadoTurno> {
    const ctx: ContextoHerramienta = {
      directory: raiz,
      sessionId: sesion.id,
      fechaReferencia: fechaReferencia(),
    }

    // La confirmación se evalúa UNA vez, contra el mensaje que acaba de llegar,
    // antes de que el modelo tenga ocasión de interpretarlo a su manera.
    const pendiente = sesion.pendiente
    const confirmadoAhora = pendiente !== null && esConfirmacion(mensaje)
    sesion.pendiente = null

    sesion.mensajes.push({ rol: "usuario", texto: mensaje })
    sesion.historial.push({
      rol: "usuario",
      texto: mensaje,
      llamadas: [],
      ts: new Date().toISOString(),
    })

    const llamadasDelTurno: RegistroLlamada[] = []
    let iteracion = 0
    let respuestaFinal = ""
    let nuevaPendiente: Sesion["pendiente"] = null

    while (iteracion < config.MAX_ITERACIONES_TURNO) {
      // NFR Costo — tope acumulado por sesión.
      if (tokensConsumidos(sesion) >= config.MAX_TOKENS_SESION) {
        respuestaFinal =
          "Esta sesión alcanzó su límite de tokens. Abre una sesión nueva para continuar; los archivos ya generados siguen en `out/`."
        break
      }

      iteracion += 1

      let respuesta: Awaited<ReturnType<ProveedorLLM["enviar"]>>
      try {
        respuesta = await proveedor.enviar(sesion.mensajes, HERRAMIENTAS_LLM, {
          sistema,
          maxTokens: config.MAX_TOKENS_RESPUESTA,
          timeoutMs: config.LLM_TIMEOUT_MS,
        })
      } catch (causa) {
        // CA5 — el error se muestra en lenguaje claro y la sesión no muere.
        const texto =
          causa instanceof ErrorProveedor
            ? causa.message
            : "no se pudo contactar al proveedor de modelo"
        respuestaFinal = `${texto}. Lo que ya se generó sigue disponible en \`out/\`.`
        sesion.historial.push({
          rol: "sistema",
          texto: respuestaFinal,
          llamadas: [],
          ts: new Date().toISOString(),
        })
        return {
          reply: respuestaFinal,
          toolCalls: llamadasDelTurno,
          needsConfirmation: false,
          sessionId: sesion.id,
          uso: {
            tokensEntrada: sesion.uso.tokensEntrada,
            tokensSalida: sesion.uso.tokensSalida,
            tokensCacheLectura: sesion.uso.tokensCacheLectura,
            tokensSesion: tokensConsumidos(sesion),
          },
          iteraciones: iteracion,
        }
      }

      acumularUso(sesion, respuesta.uso)
      sesion.mensajes.push({
        rol: "asistente",
        texto: respuesta.texto,
        llamadas: respuesta.llamadas,
      })

      // Sin llamadas, el modelo terminó el turno.
      if (respuesta.llamadas.length === 0) {
        respuestaFinal = respuesta.texto
        break
      }

      const resultados: ResultadoHerramienta[] = []
      for (const llamada of respuesta.llamadas) {
        const registro = await ejecutarLlamada(llamada, ctx, {
          pendiente,
          confirmadoAhora,
          sesion,
        })
        llamadasDelTurno.push(registro.visible)
        resultados.push({ id: llamada.id, contenido: registro.crudo })
        if (registro.pendiente !== null) nuevaPendiente = registro.pendiente
      }

      // Todos los tool_result en UN solo mensaje: repartirlos entre varios
      // le enseña al modelo a dejar de pedir herramientas en paralelo.
      sesion.mensajes.push({ rol: "resultados", resultados })
    }

    // CA1 — al tocar el tope responde con lo que tiene, no con silencio ni error.
    if (respuestaFinal === "" && iteracion >= config.MAX_ITERACIONES_TURNO) {
      const hechas = llamadasDelTurno.map((l) => l.nombre).join(", ")
      respuestaFinal = [
        `Alcancé el tope de ${config.MAX_ITERACIONES_TURNO} pasos en este turno y me detuve para no seguir gastando.`,
        hechas === "" ? "" : `\n\nAlcancé a ejecutar: ${hechas}.`,
        "\n\nDime si quieres que continúe desde donde quedé.",
      ].join("")
    }

    sesion.pendiente = nuevaPendiente
    sesion.historial.push({
      rol: "agente",
      texto: respuestaFinal,
      llamadas: llamadasDelTurno,
      ts: new Date().toISOString(),
    })

    return {
      reply: respuestaFinal,
      toolCalls: llamadasDelTurno,
      needsConfirmation: nuevaPendiente !== null,
      sessionId: sesion.id,
      uso: {
        tokensEntrada: sesion.uso.tokensEntrada,
        tokensSalida: sesion.uso.tokensSalida,
        tokensCacheLectura: sesion.uso.tokensCacheLectura,
        tokensSesion: tokensConsumidos(sesion),
      },
      iteraciones: iteracion,
    }
  }
}

interface ContextoConfirmacion {
  readonly pendiente: Sesion["pendiente"]
  readonly confirmadoAhora: boolean
  readonly sesion: Sesion
}

async function ejecutarLlamada(
  llamada: LlamadaHerramienta,
  ctx: ContextoHerramienta,
  confirmacion: ContextoConfirmacion,
): Promise<{ crudo: string; visible: RegistroLlamada; pendiente: Sesion["pendiente"] }> {
  const herramienta = buscarHerramienta(llamada.nombre)
  const caso = extraerCaso(llamada.argumentos)
  if (caso !== null) confirmacion.sesion.casoActual = caso

  if (herramienta === undefined) {
    const crudo = JSON.stringify({ ok: false, error: `herramienta desconocida: ${llamada.nombre}` })
    return {
      crudo,
      visible: {
        id: llamada.id,
        nombre: llamada.nombre,
        argumentos: llamada.argumentos,
        ok: false,
        resumen: "herramienta desconocida",
        resultado: null,
      },
      pendiente: null,
    }
  }

  let argumentos = llamada.argumentos

  // RN4 — la frontera de la confirmación la impone el servidor, no el prompt.
  // Si el modelo pide `confirmado: true` sin que el turno anterior haya quedado
  // esperando esta acción y sin que el usuario la haya confirmado, se fuerza a
  // false y la herramienta responde el rechazo del contrato.
  if (ACCIONES_EXTERNAS.has(llamada.nombre)) {
    const autorizado =
      confirmacion.pendiente !== null &&
      confirmacion.pendiente.accion === "simular_envio" &&
      confirmacion.confirmadoAhora &&
      (caso === null || caso === confirmacion.pendiente.caso)

    if (typeof argumentos === "object" && argumentos !== null) {
      argumentos = { ...(argumentos as Record<string, unknown>), confirmado: autorizado }
    }
  }

  const crudo = await herramienta.ejecutar(argumentos, ctx)
  const { ok, resumen, datos } = resumirResultado(crudo)

  // Tras armar el paquete queda una acción externa posible: el envío. Se arma
  // la confirmación para que el front la resalte y el gate quede activo.
  let pendiente: Sesion["pendiente"] = null
  if (ok && llamada.nombre === "proveedor_armar_paquete" && caso !== null) {
    pendiente = { accion: "simular_envio", caso }
  }
  if (!ok && llamada.nombre === "proveedor_simular_envio" && caso !== null) {
    pendiente = { accion: "simular_envio", caso }
  }

  return {
    crudo,
    visible: {
      id: llamada.id,
      nombre: llamada.nombre,
      argumentos,
      ok,
      resumen,
      resultado: datos,
    },
    pendiente,
  }
}
