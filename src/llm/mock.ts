import type { LlamadaHerramienta, Mensaje, ProveedorLLM, RespuestaLLM } from "./adapter.ts"

/**
 * Proveedor falso y determinista.
 *
 * Permite probar el ciclo del agente —tope de iteraciones, manejo de errores,
 * flujo de confirmación— sin clave y sin red. Sin él, la única forma de
 * ejercitar el bucle sería gastar tokens en cada ejecución de la suite.
 */

export interface GuionTurno {
  readonly texto: string
  readonly llamadas: readonly { nombre: string; argumentos: unknown }[]
}

export function crearProveedorMock(guion: readonly GuionTurno[]): ProveedorLLM {
  let paso = 0

  return {
    nombre: "mock",
    modelo: "guion-determinista",

    async enviar(_mensajes: readonly Mensaje[]): Promise<RespuestaLLM> {
      const turno = guion[paso]
      paso += 1

      if (turno === undefined) {
        return {
          texto: "El guion del proveedor falso se agotó.",
          llamadas: [],
          uso: {
            tokensEntrada: 0,
            tokensSalida: 0,
            tokensCacheLectura: 0,
            tokensCacheEscritura: 0,
          },
        }
      }

      const llamadas: LlamadaHerramienta[] = turno.llamadas.map((l, i) => ({
        id: `mock-${paso}-${i}`,
        nombre: l.nombre,
        argumentos: l.argumentos,
      }))

      return {
        texto: turno.texto,
        llamadas,
        uso: {
          tokensEntrada: 100,
          tokensSalida: 50,
          tokensCacheLectura: 0,
          tokensCacheEscritura: 0,
        },
      }
    },
  }
}
