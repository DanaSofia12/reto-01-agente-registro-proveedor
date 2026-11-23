import { existsSync, readdirSync } from "node:fs"
import path from "node:path"

/**
 * Seguridad de rutas. El modelo elige el argumento `caso`, así que es entrada
 * no confiable: se valida con regex y se verifica contra el listado real.
 */

const CASO_VALIDO = /^[a-z0-9][a-z0-9-]{0,63}$/

export const RAIZ_FIXTURES = path.join("fixtures", "reto-01")
export const RAIZ_SALIDA = "out"

export class ErrorRuta extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "ErrorRuta"
  }
}

/** Resuelve `relativa` bajo `base` y verifica que no se escape. */
export function resolverDentro(base: string, ...relativa: string[]): string {
  const raiz = path.resolve(base)
  const destino = path.resolve(raiz, ...relativa)
  if (destino !== raiz && !destino.startsWith(raiz + path.sep)) {
    throw new ErrorRuta(`ruta fuera del directorio permitido: ${relativa.join("/")}`)
  }
  return destino
}

export function casosDisponibles(directory: string): string[] {
  const dir = path.join(directory, RAIZ_FIXTURES, "casos")
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}

/** Valida el nombre del caso y devuelve la ruta de su carpeta. Nunca acepta rutas. */
export function rutaCaso(directory: string, caso: string): string {
  if (!CASO_VALIDO.test(caso)) {
    throw new ErrorRuta(`nombre de caso inválido: "${caso}"`)
  }
  const disponibles = casosDisponibles(directory)
  if (!disponibles.includes(caso)) {
    throw new ErrorRuta(
      `caso no encontrado: "${caso}". Disponibles: ${disponibles.join(", ") || "ninguno"}`,
    )
  }
  return resolverDentro(path.join(directory, RAIZ_FIXTURES, "casos"), caso)
}

export function rutaRepositorio(directory: string, ...partes: string[]): string {
  return resolverDentro(path.join(directory, RAIZ_FIXTURES), "repositorio", ...partes)
}

export function rutaGlosario(directory: string): string {
  return resolverDentro(path.join(directory, RAIZ_FIXTURES), "glosario-campos.json")
}

/** Toda escritura pasa por aquí: confina la salida a `out/`. */
export function rutaSalida(directory: string, ...partes: string[]): string {
  return resolverDentro(path.join(directory, RAIZ_SALIDA), ...partes)
}
