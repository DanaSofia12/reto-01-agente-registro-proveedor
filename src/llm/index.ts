import { config } from "../config.ts"
import type { ProveedorLLM } from "./adapter.ts"
import { crearProveedorAnthropic } from "./anthropic.ts"
import { crearProveedorMock } from "./mock.ts"

/** Único lugar que conoce a todos los proveedores. El resto del sistema ve solo la interfaz. */

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

  const clave = config.ANTHROPIC_API_KEY ?? ""
  if (clave === "") {
    throw new ErrorConfiguracionLLM(
      "falta ANTHROPIC_API_KEY en el entorno del servidor. Copia .env.example a .env y ponla ahí.",
    )
  }
  return crearProveedorAnthropic(config.LLM_MODEL, clave)
}
