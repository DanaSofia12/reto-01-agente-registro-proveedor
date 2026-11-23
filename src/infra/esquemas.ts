import { z } from "zod"

/**
 * Esquemas de los fixtures. Validar al leer convierte "plantilla corrupta"
 * en un error legible en vez de en un `undefined` tres capas más abajo (HU-5).
 */

export const PaisSchema = z.enum(["CO", "EC", "PE", "PA", "HN"])
export const FormatoSchema = z.enum(["xlsx", "pdf", "portal"])

export const SolicitudSchema = z.object({
  id: z.string(),
  de: z.string(),
  // §7.1 del PRD no lo lista; los fixtures sí lo traen.
  para: z.string().default(""),
  asunto: z.string(),
  fecha: z.string(),
  pais: PaisSchema,
  cliente: z.string(),
  formato: FormatoSchema,
  cuerpo: z.string(),
  adjuntos: z.array(z.string()).default([]),
})

export const PlantillaCeldasSchema = z.array(
  z.object({
    hoja: z.string(),
    celda_etiqueta: z.string(),
    etiqueta: z.string(),
    celda_valor: z.string(),
  }),
)

export const PlantillaCamposSchema = z.array(
  z.object({
    etiqueta: z.string(),
    obligatorio: z.boolean().default(false),
  }),
)

export const SoportesExigidosSchema = z.array(z.string())

export const IndiceSoportesSchema = z.array(
  z.object({
    tipo: z.string(),
    archivo: z.string(),
    vigencia_hasta: z.string().nullable(),
    pais_emisor: z.string(),
    descripcion: z.string().default(""),
  }),
)

export const GlosarioSchema = z.record(z.string(), z.string())
export const MaestroSchema = z.record(z.string(), z.unknown())
