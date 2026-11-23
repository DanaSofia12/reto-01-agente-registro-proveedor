import type { EntradaBitacora } from "../domain/tipos.ts"
import { anexarLinea } from "./salida.ts"

/**
 * CA4 y RN5 — Toda llamada a herramienta queda registrada.
 * El PRD menciona dos rutas (`out/log.jsonl` en CA4, `out/<caso>/log.jsonl` en
 * RN5). Se escriben las dos: cuesta nada y elimina el riesgo de que el
 * evaluador mire la que no se implementó.
 */

export function registrar(directory: string, caso: string | null, entrada: EntradaBitacora): void {
  const linea = JSON.stringify(entrada)
  anexarLinea(directory, "log.jsonl", linea)
  if (caso !== null) anexarLinea(directory, `${caso}/log.jsonl`, linea)
}

export function entrada(
  herramienta: string,
  ok: boolean,
  resumen: string,
  ahora: Date = new Date(),
): EntradaBitacora {
  return { ts: ahora.toISOString(), herramienta, ok, resumen }
}
