/**
 * CA3 — El estado de confirmación se resalta.
 *
 * Es el único sitio donde el diseño gasta peso visual: rompe el ritmo del hilo
 * con borde grueso y fondo propio, porque es el momento en que la decisión
 * pasa de la máquina a la persona.
 */
export function BloqueConfirmacion({
  caso,
  onResponder,
  deshabilitado,
}: {
  caso: string | null
  onResponder: (texto: string) => void
  deshabilitado: boolean
}) {
  return (
    <section
      aria-label="El agente necesita tu confirmación"
      className="rounded-xl border-2 border-acento-regla bg-acento-suave px-4 py-3.5"
    >
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-acento" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-acento">
            El agente se detuvo y espera tu decisión
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-acento/85">
            No ejecutará ninguna acción externa hasta que confirmes.
            {caso !== null && (
              <>
                {" "}
                Caso <span className="dato">{caso}</span>.
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={deshabilitado}
              onClick={() => onResponder("Sí, confirmo. Prepara el envío simulado.")}
              className="rounded-md border border-acento bg-acento px-3 py-1.5 text-[13px] text-white transition-colors hover:bg-acento/90 disabled:opacity-50"
            >
              Confirmar envío
            </button>
            <button
              type="button"
              disabled={deshabilitado}
              onClick={() => onResponder("No todavía. ¿Qué falta antes de poder enviar?")}
              className="rounded-md border border-acento-regla bg-superficie px-3 py-1.5 text-[13px] text-acento transition-colors hover:bg-hueco disabled:opacity-50"
            >
              Todavía no
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
