import { z } from "zod"
import type { ContextoHerramienta } from "../domain/tipos.ts"
import { entrada, registrar as registrarEnBitacora } from "../infra/bitacora.ts"
import * as proveedor from "./proveedor.ts"

/**
 * Registro de herramientas.
 *
 * El nombre que ve el modelo es `<archivo>_<export>`, así que todo lo exportado
 * por `proveedor.ts` se publica como `proveedor_<export>`. Añadir una
 * herramienta es exportarla allí: este archivo no cambia.
 */

export interface Herramienta {
  readonly description: string
  readonly args: Record<string, z.ZodType>
  execute(args: never, ctx: ContextoHerramienta): Promise<string>
}

export interface HerramientaRegistrada {
  readonly nombre: string
  readonly descripcion: string
  /** JSON Schema derivado de los mismos zod que validan. Una sola fuente de verdad. */
  readonly esquema: Record<string, unknown>
  ejecutar(argumentos: unknown, ctx: ContextoHerramienta): Promise<string>
}

function esHerramienta(valor: unknown): valor is Herramienta {
  if (typeof valor !== "object" || valor === null) return false
  const candidata = valor as Partial<Herramienta>
  return (
    typeof candidata.description === "string" &&
    typeof candidata.args === "object" &&
    candidata.args !== null &&
    typeof candidata.execute === "function"
  )
}

function registrar(archivo: string, modulo: Record<string, unknown>): HerramientaRegistrada[] {
  const registradas: HerramientaRegistrada[] = []

  for (const [exportado, valor] of Object.entries(modulo)) {
    if (!esHerramienta(valor)) continue

    const esquemaZod = z.object(valor.args)
    const nombre = `${archivo}_${exportado}`

    registradas.push({
      nombre,
      descripcion: valor.description,
      esquema: z.toJSONSchema(esquemaZod, { target: "draft-7" }) as Record<string, unknown>,

      async ejecutar(argumentos, ctx) {
        // El backend valida ANTES de ejecutar y devuelve el error al modelo,
        // no a la analista: el modelo corrige los argumentos y reintenta (§6.2).
        const validados = esquemaZod.safeParse(argumentos ?? {})
        if (!validados.success) {
          const detalle = validados.error.issues
            .map((i) => `${i.path.join(".") || "argumentos"}: ${i.message}`)
            .join("; ")
          const error = `argumentos inválidos para ${nombre} — ${detalle}`
          // CA4 dice "toda llamada": una rechazada por zod también se registra.
          try {
            registrarEnBitacora(ctx.directory, null, entrada(nombre, false, error))
          } catch {
            // La bitácora es best-effort; el error del modelo es lo importante.
          }
          return JSON.stringify({ ok: false, error })
        }
        return valor.execute(validados.data as never, ctx)
      },
    })
  }

  return registradas.sort((a, b) => a.nombre.localeCompare(b.nombre))
}

/** Orden estable: el prefijo de la petición debe ser idéntico para que el caché sirva. */
export const HERRAMIENTAS: readonly HerramientaRegistrada[] = registrar(
  "proveedor",
  proveedor as unknown as Record<string, unknown>,
)

const PORNOMBRE = new Map(HERRAMIENTAS.map((h) => [h.nombre, h]))

export function buscarHerramienta(nombre: string): HerramientaRegistrada | undefined {
  return PORNOMBRE.get(nombre)
}
