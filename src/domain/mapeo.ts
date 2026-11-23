import { CLAVE_IDENTIFICADOR, notaIdentificador } from "./paises.ts"
import { normalizar, similitud } from "./texto.ts"
import type {
  CampoFaltante,
  CampoLleno,
  CampoRequiereConfirmacion,
  CampoSolicitado,
  Mapeo,
  Pais,
} from "./tipos.ts"
import { formatearValor, leerRuta, type ValorMaestro } from "./valores.ts"

/**
 * HU-2 — Cruza cada campo solicitado con el repositorio maestro.
 * Función pura: mismas entradas, mismo resultado. Sin disco, sin red, sin reloj.
 */

/** Por debajo de esto el cruce no es confiable y el campo requiere confirmación. */
export const UMBRAL_CONFIANZA = 0.8

/**
 * Por debajo de esto ni siquiera hay candidato: el campo es faltante.
 *
 * Calibrado contra los fixtures, no elegido a ojo. Con un piso de 0.5,
 * "Número de contribuyente especial" cruzaba con "Número de cuenta" a 0.522 y
 * habría escrito el número de cuenta bancaria en ese campo. Los falsos
 * positivos observados se agrupan en 0.42–0.53 y los cruces legítimos superan
 * 0.95, así que 0.75 los separa con margen.
 */
export const PISO_CANDIDATO = 0.75

const CONFIANZA_EXACTA = 1
const CONFIANZA_NORMALIZADA = 0.95

interface Candidato {
  readonly clave: string
  readonly confianza: number
}

/** Índice del glosario por etiqueta normalizada, construido una vez por mapeo. */
function indexar(glosario: Record<string, string>): Map<string, string> {
  const indice = new Map<string, string>()
  for (const [etiqueta, clave] of Object.entries(glosario)) {
    indice.set(normalizar(etiqueta), clave)
  }
  return indice
}

function buscarCandidato(
  etiqueta: string,
  glosario: Record<string, string>,
  indice: Map<string, string>,
): Candidato | null {
  const exacta = glosario[etiqueta]
  if (exacta !== undefined) return { clave: exacta, confianza: CONFIANZA_EXACTA }

  const norma = normalizar(etiqueta)
  const normalizada = indice.get(norma)
  if (normalizada !== undefined) return { clave: normalizada, confianza: CONFIANZA_NORMALIZADA }

  let mejor: Candidato | null = null
  for (const [etiquetaIndice, clave] of indice) {
    const puntaje = similitud(norma, etiquetaIndice)
    if (mejor === null || puntaje > mejor.confianza) mejor = { clave, confianza: puntaje }
  }
  return mejor !== null && mejor.confianza >= PISO_CANDIDATO ? mejor : null
}

export interface EntradaMapeo {
  readonly campos: readonly CampoSolicitado[]
  readonly maestro: Record<string, ValorMaestro>
  readonly glosario: Record<string, string>
  readonly pais: Pais
}

export function mapearCampos({ campos, maestro, glosario, pais }: EntradaMapeo): Mapeo {
  const indice = indexar(glosario)
  const llenos: CampoLleno[] = []
  const faltantes: CampoFaltante[] = []
  const requiereConfirmacion: CampoRequiereConfirmacion[] = []

  for (const campo of campos) {
    const base = {
      etiqueta: campo.etiqueta,
      orden: campo.orden,
      obligatorio: campo.obligatorio,
      hoja: campo.hoja,
      celdaEtiqueta: campo.celdaEtiqueta,
      celdaValor: campo.celdaValor,
    }

    const candidato = buscarCandidato(campo.etiqueta, glosario, indice)
    if (candidato === null) {
      faltantes.push({
        ...base,
        estado: "faltante",
        valor: null,
        motivo: `"${campo.etiqueta}" no corresponde a ninguna clave del repositorio maestro`,
      })
      continue
    }

    // Un cruce dudoso se propone, pero NO se llena: escribir el valor de una
    // clave equivocada es peor que dejar el campo vacío, porque el error pasa
    // desapercibido. Se nombra el candidato para que la analista decida.
    if (candidato.confianza < UMBRAL_CONFIANZA) {
      requiereConfirmacion.push({
        ...base,
        estado: "requiere_confirmacion",
        valor: null,
        origen: null,
        confianza: candidato.confianza,
        nota: `cruce dudoso (${candidato.confianza.toFixed(2)}): "${campo.etiqueta}" se parece a "${candidato.clave}", pero no lo suficiente para usarlo. Queda vacío.`,
      })
      continue
    }

    const valor = formatearValor(leerRuta(maestro, candidato.clave))
    if (valor === null) {
      faltantes.push({
        ...base,
        estado: "faltante",
        valor: null,
        motivo: `la clave "${candidato.clave}" no tiene valor en el repositorio maestro`,
      })
      continue
    }

    // RN1 — el identificador tributario puede necesitar visto bueno humano.
    if (candidato.clave === CLAVE_IDENTIFICADOR) {
      const nota = notaIdentificador(pais, campo.etiqueta, normalizar(campo.etiqueta))
      if (nota !== null) {
        requiereConfirmacion.push({
          ...base,
          estado: "requiere_confirmacion",
          valor,
          origen: candidato.clave,
          confianza: candidato.confianza,
          nota,
        })
        continue
      }
    }

    llenos.push({
      ...base,
      estado: "lleno",
      valor,
      origen: candidato.clave,
      confianza: candidato.confianza,
    })
  }

  return { llenos, faltantes, requiere_confirmacion: requiereConfirmacion }
}
