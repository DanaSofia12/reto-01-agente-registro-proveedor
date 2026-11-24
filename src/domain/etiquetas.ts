/**
 * Identificadores internos traducidos a lenguaje de oficina.
 *
 * `camara_comercio` es «el certificado de existencia»; el identificador sigue
 * en la bitácora y en los artefactos, pero no es lo que se lee en pantalla.
 */

/**
 * Nombre de cada soporte como lo pide el cliente.
 *
 * No sale del índice del repositorio: un soporte ausente no tiene entrada ahí,
 * y es justo el que hay que nombrar bien porque es el que bloquea la firma.
 */
const SOPORTES: Readonly<Record<string, string>> = {
  camara_comercio: "Certificado de existencia y representación legal",
  rut: "Registro Único Tributario (RUT)",
  certificacion_bancaria: "Certificación bancaria",
  estados_financieros: "Estados financieros auditados",
  parafiscales: "Certificación de aportes parafiscales",
  certificado_cumplimiento_tributario: "Certificado de cumplimiento tributario",
  certificado_iso_9001: "Certificado ISO 9001",
}

const PAISES: Readonly<Record<string, string>> = {
  CO: "Colombia",
  EC: "Ecuador",
  PE: "Perú",
  PA: "Panamá",
  HN: "Honduras",
}

/**
 * Último recurso: `certificado_de_algo` → «Certificado de algo».
 *
 * Se usa cuando llega un tipo que nadie previó. Es preferible a mostrar el
 * identificador crudo, y preferible a inventar un nombre bonito que no
 * corresponda con lo que el cliente pidió.
 */
export function humanizar(identificador: string): string {
  const palabras = identificador.replace(/[_-]+/g, " ").trim()
  if (palabras === "") return identificador
  return palabras.charAt(0).toUpperCase() + palabras.slice(1)
}

export function nombreSoporte(tipo: string): string {
  return SOPORTES[tipo] ?? humanizar(tipo)
}

export function nombrePais(codigo: string): string {
  return PAISES[codigo.toUpperCase()] ?? codigo
}

/** `2026-09-30` → `30 de septiembre de 2026`. Devuelve la entrada si no es una fecha. */
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const

export function fechaLarga(iso: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (partes === null) return iso
  const [, anio, mes, dia] = partes
  if (anio === undefined || mes === undefined || dia === undefined) return iso
  const nombreMes = MESES[Number(mes) - 1]
  if (nombreMes === undefined) return iso
  return `${Number(dia)} de ${nombreMes} de ${anio}`
}
