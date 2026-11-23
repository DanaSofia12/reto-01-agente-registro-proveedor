import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import type { z } from "zod"
import type { CampoSolicitado, Solicitud, SoporteIndexado } from "../domain/tipos.ts"
import type { ValorMaestro } from "../domain/valores.ts"
import {
  GlosarioSchema,
  IndiceSoportesSchema,
  MaestroSchema,
  PlantillaCamposSchema,
  PlantillaCeldasSchema,
  SolicitudSchema,
  SoportesExigidosSchema,
} from "./esquemas.ts"
import { ErrorRuta, rutaCaso, rutaGlosario, rutaRepositorio } from "./rutas.ts"

/** Lectura de `fixtures/`. Solo lectura: nada de este módulo escribe. */

export class ErrorFixture extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "ErrorFixture"
  }
}

function leerJson<T>(ruta: string, esquema: z.ZodType<T>, etiqueta: string): T {
  if (!existsSync(ruta)) {
    throw new ErrorFixture(`falta el archivo ${etiqueta} (${path.basename(ruta)})`)
  }
  let crudo: unknown
  try {
    crudo = JSON.parse(readFileSync(ruta, "utf8"))
  } catch {
    throw new ErrorFixture(`el archivo ${etiqueta} no es JSON válido`)
  }
  const resultado = esquema.safeParse(crudo)
  if (!resultado.success) {
    const primero = resultado.error.issues[0]
    const donde = primero?.path.join(".") || "raíz"
    throw new ErrorFixture(`${etiqueta} tiene una estructura inesperada en "${donde}"`)
  }
  return resultado.data
}

export function leerSolicitud(directory: string, caso: string): Solicitud {
  const dir = rutaCaso(directory, caso)
  return leerJson(path.join(dir, "solicitud.json"), SolicitudSchema, "la solicitud")
}

/**
 * Normaliza la plantilla del formato que sea a una lista única de campos.
 * `portal` no trae plantilla: el cliente solo da una URL.
 */
export function leerCampos(
  directory: string,
  solicitud: Solicitud,
  caso: string,
): CampoSolicitado[] {
  const dir = rutaCaso(directory, caso)

  if (solicitud.formato === "xlsx") {
    const celdas = leerJson(
      path.join(dir, "plantilla-celdas.json"),
      PlantillaCeldasSchema,
      "la plantilla de celdas",
    )
    return celdas.map((c, i) => ({
      etiqueta: c.etiqueta,
      orden: i,
      hoja: c.hoja,
      celdaEtiqueta: c.celda_etiqueta,
      celdaValor: c.celda_valor,
    }))
  }

  if (solicitud.formato === "pdf") {
    const campos = leerJson(
      path.join(dir, "plantilla-campos.json"),
      PlantillaCamposSchema,
      "la plantilla de campos",
    )
    return campos.map((c, i) => ({ etiqueta: c.etiqueta, orden: i, obligatorio: c.obligatorio }))
  }

  // Portal: la lista de campos sale de la plantilla si el cliente la adjuntó.
  const rutaCampos = path.join(dir, "plantilla-campos.json")
  if (!existsSync(rutaCampos)) return []
  const campos = leerJson(rutaCampos, PlantillaCamposSchema, "la plantilla de campos")
  return campos.map((c, i) => ({ etiqueta: c.etiqueta, orden: i, obligatorio: c.obligatorio }))
}

export function leerSoportesExigidos(directory: string, caso: string): string[] {
  const dir = rutaCaso(directory, caso)
  return leerJson(
    path.join(dir, "soportes-exigidos.json"),
    SoportesExigidosSchema,
    "la lista de soportes exigidos",
  )
}

export function leerMaestro(directory: string): Record<string, ValorMaestro> {
  const ruta = rutaRepositorio(directory, "maestro.json")
  return leerJson(ruta, MaestroSchema, "el repositorio maestro") as Record<string, ValorMaestro>
}

export function leerGlosario(directory: string): Record<string, string> {
  return leerJson(rutaGlosario(directory), GlosarioSchema, "el glosario de campos")
}

export function leerIndiceSoportes(directory: string): SoporteIndexado[] {
  const ruta = rutaRepositorio(directory, "soportes", "index.json")
  const crudo = leerJson(ruta, IndiceSoportesSchema, "el índice de soportes")
  return crudo.map((s) => ({
    tipo: s.tipo,
    archivo: s.archivo,
    vigenciaHasta: s.vigencia_hasta,
    paisEmisor: s.pais_emisor,
    descripcion: s.descripcion,
  }))
}

export function rutaArchivoSoporte(directory: string, archivo: string): string {
  if (archivo.includes("/") || archivo.includes("\\") || archivo.includes("..")) {
    throw new ErrorRuta(`nombre de soporte inválido: "${archivo}"`)
  }
  return rutaRepositorio(directory, "soportes", archivo)
}
