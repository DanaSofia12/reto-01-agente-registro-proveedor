import { useState } from "react"
import type { RegistroLlamada } from "../api.ts"
import {
  type ItemSoporte,
  lista,
  nombreArtefacto,
  nombrePais,
  ultimoResultado,
  vigenciaDe,
} from "../lenguaje.ts"
import { Avatar, type EstadoSolicitud } from "./Avatar.tsx"
import { type CampoEscrito, VisorDocumento } from "./VisorDocumento.tsx"

/**
 * El expediente: la evidencia de lo que el agente afirma en el hilo.
 *
 * Si el texto dice que falta un soporte, ese soporte está marcado aquí. Nunca
 * una afirmación sin su respaldo al lado.
 */

interface CampoPendiente {
  readonly etiqueta: string
  readonly nota?: string
  readonly motivo?: string
}

interface CampoLleno {
  readonly etiqueta: string
  readonly valor: string
}

const TINTE: Readonly<Record<string, string>> = {
  vigente: "bg-savia",
  por_vencer: "bg-lima",
  bloquea: "bg-brasa",
}

export function Expediente({
  cliente,
  estado,
  caso,
  llamadas,
  artefactos,
}: {
  cliente: string | null
  estado: EstadoSolicitud
  caso: string | null
  llamadas: readonly RegistroLlamada[]
  artefactos: readonly string[]
}) {
  const [viendo, setViendo] = useState<string | null>(null)
  const solicitud = ultimoResultado(llamadas, "proveedor_leer_solicitud")
  const mapeo = ultimoResultado(llamadas, "proveedor_mapear_campos")
  const paquete = ultimoResultado(llamadas, "proveedor_armar_paquete")

  const camposLlenos = lista<CampoLleno>(mapeo, "llenos")
  const llenos = camposLlenos.length
  const porConfirmar = lista<CampoPendiente>(mapeo, "requiere_confirmacion")
  const faltantes = lista<CampoPendiente>(mapeo, "faltantes")
  const total = llenos + porConfirmar.length + faltantes.length

  const soportes = lista<ItemSoporte>(paquete, "checklist")
  const bloqueos = soportes.filter((i) => i.bloquea)
  const listoParaFirma = paquete === null ? null : paquete.listo_para_firma === true

  return (
    <aside
      aria-label="Expediente del caso"
      className="z-[2] flex h-full flex-col gap-5 overflow-y-auto bg-papel px-4 py-5 shadow-[-1px_0_0_var(--color-pelo),-6px_0_14px_-10px_rgba(22,24,26,0.16)]"
    >
      {cliente === null ? (
        <>
          <Rotulo>Expediente</Rotulo>
          <p className="m-0 text-[13px] leading-relaxed text-tenue">
            Cuando el agente revise una solicitud, aquí queda el detalle: los campos del formulario,
            el estado de cada soporte y los documentos que deje listos.
          </p>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <Avatar cliente={cliente} estado={estado} grande />
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold leading-tight tracking-[-0.022em]">
              {cliente}
            </span>
            {typeof solicitud?.pais === "string" && (
              <span className="block text-[12px] text-tenue">{nombrePais(solicitud.pais)}</span>
            )}
          </span>
        </div>
      )}

      {listoParaFirma !== null && (
        <div
          className={`rounded-2xl px-4 py-3.5 ${listoParaFirma ? "bg-savia-velo" : "bg-brasa-velo"}`}
        >
          <p
            className={`m-0 text-[14.5px] font-semibold leading-tight tracking-[-0.022em] ${
              listoParaFirma ? "text-savia" : "text-brasa"
            }`}
          >
            {listoParaFirma
              ? "Listo para que firme el representante legal"
              : "No puede firmarse todavía"}
          </p>
          {bloqueos.length > 0 && (
            <ul className="m-0 mt-2 list-disc pl-4">
              {bloqueos.map((i) => (
                <li key={i.tipo} className="text-[13px] leading-snug text-prosa">
                  Falta {(i.nombre ?? i.tipo).toLowerCase()}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {total > 0 && (
        <section>
          <Rotulo>Campos del formulario</Rotulo>
          <Anillo llenos={llenos} porConfirmar={porConfirmar.length} faltantes={faltantes.length} />
          {[...porConfirmar, ...faltantes].length > 0 && (
            <dl className="m-0 mt-4 flex flex-col gap-3">
              {porConfirmar.map((c) => (
                <div key={c.etiqueta}>
                  <dt className="m-0 text-[13px] font-semibold leading-tight">
                    {c.etiqueta}
                    <span className="ml-1.5 rounded-full bg-lima px-2 py-px text-[11px] font-medium text-carbon">
                      decide tú
                    </span>
                  </dt>
                  <dd className="m-0 mt-0.5 text-[12.5px] leading-snug text-tenue">{c.nota}</dd>
                </div>
              ))}
              {faltantes.map((c) => (
                <div key={c.etiqueta}>
                  <dt className="m-0 text-[13px] font-semibold leading-tight">{c.etiqueta}</dt>
                  <dd className="m-0 mt-0.5 text-[12.5px] leading-snug text-tenue">{c.motivo}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}

      {soportes.length > 0 && (
        <section>
          <Rotulo>Soportes que pide el cliente</Rotulo>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {soportes.map((item) => {
              const v = vigenciaDe(item)
              return (
                <li
                  key={item.tipo}
                  className="grid grid-cols-[10px_minmax(0,1fr)] items-start gap-2.5"
                >
                  <i className={`mt-[5px] h-2.5 w-2.5 shrink-0 rounded-[3px] ${TINTE[v.estado]}`} />
                  <span>
                    <span className="block text-[13px] leading-snug">
                      {item.nombre ?? item.tipo}
                    </span>
                    <span
                      className={`block text-[12px] leading-tight ${
                        v.estado === "por_vencer"
                          ? "font-semibold text-lima-hondo"
                          : v.estado === "bloquea"
                            ? "font-semibold text-brasa"
                            : "text-tenue"
                      }`}
                    >
                      {v.texto}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {artefactos.length > 0 && caso !== null && (
        <section>
          <Rotulo>Documentos generados</Rotulo>
          <p className="m-0 -mt-1 mb-2.5 text-[11.5px] leading-snug text-tenue">
            Salen de la plantilla que mandó el cliente, llenada con el repositorio de Periferia.
            Toca cualquiera para verlo.
          </p>
          <ul className="m-0 list-none p-0">
            {artefactos.map((a) => (
              <li key={a}>
                <button
                  type="button"
                  onClick={() => setViendo(a)}
                  title={a}
                  className="-ml-3 block w-full truncate rounded-[10px] px-3 py-1.5 text-left text-[13px] hover:bg-lima"
                >
                  {nombreArtefacto(a)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {viendo !== null && caso !== null && (
        <VisorDocumento
          caso={caso}
          ruta={viendo}
          camposEscritos={camposLlenos as readonly CampoEscrito[]}
          onCerrar={() => setViendo(null)}
        />
      )}
    </aside>
  )
}

function Rotulo({ children }: { children: string }) {
  return <h3 className="m-0 mb-3 text-[11.5px] font-semibold text-tenue">{children}</h3>
}

/** El avance de los campos como anillo: una sola forma dice cuánto y de qué tipo. */
function Anillo({
  llenos,
  porConfirmar,
  faltantes,
}: {
  llenos: number
  porConfirmar: number
  faltantes: number
}) {
  const total = llenos + porConfirmar + faltantes
  const vuelta = 2 * Math.PI * 33
  const arco = (n: number) => (n / total) * vuelta

  return (
    <div className="flex items-center gap-4">
      <span className="relative h-[78px] w-[78px] shrink-0">
        <svg viewBox="0 0 78 78" aria-hidden="true" className="h-[78px] w-[78px] -rotate-90">
          <circle cx="39" cy="39" r="33" className="fill-none stroke-pelo stroke-[9]" />
          <circle
            cx="39"
            cy="39"
            r="33"
            className="fill-none stroke-savia stroke-[9]"
            strokeDasharray={`${arco(llenos)} ${vuelta}`}
          />
          <circle
            cx="39"
            cy="39"
            r="33"
            className="fill-none stroke-lima stroke-[9]"
            strokeDasharray={`${arco(porConfirmar)} ${vuelta}`}
            strokeDashoffset={-arco(llenos)}
          />
          <circle
            cx="39"
            cy="39"
            r="33"
            className="fill-none stroke-brasa stroke-[9]"
            strokeDasharray={`${arco(faltantes)} ${vuelta}`}
            strokeDashoffset={-arco(llenos + porConfirmar)}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-[17px] font-bold tracking-[-0.03em]">
          {llenos}
          <span className="sr-only"> de {total}</span>
        </span>
      </span>
      <span className="flex flex-col gap-1.5 text-[12.5px] text-prosa">
        <Clave color="bg-savia" texto={`${llenos} llenos`} />
        {porConfirmar > 0 && <Clave color="bg-lima" texto={`${porConfirmar} por confirmar`} />}
        {faltantes > 0 && <Clave color="bg-brasa" texto={`${faltantes} sin dato`} />}
      </span>
    </div>
  )
}

function Clave({ color, texto }: { color: string; texto: string }) {
  return (
    <span className="flex items-center gap-2">
      <i className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
      {texto}
    </span>
  )
}
