import type { RegistroLlamada } from "../api.ts"
import { accion, accionEnCurso } from "../lenguaje.ts"

/**
 * Lo que hizo el agente, paso a paso.
 *
 * Cada llamada a herramienta tiene que ser visible, pero mostrar el nombre de
 * la función y su JSON es visible para un programador y opaco para quien hace
 * este trabajo. Aquí cada paso es una frase en su idioma.
 *
 * Se numera porque es una secuencia real: cada línea es una iteración del
 * bucle del agente, no un indicador de progreso decorativo.
 */

function lista(datos: Record<string, unknown>, clave: string): unknown[] {
  const valor = datos[clave]
  return Array.isArray(valor) ? valor : []
}

/** El resultado de cada herramienta, resumido sin jerga. */
function resultadoLegible(llamada: RegistroLlamada): string {
  if (!llamada.ok) return llamada.resumen
  const d = llamada.resultado
  if (typeof d !== "object" || d === null) return "listo"
  const datos = d as Record<string, unknown>

  switch (llamada.nombre) {
    case "proveedor_leer_solicitud": {
      const pais = typeof datos.paisNombre === "string" ? datos.paisNombre : ""
      const formato = typeof datos.formato === "string" ? datos.formato.toUpperCase() : ""
      const campos = lista(datos, "campos").length
      const soportes = lista(datos, "soportes").length
      return `${pais} · formulario ${formato} · ${campos} campos · ${soportes} soportes exigidos`
    }
    case "proveedor_mapear_campos": {
      const llenos = lista(datos, "llenos").length
      const confirmar = lista(datos, "requiere_confirmacion").length
      const faltan = lista(datos, "faltantes").length
      const partes = [`${llenos} campos llenos`]
      if (confirmar > 0) partes.push(`${confirmar} por confirmar`)
      if (faltan > 0) partes.push(`${faltan} sin dato`)
      return partes.join(" · ")
    }
    case "proveedor_generar_formulario":
      return "Formulario diligenciado y guardado"
    case "proveedor_armar_paquete": {
      const items = lista(datos, "checklist") as { bloquea?: boolean }[]
      const bloqueos = items.filter((i) => i.bloquea === true).length
      if (datos.listo_para_firma === true) return "Paquete completo, listo para firma"
      return bloqueos === 1
        ? "Paquete armado · falta 1 soporte para poder firmar"
        : `Paquete armado · faltan ${bloqueos} soportes para poder firmar`
    }
    case "proveedor_simular_envio":
      return "Constancia registrada. No salió nada hacia el cliente."
    default:
      return "listo"
  }
}

export function LibroPasos({
  llamadas,
  pensando,
  iteracion,
}: {
  llamadas: RegistroLlamada[]
  pensando: boolean
  iteracion: number | null
}) {
  if (llamadas.length === 0 && !pensando) return null

  return (
    <section
      aria-label="Lo que hizo el agente"
      className="overflow-hidden rounded-sm border border-regla bg-superficie"
    >
      <div className="flex items-center gap-2.5 border-b border-regla px-3.5 py-2">
        <h3 className="text-[13px] font-semibold">Lo que hizo el agente</h3>
        {pensando ? (
          <span className="dato ml-auto rounded-full border border-acento-regla bg-acento-suave px-2.5 py-px text-[11px] text-acento">
            {iteracion === null ? "trabajando" : `paso ${iteracion}`}
          </span>
        ) : (
          <span className="ml-auto text-[11.5px] text-apagado">
            {llamadas.length === 1 ? "1 paso" : `${llamadas.length} pasos`}
          </span>
        )}
      </div>

      <ol className="py-1">
        {llamadas.map((llamada, i) => (
          <Paso
            key={llamada.id}
            numero={i + 1}
            texto={accion(llamada.nombre)}
            detalle={resultadoLegible(llamada)}
            ok={llamada.ok}
          />
        ))}
        {pensando && (
          <Paso
            numero={llamadas.length + 1}
            texto={
              llamadas.length === 0
                ? "Revisando qué hace falta"
                : accionEnCurso(llamadas[llamadas.length - 1]?.nombre ?? "")
            }
            detalle={null}
            ok
            corriendo
          />
        )}
      </ol>
    </section>
  )
}

function Paso({
  numero,
  texto,
  detalle,
  ok,
  corriendo = false,
}: {
  numero: number
  texto: string
  detalle: string | null
  ok: boolean
  corriendo?: boolean
}) {
  const ficha = corriendo
    ? "corriendo border-acento bg-acento text-white"
    : ok
      ? "border-acento-regla bg-acento-suave text-acento"
      : "border-bloqueo-regla bg-bloqueo-suave text-bloqueo"

  return (
    <li className="relative grid grid-cols-[21px_minmax(0,1fr)] items-start gap-x-3 px-3.5 py-2">
      <span
        aria-hidden="true"
        className="absolute left-[23px] top-0 h-2 w-px bg-regla first:hidden"
      />
      <span
        className={`dato mt-px grid h-[21px] w-[21px] place-items-center rounded-full border text-[11px] ${ficha}`}
      >
        {numero}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] leading-snug">{texto}</span>
        {detalle !== null && (
          <span
            className={`mt-0.5 block text-[12.5px] leading-snug ${ok ? "text-tenue" : "text-bloqueo"}`}
          >
            {detalle}
          </span>
        )}
      </span>
    </li>
  )
}
