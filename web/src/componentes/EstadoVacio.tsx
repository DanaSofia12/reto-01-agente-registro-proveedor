import type { ResumenCaso } from "../api.ts"

/** Resuelve "¿y ahora qué escribo?": los casos que hay, listos para arrancar. */
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
    <div className="mx-auto max-w-xl px-2 py-10 text-center">
      <h2 className="text-[19px] font-medium tracking-tight">Solicitudes en la bandeja</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-[14px] leading-snug text-tenue">
        Elige una y el agente leerá el correo, llenará el formulario desde el repositorio maestro y
        armará el paquete. La firma y el envío siguen siendo tuyos.
      </p>

      <ul className="mt-7 grid gap-2 text-left sm:grid-cols-2">
        {casos.map((c) => (
          <li key={c.caso}>
            <button
              type="button"
              disabled={deshabilitado}
              onClick={() => onElegir(c.caso)}
              className="group w-full rounded-lg border border-regla bg-superficie px-3.5 py-3 text-left transition-colors hover:border-regla-fuerte hover:bg-hueco disabled:opacity-50"
            >
              <span className="block truncate text-[14px] text-tinta">{c.cliente}</span>
              <span className="dato mt-1 block text-[11px] text-apagado">
                {c.caso} · {c.pais} · {c.formato}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {casos.length === 0 && (
        <p className="mt-6 text-[13px] text-apagado">
          No hay casos en <span className="dato">fixtures/reto-01/casos/</span>.
        </p>
      )}
    </div>
  )
}
