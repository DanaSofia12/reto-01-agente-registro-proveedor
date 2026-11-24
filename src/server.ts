import { existsSync } from "node:fs"
import path from "node:path"
import { crearCiclo } from "./agent/ciclo.ts"
import { obtenerOCrearSesion, obtenerSesion } from "./agent/sesion.ts"
import { config, fechaReferencia, hayClave } from "./config.ts"
import { leerSolicitud } from "./infra/fixtures.ts"
import { casosDisponibles, rutaSalida } from "./infra/rutas.ts"
import { crearProveedor, ErrorConfiguracionLLM } from "./llm/index.ts"
import { HERRAMIENTAS } from "./tools/registro.ts"

/**
 * API HTTP y servidor de estáticos. Un solo proceso sirve /api/* y web/dist.
 *
 * Deliberadamente delgado: toda la lógica vive en domain/, tools/ y agent/.
 * Un cambio de reglas de negocio no toca este archivo.
 */

const RAIZ = path.resolve(import.meta.dir, "..")
const DIST = path.join(RAIZ, "web", "dist")

type Ciclo = ReturnType<typeof crearCiclo>

/**
 * Sin clave el servidor arranca igual: /api/health debe poder responder y el
 * front debe poder explicar qué falta, en vez de no cargar.
 */
let cicloListo: Ciclo | null = null
let motivoSinCiclo: string | null = null

try {
  cicloListo = crearCiclo({ raiz: RAIZ, proveedor: crearProveedor() })
} catch (causa) {
  motivoSinCiclo =
    causa instanceof ErrorConfiguracionLLM
      ? causa.message
      : "el proveedor de modelo no está configurado"
}

// ─── Utilidades HTTP ──────────────────────────────────────────────────────────

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", ...CORS }

function json(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: JSON_HEADERS })
}

function error(mensaje: string, estado: number): Response {
  return json({ ok: false, error: mensaje }, estado)
}

/**
 * Rate limit por ORIGEN, no por sesión.
 *
 * El `sessionId` lo elige el cliente: limitar por él se evade rotándolo en
 * cada petición, que es justo lo que hace un abusador. El link es público y la
 * clave es nuestra, así que la cuota se cuenta por IP.
 */
const VENTANA_MS = 60_000
const MAX_POR_VENTANA = 20
const golpes = new Map<string, number[]>()

/** Detrás de Fly o cualquier proxy, la IP real viene en la cabecera. */
function origenDe(peticion: Request, servidor: Bun.Server<undefined>): string {
  const reenviada = peticion.headers.get("x-forwarded-for")
  if (reenviada !== null && reenviada !== "") {
    return (reenviada.split(",")[0] ?? "").trim() || "desconocido"
  }
  return servidor.requestIP(peticion)?.address ?? "desconocido"
}

function excedeLimite(origen: string): boolean {
  const ahora = Date.now()
  const previos = (golpes.get(origen) ?? []).filter((t) => ahora - t < VENTANA_MS)
  previos.push(ahora)
  golpes.set(origen, previos)

  // Purga de orígenes inactivos: el Map no puede crecer sin cota.
  if (golpes.size > 5_000) {
    for (const [clave, marcas] of golpes) {
      if (marcas.every((t) => ahora - t >= VENTANA_MS)) golpes.delete(clave)
    }
  }
  return previos.length > MAX_POR_VENTANA
}

// ─── Rutas ────────────────────────────────────────────────────────────────────

async function postChat(peticion: Request, servidor: Bun.Server<undefined>): Promise<Response> {
  let cuerpo: {
    sessionId?: string
    message?: string
    confirmacion?: boolean
    /** Solicitud abierta en pantalla, para que el agente no pregunte de cuál hablamos. */
    caso?: string
  }
  try {
    cuerpo = (await peticion.json()) as typeof cuerpo
  } catch {
    return error("el cuerpo de la petición no es JSON válido", 400)
  }

  const mensaje = (cuerpo.message ?? "").trim()
  if (mensaje === "") return error("falta el campo message", 400)
  if (mensaje.length > 4000) return error("el mensaje es demasiado largo", 413)

  if (excedeLimite(origenDe(peticion, servidor))) {
    return error("demasiados mensajes seguidos. Espera un momento antes de continuar", 429)
  }

  const sesion = obtenerOCrearSesion(cuerpo.sessionId)

  if (cicloListo === null) {
    return json(
      {
        reply: `${(motivoSinCiclo ?? "el proveedor de modelo no está configurado").replace(/\.$/, "")}. Mientras tanto puedes verificar las herramientas sin modelo con \`bun run demo.ts\`.`,
        toolCalls: [],
        needsConfirmation: false,
        sessionId: sesion.id,
      },
      503,
    )
  }

  try {
    const abierto =
      typeof cuerpo.caso === "string" && /^[a-z0-9-]+$/.test(cuerpo.caso) ? cuerpo.caso : null
    return json(await cicloListo(sesion, mensaje, cuerpo.confirmacion === true, abierto))
  } catch (causa) {
    // Última red: ni un fallo inesperado mata la sesión.
    const texto = causa instanceof Error ? causa.message : "error inesperado en el ciclo del agente"
    return json(
      { reply: texto, toolCalls: [], needsConfirmation: false, sessionId: sesion.id },
      500,
    )
  }
}

function getSesion(id: string): Response {
  const sesion = obtenerSesion(id)
  if (sesion === undefined) return error("sesión no encontrada", 404)
  return json({
    sessionId: sesion.id,
    creada: sesion.creada,
    historial: sesion.historial,
    casoActual: sesion.casoActual,
    needsConfirmation: sesion.esperandoRespuesta && sesion.paquetesArmados.size > 0,
    uso: sesion.uso,
  })
}

/** Responde si hay clave configurada, nunca cuál ni de qué largo. */
function getSalud(): Response {
  return json({
    ok: true,
    provider: config.LLM_PROVIDER,
    model: config.LLM_MODEL,
    claveConfigurada: hayClave(),
    fechaReferencia: fechaReferencia().toISOString().slice(0, 10),
    herramientas: HERRAMIENTAS.map((h) => h.nombre),
    maxIteracionesTurno: config.MAX_ITERACIONES_TURNO,
  })
}

/** Alimenta el estado vacío del front: los casos que hay para procesar. */
function getCasos(): Response {
  const casos = casosDisponibles(RAIZ).map((caso) => {
    try {
      const solicitud = leerSolicitud(RAIZ, caso)
      // El correo entero viaja a la bandeja: la analista lo lee antes de pedirle
      // nada al agente, igual que abriría el correo real.
      return {
        caso,
        cliente: solicitud.cliente,
        pais: solicitud.pais,
        formato: solicitud.formato,
        asunto: solicitud.asunto,
        correo: {
          de: solicitud.de,
          para: solicitud.para,
          asunto: solicitud.asunto,
          fecha: solicitud.fecha,
          cuerpo: solicitud.cuerpo,
          adjuntos: solicitud.adjuntos,
        },
      }
    } catch {
      return { caso, cliente: caso, pais: "—", formato: "—", asunto: "", correo: null }
    }
  })
  return json({ casos })
}

/** Lista los artefactos generados para enlazarlos desde el chat. */
function getArtefactos(caso: string): Response {
  try {
    const base = rutaSalida(RAIZ, caso)
    if (!existsSync(base)) return json({ caso, artefactos: [] })
    const glob = new Bun.Glob("**/*")
    const artefactos = [...glob.scanSync({ cwd: base, onlyFiles: true })].sort()
    return json({ caso, artefactos })
  } catch {
    return error("no se pudieron listar los artefactos", 400)
  }
}

/**
 * Markdown, texto plano y JSONL se sirven como `text/plain` para que el visor
 * los muestre en vez de que el navegador los descargue. El resto conserva el
 * tipo que Bun deduce de la extensión.
 */
const COMO_TEXTO = /\.(md|txt|jsonl|json|csv)$/

function getArchivo(caso: string, relativo: string): Response {
  try {
    const destino = rutaSalida(RAIZ, caso, relativo)
    if (!existsSync(destino)) return error("archivo no encontrado", 404)
    const archivo = Bun.file(destino)
    if (!COMO_TEXTO.test(relativo)) return new Response(archivo)
    return new Response(archivo, {
      headers: { "content-type": "text/plain; charset=utf-8", ...CORS },
    })
  } catch {
    return error("ruta inválida", 400)
  }
}

// ─── Estáticos ────────────────────────────────────────────────────────────────

function servirEstatico(ruta: string): Response | null {
  if (!existsSync(DIST)) return null
  const limpio = ruta === "/" ? "/index.html" : ruta
  const destino = path.join(DIST, limpio)
  if (!destino.startsWith(DIST)) return null
  if (existsSync(destino) && !destino.endsWith("/")) return new Response(Bun.file(destino))
  const indice = path.join(DIST, "index.html")
  return existsSync(indice) ? new Response(Bun.file(indice)) : null
}

function sinFront(): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Agente de registro como proveedor</title>
     <body style="font:16px/1.6 system-ui;max-width:42rem;margin:4rem auto;padding:0 1rem">
     <h1>El front no está compilado</h1>
     <p>Ejecuta <code>bun run build</code>, o <code>bun run dev</code> para desarrollo.</p>
     <p>La API ya responde en <code>/api/health</code>.</p>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  )
}

// ─── Servidor ─────────────────────────────────────────────────────────────────

const servidor = Bun.serve({
  port: config.PORT,
  idleTimeout: 120,

  async fetch(peticion, servidor) {
    const url = new URL(peticion.url)
    const ruta = url.pathname

    if (peticion.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS })
    }

    const esGet = peticion.method === "GET"

    if (ruta === "/api/health" && esGet) return getSalud()
    if (ruta === "/api/casos" && esGet) return getCasos()
    if (ruta === "/api/chat" && peticion.method === "POST") return postChat(peticion, servidor)

    const sesion = esGet ? ruta.match(/^\/api\/sessions\/([\w-]+)$/) : null
    if (sesion?.[1] !== undefined) return getSesion(sesion[1])

    const artefactos = esGet ? ruta.match(/^\/api\/artefactos\/([a-z0-9-]+)$/) : null
    if (artefactos?.[1] !== undefined) return getArtefactos(artefactos[1])

    const archivo = esGet ? ruta.match(/^\/api\/archivos\/([a-z0-9-]+)\/(.+)$/) : null
    if (archivo?.[1] !== undefined && archivo[2] !== undefined) {
      return getArchivo(archivo[1], decodeURIComponent(archivo[2]))
    }

    if (ruta.startsWith("/api/")) return error("ruta no encontrada", 404)

    return servirEstatico(ruta) ?? sinFront()
  },
})

console.info(
  `Agente de registro como proveedor escuchando en http://localhost:${servidor.port}\n` +
    `  proveedor: ${config.LLM_PROVIDER} · modelo: ${config.LLM_MODEL} · clave: ${hayClave() ? "configurada" : "AUSENTE"}\n` +
    `  fecha de referencia: ${fechaReferencia().toISOString().slice(0, 10)} · tope por turno: ${config.MAX_ITERACIONES_TURNO}`,
)
