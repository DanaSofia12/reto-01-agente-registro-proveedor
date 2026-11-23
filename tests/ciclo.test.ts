import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import path from "node:path"
import { crearCiclo } from "../src/agent/ciclo.ts"
import { crearSesion, esConfirmacion } from "../src/agent/sesion.ts"
import { limpiarSalida } from "../src/infra/salida.ts"
import { crearProveedorMock, type GuionTurno } from "../src/llm/mock.ts"

/**
 * El ciclo se prueba con un proveedor falso y determinista: el tope de
 * iteraciones, el gate de confirmación y el manejo de errores se verifican sin
 * clave, sin red y sin gastar un token.
 */

const RAIZ = path.resolve(new URL("..", import.meta.url).pathname)

function ciclo(guion: GuionTurno[]) {
  return crearCiclo({ raiz: RAIZ, proveedor: crearProveedorMock(guion) })
}

beforeEach(() => limpiarSalida(RAIZ))
afterAll(() => limpiarSalida(RAIZ))

describe("esConfirmacion", () => {
  test("acepta confirmaciones inequívocas", () => {
    for (const texto of ["sí", "Confirmo", "envía", "dale, procede", "Ok, hazlo", "autorizo"]) {
      expect(esConfirmacion(texto), texto).toBe(true)
    }
  })

  test("rechaza negaciones aunque contengan el verbo", () => {
    for (const texto of ["no envíes", "todavía no", "mejor no", "espera", "cancela el envío"]) {
      expect(esConfirmacion(texto), texto).toBe(false)
    }
  })

  test("la ambigüedad no es confirmación", () => {
    for (const texto of ["¿qué falta?", "cuéntame más", "", "mmm"]) {
      expect(esConfirmacion(texto), texto).toBe(false)
    }
  })
})

describe("CA1 — tope de iteraciones", () => {
  test("al alcanzarlo responde con lo que tiene, no con silencio ni error", async () => {
    // Un guion que pide herramientas para siempre: el tope debe cortarlo.
    const infinito: GuionTurno[] = Array.from({ length: 40 }, () => ({
      texto: "",
      llamadas: [{ nombre: "proveedor_leer_solicitud", argumentos: { caso: "ec-corp-andina" } }],
    }))

    const ejecutar = ciclo(infinito)
    const sesion = crearSesion("tope")
    const resultado = await ejecutar(sesion, "procesa ec-corp-andina")

    expect(resultado.iteraciones).toBe(25)
    expect(resultado.reply).toContain("tope")
    expect(resultado.reply).toContain("25")
    expect(resultado.toolCalls.length).toBe(25)
  })
})

describe("CA3 / RN4 — la confirmación la impone el servidor", () => {
  test("el modelo no puede autoconfirmar: el gate fuerza confirmado=false", async () => {
    // El modelo pide el envío con confirmado:true sin que nadie lo haya pedido.
    const ejecutar = ciclo([
      {
        texto: "",
        llamadas: [
          {
            nombre: "proveedor_simular_envio",
            argumentos: { caso: "co-industrias-delta", confirmado: true },
          },
        ],
      },
      { texto: "No pude enviar sin confirmación.", llamadas: [] },
    ])

    const sesion = crearSesion("autoconfirma")
    const resultado = await ejecutar(sesion, "procesa el caso")

    const llamada = resultado.toolCalls[0]
    expect(llamada?.ok).toBe(false)
    expect(llamada?.resumen).toBe("requiere confirmación explícita")
    const argumentos = llamada?.argumentos as { confirmado?: boolean } | undefined
    expect(argumentos?.confirmado).toBe(false)
    expect(existsSync(path.join(RAIZ, "out/co-industrias-delta/ENVIO-SIMULADO.md"))).toBe(false)
  })

  test("armar_paquete deja el turno esperando confirmación", async () => {
    const ejecutar = ciclo([
      {
        texto: "",
        llamadas: [
          { nombre: "proveedor_armar_paquete", argumentos: { caso: "co-industrias-delta" } },
        ],
      },
      { texto: "El paquete está listo. ¿Preparo el envío simulado?", llamadas: [] },
    ])

    const sesion = crearSesion("pide")
    const resultado = await ejecutar(sesion, "arma el paquete de co-industrias-delta")

    expect(resultado.needsConfirmation).toBe(true)
    expect(sesion.pendiente).toEqual({ accion: "simular_envio", caso: "co-industrias-delta" })
  })

  test("con el turno anterior esperando y un sí explícito, el envío procede", async () => {
    const sesion = crearSesion("flujo-completo")

    const turno1 = ciclo([
      {
        texto: "",
        llamadas: [
          { nombre: "proveedor_armar_paquete", argumentos: { caso: "co-industrias-delta" } },
        ],
      },
      { texto: "Listo para firma. ¿Preparo el envío simulado?", llamadas: [] },
    ])
    await turno1(sesion, "procesa co-industrias-delta")
    expect(sesion.pendiente).not.toBeNull()

    const turno2 = ciclo([
      {
        texto: "",
        llamadas: [
          {
            nombre: "proveedor_simular_envio",
            argumentos: { caso: "co-industrias-delta", confirmado: true },
          },
        ],
      },
      { texto: "Envío simulado preparado.", llamadas: [] },
    ])
    const resultado = await turno2(sesion, "Sí, confirmo. Envía.")

    expect(resultado.toolCalls[0]?.ok).toBe(true)
    expect(existsSync(path.join(RAIZ, "out/co-industrias-delta/ENVIO-SIMULADO.md"))).toBe(true)
  })

  test("un 'no todavía' tras la pregunta NO autoriza el envío", async () => {
    const sesion = crearSesion("negativa")

    const turno1 = ciclo([
      {
        texto: "",
        llamadas: [
          { nombre: "proveedor_armar_paquete", argumentos: { caso: "co-industrias-delta" } },
        ],
      },
      { texto: "¿Preparo el envío?", llamadas: [] },
    ])
    await turno1(sesion, "procesa co-industrias-delta")

    const turno2 = ciclo([
      {
        texto: "",
        llamadas: [
          {
            nombre: "proveedor_simular_envio",
            argumentos: { caso: "co-industrias-delta", confirmado: true },
          },
        ],
      },
      { texto: "Entendido, no envío.", llamadas: [] },
    ])
    const resultado = await turno2(sesion, "No todavía, falta revisar algo")

    expect(resultado.toolCalls[0]?.ok).toBe(false)
    expect(existsSync(path.join(RAIZ, "out/co-industrias-delta/ENVIO-SIMULADO.md"))).toBe(false)
  })
})

describe("CA4 — las llamadas quedan en el historial visible", () => {
  test("cada llamada se registra con nombre, argumentos y resultado", async () => {
    const ejecutar = ciclo([
      {
        texto: "",
        llamadas: [
          { nombre: "proveedor_leer_solicitud", argumentos: { caso: "ec-corp-andina" } },
          { nombre: "proveedor_mapear_campos", argumentos: { caso: "ec-corp-andina" } },
        ],
      },
      { texto: "Resumen del caso.", llamadas: [] },
    ])

    const sesion = crearSesion("historial")
    const resultado = await ejecutar(sesion, "procesa ec-corp-andina")

    expect(resultado.toolCalls).toHaveLength(2)
    for (const llamada of resultado.toolCalls) {
      expect(llamada.nombre).toStartWith("proveedor_")
      expect(llamada.argumentos).toBeDefined()
      expect(typeof llamada.ok).toBe("boolean")
    }
    expect(sesion.historial.at(-1)?.llamadas).toHaveLength(2)
    expect(existsSync(path.join(RAIZ, "out/log.jsonl"))).toBe(true)
  })
})

describe("CA5 — un error de herramienta no mata la sesión", () => {
  test("el caso inexistente vuelve al modelo y el turno termina bien", async () => {
    const ejecutar = ciclo([
      {
        texto: "",
        llamadas: [{ nombre: "proveedor_leer_solicitud", argumentos: { caso: "no-existe" } }],
      },
      { texto: "Ese caso no está en la carpeta de solicitudes.", llamadas: [] },
    ])

    const sesion = crearSesion("error")
    const resultado = await ejecutar(sesion, "procesa no-existe")

    expect(resultado.toolCalls[0]?.ok).toBe(false)
    expect(resultado.reply).toContain("no está")
    expect(sesion.historial.length).toBeGreaterThan(0)
  })

  test("una herramienta inexistente se reporta sin romper el ciclo", async () => {
    const ejecutar = ciclo([
      { texto: "", llamadas: [{ nombre: "proveedor_inventada", argumentos: {} }] },
      { texto: "Esa herramienta no existe.", llamadas: [] },
    ])

    const sesion = crearSesion("desconocida")
    const resultado = await ejecutar(sesion, "usa algo raro")

    expect(resultado.toolCalls[0]?.ok).toBe(false)
    expect(resultado.toolCalls[0]?.resumen).toContain("desconocida")
  })
})
