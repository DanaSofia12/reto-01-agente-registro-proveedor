import { nombreSoporte } from "./etiquetas.ts"
import type { Checklist, ItemChecklist, SoporteIndexado } from "./tipos.ts"

/**
 * RN3 — Qué bloquea la firma del representante legal.
 *
 * La distinción no es arbitraria: un soporte ausente o vencido se tramita
 * afuera y toma días; un campo faltante lo responde alguien de Periferia en
 * minutos. Ver src/knowledge/registro-proveedor.md.
 */

const MS_POR_DIA = 86_400_000

/** Compara solo la parte de fecha, en UTC, para no depender de la zona horaria. */
function aDiaUtc(fecha: Date): number {
  return Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate())
}

function diasHasta(vigenciaHasta: string, fechaReferencia: Date): number {
  const vence = new Date(`${vigenciaHasta}T00:00:00Z`)
  return Math.round((aDiaUtc(vence) - aDiaUtc(fechaReferencia)) / MS_POR_DIA)
}

export function evaluarSoporte(
  tipo: string,
  soporte: SoporteIndexado | undefined,
  fechaReferencia: Date,
): ItemChecklist {
  if (soporte === undefined) {
    return {
      tipo,
      nombre: nombreSoporte(tipo),
      estado: "ausente",
      archivo: null,
      vigenciaHasta: null,
      diasRestantes: null,
      bloquea: true,
    }
  }

  // Un soporte sin fecha de vigencia no vence nunca (el RUT es el caso).
  if (soporte.vigenciaHasta === null) {
    return {
      tipo,
      nombre: nombreSoporte(tipo),
      estado: "presente",
      archivo: soporte.archivo,
      vigenciaHasta: null,
      diasRestantes: null,
      bloquea: false,
    }
  }

  const dias = diasHasta(soporte.vigenciaHasta, fechaReferencia)
  const vencido = dias < 0
  return {
    tipo,
    nombre: nombreSoporte(tipo),
    estado: vencido ? "vencido" : "presente",
    archivo: soporte.archivo,
    vigenciaHasta: soporte.vigenciaHasta,
    diasRestantes: dias,
    bloquea: vencido,
  }
}

export interface EntradaChecklist {
  readonly soportesExigidos: readonly string[]
  readonly indice: readonly SoporteIndexado[]
  readonly camposFaltantes: readonly string[]
  readonly fechaReferencia: Date
}

export function construirChecklist({
  soportesExigidos,
  indice,
  camposFaltantes,
  fechaReferencia,
}: EntradaChecklist): Checklist {
  const porTipo = new Map(indice.map((s) => [s.tipo, s]))
  const items = soportesExigidos.map((tipo) =>
    evaluarSoporte(tipo, porTipo.get(tipo), fechaReferencia),
  )

  return {
    fechaReferencia: fechaReferencia.toISOString().slice(0, 10),
    items,
    // Un campo faltante NO bloquea; un soporte ausente o vencido sí.
    listoParaFirma: items.every((i) => !i.bloquea),
    camposFaltantes,
  }
}
