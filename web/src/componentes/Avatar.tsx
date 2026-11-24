/**
 * El avatar de un cliente: un dibujo de lo que hace la empresa, no sus iniciales.
 *
 * Dos letras obligan a descifrar; un contenedor sobre ruedas se reconoce de un
 * vistazo. La chapa de la esquina añade el estado sin pedir que se lea nada.
 */

export type EstadoSolicitud = "lista" | "bloqueada" | "decidir" | "sin_revisar"

/**
 * Oficio de cada cliente, deducido de su razón social.
 *
 * Es presentación, no dominio: si no reconoce el giro, cae en el edificio
 * genérico, que sigue siendo mejor que un identificador en pantalla.
 */
type Oficio = "industria" | "oficina" | "logistica" | "agro"

function oficioDe(cliente: string): Oficio {
  const n = cliente.toLowerCase()
  if (n.includes("industri") || n.includes("fábrica") || n.includes("fabrica")) return "industria"
  if (n.includes("logísti") || n.includes("logisti") || n.includes("transporte")) return "logistica"
  if (n.includes("agro") || n.includes("export") || n.includes("agríc")) return "agro"
  return "oficina"
}

const TRAZOS: Readonly<Record<Oficio, string>> = {
  industria: "M3 20V11l5 3V11l5 3V6l8 4v10zM8 20v-3M13 20v-3M18 20v-3",
  oficina: "M5 20V4h9v16M14 20h5V10h-5M8 8h3M8 12h3M8 16h3",
  logistica: "M2 7h11v9H2zM13 10h4.5l3 3.2V16H13",
  agro: "M20 4c0 8-5 13-12 13H5c0-8 5-13 12-13zM5 20c2-5 5-8 9-10",
}

const PIEL: Readonly<Record<EstadoSolicitud, string>> = {
  lista: "bg-savia-velo text-savia",
  bloqueada: "bg-brasa-velo text-brasa",
  decidir: "bg-lima text-carbon",
  sin_revisar: "bg-nube text-tenue ring-1 ring-pelo ring-inset",
}

const CHAPA: Readonly<Record<EstadoSolicitud, { fondo: string; trazo: string; d: string }>> = {
  lista: { fondo: "bg-savia", trazo: "stroke-white", d: "M5 13l4 4L19 7" },
  bloqueada: { fondo: "bg-brasa", trazo: "stroke-white", d: "M12 7v7M12 17.5v.01" },
  decidir: { fondo: "bg-lima", trazo: "stroke-carbon", d: "M12 7v5l3 2" },
  sin_revisar: { fondo: "bg-pelo", trazo: "stroke-tenue", d: "M6 12h12" },
}

export function Avatar({
  cliente,
  estado,
  grande = false,
}: {
  cliente: string
  estado: EstadoSolicitud
  grande?: boolean
}) {
  const chapa = CHAPA[estado]
  const lado = grande ? "h-11 w-11" : "h-[34px] w-[34px]"
  const glifo = grande ? "h-6 w-6" : "h-[18px] w-[18px]"
  const sello = grande ? "h-4 w-4" : "h-[14px] w-[14px]"

  return (
    <span
      className={`relative grid shrink-0 place-items-center rounded-full ${lado} ${PIEL[estado]}`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={`${glifo} fill-none stroke-current stroke-[1.7] [stroke-linecap:round] [stroke-linejoin:round]`}
      >
        <path d={TRAZOS[oficioDe(cliente)]} />
      </svg>
      <i
        className={`absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full ring-2 ring-papel ${sello} ${chapa.fondo}`}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`h-2 w-2 fill-none stroke-[3] [stroke-linecap:round] ${chapa.trazo}`}
        >
          <path d={chapa.d} />
        </svg>
      </i>
    </span>
  )
}

/** El agente. Un robot: no es una persona y no finge serlo. */
export function Robot({ grande = false }: { grande?: boolean }) {
  const lado = grande ? "h-11 w-11" : "h-[34px] w-[34px]"
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-carbon ${lado}`}>
      <svg viewBox="0 0 32 32" aria-hidden="true" className="h-[22px] w-[22px]">
        <path d="M16 4.5v3" stroke="#C8F23F" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="16" cy="3.4" r="1.7" fill="#C8F23F" />
        <rect
          x="5.5"
          y="8"
          width="21"
          height="16"
          rx="6"
          fill="none"
          stroke="#C8F23F"
          strokeWidth="1.8"
        />
        <circle cx="11.6" cy="15" r="1.9" fill="#C8F23F" />
        <circle cx="20.4" cy="15" r="1.9" fill="#C8F23F" />
        <path
          d="M12.4 19.6c2.3 1.5 4.9 1.5 7.2 0"
          stroke="#C8F23F"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </span>
  )
}
