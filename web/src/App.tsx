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
import { Pensando } from "./componentes/Marcas.tsx"
import { RailEstado } from "./componentes/RailEstado.tsx"
import { TarjetaHerramienta } from "./componentes/TarjetaHerramienta.tsx"

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
            <strong key={clave} className="font-medium">
              {trozo.slice(2, -2)}
            </strong>
          )
        }
        if (trozo.startsWith("`") && trozo.endsWith("`")) {
          return (
            <span key={clave} className="dato rounded bg-hueco px-1 py-px text-[0.88em]">
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

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [])

  const todasLasLlamadas = turnos.flatMap((t) => t.llamadas)

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
        // CA5 — el error se muestra en el chat y la sesión sigue viva.
        const mensaje = causa instanceof Error ? causa.message : "no se pudo contactar al servidor"
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
      <header className="flex shrink-0 items-center gap-3 border-b border-regla bg-superficie px-4 py-2.5 sm:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[14px] font-medium tracking-tight">
            Registro como proveedor
          </h1>
          <p className="truncate text-[12px] text-tenue">
            Periferia IT Group · área administrativa
          </p>
        </div>
        {salud !== null && (
          <div className="hidden shrink-0 text-right sm:block">
            <p className="dato text-[11px] text-tenue">
              {salud.provider} · {salud.model}
            </p>
            <p className="dato text-[11px] text-apagado">
              vigencias al {salud.fechaReferencia}
              {!salud.claveConfigurada && " · sin clave"}
            </p>
          </div>
        )}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <main className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <div className="mx-auto max-w-2xl space-y-4">
              {vacio && !pensando && (
                <EstadoVacio
                  casos={casos}
                  deshabilitado={pensando}
                  onElegir={(caso) =>
                    enviar(
                      `Procesa el caso "${caso}". Dime qué campos quedaron llenos, cuáles faltan, si el paquete está listo para firma y qué soportes debo actualizar. No envíes nada todavía.`,
                    )
                  }
                />
              )}

              {turnos.map((turno) => (
                <article key={turno.id} className="space-y-2">
                  {turno.rol === "usuario" ? (
                    <div className="flex justify-end">
                      <p className="max-w-[80%] rounded-xl rounded-br-sm border border-regla bg-superficie px-3.5 py-2 text-[14px]">
                        {turno.texto}
                      </p>
                    </div>
                  ) : (
                    <>
                      {turno.llamadas.length > 0 && (
                        <div className="space-y-1.5">
                          {turno.llamadas.map((llamada) => (
                            <TarjetaHerramienta key={llamada.id} llamada={llamada} />
                          ))}
                        </div>
                      )}
                      {turno.texto !== "" && (
                        <div
                          className={`whitespace-pre-wrap text-[14px] leading-relaxed ${
                            turno.rol === "sistema" ? "text-bloqueo" : "text-tinta"
                          }`}
                        >
                          <Texto>{turno.texto}</Texto>
                        </div>
                      )}
                    </>
                  )}
                </article>
              ))}

              {pensando && (
                <Pensando iteracion={ultimaIteracion} tope={salud?.maxIteracionesTurno ?? 25} />
              )}

              {necesitaConfirmacion && !pensando && (
                <BloqueConfirmacion
                  caso={casoActual}
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
            className="shrink-0 border-t border-regla bg-superficie px-4 py-3 sm:px-6"
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
                    ? "El agente espera tu decisión"
                    : 'Procesa el caso "ec-corp-andina"'
                }
                aria-label="Mensaje para el agente"
                className={`max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-lg border bg-superficie px-3 py-2 text-[14px] placeholder:text-apagado disabled:opacity-60 ${
                  necesitaConfirmacion ? "border-dashed border-acento-regla" : "border-regla"
                }`}
              />
              <button
                type="submit"
                disabled={pensando || borrador.trim() === ""}
                className="h-10 shrink-0 rounded-lg border border-regla-fuerte px-3.5 text-[13px] transition-colors hover:bg-hueco disabled:opacity-40"
              >
                Enviar
              </button>
            </div>
          </form>
        </main>

        <div className="hidden min-h-0 lg:block">
          <RailEstado caso={casoActual} llamadas={todasLasLlamadas} artefactos={artefactos} />
        </div>
      </div>
    </div>
  )
}
