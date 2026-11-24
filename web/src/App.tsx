import { useCallback, useEffect, useRef, useState } from "react"
import {
  enviarMensaje,
  obtenerArtefactos,
  obtenerCasos,
  obtenerSalud,
  type RegistroLlamada,
  type ResumenCaso,
  type Salud,
} from "./api.ts"
import { BloqueConfirmacion } from "./componentes/BloqueConfirmacion.tsx"
import { EstadoVacio } from "./componentes/EstadoVacio.tsx"
import { Expediente } from "./componentes/Expediente.tsx"
import { type Correo, HojaCorreo } from "./componentes/HojaCorreo.tsx"
import { LibroPasos } from "./componentes/LibroPasos.tsx"

interface Turno {
  id: string
  rol: "usuario" | "agente" | "sistema"
  texto: string
  llamadas: RegistroLlamada[]
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
            <span key={clave} className="dato rounded-sm bg-hueco px-1 py-px text-[0.88em]">
              {trozo.slice(1, -1)}
            </span>
          )
        }
        return <span key={clave}>{trozo}</span>
      })}
    </>
  )
}

/** El correo del cliente, extraído del resultado de la herramienta que lo leyó. */
function correoDe(llamadas: RegistroLlamada[]): { correo: Correo; cliente: string } | null {
  for (let i = llamadas.length - 1; i >= 0; i--) {
    const l = llamadas[i]
    if (l?.nombre !== "proveedor_leer_solicitud" || !l.ok) continue
    if (typeof l.resultado !== "object" || l.resultado === null) continue
    const d = l.resultado as { correo?: Correo; cliente?: string }
    if (d.correo === undefined || typeof d.cliente !== "string") continue
    return { correo: d.correo, cliente: d.cliente }
  }
  return null
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
  const [artefactos, setArtefactos] = useState<string[]>([])
  const [ultimaIteracion, setUltimaIteracion] = useState<number | null>(null)

  const finRef = useRef<HTMLDivElement>(null)
  const entradaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    obtenerSalud()
      .then(setSalud)
      .catch(() => setSalud(null))
    obtenerCasos()
      .then((r) => setCasos(r.casos))
      .catch(() => setCasos([]))
  }, [])

  const todasLasLlamadas = turnos.flatMap((t) => t.llamadas)
  const llamadasDelTurnoActual = turnos[turnos.length - 1]?.llamadas ?? []
  const sobre = correoDe(todasLasLlamadas)
  const clienteActual = sobre?.cliente ?? casos.find((c) => c.caso === casoActual)?.cliente ?? null

  const enviar = useCallback(
    async (texto: string, confirmacion = false) => {
      const limpio = texto.trim()
      if (limpio === "" || pensando) return

      setBorrador("")
      setNecesitaConfirmacion(false)
      setPensando(true)
      setTurnos((previos) => [
        ...previos,
        { id: crypto.randomUUID(), rol: "usuario", texto: limpio, llamadas: [] },
      ])

      try {
        const respuesta = await enviarMensaje(sessionId, limpio, confirmacion)
        setSessionId(respuesta.sessionId)
        setNecesitaConfirmacion(respuesta.needsConfirmation)
        setUltimaIteracion(respuesta.iteraciones ?? null)
        setTurnos((previos) => [
          ...previos,
          {
            id: crypto.randomUUID(),
            rol: "agente",
            texto: respuesta.reply,
            llamadas: respuesta.toolCalls,
          },
        ])

        const conCaso = respuesta.toolCalls
          .map((l) => (l.argumentos as { caso?: string } | null)?.caso)
          .filter((c): c is string => typeof c === "string")
        const ultimo = conCaso.at(-1) ?? casoActual
        if (ultimo !== null && ultimo !== undefined) {
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
          { id: crypto.randomUUID(), rol: "sistema", texto: mensaje, llamadas: [] },
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

  const vacio = turnos.length === 0

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-regla bg-hueco px-4 py-2.5 sm:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[14.5px] font-semibold tracking-tight">
            Registro como proveedor
          </h1>
          <p className="truncate text-[12px] text-tenue">
            Periferia IT Group · área administrativa
          </p>
        </div>
        {salud !== null && (
          <p className="hidden shrink-0 text-right text-[11.5px] text-tenue sm:block">
            Vigencias calculadas al {salud.fechaReferencia}
          </p>
        )}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <div className="mx-auto flex max-w-2xl flex-col gap-4">
              {vacio && !pensando && (
                <EstadoVacio
                  casos={casos}
                  deshabilitado={pensando}
                  onElegir={(caso) => {
                    const elegido = casos.find((c) => c.caso === caso)
                    setCasoActual(caso)
                    enviar(
                      `Revisa la solicitud de ${elegido?.cliente ?? caso}. Dime qué quedó listo, qué falta y si ya se puede firmar. No mandes nada todavía.`,
                    )
                  }}
                />
              )}

              {sobre !== null && <HojaCorreo correo={sobre.correo} cliente={sobre.cliente} />}

              {turnos.map((turno, indice) => {
                const esUltimo = indice === turnos.length - 1
                return (
                  <article key={turno.id} className="flex flex-col gap-3">
                    {turno.rol === "usuario" ? (
                      <div className="flex justify-end">
                        <p className="max-w-[80%] rounded-md rounded-br-sm border border-regla bg-superficie px-3.5 py-2 text-[14px]">
                          {turno.texto}
                        </p>
                      </div>
                    ) : (
                      <>
                        {turno.llamadas.length > 0 && (
                          <LibroPasos
                            llamadas={turno.llamadas}
                            pensando={false}
                            iteracion={esUltimo ? ultimaIteracion : null}
                          />
                        )}
                        {turno.texto !== "" && (
                          <div
                            className={`max-w-[64ch] whitespace-pre-wrap text-[14.5px] leading-relaxed ${
                              turno.rol === "sistema" ? "text-bloqueo" : "text-tinta"
                            }`}
                          >
                            <Texto>{turno.texto}</Texto>
                          </div>
                        )}
                      </>
                    )}
                  </article>
                )
              })}

              {pensando && (
                <LibroPasos
                  llamadas={llamadasDelTurnoActual}
                  pensando
                  iteracion={ultimaIteracion}
                />
              )}

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
            className="shrink-0 border-t border-regla bg-hueco px-4 py-3 sm:px-6"
          >
            <div className="mx-auto flex max-w-2xl items-end gap-2">
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
                rows={1}
                disabled={pensando}
                placeholder={
                  necesitaConfirmacion
                    ? "Responde, o usa los botones de arriba"
                    : "Escríbele al agente"
                }
                aria-label="Mensaje para el agente"
                className={`max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-sm border bg-superficie px-3 py-2 text-[14px] placeholder:text-apagado disabled:opacity-60 ${
                  necesitaConfirmacion ? "border-dashed border-acento-regla" : "border-regla"
                }`}
              />
              <button
                type="submit"
                disabled={pensando || borrador.trim() === ""}
                className="h-10 shrink-0 rounded-sm border border-regla-fuerte px-4 text-[13.5px] transition-colors hover:bg-superficie disabled:opacity-40"
              >
                Enviar
              </button>
            </div>
          </form>
        </main>

        <div className="hidden min-h-0 border-l border-regla lg:block">
          <Expediente
            cliente={clienteActual}
            caso={casoActual}
            llamadas={todasLasLlamadas}
            artefactos={artefactos}
          />
        </div>
      </div>
    </div>
  )
}
