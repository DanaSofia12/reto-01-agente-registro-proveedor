import { config } from "../config.ts"
import type { ProveedorLLM } from "./adapter.ts"
import { crearProveedorAnthropic } from "./anthropic.ts"
import { crearProveedorMock } from "./mock.ts"
import { crearProveedorOpenAI } from "./openai.ts"

/** Selección del proveedor por configuración. Es el único lugar que los conoce a todos. */

export class ErrorConfiguracionLLM extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "ErrorConfiguracionLLM"
  }
}

export function crearProveedor(): ProveedorLLM {
  if (config.LLM_PROVIDER === "mock") {
    return crearProveedorMock([{ texto: "Proveedor falso sin guion configurado.", llamadas: [] }])
  }

  if (config.LLM_PROVIDER === "anthropic") {
    const clave = config.ANTHROPIC_API_KEY ?? ""
    if (clave === "") {
      throw new ErrorConfiguracionLLM(
        "falta ANTHROPIC_API_KEY en el entorno del servidor. Copia .env.example a .env y ponla ahí.",
      )
    }
    return crearProveedorAnthropic(config.LLM_MODEL, clave)
  }

  const clave = config.OPENAI_API_KEY ?? ""
  if (clave === "") {
    throw new ErrorConfiguracionLLM(
      "falta OPENAI_API_KEY en el entorno del servidor. Copia .env.example a .env y ponla ahí.",
    )
  }
  return crearProveedorOpenAI(config.LLM_MODEL, clave)
}
