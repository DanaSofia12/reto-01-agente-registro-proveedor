/** Indicador de trabajo en curso (§6.1). Muestra en qué iteración va, para
 * que el tope de 25 del PRD sea visible sin explicarlo. */
export function Pensando({ iteracion, tope }: { iteracion: number | null; tope: number }) {
  return (
    <div className="flex items-center gap-2 px-1 py-2 text-tenue">
      <span className="latido flex gap-1" aria-hidden="true">
        <span className="h-1 w-1 rounded-full bg-apagado" />
        <span className="h-1 w-1 rounded-full bg-apagado" />
        <span className="h-1 w-1 rounded-full bg-apagado" />
      </span>
      <span className="dato text-[12px]">
        Pensando{iteracion === null ? "" : ` \u00b7 iteraci\u00f3n ${iteracion} de ${tope}`}
      </span>
    </div>
  )
}
