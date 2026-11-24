import type { RegistroLlamada } from "../api.ts"
import { accion, lista, nombrePais } from "../lenguaje.ts"

/**
 * Lo que hizo el agente, paso a paso.
 *
 * Cada llamada a herramienta tiene que ser visible, pero mostrar el nombre de la
 * función y su JSON es visible para un programador y opaco para quien hace este
 * trabajo. Aquí cada paso es una frase.
 *
 * Se numera porque es una secuencia real: cada línea es una iteración del bucle
 * del agente, no un indicador de progreso decorativo.
 */

/** El resultado de cada herramienta, contado como se lo contarías a una persona. */
function resultadoLegible(llamada: RegistroLlamada): string {
  if (!llamada.ok) return llamada.resumen
  const datos =
    typeof llamada.resultado === "object" && llamada.resultado !== null
      ? (llamada.resultado as Record<string, unknown>)
      : null
  if (datos === null) return "Listo"

  switch (llamada.nombre) {
    case "proveedor_leer_solicitud": {
      const pais = typeof datos.pais === "string" ? nombrePais(datos.pais) : "el cliente"
      const formato = typeof datos.formato === "string" ? datos.formato.toUpperCase() : ""
      const campos = lista(datos, "campos").length
      const soportes = lista(datos, "soportes").length
      return `Desde ${pais}: pide un formulario ${formato} con ${campos} campos y ${soportes} soportes`
    }
    case "proveedor_mapear_campos": {
      const llenos = lista(datos, "llenos").length
      const confirmar = lista(datos, "requiere_confirmacion").length
      const faltan = lista(datos, "faltantes").length
      const colas: string[] = []
      if (confirmar > 0) colas.push(`${confirmar} necesita tu visto bueno`)
      if (faltan > 0) colas.push(`${faltan} quedó sin dato`)
      const cola = colas.length === 0 ? "" : `; ${colas.join(" y ")}`
      return `Llenó ${llenos} campos${cola}`
    }
    case "proveedor_generar_formulario":
      return "Quedó guardado y listo para adjuntar"
    case "proveedor_armar_paquete": {
      const bloqueos = lista<{ bloquea?: boolean }>(datos, "checklist").filter(
        (i) => i.bloquea === true,
      ).length
      if (datos.listo_para_firma === true) return "Paquete completo, listo para firma"
      return bloqueos === 1
        ? "Falta un soporte para que el representante legal pueda firmar"
        : `Faltan ${bloqueos} soportes para poder firmar`
    }
    case "proveedor_simular_envio":
      return "Constancia registrada. No salió nada hacia el cliente."
    default:
      return "Listo"
  }
}

export function LibroPasos({
  llamadas,
  pensando,
}: {
  llamadas: readonly RegistroLlamada[]
  pensando: boolean
}) {
  if (llamadas.length === 0 && !pensando) return null
  const ultima = llamadas[llamadas.length - 1]

  return (
    <section aria-label="Lo que hizo el agente">
      <ol className="relative m-0 list-none p-0 before:absolute before:bottom-3 before:left-3 before:top-3 before:w-0.5 before:bg-pelo before:content-['']">
        {llamadas.map((llamada, i) => (
          <Paso
            key={llamada.id}
            numero={i + 1}
            titulo={accion(llamada.nombre)}
            detalle={resultadoLegible(llamada)}
            ok={llamada.ok}
          />
        ))}
        {pensando && (
          <Paso
            numero={llamadas.length + 1}
            titulo={ultima === undefined ? "Revisando qué hace falta" : accion(ultima.nombre, true)}
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
  titulo,
  detalle,
  ok,
  corriendo = false,
}: {
  numero: number
  titulo: string
  detalle: string | null
  ok: boolean
  corriendo?: boolean
}) {
  const ficha = corriendo
    ? "latiendo bg-lima text-carbon"
    : ok
      ? "bg-carbon text-lima"
      : "bg-brasa-velo text-brasa"

  return (
    <li className="relative grid grid-cols-[26px_minmax(0,1fr)] items-start gap-x-3.5 pb-4 last:pb-0">
      <span
        className={`dato z-[1] grid h-[26px] w-[26px] place-items-center rounded-[9px] text-[10.5px] shadow-[0_0_0_5px_var(--color-nube)] ${ficha}`}
      >
        {numero}
      </span>
      <span className="min-w-0">
        <span className="block text-[14.5px] font-medium leading-snug tracking-[-0.012em]">
          {titulo}
        </span>
        {detalle !== null && (
          <span
            className={`mt-0.5 block text-[13px] leading-snug ${ok ? "text-prosa" : "text-brasa"}`}
          >
            {detalle}
          </span>
        )}
      </span>
    </li>
  )
}
