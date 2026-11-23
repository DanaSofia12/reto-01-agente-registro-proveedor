import { z } from "zod"

/**
 * Configuración validada al arrancar. Falla ruidosamente aquí en vez de en la
 * primera petición de un martes.
 *
 * `process.env.X!` sería una bomba de tiempo: el `!` le miente al compilador y
 * el error aparece en runtime, lejos de la causa.
 */

const Entorno = z.object({
  LLM_PROVIDER: z.enum(["anthropic", "openai", "mock"]).default("anthropic"),
  LLM_MODEL: z.string().default("claude-haiku-5-5"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  MAX_ITERACIONES_TURNO: z.coerce.number().int().positive().max(100).default(25),
  MAX_TOKENS_SESION: z.coerce.number().int().positive().default(200_000),
  MAX_TOKENS_RESPUESTA: z.coerce.number().int().positive().default(16_000),
  FECHA_REFERENCIA: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
})

export type Configuracion = Readonly<z.infer<typeof Entorno>>

function leer(): Configuracion {
  const resultado = Entorno.safeParse(process.env)
  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n  ")
    throw new Error(`Configuración inválida:\n  ${detalle}\n\nRevisa .env.example`)
  }
  return resultado.data
}

export const config: Configuracion = leer()

/**
 * Fecha contra la que se evalúan las vigencias (RN3).
 *
 * Los fixtures fueron diseñados para una ejecución alrededor de 2026-09-03.
 * Hacerla configurable mantiene `demo.ts` determinista y permite demostrar el
 * camino feliz de co-industrias-delta, que con la fecha real del sistema
 * quedaría bloqueado por la cámara de comercio vencida.
 */
export function fechaReferencia(): Date {
  const crudo = config.FECHA_REFERENCIA?.trim()
  if (crudo === undefined || crudo === "") return new Date()
  const fecha = new Date(`${crudo}T00:00:00Z`)
  if (Number.isNaN(fecha.getTime())) {
    throw new Error(`FECHA_REFERENCIA inválida: "${crudo}". Formato esperado: AAAA-MM-DD`)
  }
  return fecha
}

/** Nunca expone la clave, ni su longitud, ni su prefijo (NFR Seguridad). */
export function hayClave(): boolean {
  if (config.LLM_PROVIDER === "mock") return true
  if (config.LLM_PROVIDER === "anthropic") return (config.ANTHROPIC_API_KEY ?? "") !== ""
  return (config.OPENAI_API_KEY ?? "") !== ""
}
