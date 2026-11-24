/**
 * Traducción de identificadores internos a lenguaje de oficina.
 *
 * La analista administrativa no trabaja con `camara_comercio` ni con
 * `co-industrias-delta`: trabaja con «el certificado de existencia» y con
 * «Industrias Delta». Cada vez que un identificador se escapa a la pantalla,
 * la interfaz le pide que piense como la base de datos.
 *
 * El identificador no desaparece —la bitácora y los artefactos lo conservan,
 * que para eso son auditables—, pero deja de ser lo que ella lee.
 */

/**
 * Nombre de cada soporte tal como lo pide el cliente en su correo.
 *
 * No sale del índice del repositorio a propósito: un soporte **ausente** no
 * tiene entrada en el índice, y es justo el que hay que nombrar bien, porque
 * es el que bloquea la firma.
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
