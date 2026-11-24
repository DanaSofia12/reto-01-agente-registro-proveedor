import type { RegistroLlamada } from "./api.ts"
import type { EstadoSolicitud } from "./componentes/Avatar.tsx"

/**
 * La frontera entre el dominio y la pantalla.
 *
 * El backend trabaja con identificadores —`proveedor_armar_paquete`,
 * `camara_comercio`, `co-industrias-delta`— porque son estables y auditables.
 * Nada de eso llega a la interfaz: si un identificador aparece en pantalla, es
 * un defecto. La traducción ocurre aquí, una sola vez.
 */

/** Cada herramienta contada como la acción que significa, en los dos tiempos. */
const ACCIONES: Readonly<Record<string, { hecho: string; haciendo: string }>> = {
  proveedor_leer_solicitud: {
    hecho: "Leyó la solicitud del cliente",
    haciendo: "Leyendo la solicitud del cliente",
  },
  proveedor_mapear_campos: {
    hecho: "Cruzó el formulario contra los datos de Periferia",
    haciendo: "Cruzando el formulario contra los datos de Periferia",
  },
  proveedor_generar_formulario: {
    hecho: "Diligenció el formulario",
    haciendo: "Diligenciando el formulario",
  },
  proveedor_armar_paquete: {
    hecho: "Armó el paquete y revisó vigencias",
    haciendo: "Armando el paquete y revisando vigencias",
  },
  proveedor_simular_envio: {
    hecho: "Dejó registrada la constancia de envío",
    haciendo: "Registrando la constancia de envío",
  },
}

const SIN_NOMBRE = { hecho: "Consultó el expediente", haciendo: "Trabajando" } as const

export function accion(herramienta: string, enCurso = false): string {
  const par = ACCIONES[herramienta] ?? SIN_NOMBRE
  return enCurso ? par.haciendo : par.hecho
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

/** `2026-09-30` → `30 de septiembre de 2026`. Devuelve la entrada si no es fecha. */
export function fechaLarga(iso: string, conAnio = true): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (partes === null) return iso
  const anio = partes[1]
  const mes = partes[2]
  const dia = partes[3]
  if (anio === undefined || mes === undefined || dia === undefined) return iso
  const nombreMes = MESES[Number(mes) - 1]
  if (nombreMes === undefined) return iso
  return conAnio ? `${Number(dia)} de ${nombreMes} de ${anio}` : `${Number(dia)} de ${nombreMes}`
}

// ─── Vigencia de un soporte ───────────────────────────────────────────────────

export interface ItemSoporte {
  readonly tipo: string
  readonly nombre?: string
  readonly estado: string
  readonly vigencia_hasta: string | null
  readonly dias_restantes: number | null
  readonly bloquea: boolean
}

export type Vigencia = "vigente" | "por_vencer" | "bloquea"

/** Un soporte que vence dentro de este margen se marca aunque todavía sirva. */
const DIAS_DE_AVISO = 30

export function vigenciaDe(item: ItemSoporte): { estado: Vigencia; texto: string } {
  if (item.estado === "ausente") return { estado: "bloquea", texto: "No lo tenemos" }
  if (item.bloquea) return { estado: "bloquea", texto: "Vencido" }
  if (item.vigencia_hasta === null) return { estado: "vigente", texto: "No vence" }

  const dias = item.dias_restantes
  if (dias !== null && dias <= DIAS_DE_AVISO) {
    return { estado: "por_vencer", texto: dias === 1 ? "Queda 1 día" : `Quedan ${dias} días` }
  }
  return { estado: "vigente", texto: `Vence el ${fechaLarga(item.vigencia_hasta, false)}` }
}

// ─── Lectura de los resultados de herramienta ─────────────────────────────────

/**
 * Último resultado correcto de una herramienta, o `null`.
 *
 * Devolver siempre un objeto evitaría un `if` en cada consumidor, pero mentiría:
 * «no se ha ejecutado» y «se ejecutó y no encontró nada» son estados distintos y
 * la interfaz los pinta distinto.
 */
export function ultimoResultado(
  llamadas: readonly RegistroLlamada[],
  herramienta: string,
): Record<string, unknown> | null {
  for (let i = llamadas.length - 1; i >= 0; i--) {
    const l = llamadas[i]
    if (
      l?.nombre === herramienta &&
      l.ok &&
      typeof l.resultado === "object" &&
      l.resultado !== null
    ) {
      return l.resultado as Record<string, unknown>
    }
  }
  return null
}

/** Lista de un resultado. Vacía si no está: el consumidor nunca comprueba nulos. */
export function lista<T>(datos: Record<string, unknown> | null, clave: string): readonly T[] {
  if (datos === null) return []
  const valor = datos[clave]
  return Array.isArray(valor) ? (valor as T[]) : []
}

// ─── Estado de una solicitud, para la bandeja ─────────────────────────────────

export interface MarcaDeCaso {
  readonly estado: EstadoSolicitud
  readonly resumen: string
}

interface CampoPendiente {
  readonly etiqueta: string
}

/**
 * Qué mostrar junto a un cliente en la bandeja.
 *
 * El orden importa: lo que impide firmar gana sobre lo que solo pide una
 * decisión, y eso gana sobre estar listo. La analista necesita ver primero lo
 * que la bloquea.
 */
export function marcarCaso(llamadas: readonly RegistroLlamada[]): MarcaDeCaso | null {
  const paquete = ultimoResultado(llamadas, "proveedor_armar_paquete")
  const mapeo = ultimoResultado(llamadas, "proveedor_mapear_campos")
  if (paquete === null && mapeo === null) return null

  const bloqueos = lista<ItemSoporte>(paquete, "checklist").filter((i) => i.bloquea)
  if (bloqueos.length > 0) {
    const primero = bloqueos[0]
    return {
      estado: "bloqueada",
      resumen:
        bloqueos.length === 1 && primero !== undefined
          ? `Falta ${(primero.nombre ?? primero.tipo).toLowerCase()}`
          : `Faltan ${bloqueos.length} soportes`,
    }
  }

  const porConfirmar = lista<CampoPendiente>(mapeo, "requiere_confirmacion")
  if (porConfirmar.length > 0) {
    const primero = porConfirmar[0]
    return {
      estado: "decidir",
      resumen:
        porConfirmar.length === 1 && primero !== undefined
          ? `Confirma ${primero.etiqueta}`
          : `${porConfirmar.length} campos por confirmar`,
    }
  }

  if (paquete?.listo_para_firma === true) {
    return { estado: "lista", resumen: "Lista para firma" }
  }
  return { estado: "sin_revisar", resumen: "En revisión" }
}

// ─── Nombres de archivo ──────────────────────────────────────────────────────

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
  return ruta.startsWith("paquete/") ? `Soporte adjunto: ${hoja}` : hoja
}
