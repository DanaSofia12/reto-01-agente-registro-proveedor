import { Carpeta } from "./Carpeta.tsx"

/**
 * Donde la decisión pasa de la máquina a la persona.
 *
 * El botón manda la confirmación por un canal aparte, sin depender de que el
 * servidor acierte al interpretar texto libre. Nunca pide teclear una fórmula.
 */
export function BloqueConfirmacion({
  cliente,
  onResponder,
  deshabilitado,
}: {
  cliente: string | null
  onResponder: (texto: string, confirmacion?: boolean) => void
  deshabilitado: boolean
}) {
  return (
    <Carpeta pestana="Decide tú" tono="lima">
      <span className="block text-[20px] font-semibold leading-tight tracking-[-0.03em]">
        El agente se detuvo aquí
      </span>
      <span className="mt-1.5 block max-w-[50ch] text-[14px] leading-snug text-carbon/70">
        No hará nada hacia afuera sin que tú lo decidas. Nada sale hacia {cliente ?? "el cliente"}{" "}
        por este medio: el correo lo sigue mandando una persona.
      </span>
      <span className="mt-4 flex flex-wrap gap-2.5">
        <button
          type="button"
          disabled={deshabilitado}
          onClick={() => onResponder("Sí, adelante.", true)}
          className="inline-flex items-center gap-2.5 rounded-full bg-carbon py-2 pl-5 pr-2 text-[14.5px] font-semibold tracking-[-0.015em] text-lima transition-colors hover:bg-carbon-hondo disabled:opacity-50"
        >
          Sí, adelante
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-lima/20">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-3 w-3 fill-none stroke-lima stroke-[2.6] [stroke-linecap:round] [stroke-linejoin:round]"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </span>
        </button>
        <button
          type="button"
          disabled={deshabilitado}
          onClick={() => onResponder("Todavía no. ¿Qué falta antes de poder seguir?")}
          className="rounded-full px-5 py-2 text-[14.5px] text-carbon ring-[1.5px] ring-carbon/25 ring-inset transition-colors hover:bg-carbon/5 disabled:opacity-50"
        >
          Todavía no
        </button>
      </span>
    </Carpeta>
  )
}
