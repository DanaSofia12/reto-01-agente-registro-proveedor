import type { ResumenCaso } from "../api.ts"
import { Avatar, type EstadoSolicitud } from "./Avatar.tsx"

/**
 * La bandeja de solicitudes, siempre visible.
 *
 * Antes desaparecía al elegir una: había que recordar qué más había y no se
 * podía saltar entre clientes. Se trabajan varias a la vez, así que se queda.
 */

export interface EstadoPorCaso {
  readonly estado: EstadoSolicitud
  readonly resumen: string
}

const PALABRA: Readonly<Record<EstadoSolicitud, string>> = {
  lista: "Lista para firma",
  bloqueada: "Falta un soporte",
  decidir: "Esperando tu decisión",
  sin_revisar: "Sin revisar",
}

export function Bandeja({
  casos,
  estados,
  casoActual,
  deshabilitado,
  onElegir,
  fechaReferencia,
}: {
  casos: ResumenCaso[]
  estados: ReadonlyMap<string, EstadoPorCaso>
  casoActual: string | null
  deshabilitado: boolean
  onElegir: (caso: ResumenCaso) => void
  fechaReferencia: string | null
}) {
  return (
    <nav
      aria-label="Solicitudes"
      className="z-[2] flex h-full flex-col gap-0.5 bg-papel px-3 py-4 shadow-[1px_0_0_var(--color-pelo),6px_0_14px_-10px_rgba(22,24,26,0.16)]"
    >
      <h2 className="mb-2 px-3 text-[12px] font-semibold text-tenue">Bandeja</h2>

      {casos.map((caso) => {
        const marca = estados.get(caso.caso)
        const estado = marca?.estado ?? "sin_revisar"
        const activo = caso.caso === casoActual
        return (
          <button
            key={caso.caso}
            type="button"
            aria-current={activo}
            disabled={deshabilitado}
            onClick={() => onElegir(caso)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
              activo ? "bg-carbon text-white" : "hover:bg-nube"
            }`}
          >
            <Avatar cliente={caso.cliente} estado={estado} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium leading-tight">
                {caso.cliente}
              </span>
              <span
                className={`block text-[11.5px] leading-tight ${activo ? "text-white/60" : "text-tenue"}`}
              >
                {marca?.resumen ?? PALABRA[estado]}
              </span>
            </span>
          </button>
        )
      })}

      <div className="mt-auto border-t border-pelo pt-3">
        {fechaReferencia !== null && (
          <p className="m-0 px-3 text-[11.5px] leading-snug text-tenue">
            Vigencias calculadas al {fechaReferencia}.
          </p>
        )}
        <p className="m-0 mt-1.5 px-3 text-[11.5px] leading-snug text-tenue">
          Yo preparo y reviso. La firma y el envío siguen siendo tuyos.
        </p>
      </div>
    </nav>
  )
}
