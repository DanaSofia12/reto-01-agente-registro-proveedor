#!/usr/bin/env bun
/**
 * Genera `modulo/` desde las fuentes reales (§9.4 del PRD, bonus).
 *
 * El PRD evalúa "que las tres piezas sean las mismas que usa tu aplicación, no
 * copias divergentes". Por eso se generan en vez de copiarse a mano, y por eso
 * `--check` falla en CI si alguien editó una y olvidó la otra.
 */

import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const RAIZ = path.resolve(import.meta.dir, "..")
const MODO_CHECK = process.argv.includes("--check")

const AVISO = "<!-- Generado por scripts/construir-modulo.ts. No editar a mano. -->"

interface Pieza {
  readonly destino: string
  readonly contenido: string
}

function leer(...partes: string[]): string {
  return readFileSync(path.join(RAIZ, ...partes), "utf8").trim()
}

/** El cuerpo es el system prompt real, sin una coma de diferencia. */
function agentMd(): string {
  const prompt = leer("agent", "prompt.md")
  return [
    "---",
    "description: Prepara formularios de registro como proveedor desde un repositorio maestro, arma el paquete de soportes para firma y deja el envío a una persona.",
    "mode: primary",
    "permission:",
    "  edit: deny",
    "  bash: deny",
    "---",
    "",
    AVISO,
    "",
    prompt,
    "",
  ].join("\n")
}

/** El cuerpo es el conocimiento real que consulta la aplicación. */
function skillMd(): string {
  const conocimiento = leer("src", "knowledge", "registro-proveedor.md")
  return [
    "---",
    "name: registro-proveedor",
    "description: El proceso de registro como proveedor ante clientes de Colombia, Ecuador, Perú, Panamá y Honduras — formatos de salida, identificador tributario por país, vigencia de soportes y qué bloquea la firma del representante legal.",
    "---",
    "",
    AVISO,
    "",
    conocimiento,
    "",
  ].join("\n")
}

/**
 * Re-exporta en vez de copiar. Si alguien añade una herramienta en
 * `src/tools/proveedor.ts`, el módulo la tiene sin tocar nada.
 */
function toolsTs(): string {
  return [
    "// Generado por scripts/construir-modulo.ts. No editar a mano.",
    "//",
    "// Las herramientas NO se copian: se re-exportan desde la misma fuente que usa",
    "// la aplicación, así que no pueden divergir. Importables sin levantar el",
    "// servidor y sin clave de ningún proveedor.",
    "",
    'export * from "../../src/tools/proveedor.ts"',
    'export { HERRAMIENTAS, buscarHerramienta } from "../../src/tools/registro.ts"',
    'export type { ContextoHerramienta, Resultado } from "../../src/domain/tipos.ts"',
    "",
  ].join("\n")
}

const PIEZAS: readonly Pieza[] = [
  { destino: "modulo/agent.md", contenido: agentMd() },
  { destino: "modulo/tools/proveedor.ts", contenido: toolsTs() },
  { destino: "modulo/skill/registro-proveedor/SKILL.md", contenido: skillMd() },
]

function actual(destino: string): string | null {
  try {
    return readFileSync(path.join(RAIZ, destino), "utf8")
  } catch {
    return null
  }
}

let divergentes = 0

for (const pieza of PIEZAS) {
  const previo = actual(pieza.destino)
  const igual = previo === pieza.contenido

  if (MODO_CHECK) {
    if (!igual) {
      divergentes += 1
      console.error(`  divergente: ${pieza.destino}`)
    }
    continue
  }

  writeFileSync(path.join(RAIZ, pieza.destino), pieza.contenido, "utf8")
  console.info(`  ${igual ? "sin cambios" : "actualizado"}: ${pieza.destino}`)
}

if (MODO_CHECK) {
  if (divergentes > 0) {
    console.error(
      `\n${divergentes} pieza(s) de modulo/ no coinciden con las fuentes.\nEjecuta: bun run modulo`,
    )
    process.exit(1)
  }
  console.info("modulo/ está sincronizado con agent/prompt.md, src/knowledge/ y src/tools/")
}
