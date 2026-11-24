import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  type CorreoRecibido,
  enviarMensaje,
  obtenerArtefactos,
  obtenerCasos,
  obtenerSalud,
  type RegistroLlamada,
  type ResumenCaso,
  type Salud,
} from "./api.ts"
import { type EstadoSolicitud, Robot } from "./componentes/Avatar.tsx"
import { Bandeja, type EstadoPorCaso } from "./componentes/Bandeja.tsx"
import { BloqueConfirmacion } from "./componentes/BloqueConfirmacion.tsx"
import { EstadoVacio } from "./componentes/EstadoVacio.tsx"
import { Expediente } from "./componentes/Expediente.tsx"
import { HojaCorreo } from "./componentes/HojaCorreo.tsx"
import { LibroPasos } from "./componentes/LibroPasos.tsx"
import { fechaLarga, marcarCaso } from "./lenguaje.ts"

interface Turno {
  readonly id: string
  readonly rol: "usuario" | "agente" | "sistema"
  readonly texto: string
  readonly llamadas: readonly RegistroLlamada[]
  /** Caso sobre el que se trabajaba. Permite agrupar el hilo por solicitud. */
  readonly caso: string | null
}

/** Negritas y `código` sin traer un parser de Markdown entero. */
function Texto({ children }: { children: string }) {
  const trozos = children.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <>
      {trozos.map((trozo, i) => {
        const clave = `${i}-${trozo.slice(0, 8)}`
        if (trozo.startsWith("**") && trozo.endsWith("**")) {
          return (
            <strong key={clave} className="font-semibold">
              {trozo.slice(2, -2)}
            </strong>
          )
        }
        if (trozo.startsWith("`") && trozo.endsWith("`")) {
          return (
            <span
              key={clave}
              className="dato rounded bg-nube px-1 py-px ring-1 ring-pelo ring-inset"
            >
              {trozo.slice(1, -1)}
            </span>
          )
        }
        return <span key={clave}>{trozo}</span>
      })}
    </>
  )
}

export function App() {
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [borrador, setBorrador] = useState("")
  const [pensando, setPensando] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [necesitaConfirmacion, setNecesitaConfirmacion] = useState(false)
  const [salud, setSalud] = useState<Salud | null>(null)
  const [casos, setCasos] = useState<ResumenCaso[]>([])
  const [casoActual, setCasoActual] = useState<string | null>(null)
  const [artefactos, setArtefactos] = useState<readonly string[]>([])

  const finRef = useRef<HTMLDivElement>(null)
  const hiloRef = useRef<HTMLDivElement>(null)
  const entradaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    obtenerSalud()
      .then(setSalud)
      .catch(() => setSalud(null))
    obtenerCasos()
      .then((r) => setCasos(r.casos))
      .catch(() => setCasos([]))
  }, [])

  // Al cambiar de solicitud, el correo nuevo está arriba: hay que subir.
  // biome-ignore lint/correctness/useExhaustiveDependencies: el disparador es el caso, no el nodo
  useEffect(() => {
    hiloRef.current?.scrollTo({ top: 0 })
  }, [casoActual])

  /**
   * Un hilo por solicitud.
   *
   * La sesión del backend es una sola —el agente conserva todo el contexto—,
   * pero en pantalla cada cliente tiene su conversación. Mezclarlas hacía que
   * el expediente de un cliente mostrara los campos de otro, y que al elegir
   * una solicitud nueva su correo quedara enterrado sobre el hilo anterior.
   */
  const turnosVisibles = useMemo(
    () => turnos.filter((t) => t.caso === casoActual),
    [turnos, casoActual],
  )
  const llamadasDelCaso = useMemo(() => turnosVisibles.flatMap((t) => t.llamadas), [turnosVisibles])

  /** Estado de cada solicitud, derivado de lo que las herramientas devolvieron. */
  const estados = useMemo((): ReadonlyMap<string, EstadoPorCaso> => {
    const mapa = new Map<string, EstadoPorCaso>()
    for (const caso of casos) {
      const suyas = turnos.filter((t) => t.caso === caso.caso).flatMap((t) => t.llamadas)
      const marca = marcarCaso(suyas)
      if (marca !== null) mapa.set(caso.caso, marca)
    }
    return mapa
  }, [casos, turnos])

  const solicitudActual = casos.find((c) => c.caso === casoActual) ?? null
  const clienteActual = solicitudActual?.cliente ?? null
  const estadoActual: EstadoSolicitud = estados.get(casoActual ?? "")?.estado ?? "sin_revisar"
  const correoActual: CorreoRecibido | null = solicitudActual?.correo ?? null
  /** ¿Ya se le pidió algo al agente sobre esta solicitud? */
  const yaRevisada = turnos.some((t) => t.caso === casoActual)

  const enviar = useCallback(
    async (texto: string, confirmacion = false) => {
      const limpio = texto.trim()
      if (limpio === "" || pensando) return

      const caso = casoActual
      setBorrador("")
      setNecesitaConfirmacion(false)
      setPensando(true)
      setTurnos((previos) => [
        ...previos,
        { id: crypto.randomUUID(), rol: "usuario", texto: limpio, llamadas: [], caso },
      ])

      try {
        const respuesta = await enviarMensaje(sessionId, limpio, confirmacion, caso)
        setSessionId(respuesta.sessionId)
        setNecesitaConfirmacion(respuesta.needsConfirmation)

        const tocados = respuesta.toolCalls
          .map((l) => (l.argumentos as { caso?: string } | null)?.caso)
          .filter((c): c is string => typeof c === "string")
        const ultimo = tocados.at(-1) ?? caso

        setTurnos((previos) => [
          ...previos,
          {
            id: crypto.randomUUID(),
            rol: "agente",
            texto: respuesta.reply,
            llamadas: respuesta.toolCalls,
            caso: ultimo,
          },
        ])

        if (ultimo !== null) {
          setCasoActual(ultimo)
          obtenerArtefactos(ultimo)
            .then((r) => setArtefactos(r.artefactos))
            .catch(() => setArtefactos([]))
        }
      } catch (causa) {
        // El error se muestra en el hilo y la sesión sigue viva.
        const mensaje =
          causa instanceof Error
            ? causa.message
            : "No se pudo contactar al servidor. Vuelve a intentarlo."
        setTurnos((previos) => [
          ...previos,
          { id: crypto.randomUUID(), rol: "sistema", texto: mensaje, llamadas: [], caso },
        ])
      } finally {
        setPensando(false)
        requestAnimationFrame(() => {
          finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
          entradaRef.current?.focus()
        })
      }
    },
    [pensando, sessionId, casoActual],
  )

  /** Elegir una solicitud solo abre el correo. El agente no se dispara solo. */
  const abrir = useCallback((caso: ResumenCaso) => {
    setCasoActual(caso.caso)
    setArtefactos([])
  }, [])

  const pedirRevision = useCallback(
    (caso: ResumenCaso) => {
      setCasoActual(caso.caso)
      enviar(
        `Revisa la solicitud de ${caso.cliente}. Dime qué quedó listo, qué falta y si ya se puede firmar. No mandes nada todavía.`,
      )
    },
    [enviar],
  )

  const vacio = turnosVisibles.length === 0 && casoActual === null
  const llamadasEnCurso = turnosVisibles[turnosVisibles.length - 1]?.llamadas ?? []

  return (
    <div className="flex h-full flex-col bg-papel">
      <header className="relative z-[3] flex h-[52px] shrink-0 items-center gap-3.5 bg-papel px-5 shadow-barra">
        <span className="text-[12.5px] text-tenue">Periferia IT Group</span>
        <h1 className="mx-auto text-[14.5px] font-semibold tracking-[-0.02em]">
          Registro como proveedor
        </h1>
        {salud !== null && (
          <span className="hidden text-[12.5px] text-tenue sm:block">
            Vigencias al {fechaLarga(salud.fechaReferencia, false)}
          </span>
        )}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[14.5rem_minmax(0,1fr)] xl:grid-cols-[14.5rem_minmax(0,1fr)_19.5rem]">
        <div className="hidden min-h-0 lg:block">
          <Bandeja
            casos={casos}
            estados={estados}
            casoActual={casoActual}
            deshabilitado={pensando}
            onElegir={abrir}
            fechaReferencia={salud === null ? null : fechaLarga(salud.fechaReferencia, false)}
          />
        </div>

        <main className="flex min-h-0 flex-col bg-nube">
          <div
            ref={hiloRef}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-6 sm:px-8"
          >
            <div
              className={`mx-auto flex w-full max-w-[39rem] flex-col gap-5 ${vacio ? "my-auto" : ""}`}
            >
              {vacio && !pensando && (
                <EstadoVacio casos={casos} deshabilitado={pensando} onElegir={abrir} />
              )}

              {correoActual !== null && clienteActual !== null && solicitudActual !== null && (
                <HojaCorreo
                  correo={correoActual}
                  cliente={clienteActual}
                  estado={estadoActual}
                  onRevisar={
                    yaRevisada || pensando ? undefined : () => pedirRevision(solicitudActual)
                  }
                />
              )}

              {turnosVisibles.map((turno) =>
                turno.rol === "usuario" ? (
                  <div key={turno.id} className="flex justify-end">
                    <p className="m-0 max-w-[78%] rounded-[18px] rounded-br-[5px] bg-carbon px-4 py-2.5 text-[14.5px] text-white">
                      {turno.texto}
                    </p>
                  </div>
                ) : (
                  <article key={turno.id} className="flex flex-col gap-4">
                    {turno.llamadas.length > 0 && (
                      <LibroPasos llamadas={turno.llamadas} pensando={false} />
                    )}
                    {turno.texto !== "" && (
                      <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-x-3.5">
                        <Robot />
                        <div
                          className={`max-w-[54ch] whitespace-pre-wrap pt-1 text-[15px] leading-[1.66] ${
                            turno.rol === "sistema" ? "text-brasa" : "text-tinta"
                          }`}
                        >
                          <Texto>{turno.texto}</Texto>
                        </div>
                      </div>
                    )}
                  </article>
                ),
              )}

              {pensando && <LibroPasos llamadas={llamadasEnCurso} pensando />}

              {necesitaConfirmacion && !pensando && (
                <BloqueConfirmacion
                  cliente={clienteActual}
                  deshabilitado={pensando}
                  onResponder={enviar}
                />
              )}

              <div ref={finRef} />
            </div>
          </div>

          <form
            onSubmit={(evento) => {
              evento.preventDefault()
              enviar(borrador)
            }}
            className="shrink-0 bg-nube px-5 pb-6 pt-3.5 sm:px-8"
          >
            <div className="mx-auto max-w-[39rem] rounded-[18px] bg-papel py-1 pl-4.5 pr-1.5 shadow-carta">
              <textarea
                ref={entradaRef}
                value={borrador}
                onChange={(evento) => setBorrador(evento.target.value)}
                onKeyDown={(evento) => {
                  if (evento.key === "Enter" && !evento.shiftKey) {
                    evento.preventDefault()
                    enviar(borrador)
                  }
                }}
                rows={2}
                disabled={pensando}
                placeholder={
                  necesitaConfirmacion
                    ? "Responde, o usa los botones de arriba"
                    : "Pregúntame algo, o dime con cuál solicitud empiezo"
                }
                aria-label="Mensaje para el agente"
                className="block max-h-32 w-full resize-none border-0 bg-transparent px-0 pb-0.5 pt-3 text-[15px] placeholder:text-tenue focus:outline-none disabled:opacity-60"
              />
              <div className="flex items-center gap-2 pb-1 pr-0.5">
                <span className="mr-auto text-[11.5px] text-tenue">Enter para enviar</span>
                <button
                  type="submit"
                  disabled={pensando || borrador.trim() === ""}
                  aria-label="Enviar"
                  className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px] bg-carbon text-lima transition-colors hover:bg-carbon-hondo disabled:opacity-40"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-4 w-4 fill-none stroke-current stroke-[2.1] [stroke-linecap:round] [stroke-linejoin:round]"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
            </div>
          </form>
        </main>

        <div className="hidden min-h-0 xl:block">
          <Expediente
            cliente={clienteActual}
            estado={estadoActual}
            caso={casoActual}
            llamadas={llamadasDelCaso}
            artefactos={artefactos}
          />
        </div>
      </div>
    </div>
  )
}
