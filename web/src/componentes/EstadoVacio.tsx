import type { ResumenCaso } from "../api.ts"
import { Carpeta, Cifra } from "./Carpeta.tsx"

/**
 * La portada. Resuelve «¿y ahora qué escribo?» sin pedir que se escriba nada.
 *
 * Las dos cifras son reales y salen de la bandeja: cuántas esperan respuesta y
 * cuántas no se han mirado. No son tarjetas de funciones.
 */
export function EstadoVacio({
  casos,
  deshabilitado,
  onElegir,
}: {
  casos: ResumenCaso[]
  deshabilitado: boolean
  onElegir: (caso: ResumenCaso) => void
}) {
  const primera = casos[0]

  return (
    <div className="flex flex-col gap-6 pt-2">
      <section>
        <h2 className="titular m-0 text-[34px]">Buenos días.</h2>
        <p className="m-0 mt-2 max-w-[46ch] text-[15px] text-prosa">
          Dime con cuál solicitud empiezo. Leo el correo del cliente, lleno el formulario con los
          datos que Periferia ya tiene registrados y te digo qué impide la firma.
        </p>
      </section>

      {casos.length === 0 ? (
        <p className="m-0 text-[13px] text-tenue">No hay solicitudes en la bandeja ahora mismo.</p>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Carpeta
            pestana="En la bandeja"
            tono="carbon"
            onClick={primera === undefined || deshabilitado ? undefined : () => onElegir(primera)}
          >
            <Cifra
              valor={String(casos.length)}
              titulo={
                casos.length === 1 ? "solicitud espera respuesta" : "solicitudes esperan respuesta"
              }
              nota="Elige una de la bandeja o empieza por la primera."
            />
          </Carpeta>

          <Carpeta pestana="Sin revisar" tono="lima">
            <Cifra
              valor={String(casos.length)}
              titulo="todavía sin mirar"
              nota="Ninguna se ha revisado en esta sesión."
            />
          </Carpeta>
        </div>
      )}
    </div>
  )
}
