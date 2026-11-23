/** Marcas de estado. El color solo señala excepciones; lo correcto va sin color. */

type Tono = "neutro" | "bien" | "atencion" | "bloqueo"

const TONOS: Record<Tono, string> = {
  neutro: "bg-hueco text-tenue",
  bien: "bg-hueco text-tenue",
  atencion: "bg-atencion-suave text-atencion",
  bloqueo: "bg-bloqueo-suave text-bloqueo",
}

export function Marca({ tono = "neutro", children }: { tono?: Tono; children: React.ReactNode }) {
  return (
    <span
      className={`dato inline-flex items-center rounded px-1.5 py-px text-[11px] ${TONOS[tono]}`}
    >
      {children}
    </span>
  )
}

export function tonoDeSoporte(estado: string): Tono {
  if (estado === "presente") return "bien"
  return "bloqueo"
}

export function Pensando({ iteracion, tope }: { iteracion: number | null; tope: number }) {
  return (
    <div className="flex items-center gap-2 px-1 py-2 text-tenue">
      <span className="latido flex gap-1" aria-hidden="true">
        <span className="h-1 w-1 rounded-full bg-apagado" />
        <span className="h-1 w-1 rounded-full bg-apagado" />
        <span className="h-1 w-1 rounded-full bg-apagado" />
      </span>
      <span className="dato text-[12px]">
        Pensando{iteracion === null ? "" : ` · iteración ${iteracion} de ${tope}`}
      </span>
    </div>
  )
}
