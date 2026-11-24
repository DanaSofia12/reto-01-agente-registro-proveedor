import type { EntradaBitacora } from "../domain/tipos.ts"
import { anexarLinea } from "./salida.ts"

/**
 * Toda llamada a herramienta queda registrada, en dos sitios: un log global y
 * uno por caso. El global sirve para auditar la sesión completa; el del caso
 * viaja junto a los documentos que generó.
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
