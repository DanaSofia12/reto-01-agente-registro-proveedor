#!/usr/bin/env bun
/**
 * Verificación sin modelo (§6.6 del PRD).
 *
 * Ejecuta las herramientas sobre todos los casos de fixtures/reto-01/casos/ e
 * imprime un resumen. Corre sin clave de ningún proveedor: las herramientas son
 * la lógica, el modelo solo las orquesta.
 *
 *   bun install && bun run demo.ts
 */

import { fechaReferencia } from "./src/config.ts"
import type { ContextoHerramienta } from "./src/domain/tipos.ts"
import { casosDisponibles } from "./src/infra/rutas.ts"
import { limpiarSalida } from "./src/infra/salida.ts"
import { buscarHerramienta, HERRAMIENTAS } from "./src/tools/registro.ts"

const RAIZ = import.meta.dir

const C = {
  reset: "\x1b[0m",
  tenue: "\x1b[2m",
  negrita: "\x1b[1m",
  verde: "\x1b[32m",
  ambar: "\x1b[33m",
  rojo: "\x1b[31m",
  azul: "\x1b[36m",
}

interface RespuestaHerramienta {
  ok: boolean
  data?: Record<string, unknown>
  error?: string
}

async function invocar(
  nombre: string,
  argumentos: Record<string, unknown>,
  ctx: ContextoHerramienta,
): Promise<RespuestaHerramienta> {
  const herramienta = buscarHerramienta(nombre)
  if (herramienta === undefined) return { ok: false, error: `herramienta desconocida: ${nombre}` }
  const crudo = await herramienta.ejecutar(argumentos, ctx)
  try {
    return JSON.parse(crudo) as RespuestaHerramienta
  } catch {
    return { ok: false, error: "la herramienta devolvió un JSON inválido" }
  }
}

function numero(valor: unknown): number {
  return Array.isArray(valor) ? valor.length : 0
}

interface Fila {
  caso: string
  pais: string
  formato: string
  llenos: number
  confirmar: number
  faltantes: number
  artefacto: string
  listo: boolean | null
  bloqueo: string
}

async function procesar(caso: string, ctx: ContextoHerramienta): Promise<Fila> {
  const fila: Fila = {
    caso,
    pais: "—",
    formato: "—",
    llenos: 0,
    confirmar: 0,
    faltantes: 0,
    artefacto: "—",
    listo: null,
    bloqueo: "",
  }

  console.log(`\n${C.negrita}${caso}${C.reset}`)

  const solicitud = await invocar("proveedor_leer_solicitud", { caso }, ctx)
  if (!solicitud.ok) {
    console.log(`  ${C.rojo}x${C.reset} leer_solicitud — ${solicitud.error}`)
    fila.bloqueo = solicitud.error ?? "error"
    return fila
  }
  fila.pais = String(solicitud.data?.pais ?? "—")
  fila.formato = String(solicitud.data?.formato ?? "—")
  console.log(
    `  ${C.verde}·${C.reset} leer_solicitud      ${C.tenue}${solicitud.data?.cliente} · ${fila.pais} · ${fila.formato} · ${numero(solicitud.data?.campos)} campos${C.reset}`,
  )

  const mapeo = await invocar("proveedor_mapear_campos", { caso }, ctx)
  if (mapeo.ok) {
    fila.llenos = numero(mapeo.data?.llenos)
    fila.confirmar = numero(mapeo.data?.requiere_confirmacion)
    fila.faltantes = numero(mapeo.data?.faltantes)
    console.log(
      `  ${C.verde}·${C.reset} mapear_campos       ${C.verde}${fila.llenos} llenos${C.reset} · ${C.ambar}${fila.confirmar} por confirmar${C.reset} · ${fila.faltantes} faltantes`,
    )
    for (const c of (mapeo.data?.requiere_confirmacion ?? []) as { etiqueta: string }[]) {
      console.log(`      ${C.ambar}~${C.reset} ${c.etiqueta}`)
    }
    for (const c of (mapeo.data?.faltantes ?? []) as { etiqueta: string }[]) {
      console.log(`      ${C.tenue}—${C.reset} ${c.etiqueta}`)
    }
  } else {
    console.log(`  ${C.rojo}x${C.reset} mapear_campos — ${mapeo.error}`)
  }

  const formulario = await invocar("proveedor_generar_formulario", { caso }, ctx)
  if (formulario.ok) {
    fila.artefacto = String(formulario.data?.ruta ?? "—")
    console.log(`  ${C.verde}·${C.reset} generar_formulario  ${C.azul}${fila.artefacto}${C.reset}`)
  } else {
    // El portal declina a propósito: no es un fallo del sistema (HU-3 P2).
    fila.artefacto = `out/${caso}/valores-portal.md`
    console.log(
      `  ${C.ambar}~${C.reset} generar_formulario  ${C.ambar}${formulario.error}${C.reset}`,
    )
  }

  const paquete = await invocar("proveedor_armar_paquete", { caso }, ctx)
  if (paquete.ok) {
    fila.listo = paquete.data?.listo_para_firma === true
    const bloqueos = (
      (paquete.data?.checklist ?? []) as { tipo: string; estado: string; bloquea: boolean }[]
    )
      .filter((i) => i.bloquea)
      .map((i) => `${i.tipo} (${i.estado})`)
    fila.bloqueo = bloqueos.join(", ")
    const marca = fila.listo
      ? `${C.verde}listo para firma${C.reset}`
      : `${C.rojo}bloqueado${C.reset}`
    console.log(
      `  ${C.verde}·${C.reset} armar_paquete       ${marca}${fila.bloqueo ? ` ${C.tenue}· ${fila.bloqueo}${C.reset}` : ""}`,
    )
  } else {
    console.log(`  ${C.rojo}x${C.reset} armar_paquete — ${paquete.error}`)
  }

  // RN4 — sin confirmación explícita la herramienta se niega. Se comprueba aquí.
  const envioSinConfirmar = await invocar(
    "proveedor_simular_envio",
    { caso, confirmado: false },
    ctx,
  )
  const rechazoCorrecto =
    !envioSinConfirmar.ok && envioSinConfirmar.error === "requiere confirmación explícita"
  console.log(
    `  ${rechazoCorrecto ? C.verde : C.rojo}·${C.reset} simular_envio       ${C.tenue}sin confirmar → ${envioSinConfirmar.error}${C.reset}`,
  )

  return fila
}

function tabla(filas: Fila[]): void {
  const cab = ["caso", "país", "formato", "llenos", "conf.", "falt.", "listo", "bloqueo"]
  const cuerpo = filas.map((f) => [
    f.caso,
    f.pais,
    f.formato,
    String(f.llenos),
    String(f.confirmar),
    String(f.faltantes),
    f.listo === null ? "—" : f.listo ? "sí" : "no",
    f.bloqueo || "—",
  ])
  const anchos = cab.map((c, i) =>
    Math.max(c.length, ...cuerpo.map((fila) => (fila[i] ?? "").length)),
  )
  const linea = (celdas: string[]): string =>
    celdas.map((c, i) => c.padEnd(anchos[i] ?? 0)).join("  ")

  console.log(`\n${C.negrita}Resumen${C.reset}\n`)
  console.log(C.tenue + linea(cab) + C.reset)
  console.log(C.tenue + anchos.map((a) => "─".repeat(a)).join("  ") + C.reset)
  for (const fila of cuerpo) console.log(linea(fila))
}

async function principal(): Promise<void> {
  const fecha = fechaReferencia()
  const ctx: ContextoHerramienta = {
    directory: RAIZ,
    sessionId: "demo",
    fechaReferencia: fecha,
  }

  console.log(`${C.negrita}Agente de registro como proveedor — verificación sin modelo${C.reset}`)
  console.log(
    `${C.tenue}Fecha de referencia: ${fecha.toISOString().slice(0, 10)}  ·  Herramientas: ${HERRAMIENTAS.map((h) => h.nombre).join(", ")}${C.reset}`,
  )

  limpiarSalida(RAIZ)

  const casos = casosDisponibles(RAIZ)
  if (casos.length === 0) {
    console.error(`${C.rojo}No hay casos en fixtures/reto-01/casos/${C.reset}`)
    process.exit(1)
  }

  const filas: Fila[] = []
  for (const caso of casos) {
    // Un caso que falla no impide el siguiente (NFR Robustez).
    try {
      filas.push(await procesar(caso, ctx))
    } catch (causa) {
      const error = causa instanceof Error ? causa.message : "error inesperado"
      console.log(`  ${C.rojo}x${C.reset} ${error}`)
      filas.push({
        caso,
        pais: "—",
        formato: "—",
        llenos: 0,
        confirmar: 0,
        faltantes: 0,
        artefacto: "—",
        listo: null,
        bloqueo: error,
      })
    }
  }

  tabla(filas)
  console.log(`\n${C.tenue}Artefactos en out/ · bitácora en out/log.jsonl${C.reset}\n`)
}

await principal()
