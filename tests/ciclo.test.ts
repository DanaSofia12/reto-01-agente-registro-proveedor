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
  test("acepta solo lo que confirma la acción, no un asentimiento suelto", () => {
    for (const texto of ["Confirmo", "dale, procede", "Ok, hazlo", "autorizo", "envíalo"]) {
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
    expect([...sesion.paquetesArmados]).toEqual(["co-industrias-delta"])
    expect(sesion.esperandoRespuesta).toBe(true)
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
    expect(sesion.paquetesArmados.has("co-industrias-delta")).toBe(true)

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

describe("regresión — el gate no se abre con un asentimiento genérico", () => {
  /**
   * Antes de corregirlo, `esConfirmacion` buscaba palabras sueltas y "ok,
   * gracias" autorizaba un envío. En producción "ese archivo" es un correo.
   */
  const noConfirman = [
    "ok, gracias",
    "ya quedó listo el checklist?",
    "listo, dame el checklist",
    "sí, pero antes revisa el checklist",
    "dale, muéstrame los faltantes",
    "sí",
    "ok",
    "dale",
    "¿confirmo?",
    "perfecto, gracias",
  ]
  for (const texto of noConfirman) {
    test(`"${texto}" no autoriza`, () => {
      expect(esConfirmacion(texto)).toBe(false)
    })
  }

  /** `para` estaba en la lista de negaciones: bloqueaba una confirmación real. */
  const siConfirman = [
    "Sí, confirmo. Prepara el envío simulado.",
    "confirmo el envío para el cliente",
    "adelante",
    "autorizo el envío",
    "hazlo",
    "procede",
    "envíalo",
  ]
  for (const texto of siConfirman) {
    test(`"${texto}" autoriza`, () => {
      expect(esConfirmacion(texto)).toBe(true)
    })
  }

  test("el botón del front confirma sin depender del texto", async () => {
    const sesion = crearSesion("boton")

    const turno1 = ciclo([
      {
        texto: "",
        llamadas: [
          { nombre: "proveedor_armar_paquete", argumentos: { caso: "co-industrias-delta" } },
        ],
      },
      { texto: "Listo. ¿Preparo el envío simulado?", llamadas: [] },
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
      { texto: "Preparado.", llamadas: [] },
    ])
    // Texto que por sí solo NO confirmaría, pero el botón marca confirmacion=true.
    const resultado = await turno2(sesion, "ok", true)

    expect(resultado.toolCalls[0]?.ok).toBe(true)
    expect(existsSync(path.join(RAIZ, "out/co-industrias-delta/ENVIO-SIMULADO.md"))).toBe(true)
  })
})

describe("CA3 — no se resalta confirmación si el agente no preguntó", () => {
  test("con 'no envíes nada todavía' el turno no queda pendiente", async () => {
    const ejecutar = ciclo([
      {
        texto: "",
        llamadas: [
          { nombre: "proveedor_armar_paquete", argumentos: { caso: "co-industrias-delta" } },
        ],
      },
      { texto: "El paquete quedó listo para firma. No envié nada.", llamadas: [] },
    ])

    const sesion = crearSesion("sin-pregunta")
    const resultado = await ejecutar(sesion, "procesa co-industrias-delta, no envíes nada todavía")

    // El paquete quedó armado —eso es un hecho—, pero el agente no preguntó,
    // así que la interfaz no debe insistir con un botón que nadie pidió.
    expect(resultado.needsConfirmation).toBe(false)
    expect(sesion.esperandoRespuesta).toBe(false)
    expect(sesion.paquetesArmados.has("co-industrias-delta")).toBe(true)
  })
})

describe("CA4 — las llamadas rechazadas por validación también se registran", () => {
  test("un argumento inválido deja línea en out/log.jsonl", async () => {
    const ejecutar = ciclo([
      {
        texto: "",
        llamadas: [{ nombre: "proveedor_leer_solicitud", argumentos: { caso: 42 } }],
      },
      { texto: "El argumento del caso no era un texto.", llamadas: [] },
    ])

    const sesion = crearSesion("validacion")
    const resultado = await ejecutar(sesion, "lee el caso 42")

    expect(resultado.toolCalls[0]?.ok).toBe(false)
    expect(resultado.toolCalls[0]?.resumen).toContain("argumentos inválidos")
    expect(existsSync(path.join(RAIZ, "out/log.jsonl"))).toBe(true)
  })
})

describe("la pregunta sobrevive a un turno sin herramientas", () => {
  /**
   * El defecto que esto cubre: con dos solicitudes abiertas, la analista dice
   * «envíalo», el agente dedica un turno entero a preguntar cuál —sin llamar a
   * ninguna herramienta— y la confirmación se evaporaba. Ella veía la pregunta
   * sin el botón para responderla, y el envío necesitaba tres idas y vueltas.
   */
  test("tras preguntar sin ejecutar nada, el botón sigue disponible y autoriza", async () => {
    const sesion = crearSesion("pregunta-sola")

    const armar = ciclo([
      {
        texto: "",
        llamadas: [
          { nombre: "proveedor_armar_paquete", argumentos: { caso: "co-industrias-delta" } },
        ],
      },
      { texto: "El paquete quedó listo. No envié nada.", llamadas: [] },
    ])
    await armar(sesion, "prepara co-industrias-delta")

    // Turno intermedio: solo pregunta. Ninguna herramienta corre.
    const preguntar = ciclo([
      { texto: "¿Te refieres a Industrias Delta? ¿Confirmas el envío?", llamadas: [] },
    ])
    const intermedio = await preguntar(sesion, "envialo")

    expect(intermedio.toolCalls).toHaveLength(0)
    expect(intermedio.needsConfirmation).toBe(true)

    // Y el sí posterior sí autoriza, sin un rebote extra.
    const enviar = ciclo([
      {
        texto: "",
        llamadas: [
          {
            nombre: "proveedor_simular_envio",
            argumentos: { caso: "co-industrias-delta", confirmado: true },
          },
        ],
      },
      { texto: "Constancia registrada.", llamadas: [] },
    ])
    const final = await enviar(sesion, "Sí, adelante.", true)

    const envio = final.toolCalls.find((l) => l.nombre === "proveedor_simular_envio")
    expect(envio?.ok).toBe(true)
    expect(existsSync(path.join(RAIZ, "out/co-industrias-delta/ENVIO-SIMULADO.md"))).toBe(true)
  })

  test("un caso ya enviado no se reenvía con un sí posterior", async () => {
    const sesion = crearSesion("no-reenvia")

    const armar = ciclo([
      {
        texto: "",
        llamadas: [
          { nombre: "proveedor_armar_paquete", argumentos: { caso: "co-industrias-delta" } },
        ],
      },
      { texto: "Listo. ¿Lo envío?", llamadas: [] },
    ])
    await armar(sesion, "prepara co-industrias-delta")

    const enviar = ciclo([
      {
        texto: "",
        llamadas: [
          {
            nombre: "proveedor_simular_envio",
            argumentos: { caso: "co-industrias-delta", confirmado: true },
          },
        ],
      },
      { texto: "Hecho. ¿Algo más?", llamadas: [] },
    ])
    await enviar(sesion, "Sí, adelante.", true)
    expect(sesion.paquetesArmados.size).toBe(0)

    // Un "sí" suelto después ya no tiene nada que autorizar.
    const otraVez = ciclo([
      {
        texto: "",
        llamadas: [
          {
            nombre: "proveedor_simular_envio",
            argumentos: { caso: "co-industrias-delta", confirmado: true },
          },
        ],
      },
      { texto: "No pude reenviarlo.", llamadas: [] },
    ])
    const repetido = await otraVez(sesion, "Sí, adelante.", true)
    const envio = repetido.toolCalls.find((l) => l.nombre === "proveedor_simular_envio")
    expect(envio?.ok).toBe(false)
  })

  test("un agradecimiento genérico sigue sin autorizar, aunque haya paquete armado", async () => {
    const sesion = crearSesion("gracias-no-basta")

    const armar = ciclo([
      {
        texto: "",
        llamadas: [
          { nombre: "proveedor_armar_paquete", argumentos: { caso: "co-industrias-delta" } },
        ],
      },
      { texto: "Listo. ¿Lo envío?", llamadas: [] },
    ])
    await armar(sesion, "prepara co-industrias-delta")

    const intento = ciclo([
      {
        texto: "",
        llamadas: [
          {
            nombre: "proveedor_simular_envio",
            argumentos: { caso: "co-industrias-delta", confirmado: true },
          },
        ],
      },
      { texto: "No quedó autorizado.", llamadas: [] },
    ])
    const resultado = await intento(sesion, "ok, gracias")

    const envio = resultado.toolCalls.find((l) => l.nombre === "proveedor_simular_envio")
    expect(envio?.ok).toBe(false)
    expect(existsSync(path.join(RAIZ, "out/co-industrias-delta/ENVIO-SIMULADO.md"))).toBe(false)
  })
})
