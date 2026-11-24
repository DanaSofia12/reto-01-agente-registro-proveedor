import { useState } from "react"
import { fechaLarga } from "../lenguaje.ts"

/**
 * El correo que mandó el cliente, tal como llegó.
 *
 * Antes el agente lo leía y la analista nunca lo veía: tenía que creerle
 * cuando decía «el cliente exige tal certificado». Ahora la frase está ahí,
 * escrita por el cliente, a un centímetro de la afirmación del agente.
 *
 * Se pliega después de leerlo porque en el segundo turno ya estorba.
 */

export interface Correo {
  de: string
  para: string
  asunto: string
  fecha: string
  cuerpo: string
  adjuntos: string[]
}

export function HojaCorreo({ correo, cliente }: { correo: Correo; cliente: string }) {
  const [abierto, setAbierto] = useState(true)

  return (
    <article className="overflow-hidden rounded-sm border border-regla border-t-[3px] border-t-acento bg-superficie">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-baseline gap-3 px-4 py-2.5 text-left hover:bg-hueco"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-serif text-[16px] font-semibold leading-snug">
            {correo.asunto}
          </span>
          <span className="dato mt-0.5 block truncate text-[11.5px] text-apagado">{correo.de}</span>
        </span>
        <span className="shrink-0 text-[12px] text-tenue">
          {abierto ? "Ocultar" : "Ver correo"}
        </span>
      </button>

      {abierto && (
        <>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-0.5 border-t border-dashed border-regla px-4 pb-2.5 pt-3 text-[12.5px]">
            <dt className="text-apagado">De</dt>
            <dd className="dato m-0 break-words text-[12px]">{correo.de}</dd>
            <dt className="text-apagado">Para</dt>
            <dd className="dato m-0 break-words text-[12px]">{correo.para}</dd>
            <dt className="text-apagado">Recibido</dt>
            <dd className="m-0 text-[12.5px]">{fechaLarga(correo.fecha)}</dd>
            <dt className="text-apagado">Cliente</dt>
            <dd className="m-0 text-[12.5px]">{cliente}</dd>
          </dl>

          <div className="carta max-w-[62ch] px-4 pb-3 text-[#36332c]">
            {correo.cuerpo.split("\n").map((parrafo, i) =>
              parrafo.trim() === "" ? null : (
                // biome-ignore lint/suspicious/noArrayIndexKey: el cuerpo es texto plano inmutable
                <p key={i} className="mb-2 last:mb-0">
                  {parrafo}
                </p>
              ),
            )}
          </div>

          {correo.adjuntos.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pb-3.5">
              {correo.adjuntos.map((a) => (
                <span
                  key={a}
                  className="dato inline-flex items-center gap-2 rounded-sm border border-acento-regla bg-acento-suave px-2.5 py-1 text-[11.5px] text-acento"
                >
                  <Clip />
                  {a}
                </span>
              ))}
            </div>
          )}
        </>
      )}
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
