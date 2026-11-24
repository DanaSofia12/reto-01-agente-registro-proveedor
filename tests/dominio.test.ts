import { describe, expect, test } from "bun:test"
import { fechaLarga, firmanteDe, nombrePais, nombreSoporte } from "../src/domain/etiquetas.ts"
import { mapearCampos, PISO_CANDIDATO, UMBRAL_CONFIANZA } from "../src/domain/mapeo.ts"
import { identificadorDe, notaIdentificador } from "../src/domain/paises.ts"
import { normalizar, similitud } from "../src/domain/texto.ts"
import type { CampoSolicitado } from "../src/domain/tipos.ts"
import { formatearValor, leerRuta } from "../src/domain/valores.ts"
import { construirChecklist, evaluarSoporte } from "../src/domain/vigencias.ts"
import { leerGlosario, leerMaestro, leerSoportesExigidos } from "../src/infra/fixtures.ts"
import { casosDisponibles } from "../src/infra/rutas.ts"

const RAIZ = new URL("..", import.meta.url).pathname
const MAESTRO = leerMaestro(RAIZ)
const GLOSARIO = leerGlosario(RAIZ)

function campo(etiqueta: string, orden = 0): CampoSolicitado {
  return { etiqueta, orden }
}

describe("normalizar", () => {
  test("quita tildes, puntuación y colapsa espacios", () => {
    expect(normalizar("Razón  social / Nº")).toBe("razon social n")
    expect(normalizar("Correo electrónico")).toBe("correo electronico")
    expect(normalizar("  Dígito de Verificación  ")).toBe("digito de verificacion")
  })
})

describe("similitud", () => {
  test("identidad da 1 y palabras ajenas dan 0", () => {
    expect(similitud("razon social", "razon social")).toBe(1)
    expect(similitud("razon social", "swift")).toBe(0)
  })
})

describe("leerRuta y formatearValor", () => {
  test("resuelve rutas anidadas con punto", () => {
    expect(leerRuta(MAESTRO, "banco.numero_cuenta")).toBe("03100012345")
    expect(leerRuta(MAESTRO, "ingresos_ultimo_ano.valor")).toBe(98_000_000_000)
  })

  test("una ruta inexistente devuelve undefined en vez de lanzar", () => {
    expect(leerRuta(MAESTRO, "no.existe.en.absoluto")).toBeUndefined()
    expect(formatearValor(undefined)).toBeNull()
  })

  test("los números se formatean de forma determinista", () => {
    expect(formatearValor(98_000_000_000)).toBe(
      new Intl.NumberFormat("es-CO").format(98_000_000_000),
    )
    expect(formatearValor(480)).toBe("480")
    expect(formatearValor(false)).toBe("No")
  })
})

describe("identificador tributario por país", () => {
  test("cada país nombra el identificador a su manera", () => {
    expect(identificadorDe("CO")).toBe("NIT")
    expect(identificadorDe("EC")).toBe("RUC")
    expect(identificadorDe("PE")).toBe("RUC")
    expect(identificadorDe("PA")).toBe("RUC")
    expect(identificadorDe("HN")).toBe("RTN")
  })

  test("un NIT colombiano con etiqueta clara no necesita confirmación", () => {
    expect(notaIdentificador("CO", "NIT", "nit")).toBeNull()
  })

  test("una etiqueta ambigua se marca aunque el país sea Colombia", () => {
    const nota = notaIdentificador("CO", "Identificación tributaria", "identificacion tributaria")
    expect(nota).toContain("ambigua")
    expect(nota).toContain("NIT")
  })

  test("un identificador extranjero siempre se marca", () => {
    expect(notaIdentificador("EC", "RUC", "ruc")).toContain("identificador extranjero")
    expect(notaIdentificador("HN", "RTN", "rtn")).toContain("RTN")
  })
})

describe("mapearCampos", () => {
  test("un sinónimo del glosario se resuelve solo", () => {
    const { llenos } = mapearCampos({
      campos: [campo("Nombre de la empresa")],
      maestro: MAESTRO,
      glosario: GLOSARIO,
      pais: "CO",
    })
    expect(llenos[0]?.valor).toBe("Periferia IT Group S.A.S.")
    expect(llenos[0]?.origen).toBe("razon_social")
  })

  test("resuelve rutas anidadas del glosario", () => {
    const { llenos } = mapearCampos({
      campos: [campo("Número de cuenta")],
      maestro: MAESTRO,
      glosario: GLOSARIO,
      pais: "CO",
    })
    expect(llenos[0]?.origen).toBe("banco.numero_cuenta")
  })

  test("un campo sin fuente queda faltante y sin valor — nunca se inventa", () => {
    const { faltantes, llenos } = mapearCampos({
      campos: [campo("Referencias comerciales")],
      maestro: MAESTRO,
      glosario: GLOSARIO,
      pais: "HN",
    })
    expect(llenos).toHaveLength(0)
    expect(faltantes[0]?.valor).toBeNull()
    expect(faltantes[0]?.etiqueta).toBe("Referencias comerciales")
  })

  /**
   * Regresión del bug más peligroso que apareció construyendo esto: con un piso
   * de 0.5, "Número de contribuyente especial" cruzaba con "Número de cuenta"
   * a 0.522 y habría escrito el número de cuenta bancaria en ese campo.
   */
  test("no cruza un campo ajeno con los datos bancarios", () => {
    const resultado = mapearCampos({
      campos: [campo("Número de contribuyente especial")],
      maestro: MAESTRO,
      glosario: GLOSARIO,
      pais: "EC",
    })
    const todos = [...resultado.llenos, ...resultado.requiere_confirmacion, ...resultado.faltantes]
    expect(todos).toHaveLength(1)
    expect(todos[0]?.valor).not.toBe("03100012345")
    expect(todos[0]?.estado).toBe("faltante")
  })

  test("el RUC ecuatoriano se llena con el NIT y se marca", () => {
    const { requiere_confirmacion, llenos } = mapearCampos({
      campos: [campo("RUC")],
      maestro: MAESTRO,
      glosario: GLOSARIO,
      pais: "EC",
    })
    expect(llenos).toHaveLength(0)
    expect(requiere_confirmacion[0]?.valor).toBe("900123456")
    expect(requiere_confirmacion[0]?.nota).toContain("identificador extranjero")
  })

  test("el NIT colombiano no necesita confirmación", () => {
    const { llenos, requiere_confirmacion } = mapearCampos({
      campos: [campo("NIT")],
      maestro: MAESTRO,
      glosario: GLOSARIO,
      pais: "CO",
    })
    expect(requiere_confirmacion).toHaveLength(0)
    expect(llenos[0]?.valor).toBe("900123456")
  })

  test("cada campo termina en exactamente un estado", () => {
    const etiquetas = Object.keys(GLOSARIO)
      .slice(0, 12)
      .map((e, i) => campo(e, i))
    const mapeo = mapearCampos({
      campos: etiquetas,
      maestro: MAESTRO,
      glosario: GLOSARIO,
      pais: "CO",
    })
    const total = mapeo.llenos.length + mapeo.faltantes.length + mapeo.requiere_confirmacion.length
    expect(total).toBe(etiquetas.length)
  })

  test("los umbrales mantienen el margen que los justifica", () => {
    expect(PISO_CANDIDATO).toBeGreaterThan(0.6)
    expect(PISO_CANDIDATO).toBeLessThanOrEqual(UMBRAL_CONFIANZA)
  })
})

describe("qué bloquea la firma", () => {
  const ref = new Date("2026-09-03T00:00:00Z")

  test("un soporte sin fecha de vigencia no vence nunca", () => {
    const item = evaluarSoporte(
      "rut",
      { tipo: "rut", archivo: "rut.txt", vigenciaHasta: null, paisEmisor: "CO", descripcion: "" },
      ref,
    )
    expect(item.estado).toBe("presente")
    expect(item.bloquea).toBe(false)
  })

  test("un soporte vencido bloquea", () => {
    const item = evaluarSoporte(
      "parafiscales",
      {
        tipo: "parafiscales",
        archivo: "p.txt",
        vigenciaHasta: "2026-08-31",
        paisEmisor: "CO",
        descripcion: "",
      },
      ref,
    )
    expect(item.estado).toBe("vencido")
    expect(item.bloquea).toBe(true)
    expect(item.diasRestantes).toBe(-3)
  })

  test("vencer hoy mismo todavía no bloquea", () => {
    const item = evaluarSoporte(
      "camara_comercio",
      {
        tipo: "camara_comercio",
        archivo: "c.txt",
        vigenciaHasta: "2026-09-03",
        paisEmisor: "CO",
        descripcion: "",
      },
      ref,
    )
    expect(item.estado).toBe("presente")
    expect(item.diasRestantes).toBe(0)
  })

  test("un soporte exigido que no existe bloquea", () => {
    const item = evaluarSoporte("certificado_cumplimiento_tributario", undefined, ref)
    expect(item.estado).toBe("ausente")
    expect(item.bloquea).toBe(true)
  })

  test("un campo faltante NO bloquea, pero aparece en el checklist", () => {
    const checklist = construirChecklist({
      soportesExigidos: ["rut"],
      indice: [
        { tipo: "rut", archivo: "rut.txt", vigenciaHasta: null, paisEmisor: "CO", descripcion: "" },
      ],
      camposFaltantes: ["Referencias comerciales"],
      fechaReferencia: ref,
    })
    expect(checklist.listoParaFirma).toBe(true)
    expect(checklist.camposFaltantes).toContain("Referencias comerciales")
  })
})

describe("etiquetas — nada de identificadores en pantalla", () => {
  test("cada soporte que algún cliente exige tiene nombre humano", () => {
    const exigidos = new Set<string>()
    for (const caso of casosDisponibles(RAIZ)) {
      for (const tipo of leerSoportesExigidos(RAIZ, caso)) exigidos.add(tipo)
    }
    expect(exigidos.size).toBeGreaterThan(0)

    for (const tipo of exigidos) {
      const nombre = nombreSoporte(tipo)
      // Si el nombre todavía trae guiones bajos, es el identificador crudo.
      expect(nombre).not.toContain("_")
      expect(nombre).not.toBe(tipo)
      expect(nombre[0]).toBe(nombre[0]?.toUpperCase())
    }
  })

  test("el soporte ausente también tiene nombre — es el que bloquea la firma", () => {
    // No está en el índice del repositorio, así que no puede salir de ahí.
    expect(nombreSoporte("certificado_cumplimiento_tributario")).toBe(
      "Certificado de cumplimiento tributario",
    )
  })

  test("un tipo desconocido se humaniza en vez de mostrarse crudo", () => {
    expect(nombreSoporte("certificado_de_algo_nuevo")).toBe("Certificado de algo nuevo")
  })

  test("el checklist carga el nombre humano junto al identificador", () => {
    const item = evaluarSoporte("camara_comercio", undefined, new Date("2026-09-03T00:00:00Z"))
    expect(item.tipo).toBe("camara_comercio")
    expect(item.nombre).toBe("Certificado de existencia y representación legal")
  })

  test("las fechas se escriben como se hablan", () => {
    expect(fechaLarga("2026-09-30")).toBe("30 de septiembre de 2026")
    expect(fechaLarga("2027-03-31")).toBe("31 de marzo de 2027")
  })

  test("fechaLarga devuelve la entrada si no es una fecha", () => {
    expect(fechaLarga("sin vencimiento")).toBe("sin vencimiento")
    expect(fechaLarga("2026-13-01")).toBe("2026-13-01")
  })

  test("los países se nombran, no se abrevian", () => {
    expect(nombrePais("EC")).toBe("Ecuador")
    expect(nombrePais("ec")).toBe("Ecuador")
    expect(nombrePais("XX")).toBe("XX")
  })
})

describe("el firmante — el actor que recibe el paquete", () => {
  test("se lee del maestro con nombre, cargo y correo", () => {
    const f = firmanteDe(MAESTRO as unknown as Record<string, unknown>)
    expect(f).not.toBeNull()
    expect(f?.nombre).toBe("Roberto Andrade Salazar")
    expect(f?.cargo).toBe("Gerente General")
    expect(f?.email).toContain("@")
  })

  test("un maestro sin representante legal no rompe nada, devuelve null", () => {
    expect(firmanteDe({})).toBeNull()
    expect(firmanteDe({ representante_legal: null })).toBeNull()
    expect(firmanteDe({ representante_legal: { cargo: "Gerente" } })).toBeNull()
  })
})
