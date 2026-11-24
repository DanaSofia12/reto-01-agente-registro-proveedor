import type { ReactNode } from "react"

/**
 * Una carpeta de expediente: el bloque lleva una pestaña que dice de qué trata
 * antes de leer el contenido. Es el objeto físico de este oficio.
 *
 * Tres tonos y cada uno significa algo:
 *   carbon — el agente la produjo
 *   lima   — necesita una decisión tuya
 *   papel  — informativa
 */

export type TonoCarpeta = "carbon" | "lima" | "papel"

const PIEL: Readonly<Record<TonoCarpeta, { pestana: string; cuerpo: string }>> = {
  carbon: { pestana: "bg-carbon text-lima", cuerpo: "bg-carbon text-white" },
  lima: { pestana: "bg-lima text-carbon", cuerpo: "bg-lima text-carbon" },
  papel: { pestana: "bg-papel text-prosa", cuerpo: "bg-papel text-tinta shadow-carta" },
}

export function Carpeta({
  pestana,
  tono,
  children,
  onClick,
}: {
  pestana: string
  tono: TonoCarpeta
  children: ReactNode
  onClick?: () => void
}) {
  const piel = PIEL[tono]
  const cuerpo = (
    <>
      <span
        className={`inline-flex items-center gap-2 rounded-t-[11px] px-3.5 pb-1.5 pt-1.5 text-[12px] font-medium ${piel.pestana}`}
      >
        {pestana}
      </span>
      <span
        className={`flex w-full flex-1 flex-col rounded-b-[15px] rounded-tr-[15px] px-5 pb-5 pt-4 ${piel.cuerpo}`}
      >
        {children}
      </span>
    </>
  )

  if (onClick === undefined) {
    return <div className="flex h-full w-full flex-col items-start text-left">{cuerpo}</div>
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full w-full flex-col items-start text-left transition-opacity hover:opacity-90"
    >
      {cuerpo}
    </button>
  )
}

/**
 * Cifra primero porque es lo que se mira; después qué significa y el matiz.
 *
 * Un número corto se pinta enorme; una fecha necesita menos cuerpo o rompe la
 * caja. El umbral es la longitud, no el tipo: así sirve igual para "4", "13/15"
 * o "27 de agosto".
 */
export function Cifra({ valor, titulo, nota }: { valor: string; titulo: string; nota: string }) {
  const cuerpo = valor.length <= 5 ? "text-[44px]" : "text-[26px]"
  return (
    <>
      <span className={`block font-bold leading-[0.95] tracking-[-0.04em] ${cuerpo}`}>{valor}</span>
      <span className="mt-2 block flex-1 text-[17px] font-semibold leading-tight tracking-[-0.028em]">
        {titulo}
      </span>
      <span className="mt-3 block text-[13px] leading-snug opacity-70">{nota}</span>
    </>
  )
}
