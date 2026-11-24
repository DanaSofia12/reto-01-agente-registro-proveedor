/**
 * Tipos del dominio. Sin IO, sin framework.
 * Contrato compartido por herramientas, ciclo del agente, front y tests.
 */

export type Pais = "CO" | "EC" | "PE" | "PA" | "HN"
export type Formato = "xlsx" | "pdf" | "portal"

// ─── Entrada: fixtures ────────────────────────────────────────────────────────

export interface Solicitud {
  readonly id: string
  readonly de: string
  readonly para: string
  readonly asunto: string
  readonly fecha: string
  readonly pais: Pais
  readonly cliente: string
  readonly formato: Formato
  readonly cuerpo: string
  readonly adjuntos: readonly string[]
}

/** Campo solicitado, normalizado para que el mapeo no sepa de qué formato vino. */
export interface CampoSolicitado {
  readonly etiqueta: string
  readonly orden: number
  readonly obligatorio?: boolean
  readonly hoja?: string
  readonly celdaEtiqueta?: string
  readonly celdaValor?: string
}

export interface SoporteIndexado {
  readonly tipo: string
  readonly archivo: string
  /** `null` = no vence. */
  readonly vigenciaHasta: string | null
  readonly paisEmisor: string
  readonly descripcion: string
}

// ─── Mapeo (HU-2) ─────────────────────────────────────────────────────────────

export type EstadoCampo = "lleno" | "faltante" | "requiere_confirmacion"

interface CampoBase {
  readonly etiqueta: string
  readonly orden: number
  readonly obligatorio?: boolean
  readonly hoja?: string
  readonly celdaEtiqueta?: string
  readonly celdaValor?: string
}

export interface CampoLleno extends CampoBase {
  readonly estado: "lleno"
  readonly valor: string
  /** Ruta en maestro.json, ej. `banco.numero_cuenta`. */
  readonly origen: string
  readonly confianza: number
}

export interface CampoRequiereConfirmacion extends CampoBase {
  readonly estado: "requiere_confirmacion"
  /** RN1 llena el valor aunque requiera confirmación. */
  readonly valor: string | null
  readonly origen: string | null
  readonly confianza: number
  readonly nota: string
}

export interface CampoFaltante extends CampoBase {
  readonly estado: "faltante"
  /** Nunca se inventa un valor. */
  readonly valor: null
  readonly motivo: string
}

export type CampoMapeado = CampoLleno | CampoRequiereConfirmacion | CampoFaltante

export interface Mapeo {
  readonly llenos: readonly CampoLleno[]
  readonly faltantes: readonly CampoFaltante[]
  readonly requiere_confirmacion: readonly CampoRequiereConfirmacion[]
}

/** Vista ordenada del mapeo, para escribir el formulario en el orden de la plantilla. */
export function campos(mapeo: Mapeo): readonly CampoMapeado[] {
  return [...mapeo.llenos, ...mapeo.requiere_confirmacion, ...mapeo.faltantes].sort(
    (a, b) => a.orden - b.orden,
  )
}

// ─── Paquete para firma (HU-4) ────────────────────────────────────────────────

export type EstadoSoporte = "presente" | "ausente" | "vencido"

export interface ItemChecklist {
  readonly tipo: string
  /** El mismo soporte en el lenguaje del correo del cliente. Ver domain/etiquetas.ts. */
  readonly nombre: string
  readonly estado: EstadoSoporte
  readonly archivo: string | null
  readonly vigenciaHasta: string | null
  readonly diasRestantes: number | null
  readonly bloquea: boolean
}

export interface Checklist {
  readonly fechaReferencia: string
  readonly items: readonly ItemChecklist[]
  readonly listoParaFirma: boolean
  readonly camposFaltantes: readonly string[]
}

// ─── Contrato de herramientas (§6.2 del PRD) ──────────────────────────────────

export type Resultado<T> = { ok: true; data: T } | { ok: false; error: string }

export interface ContextoHerramienta {
  /** Raíz del proyecto. Toda ruta se resuelve desde aquí; nunca absolutas. */
  readonly directory: string
  readonly sessionId: string
  /** Fecha contra la que se evalúan las vigencias. */
  readonly fechaReferencia: Date
}

// ─── Bitácora (CA4 / RN5) ─────────────────────────────────────────────────────

export interface EntradaBitacora {
  readonly ts: string
  readonly herramienta: string
  readonly ok: boolean
  readonly resumen: string
}
