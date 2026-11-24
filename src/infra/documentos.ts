import { fechaLarga, nombrePais } from "../domain/etiquetas.ts"
import type { Checklist, Mapeo, Solicitud } from "../domain/tipos.ts"
import { campos } from "../domain/tipos.ts"

/** Artefactos en Markdown. Funciones puras: reciben datos, devuelven texto. */

/** Ninguna clave bajo `banco.` sale de un documento que no sea el formulario. */
const PREFIJO_BANCARIO = "banco."

function esBancario(origen: string | null | undefined): boolean {
  return typeof origen === "string" && origen.startsWith(PREFIJO_BANCARIO)
}

/**
 * Estos documentos los lee la analista y el representante legal, no un
 * programador: el identificador del caso no aparece en ellos.
 */
function titulo(solicitud: Solicitud): string {
  return solicitud.cliente
}

const FORMATO: Readonly<Record<string, string>> = {
  xlsx: "plantilla de Excel",
  pdf: "formulario PDF",
  portal: "portal web del cliente",
}

function comoLoPide(solicitud: Solicitud): string {
  return FORMATO[solicitud.formato] ?? solicitud.formato
}

// ─── Reporte de faltantes (O2) ────────────────────────────────────────────────

export function faltantesMd(solicitud: Solicitud, mapeo: Mapeo): string {
  const lineas = [
    `# Qué falta para responderle a ${titulo(solicitud)}`,
    "",
    `Pide una ${comoLoPide(solicitud)}. Cliente de ${nombrePais(solicitud.pais)}.`,
    "",
  ]

  if (mapeo.faltantes.length === 0 && mapeo.requiere_confirmacion.length === 0) {
    lineas.push(
      "## No falta nada",
      "",
      `Los ${mapeo.llenos.length} campos que pide el cliente tienen dato registrado en Periferia. No hay que pedirle nada a nadie antes de firmar.`,
      "",
    )
  } else if (mapeo.faltantes.length === 0) {
    lineas.push("Ningún campo quedó vacío. Hay campos que necesitan tu visto bueno, abajo.", "")
  } else {
    lineas.push(
      `## ${mapeo.faltantes.length} campo(s) sin fuente`,
      "",
      "Quedaron vacíos en el formulario. **No se inventó ningún valor.**",
      "",
      "| Campo | Obligatorio | Por qué está vacío |",
      "|---|---|---|",
    )
    for (const campo of mapeo.faltantes) {
      const obligatorio = campo.obligatorio === true ? "sí" : "no"
      lineas.push(`| ${campo.etiqueta} | ${obligatorio} | ${campo.motivo} |`)
    }
    lineas.push("")
  }

  if (mapeo.requiere_confirmacion.length > 0) {
    lineas.push(
      `## ${mapeo.requiere_confirmacion.length} campo(s) que necesitan visto bueno`,
      "",
      "Tienen valor, pero alguien debe validarlos antes de firmar.",
      "",
      "| Campo | Valor | Por qué |",
      "|---|---|---|",
    )
    for (const campo of mapeo.requiere_confirmacion) {
      lineas.push(`| ${campo.etiqueta} | \`${campo.valor ?? "—"}\` | ${campo.nota} |`)
    }
    lineas.push("")
  }

  lineas.push(
    "## Resumen",
    "",
    `- Llenos: ${mapeo.llenos.length}`,
    `- Requieren confirmación: ${mapeo.requiere_confirmacion.length}`,
    `- Faltantes: ${mapeo.faltantes.length}`,
    "",
  )
  return lineas.join("\n")
}

// ─── Checklist del paquete ────────────────────────────────────────────────────

const ETIQUETA_ESTADO: Readonly<Record<string, string>> = {
  presente: "presente",
  ausente: "**ausente**",
  vencido: "**vencido**",
}

export function checklistMd(solicitud: Solicitud, checklist: Checklist): string {
  const bloqueos = checklist.items.filter((i) => i.bloquea)
  const lineas = [
    `# Lista de verificación para la firma — ${titulo(solicitud)}`,
    "",
    `Vigencias evaluadas al **${fechaLarga(checklist.fechaReferencia)}**.`,
    "",
    checklist.listoParaFirma ? "## Puede firmarse" : "## No puede firmarse todavía",
    "",
  ]

  if (!checklist.listoParaFirma) {
    lineas.push("Bloquean la firma:", "")
    for (const item of bloqueos) {
      const motivo =
        item.estado === "ausente"
          ? "Periferia no lo tiene; hay que tramitarlo"
          : `venció el ${item.vigenciaHasta === null ? "—" : fechaLarga(item.vigenciaHasta)}`
      lineas.push(`- **${item.nombre}** — ${motivo}`)
    }
    lineas.push("")
  }

  lineas.push(
    "## Soportes exigidos por el cliente",
    "",
    "| Soporte | Estado | Vigencia |",
    "|---|---|---|",
  )
  for (const item of checklist.items) {
    const estado = ETIQUETA_ESTADO[item.estado] ?? item.estado
    const vigencia =
      item.vigenciaHasta === null
        ? "no vence"
        : item.diasRestantes !== null && item.diasRestantes < 0
          ? `venció el ${fechaLarga(item.vigenciaHasta)}`
          : item.diasRestantes !== null && item.diasRestantes <= 30
            ? `vence el ${fechaLarga(item.vigenciaHasta)} · quedan ${item.diasRestantes} días`
            : `vence el ${fechaLarga(item.vigenciaHasta)}`
    lineas.push(`| ${item.nombre} | ${estado} | ${vigencia} |`)
  }
  lineas.push("")

  if (checklist.camposFaltantes.length > 0) {
    lineas.push(
      "## Campos del formulario sin dato",
      "",
      "No bloquean la firma, pero conviene resolverlos antes de enviar.",
      "",
    )
    for (const campo of checklist.camposFaltantes) lineas.push(`- ${campo}`)
    lineas.push("")
  }

  return lineas.join("\n")
}

// ─── Borrador de correo ───────────────────────────────────────────────────────

export function borradorCorreoMd(solicitud: Solicitud, mapeo: Mapeo, checklist: Checklist): string {
  const presentes = checklist.items.filter((i) => i.estado === "presente")

  const lineas = [
    `# Borrador de correo — ${titulo(solicitud)}`,
    "",
    "> Revisar antes de enviar. El agente no envía correos.",
    "",
    `**Para:** ${solicitud.de}`,
    `**Asunto:** Re: ${solicitud.asunto}`,
    "",
    "---",
    "",
    "Buen día,",
    "",
    "Adjuntamos el formulario de registro como proveedor diligenciado y firmado por nuestro representante legal, junto con los soportes solicitados:",
    "",
  ]

  // Este texto lo lee el cliente. Un "- camara comercio" en un correo
  // corporativo delata que lo escribió una máquina.
  for (const item of presentes) lineas.push(`- ${item.nombre}`)
  if (presentes.length === 0) lineas.push("- (ningún soporte disponible en este momento)")
  lineas.push("")

  // Ni el valor ni la etiqueta de un campo bancario entran en el correo.
  // Solo los que de verdad llevan valor: un cruce dudoso quedó vacío y
  // afirmar que se diligenció sería falso en un correo al cliente.
  const confirmar = mapeo.requiere_confirmacion.filter(
    (c) => !esBancario(c.origen) && c.valor !== null,
  )
  if (confirmar.length > 0) {
    lineas.push(
      "Sobre algunos campos del formato:",
      "",
      ...confirmar.map(
        (c) =>
          `- **${c.etiqueta}**: diligenciado con el identificador tributario colombiano de la compañía. Agradecemos confirmar si es aceptable para su registro.`,
      ),
      "",
    )
  }

  const faltantesObligatorios = mapeo.faltantes.filter((c) => c.obligatorio === true)
  if (faltantesObligatorios.length > 0) {
    lineas.push(
      "Los siguientes campos obligatorios quedaron pendientes porque no aplican a nuestra constitución o no contamos con el dato:",
      "",
      ...faltantesObligatorios.map((c) => `- ${c.etiqueta}`),
      "",
      "Quedamos atentos a si podemos omitirlos o si requieren una alternativa.",
      "",
    )
  }

  lineas.push(
    "Quedamos atentos a cualquier requerimiento adicional.",
    "",
    "Cordialmente,",
    "",
    "Área Administrativa",
    "Periferia IT Group S.A.S.",
    "",
    "---",
    "",
    `_Antes de enviarlo: adjunta el formulario diligenciado y ${presentes.length === 1 ? "el soporte que quedó" : `los ${presentes.length} soportes que quedaron`} en el paquete._`,
    "",
    "_Nota: los datos bancarios no se incluyen en este correo. Van únicamente dentro del formulario, y solo si la plantilla del cliente los pidió._",
    "",
  )
  return lineas.join("\n")
}

// ─── Valores para portal ──────────────────────────────────────────────────────

export function valoresPortalMd(solicitud: Solicitud, mapeo: Mapeo, checklist: Checklist): string {
  const ordenados = campos(mapeo)
  const urlEnCuerpo = solicitud.cuerpo.match(/https?:\/\/[^\s.,;)]+(?:[.,;][^\s.,;)]+)*/)
  const lineas = [
    `# ${solicitud.cliente} — portal`,
    "",
    urlEnCuerpo ? urlEnCuerpo[0] : "(la URL del portal está en el correo del cliente)",
    "",
    "Credenciales: en el gestor de contraseñas del área administrativa.",
    "El agente no las conoce y nunca las solicita.",
    "",
  ]

  const confirmar = mapeo.requiere_confirmacion
  if (confirmar.length > 0) {
    lineas.push("## Antes de copiar", "")
    for (const campo of confirmar) {
      lineas.push(`- **${campo.etiqueta}** lleva \`${campo.valor ?? "—"}\`. ${campo.nota}.`)
    }
    lineas.push("")
  }

  lineas.push("## Campos, en el orden del portal", "")
  for (const campo of ordenados) {
    const marca = campo.estado === "requiere_confirmacion" ? "  (requiere confirmación)" : ""
    lineas.push(`**${campo.etiqueta}**${marca}`)
    lineas.push("")
    lineas.push(
      campo.valor === null ? "    — sin dato en el repositorio maestro" : `    ${campo.valor}`,
    )
    lineas.push("")
  }

  lineas.push(
    "## Soportes que pide el portal",
    "",
    "| Documento | Archivo | Estado |",
    "|---|---|---|",
  )
  for (const item of checklist.items) {
    const archivo = item.archivo === null ? "—" : `\`paquete/${item.archivo}\``
    const estado =
      item.estado === "presente"
        ? item.vigenciaHasta === null
          ? "no vence"
          : `vigente hasta el ${fechaLarga(item.vigenciaHasta)}`
        : (ETIQUETA_ESTADO[item.estado] ?? item.estado)
    lineas.push(`| ${item.nombre} | ${archivo} | ${estado} |`)
  }
  lineas.push("")

  lineas.push(
    "## Antes de enviar",
    "",
    `- [ ] Los ${ordenados.length} campos quedaron pegados`,
    `- [ ] Los ${checklist.items.filter((i) => i.estado === "presente").length} soporte(s) quedaron cargados`,
    ...confirmar.map((c) => `- [ ] ${c.etiqueta} fue confirmado con el cliente`),
    "- [ ] El representante legal autorizó el envío",
    "",
    "El ingreso de credenciales y el clic en «Enviar» son humanos, siempre.",
    "",
  )
  return lineas.join("\n")
}

// ─── Envío simulado ───────────────────────────────────────────────────────────

export function envioSimuladoMd(solicitud: Solicitud, checklist: Checklist, ahora: Date): string {
  const presentes = checklist.items.filter((i) => i.estado === "presente")
  return [
    `# Envío simulado — ${titulo(solicitud)}`,
    "",
    `Preparado el ${ahora.toISOString()} tras confirmación explícita de la analista.`,
    "",
    "> **No se envió ningún correo.** Este archivo es el único efecto de la confirmación.",
    "",
    "## Lo que se habría enviado",
    "",
    `- **Para:** ${solicitud.de}`,
    `- **Asunto:** Re: ${solicitud.asunto}`,
    `- **Formulario:** \`formulario.${solicitud.formato === "xlsx" ? "xlsx" : "pdf"}\``,
    `- **Soportes adjuntos:** ${presentes.length}`,
    "",
    ...presentes.map((i) => `  - ${i.archivo}`),
    "",
    "## Estado del paquete en el momento del envío",
    "",
    `- Listo para firma: **${checklist.listoParaFirma ? "sí" : "no"}**`,
    `- Evaluado contra: ${checklist.fechaReferencia}`,
    ...(checklist.listoParaFirma
      ? []
      : [
          "",
          "La analista confirmó el envío con el paquete incompleto. Bloqueos vigentes:",
          "",
          ...checklist.items.filter((i) => i.bloquea).map((i) => `- \`${i.tipo}\` (${i.estado})`),
        ]),
    "",
  ].join("\n")
}
