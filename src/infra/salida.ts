import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { rutaSalida } from "./rutas.ts"

/** Escritura. Todo pasa por `rutaSalida`, que confina la salida a `out/`. */

function asegurarDirectorio(destino: string): void {
  mkdirSync(path.dirname(destino), { recursive: true })
}

export function escribirTexto(directory: string, relativa: string, contenido: string): string {
  const destino = rutaSalida(directory, relativa)
  asegurarDirectorio(destino)
  writeFileSync(destino, contenido, "utf8")
  return relativa
}

export function escribirBinario(
  directory: string,
  relativa: string,
  contenido: Uint8Array,
): string {
  const destino = rutaSalida(directory, relativa)
  asegurarDirectorio(destino)
  writeFileSync(destino, contenido)
  return relativa
}

export function copiarA(directory: string, origen: string, relativa: string): string {
  const destino = rutaSalida(directory, relativa)
  asegurarDirectorio(destino)
  copyFileSync(origen, destino)
  return relativa
}

export function anexarLinea(directory: string, relativa: string, linea: string): void {
  const destino = rutaSalida(directory, relativa)
  asegurarDirectorio(destino)
  const previo = existsSync(destino) ? "" : ""
  writeFileSync(destino, previo, { flag: "a" })
  writeFileSync(destino, `${linea}\n`, { flag: "a" })
}

/** `out/` se limpia al inicio de demo.ts (NFR Determinismo). */
export function limpiarSalida(directory: string): void {
  const raiz = rutaSalida(directory)
  if (existsSync(raiz)) rmSync(raiz, { recursive: true, force: true })
  mkdirSync(raiz, { recursive: true })
}
