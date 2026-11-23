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

const NEGACIONES =
  /\b(no|nunca|jamas|todavia no|aun no|espera|cancela|cancelar|detente|para|mejor no|aun no)\b/

const AFIRMACIONES =
  /\b(si|confirmo|confirmado|confirma|envia|enviar|envialo|adelante|procede|proceder|dale|ok|okay|hazlo|correcto|de acuerdo|listo|aprobado|autorizo)\b/

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
 * ¿El mensaje confirma de forma inequívoca?
 *
 * Conservadora a propósito: la ambigüedad no es confirmación. Se comprueba la
 * negación primero, porque "no envíes" contiene "envíes".
 */
export function esConfirmacion(texto: string): boolean {
  const limpio = normalizar(texto)
  if (limpio === "") return false
  if (NEGACIONES.test(limpio)) return false
  return AFIRMACIONES.test(limpio)
}
