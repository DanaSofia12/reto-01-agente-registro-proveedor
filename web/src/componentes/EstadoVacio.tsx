import type { ResumenCaso } from "../api.ts"
import { nombrePais } from "../lenguaje.ts"

/**
 * La bandeja. Resuelve «¿y ahora qué escribo?» sin pedirle que escriba nada.
 *
 * Cada solicitud se presenta por el nombre del cliente y el asunto real del
 * correo, que es como ella las reconoce. El identificador interno del caso no
 * aparece: le serviría a un programador, no a quien hace este trabajo.
 */
export function EstadoVacio({
  casos,
  onElegir,
  deshabilitado,
}: {
  casos: ResumenCaso[]
  onElegir: (caso: string) => void
  deshabilitado: boolean
}) {
  return (
    <div className="mx-auto max-w-2xl px-2 py-10">
      <h2 className="text-[20px] font-semibold tracking-tight">Solicitudes por responder</h2>
      <p className="mt-1.5 max-w-prose text-[14px] leading-snug text-tenue">
        Elige una. El agente lee el correo del cliente, llena el formulario con los datos que
        Periferia ya tiene registrados y revisa qué soportes siguen vigentes. La firma y el envío
        siguen siendo tuyos.
      </p>

      <ul className="mt-7 grid gap-2.5">
        {casos.map((c) => (
          <li key={c.caso}>
            <button
              type="button"
              disabled={deshabilitado}
              onClick={() => onElegir(c.caso)}
              className="w-full rounded-sm border border-regla bg-superficie px-4 py-3 text-left transition-colors hover:border-acento-regla hover:bg-acento-suave disabled:opacity-50"
            >
              <span className="block truncate text-[14.5px] font-medium">{c.cliente}</span>
              <span className="mt-0.5 block truncate font-serif text-[13.5px] text-tenue">
                {c.asunto}
              </span>
              <span className="mt-1.5 block text-[11.5px] text-apagado">
                {nombrePais(c.pais)} · formulario {c.formato.toUpperCase()}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {casos.length === 0 && (
        <p className="mt-6 text-[13px] text-apagado">
          No hay solicitudes en la bandeja en este momento.
        </p>
      )}
    </div>
  )
}
