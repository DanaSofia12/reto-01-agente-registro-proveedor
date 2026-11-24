/**
 * Lo que la analista lee.
 *
 * El backend trabaja con identificadores —`proveedor_armar_paquete`,
 * `camara_comercio`, `co-industrias-delta`— porque son estables y auditables.
 * Nada de eso llega a la pantalla. Aquí se traduce una sola vez.
 *
 * La regla: si un identificador aparece en la interfaz, es un defecto.
 */

/** Cada herramienta, contada como la acción que significa para ella. */
const ACCIONES: Readonly<Record<string, string>> = {
  proveedor_leer_solicitud: "Leyó la solicitud del cliente",
  proveedor_mapear_campos: "Cruzó el formulario contra los datos de Periferia",
  proveedor_generar_formulario: "Diligenció el formulario",
  proveedor_armar_paquete: "Armó el paquete y revisó vigencias",
  proveedor_simular_envio: "Dejó registrada la constancia de envío",
}

/** Lo mismo, en presente, mientras el paso corre. */
const ACCIONES_EN_CURSO: Readonly<Record<string, string>> = {
  proveedor_leer_solicitud: "Leyendo la solicitud del cliente",
  proveedor_mapear_campos: "Cruzando el formulario contra los datos de Periferia",
  proveedor_generar_formulario: "Diligenciando el formulario",
  proveedor_armar_paquete: "Armando el paquete y revisando vigencias",
  proveedor_simular_envio: "Registrando la constancia de envío",
}

export function accion(herramienta: string): string {
  return ACCIONES[herramienta] ?? "Consultó el expediente"
}

export function accionEnCurso(herramienta: string): string {
  return ACCIONES_EN_CURSO[herramienta] ?? "Trabajando"
}

const PAISES: Readonly<Record<string, string>> = {
  CO: "Colombia",
  EC: "Ecuador",
  PE: "Perú",
  PA: "Panamá",
  HN: "Honduras",
}

export function nombrePais(codigo: string): string {
  return PAISES[codigo.toUpperCase()] ?? codigo
}

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
]

/** `2026-09-30` → `30 de septiembre de 2026`. Si no es fecha, la devuelve igual. */
export function fechaLarga(iso: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (partes === null) return iso
  const anio = partes[1]
  const mes = partes[2]
  const dia = partes[3]
  if (anio === undefined || mes === undefined || dia === undefined) return iso
  const nombreMes = MESES[Number(mes) - 1]
  if (nombreMes === undefined) return iso
  return `${Number(dia)} de ${nombreMes} de ${anio}`
}

/** `2026-09-30` → `30 sep`. Para las fichas estrechas del expediente. */
export function fechaCorta(iso: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (partes === null) return iso
  const mes = partes[2]
  const dia = partes[3]
  if (mes === undefined || dia === undefined) return iso
  const nombreMes = MESES[Number(mes) - 1]
  if (nombreMes === undefined) return iso
  return `${Number(dia)} ${nombreMes.slice(0, 3)}`
}

/**
 * El cuño de vigencia que va junto a cada soporte.
 *
 * Tres estados, en el vocabulario del dominio: lo que sirve, lo que está por
 * caducar y lo que impide que el representante legal firme.
 */
export type Vigencia = "vigente" | "porvencer" | "bloquea"

export interface Cuño {
  readonly estado: Vigencia
  readonly texto: string
}

/** Un soporte que vence dentro de este margen se marca aunque todavía sirva. */
const DIAS_DE_AVISO = 30

export function cuñoDeSoporte(item: {
  estado: string
  vigencia_hasta: string | null
  dias_restantes: number | null
  bloquea: boolean
}): Cuño {
  if (item.estado === "ausente") return { estado: "bloquea", texto: "no lo tenemos" }
  if (item.bloquea) return { estado: "bloquea", texto: "vencido" }
  if (item.vigencia_hasta === null) return { estado: "vigente", texto: "no vence" }

  const dias = item.dias_restantes
  if (dias !== null && dias <= DIAS_DE_AVISO) {
    return { estado: "porvencer", texto: dias === 1 ? "queda 1 día" : `quedan ${dias} días` }
  }
  return { estado: "vigente", texto: `hasta el ${fechaCorta(item.vigencia_hasta)}` }
}

/** Nombre de archivo → algo que se pueda leer en una lista. */
const ARTEFACTOS: Readonly<Record<string, string>> = {
  "formulario.xlsx": "Formulario diligenciado",
  "formulario.pdf": "Formulario diligenciado",
  "faltantes.md": "Qué falta y a quién pedírselo",
  "log.jsonl": "Registro de lo que hizo el agente",
  "ENVIO-SIMULADO.md": "Constancia de envío",
  "paquete/checklist.md": "Lista de verificación para la firma",
  "paquete/borrador-correo.md": "Borrador del correo de respuesta",
}

export function nombreArtefacto(ruta: string): string {
  const conocido = ARTEFACTOS[ruta]
  if (conocido !== undefined) return conocido
  const hoja = ruta.split("/").pop() ?? ruta
  if (ruta.startsWith("paquete/")) return `Soporte adjunto · ${hoja}`
  return hoja
}
