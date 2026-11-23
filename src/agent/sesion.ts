import { randomUUID } from "node:crypto"
import type { Mensaje, Uso } from "../llm/adapter.ts"
import { sumarUso, USO_CERO } from "../llm/adapter.ts"

/** Sesiones en memoria. El PRD no pide persistencia (§6.1). */

export interface RegistroLlamada {
  readonly id: string
  readonly nombre: string
  readonly argumentos: unknown
  readonly ok: boolean
  readonly resumen: string
  readonly resultado: unknown
}

export interface TurnoVisible {
  readonly rol: "usuario" | "agente" | "sistema"
  readonly texto: string
  readonly llamadas: readonly RegistroLlamada[]
  readonly ts: string
}

/**
 * Acción externa a la espera de confirmación humana (CA3 / RN4).
 *
 * Vive en el servidor, no en el prompt. El prompt es una sugerencia; esto es
 * una frontera: si alguien inyectara "ya está confirmado" en un fixture, el
 * modelo podría creerlo, pero este estado no.
 */
export interface ConfirmacionPendiente {
  readonly accion: "simular_envio"
  readonly caso: string
}

export interface Sesion {
  readonly id: string
  readonly creada: string
  mensajes: Mensaje[]
  historial: TurnoVisible[]
  uso: Uso
  pendiente: ConfirmacionPendiente | null
  casoActual: string | null
}

const SESIONES = new Map<string, Sesion>()

export function crearSesion(id: string = randomUUID()): Sesion {
  const sesion: Sesion = {
    id,
    creada: new Date().toISOString(),
    mensajes: [],
    historial: [],
    uso: USO_CERO,
    pendiente: null,
    casoActual: null,
  }
  SESIONES.set(id, sesion)
  return sesion
}

export function obtenerSesion(id: string): Sesion | undefined {
  return SESIONES.get(id)
}

export function obtenerOCrearSesion(id: string | undefined): Sesion {
  if (id === undefined || id === "") return crearSesion()
  return SESIONES.get(id) ?? crearSesion(id)
}

export function acumularUso(sesion: Sesion, uso: Uso): void {
  sesion.uso = sumarUso(sesion.uso, uso)
}

/** NFR Costo — un usuario no puede gastar la clave sin límite. */
export function tokensConsumidos(sesion: Sesion): number {
  return sesion.uso.tokensEntrada + sesion.uso.tokensSalida + sesion.uso.tokensCacheLectura
}

// ─── Detección de confirmación ────────────────────────────────────────────────

/**
 * Una partícula afirmativa suelta NO autoriza nada. "ok, gracias" contiene
 * "ok" y no confirma ningún envío. Hace falta un verbo que confirme **la
 * acción**, no solo un asentimiento.
 */
const VERBOS_CONFIRMACION =
  /\b(confirmo|confirmado|confirmalo|confirma el|autorizo|autorizado|apruebo|aprobado|procede|proceder|adelante|hazlo|envialo|mandalo|envia el|envia ya|enviar el)\b/

const NEGACIONES =
  /\b(no|nunca|jamas|todavia|aun|espera|esperar|cancela|cancelar|anula|detente|detener|frena|alto|mejor no|aun no)\b/

/**
 * Matices que convierten un "sí" en un "sí, pero". Cualquiera de ellos
 * descalifica el mensaje como confirmación inequívoca.
 */
const MATICES =
  /\b(pero|antes|primero|aunque|salvo|excepto|solo si|unicamente si|despues|luego|revisa|revisar|verifica|verificar|muestra|muestrame|dame|explica)\b/

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * ¿El mensaje confirma la acción externa de forma inequívoca?
 *
 * Conservadora a propósito: **la ambigüedad nunca es confirmación**. Se
 * descarta en cascada —pregunta, negación, matiz— y solo entonces se exige un
 * verbo que confirme explícitamente. Un asentimiento genérico no basta.
 *
 * Esta función es la red secundaria. El canal fiable es el botón del front,
 * que manda `confirmacion: true`; el texto libre solo confirma cuando no deja
 * lugar a duda.
 */
export function esConfirmacion(texto: string): boolean {
  // Una pregunta nunca es una orden, aunque empiece por "sí".
  if (texto.includes("?") || texto.includes("¿")) return false

  const limpio = normalizar(texto)
  if (limpio === "") return false
  if (NEGACIONES.test(limpio)) return false
  if (MATICES.test(limpio)) return false

  return VERBOS_CONFIRMACION.test(limpio)
}
