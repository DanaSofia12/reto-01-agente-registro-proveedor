/**
 * Interfaz propia del proveedor de modelo.
 *
 * El ciclo del agente habla solo con estos tipos. Cambiar de proveedor es
 * escribir otra implementación de `ProveedorLLM` y cambiar `LLM_PROVIDER`:
 * `src/agent/ciclo.ts` no se toca (§6.1 del PRD).
 */

export interface LlamadaHerramienta {
  readonly id: string
  readonly nombre: string
  readonly argumentos: unknown
}

export interface ResultadoHerramienta {
  readonly id: string
  readonly contenido: string
}

export type Mensaje =
  | { readonly rol: "usuario"; readonly texto: string }
  | {
      readonly rol: "asistente"
      readonly texto: string
      readonly llamadas: readonly LlamadaHerramienta[]
    }
  | { readonly rol: "resultados"; readonly resultados: readonly ResultadoHerramienta[] }

export interface HerramientaLLM {
  readonly nombre: string
  readonly descripcion: string
  readonly esquema: Record<string, unknown>
}

export interface Uso {
  readonly tokensEntrada: number
  readonly tokensSalida: number
  readonly tokensCacheLectura: number
  readonly tokensCacheEscritura: number
}

export const USO_CERO: Uso = {
  tokensEntrada: 0,
  tokensSalida: 0,
  tokensCacheLectura: 0,
  tokensCacheEscritura: 0,
}

export function sumarUso(a: Uso, b: Uso): Uso {
  return {
    tokensEntrada: a.tokensEntrada + b.tokensEntrada,
    tokensSalida: a.tokensSalida + b.tokensSalida,
    tokensCacheLectura: a.tokensCacheLectura + b.tokensCacheLectura,
    tokensCacheEscritura: a.tokensCacheEscritura + b.tokensCacheEscritura,
  }
}

export interface RespuestaLLM {
  readonly texto: string
  readonly llamadas: readonly LlamadaHerramienta[]
  readonly uso: Uso
}

export interface OpcionesEnvio {
  readonly sistema: string
  readonly maxTokens: number
  readonly timeoutMs: number
}

export interface ProveedorLLM {
  readonly nombre: string
  readonly modelo: string
  enviar(
    mensajes: readonly Mensaje[],
    herramientas: readonly HerramientaLLM[],
    opciones: OpcionesEnvio,
  ): Promise<RespuestaLLM>
}

/** Error del proveedor, ya traducido a lenguaje de la analista (CA5). */
export class ErrorProveedor extends Error {
  constructor(
    mensaje: string,
    readonly reintentable: boolean,
    options?: { cause?: unknown },
  ) {
    super(mensaje, options)
    this.name = "ErrorProveedor"
  }
}

/** Timeout compartido por las implementaciones: ninguna cuelga la sesión. */
export async function conTimeout<T>(promesa: Promise<T>, ms: number, queHacia: string): Promise<T> {
  const señal = AbortSignal.timeout(ms)
  return await Promise.race([
    promesa,
    new Promise<never>((_, rechazar) => {
      señal.addEventListener("abort", () =>
        rechazar(
          new ErrorProveedor(
            `el proveedor de modelo no respondió en ${Math.round(ms / 1000)} s al ${queHacia}`,
            true,
          ),
        ),
      )
    }),
  ])
}
