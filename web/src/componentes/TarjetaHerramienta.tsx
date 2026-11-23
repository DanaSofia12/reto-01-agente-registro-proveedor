import { useState } from "react"
import type { RegistroLlamada } from "../api.ts"

/**
 * Requisito §6.1: mostrar cada llamada a herramienta con nombre, argumentos y
 * resultado resumido. Colapsadas por defecto; se expanden las que traen algo
 * que la analista deba revisar.
 */

const SIEMPRE_ABIERTAS = new Set(["proveedor_mapear_campos", "proveedor_armar_paquete"])

function resumirArgumentos(argumentos: unknown): string {
  if (typeof argumentos !== "object" || argumentos === null) return ""
  const partes = Object.entries(argumentos as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? `"${v}"` : JSON.stringify(v)}`)
  return partes.join(", ")
}

export function TarjetaHerramienta({ llamada }: { llamada: RegistroLlamada }) {
  const [abierta, setAbierta] = useState(SIEMPRE_ABIERTAS.has(llamada.nombre))
  const corto = llamada.nombre.replace(/^proveedor_/, "")

  return (
    <div
      className={`overflow-hidden rounded-lg border bg-superficie ${
        llamada.ok ? "border-regla" : "border-bloqueo/35"
      }`}
    >
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-hueco"
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${llamada.ok ? "bg-apagado" : "bg-bloqueo"}`}
        />
        <span className="dato flex-1 truncate text-[13px] text-tinta">{corto}</span>
        <span className="hidden truncate text-[12px] text-tenue sm:block max-w-[18rem]">
          {llamada.resumen}
        </span>
        <span aria-hidden="true" className="text-[11px] text-apagado">
          {abierta ? "−" : "+"}
        </span>
      </button>

      {abierta && (
        <div className="border-t border-regla px-3 pb-3 pt-2.5">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-apagado">Argumentos</p>
          <div className="dato mb-3 rounded bg-hueco px-2.5 py-1.5 text-[12px] text-tenue">
            {resumirArgumentos(llamada.argumentos) || "sin argumentos"}
          </div>
          <p className="mb-1 text-[11px] uppercase tracking-wide text-apagado">Resultado</p>
          {llamada.ok ? (
            <DetalleResultado nombre={llamada.nombre} datos={llamada.resultado} />
          ) : (
            <p className="text-[13px] text-bloqueo">{llamada.resumen}</p>
          )}
        </div>
      )}
    </div>
  )
}

interface CampoMapeado {
  etiqueta: string
  valor?: string | null
  origen?: string | null
  motivo?: string
  nota?: string
}

interface ItemChecklist {
  tipo: string
  estado: string
  vigencia_hasta: string | null
  bloquea: boolean
}

function DetalleResultado({ nombre, datos }: { nombre: string; datos: unknown }) {
  if (typeof datos !== "object" || datos === null) {
    return <p className="text-[13px] text-tenue">ok</p>
  }
  const d = datos as Record<string, unknown>

  if (nombre === "proveedor_mapear_campos") {
    const llenos = (d.llenos ?? []) as CampoMapeado[]
    const confirmar = (d.requiere_confirmacion ?? []) as CampoMapeado[]
    const faltantes = (d.faltantes ?? []) as CampoMapeado[]
    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap gap-1.5">
          <span className="dato rounded bg-hueco px-1.5 py-px text-[11px] text-tenue">
            {llenos.length} llenos
          </span>
          {confirmar.length > 0 && (
            <span className="dato rounded bg-atencion-suave px-1.5 py-px text-[11px] text-atencion">
              {confirmar.length} por confirmar
            </span>
          )}
          {faltantes.length > 0 && (
            <span className="dato rounded bg-hueco px-1.5 py-px text-[11px] text-tenue">
              {faltantes.length} faltantes
            </span>
          )}
        </div>
        {[...confirmar, ...faltantes].length > 0 && (
          <dl className="space-y-1.5">
            {confirmar.map((c) => (
              <div key={c.etiqueta} className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
                <dt className="dato text-[12px] text-atencion">{c.etiqueta}</dt>
                <dd className="text-[12px] leading-snug text-tenue">{c.nota}</dd>
              </div>
            ))}
            {faltantes.map((c) => (
              <div key={c.etiqueta} className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
                <dt className="dato text-[12px] text-tenue">{c.etiqueta}</dt>
                <dd className="text-[12px] leading-snug text-apagado">{c.motivo}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    )
  }

  if (nombre === "proveedor_armar_paquete") {
    const items = (d.checklist ?? []) as ItemChecklist[]
    const listo = d.listo_para_firma === true
    return (
      <div className="space-y-2.5">
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.tipo} className="flex items-baseline justify-between gap-3">
              <span className={`dato text-[12px] ${i.bloquea ? "text-bloqueo" : "text-tinta"}`}>
                {i.tipo}
              </span>
              <span
                className={`dato shrink-0 text-[11px] ${i.bloquea ? "text-bloqueo" : "text-apagado"}`}
              >
                {i.estado === "presente" ? (i.vigencia_hasta ?? "sin vencimiento") : i.estado}
              </span>
            </li>
          ))}
        </ul>
        <p
          className={`dato border-t border-regla pt-2 text-[12px] ${
            listo ? "text-tenue" : "text-bloqueo"
          }`}
        >
          listo_para_firma: {String(listo)}
        </p>
      </div>
    )
  }

  if (typeof d.ruta === "string") {
    return <p className="dato text-[12px] text-acento">{d.ruta}</p>
  }

  return (
    <ul className="space-y-0.5">
      {Object.entries(d)
        .slice(0, 6)
        .map(([k, v]) => (
          <li key={k} className="dato text-[12px] text-tenue">
            {k}: {Array.isArray(v) ? `${v.length} elemento(s)` : String(v)}
          </li>
        ))}
    </ul>
  )
}
