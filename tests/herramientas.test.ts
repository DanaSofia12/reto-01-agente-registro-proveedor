import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { ContextoHerramienta } from "../src/domain/tipos.ts"
import { limpiarSalida } from "../src/infra/salida.ts"
import { buscarHerramienta, HERRAMIENTAS } from "../src/tools/registro.ts"

const RAIZ = path.resolve(new URL("..", import.meta.url).pathname)

const ctx: ContextoHerramienta = {
  directory: RAIZ,
  sessionId: "test",
  fechaReferencia: new Date("2026-09-03T00:00:00Z"),
}

interface Respuesta {
  ok: boolean
  data?: Record<string, unknown>
  error?: string
}

async function invocar(nombre: string, argumentos: unknown): Promise<Respuesta> {
  const herramienta = buscarHerramienta(nombre)
  if (herramienta === undefined) throw new Error(`no existe ${nombre}`)
  return JSON.parse(await herramienta.ejecutar(argumentos, ctx)) as Respuesta
}

/** Acceso seguro a una lista del `data` de una herramienta. */
function lista(data: Record<string, unknown> | undefined, clave: string): unknown[] {
  const valor = data?.[clave]
  return Array.isArray(valor) ? valor : []
}

beforeAll(() => limpiarSalida(RAIZ))
afterAll(() => limpiarSalida(RAIZ))

describe("contrato de herramientas (§6.2)", () => {
  test("las cinco se publican con el nombre proveedor_<export>", () => {
    expect(HERRAMIENTAS.map((h) => h.nombre).sort()).toEqual([
      "proveedor_armar_paquete",
      "proveedor_generar_formulario",
      "proveedor_leer_solicitud",
      "proveedor_mapear_campos",
      "proveedor_simular_envio",
    ])
  })

  test("cada una tiene una descripción de una frase", () => {
    for (const h of HERRAMIENTAS) {
      expect(h.descripcion.length).toBeGreaterThan(40)
      expect(h.descripcion.length).toBeLessThan(260)
    }
  })

  test("cada argumento del esquema lleva descripción", () => {
    for (const h of HERRAMIENTAS) {
      const propiedades = (h.esquema.properties ?? {}) as Record<string, { description?: string }>
      expect(Object.keys(propiedades).length).toBeGreaterThan(0)
      for (const [nombre, prop] of Object.entries(propiedades)) {
        expect(prop.description, `${h.nombre}.${nombre} sin .describe()`).toBeTruthy()
      }
    }
  })

  test("el esquema es JSON Schema draft-7 derivado de los mismos zod", () => {
    for (const h of HERRAMIENTAS) {
      expect(h.esquema.type).toBe("object")
      expect(h.esquema.$schema).toContain("draft-07")
    }
  })
})

describe("ninguna herramienta lanza (HU-5)", () => {
  const basura: unknown[] = [
    undefined,
    null,
    {},
    { caso: "" },
    { caso: 42 },
    { caso: "NO-EXISTE" },
    { caso: "../../../etc" },
    { caso: "a".repeat(500) },
    { caso: "co-industrias-delta", confirmado: "quizá" },
    [1, 2, 3],
    "texto suelto",
  ]

  for (const h of HERRAMIENTAS) {
    test(`${h.nombre} devuelve siempre {ok,...}`, async () => {
      for (const argumentos of basura) {
        const crudo = await h.ejecutar(argumentos, ctx)
        const parseado = JSON.parse(crudo) as Respuesta
        expect(typeof parseado.ok).toBe("boolean")
        if (!parseado.ok) {
          expect(typeof parseado.error).toBe("string")
          // Sin traza cruda hacia el agente.
          expect(parseado.error).not.toContain("    at ")
        }
      }
    })
  }
})

describe("seguridad de rutas", () => {
  const maliciosos = [
    "../../../etc/passwd",
    "..%2f..%2fetc",
    "co-industrias-delta/../../../etc",
    "/etc/passwd",
    "CO-INDUSTRIAS-DELTA",
  ]

  for (const caso of maliciosos) {
    test(`rechaza "${caso}"`, async () => {
      const respuesta = await invocar("proveedor_leer_solicitud", { caso })
      expect(respuesta.ok).toBe(false)
      expect(respuesta.error).toMatch(/inválido|no encontrado/i)
    })
  }
})

describe("matriz de resultados esperados", () => {
  test("co-industrias-delta: 17 llenos, 0 por confirmar, 0 faltantes, listo", async () => {
    const mapeo = await invocar("proveedor_mapear_campos", { caso: "co-industrias-delta" })
    expect(lista(mapeo.data, "llenos").length).toBe(17)
    expect(lista(mapeo.data, "requiere_confirmacion").length).toBe(0)
    expect(lista(mapeo.data, "faltantes").length).toBe(0)

    const paquete = await invocar("proveedor_armar_paquete", { caso: "co-industrias-delta" })
    expect(paquete.data?.listo_para_firma).toBe(true)
  })

  test("ec-corp-andina: bloqueado por soporte ausente", async () => {
    const mapeo = await invocar("proveedor_mapear_campos", { caso: "ec-corp-andina" })
    expect(lista(mapeo.data, "llenos").length).toBe(13)
    expect(lista(mapeo.data, "requiere_confirmacion").length).toBe(1)
    expect(lista(mapeo.data, "faltantes").length).toBe(1)

    const paquete = await invocar("proveedor_armar_paquete", { caso: "ec-corp-andina" })
    expect(paquete.data?.listo_para_firma).toBe(false)
    const bloqueos = (
      lista(paquete.data, "checklist") as { tipo: string; bloquea: boolean }[]
    ).filter((i) => i.bloquea)
    expect(bloqueos.map((b) => b.tipo)).toEqual(["certificado_cumplimiento_tributario"])
  })

  test("hn-agroexport-sula: bloqueado por soporte vencido", async () => {
    const mapeo = await invocar("proveedor_mapear_campos", { caso: "hn-agroexport-sula" })
    expect(lista(mapeo.data, "llenos").length).toBe(9)
    expect(lista(mapeo.data, "requiere_confirmacion").length).toBe(1)
    expect(lista(mapeo.data, "faltantes").length).toBe(1)

    const paquete = await invocar("proveedor_armar_paquete", { caso: "hn-agroexport-sula" })
    expect(paquete.data?.listo_para_firma).toBe(false)
    const bloqueos = (
      lista(paquete.data, "checklist") as { tipo: string; estado: string; bloquea: boolean }[]
    ).filter((i) => i.bloquea)
    expect(bloqueos[0]?.tipo).toBe("parafiscales")
    expect(bloqueos[0]?.estado).toBe("vencido")
  })

  test("pa-logistica-istmo: formato no soportado pero deja los valores copiables", async () => {
    const formulario = await invocar("proveedor_generar_formulario", { caso: "pa-logistica-istmo" })
    expect(formulario.ok).toBe(false)
    expect(formulario.error).toContain("formato no soportado")
    expect(existsSync(path.join(RAIZ, "out/pa-logistica-istmo/valores-portal.md"))).toBe(true)
  })
})

describe("generación de formularios", () => {
  test("xlsx se escribe en el disco", async () => {
    const r = await invocar("proveedor_generar_formulario", { caso: "co-industrias-delta" })
    expect(r.ok).toBe(true)
    expect(r.data?.formato).toBe("xlsx")
    expect(existsSync(path.join(RAIZ, "out/co-industrias-delta/formulario.xlsx"))).toBe(true)
  })

  test("pdf se escribe en el disco", async () => {
    const r = await invocar("proveedor_generar_formulario", { caso: "ec-corp-andina" })
    expect(r.ok).toBe(true)
    expect(r.data?.formato).toBe("pdf")
    expect(existsSync(path.join(RAIZ, "out/ec-corp-andina/formulario.pdf"))).toBe(true)
  })
})

describe("RN2 — los datos bancarios nunca salen en el correo", () => {
  const SECRETOS = ["03100012345", "COLOCOBM", "numero_cuenta"]

  test("ningún borrador de correo los contiene", async () => {
    for (const caso of [
      "co-industrias-delta",
      "ec-corp-andina",
      "hn-agroexport-sula",
      "pa-logistica-istmo",
    ]) {
      await invocar("proveedor_armar_paquete", { caso })
      const ruta = path.join(RAIZ, `out/${caso}/paquete/borrador-correo.md`)
      expect(existsSync(ruta)).toBe(true)
      const contenido = readFileSync(ruta, "utf8")
      for (const secreto of SECRETOS) {
        expect(contenido, `${caso} filtró ${secreto}`).not.toContain(secreto)
      }
    }
  })
})

describe("RN4 — confirmación explícita", () => {
  test("sin confirmar devuelve el error del contrato y no escribe nada", async () => {
    const caso = "co-industrias-delta"
    const respuesta = await invocar("proveedor_simular_envio", { caso, confirmado: false })
    expect(respuesta.ok).toBe(false)
    expect(respuesta.error).toBe("requiere confirmación explícita")
    expect(existsSync(path.join(RAIZ, `out/${caso}/ENVIO-SIMULADO.md`))).toBe(false)
  })

  test("confirmado escribe únicamente ENVIO-SIMULADO.md", async () => {
    const caso = "co-industrias-delta"
    const respuesta = await invocar("proveedor_simular_envio", { caso, confirmado: true })
    expect(respuesta.ok).toBe(true)
    const ruta = path.join(RAIZ, `out/${caso}/ENVIO-SIMULADO.md`)
    expect(existsSync(ruta)).toBe(true)
    expect(readFileSync(ruta, "utf8")).toContain("No se envió ningún correo")
  })
})

describe("RN5 / CA4 — bitácora", () => {
  test("se escriben las dos rutas que menciona el PRD", async () => {
    await invocar("proveedor_leer_solicitud", { caso: "ec-corp-andina" })

    const global = path.join(RAIZ, "out/log.jsonl")
    const porCaso = path.join(RAIZ, "out/ec-corp-andina/log.jsonl")
    expect(existsSync(global)).toBe(true)
    expect(existsSync(porCaso)).toBe(true)

    const lineas = readFileSync(porCaso, "utf8").trim().split("\n")
    const ultima = JSON.parse(lineas[lineas.length - 1] ?? "{}") as Record<string, unknown>
    expect(ultima).toHaveProperty("ts")
    expect(ultima).toHaveProperty("herramienta")
    expect(ultima).toHaveProperty("ok")
    expect(ultima).toHaveProperty("resumen")
  })
})

describe("HU-5 — el proceso continúa con lo que sí puede hacer", () => {
  const CASO = "ec-corp-andina"
  const PLANTILLA = path.join(RAIZ, `fixtures/reto-01/casos/${CASO}/plantilla-campos.json`)
  let original = ""

  beforeAll(() => {
    original = readFileSync(PLANTILLA, "utf8")
  })

  afterAll(() => {
    if (original !== "") writeFileSync(PLANTILLA, original, "utf8")
  })

  test("con la plantilla corrupta, armar_paquete sigue produciendo el checklist", async () => {
    writeFileSync(PLANTILLA, "{ esto no es json", "utf8")

    const mapeo = await invocar("proveedor_mapear_campos", { caso: CASO })
    expect(mapeo.ok).toBe(false)
    expect(mapeo.error).toContain("no es JSON válido")
    // Mensaje útil, sin traza cruda.
    expect(mapeo.error).not.toContain("    at ")

    // La plantilla no hace falta para el checklist de soportes.
    const paquete = await invocar("proveedor_armar_paquete", { caso: CASO })
    expect(paquete.ok).toBe(true)
    expect(paquete.data?.listo_para_firma).toBe(false)
    expect(lista(paquete.data, "checklist").length).toBe(5)
    expect(paquete.data?.advertencia).toContain("no es JSON válido")
    expect(existsSync(path.join(RAIZ, `out/${CASO}/paquete/checklist.md`))).toBe(true)

    writeFileSync(PLANTILLA, original, "utf8")
  })
})
