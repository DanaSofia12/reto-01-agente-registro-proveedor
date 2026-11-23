import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib"
import type { CampoMapeado, Solicitud } from "../domain/tipos.ts"

/**
 * HU-3 P1 — PDF generado (no AcroForm rellenado), con todos los campos en el
 * orden que define `plantilla-campos.json`.
 */

const A4: [number, number] = [595.28, 841.89]
const MARGEN = 56
const INTERLINEA = 15
const TINTA = rgb(0.08, 0.12, 0.1)
const SUAVE = rgb(0.37, 0.42, 0.39)
const ATENCION = rgb(0.54, 0.38, 0.08)
const AUSENTE = rgb(0.54, 0.18, 0.21)

/**
 * Las fuentes estándar usan WinAnsi, que cubre Latin-1 (acentos y ñ incluidos)
 * pero no comillas tipográficas ni rayas. Se sustituyen para no romper el
 * documento por un guion largo.
 */
const SUSTITUCIONES: ReadonlyArray<readonly [RegExp, string]> = [
  [/[‘’‛]/g, "'"],
  [/[“”‟]/g, '"'],
  [/[–—−]/g, "-"],
  [/…/g, "..."],
  [/[   ]/g, " "],
]

function aWinAnsi(texto: string): string {
  let salida = texto
  for (const [patron, reemplazo] of SUSTITUCIONES) salida = salida.replace(patron, reemplazo)
  // Último recurso: lo que quede fuera de Latin-1 se vuelve "?" en vez de lanzar.
  return salida.replace(/[^ -ÿ]/g, "?")
}

function partirEnLineas(texto: string, fuente: PDFFont, tam: number, ancho: number): string[] {
  const palabras = aWinAnsi(texto).split(" ")
  const lineas: string[] = []
  let actual = ""
  for (const palabra of palabras) {
    const tentativa = actual === "" ? palabra : `${actual} ${palabra}`
    if (fuente.widthOfTextAtSize(tentativa, tam) > ancho && actual !== "") {
      lineas.push(actual)
      actual = palabra
    } else {
      actual = tentativa
    }
  }
  if (actual !== "") lineas.push(actual)
  return lineas
}

interface Lienzo {
  pagina: PDFPage
  y: number
}

export async function generarPdf(
  solicitud: Solicitud,
  campos: readonly CampoMapeado[],
  fechaReferencia: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Registro como proveedor - ${solicitud.cliente}`)
  doc.setProducer("Agente de registro como proveedor")

  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold)
  const anchoUtil = A4[0] - MARGEN * 2

  const lienzo: Lienzo = { pagina: doc.addPage(A4), y: A4[1] - MARGEN }

  const saltoSiHaceFalta = (alto: number): void => {
    if (lienzo.y - alto < MARGEN) {
      lienzo.pagina = doc.addPage(A4)
      lienzo.y = A4[1] - MARGEN
    }
  }

  const escribir = (
    texto: string,
    opciones: {
      fuente?: PDFFont
      tam?: number
      color?: ReturnType<typeof rgb>
      sangria?: number
    } = {},
  ): void => {
    const fuente = opciones.fuente ?? regular
    const tam = opciones.tam ?? 10
    const sangria = opciones.sangria ?? 0
    for (const linea of partirEnLineas(texto, fuente, tam, anchoUtil - sangria)) {
      saltoSiHaceFalta(INTERLINEA)
      lienzo.pagina.drawText(linea, {
        x: MARGEN + sangria,
        y: lienzo.y,
        size: tam,
        font: fuente,
        color: opciones.color ?? TINTA,
      })
      lienzo.y -= INTERLINEA
    }
  }

  escribir("Formulario de registro como proveedor", { fuente: negrita, tam: 16 })
  lienzo.y -= 4
  escribir(solicitud.cliente, { tam: 11, color: SUAVE })
  escribir(`Solicitud ${solicitud.id} - ${solicitud.pais} - generado ${fechaReferencia}`, {
    tam: 9,
    color: SUAVE,
  })
  lienzo.y -= 10

  saltoSiHaceFalta(INTERLINEA)
  lienzo.pagina.drawLine({
    start: { x: MARGEN, y: lienzo.y },
    end: { x: A4[0] - MARGEN, y: lienzo.y },
    thickness: 0.7,
    color: SUAVE,
  })
  lienzo.y -= 20

  for (const campo of campos) {
    saltoSiHaceFalta(INTERLINEA * 3)
    const obligatorio = campo.obligatorio === true ? " *" : ""
    escribir(`${campo.etiqueta}${obligatorio}`, { fuente: negrita, tam: 10 })

    if (campo.estado === "faltante") {
      escribir("- sin dato en el repositorio maestro", { tam: 10, color: AUSENTE, sangria: 12 })
    } else if (campo.estado === "requiere_confirmacion") {
      escribir(campo.valor ?? "-", { tam: 11, sangria: 12 })
      escribir(`requiere confirmacion: ${campo.nota}`, { tam: 8, color: ATENCION, sangria: 12 })
    } else {
      escribir(campo.valor, { tam: 11, sangria: 12 })
    }
    lienzo.y -= 7
  }

  lienzo.y -= 14
  saltoSiHaceFalta(INTERLINEA * 4)
  escribir("* campo obligatorio segun la plantilla del cliente", { tam: 8, color: SUAVE })
  lienzo.y -= 6
  escribir("Firma del representante legal:", { fuente: negrita, tam: 10 })
  lienzo.y -= 24
  saltoSiHaceFalta(INTERLINEA)
  lienzo.pagina.drawLine({
    start: { x: MARGEN, y: lienzo.y },
    end: { x: MARGEN + 240, y: lienzo.y },
    thickness: 0.7,
    color: TINTA,
  })

  return doc.save()
}
