import { useState } from "react"
import type { CorreoRecibido } from "../api.ts"
import { fechaLarga } from "../lenguaje.ts"
import { Avatar, type EstadoSolicitud } from "./Avatar.tsx"

/**
 * El correo del cliente, tal como llegó.
 *
 * Se muestra en cuanto se elige la solicitud, antes de pedirle nada al agente:
 * la analista lo lee igual que abriría el correo real. Antes solo aparecía
 * después de que el agente lo procesara, lo que obligaba a confiar en su
 * resumen sin haber visto la fuente.
 */
export function HojaCorreo({
  correo,
  cliente,
  estado,
  onRevisar,
}: {
  correo: CorreoRecibido
  cliente: string
  estado: EstadoSolicitud
  /** Si se pasa, ofrece pedirle al agente que la procese. */
  onRevisar?: () => void
}) {
  const [abierto, setAbierto] = useState(true)
  const parrafos = correo.cuerpo.split("\n").filter((p) => p.trim() !== "")

  return (
    <article className="grid grid-cols-[34px_minmax(0,1fr)] gap-x-3.5">
      <Avatar cliente={cliente} estado={estado} />
      <div className="-ml-[3px] min-w-0 border-l-2 border-pelo pl-4">
        <p className="m-0 mb-1 flex flex-wrap items-baseline gap-x-3 text-[12.5px] text-tenue">
          <span className="min-w-0 truncate">{cliente}</span>
          <span className="shrink-0">{fechaLarga(correo.fecha, false)}</span>
        </p>
        <h2 className="titular m-0 mb-1 text-[19px]">{correo.asunto}</h2>
        <p className="dato m-0 mb-3 truncate text-[11px] text-tenue" title={correo.de}>
          {correo.de}
        </p>

        {abierto && (
          <>
            <div className="max-w-[54ch] text-[14.5px] leading-[1.68] text-prosa">
              {parrafos.map((parrafo) => (
                <p key={parrafo.slice(0, 32)} className="mb-2.5 last:mb-0">
                  {parrafo}
                </p>
              ))}
            </div>
            {correo.adjuntos.map((adjunto) => (
              <span
                key={adjunto}
                className="dato mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] ring-1 ring-pelo ring-inset"
              >
                <Clip />
                {adjunto}
              </span>
            ))}
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          {onRevisar !== undefined && (
            <button
              type="button"
              onClick={onRevisar}
              className="inline-flex items-center gap-2.5 rounded-full bg-carbon py-2 pl-4 pr-2 text-[13.5px] font-semibold tracking-[-0.015em] text-lima transition-colors hover:bg-carbon-hondo"
            >
              Pídele al agente que la revise
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-lima/20">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-3.5 w-3.5 fill-none stroke-lima stroke-[2.2] [stroke-linecap:round] [stroke-linejoin:round]"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="text-[12.5px] text-prosa hover:underline"
          >
            {abierto ? "Ocultar el correo" : "Ver el correo completo"}
          </button>
        </div>
      </div>
    </article>
  )
}

function Clip() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3 w-3 shrink-0 fill-none stroke-current stroke-[1.6]"
    >
      <path d="M21 11l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" />
    </svg>
  )
}
