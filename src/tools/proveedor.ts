import { z } from "zod"
import { nombrePais, nombreSoporte } from "../domain/etiquetas.ts"
import { mapearCampos } from "../domain/mapeo.ts"
import type { Checklist, ContextoHerramienta, Mapeo, Solicitud } from "../domain/tipos.ts"
import { campos as camposOrdenados } from "../domain/tipos.ts"
import { construirChecklist } from "../domain/vigencias.ts"
import { entrada, registrar } from "../infra/bitacora.ts"
import {
  borradorCorreoMd,
  checklistMd,
  envioSimuladoMd,
  faltantesMd,
  valoresPortalMd,
} from "../infra/documentos.ts"
import {
  leerCampos,
  leerGlosario,
  leerIndiceSoportes,
  leerMaestro,
  leerSolicitud,
  leerSoportesExigidos,
  rutaArchivoSoporte,
} from "../infra/fixtures.ts"
import { generarPdf } from "../infra/pdf.ts"
import { copiarA, escribirBinario, escribirTexto } from "../infra/salida.ts"
import { generarXlsx } from "../infra/xlsx.ts"

/**
 * Las cinco herramientas del reto. Son la ÚNICA fuente de valores que el
 * agente puede afirmar.
 *
 * Contrato: cada export es un objeto con `description`, `args` (zod) y
 * `execute`, que devuelve un string JSON `{ ok, data }` o `{ ok: false, error }`
 * y **nunca lanza**. El nombre que ve el modelo es `proveedor_<export>`.
 */

// ─── Infraestructura común ────────────────────────────────────────────────────

const casoArg = z
  .string()
  .describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/, por ejemplo ec-corp-andina")

type Salida = Record<string, unknown>

function ok(data: Salida): string {
  return JSON.stringify({ ok: true, data })
}

function fallo(error: string): string {
  return JSON.stringify({ ok: false, error })
}

/**
 * Convierte cualquier excepción en el mensaje legible del contrato.
 * Los errores del dominio y de los fixtures ya traen texto para humanos; lo
 * inesperado se reporta sin traza cruda.
 */
function mensajeDe(causa: unknown): string {
  if (causa instanceof Error && causa.message !== "") return causa.message
  return "error inesperado al ejecutar la herramienta"
}

/** Envuelve una herramienta: captura, registra y nunca deja escapar una excepción. */
function blindar(
  nombre: string,
  ejecutar: (
    ctx: ContextoHerramienta,
  ) => Promise<{ salida: string; caso: string | null; resumen: string }>,
) {
  return async (ctx: ContextoHerramienta): Promise<string> => {
    try {
      const { salida, caso, resumen } = await ejecutar(ctx)
      let ok = true
      try {
        ok = (JSON.parse(salida) as { ok?: boolean }).ok !== false
      } catch {
        ok = false
      }
      registrar(ctx.directory, caso, entrada(nombre, ok, resumen))
      return salida
    } catch (causa) {
      const error = mensajeDe(causa)
      try {
        registrar(ctx.directory, null, entrada(nombre, false, error))
      } catch {
        // Si ni siquiera se puede registrar, el error del usuario sigue siendo el importante.
      }
      return fallo(error)
    }
  }
}

/**
 * Estado completo de un caso, recalculado desde los fixtures.
 *
 * Decisión: el mapeo NO viaja por el modelo entre herramientas. Recalcularlo es
 * determinista y barato, y evita que los valores pasen por el contexto del LLM
 * —que es justo lo que hay que impedir—. Ver SOLUCION.md, decisión 1.
 */
interface EstadoCaso {
  solicitud: Solicitud
  /** `null` si la plantilla no se pudo leer. El resto del caso sigue sirviendo. */
  mapeo: Mapeo | null
  errorMapeo: string | null
  checklist: Checklist
}

/**
 * El mapeo se resuelve aparte y puede fallar solo.
 *
 * `armar_paquete` no necesita la plantilla: el checklist sale de los soportes
 * exigidos y del índice. Si la plantilla está corrupta, el paquete se arma igual.
 */
function resolverCaso(ctx: ContextoHerramienta, caso: string): EstadoCaso {
  const solicitud = leerSolicitud(ctx.directory, caso)

  let mapeo: Mapeo | null = null
  let errorMapeo: string | null = null
  try {
    mapeo = mapearCampos({
      campos: leerCampos(ctx.directory, solicitud, caso),
      maestro: leerMaestro(ctx.directory),
      glosario: leerGlosario(ctx.directory),
      pais: solicitud.pais,
    })
  } catch (causa) {
    errorMapeo = mensajeDe(causa)
  }

  const checklist = construirChecklist({
    soportesExigidos: leerSoportesExigidos(ctx.directory, caso),
    indice: leerIndiceSoportes(ctx.directory),
    camposFaltantes: mapeo?.faltantes.map((c) => c.etiqueta) ?? [],
    fechaReferencia: ctx.fechaReferencia,
  })

  return { solicitud, mapeo, errorMapeo, checklist }
}

const MAPEO_VACIO: Mapeo = { llenos: [], faltantes: [], requiere_confirmacion: [] }

// ─── proveedor_leer_solicitud ─────────────────────────────────────────────────

export const leer_solicitud = {
  description:
    "Lee la solicitud de un caso y devuelve país, cliente, formato de salida, los campos que pide el formulario y los soportes exigidos.",
  args: { caso: casoArg },
  execute: (args: { caso: string }, ctx: ContextoHerramienta): Promise<string> =>
    blindar("proveedor_leer_solicitud", async () => {
      const solicitud = leerSolicitud(ctx.directory, args.caso)
      const campos = leerCampos(ctx.directory, solicitud, args.caso)
      const soportes = leerSoportesExigidos(ctx.directory, args.caso)

      return {
        caso: args.caso,
        resumen: `${solicitud.pais} · ${solicitud.formato} · ${campos.length} campos · ${soportes.length} soportes`,
        salida: ok({
          caso: args.caso,
          pais: solicitud.pais,
          paisNombre: nombrePais(solicitud.pais),
          cliente: solicitud.cliente,
          formato: solicitud.formato,
          // El correo entero, no un resumen: es lo que el cliente realmente
          // pidió, y la analista necesita poder leerlo sin salir de la pantalla.
          correo: {
            de: solicitud.de,
            para: solicitud.para,
            asunto: solicitud.asunto,
            fecha: solicitud.fecha,
            cuerpo: solicitud.cuerpo,
            adjuntos: solicitud.adjuntos,
          },
          asunto: solicitud.asunto,
          campos: campos.map((c) => ({
            etiqueta: c.etiqueta,
            obligatorio: c.obligatorio ?? false,
          })),
          // Con nombre, para que el agente no tenga que inventar cómo se llama
          // un soporte que el repositorio no tiene.
          soportes: soportes.map((tipo) => ({ tipo, nombre: nombreSoporte(tipo) })),
        }),
      }
    })(ctx),
}

// ─── proveedor_mapear_campos ──────────────────────────────────────────────────

export const mapear_campos = {
  description:
    "Cruza los campos solicitados con el repositorio maestro y clasifica cada uno como lleno, faltante o requiere_confirmacion, con la ruta del dato de origen.",
  args: {
    caso: casoArg,
    campos: z
      .array(z.string())
      .optional()
      .describe(
        "Opcional. Etiquetas a mapear. Si se omite se mapean todas las de la plantilla del caso, que es lo habitual.",
      ),
  },
  execute: (args: { caso: string; campos?: string[] }, ctx: ContextoHerramienta): Promise<string> =>
    blindar("proveedor_mapear_campos", async () => {
      const { solicitud, mapeo, errorMapeo } = resolverCaso(ctx, args.caso)
      if (mapeo === null) {
        return {
          caso: args.caso,
          resumen: errorMapeo ?? "no se pudo leer la plantilla",
          salida: fallo(
            `${errorMapeo ?? "no se pudo leer la plantilla"}. Sin la plantilla no se sabe qué campos pide el cliente, pero el checklist de soportes sí se puede armar con proveedor_armar_paquete.`,
          ),
        }
      }

      const pedidas = args.campos
      const filtrar = <T extends { etiqueta: string }>(xs: readonly T[]): readonly T[] =>
        pedidas === undefined ? xs : xs.filter((x) => pedidas.includes(x.etiqueta))

      const llenos = filtrar(mapeo.llenos)
      const faltantes = filtrar(mapeo.faltantes)
      const confirmar = filtrar(mapeo.requiere_confirmacion)

      escribirTexto(ctx.directory, `${args.caso}/faltantes.md`, faltantesMd(solicitud, mapeo))

      return {
        caso: args.caso,
        resumen: `${llenos.length} llenos · ${confirmar.length} por confirmar · ${faltantes.length} faltantes`,
        salida: ok({
          caso: args.caso,
          llenos: llenos.map((c) => ({ etiqueta: c.etiqueta, valor: c.valor, origen: c.origen })),
          requiere_confirmacion: confirmar.map((c) => ({
            etiqueta: c.etiqueta,
            valor: c.valor,
            origen: c.origen,
            nota: c.nota,
          })),
          faltantes: faltantes.map((c) => ({ etiqueta: c.etiqueta, motivo: c.motivo })),
          reporte: `out/${args.caso}/faltantes.md`,
        }),
      }
    })(ctx),
}

// ─── proveedor_generar_formulario ─────────────────────────────────────────────

export const generar_formulario = {
  description:
    "Genera el formulario lleno en el formato que pidió el cliente: xlsx escribiendo en las celdas exactas, pdf respetando el orden de los campos. El formato portal no se implementa.",
  args: {
    caso: casoArg,
    mapeo: z
      .unknown()
      .optional()
      .describe(
        "No hace falta enviarlo: la herramienta recalcula el mapeo desde el caso para que los valores nunca pasen por el modelo.",
      ),
  },
  execute: (args: { caso: string }, ctx: ContextoHerramienta): Promise<string> =>
    blindar("proveedor_generar_formulario", async () => {
      const { solicitud, mapeo, errorMapeo, checklist } = resolverCaso(ctx, args.caso)
      if (mapeo === null) {
        return {
          caso: args.caso,
          resumen: errorMapeo ?? "no se pudo leer la plantilla",
          salida: fallo(
            `${errorMapeo ?? "no se pudo leer la plantilla"}. Sin ella no se puede generar el formulario; el paquete de soportes sí.`,
          ),
        }
      }
      const ordenados = camposOrdenados(mapeo)

      if (solicitud.formato === "portal") {
        const ruta = escribirTexto(
          ctx.directory,
          `${args.caso}/valores-portal.md`,
          valoresPortalMd(solicitud, mapeo, checklist),
        )
        return {
          caso: args.caso,
          resumen: `formato no soportado: portal · valores copiables en out/${ruta}`,
          salida: fallo(
            `formato no soportado: "portal". Este cliente exige diligenciar su portal web, que requiere credenciales, y el agente no opera portales. Los ${ordenados.length} valores quedaron listos para copiar en out/${ruta}.`,
          ),
        }
      }

      if (solicitud.formato === "xlsx") {
        const bytes = await generarXlsx(ordenados)
        const ruta = escribirBinario(ctx.directory, `${args.caso}/formulario.xlsx`, bytes)
        return {
          caso: args.caso,
          resumen: `xlsx generado · ${ordenados.length} campos`,
          salida: ok({ ruta: `out/${ruta}`, formato: "xlsx", campos: ordenados.length }),
        }
      }

      const bytes = await generarPdf(solicitud, ordenados, checklist.fechaReferencia)
      const ruta = escribirBinario(ctx.directory, `${args.caso}/formulario.pdf`, bytes)
      return {
        caso: args.caso,
        resumen: `pdf generado · ${ordenados.length} campos`,
        salida: ok({ ruta: `out/${ruta}`, formato: "pdf", campos: ordenados.length }),
      }
    })(ctx),
}

// ─── proveedor_armar_paquete ──────────────────────────────────────────────────

export const armar_paquete = {
  description:
    "Arma out/<caso>/paquete/ con el formulario, copias de los soportes exigidos que existan, el checklist de vigencias y un borrador de correo, y dice si queda listo para firma.",
  args: { caso: casoArg },
  execute: (args: { caso: string }, ctx: ContextoHerramienta): Promise<string> =>
    blindar("proveedor_armar_paquete", async () => {
      const { solicitud, mapeo, errorMapeo, checklist } = resolverCaso(ctx, args.caso)
      const base = `${args.caso}/paquete`

      // El formulario, si ya se generó. El paquete no falla por no tenerlo.
      const extension = solicitud.formato === "xlsx" ? "xlsx" : "pdf"
      const origenFormulario = `${args.caso}/formulario.${extension}`
      const rutaAbsoluta = `${ctx.directory}/out/${origenFormulario}`
      let formularioIncluido = false
      try {
        if (solicitud.formato !== "portal" && (await Bun.file(rutaAbsoluta).exists())) {
          copiarA(ctx.directory, rutaAbsoluta, `${base}/formulario.${extension}`)
          formularioIncluido = true
        }
      } catch {
        formularioIncluido = false
      }

      // Copias de los soportes presentes. Un soporte vencido también se copia:
      // la analista puede necesitar verlo para decidir si lo renueva.
      const copiados: string[] = []
      for (const item of checklist.items) {
        if (item.archivo === null) continue
        try {
          copiarA(
            ctx.directory,
            rutaArchivoSoporte(ctx.directory, item.archivo),
            `${base}/${item.archivo}`,
          )
          copiados.push(item.archivo)
        } catch {
          // El índice lo lista pero el archivo no está: ya figura en el checklist.
        }
      }

      escribirTexto(ctx.directory, `${base}/checklist.md`, checklistMd(solicitud, checklist))
      escribirTexto(
        ctx.directory,
        `${base}/borrador-correo.md`,
        borradorCorreoMd(solicitud, mapeo ?? MAPEO_VACIO, checklist),
      )

      const bloqueos = checklist.items.filter((i) => i.bloquea)
      const resumen = checklist.listoParaFirma
        ? `listo para firma · ${copiados.length} soportes`
        : `bloqueado por ${bloqueos.map((b) => `${b.tipo} (${b.estado})`).join(", ")}`

      return {
        caso: args.caso,
        resumen,
        salida: ok({
          ruta: `out/${base}`,
          listo_para_firma: checklist.listoParaFirma,
          formulario_incluido: formularioIncluido,
          soportes_copiados: copiados,
          checklist: checklist.items.map((i) => ({
            tipo: i.tipo,
            nombre: i.nombre,
            estado: i.estado,
            vigencia_hasta: i.vigenciaHasta,
            dias_restantes: i.diasRestantes,
            bloquea: i.bloquea,
          })),
          campos_faltantes: checklist.camposFaltantes,
          fecha_referencia: checklist.fechaReferencia,
          // El paquete se arma igual, y se dice qué no se pudo hacer.
          advertencia: errorMapeo,
        }),
      }
    })(ctx),
}

// ─── proveedor_simular_envio ──────────────────────────────────────────────────

export const simular_envio = {
  description:
    "Escribe out/<caso>/ENVIO-SIMULADO.md. No envía nada. Solo procede si la analista confirmó explícitamente en el mensaje anterior.",
  args: {
    caso: casoArg,
    confirmado: z
      .boolean()
      .describe(
        "true solo si la analista confirmó el envío de forma explícita en su último mensaje. Nunca lo asumas.",
      ),
  },
  execute: (
    args: { caso: string; confirmado: boolean },
    ctx: ContextoHerramienta,
  ): Promise<string> =>
    blindar("proveedor_simular_envio", async () => {
      if (!args.confirmado) {
        return {
          caso: args.caso,
          resumen: "rechazado: sin confirmación explícita",
          salida: fallo("requiere confirmación explícita"),
        }
      }

      const { solicitud, checklist } = resolverCaso(ctx, args.caso)
      const ruta = escribirTexto(
        ctx.directory,
        `${args.caso}/ENVIO-SIMULADO.md`,
        envioSimuladoMd(solicitud, checklist, new Date()),
      )

      return {
        caso: args.caso,
        resumen: `envío simulado escrito · listo_para_firma=${checklist.listoParaFirma}`,
        salida: ok({
          ruta: `out/${ruta}`,
          listo_para_firma: checklist.listoParaFirma,
          nota: "No se envió ningún correo. Este archivo es el único efecto.",
        }),
      }
    })(ctx),
}
