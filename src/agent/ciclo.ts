import { readFileSync } from "node:fs"
import path from "node:path"
import { config, fechaReferencia } from "../config.ts"
import type { ContextoHerramienta } from "../domain/tipos.ts"
import { leerSolicitud } from "../infra/fixtures.ts"
import { casosDisponibles } from "../infra/rutas.ts"
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
 * El bucle del agente: pedir al modelo, ejecutar lo que pida, repetir.
 *
 * Escrito a mano en vez de usar el tool runner del SDK porque el tope de
 * iteraciones, el gate de confirmación y el manejo de errores son reglas de
 * este negocio, no del proveedor. Ver SOLUCION.md, decisión 2.
 */

const HERRAMIENTAS_LLM: readonly HerramientaLLM[] = HERRAMIENTAS.map((h) => ({
  nombre: h.nombre,
  descripcion: h.descripcion,
  esquema: h.esquema,
}))

/** Acciones externas: nunca se ejecutan sin confirmación explícita del turno anterior. */
const ACCIONES_EXTERNAS = new Set(["proveedor_simular_envio"])

/**
 * El prompt vive en archivos, no en código.
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

/**
 * Las solicitudes que hay, con el nombre del cliente al lado del identificador.
 *
 * Sin esto el agente tenía que adivinar que «Industrias Delta» se guarda como
 * `co-industrias-delta`, y acababa preguntando de qué cliente hablábamos aunque
 * la analista lo tuviera abierto en pantalla.
 */
function catalogoDeSolicitudes(raiz: string): string {
  const filas = casosDisponibles(raiz).map((caso) => {
    try {
      const s = leerSolicitud(raiz, caso)
      return `- ${s.cliente} — identificador: ${caso}`
    } catch {
      return `- (solicitud ilegible) — identificador: ${caso}`
    }
  })
  return filas.join("\n")
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
  const catalogo = catalogoDeSolicitudes(raiz)

  /**
   * Lo que el agente necesita saber del estado de la pantalla.
   *
   * Va dentro del mensaje del usuario y no en el prompt de sistema: el prefijo
   * del sistema tiene que ser idéntico byte a byte en cada petición o el caché
   * deja de servir.
   */
  function contexto(casoAbierto: string | null): string {
    const abierta =
      casoAbierto === null
        ? "La analista no tiene ninguna solicitud abierta en pantalla."
        : `La analista tiene abierta la solicitud cuyo identificador es ${casoAbierto}. Si habla sin nombrar cliente, se refiere a esa.`
    return [
      "[Contexto de la pantalla, no se lo muestres ni lo menciones]",
      abierta,
      "Solicitudes disponibles:",
      catalogo,
      "[Fin del contexto]",
    ].join("\n")
  }

  return async function ejecutarTurno(
    sesion: Sesion,
    mensaje: string,
    confirmacionExplicita = false,
    casoAbierto: string | null = null,
  ): Promise<ResultadoTurno> {
    const ctx: ContextoHerramienta = {
      directory: raiz,
      sessionId: sesion.id,
      fechaReferencia: fechaReferencia(),
    }

    // La confirmación se evalúa UNA vez, contra el mensaje que acaba de llegar,
    // antes de que el modelo tenga ocasión de interpretarlo a su manera.
    // Dos canales: el botón del front manda `confirmacion: true` de forma
    // inequívoca; el texto libre solo confirma si no deja lugar a duda.
    // Se fotografía al abrir el turno: nada que se arme DENTRO de este turno
    // puede autorizarse en él. Arrancar y disparar en el mismo turno sigue
    // siendo imposible: es la propiedad que hace seguro el gate.
    const autorizables = new Set(sesion.paquetesArmados)
    const confirmadoAhora =
      autorizables.size > 0 && (confirmacionExplicita || esConfirmacion(mensaje))

    sesion.mensajes.push({ rol: "usuario", texto: `${contexto(casoAbierto)}\n\n${mensaje}` })
    sesion.historial.push({
      rol: "usuario",
      texto: mensaje,
      llamadas: [],
      ts: new Date().toISOString(),
    })

    const llamadasDelTurno: RegistroLlamada[] = []
    let iteracion = 0
    let respuestaFinal = ""

    while (iteracion < config.MAX_ITERACIONES_TURNO) {
      // Tope acumulado por sesión.
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
        // El error se muestra en lenguaje claro y la sesión no muere.
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
          autorizables,
          confirmadoAhora,
          sesion,
        })
        llamadasDelTurno.push(registro.visible)
        resultados.push({ id: llamada.id, contenido: registro.crudo })
      }

      // Todos los tool_result en UN solo mensaje: repartirlos entre varios
      // le enseña al modelo a dejar de pedir herramientas en paralelo.
      sesion.mensajes.push({ rol: "resultados", resultados })
    }

    // Al tocar el tope responde con lo que tiene, no con silencio ni error.
    if (respuestaFinal === "" && iteracion >= config.MAX_ITERACIONES_TURNO) {
      const hechas = llamadasDelTurno.map((l) => l.nombre).join(", ")
      respuestaFinal = [
        `Alcancé el tope de ${config.MAX_ITERACIONES_TURNO} pasos en este turno y me detuve para no seguir gastando.`,
        hechas === "" ? "" : `\n\nAlcancé a ejecutar: ${hechas}.`,
        "\n\nDime si quieres que continúe desde donde quedé.",
      ].join("")
    }

    // El resalte es de interfaz; el permiso es `paquetesArmados` más una
    // confirmación inequívoca. Están separados a propósito: si el agente dedica
    // un turno entero a preguntar, ese turno no arma ningún paquete, y antes la
    // pregunta salía sin su botón.
    sesion.esperandoRespuesta = respuestaFinal.includes("?") || respuestaFinal.includes("¿")

    sesion.historial.push({
      rol: "agente",
      texto: respuestaFinal,
      llamadas: llamadasDelTurno,
      ts: new Date().toISOString(),
    })

    return {
      reply: respuestaFinal,
      toolCalls: llamadasDelTurno,
      needsConfirmation: sesion.esperandoRespuesta && sesion.paquetesArmados.size > 0,
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
  /** Casos con paquete armado al EMPEZAR el turno. */
  readonly autorizables: ReadonlySet<string>
  readonly confirmadoAhora: boolean
  readonly sesion: Sesion
}

async function ejecutarLlamada(
  llamada: LlamadaHerramienta,
  ctx: ContextoHerramienta,
  confirmacion: ContextoConfirmacion,
): Promise<{ crudo: string; visible: RegistroLlamada }> {
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
    }
  }

  let argumentos = llamada.argumentos

  // La frontera la impone el servidor, no el prompt. Si el modelo pide
  // `confirmado: true` sin autorización real, se fuerza a false y la
  // herramienta rechaza. Un prompt se puede convencer; esto no.
  if (ACCIONES_EXTERNAS.has(llamada.nombre)) {
    const autorizado =
      confirmacion.confirmadoAhora && caso !== null && confirmacion.autorizables.has(caso)

    if (typeof argumentos === "object" && argumentos !== null) {
      argumentos = { ...(argumentos as Record<string, unknown>), confirmado: autorizado }
    }
  }

  const crudo = await herramienta.ejecutar(argumentos, ctx)
  const { ok, resumen, datos } = resumirResultado(crudo)

  // Armar el paquete deja una acción externa posible. Enviarlo la consume:
  // sin esto, un "sí" posterior reenviaría un caso ya despachado.
  if (caso !== null) {
    if (ok && llamada.nombre === "proveedor_armar_paquete") {
      confirmacion.sesion.paquetesArmados.add(caso)
    }
    if (ok && llamada.nombre === "proveedor_simular_envio") {
      confirmacion.sesion.paquetesArmados.delete(caso)
    }
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
  }
}
