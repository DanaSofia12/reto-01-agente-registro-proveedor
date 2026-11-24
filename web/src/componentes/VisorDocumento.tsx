import { useEffect, useState } from "react"
import { leerTexto, urlArchivo } from "../api.ts"
import { nombreArtefacto, propositoArtefacto } from "../lenguaje.ts"

/**
 * Mirar un documento sin salir de la aplicación.
 *
 * Antes los enlaces abrían una pestaña nueva y el navegador descargaba el
 * archivo en vez de mostrarlo, así que no había forma de comprobar lo que el
 * agente decía haber escrito.
 *
 * Qué se puede enseñar depende del formato, y eso se dice en claro en vez de
 * dejar la pantalla en blanco:
 *   texto y markdown — se renderizan aquí
 *   pdf             — se incrusta
 *   xlsx            — el navegador no sabe abrirlo; se ofrece descargar
 */

export interface CampoEscrito {
  readonly etiqueta: string
  readonly valor: string
}

type Clase = "texto" | "pdf" | "hoja"

function claseDe(ruta: string): Clase {
  if (ruta.endsWith(".pdf")) return "pdf"
  if (ruta.endsWith(".xlsx")) return "hoja"
  return "texto"
}

export function VisorDocumento({
  caso,
  ruta,
  camposEscritos,
  onCerrar,
}: {
  caso: string
  ruta: string
  /** Lo que el agente escribió en la hoja, para el formato que no se puede abrir. */
  camposEscritos: readonly CampoEscrito[]
  onCerrar: () => void
}) {
  const clase = claseDe(ruta)
  const [texto, setTexto] = useState<string | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)

  useEffect(() => {
    if (clase !== "texto") return
    let vigente = true
    setTexto(null)
    setFallo(null)
    leerTexto(caso, ruta)
      .then((t) => {
        if (vigente) setTexto(t)
      })
      .catch(() => {
        if (vigente) setFallo("No se pudo leer el documento.")
      })
    return () => {
      vigente = false
    }
  }, [caso, ruta, clase])

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar()
    }
    window.addEventListener("keydown", alTeclear)
    return () => window.removeEventListener("keydown", alTeclear)
  }, [onCerrar])

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-carbon/40 p-0 sm:p-6">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: el cierre por teclado va en Escape, arriba */}
      <div className="absolute inset-0" onClick={onCerrar} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={nombreArtefacto(ruta)}
        className="relative flex w-full max-w-[44rem] flex-col overflow-hidden bg-papel shadow-carta sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-pelo px-5 py-3.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold tracking-[-0.022em]">
              {nombreArtefacto(ruta)}
            </span>
            <span className="dato block truncate text-[11px] text-tenue">{ruta}</span>
          </span>
          <a
            href={urlArchivo(caso, ruta)}
            download
            className="shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] no-underline ring-1 ring-pelo ring-inset hover:bg-nube"
          >
            Descargar
          </a>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-nube"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-4 w-4 fill-none stroke-current stroke-[2] [stroke-linecap:round]"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        {propositoArtefacto(ruta) !== null && (
          <p className="m-0 shrink-0 border-b border-pelo bg-nube px-5 py-2.5 text-[12.5px] leading-snug text-prosa">
            {propositoArtefacto(ruta)}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {clase === "pdf" && (
            <iframe
              src={urlArchivo(caso, ruta)}
              title={nombreArtefacto(ruta)}
              className="h-full min-h-[32rem] w-full border-0"
            />
          )}

          {clase === "hoja" && <Hoja campos={camposEscritos} />}

          {clase === "texto" && (
            <div className="px-5 py-4">
              {fallo !== null && <p className="m-0 text-[14px] text-brasa">{fallo}</p>}
              {fallo === null && texto === null && (
                <p className="m-0 text-[14px] text-tenue">Abriendo el documento…</p>
              )}
              {texto !== null && <Markdown fuente={texto} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Una hoja de cálculo no se abre en el navegador. En vez de dejar el visor en
 * blanco, se muestra lo que el agente escribió en ella.
 */
function Hoja({ campos }: { campos: readonly CampoEscrito[] }) {
  if (campos.length === 0) {
    return (
      <p className="m-0 px-5 py-4 text-[14px] text-tenue">
        El navegador no puede abrir una hoja de cálculo. Descárgala para verla en Excel.
      </p>
    )
  }
  return (
    <div className="px-5 py-4">
      <p className="m-0 mb-3 text-[13px] text-tenue">
        El navegador no abre hojas de cálculo. Esto es lo que quedó escrito en la plantilla del
        cliente; descárgala para verla con su formato original.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr>
              <th className="border-b border-pelo pb-2 pr-4 font-semibold">
                Campo de la plantilla
              </th>
              <th className="border-b border-pelo pb-2 font-semibold">Valor escrito</th>
            </tr>
          </thead>
          <tbody>
            {campos.map((c) => (
              <tr key={c.etiqueta}>
                <td className="border-b border-nube py-2 pr-4 align-top">{c.etiqueta}</td>
                <td className="dato border-b border-nube py-2 align-top">{c.valor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Lo justo de Markdown para leer un checklist o un borrador de correo. */
function Markdown({ fuente }: { fuente: string }) {
  return (
    <div className="max-w-[62ch] text-[14.5px] leading-[1.7]">
      {fuente.split("\n").map((linea, i) => {
        const clave = `${i}-${linea.slice(0, 24)}`
        if (linea.trim() === "") return <div key={clave} className="h-3" />
        if (linea.startsWith("### "))
          return (
            <h4 key={clave} className="titular mb-1 mt-4 text-[15px]">
              {linea.slice(4)}
            </h4>
          )
        if (linea.startsWith("## "))
          return (
            <h3 key={clave} className="titular mb-1.5 mt-5 text-[17px]">
              {linea.slice(3)}
            </h3>
          )
        if (linea.startsWith("# "))
          return (
            <h2 key={clave} className="titular mb-2 mt-2 text-[20px]">
              {linea.slice(2)}
            </h2>
          )
        if (linea.startsWith("- ") || linea.startsWith("* "))
          return (
            <p key={clave} className="m-0 pl-4 -indent-4 text-prosa">
              <Negritas texto={linea} />
            </p>
          )
        if (/^\s*\|/.test(linea))
          return (
            <p key={clave} className="dato m-0 whitespace-pre text-[12px] text-prosa">
              {linea}
            </p>
          )
        return (
          <p key={clave} className="m-0 text-prosa">
            <Negritas texto={linea} />
          </p>
        )
      })}
    </div>
  )
}

function Negritas({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((trozo, i) => {
        const clave = `${i}-${trozo.slice(0, 10)}`
        if (trozo.startsWith("**") && trozo.endsWith("**"))
          return (
            <strong key={clave} className="font-semibold text-tinta">
              {trozo.slice(2, -2)}
            </strong>
          )
        if (trozo.startsWith("`") && trozo.endsWith("`"))
          return (
            <span key={clave} className="dato">
              {trozo.slice(1, -1)}
            </span>
          )
        return <span key={clave}>{trozo}</span>
      })}
    </>
  )
}
