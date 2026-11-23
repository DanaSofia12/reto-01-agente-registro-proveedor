/** Normalización y comparación de etiquetas. Sin IO. */

const DIACRITICOS = /[̀-ͯ]/g
const NO_ALFANUMERICO = /[^a-z0-9\s]/g
const ESPACIOS = /\s+/g

/** minúsculas, sin tildes, sin puntuación, espacios colapsados. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(DIACRITICOS, "")
    .toLowerCase()
    .replace(NO_ALFANUMERICO, " ")
    .replace(ESPACIOS, " ")
    .trim()
}

function bigramas(texto: string): Map<string, number> {
  const mapa = new Map<string, number>()
  for (let i = 0; i < texto.length - 1; i++) {
    const par = texto.slice(i, i + 2)
    mapa.set(par, (mapa.get(par) ?? 0) + 1)
  }
  return mapa
}

/**
 * Coeficiente de Sørensen–Dice sobre bigramas de caracteres: 0 a 1.
 * Elegido sobre Levenshtein porque tolera mejor el orden de las palabras
 * sin añadir dependencias.
 */
export function similitud(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0

  const ba = bigramas(a)
  const bb = bigramas(b)
  let comunes = 0
  let totalA = 0
  let totalB = 0

  for (const n of ba.values()) totalA += n
  for (const n of bb.values()) totalB += n
  for (const [par, n] of ba) comunes += Math.min(n, bb.get(par) ?? 0)

  return (2 * comunes) / (totalA + totalB)
}
