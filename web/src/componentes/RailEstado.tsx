import type { RegistroLlamada } from "../api.ts"
import { urlArchivo } from "../api.ts"

/**
 * Rail de estado del caso.
 *
 * No lo pide el PRD, pero no cuesta backend: reusa el mismo checklist que ya
 * devuelve `armar_paquete`, renderizado de forma persistente en vez de
 * enterrado en una tarjeta colapsada. El motivo del bloqueo queda a la vista
 * aunque la analista siga escribiendo.
 */

interface ItemChecklist {
  tipo: string
  estado: string
  vigencia_hasta: string | null
  dias_restantes: number | null
  bloquea: boolean
}

interface Conteos {
  llenos: number
  confirmar: number
  faltantes: number
}

function ultimoResultado(
  llamadas: RegistroLlamada[],
  nombre: string,
): Record<string, unknown> | null {
  for (let i = llamadas.length - 1; i >= 0; i--) {
    const l = llamadas[i]
    if (l?.nombre === nombre && l.ok && typeof l.resultado === "object" && l.resultado !== null) {
      return l.resultado as Record<string, unknown>
    }
  }
  return null
}

export function RailEstado({
  caso,
  llamadas,
  artefactos,
}: {
  caso: string | null
  llamadas: RegistroLlamada[]
  artefactos: string[]
}) {
  const mapeo = ultimoResultado(llamadas, "proveedor_mapear_campos")
  const paquete = ultimoResultado(llamadas, "proveedor_armar_paquete")

  const conteos: Conteos | null =
    mapeo === null
      ? null
      : {
          llenos: ((mapeo.llenos ?? []) as unknown[]).length,
          confirmar: ((mapeo.requiere_confirmacion ?? []) as unknown[]).length,
          faltantes: ((mapeo.faltantes ?? []) as unknown[]).length,
        }

  const items = (paquete?.checklist ?? []) as ItemChecklist[]
  const bloqueos = items.filter((i) => i.bloquea)
  const listo = paquete === null ? null : paquete.listo_para_firma === true

  return (
    <aside
      aria-label="Estado del caso"
      className="flex h-full flex-col gap-5 overflow-y-auto border-l border-regla bg-superficie px-4 py-5"
    >
      <div>
        <p className="text-[11px] uppercase tracking-wide text-apagado">Caso</p>
        <p className="dato mt-1 break-all text-[13px] text-tinta">{caso ?? "—"}</p>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wide text-apagado">Campos</p>
        {conteos === null ? (
          <p className="mt-1.5 text-[13px] text-apagado">sin mapear</p>
        ) : (
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <Contador valor={conteos.llenos} etiqueta="llenos" />
            <Contador
              valor={conteos.confirmar}
              etiqueta="confirmar"
              tono={conteos.confirmar > 0 ? "atencion" : undefined}
            />
            <Contador valor={conteos.faltantes} etiqueta="faltan" />
          </div>
        )}
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wide text-apagado">Soportes</p>
        {items.length === 0 ? (
          <p className="mt-1.5 text-[13px] text-apagado">sin evaluar</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {items.map((i) => (
              <li key={i.tipo} className="leading-tight">
                <span
                  className={`dato block text-[12px] ${i.bloquea ? "text-bloqueo" : "text-tinta"}`}
                >
                  {i.tipo}
                </span>
                <span className={`dato text-[11px] ${i.bloquea ? "text-bloqueo" : "text-apagado"}`}>
                  {i.estado === "presente" ? (i.vigencia_hasta ?? "sin vencimiento") : i.estado}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {listo !== null && (
        <div
          className={`rounded-lg border px-3 py-2.5 ${
            listo ? "border-regla bg-hueco" : "border-bloqueo/30 bg-bloqueo-suave"
          }`}
        >
          <p className={`dato text-[12px] ${listo ? "text-tenue" : "text-bloqueo"}`}>
            listo_para_firma: {String(listo)}
          </p>
          {bloqueos.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {bloqueos.map((b) => (
                <li key={b.tipo} className="text-[12px] leading-snug text-bloqueo">
                  {b.tipo.replace(/_/g, " ")} — {b.estado}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {artefactos.length > 0 && caso !== null && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-apagado">Archivos</p>
          <ul className="mt-2 space-y-1">
            {artefactos.map((a) => (
              <li key={a}>
                <a
                  href={urlArchivo(caso, a)}
                  target="_blank"
                  rel="noreferrer"
                  className="dato block truncate text-[12px] text-acento hover:underline"
                  title={a}
                >
                  {a}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}

function Contador({
  valor,
  etiqueta,
  tono,
}: {
  valor: number
  etiqueta: string
  tono?: "atencion"
}) {
  return (
    <div
      className={`rounded-md px-2 py-1.5 text-center ${
        tono === "atencion" ? "bg-atencion-suave" : "bg-hueco"
      }`}
    >
      <span
        className={`dato block text-[16px] leading-none ${
          tono === "atencion" ? "text-atencion" : "text-tinta"
        }`}
      >
        {valor}
      </span>
      <span className="mt-1 block text-[10px] text-apagado">{etiqueta}</span>
    </div>
  )
}
