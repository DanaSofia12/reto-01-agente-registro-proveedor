import { useState } from "react"
import { fechaLarga } from "../lenguaje.ts"
import { Avatar, type EstadoSolicitud } from "./Avatar.tsx"

/**
 * El correo que mandó el cliente, tal como llegó.
 *
 * Antes el agente lo leía y la analista nunca lo veía: tenía que creerle cuando
 * decía «el cliente exige tal certificado». Ahora la frase está ahí, escrita por
 * el cliente, a un centímetro de la afirmación.
 *
 * Se renderiza como correspondencia —con remitente y una regla al costado— y no
 * como una tarjeta, porque eso es lo que es.
 */

export interface Correo {
  de: string
  para: string
  asunto: string
  fecha: string
  cuerpo: string
  adjuntos: string[]
}

export function HojaCorreo({
  correo,
  cliente,
  estado,
}: {
  correo: Correo
  cliente: string
  estado: EstadoSolicitud
}) {
  const [abierto, setAbierto] = useState(true)
  const parrafos = correo.cuerpo.split("\n").filter((p) => p.trim() !== "")

  return (
    <article className="grid grid-cols-[34px_minmax(0,1fr)] gap-x-3.5">
      <Avatar cliente={cliente} estado={estado} />
      <div className="-ml-[3px] min-w-0 border-l-2 border-pelo pl-4">
        <p className="m-0 mb-1 flex items-baseline gap-3 text-[12.5px] text-tenue">
          <span className="min-w-0 truncate">{cliente}</span>
          <span className="ml-auto shrink-0">{fechaLarga(correo.fecha, false)}</span>
        </p>
        <h2 className="titular m-0 mb-2 text-[19px]">{correo.asunto}</h2>

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

        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="mt-2.5 block text-[12.5px] text-prosa hover:underline"
        >
          {abierto ? "Ocultar el correo" : "Ver el correo completo"}
        </button>
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
