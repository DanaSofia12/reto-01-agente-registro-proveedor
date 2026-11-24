/**
 * El momento en que la decisión pasa de la máquina a la persona.
 *
 * Es el único sitio donde el diseño gasta peso visual. Y es la única vía por
 * la que una acción hacia afuera queda autorizada: el botón manda la
 * confirmación por un canal aparte, sin depender de que el servidor adivine
 * bien si «ok, gracias» significaba que sí.
 *
 * El texto nunca le pide teclear una fórmula. Ella decide con un clic o
 * responde como hable.
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
  const aQuien = cliente === null ? "este cliente" : cliente

  return (
    <section
      aria-label="El agente espera tu decisión"
      className="rounded-sm border border-acento-regla border-l-[3px] border-l-acento bg-acento-suave px-4 py-3.5"
    >
      <p className="text-[14.5px] font-medium leading-snug">El agente se detuvo aquí</p>
      <p className="mt-0.5 text-[13px] leading-snug text-tenue">
        No va a hacer nada hacia afuera sin que tú lo decidas. Nada sale hacia {aQuien} por este
        medio: el correo lo sigue mandando una persona.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={deshabilitado}
          onClick={() => onResponder("Sí, adelante.", true)}
          className="rounded-sm border border-acento bg-acento px-3.5 py-1.5 text-[13.5px] font-medium text-white transition-colors hover:bg-[#332c7a] disabled:opacity-50"
        >
          Sí, adelante
        </button>
        <button
          type="button"
          disabled={deshabilitado}
          onClick={() => onResponder("Todavía no. ¿Qué falta antes de poder seguir?")}
          className="rounded-sm border border-regla-fuerte bg-superficie px-3.5 py-1.5 text-[13.5px] transition-colors hover:bg-hueco disabled:opacity-50"
        >
          Todavía no
        </button>
      </div>
    </section>
  )
}
