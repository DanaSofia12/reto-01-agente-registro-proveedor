import type { ResumenCaso } from "../api.ts"
import { fechaLarga } from "../lenguaje.ts"
import { Carpeta, Cifra } from "./Carpeta.tsx"

/**
 * La portada. Resuelve «¿y ahora qué escribo?» sin pedir que se escriba nada.
 *
 * Las dos cifras salen de los correos reales de la bandeja y dicen cosas
 * distintas: cuántas esperan y cuánto lleva esperando la más antigua. Si ambas
 * dijeran lo mismo, la segunda tarjeta sería relleno.
 */

/** La solicitud que lleva más tiempo sin respuesta. */
function masAntigua(casos: readonly ResumenCaso[]): ResumenCaso | null {
  let vieja: ResumenCaso | null = null
  for (const caso of casos) {
    const fecha = caso.correo?.fecha
    if (fecha === undefined) continue
    if (vieja === null || fecha < (vieja.correo?.fecha ?? "9999")) vieja = caso
  }
  return vieja
}

export function EstadoVacio({
  casos,
  deshabilitado,
  onElegir,
}: {
  casos: ResumenCaso[]
  deshabilitado: boolean
  onElegir: (caso: ResumenCaso) => void
}) {
  const vieja = masAntigua(casos)

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="titular m-0 text-[34px]">Buenos días.</h2>
        <p className="m-0 mt-2 max-w-[46ch] text-[15px] text-prosa">
          Abre una solicitud de la bandeja y léela. Cuando quieras, te la reviso: lleno el
          formulario con los datos que Periferia ya tiene registrados y te digo qué impide la firma.
        </p>
      </section>

      {casos.length === 0 ? (
        <p className="m-0 text-[13px] text-tenue">No hay solicitudes en la bandeja ahora mismo.</p>
      ) : (
        <div className="grid items-stretch gap-3.5 sm:grid-cols-2">
          <Carpeta pestana="En la bandeja" tono="carbon">
            <Cifra
              valor={String(casos.length)}
              titulo={
                casos.length === 1 ? "solicitud espera respuesta" : "solicitudes esperan respuesta"
              }
              nota="Ninguna se ha revisado todavía en esta sesión."
            />
          </Carpeta>

          {vieja !== null && vieja.correo !== null && (
            <Carpeta
              pestana="La que más lleva esperando"
              tono="lima"
              onClick={deshabilitado ? undefined : () => onElegir(vieja)}
            >
              <Cifra
                valor={fechaLarga(vieja.correo.fecha, false)}
                titulo={vieja.cliente}
                nota="Ábrela para leer lo que pide el cliente."
              />
            </Carpeta>
          )}
        </div>
      )}
    </div>
  )
}
