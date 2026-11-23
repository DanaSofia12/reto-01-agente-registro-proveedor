#!/usr/bin/env bun
/**
 * Ejecuta los criterios verificables de la rúbrica e imprime un semáforo.
 *
 * Es el comando que se corre antes de entregar. Lo que no se puede comprobar
 * desde aquí (el tono del prompt, cómo se ve el front) queda fuera a propósito:
 * un verificador que dice "ok" sobre algo que no midió es peor que no tenerlo.
 */

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import type { ContextoHerramienta } from "../src/domain/tipos.ts"
import { limpiarSalida } from "../src/infra/salida.ts"
import { buscarHerramienta, HERRAMIENTAS } from "../src/tools/registro.ts"

const RAIZ = path.resolve(import.meta.dir, "..")
const C = {
  reset: "\x1b[0m",
  verde: "\x1b[32m",
  rojo: "\x1b[31m",
  tenue: "\x1b[2m",
  negrita: "\x1b[1m",
}

const ctx: ContextoHerramienta = {
  directory: RAIZ,
  sessionId: "verificacion",
  fechaReferencia: new Date("2026-09-03T00:00:00Z"),
}

interface Respuesta {
  ok: boolean
  data?: Record<string, unknown>
  error?: string
}

async function invocar(nombre: string, argumentos: unknown): Promise<Respuesta> {
  const h = buscarHerramienta(nombre)
  if (h === undefined) return { ok: false, error: `no existe ${nombre}` }
  return JSON.parse(await h.ejecutar(argumentos, ctx)) as Respuesta
}

function archivo(...partes: string[]): string {
  return path.join(RAIZ, ...partes)
}

function contenido(...partes: string[]): string {
  try {
    return readFileSync(archivo(...partes), "utf8")
  } catch {
    return ""
  }
}

/** Acceso seguro a una lista del `data` de una herramienta. */
function lista(data: Record<string, unknown> | undefined, clave: string): unknown[] {
  const valor = data?.[clave]
  return Array.isArray(valor) ? valor : []
}

interface Criterio {
  readonly id: string
  readonly descripcion: string
  comprobar(): Promise<boolean> | boolean
}

const CRITERIOS: readonly Criterio[] = [
  // ─── A · Contrato de herramientas ───────────────────────────────────────────
  {
    id: "A1",
    descripcion: "las 5 herramientas se publican como proveedor_<export>",
    comprobar: () =>
      HERRAMIENTAS.length === 5 && HERRAMIENTAS.every((h) => h.nombre.startsWith("proveedor_")),
  },
  {
    id: "A3",
    descripcion: "cada argumento del esquema lleva .describe()",
    comprobar: () =>
      HERRAMIENTAS.every((h) => {
        const props = (h.esquema.properties ?? {}) as Record<string, { description?: string }>
        const claves = Object.keys(props)
        return claves.length > 0 && claves.every((k) => Boolean(props[k]?.description))
      }),
  },
  {
    id: "A4",
    descripcion: "los argumentos inválidos se rechazan antes de ejecutar",
    comprobar: async () => {
      const r = await invocar("proveedor_simular_envio", { caso: "co-industrias-delta" })
      return !r.ok && (r.error ?? "").includes("argumentos inválidos")
    },
  },
  {
    id: "A5",
    descripcion: "toda salida es {ok:true,data} o {ok:false,error}",
    comprobar: async () => {
      const r = await invocar("proveedor_leer_solicitud", { caso: "ec-corp-andina" })
      return r.ok === true && typeof r.data === "object"
    },
  },
  {
    id: "A6",
    descripcion: "ninguna herramienta lanza ante basura",
    comprobar: async () => {
      const basura: unknown[] = [undefined, null, {}, { caso: 42 }, "texto", [1]]
      for (const h of HERRAMIENTAS) {
        for (const arg of basura) {
          try {
            const crudo = await h.ejecutar(arg, ctx)
            if (typeof JSON.parse(crudo).ok !== "boolean") return false
          } catch {
            return false
          }
        }
      }
      return true
    },
  },
  {
    id: "A9",
    descripcion: "las herramientas no ejecutan comandos de shell",
    comprobar: () => {
      const fuentes = ["src/tools/proveedor.ts", "src/tools/registro.ts", "src/infra/salida.ts"]
      return fuentes.every((f) => !/child_process|Bun\.\$|execSync|spawnSync/.test(contenido(f)))
    },
  },

  // ─── B · Correctitud por caso ───────────────────────────────────────────────
  {
    id: "B1",
    descripcion: "co-industrias-delta: 17 llenos · 0 confirmar · 0 faltantes",
    comprobar: async () => {
      const r = await invocar("proveedor_mapear_campos", { caso: "co-industrias-delta" })
      const d = r.data ?? {}
      return (
        lista(d, "llenos").length === 17 &&
        lista(d, "requiere_confirmacion").length === 0 &&
        lista(d, "faltantes").length === 0
      )
    },
  },
  {
    id: "B2",
    descripcion: "co-industrias-delta produce formulario.xlsx",
    comprobar: async () => {
      const r = await invocar("proveedor_generar_formulario", { caso: "co-industrias-delta" })
      return r.ok && existsSync(archivo("out/co-industrias-delta/formulario.xlsx"))
    },
  },
  {
    id: "B3",
    descripcion: "ec-corp-andina: 13 llenos · 1 confirmar · 1 faltante",
    comprobar: async () => {
      const r = await invocar("proveedor_mapear_campos", { caso: "ec-corp-andina" })
      const d = r.data ?? {}
      return (
        lista(d, "llenos").length === 13 &&
        lista(d, "requiere_confirmacion").length === 1 &&
        lista(d, "faltantes").length === 1
      )
    },
  },
  {
    id: "B4",
    descripcion: "ec-corp-andina produce formulario.pdf",
    comprobar: async () => {
      const r = await invocar("proveedor_generar_formulario", { caso: "ec-corp-andina" })
      return r.ok && existsSync(archivo("out/ec-corp-andina/formulario.pdf"))
    },
  },
  {
    id: "B5",
    descripcion: "hn-agroexport-sula: 9 llenos · 1 confirmar · 1 faltante",
    comprobar: async () => {
      const r = await invocar("proveedor_mapear_campos", { caso: "hn-agroexport-sula" })
      const d = r.data ?? {}
      return (
        lista(d, "llenos").length === 9 &&
        lista(d, "requiere_confirmacion").length === 1 &&
        lista(d, "faltantes").length === 1
      )
    },
  },
  {
    id: "B7",
    descripcion: "pa-logistica-istmo responde 'formato no soportado' y deja valores-portal.md",
    comprobar: async () => {
      const r = await invocar("proveedor_generar_formulario", { caso: "pa-logistica-istmo" })
      return (
        !r.ok &&
        (r.error ?? "").includes("formato no soportado") &&
        existsSync(archivo("out/pa-logistica-istmo/valores-portal.md"))
      )
    },
  },
  {
    id: "B8",
    descripcion: "ningún campo faltante trae un valor inventado",
    comprobar: async () => {
      for (const caso of ["ec-corp-andina", "hn-agroexport-sula"]) {
        const r = await invocar("proveedor_mapear_campos", { caso })
        const faltantes = (r.data?.faltantes ?? []) as { valor?: unknown }[]
        if (faltantes.some((f) => f.valor !== undefined && f.valor !== null)) return false
      }
      return true
    },
  },

  // ─── C · Reglas de negocio ──────────────────────────────────────────────────
  {
    id: "C1",
    descripcion: "RN1: RUC/RTN se marcan fuera de Colombia, el NIT colombiano no",
    comprobar: async () => {
      const ec = await invocar("proveedor_mapear_campos", { caso: "ec-corp-andina" })
      const marcadoEc = (ec.data?.requiere_confirmacion ?? []) as {
        etiqueta: string
        nota: string
      }[]
      const co = await invocar("proveedor_mapear_campos", { caso: "co-industrias-delta" })
      const marcadoCo = (co.data?.requiere_confirmacion ?? []) as unknown[]
      return (
        marcadoEc.some(
          (c) => c.etiqueta === "RUC" && c.nota.includes("identificador extranjero"),
        ) && marcadoCo.length === 0
      )
    },
  },
  {
    id: "C2",
    descripcion: "RN2: ningún borrador de correo contiene datos bancarios",
    comprobar: async () => {
      const secretos = ["03100012345", "COLOCOBM", "numero_cuenta"]
      for (const caso of [
        "co-industrias-delta",
        "ec-corp-andina",
        "hn-agroexport-sula",
        "pa-logistica-istmo",
      ]) {
        await invocar("proveedor_armar_paquete", { caso })
        const texto = contenido(`out/${caso}/paquete/borrador-correo.md`)
        if (texto === "") return false
        if (secretos.some((s) => texto.includes(s))) return false
      }
      return true
    },
  },
  {
    id: "C3",
    descripcion: "RN3: un soporte vencido bloquea (hn / parafiscales)",
    comprobar: async () => {
      const r = await invocar("proveedor_armar_paquete", { caso: "hn-agroexport-sula" })
      const items = (r.data?.checklist ?? []) as {
        tipo: string
        estado: string
        bloquea: boolean
      }[]
      return (
        r.data?.listo_para_firma === false &&
        items.some((i) => i.tipo === "parafiscales" && i.estado === "vencido" && i.bloquea)
      )
    },
  },
  {
    id: "C4",
    descripcion: "RN3: un soporte ausente bloquea (ec / cumplimiento tributario)",
    comprobar: async () => {
      const r = await invocar("proveedor_armar_paquete", { caso: "ec-corp-andina" })
      const items = (r.data?.checklist ?? []) as {
        tipo: string
        estado: string
        bloquea: boolean
      }[]
      return (
        r.data?.listo_para_firma === false &&
        items.some(
          (i) => i.tipo === "certificado_cumplimiento_tributario" && i.estado === "ausente",
        )
      )
    },
  },
  {
    id: "C5",
    descripcion: "RN3: un campo faltante NO bloquea pero aparece en el checklist",
    comprobar: async () => {
      const r = await invocar("proveedor_armar_paquete", { caso: "hn-agroexport-sula" })
      const faltantes = (r.data?.campos_faltantes ?? []) as string[]
      const items = (r.data?.checklist ?? []) as { bloquea: boolean }[]
      return (
        faltantes.includes("Referencias comerciales") && items.filter((i) => i.bloquea).length === 1
      )
    },
  },
  {
    id: "C6",
    descripcion: "un soporte sin vigencia (RUT) nunca vence",
    comprobar: async () => {
      const r = await invocar("proveedor_armar_paquete", { caso: "co-industrias-delta" })
      const items = (r.data?.checklist ?? []) as { tipo: string; estado: string }[]
      return items.some((i) => i.tipo === "rut" && i.estado === "presente")
    },
  },

  // ─── D · Confirmación humana ────────────────────────────────────────────────
  {
    id: "D4",
    descripcion: "simular_envio sin confirmar rechaza y no escribe nada",
    comprobar: async () => {
      const r = await invocar("proveedor_simular_envio", {
        caso: "co-industrias-delta",
        confirmado: false,
      })
      return (
        !r.ok &&
        r.error === "requiere confirmación explícita" &&
        !existsSync(archivo("out/co-industrias-delta/ENVIO-SIMULADO.md"))
      )
    },
  },
  {
    id: "D5",
    descripcion: "con confirmación escribe solo ENVIO-SIMULADO.md",
    comprobar: async () => {
      const r = await invocar("proveedor_simular_envio", {
        caso: "co-industrias-delta",
        confirmado: true,
      })
      return r.ok && existsSync(archivo("out/co-industrias-delta/ENVIO-SIMULADO.md"))
    },
  },

  // ─── F · Arquitectura y NFR ─────────────────────────────────────────────────
  {
    id: "F1",
    descripcion: "el system prompt vive en agent/prompt.md, no embebido en código",
    comprobar: () => contenido("agent/prompt.md").length > 500,
  },
  {
    id: "F2",
    descripcion: "el conocimiento vive en src/knowledge/, separado del comportamiento",
    comprobar: () => contenido("src/knowledge/registro-proveedor.md").length > 500,
  },
  {
    id: "F3",
    descripcion: "hay dos implementaciones del adaptador LLM",
    comprobar: () =>
      existsSync(archivo("src/llm/anthropic.ts")) && existsSync(archivo("src/llm/openai.ts")),
  },
  {
    id: "F5",
    descripcion: "/api/health no expone la clave",
    comprobar: () => {
      const servidor = contenido("src/server.ts")
      return (
        !/API_KEY/.test(servidor.split("getSalud")[1]?.slice(0, 600) ?? "") &&
        /claveConfigurada/.test(servidor)
      )
    },
  },
  {
    id: "F8",
    descripcion: "no hay 'any' explícito en el código fuente",
    comprobar: async () => {
      const glob = new Bun.Glob("{src,web/src,scripts,tests}/**/*.{ts,tsx}")
      for (const relativo of glob.scanSync({ cwd: RAIZ })) {
        if (/:\s*any\b|<any>|as any/.test(readFileSync(archivo(relativo), "utf8"))) return false
      }
      return true
    },
  },

  // ─── G · Trazabilidad ───────────────────────────────────────────────────────
  {
    id: "G1",
    descripcion: "bitácora en out/log.jsonl y out/<caso>/log.jsonl con el formato de RN5",
    comprobar: async () => {
      await invocar("proveedor_leer_solicitud", { caso: "ec-corp-andina" })
      const global = contenido("out/log.jsonl").trim().split("\n").at(-1) ?? ""
      const porCaso = contenido("out/ec-corp-andina/log.jsonl").trim().split("\n").at(-1) ?? ""
      if (global === "" || porCaso === "") return false
      const e = JSON.parse(porCaso) as Record<string, unknown>
      return ["ts", "herramienta", "ok", "resumen"].every((k) => k in e)
    },
  },
  {
    id: "G3",
    descripcion: "cada campo lleno trae su ruta de origen en el maestro",
    comprobar: async () => {
      const r = await invocar("proveedor_mapear_campos", { caso: "co-industrias-delta" })
      const llenos = (r.data?.llenos ?? []) as { origen?: string }[]
      return (
        llenos.length > 0 && llenos.every((c) => typeof c.origen === "string" && c.origen !== "")
      )
    },
  },

  // ─── H · Paquete para firma ─────────────────────────────────────────────────
  {
    id: "H1-H4",
    descripcion: "el paquete trae formulario, soportes, checklist y borrador",
    comprobar: async () => {
      await invocar("proveedor_generar_formulario", { caso: "co-industrias-delta" })
      await invocar("proveedor_armar_paquete", { caso: "co-industrias-delta" })
      const base = "out/co-industrias-delta/paquete"
      return (
        existsSync(archivo(base, "formulario.xlsx")) &&
        existsSync(archivo(base, "checklist.md")) &&
        existsSync(archivo(base, "borrador-correo.md")) &&
        existsSync(archivo(base, "rut-2026.txt"))
      )
    },
  },
  {
    id: "H5",
    descripcion: "se produce el reporte de campos faltantes",
    comprobar: async () => {
      await invocar("proveedor_mapear_campos", { caso: "hn-agroexport-sula" })
      return contenido("out/hn-agroexport-sula/faltantes.md").includes("Referencias comerciales")
    },
  },

  // ─── J · Entrega ────────────────────────────────────────────────────────────
  {
    id: "J2",
    descripcion: "las herramientas se importan sin servidor y sin clave",
    comprobar: () => HERRAMIENTAS.length === 5,
  },
  {
    id: "J5",
    descripcion: ".env.example lista las variables sin valores",
    comprobar: () => {
      const texto = contenido(".env.example")
      return (
        texto.includes("ANTHROPIC_API_KEY=") &&
        !/ANTHROPIC_API_KEY=\S/.test(texto) &&
        texto.includes("MAX_ITERACIONES_TURNO")
      )
    },
  },
  {
    id: "J-sec",
    descripcion: "no hay patrones de clave de API en el repositorio",
    comprobar: () => {
      const glob = new Bun.Glob("{src,web/src,scripts,tests,agent,modulo}/**/*.{ts,tsx,md}")
      for (const relativo of glob.scanSync({ cwd: RAIZ })) {
        if (/sk-ant-[a-zA-Z0-9]|sk-proj-[a-zA-Z0-9]|AIzaSy[a-zA-Z0-9]/.test(contenido(relativo))) {
          return false
        }
      }
      return !existsSync(archivo(".env"))
    },
  },

  // ─── K · Módulo reutilizable ────────────────────────────────────────────────
  {
    id: "K1-K3",
    descripcion: "modulo/ tiene las tres piezas con su frontmatter",
    comprobar: () => {
      const agente = contenido("modulo/agent.md")
      const skill = contenido("modulo/skill/registro-proveedor/SKILL.md")
      const tools = contenido("modulo/tools/proveedor.ts")
      return (
        agente.includes("mode: primary") &&
        agente.includes("edit: deny") &&
        skill.includes("name: registro-proveedor") &&
        tools.includes("export *")
      )
    },
  },
  {
    id: "K4",
    descripcion: "modulo/ no divergió de las fuentes reales",
    comprobar: () => {
      const prompt = contenido("agent/prompt.md").trim()
      const conocimiento = contenido("src/knowledge/registro-proveedor.md").trim()
      return (
        contenido("modulo/agent.md").includes(prompt) &&
        contenido("modulo/skill/registro-proveedor/SKILL.md").includes(conocimiento)
      )
    },
  },
]

async function principal(): Promise<void> {
  console.info(`${C.negrita}Verificación de rúbrica${C.reset}`)
  console.info(
    `${C.tenue}Fecha de referencia: 2026-09-03 · ${CRITERIOS.length} criterios${C.reset}\n`,
  )

  limpiarSalida(RAIZ)

  let fallos = 0
  for (const criterio of CRITERIOS) {
    let paso = false
    try {
      paso = await criterio.comprobar()
    } catch (causa) {
      paso = false
      console.info(`${C.tenue}   ${causa instanceof Error ? causa.message : "error"}${C.reset}`)
    }
    if (!paso) fallos += 1
    const marca = paso ? `${C.verde}ok  ${C.reset}` : `${C.rojo}FALLA${C.reset}`
    console.info(`  ${marca} ${criterio.id.padEnd(7)} ${criterio.descripcion}`)
  }

  const pasados = CRITERIOS.length - fallos
  console.info(
    `\n${fallos === 0 ? C.verde : C.rojo}${pasados}/${CRITERIOS.length} criterios verificados${C.reset}`,
  )
  if (fallos > 0) process.exit(1)
}

await principal()
