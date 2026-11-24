import type { RegistroLlamada } from "../api.ts"
import { urlArchivo } from "../api.ts"
import { cuñoDeSoporte, nombreArtefacto } from "../lenguaje.ts"

/**
 * El expediente del caso: la evidencia de lo que el agente afirma.
 *
 * Regla del diseño — si el agente dice en el chat que falta un soporte, ese
 * soporte está marcado aquí. Nunca una afirmación sin su respaldo al lado.
 * Permanece visible mientras ella sigue escribiendo.
 */

interface ItemChecklist {
  tipo: string
  nombre?: string
  estado: string
  vigencia_hasta: string | null
  dias_restantes: number | null
  bloquea: boolean
}

interface CampoMapeado {
  etiqueta: string
  nota?: string
  motivo?: string
}

function ultimoResultado(
  llamadas: RegistroLlamada[],
  nombre: string,
): Record<string, unknown> | null {
  for (let i = llamadas.length - 1; i >= 0; i--) {
    const l = llamadas[i]
    if (l?.nombre === nombre && l.ok && typeof l.resultado === "object" && l.resultado !== null) {
      return l.resultado as Record<string, unknown>
    }
  }
  return null
}

function lista<T>(datos: Record<string, unknown> | null, clave: string): T[] {
  if (datos === null) return []
  const valor = datos[clave]
  return Array.isArray(valor) ? (valor as T[]) : []
}

export function Expediente({
  cliente,
  caso,
  llamadas,
  artefactos,
}: {
  cliente: string | null
  caso: string | null
  llamadas: RegistroLlamada[]
  artefactos: string[]
}) {
  const solicitud = ultimoResultado(llamadas, "proveedor_leer_solicitud")
  const mapeo = ultimoResultado(llamadas, "proveedor_mapear_campos")
  const paquete = ultimoResultado(llamadas, "proveedor_armar_paquete")

  const llenos = lista<CampoMapeado>(mapeo, "llenos").length
  const confirmar = lista<CampoMapeado>(mapeo, "requiere_confirmacion")
  const faltantes = lista<CampoMapeado>(mapeo, "faltantes")
  const total = llenos + confirmar.length + faltantes.length

  const items = lista<ItemChecklist>(paquete, "checklist")
  const listo = paquete === null ? null : paquete.listo_para_firma === true

  const vacio = solicitud === null && mapeo === null && paquete === null && artefactos.length === 0

  return (
    <aside
      aria-label="Expediente del caso"
      className="flex h-full flex-col gap-4 overflow-y-auto bg-hueco px-4 py-5"
    >
      {vacio ? (
        <p className="text-[13px] leading-snug text-apagado">
          Aquí aparece el detalle de lo que el agente revise: los campos del formulario, el estado
          de cada soporte y los archivos que deje listos.
        </p>
      ) : null}

      {cliente !== null && (
        <div className="rounded-sm border border-regla bg-superficie px-3.5 py-3">
          <h3 className="text-[14.5px] font-semibold leading-tight">{cliente}</h3>
          {solicitud !== null && (
            <p className="mt-1 text-[12px] text-tenue">
              {typeof solicitud.paisNombre === "string" ? solicitud.paisNombre : ""}
              {typeof solicitud.formato === "string" &&
                ` · formulario ${solicitud.formato.toUpperCase()}`}
            </p>
          )}
        </div>
      )}

      {listo !== null && (
        <div
          className={`rounded-sm border px-3.5 py-3 ${
            listo
              ? "border-vigente-regla bg-vigente-suave"
              : "border-bloqueo-regla bg-bloqueo-suave"
          }`}
        >
          <p
            className={`text-[13.5px] font-semibold leading-snug ${listo ? "text-vigente" : "text-bloqueo"}`}
          >
            {listo ? "Listo para que firme el representante legal" : "No puede firmarse todavía"}
          </p>
          {!listo && (
            <ul className="mt-1.5 space-y-0.5">
              {items
                .filter((i) => i.bloquea)
                .map((i) => (
                  <li key={i.tipo} className="text-[12.5px] leading-snug text-bloqueo">
                    Falta {(i.nombre ?? i.tipo).toLowerCase()}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {total > 0 && (
        <Bloque titulo="Campos del formulario" cuenta={`${llenos} de ${total}`}>
          <div className="mx-3.5 mt-2.5 flex h-[5px] overflow-hidden rounded-full bg-regla">
            <i style={{ width: `${(llenos / total) * 100}%` }} className="block bg-vigente" />
            <i
              style={{ width: `${(confirmar.length / total) * 100}%` }}
              className="block bg-atencion"
            />
            <i
              style={{ width: `${(faltantes.length / total) * 100}%` }}
              className="block bg-bloqueo"
            />
          </div>
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 px-3.5 pb-2.5 pt-2 text-[11.5px] text-tenue">
            <Leyenda color="bg-vigente" texto={`${llenos} llenos`} />
            {confirmar.length > 0 && (
              <Leyenda color="bg-atencion" texto={`${confirmar.length} por confirmar`} />
            )}
            {faltantes.length > 0 && (
              <Leyenda color="bg-bloqueo" texto={`${faltantes.length} sin dato`} />
            )}
          </div>

          {[...confirmar, ...faltantes].length > 0 && (
            <dl className="border-t border-regla px-3.5 py-2.5">
              {confirmar.map((c) => (
                <div key={c.etiqueta} className="mb-2 last:mb-0">
                  <dt className="text-[12.5px] font-medium text-atencion">{c.etiqueta}</dt>
                  <dd className="m-0 text-[12px] leading-snug text-tenue">{c.nota}</dd>
                </div>
              ))}
              {faltantes.map((c) => (
                <div key={c.etiqueta} className="mb-2 last:mb-0">
                  <dt className="text-[12.5px] font-medium">{c.etiqueta}</dt>
                  <dd className="m-0 text-[12px] leading-snug text-apagado">{c.motivo}</dd>
                </div>
              ))}
            </dl>
          )}
        </Bloque>
      )}

      {items.length > 0 && (
        <Bloque
          titulo="Soportes que pide el cliente"
          cuenta={`${items.filter((i) => !i.bloquea).length} de ${items.length}`}
        >
          <ul>
            {items.map((i) => {
              const cuño = cuñoDeSoporte(i)
              return (
                <li
                  key={i.tipo}
                  className="flex items-start gap-2.5 px-3.5 py-2 [&+&]:border-t [&+&]:border-hueco"
                >
                  <span className="min-w-0 flex-1 text-[13px] leading-snug">
                    {i.nombre ?? i.tipo}
                  </span>
                  <span
                    className={`dato mt-px shrink-0 rounded-sm border px-1.5 py-px text-[10.5px] ${
                      cuño.estado === "vigente"
                        ? "border-vigente-regla bg-vigente-suave text-vigente"
                        : cuño.estado === "porvencer"
                          ? "border-atencion-regla bg-atencion-suave text-atencion"
                          : "border-bloqueo-regla bg-bloqueo-suave text-bloqueo"
                    }`}
                  >
                    {cuño.texto}
                  </span>
                </li>
              )
            })}
          </ul>
        </Bloque>
      )}

      {artefactos.length > 0 && caso !== null && (
        <Bloque titulo="Documentos listos" cuenta={`${artefactos.length}`}>
          <ul className="py-1">
            {artefactos.map((a) => (
              <li key={a}>
                <a
                  href={urlArchivo(caso, a)}
                  target="_blank"
                  rel="noreferrer"
                  title={a}
                  className="block truncate px-3.5 py-1.5 text-[12.5px] text-acento hover:bg-acento-suave hover:underline"
                >
                  {nombreArtefacto(a)}
                </a>
              </li>
            ))}
          </ul>
        </Bloque>
      )}
    </aside>
  )
}

function Bloque({
  titulo,
  cuenta,
  children,
}: {
  titulo: string
  cuenta: string
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-sm border border-regla bg-superficie">
      <div className="flex items-baseline gap-2 border-b border-regla px-3.5 py-2">
        <h3 className="text-[12.5px] font-semibold">{titulo}</h3>
        <span className="dato ml-auto text-[11.5px] text-tenue">{cuenta}</span>
      </div>
      {children}
    </section>
  )
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className={`h-[7px] w-[7px] shrink-0 rounded-sm ${color}`} />
      {texto}
    </span>
  )
}
