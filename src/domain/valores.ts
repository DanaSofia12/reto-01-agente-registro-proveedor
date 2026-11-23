/** Lectura y formateo de valores del repositorio maestro. Sin IO. */

export type ValorMaestro =
  | string
  | number
  | boolean
  | null
  | undefined
  | ValorMaestro[]
  | { [k: string]: ValorMaestro }

const formatoNumero = new Intl.NumberFormat("es-CO")

/**
 * Resuelve una ruta con punto (`banco.numero_cuenta`) dentro del maestro.
 * Devuelve `undefined` si algún tramo no existe — nunca lanza.
 */
export function leerRuta(maestro: Record<string, ValorMaestro>, ruta: string): ValorMaestro {
  let actual: ValorMaestro = maestro
  for (const tramo of ruta.split(".")) {
    if (
      actual === null ||
      actual === undefined ||
      typeof actual !== "object" ||
      Array.isArray(actual)
    ) {
      return undefined
    }
    actual = (actual as Record<string, ValorMaestro>)[tramo]
  }
  return actual
}

/**
 * Convierte un valor del maestro a texto para el formulario.
 * Determinista: el mismo valor produce la misma cadena en cada ejecución.
 */
export function formatearValor(valor: ValorMaestro): string | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === "string") return valor
  if (typeof valor === "number") return formatoNumero.format(valor)
  if (typeof valor === "boolean") return valor ? "Sí" : "No"
  if (Array.isArray(valor)) {
    const partes = valor.map(formatearValor).filter((v): v is string => v !== null)
    return partes.length > 0 ? partes.join(", ") : null
  }
  return null
}
