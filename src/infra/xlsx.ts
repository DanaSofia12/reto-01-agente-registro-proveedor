import ExcelJS from "exceljs"
import type { CampoMapeado } from "../domain/tipos.ts"

/**
 * HU-3 P0 — Escribe cada etiqueta y su valor exactamente en la hoja y celda
 * que indica `plantilla-celdas.json`. El sistema del cliente lee celdas fijas:
 * reformatear no es una opción.
 */

/** Ámbar suave para el valor que falta y el que necesita visto bueno. */
const RELLENO_ATENCION: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFDF2D8" },
}

export async function generarXlsx(campos: readonly CampoMapeado[]): Promise<Uint8Array> {
  const libro = new ExcelJS.Workbook()
  libro.creator = "Agente de registro como proveedor"

  for (const campo of campos) {
    if (
      campo.hoja === undefined ||
      campo.celdaEtiqueta === undefined ||
      campo.celdaValor === undefined
    ) {
      continue
    }
    const hoja = libro.getWorksheet(campo.hoja) ?? libro.addWorksheet(campo.hoja)

    const celdaEtiqueta = hoja.getCell(campo.celdaEtiqueta)
    celdaEtiqueta.value = campo.etiqueta
    celdaEtiqueta.font = { bold: true }

    const celdaValor = hoja.getCell(campo.celdaValor)
    // Un campo faltante queda vacío y marcado. Nunca se inventa un valor.
    celdaValor.value = campo.valor ?? ""
    if (campo.estado !== "lleno") celdaValor.fill = RELLENO_ATENCION
  }

  // Ancho legible sin tocar el contenido.
  for (const hoja of libro.worksheets) {
    hoja.columns.forEach((columna) => {
      columna.width = Math.max(columna.width ?? 10, 28)
    })
  }

  const buffer = await libro.xlsx.writeBuffer()
  return new Uint8Array(buffer as ArrayBuffer)
}
