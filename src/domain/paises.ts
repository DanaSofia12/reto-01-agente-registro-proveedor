import type { Pais } from "./tipos.ts"

/**
 * RN1 — El identificador tributario cambia de nombre por país, pero Periferia
 * solo tiene NIT colombiano. Ver src/knowledge/registro-proveedor.md.
 */

const IDENTIFICADOR_POR_PAIS: Readonly<Record<Pais, string>> = {
  CO: "NIT",
  EC: "RUC",
  PE: "RUC",
  PA: "RUC",
  HN: "RTN",
}

/** La clave del maestro que guarda el identificador tributario. */
export const CLAVE_IDENTIFICADOR = "nit"

/**
 * Etiquetas que piden el identificador tributario sin nombrar el del país.
 * HU-1 pide reportarlas y proponer el equivalente local.
 */
const ETIQUETAS_AMBIGUAS = new Set([
  "identificacion tributaria",
  "numero de identificacion fiscal",
  "identificacion fiscal",
  "numero de identificacion tributaria",
])

export function identificadorDe(pais: Pais): string {
  return IDENTIFICADOR_POR_PAIS[pais]
}

export function esEtiquetaAmbigua(etiquetaNormalizada: string): boolean {
  return ETIQUETAS_AMBIGUAS.has(etiquetaNormalizada)
}

/**
 * Decide si un campo que resolvió a `nit` necesita confirmación humana.
 * Devuelve la nota a mostrar, o null si el valor se puede usar tal cual.
 */
export function notaIdentificador(
  pais: Pais,
  etiqueta: string,
  etiquetaNormalizada: string,
): string | null {
  const local = identificadorDe(pais)

  if (pais !== "CO") {
    return `identificador extranjero: "${etiqueta}" pide el ${local} de ${pais} y Periferia solo tiene NIT colombiano`
  }
  if (esEtiquetaAmbigua(etiquetaNormalizada)) {
    return `etiqueta ambigua: "${etiqueta}" se interpretó como ${local}, el identificador tributario de ${pais}`
  }
  return null
}
